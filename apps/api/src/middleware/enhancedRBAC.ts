/**
 * Enhanced Role-Based Access Control (RBAC) Middleware
 *
 * Production-grade RBAC with:
 * - Fine-grained permissions
 * - Resource-level access control
 * - Audit logging
 * - Rate limiting per role
 * - Session validation
 * - JWT token validation
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../database/connection';
import { logger, LogCategory } from '../utils/logger';
import { openTelemetryTracing } from '../services/OpenTelemetryTracing';

// Role hierarchy (higher number = more permissions)
export enum Role {
  GUEST = 0,
  USER = 10,
  OPERATOR = 20,
  ADMIN = 30,
  SUPERADMIN = 40
}

// Permission types
export enum Permission {
  // Farm permissions
  FARM_CREATE = 'farm:create',
  FARM_READ = 'farm:read',
  FARM_UPDATE = 'farm:update',
  FARM_DELETE = 'farm:delete',
  FARM_LAUNCH = 'farm:launch',
  FARM_TERMINATE = 'farm:terminate',

  // Agent permissions
  AGENT_CREATE = 'agent:create',
  AGENT_READ = 'agent:read',
  AGENT_UPDATE = 'agent:update',
  AGENT_DELETE = 'agent:delete',

  // Harvest permissions
  HARVEST_CREATE = 'harvest:create',
  HARVEST_READ = 'harvest:read',
  HARVEST_COLLECT = 'harvest:collect',
  HARVEST_DELETE = 'harvest:delete',

  // System permissions
  SYSTEM_MONITOR = 'system:monitor',
  SYSTEM_CONFIGURE = 'system:configure',
  SYSTEM_ADMIN = 'system:admin',

  // User permissions
  USER_READ = 'user:read',
  USER_UPDATE = 'user:update',
  USER_DELETE = 'user:delete',

  // API key permissions
  APIKEY_CREATE = 'apikey:create',
  APIKEY_READ = 'apikey:read',
  APIKEY_DELETE = 'apikey:delete'
}

// Role to permissions mapping
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.GUEST]: [
    Permission.FARM_READ,
    Permission.AGENT_READ,
    Permission.HARVEST_READ
  ],
  [Role.USER]: [
    Permission.FARM_CREATE,
    Permission.FARM_READ,
    Permission.FARM_UPDATE,
    Permission.FARM_LAUNCH,
    Permission.AGENT_READ,
    Permission.HARVEST_CREATE,
    Permission.HARVEST_READ,
    Permission.HARVEST_COLLECT,
    Permission.APIKEY_CREATE,
    Permission.APIKEY_READ,
    Permission.USER_READ,
    Permission.USER_UPDATE
  ],
  [Role.OPERATOR]: [
    Permission.FARM_CREATE,
    Permission.FARM_READ,
    Permission.FARM_UPDATE,
    Permission.FARM_DELETE,
    Permission.FARM_LAUNCH,
    Permission.FARM_TERMINATE,
    Permission.AGENT_CREATE,
    Permission.AGENT_READ,
    Permission.AGENT_UPDATE,
    Permission.HARVEST_CREATE,
    Permission.HARVEST_READ,
    Permission.HARVEST_COLLECT,
    Permission.HARVEST_DELETE,
    Permission.SYSTEM_MONITOR,
    Permission.APIKEY_CREATE,
    Permission.APIKEY_READ,
    Permission.APIKEY_DELETE,
    Permission.USER_READ
  ],
  [Role.ADMIN]: [
    ...Object.values(Permission).filter(p => !p.startsWith('system:admin')),
    Permission.SYSTEM_CONFIGURE
  ],
  [Role.SUPERADMIN]: Object.values(Permission)
};

// Extended Request with user info
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: Role;
    permissions: Permission[];
    sessionId?: string;
  };
}

// JWT payload
interface JWTPayload {
  userId: string;
  email: string;
  role: Role;
  sessionId?: string;
  iat: number;
  exp: number;
}

/**
 * Verify JWT token and extract user info
 */
export const verifyToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const span = openTelemetryTracing.startSpan('auth.verifyToken', { kind: 'server' });

  try {
    // REMOVED: Auth bypass mode - all users must authenticate properly

    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      span.setStatus('error', 'Missing or invalid authorization header');
      span.end();
      res.status(401).json({ error: 'Unauthorized: Missing token' });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer '

    // Verify token
    const secret = process.env.JWT_SECRET || 'maifarm-secret-change-in-production';
    const decoded = jwt.verify(token, secret) as JWTPayload;

    span.setAttribute('user.id', decoded.userId);
    span.setAttribute('user.role', Role[decoded.role]);

    // Check token expiration
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      span.setStatus('error', 'Token expired');
      span.end();
      res.status(401).json({ error: 'Unauthorized: Token expired' });
      return;
    }

    // Validate user exists and is active
    const userResult = await db.query(
      'SELECT id, email, roles, is_admin, is_active, permissions FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      span.setStatus('error', 'User not found');
      span.end();
      res.status(401).json({ error: 'Unauthorized: User not found' });
      return;
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      span.setStatus('error', 'User inactive');
      span.end();
      res.status(401).json({ error: 'Unauthorized: User account disabled' });
      return;
    }

    // Determine user role based on is_admin flag and roles array
    let userRole: Role;
    if (user.is_admin) {
      userRole = Role.ADMIN;
    } else if (user.roles && user.roles.includes('superadmin')) {
      userRole = Role.SUPERADMIN;
    } else {
      userRole = Role.USER;
    }

    // Attach user info to request
    // Note: Empty array is truthy, so we need to check length
    const userPermissions = (user.permissions && user.permissions.length > 0)
      ? user.permissions
      : (ROLE_PERMISSIONS[userRole] || []);

    req.user = {
      id: user.id,
      email: user.email,
      role: userRole,
      permissions: userPermissions,
      sessionId: decoded.sessionId
    };

    // Log authentication
    await logAuditEvent('AUTH_SUCCESS', req.user.id, req.path, req.method);

    span.setStatus('ok');
    span.end();
    next();

  } catch (error) {
    span.recordException(error as Error);
    span.end();

    logger.error(LogCategory.AUTH, 'Token verification failed:', error);

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Unauthorized: Invalid token' });
    } else if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Unauthorized: Token expired' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

