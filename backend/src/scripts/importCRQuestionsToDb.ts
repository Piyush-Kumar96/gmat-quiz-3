/**
 * Import CR Questions to Database Script
 * 
 * This script imports processed Critical Reasoning question JSON files into MongoDB using the QuestionBagV2 schema.
 * It supports importing by folder with batching for optimal reliability.
 * 
 * Usage:
 *   - Import specific folder: ts-node importCRQuestionsToDb.ts --folder=cr_gmatprep
 *   - Import all folders: ts-node importCRQuestionsToDb.ts --all
 *   - Test mode (no DB writes): ts-node importCRQuestionsToDb.ts --folder=cr_gmatprep --test
 *   - Custom batch size: ts-node importCRQuestionsToDb.ts --folder=cr_gmatprep --batch=50
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
  'cr_gmatprep_mistral7b_sequential': 'GMAT Prep',
  'cr_ogquestions_mistral7b_sequential': 'Official Guide'
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
      return isDir && folder.includes('cr_') && folder.includes('mistral7b_sequential');
    });
  
  console.log(`Found CR folders: ${allFolders.join(', ')}`);
  
  if (allFolders) {
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
  
  console.error('Please specify a folder with --folder=<name> or use --all to process all folders');
  process.exit(1);
}

/**
 * Map JSON file structure to QuestionBagV2 schema
 */
function mapCRJsonToSchema(jsonData: any, folderName: string): Partial<IQuestionBagV2> {
  try {
    const source = SOURCE_FOLDER_MAP[folderName] || 'Unknown';
    
    // Extract CR number from the filename or data
    // The filename is typically processed_cr_gmatprep_XX.json or processed_cr_XX.json
    let crNumber = '';
    if (jsonData.filename) {
      const match = jsonData.filename.match(/(?:processed_cr_(?:gmatprep_)?|cr_)(\d+)/);
      if (match && match[1]) {
        crNumber = match[1];
      }
    }
    
    // Handle missing or empty correct answer (required by schema)
    const correctAnswer = jsonData.correct_answer || 'Unknown';
    
    // Map answer statistics if available
    const answerStats = jsonData.answer_stats ? {
      a: jsonData.answer_stats.a || '',
      b: jsonData.answer_stats.b || '',
      c: jsonData.answer_stats.c || '',
      d: jsonData.answer_stats.d || '',
      e: jsonData.answer_stats.e || ''
    } : {};
    
    // Get the correct percentage based on the correct answer
    const correctPercentage = jsonData.answer_stats && correctAnswer.toLowerCase() in jsonData.answer_stats 
      ? jsonData.answer_stats[correctAnswer.toLowerCase()] 
      : jsonData.session_stats?.correct_percentage || '';
    
    // Map session statistics if available
    const sessionStats = jsonData.session_stats ? {
      difficultyLevel: jsonData.session_stats.difficulty || '',
      correctTime: jsonData.session_stats.correct_time || '',
      wrongPercentage: jsonData.session_stats.wrong_percentage || '',
      wrongTime: jsonData.session_stats.wrong_time || '',
      sessionsCount: jsonData.session_stats.sessions_count || ''
    } : {};
    
    // Use question stem for the question text (what the user actually has to answer)
    const questionText = jsonData.question_stem || '';
    
    // Use argument as the passage text (the context for the question)
    const passageText = jsonData.argument || '';
    
    // Get CR specific metadata
    const crType = jsonData.metadata?.cr_specific_type || '';
    const type = jsonData.metadata?.type || '';
    
    // Map to schema
    return {
      questionText: questionText,
      questionType: 'Critical Reasoning',
      options: jsonData.options || {},
      correctAnswer: correctAnswer,
      explanation: jsonData.explanation || '',
      difficulty: jsonData.metadata?.difficulty_level || jsonData.session_stats?.difficulty?.replace('Difficulty: ', '').replace(' (low)', '')?.replace(' (high)', '') || 'Medium',
      source: source,
      sourceDetails: {
        url: jsonData.metadata?.source_url || ''
      },
      category: 'Verbal',
      tags: [crType, type].filter(tag => tag !== ''),
      passageText: passageText,
      questionNumber: parseInt(crNumber) || 0,
      metadata: {
        topic: jsonData.metadata?.topic || '',
        subtopic: crType || '',
        source: jsonData.metadata?.source || source,
        type: type,
        difficultyLevel: jsonData.metadata?.difficulty_level || '',
        sourceUrl: jsonData.metadata?.source_url || '',
        crSpecificType: crType
      },
      statistics: {
        answeredCount: parseInt(jsonData.session_stats?.sessions_count || '0') || 0,
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
 * Import a batch of CR files into the database
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
        const questionData = mapCRJsonToSchema(jsonData, folderName);
        
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
      
      console.log(`Successfully imported ${documentsToInsert.length} CR questions from ${folderName}`);
    }
  } catch (error) {
    console.error(`Error importing batch: ${error}`);
    throw error;
  }
}

/**
 * Process a folder of CR files
 */
async function processFolder(folderName: string): Promise<void> {
  try {
    console.log(`Processing folder: ${folderName}`);
    
    const folderPath = path.join(EXPORTS_DIR, folderName);
    let files = fs.readdirSync(folderPath)
      .filter(file => file.endsWith('.json'));
    
    // Filter files by CR number if start and end are specified
    if (startNumber !== undefined || endNumber !== undefined) {
      files = files.filter(file => {
        const match = file.match(/(?:processed_cr_(?:gmatprep_)?|cr_)(\d+)/);
        if (!match || !match[1]) return false;
        
        const fileNumber = parseInt(match[1]);
        if (startNumber !== undefined && fileNumber < startNumber) return false;
        if (endNumber !== undefined && fileNumber > endNumber) return false;
        
        return true;
      });
    }
    
    console.log(`Found ${files.length} CR files to process in ${folderName}`);
    
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
    
    if (!testMode) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB');
    }
    
    console.log('\nCR question import complete!');
  } catch (error) {
    console.error(`Error in main function: ${error}`);
    process.exit(1);
  }
}

// Run the script
main(); 