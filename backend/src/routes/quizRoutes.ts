import { Router } from 'express';
import { PDFImporter } from '../pdfImporter';
import { QuizItem } from '../models/QuizItem';
import { UserQuiz } from '../models/UserQuiz';
import { QuestionBag } from '../models/QuestionBag';
import mongoose from 'mongoose';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware';

const router = Router();

// Define result interface to fix type errors
interface QuizResult {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  correctAnswer?: string;
  explanation?: string;
}

// Import PDF
router.post('/import-pdf', async (req: any, res) => {
  try {
    if (!req.files || !req.files.pdf) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const pdfFile = req.files.pdf;
    const type = req.body.type || 'mixed';
    const count = await PDFImporter.importPDF(pdfFile.data, type as 'questions' | 'answers' | 'mixed');
    
    res.json({ message: `Successfully imported ${count} items` });
  } catch (error) {
    console.error('PDF import error:', error);
    res.status(500).json({ error: 'Failed to import PDF' });
  }
});

// Get random quiz questions and create a new quiz
router.get('/quizzes', optionalAuthMiddleware, async (req: any, res) => {
  try {
    const count = parseInt(req.query.count as string) || 20;
    const timeLimit = parseInt(req.query.timeLimit as string) || 30;
    
    // Get random questions from the QuestionBag collection
    const questions = await QuizItem.aggregate([
      { $match: { questionText: { $exists: true } } },
      { $sample: { size: count } },
      { 
        $project: { 
          _id: 1,
          questionText: 1,
          options: 1,
          category: 1,
          questionType: 1,
          difficulty: 1,
          tags: 1
        } 
      }
    ]);

    // Create a new quiz ID
    const quizId = new mongoose.Types.ObjectId();

    // If user is authenticated, create a UserQuiz document
    if (req.user) {
      const userId = req.user._id;
      
      await UserQuiz.create({
        userId,
        quizId,
        score: 0,
        totalQuestions: questions.length,
        correctAnswers: 0,
        timeSpent: 0,
        questionTypes: [],
        questions: [],
        createdAt: new Date()
      });
    }

    res.json({
      quizId,
      questions,
      timeLimit
    });
  } catch (error) {
    console.error('Get quiz error:', error);
    res.status(500).json({ error: 'Failed to get quiz questions' });
  }
});

// Submit quiz answers (new endpoint for QuestionBag quizzes)
router.post('/quizzes/submit', optionalAuthMiddleware, async (req: any, res) => {
  try {
    const { quizId, answers, timeSpent } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({ error: 'Invalid quiz ID' });
    }

    const results: QuizResult[] = [];
    const questionTypes = new Map();
    
    // Process each answer - try QuestionBag first, then fall back to QuizItem
    for (const [questionId, answer] of Object.entries(answers)) {
      let question;
      
      // First try to find in QuestionBag
      if (mongoose.Types.ObjectId.isValid(questionId)) {
        question = await QuestionBag.findById(questionId);
      }
      
      // If not found in QuestionBag, try QuizItem
      if (!question && mongoose.Types.ObjectId.isValid(questionId)) {
        question = await QuizItem.findById(questionId);
      }
      
      if (!question) continue;

      // Use correctAnswer or fall back to answerText
      const correctAnswerValue = question.correctAnswer || question.answerText;
      const isCorrect = correctAnswerValue?.toLowerCase() === (answer as string).toLowerCase();
      
      // Track question type statistics
      const type = question.questionType || question.type || 'Unknown';
      if (!questionTypes.has(type)) {
        questionTypes.set(type, { type, total: 0, correct: 0 });
      }
      const typeStats = questionTypes.get(type);
      typeStats.total += 1;
      if (isCorrect) typeStats.correct += 1;
      
      // Add to results
      results.push({
        questionId,
        userAnswer: answer as string,
        isCorrect,
        correctAnswer: correctAnswerValue,
        explanation: question.explanation || question.explanationText || question.AI_generated_explanation || ''
      });
    }

    const score = results.filter(r => r.isCorrect).length;
    const total = results.length;
    const percentage = total > 0 ? (score / total) * 100 : 0;

    // Update the UserQuiz document if user is authenticated
    let userQuizId = null;
    if (req.user) {
      const userId = req.user._id;
      
      const userQuiz = await UserQuiz.findOneAndUpdate(
        { quizId, userId },
        {
          score,
          correctAnswers: score,
          timeSpent: timeSpent || 0,
          questionTypes: Array.from(questionTypes.values()),
          questions: results.map(r => ({
            questionId: r.questionId,
            userAnswer: r.userAnswer,
            isCorrect: r.isCorrect,
            timeSpent: Math.floor((timeSpent || 0) / total) // Estimate time per question
          }))
        },
        { new: true, upsert: true }
      );

      userQuizId = userQuiz._id;
    }

    res.json({
      quizId,
      score,
      total,
      percentage,
      results,
      userQuizId
    });
  } catch (error) {
    console.error('Submit quiz error:', error);
    res.status(500).json({ 
      error: 'Failed to submit quiz',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;