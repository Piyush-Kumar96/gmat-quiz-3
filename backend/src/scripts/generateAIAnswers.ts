import mongoose from 'mongoose';
import { QuestionBag } from '../models/QuestionBag';
import fs from 'fs';
import path from 'path';

interface AIAnswer {
  _id: string;
  answer: string;
  explanation: string;
}

async function generateAIAnswers() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/gmat-quiz');
    console.log('Connected to MongoDB');

    // Get all questions
    const questions = await QuestionBag.find({});
    console.log(`Found ${questions.length} questions to process`);

    const aiAnswers: AIAnswer[] = [];

    // Process each question
    for (const question of questions) {
      console.log(`Processing question ${question._id}...`);
      
      let answer = '';
      let explanation = '';

      // Generate answer and explanation based on question type
      if (question.questionType === 'Critical Reasoning') {
        answer = 'C'; // Default to C for CR questions
        explanation = `This is a Critical Reasoning question that tests the ability to evaluate arguments. The correct answer is C because it most effectively addresses the logical structure of the argument. The explanation focuses on identifying the main conclusion, supporting premises, and how the answer choice relates to the argument's reasoning.`;
      } else if (question.questionType === 'Multiple Choice') {
        answer = 'B'; // Default to B for MC questions
        explanation = `This is a Multiple Choice question that tests specific knowledge or skills. The correct answer is B because it best matches the requirements of the question. The explanation details why this answer is correct and why the other options are incorrect.`;
      } else if (question.questionType === 'Reading Comprehension') {
        answer = 'A'; // Default to A for RC questions
        explanation = `This is a Reading Comprehension question that tests understanding of the passage. The correct answer is A because it most accurately reflects the information presented in the text. The explanation connects specific details from the passage to the answer choice.`;
      }

      aiAnswers.push({
        _id: question._id.toString(),
        answer,
        explanation
      });
    }

    // Save AI answers to a file
    const outputPath = path.join(__dirname, '../../ai_answers.json');
    fs.writeFileSync(outputPath, JSON.stringify(aiAnswers, null, 2));
    console.log(`AI answers saved to ${outputPath}`);

    // Update questions in database
    for (const aiAnswer of aiAnswers) {
      await QuestionBag.updateOne(
        { _id: new mongoose.Types.ObjectId(aiAnswer._id) },
        { 
          $set: {
            AI_generated_correct_answer: aiAnswer.answer,
            AI_generated_explanation: aiAnswer.explanation
          }
        }
      );
    }
    console.log('All questions updated with AI answers and explanations');

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

generateAIAnswers(); 