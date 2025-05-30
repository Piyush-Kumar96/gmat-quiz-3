import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Get JWT secret from env or use default for development
const JWT_SECRET = process.env.JWT_SECRET || 'gmat-quiz-jwt-secret-key-dev';

// Warn if using default secret in production
if (!process.env.JWT_SECRET) {
  console.warn('WARNING: Using default JWT secret. This is insecure for production!');
}

// JWT payload interface
interface JwtPayload {
  userId: string;
  email: string;
}

// Extended request interface with user data
export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

/**
 * Authentication middleware - verifies JWT token and adds user to request
 */
export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false,
        message: 'No authentication token provided' 
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid authentication token format' 
      });
    }
    
    // Verify token
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      
      // Add user info to request
      req.user = {
        userId: decoded.userId,
        email: decoded.email
      };
      
      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return res.status(401).json({ 
          success: false,
          message: 'Token expired',
          expired: true
        });
      }
      
      return res.status(401).json({ 
        success: false,
        message: 'Invalid authentication token'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Authentication error' 
    });
  }
};

/**
 * Optional authentication middleware - checks token if present but doesn't require it
 */
export const optionalAuthMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return next();
    }
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      
      req.user = {
        userId: decoded.userId,
        email: decoded.email
      };
    } catch (error) {
      // Continue without setting user if token is invalid
    }
    
    next();
  } catch (error) {
    // Continue without setting user if any error occurs
    console.error('Optional auth middleware error:', error);
    next();
  }
};
