import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import { apiRateLimits } from '../middleware/rateLimit';
import { db } from '../database/connection';
import { validateRequest } from '../middleware/validation';
import { z } from 'zod';
import { logger, LogCategory } from '../services/ProductionLogger';
import { userCreationService } from '../services/userCreationService';
import bcrypt from 'bcryptjs';

const router = Router();

const DEPRECATION_MESSAGE = 'Deprecated users API: migrate to /api/users (user-management) or /api/auth/register before Phase 4.';

router.use((req, res, next) => {
  logger.warn(
    LogCategory.API,
    `DEPRECATED /api/users endpoint invoked: ${req.method} ${req.originalUrl}`
  );

  res.set('Deprecation', 'true');
  res.set('Warning', `299 MaiFarm "${DEPRECATION_MESSAGE}"`);
  res.set('Link', '</api/users>; rel="successor-version", </api/auth/register>; rel="create-form"');

  next();
});

// Validation schemas
const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  roles: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional()
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  username: z.string().min(3).max(50).optional(),
  display_name: z.string().optional(),
  avatar_url: z.string().optional(),
  password: z.string().min(8).optional(),
  roles: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
  mfa_enabled: z.boolean().optional(),
  preferences: z.any().optional()
});

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  role: z.string().optional(),
  sort: z.enum(['created_at', 'updated_at', 'username', 'email']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc')
});

// Helper function to sanitize user data
const sanitizeUser = (user: any) => {
  const { password_hash, mfa_secret, ...sanitized } = user;
  return sanitized;
};

// GET /api/users - List all users (admin only)
router.get('/', 
  authenticateToken,
  requireRole('admin'),
  validateRequest({ query: querySchema }),
  async (req, res) => {
    try {
      const { page, limit, search, role, sort, order } = req.query as any;
      const offset = (page - 1) * limit;

      let whereClause = '';
      const params: any[] = [];
      
      if (search) {
        whereClause = 'WHERE (email ILIKE $1 OR username ILIKE $1)';
        params.push(`%${search}%`);
      }
      
      if (role) {
        const roleCondition = search ? 'AND $2 = ANY(roles)' : 'WHERE $1 = ANY(roles)';
        whereClause += ` ${roleCondition}`;
        params.push(role);
      }

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM users ${whereClause}`;
      const countResult = await db.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);

      // Get paginated users
      const usersQuery = `
        SELECT id, email, username, display_name, avatar_url, roles, permissions, api_keys,
               mfa_enabled, last_login_at AS last_login, created_at, updated_at
        FROM users
        ${whereClause}
        ORDER BY ${sort} ${order}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      
      const usersResult = await db.query(usersQuery, [...params, limit, offset]);
      
      res.json({
        success: true,
        users: usersResult.rows.map(sanitizeUser),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Error listing users:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch users'
      });
    }
  }
);

// GET /api/users/me - Get current user
router.get('/me', 
  authenticateToken,
  async (req, res) => {
    try {
      const userId = (req as any).user.id;
      
      const result = await db.query(
        `SELECT id, email, username, display_name, avatar_url, roles, permissions, api_keys,
                mfa_enabled, last_login_at AS last_login, created_at, updated_at
         FROM users WHERE id = $1`,
        [userId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      res.json({
        success: true,
        user: sanitizeUser(result.rows[0])
      });
    } catch (error) {
      console.error('Error fetching current user:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch user'
      });
    }
  }
);

// GET /api/users/:id - Get specific user
router.get('/:id', 
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const currentUser = (req as any).user;
      
      // Users can only view their own profile unless they're admin
      if (currentUser.id !== id && !currentUser.roles?.includes('admin')) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden'
        });
      }
      
      const result = await db.query(
        `SELECT id, email, username, display_name, avatar_url, roles, permissions, api_keys,
                mfa_enabled, last_login_at AS last_login, created_at, updated_at
         FROM users WHERE id = $1`,
        [id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      res.json({
        success: true,
        user: sanitizeUser(result.rows[0])
      });
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch user'
      });
    }
  }
);

