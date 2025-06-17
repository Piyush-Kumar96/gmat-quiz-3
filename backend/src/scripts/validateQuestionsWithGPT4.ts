import mongoose from 'mongoose';
import { QuestionBagV2 } from '../models/QuestionBagV2';
import { processQuestion, QuestionData } from '../services/openaiService';
import dotenv from 'dotenv';
import pLimit from 'p-limit';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

// Configure concurrency limit
const CONCURRENCY_LIMIT = 1; // Reduced concurrency to 1
const limit = pLimit(CONCURRENCY_LIMIT);

// Statistics tracking
const stats = {
  totalProcessed: 0,
  perfect: 0,
  needsRevision: 0,
  unfixable: 0,
  failed: 0,
  fixed: 0,
  totalTokensUsed: 0
};

// Store detailed results
const validationResults: any[] = [];

/**
 * Checks if question text contains embedded options
 * Many questions have options directly embedded in the question text
 */
const hasEmbeddedOptions = (questionText: string): boolean => {
  // Check for patterns like "A. ", "B. ", "C. " within the text
  const optionPattern = /\b[A-E]\.\s/g;
  const matches = questionText.match(optionPattern);
  
  // If we find multiple option markers (A., B., etc.), it likely has embedded options
  return matches !== null && matches.length >= 3;
};

/**
 * Creates a validation prompt based on question type and structure
 */
const createValidationPrompt = (question: any) => {
  // Check if options are embedded in the question text
  const embeddedOptions = hasEmbeddedOptions(question.questionText);
  const needsOptionExtraction = embeddedOptions || !question.options || question.options.length === 0;
  
  // Basic information about the question
  let baseFields = `
Question Type: ${question.questionType}
Question Text: ${question.questionText}
`;

  // If the question has options that aren't embedded, show them
  if (!embeddedOptions && question.options && question.options.length > 0) {
    baseFields += `Options: ${JSON.stringify(question.options)}\n`;
  }
  
  // Add passage text for RC questions
  const passageText = question.passageText 
    ? `\nPassage Text: ${question.passageText}\n` 
    : '';

  // Add argument text for CR questions
  const argumentText = question.argumentText 
    ? `\nArgument Text: ${question.argumentText}\n` 
    : '';

  // Add statements for DS questions
  const statements = question.metadata && question.metadata.statement1 
    ? `\nStatement 1: ${question.metadata.statement1}\nStatement 2: ${question.metadata.statement2}\n` 
    : '';

  // Create different prompts based on whether options need extraction
  let taskInstructions = '';
  if (needsOptionExtraction) {
    taskInstructions = `
This question has ${embeddedOptions ? 'options embedded in the question text' : 'missing options'}. Please:
1. Extract and separate the actual question from the options
2. Organize the options properly (typically 5 options labeled A-E)
3. Determine the correct answer
4. Check for any other issues with the question
5. Ensure logical consistency and clarity
`;
  } else {
    taskInstructions = `
Analyze this question and determine if it is complete and valid. Please:
1. Check if the question text is clear and complete
2. Verify that all options are properly formatted
3. Determine if the correct answer is valid
4. Identify any logical inconsistencies or clarity issues
`;
  }

  return `
As a GMAT expert, ${taskInstructions}

${baseFields}
${passageText}${argumentText}${statements}

Respond in JSON format with the following structure:
{
  "status": "perfect" | "needs_revision" | "unfixable" | "fixed",
  "issues": ["list of specific issues found"],
  "proposedRevision": {
    "questionText": "revised question text (without options)",
    "options": ["option A", "option B", "option C", "option D", "option E"],
    "correctAnswer": "letter of the correct answer (A-E)",
    "passageText": "revised passage text if needed"
  }
}

IMPORTANT: 
1. Your response MUST be valid JSON. Do not include any explanatory text outside the JSON structure.
2. If options are embedded in the question text, extract them and place them in the "options" array.
3. The "questionText" field should only contain the question itself, not the options.
4. Make sure the "options" array contains 5 items for GMAT questions, one for each option A through E.
`;
};

/**
 * Validates a single question using GPT-4o-mini
 */
