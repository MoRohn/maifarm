import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiResponse, AuthToken } from '../types/api';
import { logger } from '../config/logging';
import { GUEST_UUID } from '../utils/systemUuids';

const JWT_SECRET = process.env.JWT_SECRET || 'maifarm-secret-key-change-in-production';
let authBypassLogged = false; // Log bypass message only once per session

export interface AuthRequest extends Request {
  user?: AuthToken;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  // SECURITY: Only allow auth bypass in development environment
  // Never allow in production or staging
  const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  const bypassEnabled = process.env.BYPASS_AUTH === 'true';

  if (isDevelopment && bypassEnabled) {
    // Only log once per session to reduce noise
    if (!authBypassLogged) {
      logger.warn('AUTH', '⚠️ Authentication bypass enabled - DEVELOPMENT ONLY');
      authBypassLogged = true;
    }
    req.user = {
      id: GUEST_UUID,
      email: 'dev@maifarm.local',
      role: 'developer', // Changed from 'admin' to 'developer' for safety
      userId: GUEST_UUID,
      roles: ['developer'],
      permissions: ['read', 'write'] // Limited permissions, not wildcard
    } as AuthToken;
    return next();
  } else if (!isDevelopment && bypassEnabled) {
    logger.error('AUTH', '🚨 SECURITY: Attempted to bypass auth in production!');
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'SECURITY_VIOLATION',
        message: 'Authentication bypass not allowed in production'
      }
    };
    return res.status(403).json(response);
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Access token required'
      }
    };
    return res.status(401).json(response);
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthToken;
    req.user = decoded;
    next();
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token'
      }
    };
    return res.status(403).json(response);
  }
};

export const requireRole = (role: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    // SECURITY: Only allow bypass in development
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
    const bypassEnabled = process.env.BYPASS_AUTH === 'true';

    if (isDevelopment && bypassEnabled) {
      req.user = {
        id: GUEST_UUID,
        email: 'dev@maifarm.local',
        role: 'developer',
        userId: GUEST_UUID,
        roles: ['developer'],
        permissions: ['read', 'write']
      } as AuthToken;

      // In dev mode, only bypass for developer role checks
      if (role === 'admin') {
        logger.warn('AUTH', 'Admin role required - cannot bypass in development');
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access requires proper authentication'
          }
        };
        return res.status(403).json(response);
      }
      return next();
    }

    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      };
      return res.status(401).json(response);
    }

    const hasRole = req.user!.roles.includes(role);
    if (!hasRole) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions'
        }
      };
      return res.status(403).json(response);
    }

    next();
  };
};

export const requirePermission = (permissions: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    // In development mode, allow bypassing authentication
    if (process.env.BYPASS_AUTH === 'true') {
      req.user = {
        id: '00000000-0000-0000-0000-000000000000',
        email: 'dev@maifarm.local',
        role: 'admin',
        userId: '00000000-0000-0000-0000-000000000000',
        roles: ['admin'],
        permissions: ['*'] // Grant all permissions in dev mode
      } as AuthToken;
      return next();
    }

    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      };
      return res.status(401).json(response);
    }

    const hasPermission = permissions.some(permission => 
      req.user!.permissions.includes(permission) || req.user!.permissions.includes('*')
    );
    if (!hasPermission) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions'
        }
      };
      return res.status(403).json(response);
    }

    next();
  };
};

export const generateToken = (userId: string, roles: string[], permissions: string[]): string => {
  const payload: Omit<AuthToken, 'exp' | 'iat'> = {
    userId,
    roles,
    permissions
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '24h'
  });
};

export const refreshToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      }
    };
    return res.status(401).json(response);
  }

  const newToken = generateToken(req.user.userId, req.user.roles, req.user.permissions);
  res.setHeader('X-New-Token', newToken);
  next();
};