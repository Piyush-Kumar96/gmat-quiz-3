import mongoose from 'mongoose';
import { QuestionBagV2 } from '../models/QuestionBagV2';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

/**
 * Convert options array to object with letter keys (A, B, C, D, E)
 */
const convertOptionsArrayToObject = (optionsArray: string[]): Record<string, string> => {
  const optionsObject: Record<string, string> = {};
  const letters = ['A', 'B', 'C', 'D', 'E'];
  
  optionsArray.forEach((option, index) => {
    if (index < 5 && option) {
      optionsObject[letters[index]] = option;
    }
  });
  
  return optionsObject;
};

/**
 * Update Reading Comprehension questions in the database using the extracted options and question text
 */
const main = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/gmat-quiz');
    console.log('Connected to MongoDB');
    
    // Load the JSON file with extraction results
    const jsonPath = path.join(process.cwd(), '..', 'exports', 'all_rc_options_extraction_results.json');
    if (!fs.existsSync(jsonPath)) {
      console.error(`File not found: ${jsonPath}`);
      return;
    }
    
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    console.log(`Loaded ${data.results.length} extraction results from JSON file`);
    console.log(`Original summary - AI success: ${data.summary.aiSuccessful}, Hybrid success: ${data.summary.hybridSuccessful}`);
    
    // Check for dry run mode
    const isDryRun = process.argv.includes('--dry-run');
    if (isDryRun) {
      console.log('\n===== DRY RUN MODE - No database changes will be made =====\n');
    }
    
    // Track statistics
    const stats = {
      total: data.results.length,
      updated: 0,
      skipped: 0,
      errors: 0
    };
    
    // Process each result
    for (const result of data.results) {
      try {
        const { questionId, cleanedQuestionText, aiOptions, hybridOptions, aiSuccess, hybridSuccess } = result;
        
        // Determine which options to use (you can modify this logic as needed)
        // By default, use the hybrid options if successful, otherwise use AI options
        const useHybrid = process.argv.includes('--use-hybrid');
        const useAI = process.argv.includes('--use-ai');
        const useBest = process.argv.includes('--use-best') || (!useHybrid && !useAI);
        
        let optionsArrayToUse;
        if (useHybrid) {
          optionsArrayToUse = hybridOptions;
        } else if (useAI) {
          optionsArrayToUse = aiOptions;
        } else {
          // Use the best options - hybrid if successful, otherwise AI
          optionsArrayToUse = hybridSuccess ? hybridOptions : (aiSuccess ? aiOptions : null);
        }
        
        // Only update if we have valid options
        if (optionsArrayToUse && optionsArrayToUse.filter(o => o !== '').length >= 3) {
          // Convert options from array to object with letter keys
          const optionsObjectToUse = convertOptionsArrayToObject(optionsArrayToUse);
          
          if (isDryRun) {
            // In dry run mode, fetch the question from DB and show the difference
            const question = await QuestionBagV2.findById(questionId);
            if (question) {
              console.log(`\nQuestion ID: ${questionId}`);
              console.log(`Current question text: ${question.questionText.substring(0, 100)}...`);
              console.log(`New question text: ${cleanedQuestionText.substring(0, 100)}...`);
              console.log(`Current options: ${JSON.stringify(question.options || {})}`);
              console.log(`New options: ${JSON.stringify(optionsObjectToUse)}`);
              console.log('------------------------');
            } else {
              console.log(`Question ${questionId} not found in database`);
            }
          } else {
            // Actually update the database
            await QuestionBagV2.findByIdAndUpdate(
              questionId,
              { 
                options: optionsObjectToUse,
                questionText: cleanedQuestionText 
              }
            );
          }
          
          stats.updated++;
          
          if (!isDryRun && stats.updated % 10 === 0) {
            console.log(`Updated ${stats.updated}/${stats.total} questions`);
          }
        } else {
          console.log(`Skipping question ${questionId} - insufficient options`);
          stats.skipped++;
        }
      } catch (error) {
        console.error(`Error processing question ${result.questionId}: ${error}`);
        stats.errors++;
      }
    }
    
    // Print summary
    console.log('\n======= UPDATE SUMMARY =======');
    console.log(`Total questions processed: ${stats.total}`);
    console.log(`${isDryRun ? "Would be updated" : "Updated"}: ${stats.updated}`);
    console.log(`Skipped: ${stats.skipped}`);
    console.log(`Errors: ${stats.errors}`);
    
    if (isDryRun) {
      console.log('\nThis was a dry run. No changes were made to the database.');
      console.log('To apply these changes, run the script without the --dry-run flag.');
    }
    
  } catch (error) {
    console.error('Error in update process:', error);
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

/**
 * Print usage information
 */
const printUsage = () => {
  console.log(`
Usage: ts-node src/scripts/updateRCQuestionsFromJson.ts [options]

Options:
  --use-hybrid    Use only hybrid extraction results
  --use-ai        Use only AI extraction results
  --use-best      Use the best available results (hybrid if successful, otherwise AI) - DEFAULT
  --dry-run       Show what would be updated without making changes
  --help          Show this help message
  
Examples:
  ts-node src/scripts/updateRCQuestionsFromJson.ts
  ts-node src/scripts/updateRCQuestionsFromJson.ts --use-ai
  ts-node src/scripts/updateRCQuestionsFromJson.ts --use-hybrid
  ts-node src/scripts/updateRCQuestionsFromJson.ts --dry-run
`);
};

// Check for help flag
if (process.argv.includes('--help')) {
  printUsage();
} else {
  // Handle dry run mode
  if (process.argv.includes('--dry-run')) {
    console.log('DRY RUN MODE - No database changes will be made');
    // In a real implementation, you'd modify the code to simulate updates
  }
  
  // Run the script
  main();
} 