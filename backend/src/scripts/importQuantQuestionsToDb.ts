/**
 * Import Quant Questions to Database Script
 * 
 * This script imports processed Quantitative (PS and DS) question JSON files into MongoDB using the QuestionBagV2 schema.
 * It supports importing by folder with batching for optimal reliability.
 * 
 * Usage:
 *   - Import specific folder: ts-node importQuantQuestionsToDb.ts --folder=quant_exampacks
 *   - Import all folders: ts-node importQuantQuestionsToDb.ts --all
 *   - Test mode (no DB writes): ts-node importQuantQuestionsToDb.ts --folder=quant_exampacks --test
 *   - Custom batch size: ts-node importQuantQuestionsToDb.ts --folder=quant_exampacks --batch=50
 */

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { QuestionBagV2, IQuestionBagV2 } from '../models/QuestionBagV2';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Configuration
const EXPORTS_DIR = path.join(__dirname, '../../exports');
const DEFAULT_BATCH_SIZE = 20;
const SOURCE_FOLDER_MAP: Record<string, string> = {
  'quant_exampacks_mistral7b': 'Exam Packs'
};

// Command line arguments
const args = process.argv.slice(2);
const testMode = args.includes('--test');
const allFolders = args.includes('--all');
const folderArg = args.find(arg => arg.startsWith('--folder='))?.split('=')[1];
const batchSizeArg = args.find(arg => arg.startsWith('--batch='))?.split('=')[1];
const batchSize = batchSizeArg ? parseInt(batchSizeArg) : DEFAULT_BATCH_SIZE;
const startArg = args.find(arg => arg.startsWith('--start='))?.split('=')[1];
const endArg = args.find(arg => arg.startsWith('--end='))?.split('=')[1];
const startNumber = startArg ? parseInt(startArg) : undefined;
const endNumber = endArg ? parseInt(endArg) : undefined;

// Stats tracking
let totalFiles = 0;
let successfulImports = 0;
let skippedFiles = 0;
let errorCount = 0;
let folderStats: Record<string, number> = {};
let typeStats: Record<string, number> = {};

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
  
  // Only include quant_exampacks_mistral7b folder
  const allFolders = fs.readdirSync(EXPORTS_DIR)
    .filter(folder => {
      const isDir = fs.statSync(path.join(EXPORTS_DIR, folder)).isDirectory();
      return isDir && folder === 'quant_exampacks_mistral7b';
    });
  
  console.log(`Found Quant folders: ${allFolders.join(', ')}`);
  
  if (allFolders.length > 0) {
    return allFolders;
  }
  
  if (folderArg) {
    // Find the best match for the folder argument
    const matchingFolder = allFolders.find(f => f.includes(folderArg));
    if (matchingFolder) {
      return [matchingFolder];
    } else {
      console.error(`Folder ${folderArg} not found. Available folders: ${allFolders.join(', ')}`);
      process.exit(1);
    }
  }
  
  console.error('No valid quant folders found');
  process.exit(1);
}

/**
 * Map JSON file structure to QuestionBagV2 schema
 */
function mapQuantJsonToSchema(jsonData: any, folderName: string): Partial<IQuestionBagV2> {
  try {
    const source = SOURCE_FOLDER_MAP[folderName] || 'Unknown';
    
    // Extract question number from the filename or data
    const questionNumber = jsonData.question_number ? parseInt(jsonData.question_number) : 0;
    
    // Determine question type (PS or DS)
    const questionType = jsonData.metadata?.type === 'DS' ? 
      'Data Sufficiency' : 
      (jsonData.metadata?.type === 'PS' ? 'Problem Solving' : jsonData.analysis?.question_type || 'Problem Solving');
    
    // Handle PS vs DS differences
    const options = jsonData.analysis?.options || {};
    
    // Handle missing or empty correct answer (required by schema)
    const correctAnswer = jsonData.analysis?.correct_answer || 'Unknown';
    
    // Map answer statistics if available
    const answerStats = jsonData.analysis?.answer_stats ? {
      a: jsonData.analysis.answer_stats.a || '',
      b: jsonData.analysis.answer_stats.b || '',
      c: jsonData.analysis.answer_stats.c || '',
      d: jsonData.analysis.answer_stats.d || '',
      e: jsonData.analysis.answer_stats.e || ''
    } : {};
    
    // Get the correct percentage based on the correct answer
    const correctPercentage = jsonData.analysis?.answer_stats && correctAnswer.toLowerCase() in jsonData.analysis.answer_stats 
      ? jsonData.analysis.answer_stats[correctAnswer.toLowerCase()] 
      : jsonData.analysis?.session_stats?.correct_percentage || '';
    
    // Map session statistics if available
    const sessionStats = jsonData.analysis?.session_stats ? {
      difficultyLevel: jsonData.analysis.session_stats.difficulty || '',
      correctTime: jsonData.analysis.session_stats.correct_time || '',
      wrongPercentage: jsonData.analysis.session_stats.wrong_percentage || '',
      wrongTime: jsonData.analysis.session_stats.wrong_time || '',
      sessionsCount: jsonData.analysis.session_stats.sessions_count || ''
    } : {};
    
    // Determine difficulty
    const difficulty = jsonData.metadata?.difficulty_level || 
                      (jsonData.analysis?.session_stats?.difficulty || '')
                        .replace('Difficulty: ', '')
                        .replace(' (low)', '')
                        .replace(' (high)', '')
                        .replace(' (medium)', '') || 
                      'Medium';
    
    // Extract topic and subtopic
    const topic = jsonData.metadata?.topic || '';
    
    // Map to schema
    return {
      questionText: jsonData.analysis?.question || '',
      questionType: questionType,
      options: options,
      correctAnswer: correctAnswer,
      explanation: jsonData.analysis?.explanation || '',
      difficulty: difficulty,
      source: source,
      sourceDetails: {
        url: jsonData.source_url || ''
      },
      category: 'Quantitative',
      tags: [topic, questionType].filter(tag => tag !== ''),
      questionNumber: questionNumber,
      metadata: {
        topic: topic,
        subtopic: '',
        source: jsonData.metadata?.source || source,
        type: jsonData.metadata?.type || '',
        difficultyLevel: jsonData.metadata?.difficulty_level || '',
        sourceUrl: jsonData.source_url || ''
      },
      statistics: {
        answeredCount: parseInt(jsonData.analysis?.session_stats?.sessions_count || '0') || 0,
        correctPercentage: correctPercentage,
        answerStats: answerStats,
        sessionStats: sessionStats
      }
    };
  } catch (error) {
    console.error(`Error mapping JSON to schema: ${error}`);
    throw error;
  }
}

