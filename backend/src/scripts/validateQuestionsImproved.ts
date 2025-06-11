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
  fixed: 0,
  failed: 0,
  totalTokensUsed: 0,
  issueTypes: {} as Record<string, number>
};

// Store detailed results
const validationResults: any[] = [];

/**
 * Checks if question text contains embedded options
 * Many questions have options directly embedded in the question text
 */
const hasEmbeddedOptions = (questionText: string): boolean => {
  // Check for various option formats
  const optionPatterns = [
    /\b[A-E]\.\s/g,             // Format: "A. text"
    /\b[A-E]\)\s/g,             // Format: "A) text"
    /\b[A-E]\s*\)/g,            // Format: "A ) text" or "A) text"
    /\b[A-E][\s]*[\-\:]/g,      // Format: "A - text" or "A: text"
    /\bOption\s*[A-E][\s\:\)]/g // Format: "Option A: text" or "Option A) text"
  ];
  
  // Check if any pattern has multiple matches (at least 3)
  for (const pattern of optionPatterns) {
    const matches = questionText.match(pattern);
    if (matches !== null && matches.length >= 3) {
      return true;
    }
  }

  // Check for "Show Spoiler" text which often indicates the correct answer
  if (questionText.includes("Show Spoiler")) {
    return true;
  }
  
  return false;
};

/**
 * Attempts to clean and repair malformed JSON from the OpenAI API response
 */