// POST /api/users/create - Create new user with welcome flow (admin only)
router.post('/create',
  authenticateToken,
  requireRole('admin'),
  apiRateLimits.standard,
  async (req, res) => {
    try {
      const { email, name, password, role = 'user', sendWelcome = false } = req.body;

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, error: 'Valid email is required' });
      }

      if (!name || name.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Name is required' });
      }

      if (!password || password.length < 8) {
        return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
      }

      const creation = await userCreationService.createUser({
        email: email.trim().toLowerCase(),
        password,
        authMode: 'password',
        name,
        displayName: name,
        roles: role === 'admin' ? ['admin', 'user'] : ['user'],
        sendWelcomeEmail: sendWelcome,
        requireEmailVerification: false,
        createdByUserId: (req as any).user?.id,
        metadata: { source: 'legacy-users-create', sendWelcome }
      });

      res.status(201).json({
        success: true,
        userId: creation.user.id,
        user: sanitizeUser(creation.user),
        sendWelcome
      });
    } catch (error: any) {
      console.error('Error creating user:', error);
      const message = typeof error?.message === 'string' ? error.message : 'Failed to create user';
      const lower = message.toLowerCase();
      const status = lower.includes('exist') || lower.includes('username') ? 409 : 500;
      res.status(status).json({ success: false, error: message });
    }
  }
);

// POST /api/users - Create new user (admin only)
router.post('/',
  authenticateToken,
  requireRole('admin'),
  validateRequest({ body: createUserSchema }),
  apiRateLimits.standard,
  async (req, res) => {
    try {
      const { email, username, password, roles = ['user'], permissions = [] } = req.body;

      const creation = await userCreationService.createUser({
        email: email.trim().toLowerCase(),
        username,
        password,
        authMode: 'password',
        roles,
        permissions,
        sendWelcomeEmail: false,
        requireEmailVerification: false,
        createdByUserId: (req as any).user?.id,
        metadata: { source: 'legacy-users-post' }
      });

      res.status(201).json({
        success: true,
        user: sanitizeUser(creation.user)
      });
    } catch (error: any) {
      console.error('Error creating user:', error);
      const message = typeof error?.message === 'string' ? error.message : 'Failed to create user';
      const lower = message.toLowerCase();
      const status = lower.includes('exist') || lower.includes('username') ? 409 : 500;
      res.status(status).json({ success: false, error: message });
    }
  }
);

// PUT /api/users/:id - Update user
router.put('/:id', 
  authenticateToken,
  validateRequest({ body: updateUserSchema }),
  apiRateLimits.standard,
  async (req, res) => {
    try {
      const { id } = req.params;
      const currentUser = (req as any).user;
      const updates = req.body;
      
      // Users can only update their own profile unless they're admin
      if (currentUser.id !== id && !currentUser.roles?.includes('admin')) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden'
        });
      }
      
      // Only admins can update roles and permissions
      if (!currentUser.roles?.includes('admin')) {
        delete updates.roles;
        delete updates.permissions;
      }
      
      // Build update query
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;
      
      if (updates.email) {
        updateFields.push(`email = $${paramIndex++}`);
        values.push(updates.email);
      }

      if (updates.username) {
        updateFields.push(`username = $${paramIndex++}`);
        values.push(updates.username);
      }

      if (updates.display_name !== undefined) {
        updateFields.push(`display_name = $${paramIndex++}`);
        values.push(updates.display_name);
      }

      if (updates.avatar_url !== undefined) {
        updateFields.push(`avatar_url = $${paramIndex++}`);
        values.push(updates.avatar_url);
      }

      if (updates.password) {
        const passwordHash = await bcrypt.hash(updates.password, 10);
        updateFields.push(`password_hash = $${paramIndex++}`);
        values.push(passwordHash);
      }

      if (updates.roles) {
        updateFields.push(`roles = $${paramIndex++}`);
        values.push(updates.roles);
      }

      if (updates.permissions) {
        updateFields.push(`permissions = $${paramIndex++}`);
        values.push(updates.permissions);
      }

      if (typeof updates.mfa_enabled === 'boolean') {
        updateFields.push(`mfa_enabled = $${paramIndex++}`);
        values.push(updates.mfa_enabled);
      }

      if (updates.preferences) {
        updateFields.push(`preferences = $${paramIndex++}`);
        values.push(JSON.stringify(updates.preferences));
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid fields to update'
        });
      }
      
      values.push(id);
      
      const result = await db.query(
        `UPDATE users
         SET ${updateFields.join(', ')}, updated_at = NOW()
         WHERE id = $${paramIndex}
         RETURNING id, email, username, display_name, avatar_url, roles, permissions, mfa_enabled, preferences, updated_at`,
        values
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      // Log audit event
      await db.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [currentUser.id, 'UPDATE_USER', 'user', id, updates]
      );
      
      res.json({
        success: true,
        user: sanitizeUser(result.rows[0])
      });
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update user'
      });
    }
  }
);

