import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiResponse, AuthToken } from '../types/api';

const JWT_SECRET = process.env.JWT_SECRET || 'maifarm-secret-key-change-in-production';

export interface AuthRequest extends Request {
  user?: AuthToken;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  // Allow bypassing authentication when explicitly configured (use with caution in production)
  if (process.env.BYPASS_AUTH === 'true') {
    console.log('[AUTH] Bypassing authentication (BYPASS_AUTH=true)');
    req.user = {
      id: 'dev-user',
      email: 'dev@maifarm.local',
      role: 'admin',
      userId: 'dev-user',
      roles: ['admin'],
      permissions: ['*']
    } as AuthToken;
    return next();
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

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    // In development mode, allow bypassing authentication
    if (process.env.BYPASS_AUTH === 'true') {
      req.user = {
        id: 'dev-user',
        email: 'dev@maifarm.local',
        role: 'admin',
        userId: 'dev-user',
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

    const hasRole = roles.some(role => req.user!.roles.includes(role));
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
        id: 'dev-user',
        email: 'dev@maifarm.local',
        role: 'admin',
        userId: 'dev-user',
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