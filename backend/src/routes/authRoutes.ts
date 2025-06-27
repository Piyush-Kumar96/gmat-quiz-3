import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User, IUser } from '../models/User';
import { UserQuiz } from '../models/UserQuiz';
import { RefreshToken } from '../models/RefreshToken';
import { authenticateToken, AuthRequest } from '../middleware/roleAuth';

const router = express.Router();

// Ensure JWT secrets are properly set - use fallback values for development
const JWT_SECRET = process.env.JWT_SECRET || 'development-jwt-secret-do-not-use-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'development-refresh-secret-do-not-use-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '1h';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
  console.warn('WARNING: Using default JWT secrets. This is insecure for production!');
}

// Helper function to generate tokens
const generateTokens = async (userId: string, deviceInfo?: string) => {
  // Create access token
  const accessToken = jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );

  // Create refresh token
  const refreshTokenString = crypto.randomBytes(40).toString('hex');
  
  // Calculate expiry date
  const refreshExpiry = new Date();
  refreshExpiry.setDate(refreshExpiry.getDate() + 7); // 7 days from now
  
  // Create and save refresh token in database
  const refreshToken = new RefreshToken({
    userId,
    token: refreshTokenString,
    expiresAt: refreshExpiry,
    deviceInfo
  });
  
  await refreshToken.save();
  
  return {
    accessToken,
    refreshToken: refreshTokenString,
    refreshTokenExpiry: refreshExpiry
  };
};