const sanitizeAndRepairJson = (jsonString: string): string => {
  try {
    // First, try to clean up any obvious issues
    let cleaned = jsonString.trim();
    
    // If the string doesn't start with {, find where the JSON object starts
    if (!cleaned.startsWith('{')) {
      const jsonStart = cleaned.indexOf('{');
      if (jsonStart !== -1) {
        cleaned = cleaned.substring(jsonStart);
      }
    }
    
    // If the string doesn't end with }, find where the JSON object ends
    if (!cleaned.endsWith('}')) {
      const jsonEnd = cleaned.lastIndexOf('}');
      if (jsonEnd !== -1) {
        cleaned = cleaned.substring(0, jsonEnd + 1);
      }
    }
    
    // Check if valid JSON after basic cleaning
    try {
      JSON.parse(cleaned);
      return cleaned;
    } catch (error) {
      // Continue with more aggressive repairs
    }
    
    // Attempt to fix common JSON issues
    
    // 1. Fix unescaped quotes in strings
    cleaned = cleaned.replace(/([^\\])"([^"]*?)([^\\])"/g, '$1\\"$2$3\\"');
    
    // 2. Fix missing commas between properties
    cleaned = cleaned.replace(/}(\s*){/g, '},{');
    cleaned = cleaned.replace(/"(\s*){/g, '",{');
    cleaned = cleaned.replace(/}(\s*)"/g, '},"');
    cleaned = cleaned.replace(/"([^"]*?)"(\s*)"/g, '"$1","');
    
    // 3. Try to fix unterminated strings
    const matches = cleaned.match(/"([^"\\]*(\\.[^"\\]*)*)/g);
    if (matches) {
      for (const match of matches) {
        if (!match.endsWith('"')) {
          const fixedMatch = match + '"';
          cleaned = cleaned.replace(match, fixedMatch);
        }
      }
    }
    
    // 4. Balance braces and brackets
    const openBraces = (cleaned.match(/{/g) || []).length;
    const closeBraces = (cleaned.match(/}/g) || []).length;
    
    if (openBraces > closeBraces) {
      cleaned = cleaned + '}'.repeat(openBraces - closeBraces);
    } else if (closeBraces > openBraces) {
      cleaned = '{'.repeat(closeBraces - openBraces) + cleaned;
    }
    
    return cleaned;
  } catch (error) {
    console.error('Error attempting to sanitize JSON:', error);
    return jsonString;
  }
};

/**
 * Creates a default validation result object when parsing fails completely
 */
const createFallbackValidationResult = (question: any, error: Error): any => {
  console.log(`Creating fallback validation result due to: ${error.message}`);
  
  // Identify basic issues
  const issues = identifyQuestionIssues(question);
  const issueTypes = [...issues];
  
  // Add parsing error as an issue
  issueTypes.push('json_parsing_error');
  
  return {
    status: 'needs_revision',
    issueTypes: issueTypes,
    issueDetails: [
      `Failed to parse AI response: ${error.message}`,
      ...issues.map(issue => `Detected issue: ${issue}`)
    ],
    fixedElements: [],
    proposedRevision: {
      // Preserve the original content but flag it for manual review
      questionText: question.questionText,
      options: Array.isArray(question.options) ? question.options : [],
      correctAnswer: question.correctAnswer || '',
      passageText: question.passageText || ''
    }
  };
};

/**
 * Check what kind of issues the question has
 */
const identifyQuestionIssues = (question: any): string[] => {
  const issues: string[] = [];
  
  // Check for options embedded in question text
  if (hasEmbeddedOptions(question.questionText)) {
    issues.push('options_in_question_text');
  }
  
  // Check for missing options
  if (!question.options || !Array.isArray(question.options) || question.options.length === 0) {
    issues.push('missing_options');
  } else if (question.options.length < 5) {
    issues.push('incomplete_options');
  }
  
  // Check for missing or empty passage text in RC questions
  if (question.questionType === 'Reading Comprehension' && 
      (!question.passageText || question.passageText.trim() === '')) {
    issues.push('missing_passage_text');
  }
  
  // Check for missing statement fields in DS questions
  if (question.questionType === 'Data Sufficiency' && 
      (!question.metadata || !question.metadata.statement1 || !question.metadata.statement2)) {
    issues.push('missing_ds_statements');
  }

  // Check for missing argument text in CR questions
  if (question.questionType === 'Critical Reasoning' && 
      (!question.passageText || question.passageText.trim() === '')) {
    issues.push('missing_argument_text');
  }
  
  return issues;
};

/**
 * Attempts to extract options from question text when they're embedded
 */
const extractOptionsFromText = (questionText: string): { 
  cleanedText: string, 
  extractedOptions: string[],
  correctAnswer?: string
} => {
  // Default return structure
  const result = {
    cleanedText: questionText,
    extractedOptions: [] as string[],
    correctAnswer: undefined as string | undefined
  };
  
  // First check for "Show Spoiler" with answer
  const spoilerMatch = questionText.match(/Show Spoiler([A-E])/);
  if (spoilerMatch) {
    result.correctAnswer = spoilerMatch[1]; // Capture the letter
    // Remove the Show Spoiler text
    result.cleanedText = questionText.replace(/Show Spoiler[A-E]/, '').trim();
  }
  
  // Check for and remove garbage prefix like question numbers
  const garbagePrefixPattern = /^\d+[\.\)]\s+/;
  if (garbagePrefixPattern.test(result.cleanedText)) {
    console.log("Removed garbage prefix using pattern: " + garbagePrefixPattern);
    result.cleanedText = result.cleanedText.replace(garbagePrefixPattern, '');
    console.log("Removed garbage prefix from question");
  }

  // GMAT Reading Comprehension style - direct extraction method
  // This is optimized for the format: "Question text A) Option A B) Option B C) Option C..."
  const extractWithDirectMethod = () => {
    // Look for option markers (A., A), etc.) followed by text
    // Replace the 's' flag with preprocessing to handle newlines
    const normalizedText = questionText.replace(/\n/g, ' ');
    const optionMarkerRegex = /\s+([A-E])[\.\)\-:]\s+([^A-E].*?)(?=\s+[A-E][\.\)\-:]|\s*Show Spoiler|$)/g;
    
    const options = Array(5).fill('');
    let firstMatchPos = -1;
    
    // Find all option markers and their content
    let match;
    const matches = [];
    while ((match = optionMarkerRegex.exec(normalizedText)) !== null) {
      const letter = match[1]; // A, B, C, D, or E
      const optionText = match[2].trim();
      const position = match.index;
      
      matches.push({ letter, optionText, position });
      
      if (firstMatchPos === -1 || position < firstMatchPos) {
        firstMatchPos = position;
      }
    }
    
    // If we found at least 3 option markers
    if (matches.length >= 3) {
      // Sort by position to make sure they're in order
      matches.sort((a, b) => a.position - b.position);
      
      // Get question text (everything before first option)
      if (firstMatchPos !== -1) {
        result.cleanedText = questionText.substring(0, firstMatchPos).trim();
      }
      
      // Extract options
      for (const { letter, optionText } of matches) {
        const index = letter.charCodeAt(0) - 'A'.charCodeAt(0);
        if (index >= 0 && index < 5) {
          options[index] = optionText;
        }
      }
      
      if (options.filter(o => o !== '').length >= 3) {
        result.extractedOptions = options;
        console.log(`Successfully extracted options using ${options.filter(o => o !== '').length} options`);
        return true;
      }
    }
    return false;
  };
  
  // Alternative method: try splitting by option letter patterns
  const extractWithSplitMethod = () => {
    // Try to identify the position where options start
    const optionPatterns = [
      /\sA\)\s/, /\sA\.\s/, /\sA\s-\s/, /\s\(A\)\s/, /\sA\:/
    ];
    
    let optionStart = -1;
    for (const pattern of optionPatterns) {
      const match = questionText.match(pattern);
      if (match && match.index) {
        optionStart = match.index;
        break;
      }
    }
    
    if (optionStart > 0) {
      // Get the question text (everything before options)
      result.cleanedText = questionText.substring(0, optionStart).trim();
      
      // Get all option letter matches (A), B), etc.)
      const letterMatches = questionText.match(/[^A-Z]([A-E])[\.\)\-:](?:\s|$)/g) || [];
      
      // Get all option parts
      if (letterMatches.length >= 3) {
        // Build a regex pattern to split by letter prefixes
        const splitPattern = new RegExp(`[^A-Z][A-E][\\.\\)\\-:]\\s+`, 'g');
        const parts = questionText.substring(optionStart).split(splitPattern);
        
        // First part is empty or partial, skip it
        parts.shift();
        
        // Extract letter from each match
        const letters = letterMatches.map(match => {
          const letterMatch = match.match(/([A-E])[\.\)\-:]/);
          return letterMatch ? letterMatch[1] : '';
        });
        
        // Build options array
        const options = Array(5).fill('');
        for (let i = 0; i < Math.min(parts.length, letters.length); i++) {
          const letter = letters[i];
          const optionText = parts[i].trim();
          const index = letter.charCodeAt(0) - 'A'.charCodeAt(0);
          
          if (index >= 0 && index < 5) {
            options[index] = optionText;
          }
        }
        
        if (options.filter(o => o !== '').length >= 3) {
          result.extractedOptions = options;
          console.log(`Successfully extracted options using split pattern`);
          return true;
        }
      }
    }
    return false;
  };
  
  // Line-based extraction for options on separate lines
  const extractWithLineMethod = () => {
    // Split by newlines and look for lines starting with A), B), etc.
    const lines = questionText.split('\n').map(line => line.trim()).filter(line => line);
    
    // Find the first line that starts with an option letter
    const optionLineIndex = lines.findIndex(line => /^[A-E][\.\)\-:]/.test(line));
    
    if (optionLineIndex > 0) {
      // Get question text from lines before options
      result.cleanedText = lines.slice(0, optionLineIndex).join(' ').trim();
      
      // Get option lines
      const optionLines = lines.slice(optionLineIndex);
      const options = Array(5).fill('');
      
      // Process each option line
      for (const line of optionLines) {
        const match = line.match(/^([A-E])[\.\)\-:]\s+(.*)/);
        if (match) {
          const letter = match[1];
          const optionText = match[2].trim();
          const index = letter.charCodeAt(0) - 'A'.charCodeAt(0);
          
          if (index >= 0 && index < 5) {
            options[index] = optionText;
          }
        }
      }
      
      if (options.filter(o => o !== '').length >= 3) {
        result.extractedOptions = options;
        console.log(`Successfully extracted options using line-based approach`);
        return true;
      }
    }
    return false;
  };
  
  // Forced extraction for challenging formats
  const forceExtraction = () => {
    // Try to extract each option individually with a targeted approach
    const options = Array(5).fill('');
    let foundOptionA = false;
    let optionAPos = -1;
    
    // Process each option letter (A-E)
    for (let i = 0; i < 5; i++) {
      const letter = String.fromCharCode('A'.charCodeAt(0) + i);
      
      // Look for the option marker with various formats
      const patterns = [
        new RegExp(`\\s${letter}\\)\\s+([^A-E].+?)(?=\\s+[B-E]\\)|Show Spoiler|$)`, 'g'),
        new RegExp(`\\s${letter}\\.\\s+([^A-E].+?)(?=\\s+[B-E]\\.|Show Spoiler|$)`, 'g'),
        new RegExp(`\\s${letter}:?\\s+([^A-E].+?)(?=\\s+[B-E]:?|Show Spoiler|$)`, 'g'),
        new RegExp(`\\s\\(${letter}\\)\\s+([^A-E].+?)(?=\\s+\\([B-E]\\)|Show Spoiler|$)`, 'g')
      ];
      
      // Try each pattern
      for (const pattern of patterns) {
        // We need to handle the lack of 's' flag (which would make . match newlines)
        // So we'll replace all newlines with spaces before matching
        const normalizedText = questionText.replace(/\n/g, ' ');
        const match = normalizedText.match(pattern);
        
        if (match && match[1]) {
          options[i] = match[1].trim();
          
          // If this is option A, note its position for question text extraction
          if (letter === 'A' && match.index) {
            foundOptionA = true;
            optionAPos = match.index;
          }
          
          break;
        }
      }
    }
    
    // If we found at least 3 options, consider it successful
    if (options.filter(o => o !== '').length >= 3) {
      // If we found option A's position, extract question text
      if (foundOptionA && optionAPos > 0) {
        result.cleanedText = questionText.substring(0, optionAPos).trim();
      }
      
      result.extractedOptions = options;
      console.log(`Successfully extracted options using forced extraction`);
      return true;
    }
    
    return false;
  };
  
  // Try all extraction methods in order
  if (!extractWithDirectMethod()) {
    if (!extractWithSplitMethod()) {
      if (!extractWithLineMethod()) {
        forceExtraction();
      }
    }
  }
  
  return result;
};

