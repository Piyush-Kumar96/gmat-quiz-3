/**
 * Import Questions to Database Script
 * 
 * This script imports processed question JSON files into MongoDB using the QuestionBagV2 schema.
 * It supports importing by folder (question type) with batching for optimal reliability.
 * 
 * Usage:
 *   - Import specific folder: ts-node importQuestionsToDb.ts --folder=rc_gmatprep
 *   - Import all folders: ts-node importQuestionsToDb.ts --all
 *   - Test mode (no DB writes): ts-node importQuestionsToDb.ts --folder=rc_gmatprep --test
 *   - Custom batch size: ts-node importQuestionsToDb.ts --folder=rc_gmatprep --batch=50
 */

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { QuestionBagV2, IQuestionBagV2 } from '../models/QuestionBagV2';

// Load environment variables
dotenv.config();

// Configuration
const EXPORTS_DIR = path.join(__dirname, '../../exports');
const DEFAULT_BATCH_SIZE = 20;
const SOURCE_FOLDER_MAP: Record<string, string> = {
  'rc_exampacks_direct_extraction': 'Exam Packs',
  'rc_gmatprep_direct_extraction': 'GMAT Prep',
  'rc_ogquestions_direct_extraction': 'Official Guide'
};

// Parse command line arguments
const args = process.argv.slice(2);
const folderArg = args.find(arg => arg.startsWith('--folder='))?.split('=')[1];
const importAll = args.includes('--all');
const testMode = args.includes('--test');
const batchSizeArg = args.find(arg => arg.startsWith('--batch='))?.split('=')[1];
const batchSize = batchSizeArg ? parseInt(batchSizeArg, 10) : DEFAULT_BATCH_SIZE;

// Stats
let totalProcessed = 0;
let totalImported = 0;
let totalErrors = 0;
let foldersProcessed = 0;

/**
 * Connect to MongoDB
 */
