/**
 * Batch Question Processing Script
 * 
 * This script processes all questions in the database that don't have AI-generated answers yet.
 * It uses the OpenAI service to generate answers, explanations, and difficulty ratings for each question,
 * then updates the database with this information.
 * 
 * The script implements:
 * - Batch processing to reduce API calls and improve efficiency
 * - Question type grouping for more consistent processing
 * - Rate limiting to avoid OpenAI API throttling
 * - Detailed progress tracking and reporting
 * - Error handling with fallback mechanisms
 */

import mongoose from 'mongoose';
import { QuestionBag } from '../models/QuestionBag';
import { processQuestion, processBatchQuestions, getTotalTokensUsed } from '../services/openaiService';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const BATCH_SIZE = 5; // Process 5 questions at a time
const DELAY_BETWEEN_BATCHES = 5000; // 5 seconds delay between batches to avoid rate limiting

// Statistics tracking
let totalProcessed = 0;
let totalSuccess = 0;
let totalFailed = 0;
let totalBatches = 0;

/**
 * Helper function to introduce a delay between batches
 * Prevents hitting OpenAI API rate limits
 * 
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the specified time
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Main function that processes all questions in the database
 * 
 * The function:
 * 1. Connects to MongoDB
 * 2. Identifies questions that need AI-generated answers
 * 3. Groups questions by question type for more consistent processing
 * 4. Processes questions in batches for efficiency
 * 5. Updates the database with AI-generated results
 * 6. Provides detailed progress reports and final summary
 */
const processAllQuestions = async (): Promise<void> => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/gmat-quiz');
    console.log('Connected to MongoDB');
    
    // Get total count for progress reporting
    const totalCount = await QuestionBag.countDocuments();
    console.log(`Found ${totalCount} questions to process`);
    
    // Get all questions that don't have AI answers yet
    const query = { 
      $or: [
        { aiAnswer: { $exists: false } },
        { aiAnswer: null },
        { aiAnswer: '' }
      ]
    };
    
    const questionCount = await QuestionBag.countDocuments(query);
    console.log(`Found ${questionCount} questions without AI answers`);
    
    if (questionCount === 0) {
      console.log('All questions already have AI answers. Nothing to process.');
      await mongoose.disconnect();
      return;
    }
    
    // Get distinct question types for better batching
    const questionTypes = await QuestionBag.distinct('questionType');
    console.log(`Found ${questionTypes.length} different question types:`, questionTypes);
    
    // Process each question type separately for more consistent batches
    for (const questionType of questionTypes) {
      console.log(`\nProcessing questions of type: ${questionType}`);
      
      // Get questions of this type without AI answers
      const questions = await QuestionBag.find({ 
        questionType,
        $or: [
          { aiAnswer: { $exists: false } },
          { aiAnswer: null },
          { aiAnswer: '' }
        ]
      }).exec();
      
      console.log(`Found ${questions.length} ${questionType} questions to process`);
      
      // Process in batches
      const batches = [];
      for (let i = 0; i < questions.length; i += BATCH_SIZE) {
        batches.push(questions.slice(i, i + BATCH_SIZE));
      }
      
      // Process each batch
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`\nProcessing batch ${i+1} of ${batches.length} for ${questionType}`);
        
        try {
          // Prepare batch data for OpenAI
          const batchData = batch.map(q => ({
            questionText: q.questionText,
            options: q.options,
            questionType: q.questionType
          }));
          
          // Process batch
          const startTime = Date.now();
          
          // Use batch processing if more than one question, otherwise use single question processing
          const results = batch.length > 1 
            ? await processBatchQuestions(batchData)
            : [await processQuestion(batchData[0])];
          
          const processingTime = Date.now() - startTime;
          console.log(`Batch processed in ${processingTime}ms`);
          
          // Update each question with AI answer
          for (let j = 0; j < batch.length; j++) {
            if (j >= results.length) {
              console.warn(`Missing result for question ${batch[j]._id}`);
              totalFailed++;
              continue;
            }
            
            const question = batch[j];
            const result = results[j];
            
            try {
              await QuestionBag.updateOne(
                { _id: question._id },
                { 
                  $set: {
                    aiAnswer: result.aiAnswer,
                    aiExplanation: result.aiExplanation,
                    questionDifficulty: result.questionDifficulty
                  }
                }
              );
              
              console.log(`Updated question ${question._id} with answer: ${result.aiAnswer}`);
              totalSuccess++;
            } catch (error) {
              console.error(`Failed to update question ${question._id} in database`, error);
              totalFailed++;
            }
          }
          
          totalProcessed += batch.length;
          totalBatches++;
          
          // Progress report
          const progress = (totalProcessed / questionCount) * 100;
          console.log(`Progress: ${totalProcessed}/${questionCount} (${progress.toFixed(2)}%)`);
          console.log(`Token usage so far: ${getTotalTokensUsed()}`);
          
          // Delay between batches to avoid rate limiting
          if (i < batches.length - 1) {
            console.log(`Waiting ${DELAY_BETWEEN_BATCHES/1000} seconds before next batch...`);
            await sleep(DELAY_BETWEEN_BATCHES);
          }
        } catch (error) {
          console.error(`Error processing batch ${i+1}:`, error);
          totalFailed += batch.length;
        }
      }
    }
    
    // Summary
    console.log('\n======= PROCESSING SUMMARY =======');
    console.log(`Total questions processed: ${totalProcessed}`);
    console.log(`Successfully updated: ${totalSuccess}`);
    console.log(`Failed to update: ${totalFailed}`);
    console.log(`Total batches: ${totalBatches}`);
    console.log(`Total tokens used: ${getTotalTokensUsed()}`);
    
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    
  } catch (error) {
    console.error('Error in processAllQuestions:', error);
  }
};

// Run the script
processAllQuestions()
  .then(() => console.log('Processing complete'))
  .catch(err => console.error('Script failed:', err)); 