/**
 * Creates a validation prompt based on question type and structure
 */
const createValidationPrompt = (question: any) => {
  // Identify specific issues with the question
  const questionIssues = identifyQuestionIssues(question);
  console.log(`Identified issues: ${questionIssues.join(', ') || 'none'}`);
  
  // Basic information about the question
  let baseFields = `
Question Type: ${question.questionType}
Question Text: ${question.questionText}
`;

  // If the question has options that aren't embedded, show them
  if (question.options && Array.isArray(question.options) && question.options.length > 0) {
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

  // Create different prompts based on the issues identified
  let taskInstructions = '';
  
  if (questionIssues.includes('options_in_question_text')) {
    taskInstructions = `
This question has options embedded in the question text. Please:
1. Look for and remove any garbage text at the beginning of the question (e.g., "OA:E 2)", "Question 5:", question numbers, answer indicators, or any other non-essential prefixes)
2. Carefully examine the question text to identify where the options begin, even if they're not clearly separated
3. Extract and separate the actual question from the options
4. Look for option formats like "A) text", "B) text", "A. text", "B. text", or other variations
5. Check if there's a "Show Spoiler" indicator at the end that shows the correct answer
6. Organize the options properly (typically 5 options labeled A-E)
7. Determine the correct answer
8. Ensure logical consistency and clarity
`;
  } else if (questionIssues.includes('missing_options') || questionIssues.includes('incomplete_options')) {
    taskInstructions = `
This question has missing or incomplete options. Please:
1. Look for and remove any garbage text at the beginning of the question (e.g., "OA:E 2)", "Question 5:", question numbers, answer indicators, or any other non-essential prefixes)
2. Check if the options might be embedded in the question text in formats like "A) text", "B) text", "A. text", "B. text", etc.
3. Look for "Show Spoiler" text at the end that might indicate the correct answer
4. If options are found in the question text, extract them properly
5. If options are still missing, generate appropriate answer options (typically 5 options labeled A-E)
6. Determine the correct answer
7. Ensure logical consistency and clarity
`;
  } else if (questionIssues.includes('missing_passage_text') && question.questionType === 'Reading Comprehension') {
    taskInstructions = `
This Reading Comprehension question is missing its passage text. Please:
1. Look for and remove any garbage text at the beginning of the question (e.g., "OA:E 2)", "Question 5:", question numbers, answer indicators, or any other non-essential prefixes)
2. Check if the question makes sense without a passage
3. If possible, identify what the missing passage might be about
4. Flag this question as unfixable since RC questions require passage text
`;
  } else if (questionIssues.includes('missing_ds_statements') && question.questionType === 'Data Sufficiency') {
    taskInstructions = `
This Data Sufficiency question is missing its statements. Please:
1. Look for and remove any garbage text at the beginning of the question (e.g., "OA:E 2)", "Question 5:", question numbers, answer indicators, or any other non-essential prefixes)
2. Try to extract Statement 1 and Statement 2 from the question text if they are embedded there
3. If statements aren't found, flag this as unfixable since DS questions require two statements
`;
  } else if (questionIssues.includes('missing_argument_text') && question.questionType === 'Critical Reasoning') {
    taskInstructions = `
This Critical Reasoning question is missing its argument text. Please:
1. Look for and remove any garbage text at the beginning of the question (e.g., "OA:E 2)", "Question 5:", question numbers, answer indicators, or any other non-essential prefixes)
2. Check if the argument is embedded in the question text
3. If found, separate it from the question
4. If not found, flag this as unfixable since CR questions require argument text
`;
  } else {
    taskInstructions = `
Analyze this question and determine if it is complete and valid. Please:
1. Look for and remove any garbage text at the beginning of the question (e.g., "OA:E 2)", "Question 5:", question numbers, answer indicators, or any other non-essential prefixes)
2. Check if the question text is clear and complete
3. Verify that all options are properly formatted
4. Determine if the correct answer is valid
5. Identify any logical inconsistencies or clarity issues
`;
  }

  // Add a more explicit instruction for option extraction
  taskInstructions += `
EXTREMELY IMPORTANT: If the question has options embedded in the text (like "A) text B) text"), you MUST extract them properly:
1. The question text should ONLY contain the actual question without any options
2. The options array must contain exactly 5 strings, one for each option (A-E)
3. Each option in the array should NOT include the letter prefix (A, B, C, D, E)
4. For example, if the text contains "A) Elephants", the option in the array should just be "Elephants"
`;

  return `
As a GMAT expert, ${taskInstructions}

${baseFields}
${passageText}${argumentText}${statements}

IMPORTANT ADDITIONAL TASK: Carefully examine the question text for these specific issues:

1. Garbage prefixes: Look for and remove any non-essential text at the beginning such as question numbers, "OA:E", etc.

2. Embedded options: The options may be embedded in the question text in various formats:
   - "A. text B. text C. text..." 
   - "A) text B) text C) text..."
   - "A text B text C text..."
   - Or the question might end with something like "Show SpoilerC" that indicates the correct answer

3. Correct answer indicators: Look for text like "Show SpoilerC" or "OA:E" that indicates the correct answer

If you find options embedded in the question text, extract them properly and separate them from the actual question.

CRITICAL INSTRUCTION: You MUST place the extracted options in the "options" array in your response. Do not leave the options embedded in the question text. The options array should contain exactly 5 items for GMAT questions, one for each option A through E. The "questionText" field must only contain the actual question, not the options.

Respond in JSON format with the following structure:
{
  "status": "perfect" | "needs_revision" | "unfixable" | "fixed",
  "issueTypes": ["list specific issue types found, e.g., 'options_in_question_text', 'missing_options', 'garbage_prefix', etc."],
  "issueDetails": ["detailed explanations of the issues"],
  "fixedElements": ["list of elements that were fixed, e.g., 'extracted_options', 'created_options', 'revised_question_text', 'removed_garbage_prefix', etc."],
  "proposedRevision": {
    "questionText": "revised question text (without options and without any garbage prefix)",
    "options": ["option A text (without the A prefix)", "option B text (without the B prefix)", "option C text (without the C prefix)", "option D text (without the D prefix)", "option E text (without the E prefix)"],
    "correctAnswer": "letter of the correct answer (A-E)",
    "passageText": "revised passage text if needed"
  }
}

Example of PROPER option extraction:
If the question text is:
"What is 2+2? A) 3 B) 4 C) 5 D) 6 E) 7"

Your response should be:
{
  "status": "fixed",
  "issueTypes": ["options_in_question_text"],
  "issueDetails": ["Options were embedded in the question text"],
  "fixedElements": ["extracted_options", "revised_question_text"],
  "proposedRevision": {
    "questionText": "What is 2+2?",
    "options": ["3", "4", "5", "6", "7"],
    "correctAnswer": "B",
    "passageText": ""
  }
}

IMPORTANT: 
1. Your response MUST be valid JSON. Do not include any explanatory text outside the JSON structure.
2. For status:
   - "perfect": Use only if no issues were found
   - "fixed": Use if you successfully fixed all issues
   - "needs_revision": Use if some issues remain but the question could be usable with manual revision
   - "unfixable": Use if critical elements are missing and cannot be reasonably inferred
3. Be specific in issueTypes and fixedElements so we can track what kinds of problems were identified and fixed.
4. If options are embedded in the question text, extract them and place them in the "options" array WITHOUT their letter prefixes (A,B,C,D,E).
5. If the question has garbage text at the beginning, remove it completely and add 'garbage_prefix' to the issueTypes.
6. The "questionText" field should only contain the clean question itself, not the options or any garbage prefix.
7. Make sure the "options" array contains 5 items for GMAT questions, one for each option A through E.
8. If "Show Spoiler" text is present, use it to determine the correct answer.
`;
};

/**
 * Process a validation result to ensure options are properly extracted
 */
const processValidationResult = (validationResult: any, question: any): any => {
  // If we know the question has embedded options, ALWAYS try to extract them manually first
  if (hasEmbeddedOptions(question.questionText)) {
    console.log("Question has embedded options. Attempting extraction directly...");
    
    // Use our dedicated function to extract options
    const { cleanedText, extractedOptions, correctAnswer } = extractOptionsFromText(
      question.questionText
    );
    
    if (extractedOptions.length >= 3) {
      console.log(`Successfully extracted ${extractedOptions.length} options manually`);
      
      // Create or update issue types
      validationResult.issueTypes = validationResult.issueTypes || [];
      if (!validationResult.issueTypes.includes('options_in_question_text')) {
        validationResult.issueTypes.push('options_in_question_text');
      }
      
      // Create or update fixed elements
      validationResult.fixedElements = validationResult.fixedElements || [];
      if (!validationResult.fixedElements.includes('extracted_options')) {
        validationResult.fixedElements.push('extracted_options');
      }
      
      // Ensure we have a proposed revision
      validationResult.proposedRevision = validationResult.proposedRevision || {};
      
      // Update the proposed revision
      validationResult.proposedRevision.questionText = cleanedText;
      validationResult.proposedRevision.options = extractedOptions;
      
      // If we found a correct answer and one isn't already set
      if (correctAnswer && (!validationResult.proposedRevision.correctAnswer || 
                           validationResult.proposedRevision.correctAnswer === '')) {
        validationResult.proposedRevision.correctAnswer = correctAnswer;
        
        if (!validationResult.fixedElements.includes('identified_correct_answer')) {
          validationResult.fixedElements.push('identified_correct_answer');
        }
      } else if (!validationResult.proposedRevision.correctAnswer) {
        // If we didn't find the correct answer, use the original if available
        validationResult.proposedRevision.correctAnswer = question.correctAnswer || '';
      }
      
      // Keep the passage text from the original question
      validationResult.proposedRevision.passageText = question.passageText || '';
      
      // Mark as fixed if we extracted at least 3 options
      if (extractedOptions.filter(o => o !== '').length >= 3) {
        validationResult.status = "fixed";
      }
    }
  }
  
  // If AI didn't extract options but we know they're embedded and our first attempt failed,
  // try a more aggressive approach
  if (
    validationResult.proposedRevision && 
    validationResult.proposedRevision.questionText &&
    (!validationResult.proposedRevision.options || validationResult.proposedRevision.options.length < 3) &&
    hasEmbeddedOptions(validationResult.proposedRevision.questionText)
  ) {
    console.log("AI failed to extract options. Attempting more aggressive extraction...");
    
    // Look for option letter patterns
    const letterMatches = validationResult.proposedRevision.questionText.match(/\b[A-E][.)\-:]\s+/g);
    
    if (letterMatches && letterMatches.length >= 3) {
      // We have at least 3 option letters, try to split the text
      const options = Array(5).fill('');
      
      // Split by letter patterns
      const parts = validationResult.proposedRevision.questionText.split(/\b[A-E][.)\-:]\s+/);
      
      // First part is the question text
      const questionText = parts[0].trim();
      
      // Rest are options, but need to be assigned to the right letter
      for (let i = 0; i < letterMatches.length && i < 5; i++) {
        const letter = letterMatches[i].charAt(0);
        const index = letter.charCodeAt(0) - 'A'.charCodeAt(0);
        
        if (index >= 0 && index < 5 && i + 1 < parts.length) {
          // Get text until next option or end
          let optionText = parts[i + 1].trim();
          
          // Remove any "Show Spoiler" text
          const spoilerPos = optionText.indexOf('Show Spoiler');
          if (spoilerPos !== -1) {
            optionText = optionText.substring(0, spoilerPos).trim();
          }
          
          options[index] = optionText;
        }
      }
      
      // If we extracted at least 3 options, update the result
      if (options.filter(o => o).length >= 3) {
        validationResult.proposedRevision.questionText = questionText;
        validationResult.proposedRevision.options = options;
        validationResult.status = "fixed";
        
        validationResult.issueTypes = validationResult.issueTypes || [];
        if (!validationResult.issueTypes.includes('options_in_question_text')) {
          validationResult.issueTypes.push('options_in_question_text');
        }
        
        validationResult.fixedElements = validationResult.fixedElements || [];
        if (!validationResult.fixedElements.includes('extracted_options')) {
          validationResult.fixedElements.push('extracted_options');
        }
        
        console.log("Successfully extracted options using aggressive approach");
      }
    }
  }
  
  // If the AI provided answer and explanation instead of the proper validation format,
  // convert it to the expected format
  if (validationResult.answer && validationResult.explanation) {
    console.log("Converting answer format to validation format");
    
    const issues = identifyQuestionIssues(question);
    
    return {
      status: 'needs_revision',
      issueTypes: issues,
      issueDetails: ["AI provided answer instead of proper validation result"],
      fixedElements: [],
      proposedRevision: {
        questionText: question.questionText,
        options: question.options || [],
        correctAnswer: validationResult.answer || question.correctAnswer || '',
        passageText: question.passageText || ''
      }
    };
  }
  
  return validationResult;
};

