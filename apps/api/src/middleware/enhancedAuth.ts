import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiResponse, AuthToken } from '../types/api';
import { securityConfig } from '../config/security';
import { logger } from '../utils/logger';
import { RateLimiterMemory } from 'rate-limiter-flexible';

export interface AuthRequest extends Request {
  user?: AuthToken;
  csrfToken?: string;
}

// Rate limiter for failed auth attempts
const authRateLimiter = new RateLimiterMemory({
  points: 5, // 5 attempts
  duration: 900, // per 15 minutes
  blockDuration: 900 // block for 15 minutes
});

/**
 * Enhanced authentication middleware with proper security
 */
export const authenticateToken = async (
  req: AuthRequest, 
  res: Response, 
  next: NextFunction
) => {
  try {
    // Check if bypass is enabled (development only)
    if (securityConfig.isBypassAuthEnabled()) {
      logger.debug('[Auth] Bypassing authentication (development mode)');
      req.user = {
        id: '00000000-0000-0000-0000-000000000000',
        email: 'dev@maifarm.local',
        role: 'admin',
        userId: '00000000-0000-0000-0000-000000000000',
        roles: ['admin'],
        permissions: ['*']
      } as AuthToken;
      return next();
    }

    // Extract token from header
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

    // Check rate limit
    const clientIp = req.ip || 'unknown';
    try {
      await authRateLimiter.consume(clientIp);
    } catch {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'RATE_LIMIT',
          message: 'Too many authentication attempts'
        }
      };
      return res.status(429).json(response);
    }

    // Verify token
    const jwtSecret = securityConfig.getJwtSecret();
    const decoded = jwt.verify(token, jwtSecret) as AuthToken;
    
    // Additional validation
    if (!decoded.userId || !securityConfig.isValidUuid(decoded.userId)) {
      throw new Error('Invalid token structure');
    }

    // Check token expiration
    if (decoded.exp && decoded.exp < Date.now() / 1000) {
      throw new Error('Token expired');
    }

    req.user = decoded;
    
    // Reset rate limit on successful auth
    await authRateLimiter.delete(clientIp);
    
    next();

  } catch (err) {
    logger.warn(`[Auth] Authentication failed: ${err}`);
    
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

/**
 * Require specific role
 */
export const requireRole = (role: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (securityConfig.isBypassAuthEnabled()) {
      req.user = {
        id: '00000000-0000-0000-0000-000000000000',
        email: 'dev@maifarm.local',
        role: 'admin',
        userId: '00000000-0000-0000-0000-000000000000',
        roles: ['admin'],
        permissions: ['*']
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

    const hasRole = req.user.roles.includes(role) || req.user.roles.includes('admin');
    if (!hasRole) {
      logger.warn(`[Auth] User ${req.user.userId} lacks required role: ${role}`);
      
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

/**
 * Require specific permissions
 */
export const requirePermission = (permissions: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (securityConfig.isBypassAuthEnabled()) {
      req.user = {
        id: '00000000-0000-0000-0000-000000000000',
        email: 'dev@maifarm.local',
        role: 'admin',
        userId: '00000000-0000-0000-0000-000000000000',
        roles: ['admin'],
        permissions: ['*']
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
      req.user!.permissions.includes(permission) || 
      req.user!.permissions.includes('*')
    );
    
    if (!hasPermission) {
      logger.warn(`[Auth] User ${req.user.userId} lacks required permissions: ${permissions.join(', ')}`);
      
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

/**
 * CSRF protection middleware
 */
export const validateCsrfToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  // Skip CSRF for GET requests and in development with bypass
  if (req.method === 'GET' || securityConfig.isBypassAuthEnabled()) {
    return next();
  }

  const csrfToken = req.headers['x-csrf-token'] as string;
  const sessionCsrf = req.session?.csrfToken;

  if (!csrfToken || !sessionCsrf || !securityConfig.validateCsrfToken(csrfToken, sessionCsrf)) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'CSRF_ERROR',
        message: 'Invalid CSRF token'
      }
    };
    return res.status(403).json(response);
  }

  next();
};

/**
 * Generate JWT token
 */
export const generateToken = (
  userId: string, 
  roles: string[], 
  permissions: string[]
): string => {
  // Validate inputs
  if (!securityConfig.isValidUuid(userId)) {
    throw new Error('Invalid user ID format');
  }

  const payload: Omit<AuthToken, 'exp' | 'iat'> = {
    userId,
    roles,
    permissions
  };

  const jwtSecret = securityConfig.getJwtSecret();
  
  return jwt.sign(payload, jwtSecret, {
    expiresIn: '24h',
    issuer: 'maifarm',
    audience: 'maifarm-api'
  });
};

/**
 * Refresh token middleware
 */
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

  try {
    const newToken = generateToken(
      req.user.userId, 
      req.user.roles, 
      req.user.permissions
    );
    
    res.setHeader('X-New-Token', newToken);
    res.setHeader('X-Token-Expires', '86400'); // 24 hours in seconds
    
    next();
  } catch (error) {
    logger.error('[Auth] Failed to refresh token:', error);
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'TOKEN_REFRESH_FAILED',
        message: 'Failed to refresh token'
      }
    };
    return res.status(500).json(response);
  }
};

/**
 * API key authentication for services
 */
export const authenticateApiKey = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'API_KEY_REQUIRED',
        message: 'API key is required'
      }
    };
    return res.status(401).json(response);
  }

  if (!securityConfig.isValidApiKey(apiKey)) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key format'
      }
    };
    return res.status(403).json(response);
  }

  // TODO: Validate API key against database
  // For now, we'll accept any valid format key in development
  if (!securityConfig.isProduction()) {
    req.user = {
      userId: 'api-service',
      roles: ['service'],
      permissions: ['api:*']
    } as AuthToken;
    return next();
  }

  // In production, validate against database
  const response: ApiResponse = {
    success: false,
    error: {
      code: 'API_KEY_INVALID',
      message: 'API key validation not implemented'
    }
  };
  return res.status(403).json(response);
};

/**
 * Input sanitization middleware
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Sanitize common fields
  if (req.body) {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = securityConfig.sanitizeInput(req.body[key]);
      }
    }
  }

  if (req.query) {
    for (const key in req.query) {
      if (typeof req.query[key] === 'string') {
        req.query[key] = securityConfig.sanitizeInput(req.query[key] as string);
      }
    }
  }

  next();
};

/**
 * Security headers middleware
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  const headers = securityConfig.getSecurityHeaders();
  
  for (const [header, value] of Object.entries(headers)) {
    res.setHeader(header, value as string);
  }

  next();
};