// DELETE /api/users/:id - Delete user (admin only)
router.delete('/:id', 
  authenticateToken,
  requireRole('admin'),
  apiRateLimits.standard,
  async (req, res) => {
    try {
      const { id } = req.params;
      const currentUser = (req as any).user;
      
      // Prevent self-deletion
      if (currentUser.id === id) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete your own account'
        });
      }
      
      const result = await db.query(
        'DELETE FROM users WHERE id = $1 RETURNING email, username',
        [id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      // Log audit event
      await db.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [currentUser.id, 'DELETE_USER', 'user', id, result.rows[0]]
      );
      
      res.json({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete user'
      });
    }
  }
);

// POST /api/users/:id/reset-password - Reset user password (admin only)
router.post('/:id/reset-password', 
  authenticateToken,
  requireRole('admin'),
  apiRateLimits.standard,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { password } = req.body;
      
      if (!password || password.length < 8) {
        return res.status(400).json({
          success: false,
          error: 'Password must be at least 8 characters'
        });
      }
      
      const passwordHash = await bcrypt.hash(password, 10);
      
      const result = await db.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING email, username',
        [passwordHash, id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      // Log audit event
      await db.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [(req as any).user.id, 'RESET_PASSWORD', 'user', id, { email: result.rows[0].email }]
      );
      
      res.json({
        success: true,
        message: 'Password reset successfully'
      });
    } catch (error) {
      console.error('Error resetting password:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reset password'
      });
    }
  }
);

// GET /api/users/:id/sessions - Get user sessions
router.get('/:id/sessions', 
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const currentUser = (req as any).user;
      
      // Users can only view their own sessions unless they're admin
      if (currentUser.id !== id && !currentUser.roles?.includes('admin')) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden'
        });
      }
      
      const result = await db.query(
        `SELECT id, expires_at, created_at 
         FROM sessions 
         WHERE user_id = $1 AND expires_at > NOW()
         ORDER BY created_at DESC`,
        [id]
      );
      
      res.json({
        success: true,
        sessions: result.rows
      });
    } catch (error) {
      console.error('Error fetching sessions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch sessions'
      });
    }
  }
);

// DELETE /api/users/:id/sessions - Revoke all user sessions
router.delete('/:id/sessions', 
  authenticateToken,
  apiRateLimits.standard,
  async (req, res) => {
    try {
      const { id } = req.params;
      const currentUser = (req as any).user;
      
      // Users can only revoke their own sessions unless they're admin
      if (currentUser.id !== id && !currentUser.roles?.includes('admin')) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden'
        });
      }
      
      await db.query('DELETE FROM sessions WHERE user_id = $1', [id]);
      
      // Log audit event
      await db.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [currentUser.id, 'REVOKE_SESSIONS', 'user', id, {}]
      );
      
      res.json({
        success: true,
        message: 'All sessions revoked successfully'
      });
    } catch (error) {
      console.error('Error revoking sessions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to revoke sessions'
      });
    }
  }
);

export default router;
