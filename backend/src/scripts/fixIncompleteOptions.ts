import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import { QuestionBag } from '../models/QuestionBag';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gmat-quiz';

// Check if an option appears to be incomplete
const isIncompleteOption = (text: string): boolean => {
  // Options that end with prepositions or conjunctions are likely incomplete
  const incompleteEndingWords = ['in', 'than', 'the', 'and', 'or', 'but', 'for', 'with', 'to', 'of'];
  const words = text.trim().split(' ');
  const lastWord = words[words.length - 1].toLowerCase().replace(/[.,;:]$/, '');
  
  return incompleteEndingWords.includes(lastWord) || text.trim().length < 10;
};

const analyzeIncompleteOptions = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Get all questions
    const questions = await QuestionBag.find({});
    console.log(`Found ${questions.length} questions to analyze.`);
    
    const questionsWithIncompleteOptions = questions.filter(question => 
      question.options.some(isIncompleteOption)
    );
    
    console.log(`Found ${questionsWithIncompleteOptions.length} questions with potentially incomplete options.`);
    
    // Create a report file
    const report = questionsWithIncompleteOptions.map(question => {
      const incompleteOptions = question.options
        .map((option, index) => ({ 
          index, 
          letter: String.fromCharCode(65 + index), 
          text: option, 
          isIncomplete: isIncompleteOption(option) 
        }))
        .filter(opt => opt.isIncomplete);
      
      return {
        id: question._id,
        questionText: question.questionText,
        incompleteOptions: incompleteOptions,
        allOptions: question.options,
        correctAnswer: question.correctAnswer || question.AI_generated_correct_answer || 'Unknown'
      };
    });
    
    // Write to file
    fs.writeFileSync('incomplete_options_report.json', JSON.stringify(report, null, 2));
    console.log('Report written to incomplete_options_report.json');
    
    // Create a human-readable text report
    const textReport = questionsWithIncompleteOptions.map((question, index) => {
      const incompleteOptions = question.options
        .map((option, idx) => ({ 
          letter: String.fromCharCode(65 + idx), 
          text: option, 
          isIncomplete: isIncompleteOption(option) 
        }))
        .filter(opt => opt.isIncomplete);
      
      return `
Question ${index + 1} (ID: ${question._id}):
--------------------------------------------------------------------
${question.questionText}
--------------------------------------------------------------------
Options:
${question.options.map((opt, idx) => `${String.fromCharCode(65 + idx)}. ${opt}`).join('\n')}
--------------------------------------------------------------------
Correct Answer: ${question.correctAnswer || question.AI_generated_correct_answer || 'Unknown'}
--------------------------------------------------------------------
Incomplete Options: ${incompleteOptions.map(opt => opt.letter).join(', ')}
====================================================================
`;
    }).join('\n');
    
    fs.writeFileSync('incomplete_options_report.txt', textReport);
    console.log('Text report written to incomplete_options_report.txt');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the script
analyzeIncompleteOptions().catch(console.error); 