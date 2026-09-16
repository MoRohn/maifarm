import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiResponse, AuthToken } from '../types/api';
import { logger } from '../config/logging';
import { SYSTEM_UUIDS } from '../utils/systemUuids';

// CRITICAL SECURITY: Require JWT_SECRET in production, fail startup if not set
const JWT_SECRET = process.env.JWT_SECRET;
const isProduction = process.env.NODE_ENV === 'production';

if (!JWT_SECRET && isProduction) {
  console.error('🚨 CRITICAL SECURITY ERROR: JWT_SECRET must be set in production!');
  console.error('Set JWT_SECRET environment variable before starting the server.');
  process.exit(1);
}

// Use a development-only fallback for convenience in dev/test environments
const SECRET = JWT_SECRET || 'dev-only-secret-DO-NOT-USE-IN-PRODUCTION';

export interface AuthRequest extends Request {
  user?: AuthToken;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  // Development mode: allow guest access with full permissions
  // This enables iOS "Continue as Guest" to work during development
  if (!token && !isProduction) {
    req.user = {
      userId: SYSTEM_UUIDS.DEV_USER,
      email: 'dev@maifarm.local',
      roles: ['user', 'admin'],
      permissions: ['*'], // Full permissions in dev mode
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400 * 365 // 1 year
    };
    return next();
  }

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
    const decoded = jwt.verify(token, SECRET) as AuthToken;
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

    const userPermissions = req.user!.permissions || [];
    const hasPermission = permissions.some(permission =>
      userPermissions.includes(permission) || userPermissions.includes('*')
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

  return jwt.sign(payload, SECRET, {
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