// Register a new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName, targetScore, phoneNumber, subscriptionPlan } = req.body;
    const deviceInfo = req.headers['user-agent'] || '';

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Determine role and limits based on subscription plan
    let role = 'registered';
    let mockTestLimit = 2;
    let planEndDate;

    if (subscriptionPlan === 'monthly_pack') {
      role = 'monthly_pack';
      mockTestLimit = -1; // Unlimited
      planEndDate = new Date();
      planEndDate.setMonth(planEndDate.getMonth() + 1);
    } else if (subscriptionPlan === 'quarterly_pack') {
      role = 'quarterly_pack';
      mockTestLimit = -1; // Unlimited
      planEndDate = new Date();
      planEndDate.setMonth(planEndDate.getMonth() + 3);
    } else if (subscriptionPlan === 'annual_pack') {
      role = 'annual_pack';
      mockTestLimit = -1; // Unlimited
      planEndDate = new Date();
      planEndDate.setFullYear(planEndDate.getFullYear() + 1);
    }

    // Create new user
    const user = new User({
      email,
      password,
      fullName,
      role,
      subscriptionPlan: subscriptionPlan || 'free_mock',
      planInfo: {
        plan: subscriptionPlan || 'free_mock',
        startDate: new Date(),
        endDate: planEndDate,
        isActive: true,
      },
      mockTestLimit,
      ...(targetScore && { targetScore }),
      ...(phoneNumber && { phoneNumber }),
    });

    await user.save();

    // Generate tokens
    const { accessToken, refreshToken, refreshTokenExpiry } = await generateTokens(
      user._id.toString(),
      deviceInfo
    );

    // Return user data (excluding password) and tokens
    const userData = {
      _id: user._id,
      email: user.email,
      fullName: user.fullName,
      targetScore: user.targetScore,
      phoneNumber: user.phoneNumber,
      role: user.role,
      subscriptionPlan: user.subscriptionPlan,
      planInfo: user.planInfo,
      mockTestsUsed: user.mockTestsUsed,
      mockTestLimit: user.mockTestLimit,
      resetInfo: user.resetInfo,
      createdAt: user.createdAt,
    };

    // Set cookies for tokens - more secure than localStorage
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: refreshTokenExpiry
    });

    res.status(201).json({ 
      user: userData, 
      token: accessToken,
      expiresIn: JWT_EXPIRY
    });
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
    const deviceInfo = req.headers['user-agent'] || '';

    // Find user by email
    const user = await User.findOne({ email });
    console.log('User found:', user ? 'Yes' : 'No');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    console.log('Password match:', isMatch);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate tokens
    const { accessToken, refreshToken, refreshTokenExpiry } = await generateTokens(
      user._id.toString(),
      deviceInfo
    );
    
    console.log('Token generated:', accessToken ? 'Yes' : 'No');
    
    // Return user data (excluding password) and token
    const userData = {
      _id: user._id,
      email: user.email,
      fullName: user.fullName,
      targetScore: user.targetScore,
      phoneNumber: user.phoneNumber,
      role: user.role,
      subscriptionPlan: user.subscriptionPlan,
      planInfo: user.planInfo,
      mockTestsUsed: user.mockTestsUsed,
      mockTestLimit: user.mockTestLimit,
      resetInfo: user.resetInfo,
      createdAt: user.createdAt,
    };

    // Set cookies for tokens - more secure than localStorage
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: refreshTokenExpiry
    });

    res.json({ 
      user: userData, 
      token: accessToken,
      expiresIn: JWT_EXPIRY
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Refresh token endpoint to get a new access token
router.post('/refresh-token', async (req, res) => {
  try {
    // Get refresh token from cookie or request body
    const refreshTokenString = req.cookies?.refreshToken || req.body?.refreshToken;
    
    if (!refreshTokenString) {
      return res.status(401).json({
        message: 'Authentication failed',
        details: 'Refresh token is required'
      });
    }
    
    // Find the token in the database
    const refreshTokenDoc = await RefreshToken.findOne({
      token: refreshTokenString,
      revoked: false,
      expiresAt: { $gt: new Date() }
    });
    
    if (!refreshTokenDoc) {
      return res.status(401).json({
        message: 'Authentication failed',
        details: 'Invalid or expired refresh token'
      });
    }
    
    // Get user
    const user = await User.findById(refreshTokenDoc.userId);
    
    if (!user) {
      return res.status(401).json({
        message: 'Authentication failed',
        details: 'User not found'
      });
    }
    
    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken, refreshTokenExpiry } = await generateTokens(
      user._id.toString(),
      req.headers['user-agent'] || ''
    );
    
    // Revoke the old refresh token
    refreshTokenDoc.revoked = true;
    refreshTokenDoc.revokedAt = new Date();
    refreshTokenDoc.replacedByToken = newRefreshToken;
    await refreshTokenDoc.save();
    
    // Set cookie with new refresh token
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: refreshTokenExpiry
    });
    
    // Return new access token
    res.json({
      token: accessToken,
      expiresIn: JWT_EXPIRY
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Logout endpoint - revoke the refresh token
router.post('/logout', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const refreshTokenString = req.cookies.refreshToken || req.body.refreshToken;
    
    if (refreshTokenString) {
      // Find and revoke the refresh token
      const refreshTokenDoc = await RefreshToken.findOne({
        token: refreshTokenString,
        revoked: false
      });
      
      if (refreshTokenDoc) {
        refreshTokenDoc.revoked = true;
        refreshTokenDoc.revokedAt = new Date();
        await refreshTokenDoc.save();
      }
      
      // Clear the refresh token cookie
      res.clearCookie('refreshToken');
    }
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user profile with quiz performance
router.get('/profile', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.userId;
    
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
    
    // Return complete profile data including role-based information
    res.json({
      user: {
        _id: user._id,
        email: user.email,
        fullName: user.fullName,
        targetScore: user.targetScore,
        phoneNumber: user.phoneNumber,
        role: user.role,
        subscriptionPlan: user.subscriptionPlan,
        planInfo: user.planInfo,
        mockTestsUsed: user.mockTestsUsed,
        mockTestLimit: user.mockTestLimit,
        resetInfo: user.resetInfo,
        createdAt: user.createdAt,
      },
      stats: {
        totalQuizzes,
        averageScore,
        // Additional stats would go here
      },
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;