async function connectToMongoDB() {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gmat-quiz';
    await mongoose.connect(mongoURI);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

/**
 * Get folders to process based on command line arguments
 */
function getFoldersToProcess(): string[] {
  // Debug: List all files in the exports directory
  console.log('Contents of exports directory:');
  fs.readdirSync(EXPORTS_DIR).forEach(item => {
    const itemPath = path.join(EXPORTS_DIR, item);
    const isDir = fs.statSync(itemPath).isDirectory();
    console.log(`  - ${item} ${isDir ? '(directory)' : '(file)'}`);
  });
  
  const allFolders = fs.readdirSync(EXPORTS_DIR)
    .filter(folder => {
      const isDir = fs.statSync(path.join(EXPORTS_DIR, folder)).isDirectory();
      // Also include directories that don't start with 'processed_' for our updated naming
      return isDir && (folder.startsWith('processed_') || folder.startsWith('rc_'));
    });
  
  console.log('\nFiltered folders:');
  allFolders.forEach(folder => console.log(`  - ${folder}`));

  if (importAll) {
    return allFolders;
  } else if (folderArg) {
    const matchingFolders = allFolders.filter(folder => folder.includes(folderArg));
    console.log(`\nMatching folders for "${folderArg}":`);
    matchingFolders.forEach(folder => console.log(`  - ${folder}`));
    
    if (matchingFolders.length === 0) {
      console.error(`No matching folders found for "${folderArg}"`);
      process.exit(1);
    }
    return matchingFolders;
  } else {
    console.log('\nAvailable folders:');
    allFolders.forEach(folder => console.log(`  - ${folder}`));
    console.log('\nUse --folder=NAME or --all to specify which folders to import');
    process.exit(0);
    return [];
  }
}

/**
 * Map JSON file structure to QuestionBagV2 schema
 */
function mapRCJsonToSchema(jsonData: any, folderName: string): Partial<IQuestionBagV2> {
  try {
    const source = SOURCE_FOLDER_MAP[folderName] || 'Unknown';
    
    // Extract RC number and question number from the file path or data
    const rcNumber = jsonData.rc_number || '';
    const questionNumber = jsonData.question_number || 1;
    
    // Handle missing or empty correct answer (required by schema)
    const correctAnswer = jsonData.correct_answer || 'Unknown';
    
    // Map answer statistics if available
    const answerStats = jsonData.answer_stats ? {
      a: jsonData.answer_stats.a || '',
      b: jsonData.answer_stats.b || '',
      c: jsonData.answer_stats.c || '',
      d: jsonData.answer_stats.d || '',
      e: jsonData.answer_stats.e || ''
    } : undefined;
    
    // Get the correct percentage from the right answer option
    let correctPercentage = '';
    if (jsonData.answer_stats && correctAnswer && correctAnswer.toLowerCase() !== 'unknown') {
      // Get the letter of the correct answer (typically A, B, C, D, or E)
      const correctLetter = correctAnswer.charAt(0).toLowerCase();
      // Use the percentage for that answer if available
      if (jsonData.answer_stats[correctLetter]) {
        correctPercentage = jsonData.answer_stats[correctLetter];
      }
    }
    
    // Fall back to session stats if we couldn't get the correct percentage from answer stats
    if (!correctPercentage && jsonData.session_stats && jsonData.session_stats.correct_percentage) {
      correctPercentage = jsonData.session_stats.correct_percentage;
    }
    
    // Map session statistics if available
    const sessionStats = jsonData.session_stats ? {
      difficultyLevel: jsonData.session_stats.difficulty_level || '',
      difficultyCategory: jsonData.session_stats.difficulty_category || '',
      correctTime: jsonData.session_stats.correct_time || '',
      wrongPercentage: jsonData.session_stats.wrong_percentage || '',
      wrongTime: jsonData.session_stats.wrong_time || '',
      sessionsCount: jsonData.session_stats.sessions_count || ''
    } : undefined;
    
    // Map to schema
    return {
      questionText: jsonData.question_text || '',
      questionType: 'Reading Comprehension',
      options: jsonData.options || {},
      correctAnswer: correctAnswer,
      passageText: jsonData.passage_text || '',
      rcNumber: rcNumber,
      questionNumber: questionNumber,
      source: source,
      sourceDetails: {
        url: jsonData.metadata?.source_url || ''
      },
      difficulty: jsonData.metadata?.difficulty_level || 'Medium',
      category: 'Verbal',
      tags: ['Reading Comprehension'],
      metadata: {
        topic: jsonData.metadata?.topic || '',
      },
      statistics: {
        correctPercentage: correctPercentage,
        answeredCount: parseInt(jsonData.session_stats?.sessions_count || '0', 10) || 0,
        answerStats: answerStats,
        sessionStats: sessionStats
      }
    };
  } catch (error) {
    console.error('Error mapping JSON to schema:', error);
    throw error;
  }
}

/**
 * Process a single JSON file
 */
async function processJsonFile(filePath: string, folderName: string): Promise<boolean> {
  try {
    const fileData = fs.readFileSync(filePath, 'utf8');
    const jsonData = JSON.parse(fileData);
    
    // Different mapping functions based on question type (derived from folder name)
    let mappedData: Partial<IQuestionBagV2>;
    
    if (folderName.includes('rc_')) {
      mappedData = mapRCJsonToSchema(jsonData, folderName);
    } else {
      // Add mappers for other question types (CR, DS, PS) as needed
      console.warn(`No mapper available for folder type: ${folderName}`);
      return false;
    }
    
    // Skip if no question text
    if (!mappedData.questionText) {
      console.warn(`Skipping file with no question text: ${filePath}`);
      return false;
    }
    
    // In test mode, just log the data
    if (testMode) {
      console.log(`Would import: ${JSON.stringify(mappedData, null, 2)}`);
      return true;
    }
    
    // Check if this question already exists
    const existingQuestion = await QuestionBagV2.findOne({
      questionText: mappedData.questionText,
      questionType: mappedData.questionType,
      rcNumber: mappedData.rcNumber,
      questionNumber: mappedData.questionNumber
    });
    
    if (existingQuestion) {
      console.log(`Question already exists in DB, skipping: ${filePath}`);
      return false;
    }
    
    // Create new question
    const newQuestion = new QuestionBagV2(mappedData);
    await newQuestion.save();
    return true;
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
    totalErrors++;
    return false;
  }
}

/**
 * Process a folder of JSON files with batching
 */
async function processFolder(folderName: string) {
  console.log(`\nProcessing folder: ${folderName}`);
  const folderPath = path.join(EXPORTS_DIR, folderName);
  
  // Get all JSON files in the folder
  const files = fs.readdirSync(folderPath)
    .filter(file => file.endsWith('.json'))
    .map(file => path.join(folderPath, file));
  
  console.log(`Found ${files.length} files`);
  
  // Process in batches
  const batches = [];
  for (let i = 0; i < files.length; i += batchSize) {
    batches.push(files.slice(i, i + batchSize));
  }
  
  let folderProcessed = 0;
  let folderImported = 0;
  
  // Process each batch
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`Processing batch ${i + 1}/${batches.length} (${batch.length} files)`);
    
    // Process files in batch concurrently
    const results = await Promise.all(
      batch.map(file => processJsonFile(file, folderName))
    );
    
    // Update stats
    const batchImported = results.filter(r => r).length;
    folderProcessed += batch.length;
    folderImported += batchImported;
    
    console.log(`Batch ${i + 1} complete. Imported ${batchImported}/${batch.length} files`);
  }
  
  console.log(`\nFolder ${folderName} complete:`);
  console.log(`  Processed: ${folderProcessed} files`);
  console.log(`  Imported: ${folderImported} files`);
  console.log(`  Skipped/Errors: ${folderProcessed - folderImported} files`);
  
  // Update global stats
  totalProcessed += folderProcessed;
  totalImported += folderImported;
  foldersProcessed++;
}

/**
 * Main function
 */
async function main() {
  console.log('GMAT Question Import Script');
  console.log('===========================');
  
  if (testMode) {
    console.log('Running in TEST MODE - no data will be written to the database');
  }
  
  // Connect to MongoDB (unless in test mode)
  if (!testMode) {
    await connectToMongoDB();
  }
  
  // Get folders to process
  const folders = getFoldersToProcess();
  console.log(`Will process ${folders.length} folders with batch size ${batchSize}`);
  
  // Process each folder
  for (const folder of folders) {
    await processFolder(folder);
  }
  
  // Print summary
  console.log('\n===========================');
  console.log('Import Summary:');
  console.log(`  Folders processed: ${foldersProcessed}`);
  console.log(`  Total files processed: ${totalProcessed}`);
  console.log(`  Total files imported: ${totalImported}`);
  console.log(`  Total errors: ${totalErrors}`);
  console.log('===========================');
  
  // Disconnect from MongoDB
  if (!testMode) {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
  
  process.exit(0);
}

// Run the script
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 