/**
 * Check if user has required role
 */
export const requireRole = (minimumRole: Role) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized: Not authenticated' });
      return;
    }

    if (req.user.role < minimumRole) {
      await logAuditEvent('AUTH_ROLE_DENIED', req.user.id, req.path, req.method, {
        requiredRole: Role[minimumRole],
        userRole: Role[req.user.role]
      });

      res.status(403).json({
        error: 'Forbidden: Insufficient role',
        required: Role[minimumRole],
        current: Role[req.user.role]
      });
      return;
    }

    next();
  };
};

/**
 * Check if user has required permission
 */
export const requirePermission = (...permissions: Permission[]) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized: Not authenticated' });
      return;
    }

    const hasAllPermissions = permissions.every(permission =>
      req.user!.permissions.includes(permission)
    );

    if (!hasAllPermissions) {
      await logAuditEvent('AUTH_PERMISSION_DENIED', req.user.id, req.path, req.method, {
        requiredPermissions: permissions,
        userPermissions: req.user.permissions
      });

      res.status(403).json({
        error: 'Forbidden: Missing required permissions',
        required: permissions,
        current: req.user.permissions
      });
      return;
    }

    next();
  };
};

/**
 * Check resource ownership
 */
export const requireResourceOwnership = (resourceType: 'farm' | 'harvest' | 'apikey') => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized: Not authenticated' });
      return;
    }

    // Admins can access all resources
    if (req.user.role >= Role.ADMIN) {
      return next();
    }

    const resourceId = req.params.id || req.params.farmId || req.params.harvestId;

    if (!resourceId) {
      res.status(400).json({ error: 'Bad Request: Resource ID required' });
      return;
    }

    try {
      let ownerQuery: string;
      let ownerField: string;

      switch (resourceType) {
        case 'farm':
          ownerQuery = 'SELECT user_id FROM farms WHERE id = $1';
          ownerField = 'user_id';
          break;
        case 'harvest':
          ownerQuery = 'SELECT user_id FROM harvests WHERE id = $1';
          ownerField = 'user_id';
          break;
        case 'apikey':
          ownerQuery = 'SELECT user_id FROM api_keys WHERE id = $1';
          ownerField = 'user_id';
          break;
        default:
          res.status(400).json({ error: 'Invalid resource type' });
          return;
      }

      const result = await db.query(ownerQuery, [resourceId]);

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Resource not found' });
        return;
      }

      const ownerId = result.rows[0][ownerField];

      if (ownerId !== req.user.id) {
        await logAuditEvent('AUTH_OWNERSHIP_DENIED', req.user.id, req.path, req.method, {
          resourceType,
          resourceId,
          ownerId
        });

        res.status(403).json({ error: 'Forbidden: Not resource owner' });
        return;
      }

      next();

    } catch (error) {
      logger.error(LogCategory.AUTH, 'Resource ownership check failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Rate limiting per role
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export const roleBasedRateLimit = (limitsPerMinute: Record<Role, number>) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized: Not authenticated' });
      return;
    }

    const userRole = req.user.role;
    const limit = limitsPerMinute[userRole] || 60; // Default 60 req/min

    const key = `${req.user.id}:${req.path}`;
    const now = Date.now();
    const resetTime = Math.floor(now / 60000) * 60000 + 60000; // Next minute

    let record = rateLimitStore.get(key);

    if (!record || record.resetTime < now) {
      record = { count: 0, resetTime };
      rateLimitStore.set(key, record);
    }

    record.count++;

    if (record.count > limit) {
      res.status(429).json({
        error: 'Too Many Requests',
        limit,
        resetAt: new Date(record.resetTime).toISOString()
      });
      return;
    }

    res.setHeader('X-RateLimit-Limit', limit.toString());
    res.setHeader('X-RateLimit-Remaining', (limit - record.count).toString());
    res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());

    next();
  };
};

/**
 * Log audit events
 */
async function logAuditEvent(
  event: string,
  userId: string,
  path: string,
  method: string,
  metadata?: any
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO security_audits (event, user_id, endpoint, method, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [event, userId, path, method, JSON.stringify(metadata || {})]
    );
  } catch (error) {
    logger.error(LogCategory.AUTH, 'Failed to log audit event:', error);
  }
}

/**
 * Generate JWT token
 */
export function generateToken(
  userId: string,
  email: string,
  role: Role,
  sessionId?: string
): string {
  const secret = process.env.JWT_SECRET || 'maifarm-secret-change-in-production';
  const expiresIn = process.env.JWT_EXPIRES_IN || '24h';

  return jwt.sign(
    { userId, email, role, sessionId },
    secret,
    { expiresIn }
  );
}

/**
 * Refresh token
 */
export const refreshToken = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const newToken = generateToken(
    req.user.id,
    req.user.email,
    req.user.role,
    req.user.sessionId
  );

  res.json({
    token: newToken,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  });
};

// Cleanup rate limit store periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (record.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Every minute
