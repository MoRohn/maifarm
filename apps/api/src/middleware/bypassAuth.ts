import { Request, Response, NextFunction } from 'express';
import { AuthToken } from '../types/api';

export interface AuthRequest extends Request {
  user?: AuthToken;
}

/**
 * DEPRECATED: Authentication bypass has been removed for security
 * This file is kept for backward compatibility but does nothing
 */
export const bypassAuthMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  // REMOVED: Bypass authentication logic
  // All requests must authenticate properly
  next();
};

/**
 * DEPRECATED: Always returns false
 */
export const isBypassEnabled = (): boolean => {
  return false;
};
