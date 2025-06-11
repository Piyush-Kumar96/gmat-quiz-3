import mongoose from 'mongoose';
import { QuestionBagV2 } from '../models/QuestionBagV2';
import { processQuestion } from '../services/openaiService';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

// Statistics tracking
const stats = {
  totalProcessed: 0,
  aiSuccess: 0,
  hybridSuccess: 0,
  failed: 0
};

// Store detailed results
const extractionResults: any[] = [];

/**
 * Extracts options from question text using AI only
 */
const extractOptionsWithAI = async (question: any): Promise<{
  options: string[],
  cleanedQuestionText: string
}> => {
  try {
    console.log(`\nExtracting options for RC question ${question._id} using AI only`);
    
    const prompt = `
As a GMAT expert, please extract the 5 answer options (A-E) from this Reading Comprehension question and separate the actual question from the options.

Question Text: ${question.questionText}

INSTRUCTIONS:
1. Extract exactly 5 options labeled A through E
2. Return ONLY the option text without the letter prefix (A, B, C, D, E)
3. Also identify the actual question text without any options
4. If you cannot find 5 distinct options, make your best guess

Respond with a JSON object containing:
{
  "options": ["Option A text", "Option B text", "Option C text", "Option D text", "Option E text"],
  "questionText": "The cleaned question text without options"
}
`;

    const response = await processQuestion({
      questionText: prompt,
      options: [],
      correctAnswer: '',
      responseFormat: { type: "json_object" }
    });

    console.log(`AI response: ${response.aiAnswer.substring(0, 100)}...`);
    
    try {
      // Try to parse the JSON response
      let result = {
        options: Array(5).fill(''),
        cleanedQuestionText: question.questionText
      };
      
      // First, check if the response is a valid JSON object
      try {
        const parsedResponse = JSON.parse(response.aiAnswer);
        
        if (parsedResponse.options && Array.isArray(parsedResponse.options)) {
          result.options = parsedResponse.options.slice(0, 5);
          // Ensure we have exactly 5 options
          while (result.options.length < 5) {
            result.options.push('');
          }
        }
        
        if (parsedResponse.questionText) {
          result.cleanedQuestionText = parsedResponse.questionText;
        }
        
        return result;
      } catch (parseError) {
        // If not valid JSON, try to extract JSON object from the response
        const jsonMatch = response.aiAnswer.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsedResponse = JSON.parse(jsonMatch[0]);
            
            if (parsedResponse.options && Array.isArray(parsedResponse.options)) {
              result.options = parsedResponse.options.slice(0, 5);
              // Ensure we have exactly 5 options
              while (result.options.length < 5) {
                result.options.push('');
              }
            }
            
            if (parsedResponse.questionText) {
              result.cleanedQuestionText = parsedResponse.questionText;
            }
            
            return result;
          } catch (innerError) {
            console.error(`Failed to parse extracted JSON: ${innerError}`);
          }
        }
        
        // If still not parsed, fall back to original approach for options only
        const options = response.aiAnswer
          .split('\n')
          .filter(line => line.trim() !== '')
          .map(line => line.replace(/^[A-E][\.\)\:]?\s*/, '').trim())
          .slice(0, 5);
        
        // If we got fewer than 5 options, pad with empty strings
        while (options.length < 5) {
          options.push('');
        }
        
        result.options = options;
        
        // For question text, try to find where the options start in the original text
        const optionPatterns = [
          /\b[A-E][\.\)]\s+/,
          /\b[A-E][\s]*[\-\:]\s+/,
          /\bOption\s*[A-E][\s\:\)]\s+/
        ];
        
        let optionStartPos = -1;
        for (const pattern of optionPatterns) {
          const match = question.questionText.match(pattern);
          if (match && match.index) {
            optionStartPos = match.index;
            break;
          }
        }
        
        if (optionStartPos > 0) {
          result.cleanedQuestionText = question.questionText.substring(0, optionStartPos).trim();
        }
        
        return result;
      }
    } catch (error) {
      console.error(`Failed to extract with AI: ${error}`);
      return {
        options: Array(5).fill(''),
        cleanedQuestionText: question.questionText
      };
    }
  } catch (error) {
    console.error(`Error extracting options with AI: ${error}`);
    return {
      options: Array(5).fill(''),
      cleanedQuestionText: question.questionText
    };
  }
};

/**
 * Uses regex patterns to extract options, falling back to AI when needed
 */
