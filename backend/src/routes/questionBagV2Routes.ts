import express from 'express';
import mongoose from 'mongoose';
import { QuestionBagV2 } from '../models/QuestionBagV2';

const router = express.Router();

/**
 * Transform QuestionBagV2 document to format expected by frontend
 */
const transformQuestionForFrontend = (question: any) => {
  // Convert options object to array format for frontend compatibility
  const transformedQuestion = {
    ...question.toObject ? question.toObject() : question,
    options: Object.entries(question.options || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([_, text]) => text)
  };
  
  return transformedQuestion;
};

// Get all questions with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    
    // Apply filters if provided
    const filter: any = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.questionType) filter.questionType = req.query.questionType;
    if (req.query.difficulty) filter.difficulty = req.query.difficulty;
    
    console.log('Fetching questions with filter:', filter);
    
    const questions = await QuestionBagV2.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
      
    const total = await QuestionBagV2.countDocuments(filter);
    
    console.log(`Found ${questions.length} questions, total: ${total}`);
    
    // Transform questions for frontend
    const transformedQuestions = questions.map(transformQuestionForFrontend);
    
    res.json({
      questions: transformedQuestions,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ message: 'Failed to fetch questions', error });
  }
});

// Get random questions for a quiz
router.post('/random', async (req, res) => {
  try {
    const { count = 20, timeLimit = 30, filters = {} } = req.body;
    
    console.log('Fetching random questions with filter:', filters);
    
    // Create a filter object based on provided filters
    const filter: any = {};
    if (filters.category) filter.category = filters.category;
    if (filters.questionType) filter.questionType = filters.questionType;
    if (filters.difficulty) filter.difficulty = filters.difficulty;
    
    // Final array to hold our quiz questions
    let finalQuestions = [];
    
    // Step 1: First, get all Reading Comprehension passages with at least 3 questions
    const rcGroups = await QuestionBagV2.aggregate([
      { $match: { questionType: 'Reading Comprehension', rcNumber: { $exists: true, $ne: null } } },
      { $group: { _id: '$rcNumber', count: { $sum: 1 }, questions: { $push: '$$ROOT' } } },
      { $match: { count: { $gte: 3 } } }, // Only passages with at least 3 questions
      { $sample: { size: Math.ceil(count / 4) } } // Select a few RC passages randomly
    ]);
    
    console.log(`Found ${rcGroups.length} RC passages with at least 3 questions`);
    
    // Step 2: For each RC passage, add 3-5 questions (or as many as available, but max 5)
    let rcQuestionsAdded = 0;
    for (const group of rcGroups) {
      // If we already have enough questions, break
      if (finalQuestions.length + 3 > count) break;
      
      // Take 3-5 questions from this passage
      const questionsToTake = Math.min(
        Math.floor(Math.random() * 3) + 3, // Random number between 3-5
        group.questions.length, // Don't exceed available questions
        5 // Maximum 5 questions per passage
      );
      
      // Sort by question number if available
      const sortedQuestions = group.questions
        .sort((a: any, b: any) => (a.questionNumber || 0) - (b.questionNumber || 0))
        .slice(0, questionsToTake);
      
      finalQuestions = [...finalQuestions, ...sortedQuestions];
      rcQuestionsAdded += sortedQuestions.length;
      
      console.log(`Added ${sortedQuestions.length} questions from RC passage ${group._id}`);
    }
    
    // Step 3: Fill the remaining slots with other question types
    const remainingCount = count - finalQuestions.length;
    if (remainingCount > 0) {
      // Exclude RC questions we've already added
      const rcNumbers = finalQuestions
        .filter((q: any) => q.questionType === 'Reading Comprehension')
        .map((q: any) => q.rcNumber);
      
      const nonRcFilter = {
        ...filter,
        $or: [
          { questionType: { $ne: 'Reading Comprehension' } },
          { rcNumber: { $nin: rcNumbers } }
        ]
      };
      
      const remainingQuestions = await QuestionBagV2.aggregate([
        { $match: nonRcFilter },
        { $sample: { size: remainingCount } }
      ]);
      
      console.log(`Added ${remainingQuestions.length} non-RC questions to complete the quiz`);
      
      finalQuestions = [...finalQuestions, ...remainingQuestions];
    }
    
    // Generate a unique quiz ID
    const quizId = new mongoose.Types.ObjectId().toString();
    
    // Transform questions for frontend
    const transformedQuestions = finalQuestions.map(transformQuestionForFrontend);
    
    console.log(`Created quiz with ${transformedQuestions.length} questions (${rcQuestionsAdded} RC questions)`);
    
    res.json({
      quizId,
      questions: transformedQuestions,
      timeLimit
    });
  } catch (error) {
    console.error('Error fetching random questions:', error);
    res.status(500).json({ message: 'Failed to fetch random questions', error });
  }
});

// Get a question by ID
router.get('/:id', async (req, res) => {
  try {
    const question = await QuestionBagV2.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }
    
    // Transform question for frontend
    const transformedQuestion = transformQuestionForFrontend(question);
    
    res.json(transformedQuestion);
  } catch (error) {
    console.error('Error fetching question:', error);
    res.status(500).json({ message: 'Failed to fetch question', error });
  }
});

// Update a question by ID
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    console.log(`Updating question ${id} with data:`, updateData);
    
    const question = await QuestionBagV2.findById(id);
    
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }
    
    // Update the question
    const updatedQuestion = await QuestionBagV2.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );
    
    // Transform the question for frontend
    const transformedQuestion = transformQuestionForFrontend(updatedQuestion);
    
    console.log('Question updated successfully');
    res.json(transformedQuestion);
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({ message: 'Failed to update question', error });
  }
});

// Delete a question by ID
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`Deleting question ${id}`);
    
    const question = await QuestionBagV2.findById(id);
    
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }
    
    // Delete the question
    await QuestionBagV2.findByIdAndDelete(id);
    
    console.log('Question deleted successfully');
    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ message: 'Failed to delete question', error });
  }
});

export default router; 