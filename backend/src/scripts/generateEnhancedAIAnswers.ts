import mongoose from 'mongoose';
import { QuestionBag } from '../models/QuestionBag';
import openaiService, { ProcessingStats } from '../services/openaiService';
import dotenv from 'dotenv';
import pLimit from 'p-limit';

// Load environment variables
dotenv.config();

// Configure concurrency limit
const CONCURRENCY_LIMIT = 5; // Maximum number of simultaneous requests to OpenAI
const BATCH_SIZE = 5; // Number of questions to batch in a single request
const limit = pLimit(CONCURRENCY_LIMIT);

// Initialize stats
const stats: ProcessingStats = {
  totalProcessed: 0,
  totalFailed: 0,
  totalCached: 0,
  totalTokensUsed: 0
};

// Function to chunk array into batches
const chunkArray = <T>(array: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
};

// Function to process a batch of questions
const processBatch = async (questions: any[]): Promise<void> => {
  try {
    console.log(`Processing batch of ${questions.length} questions...`);
    
    // Map database questions to format needed by OpenAI service
    const questionData = questions.map(q => ({
      questionText: q.questionText,
      options: q.options,
      questionType: q.questionType
    }));
    
    // Process batch with OpenAI
    const results = await openaiService.processBatchQuestions(questionData);
    
    // Update each question in the database
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const result = results[i];
      
      await QuestionBag.updateOne(
        { _id: question._id },
        {
          $set: {
            AI_generated_correct_answer: result.aiAnswer,
            AI_generated_explanation: result.aiExplanation,
            difficulty: result.questionDifficulty
          }
        }
      );
      
      // Update stats
      stats.totalProcessed++;
    }
    
    console.log(`Successfully processed batch of ${questions.length} questions`);
  } catch (error) {
    console.error('Error processing batch:', error);
    
    // Try individual questions on batch failure
    for (const question of questions) {
      await processIndividualQuestion(question);
    }
  }
};

// Function to process an individual question
const processIndividualQuestion = async (question: any): Promise<void> => {
  try {
    console.log(`Processing individual question: ${question._id}`);
    
    const result = await openaiService.processQuestion({
      questionText: question.questionText,
      options: question.options,
      questionType: question.questionType
    });
    
    await QuestionBag.updateOne(
      { _id: question._id },
      {
        $set: {
          AI_generated_correct_answer: result.aiAnswer,
          AI_generated_explanation: result.aiExplanation,
          difficulty: result.questionDifficulty
        }
      }
    );
    
    stats.totalProcessed++;
    console.log(`Successfully processed question: ${question._id}`);
  } catch (error) {
    console.error(`Failed to process question ${question._id}:`, error);
    stats.totalFailed++;
  }
};

// Main function to process all questions
const generateEnhancedAIAnswers = async (): Promise<void> => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/gmat-quiz');
    console.log('Connected to MongoDB');
    
    // Get all questions
    const questions = await QuestionBag.find({});
    console.log(`Found ${questions.length} questions to process`);
    
    // Chunk questions into batches
    const batches = chunkArray(questions, BATCH_SIZE);
    console.log(`Created ${batches.length} batches of up to ${BATCH_SIZE} questions each`);
    
    // Process all batches with concurrency limit
    const promises = batches.map(batch => limit(() => processBatch(batch)));
    await Promise.all(promises);
    
    // Update token usage from service
    stats.totalTokensUsed = openaiService.getTotalTokensUsed();
    
    // Log final stats
    console.log('\n=== Processing Complete ===');
    console.log(`Total questions processed: ${stats.totalProcessed}`);
    console.log(`Total questions failed: ${stats.totalFailed}`);
    console.log(`Total cached responses: ${stats.totalCached}`);
    console.log(`Total tokens used: ${stats.totalTokensUsed}`);
    
    // Calculate approximate cost
    // Using rough estimation: 1K tokens cost ~$0.0015 for input and ~$0.0050 for output with o4-mini
    const estimatedCost = (stats.totalTokensUsed / 1000) * 0.003; // Average of input and output costs
    console.log(`Estimated API cost: $${estimatedCost.toFixed(2)}`);
    
    // Close MongoDB connection
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    
  } catch (error) {
    console.error('Error in generateEnhancedAIAnswers:', error);
    process.exit(1);
  }
};

// Run the script
generateEnhancedAIAnswers(); 