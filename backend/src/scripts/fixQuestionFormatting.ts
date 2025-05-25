import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { QuestionBag } from '../models/QuestionBag';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gmat-quiz';

// Helper to clean question text
const cleanQuestionText = (text: string): string => {
  // Remove any option-like text that got appended to the question
  const cleanedText = text.replace(/\s+[A-E]\.\s+.*?\s+in\s+.*?\s+county\.$/, '');
  
  // Make sure question ends with a question mark if appropriate
  if (text.includes('?') && !text.trim().endsWith('?')) {
    const parts = text.split('?');
    return parts[0] + '?';
  }
  
  return cleanedText;
};

// Helper to clean option text
const cleanOptionText = (text: string, index: number): string => {
  // Expected letter for this option
  const expectedLetter = String.fromCharCode(65 + index);
  
  // Remove duplicate letter prefixes like "A. A. "
  const optionRegex = new RegExp(`^\\s*${expectedLetter}[\\s\\.\\)\\-:]+${expectedLetter}[\\s\\.\\)\\-:]+`);
  let cleanedText = text.replace(optionRegex, `${expectedLetter}. `);
  
  // If the option still starts with a letter, ensure it's the correct format
  const letterRegex = /^\s*([A-E])[\s\.\)\-:]+/;
  const match = cleanedText.match(letterRegex);
  
  if (match && match[1] === expectedLetter) {
    // Replace with standardized format
    cleanedText = cleanedText.replace(letterRegex, `${expectedLetter}. `);
  } else if (!match) {
    // Add prefix if missing
    cleanedText = `${expectedLetter}. ${cleanedText}`;
  } else if (match && match[1] !== expectedLetter) {
    // Wrong letter, replace with correct one
    cleanedText = cleanedText.replace(letterRegex, `${expectedLetter}. `);
  }
  
  return cleanedText.trim();
};

// Check if an option appears to be incomplete
const isIncompleteOption = (text: string): boolean => {
  // Options that end with prepositions or conjunctions are likely incomplete
  const incompleteEndingWords = ['in', 'than', 'the', 'and', 'or', 'but', 'for', 'with', 'to', 'of'];
  const words = text.trim().split(' ');
  const lastWord = words[words.length - 1].toLowerCase().replace(/[.,;:]$/, '');
  
  return incompleteEndingWords.includes(lastWord) || text.trim().length < 10;
};

// Extract answer letter from various formats
const getAnswerLetter = (answer: string): string => {
  // If it's already a single letter, return it
  if (answer.length === 1 && answer.match(/^[A-E]$/)) {
    return answer;
  }
  
  // If it starts with a letter followed by period, extract the letter
  const match = answer.match(/^([A-E])[.\s]/);
  if (match) {
    return match[1];
  }
  
  // Otherwise return the original answer
  return answer;
};

const fixQuestions = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Get all questions
    const questions = await QuestionBag.find({});
    console.log(`Found ${questions.length} questions to analyze.`);
    
    let fixedCount = 0;
    let errorCount = 0;
    
    for (const question of questions) {
      let needsUpdate = false;
      let updates: any = {};
      
      // Check if question text needs cleaning
      const cleanedQuestionText = cleanQuestionText(question.questionText);
      if (cleanedQuestionText !== question.questionText) {
        updates.questionText = cleanedQuestionText;
        needsUpdate = true;
      }
      
      // Check options
      const cleanedOptions = question.options.map((option: string, index: number) => {
        const cleaned = cleanOptionText(option, index);
        return cleaned;
      });
      
      // Check if any options were modified
      const optionsChanged = cleanedOptions.some((cleaned: string, i: number) => 
        cleaned !== question.options[i]
      );
      
      if (optionsChanged) {
        updates.options = cleanedOptions;
        needsUpdate = true;
      }
      
      // Check for incomplete options
      const hasIncompleteOptions = cleanedOptions.some(isIncompleteOption);
      if (hasIncompleteOptions) {
        console.log(`Question ID ${question._id} has potentially incomplete options.`);
      }
      
      // Check correct answer format
      if (question.correctAnswer && question.correctAnswer !== 'Unknown') {
        const answerLetter = getAnswerLetter(question.correctAnswer);
        if (answerLetter !== question.correctAnswer) {
          updates.correctAnswer = answerLetter;
          needsUpdate = true;
        }
      } else if (question.AI_generated_correct_answer && (!question.correctAnswer || question.correctAnswer === 'Unknown')) {
        updates.correctAnswer = question.AI_generated_correct_answer;
        needsUpdate = true;
      }
      
      // Update the question if needed
      if (needsUpdate) {
        try {
          await QuestionBag.updateOne({ _id: question._id }, { $set: updates });
          fixedCount++;
          console.log(`Fixed question ID: ${question._id}`);
        } catch (updateError) {
          console.error(`Error updating question ${question._id}:`, updateError);
          errorCount++;
        }
      }
    }
    
    console.log(`Analysis complete. Fixed ${fixedCount} questions. Errors: ${errorCount}`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the script
fixQuestions().catch(console.error); 