/**
 * Validates a single question using GPT-4o-mini
 */
const validateQuestion = async (question: any) => {
  try {
    console.log(`\nValidating question ${question._id}:`);
    console.log(`Type: ${question.questionType}`);
    console.log(`Text: ${question.questionText.substring(0, 100)}...`);
    
    // Identify question issues upfront
    const questionIssues = identifyQuestionIssues(question);
    if (questionIssues.length > 0) {
      console.log(`Issues detected: ${questionIssues.join(', ')}`);
    } else {
      console.log("No obvious issues detected - proceeding with validation");
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
    } catch (parseError) {
      console.error(`Failed to parse validation response: ${parseError}`);
      
      // First try to extract JSON from the response if it contains other text
      const jsonMatch = response.aiAnswer.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          validationResult = JSON.parse(jsonMatch[0]);
          console.log("Successfully extracted JSON from response");
        } catch (innerError) {
          // If that fails, try to sanitize and repair the JSON
          console.log("Attempting to sanitize and repair malformed JSON...");
          try {
            const repairedJson = sanitizeAndRepairJson(response.aiAnswer);
            validationResult = JSON.parse(repairedJson);
            console.log("Successfully repaired and parsed JSON");
          } catch (repairError) {
            // If all attempts fail, create a fallback validation result
            validationResult = createFallbackValidationResult(question, repairError);
          }
        }
      } else {
        // If no JSON-like structure found, create a fallback validation result
        validationResult = createFallbackValidationResult(question, parseError);
      }
    }
    
    // Process the validation result to ensure options are properly extracted
    validationResult = processValidationResult(validationResult, question);
    
    // Ensure all required fields are present
    validationResult.status = validationResult.status || 'needs_revision';
    validationResult.issueTypes = validationResult.issueTypes || [];
    validationResult.issueDetails = validationResult.issueDetails || [];
    validationResult.fixedElements = validationResult.fixedElements || [];
    validationResult.proposedRevision = validationResult.proposedRevision || {
      questionText: question.questionText,
      options: Array.isArray(question.options) ? question.options : [],
      correctAnswer: question.correctAnswer || '',
      passageText: question.passageText || ''
    };
    
    // Update the question with validation results
    const updateFields = {
      validationStatus: validationResult.status,
      validationIssues: validationResult.issueDetails || [],
      proposedRevision: validationResult.proposedRevision || {}
    };
    
    // Add custom fields as additional data to avoid schema issues
    const additionalData = {
      issueTypes: validationResult.issueTypes || [],
      fixedElements: validationResult.fixedElements || [],
    };
    
    await QuestionBagV2.findByIdAndUpdate(
      question._id, 
      { 
        ...updateFields,
        validationData: additionalData 
      }
    );
    
    // Track statistics
    if (validationResult.status === 'perfect') {
      stats.perfect++;
    } else if (validationResult.status === 'needs_revision') {
      stats.needsRevision++;
    } else if (validationResult.status === 'unfixable') {
      stats.unfixable++;
    } else if (validationResult.status === 'fixed') {
      stats.fixed++;
    }
    
    // Track issue types
    if (validationResult.issueTypes && Array.isArray(validationResult.issueTypes)) {
      for (const issueType of validationResult.issueTypes) {
        stats.issueTypes[issueType] = (stats.issueTypes[issueType] || 0) + 1;
      }
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
      identifiedIssues: questionIssues,
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
    
    // Find questions with potential issues (options embedded in text or missing)
    // We're relying on the AI to detect garbage prefixes since they can vary
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
    }).limit(10);
    
    console.log(`Found ${questions.length} questions with potential issues to validate`);
    
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
    
    const resultsPath = path.join(exportPath, 'validation_results_improved.json');
    const exportData = {
      timestamp: new Date().toISOString(),
      summary: {
        totalQuestionsProcessed: stats.totalProcessed,
        perfectQuestions: stats.perfect,
        fixedQuestions: stats.fixed,
        questionsNeedingRevision: stats.needsRevision,
        unfixableQuestions: stats.unfixable,
        failedValidations: stats.failed,
        issueTypeBreakdown: stats.issueTypes
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
    console.log('\n======= ISSUE TYPE BREAKDOWN =======');
    for (const [issueType, count] of Object.entries(stats.issueTypes)) {
      console.log(`${issueType}: ${count}`);
    }
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