import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { QuestionBagV2 } from '../models/QuestionBagV2';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Folder to read from
const FOLDER_NAME = 'quant_exampacks_mistral7b';
const EXPORTS_DIR = path.join(__dirname, '../../exports');

// Known problematic files to skip
const SKIP_FILES = ['processed_249.json'];

// Stats tracking
let totalFiles = 0;
let successfulImports = 0;
let skippedFiles = 0;
let errorCount = 0;
const skippedQuestionNumbers: number[] = [];

/**
 * Main function
 */
async function main() {
  try {
    // Connect to MongoDB
    if (!process.env.MONGODB_URI) {
      console.error('MONGODB_URI environment variable is not set.');
      process.exit(1);
    }
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Delete all existing Quant questions first
    try {
      console.log('Deleting all existing Quantitative questions...');
      const deleteResult = await QuestionBagV2.deleteMany({ category: 'Quantitative' });
      console.log(`Deleted ${deleteResult.deletedCount} existing Quantitative questions`);
    } catch (deleteError) {
      console.error(`Error deleting existing questions: ${deleteError}`);
    }
    
    const folderPath = path.join(EXPORTS_DIR, FOLDER_NAME);
    
    // Get all files in the folder
    console.log(`Reading files from ${folderPath}...`);
    const allFiles = fs.readdirSync(folderPath)
      .filter(file => file.endsWith('.json') && !file.includes('all_processed_questions'));
    
    // Sort files by question number
    allFiles.sort((a, b) => {
      const matchA = a.match(/processed_(\d+)\.json/);
      const matchB = b.match(/processed_(\d+)\.json/);
      const numA = matchA ? parseInt(matchA[1]) : 0;
      const numB = matchB ? parseInt(matchB[1]) : 0;
      return numA - numB;
    });
    
    console.log(`Found ${allFiles.length} files to process`);
    
    // Process each file
    for (const file of allFiles) {
      totalFiles++;
      
      // Skip known problematic files
      if (SKIP_FILES.includes(file)) {
        const questionNumber = parseInt(file.match(/processed_(\d+)\.json/)?.[1] || '0');
        console.warn(`Skipping known problematic file: ${file} (question ${questionNumber})`);
        skippedFiles++;
        skippedQuestionNumbers.push(questionNumber);
        continue;
      }
      
      try {
        const filePath = path.join(folderPath, file);
        console.log(`Processing ${file}...`);
        
        // Read and parse the file
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(fileContent);
        
        // Extract question data
        const questionNumber = parseInt(file.match(/processed_(\d+)\.json/)?.[1] || '0');
        
        // Simple question data mapping
        const questionData = {
          questionText: jsonData.analysis?.question || '',
          questionType: jsonData.metadata?.type === 'DS' ? 'Data Sufficiency' : 'Problem Solving',
          options: jsonData.analysis?.options || {},
          correctAnswer: jsonData.analysis?.correct_answer || 'Unknown',
          explanation: jsonData.analysis?.explanation || '',
          difficulty: jsonData.metadata?.difficulty_level || 'Medium',
          source: 'Exam Packs',
          sourceDetails: {
            url: jsonData.source_url || ''
          },
          category: 'Quantitative',
          tags: [jsonData.metadata?.topic || '', jsonData.metadata?.type || ''].filter(Boolean),
          questionNumber: questionNumber
        };
        
        // Skip if questionText is empty
        if (!questionData.questionText || questionData.questionText.trim() === '') {
          console.warn(`Skipping question ${questionNumber} due to missing question text`);
          skippedFiles++;
          skippedQuestionNumbers.push(questionNumber);
          continue;
        }
        
        // Import the question
        await QuestionBagV2.create(questionData);
        console.log(`Successfully imported question ${questionNumber}`);
        successfulImports++;
      } catch (error) {
        const questionNumber = parseInt(file.match(/processed_(\d+)\.json/)?.[1] || '0');
        console.error(`Error processing file ${file} (question ${questionNumber}): ${error}`);
        errorCount++;
        skippedQuestionNumbers.push(questionNumber);
      }
    }
    
    // Print summary
    console.log('\n----- Import Summary -----');
    console.log(`Total files processed: ${totalFiles}`);
    console.log(`Successfully imported: ${successfulImports}`);
    console.log(`Skipped files: ${skippedFiles}`);
    console.log(`Errors: ${errorCount}`);
    
    if (skippedQuestionNumbers.length > 0) {
      console.log(`\nSkipped questions: ${skippedQuestionNumbers.join(', ')}`);
    }
    
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    
    console.log('\nTest import complete!');
  } catch (error) {
    console.error(`Error in main function: ${error}`);
    process.exit(1);
  }
}

// Run the script
main(); 