const validateQuestion = async (question: any) => {
  try {
    console.log(`\nValidating question ${question._id}:`);
    console.log(`Type: ${question.questionType}`);
    console.log(`Text: ${question.questionText.substring(0, 100)}...`);
    
    // Check if options are embedded in the question text
    const embeddedOptions = hasEmbeddedOptions(question.questionText);
    if (embeddedOptions) {
      console.log("Detected options embedded in question text - will attempt to extract");
    }

    const prompt = createValidationPrompt(question);
    
    const response = await processQuestion({
      questionText: prompt,
      options: [],
      correctAnswer: '',
      responseFormat: { type: "json_object" } // Force JSON response
    });

    console.log(`OpenAI response summary: ${response.aiAnswer.substring(0, 50)}...`);
    
    let validationResult;
    try {
      // Try to parse the JSON response
      validationResult = JSON.parse(response.aiAnswer);
    } catch (error) {
      console.error(`Failed to parse validation response: ${error}`);
      
      // Attempt to extract JSON from the response if it contains other text
      const jsonMatch = response.aiAnswer.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          validationResult = JSON.parse(jsonMatch[0]);
          console.log("Successfully extracted JSON from response");
        } catch (innerError) {
          throw new Error(`Invalid JSON response from OpenAI`);
        }
      } else {
        throw new Error(`Invalid JSON response from OpenAI`);
      }
    }
    
    // Update the question with validation results
    await QuestionBagV2.findByIdAndUpdate(question._id, {
      validationStatus: validationResult.status,
      validationIssues: validationResult.issues || [],
      proposedRevision: validationResult.proposedRevision || {}
    });
    
    // Track statistics
    if (validationResult.status === 'perfect') {
      stats.perfect++;
    } else if (validationResult.status === 'needs_revision') {
      stats.needsRevision++;
    } else if (validationResult.status === 'unfixable') {
      stats.unfixable++;
    }
    
    // Add to results
    validationResults.push({
      questionId: question._id,
      questionType: question.questionType,
      originalQuestion: {
        text: question.questionText,
        options: question.options,
        correctAnswer: question.correctAnswer,
        passageText: question.passageText,
        metadata: question.metadata
      },
      validationResult: validationResult
    });
    
    return validationResult;
  } catch (error) {
    console.error(`Error validating question ${question._id}: ${error}`);
    stats.failed++;
    return null;
  }
};

/**
 * Main function to run the validation
 */
const main = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/gmat-quiz');
    console.log('Connected to MongoDB');
    
    // Find questions with potential issues (either blank options or options embedded in text)
    const questions = await QuestionBagV2.find({
      $or: [
        { options: { $size: 0 } },
        { options: { $exists: false } },
        { options: null },
        { 
          questionText: { 
            $regex: /[A-E]\.\s.+\s[A-E]\.\s.+\s[A-E]\.\s.+/ 
          } 
        }
      ]
    }).limit(3);
    
    console.log(`Found ${questions.length} questions with potential option issues to validate`);
    
    // Process questions with concurrency limit
    const promises = questions.map(question => limit(() => validateQuestion(question)));
    await Promise.all(promises);
    
    // Update stats
    stats.totalProcessed = questions.length;
    
    // Export results to file
    const exportPath = path.join(process.cwd(), '..', 'exports');
    if (!fs.existsSync(exportPath)) {
      fs.mkdirSync(exportPath, { recursive: true });
    }
    
    const resultsPath = path.join(exportPath, 'validation_results.json');
    const exportData = {
      timestamp: new Date().toISOString(),
      summary: {
        totalQuestionsProcessed: stats.totalProcessed,
        perfectQuestions: stats.perfect,
        fixedQuestions: stats.fixed,
        questionsNeedingRevision: stats.needsRevision,
        unfixableQuestions: stats.unfixable,
        failedValidations: stats.failed
      },
      results: validationResults
    };
    
    fs.writeFileSync(resultsPath, JSON.stringify(exportData, null, 2));
    
    // Print summary
    console.log('\n======= VALIDATION SUMMARY =======');
    console.log(`Total questions processed: ${stats.totalProcessed}`);
    console.log(`Perfect questions: ${stats.perfect}`);
    console.log(`Fixed questions: ${stats.fixed}`);
    console.log(`Questions needing revision: ${stats.needsRevision}`);
    console.log(`Unfixable questions: ${stats.unfixable}`);
    console.log(`Failed validations: ${stats.failed}`);
    console.log(`\nResults exported to: ${resultsPath}`);
    
  } catch (error) {
    console.error('Error in validation process:', error);
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the script
main(); 