/**
 * Import a batch of Quant files into the database
 */
async function importBatch(files: string[], folderName: string): Promise<void> {
  try {
    console.log(`Processing batch of ${files.length} files from ${folderName}`);
    
    const documentsToInsert: Partial<IQuestionBagV2>[] = [];
    
    for (const file of files) {
      const filePath = path.join(EXPORTS_DIR, folderName, file);
      
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(fileContent);
        
        // Add filename to jsonData for reference (useful for extracting question number)
        jsonData.filename = file;
        
        // Map JSON to schema
        const questionData = mapQuantJsonToSchema(jsonData, folderName);
        
        // Track question type statistics
        const questionType = questionData.questionType || 'Unknown';
        typeStats[questionType] = (typeStats[questionType] || 0) + 1;
        
        if (testMode) {
          console.log(`Test mode: Would import ${file} as:`, JSON.stringify(questionData, null, 2).substring(0, 300) + '...');
          successfulImports++;
          totalFiles++;
          folderStats[folderName] = (folderStats[folderName] || 0) + 1;
        } else {
          documentsToInsert.push(questionData);
        }
      } catch (error) {
        console.error(`Error processing file ${file}: ${error}`);
        errorCount++;
        totalFiles++;
      }
    }
    
    if (!testMode && documentsToInsert.length > 0) {
      // Insert the batch
      await QuestionBagV2.insertMany(documentsToInsert);
      
      // Update stats
      successfulImports += documentsToInsert.length;
      totalFiles += files.length;
      folderStats[folderName] = (folderStats[folderName] || 0) + documentsToInsert.length;
      
      console.log(`Successfully imported ${documentsToInsert.length} Quant questions from ${folderName}`);
    }
  } catch (error) {
    console.error(`Error importing batch: ${error}`);
    throw error;
  }
}

/**
 * Process a folder of Quant files
 */
async function processFolder(folderName: string): Promise<void> {
  try {
    console.log(`Processing folder: ${folderName}`);
    
    const folderPath = path.join(EXPORTS_DIR, folderName);
    let files = fs.readdirSync(folderPath)
      .filter(file => file.endsWith('.json') && !file.includes('all_processed_questions'));
    
    // Filter files by question number if start and end are specified
    if (startNumber !== undefined || endNumber !== undefined) {
      files = files.filter(file => {
        const match = file.match(/processed_(\d+)\.json/);
        if (!match || !match[1]) return false;
        
        const fileNumber = parseInt(match[1]);
        if (startNumber !== undefined && fileNumber < startNumber) return false;
        if (endNumber !== undefined && fileNumber > endNumber) return false;
        
        return true;
      });
    }
    
    console.log(`Found ${files.length} Quant files to process in ${folderName}`);
    
    // Process files in batches
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      await importBatch(batch, folderName);
    }
    
    console.log(`Completed processing folder: ${folderName}`);
  } catch (error) {
    console.error(`Error processing folder ${folderName}: ${error}`);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Connect to MongoDB
    if (!testMode) {
      if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI environment variable is not set.');
        process.exit(1);
      }
      
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('Connected to MongoDB');
    } else {
      console.log('Test mode: Not connecting to MongoDB');
    }
    
    const folders = getFoldersToProcess();
    console.log(`Processing folders: ${folders.join(', ')}`);
    
    const startTime = Date.now();
    
    // Process each folder
    for (const folder of folders) {
      await processFolder(folder);
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Print summary
    console.log('\n----- Import Summary -----');
    console.log(`Total files processed: ${totalFiles}`);
    console.log(`Successfully imported: ${successfulImports}`);
    console.log(`Skipped files: ${skippedFiles}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Duration: ${duration} seconds`);
    
    console.log('\nFolder breakdown:');
    for (const [folder, count] of Object.entries(folderStats)) {
      console.log(`  ${folder}: ${count} questions`);
    }
    
    console.log('\nQuestion type breakdown:');
    for (const [type, count] of Object.entries(typeStats)) {
      console.log(`  ${type}: ${count} questions`);
    }
    
    if (!testMode) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB');
    }
    
    console.log('\nQuant question import complete!');
  } catch (error) {
    console.error(`Error in main function: ${error}`);
    process.exit(1);
  }
}

// Run the script
main(); 