const extractOptionsWithHybrid = async (question: any): Promise<{
  options: string[],
  cleanedQuestionText: string
}> => {
  try {
    console.log(`\nExtracting options for RC question ${question._id} using hybrid approach`);
    
    const questionText = question.questionText;
    const options = Array(5).fill('');
    let cleanedQuestionText = questionText;
    let optionStartPos = -1;
    
    // Common option patterns in GMAT RC questions
    const optionPatterns = [
      /\b([A-E])[\.\)]\s+(.*?)(?=\s+\b[A-E][\.\)]|\s*$)/g,  // A. text or A) text
      /\b([A-E])[\s]*[\-\:]\s+(.*?)(?=\s+\b[A-E][\s]*[\-\:]|\s*$)/g,  // A - text or A: text
      /\bOption\s*([A-E])[\s\:\)]\s+(.*?)(?=\s+\bOption\s*[A-E]|\s*$)/g  // Option A: text
    ];
    
    // Try each pattern
    let foundOptions = false;
    for (const pattern of optionPatterns) {
      // Replace newlines with spaces for better regex matching
      const normalizedText = questionText.replace(/\n/g, ' ');
      
      const matches = [];
      let match;
      // We need to reset the regex for each use
      const patternCopy = new RegExp(pattern.source, pattern.flags);
      
      while ((match = patternCopy.exec(normalizedText)) !== null) {
        const letter = match[1]; // A, B, C, D, or E
        const text = match[2].trim();
        const index = letter.charCodeAt(0) - 'A'.charCodeAt(0);
        
        if (index >= 0 && index < 5) {
          options[index] = text;
          matches.push({ letter, text, position: match.index });
          
          // Track the position of the first option to extract question text
          if (match.index < optionStartPos || optionStartPos === -1) {
            optionStartPos = match.index;
          }
        }
      }
      
      // If we found at least 3 options with this pattern, consider it successful
      if (matches.length >= 3) {
        foundOptions = true;
        console.log(`Found ${matches.length} options using regex pattern`);
        
        // Extract the clean question text
        if (optionStartPos > 0) {
          cleanedQuestionText = questionText.substring(0, optionStartPos).trim();
        }
        
        break;
      }
    }
    
    // If regex didn't find enough options, try direct extraction
    if (!foundOptions) {
      // Try looking for option-like patterns directly
      const directPatterns = [
        // Whole question scanning for A) Option text B) Option text pattern
        // This handles cases where the options are embedded in a continuous text
        /\s+([A-E])[\.\)\-:]\s+([^A-E].*?)(?=\s+[A-E][\.\)\-:]|\s*$)/g
      ];
      
      for (const pattern of directPatterns) {
        const normalizedText = questionText.replace(/\n/g, ' ');
        const matches = [];
        let match;
        
        // We need to reset the regex for each use
        const patternCopy = new RegExp(pattern.source, pattern.flags);
        
        while ((match = patternCopy.exec(normalizedText)) !== null) {
          const letter = match[1];
          const text = match[2].trim();
          const index = letter.charCodeAt(0) - 'A'.charCodeAt(0);
          
          if (index >= 0 && index < 5) {
            options[index] = text;
            matches.push({ letter, text, position: match.index });
            
            // Track the position of the first option to extract question text
            if (match.index < optionStartPos || optionStartPos === -1) {
              optionStartPos = match.index;
            }
          }
        }
        
        if (matches.length >= 3) {
          foundOptions = true;
          console.log(`Found ${matches.length} options using direct extraction`);
          
          // Extract the clean question text
          if (optionStartPos > 0) {
            cleanedQuestionText = questionText.substring(0, optionStartPos).trim();
          }
          
          break;
        }
      }
    }
    
    // If regex methods failed, try line-based extraction
    if (!foundOptions) {
      // Split by newlines and look for lines starting with option markers
      const lines = questionText.split('\n').map(line => line.trim()).filter(line => line);
      const optionLines = lines.filter(line => /^[A-E][\.\)\-:]/.test(line));
      
      if (optionLines.length >= 3) {
        // Find the line number of the first option to extract question text
        const firstOptionLineIndex = lines.findIndex(line => /^[A-E][\.\)\-:]/.test(line));
        
        for (const line of optionLines) {
          const match = line.match(/^([A-E])[\.\)\-:]\s+(.*)/);
          if (match) {
            const letter = match[1];
            const text = match[2].trim();
            const index = letter.charCodeAt(0) - 'A'.charCodeAt(0);
            
            if (index >= 0 && index < 5) {
              options[index] = text;
            }
          }
        }
        
        foundOptions = true;
        console.log(`Found ${optionLines.length} options using line-based extraction`);
        
        // Extract the clean question text
        if (firstOptionLineIndex > 0) {
          cleanedQuestionText = lines.slice(0, firstOptionLineIndex).join(' ').trim();
        }
      }
    }
    
    // If all regex methods failed, fall back to AI
    if (!foundOptions || options.filter(o => o !== '').length < 3) {
      console.log(`Regex methods failed to find enough options. Falling back to AI.`);
      const aiResult = await extractOptionsWithAI(question);
      
      // Merge the results, preferring regex-extracted options where available
      for (let i = 0; i < 5; i++) {
        if (!options[i] && aiResult.options[i]) {
          options[i] = aiResult.options[i];
        }
      }
      
      // If we didn't extract question text, use the AI-extracted one
      if (cleanedQuestionText === questionText && aiResult.cleanedQuestionText !== questionText) {
        cleanedQuestionText = aiResult.cleanedQuestionText;
      }
    }
    
    return {
      options,
      cleanedQuestionText
    };
  } catch (error) {
    console.error(`Error extracting options with hybrid approach: ${error}`);
    return {
      options: Array(5).fill(''),
      cleanedQuestionText: question.questionText
    };
  }
};

