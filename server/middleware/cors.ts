import { Request, Response, NextFunction } from 'express';
import cors from 'cors';

// Allowed origins based on environment
const getAllowedOrigins = () => {
  const origins = [
    'http://localhost:3000',
    'http://localhost:3001', 
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://0.0.0.0:3000',
    'http://0.0.0.0:5173'
  ];

  // Add production origins if defined
  if (process.env.PRODUCTION_ORIGIN) {
    origins.push(process.env.PRODUCTION_ORIGIN);
  }

  // Add custom origins from environment
  if (process.env.ALLOWED_ORIGINS) {
    const customOrigins = process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
    origins.push(...customOrigins);
  }

  return origins;
};

// Custom CORS middleware that ensures single origin in response
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    const allowedOrigins = getAllowedOrigins();
    
    // Allow requests with no origin (e.g., Postman, server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is allowed
    if (allowedOrigins.includes(origin)) {
      // Return the specific origin, not a boolean
      // This ensures Access-Control-Allow-Origin has only one value
      return callback(null, origin);
    }

    // Reject unauthorized origins
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
  maxAge: 86400 // 24 hours
});

// Fallback CORS handler for edge cases
export const corsErrorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err && err.message === 'Not allowed by CORS') {
    res.status(403).json({
      success: false,
      error: {
        code: 'CORS_ERROR',
        message: 'Cross-Origin Request Blocked',
        origin: req.headers.origin
      }
    });
  } else {
    next(err);
  }
};

// WebSocket CORS validator
export const validateWebSocketOrigin = (origin: string | undefined): boolean => {
  if (!origin) return true; // Allow connections without origin header
  return getAllowedOrigins().includes(origin);
};