import express from 'express';
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/User';
import { UserQuiz } from '../models/UserQuiz';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Register a new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName, targetScore, phoneNumber } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create new user
    const user = new User({
      email,
      password,
      fullName,
      ...(targetScore && { targetScore }),
      ...(phoneNumber && { phoneNumber }),
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });

    // Return user data (excluding password) and token
    const userData = {
      _id: user._id,
      email: user.email,
      fullName: user.fullName,
      targetScore: user.targetScore,
      phoneNumber: user.phoneNumber,
      createdAt: user.createdAt,
    };

    res.status(201).json({ user: userData, token });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    console.log('Login request received');
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    console.log('User found:', user);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    console.log('Password match:', isMatch);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
    console.log('Token generated:', token);
    // Return user data (excluding password) and token
    const userData = {
      _id: user._id,
      email: user.email,
      fullName: user.fullName,
      targetScore: user.targetScore,
      phoneNumber: user.phoneNumber,
      createdAt: user.createdAt,
    };

    res.json({ user: userData, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user profile with quiz performance
router.get('/profile', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Get user data
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get user's quiz performance
    const userQuizzes = await UserQuiz.find({ userId });

    // Calculate statistics
    const totalQuizzes = userQuizzes.length;
    const averageScore = totalQuizzes > 0
      ? userQuizzes.reduce((acc, quiz) => acc + quiz.score, 0) / totalQuizzes
      : 0;
    console.log('Total quizzes:', totalQuizzes);
    console.log('Average score:', averageScore);
    // // Calculate performance by question type
    // const questionTypeStats = userQuizzes.reduce((acc: any, quiz) => {
    //   if (quiz.questionTypes && Array.isArray(quiz.questionTypes)) {
    //     quiz.questionTypes.forEach((type) => {
    //       if (!acc[type.type]) {
    //         acc[type.type] = { total: 0, correct: 0 };
    //       }
    //       acc[type.type].total += type.total;
    //       acc[type.type].correct += type.correct;
    //     });
    //   }
    //   return acc;
    // }, {});

    // Format question type stats
    const formattedQuestionTypeStats = Object.entries({}).map(([type, stats]: [string, any]) => ({
      type,
      total: stats.total,
      correct: stats.correct,
      percentage: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0,
    }));

    // Return profile data
    res.json({
      user: {
        _id: user._id,
        email: user.email,
        fullName: user.fullName,
        targetScore: user.targetScore,
        phoneNumber: user.phoneNumber,
        createdAt: user.createdAt,
      },
      stats: {
        totalQuizzes,
        averageScore,
        questionTypeStats: formattedQuestionTypeStats,
      },
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;