/**
 * Main function to run the extraction
 */
const main = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/gmat-quiz');
    console.log('Connected to MongoDB');
    
    // Find ALL Reading Comprehension questions with no options (removed the limit)
    const questions = await QuestionBagV2.find({
      questionType: 'Reading Comprehension',
      $or: [
        { options: { $size: 0 } },
        { options: { $exists: false } },
        { options: null }
      ]
    });
    
    console.log(`Found ${questions.length} Reading Comprehension questions with missing options`);
    
    // Process each question
    for (const question of questions) {
      stats.totalProcessed++;
      
      try {
        console.log(`Processing question ${stats.totalProcessed}/${questions.length}: ${question._id}`);
        
        // Extract options using both methods
        const aiResult = await extractOptionsWithAI(question);
        const hybridResult = await extractOptionsWithHybrid(question);
        
        // Count successes (3+ non-empty options)
        const aiSuccess = aiResult.options.filter(o => o !== '').length >= 3;
        const hybridSuccess = hybridResult.options.filter(o => o !== '').length >= 3;
        
        if (aiSuccess) stats.aiSuccess++;
        if (hybridSuccess) stats.hybridSuccess++;
        if (!aiSuccess && !hybridSuccess) stats.failed++;
        
        // Determine which result to use
        const bestOptions = hybridSuccess ? hybridResult.options : (aiSuccess ? aiResult.options : Array(5).fill(''));
        const bestQuestionText = hybridSuccess ? hybridResult.cleanedQuestionText : 
                               (aiSuccess ? aiResult.cleanedQuestionText : question.questionText);
        
        // Just save the extraction results without updating the database
        extractionResults.push({
          questionId: question._id,
          originalText: question.questionText,
          cleanedQuestionText: bestQuestionText,
          aiOptions: aiResult.options,
          hybridOptions: hybridResult.options,
          aiSuccess,
          hybridSuccess,
          bestOptions
        });
        
        // Log progress every 5 questions
        if (stats.totalProcessed % 5 === 0) {
          console.log(`Progress: ${stats.totalProcessed}/${questions.length} questions processed`);
          console.log(`Success rates - AI: ${stats.aiSuccess}/${stats.totalProcessed}, Hybrid: ${stats.hybridSuccess}/${stats.totalProcessed}`);
        }
      } catch (error) {
        console.error(`Error processing question ${question._id}: ${error}`);
      }
    }
    
    // Export results to file
    const exportPath = path.join(process.cwd(), '..', 'exports');
    if (!fs.existsSync(exportPath)) {
      fs.mkdirSync(exportPath, { recursive: true });
    }
    
    const resultsPath = path.join(exportPath, 'all_rc_options_extraction_results.json');
    const exportData = {
      timestamp: new Date().toISOString(),
      summary: {
        totalQuestionsProcessed: stats.totalProcessed,
        aiSuccessful: stats.aiSuccess,
        hybridSuccessful: stats.hybridSuccess,
        failed: stats.failed
      },
      results: extractionResults
    };
    
    fs.writeFileSync(resultsPath, JSON.stringify(exportData, null, 2));
    
    // Print summary
    console.log('\n======= EXTRACTION SUMMARY =======');
    console.log(`Total questions processed: ${stats.totalProcessed}`);
    console.log(`AI method successful: ${stats.aiSuccess}`);
    console.log(`Hybrid method successful: ${stats.hybridSuccess}`);
    console.log(`Failed extractions: ${stats.failed}`);
    console.log(`\nResults exported to: ${resultsPath}`);
    
  } catch (error) {
    console.error('Error in extraction process:', error);
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the script
main(); 