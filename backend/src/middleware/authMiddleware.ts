import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Define the JWT payload interface
interface JwtPayload {
  userId: string;
}

// Define a custom request interface that includes the user property
export interface AuthRequest extends Request {
  user?: {
    _id: string;
    userId: string;
  };
}

// Type for Express request handler that accepts AuthRequest
export type AuthRequestHandler = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => void | Promise<void> | Response;

// Middleware that requires authentication
export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ message: 'Authorization token required' });
      return;
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    
    // Add user info to request
    req.user = {
      _id: decoded.userId,
      userId: decoded.userId
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ message: 'Not authorized, invalid token' });
  }
};

// Middleware that makes authentication optional
export const optionalAuthMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    // If no token, continue without setting user
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    
    // Add user info to request
    req.user = {
      _id: decoded.userId,
      userId: decoded.userId
    };
    
    next();
  } catch (error) {
    // If token is invalid, continue without setting user
    // This makes authentication optional
    next();
  }
};
