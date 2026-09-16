/**
 * Apple Sign-In Authentication Router
 *
 * Simplified authentication using Apple Sign-In only.
 * No email/password, no registration forms, no verification flows.
 *
 * Endpoints:
 * - POST /api/auth/apple     - Primary authentication
 * - POST /api/auth/logout    - Session cleanup
 * - POST /api/auth/refresh   - Token refresh
 * - GET  /api/auth/me        - Current user
 * - DELETE /api/auth/account - Account deletion (App Store requirement)
 *
 * iOS Flow:
 * 1. User taps "Sign in with Apple" button
 * 2. iOS shows native ASAuthorizationController (auto-detects Apple accounts)
 * 3. User authenticates with Face ID/Touch ID
 * 4. iOS returns identityToken to app
 * 5. App sends token to POST /api/auth/apple
 * 6. Backend verifies token, creates/finds user, returns session tokens
 */

import { Router, Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { z } from 'zod';
import { apiRateLimits } from '../middleware/rateLimit';
import { db } from '../database/connection';
import { appleAuthService, AppleAuthErrorCode } from '../services/AppleAuthService';
import { logger, LogCategory } from '../services/ProductionLogger';

const router = Router();

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'maifarm-secret-change-in-production';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'maifarm-refresh-secret-change-in-production';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '30d';

// Validation schemas
const appleAuthSchema = z.object({
  identityToken: z.string().min(1, 'Identity token is required'),
  user: z.object({
    email: z.string().email().optional(),
    name: z.string().optional()
  }).optional(),
  nonce: z.string().optional(),
  deviceId: z.string().optional(),
  platform: z.enum(['ios', 'macos', 'web']).optional()
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
  deviceId: z.string().optional()
});

// Error response helper
interface AuthError {
  success: false;
  error: string;
  code: string;
}

function createError(code: string, message: string): AuthError {
  return { success: false, error: message, code };
}

// Generate JWT tokens
function generateTokens(userId: string, email: string | null, roles: string[] = ['user']) {
  const accessToken = jwt.sign(
    { userId, email, roles, type: 'access' },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  const refreshToken = jwt.sign(
    { userId, email, type: 'refresh' },
    REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  return { accessToken, refreshToken };
}

// Extract Bearer token from Authorization header
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || typeof authHeader !== 'string') return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
  return parts[1] || null;
}

/**
 * POST /api/auth/apple
 *
 * Primary authentication endpoint for Apple Sign-In.
 * Handles both new user registration and existing user login.
 *
 * iOS sends identityToken from ASAuthorizationController.
 * On first sign-in, iOS also provides user.name and user.email.
 */
router.post('/apple', apiRateLimits.auth, async (req: Request, res: Response) => {
  try {
    const validation = appleAuthSchema.safeParse(req.body);

    if (!validation.success) {
      logger.warn(LogCategory.AUTH, 'Apple auth validation failed', {
        errors: validation.error.flatten().fieldErrors
      });
      return res.status(400).json(
        createError('VALIDATION_ERROR', 'Invalid request data')
      );
    }

    const { identityToken, user, nonce, deviceId, platform } = validation.data;

    // Authenticate with Apple
    const result = await appleAuthService.authenticate(
      identityToken,
      user,
      nonce
    );

    if (!result.success || !result.user) {
      const statusCode = result.errorCode === AppleAuthErrorCode.TOKEN_EXPIRED ? 401 :
                         result.errorCode === AppleAuthErrorCode.ACCOUNT_DISABLED ? 403 : 401;

      return res.status(statusCode).json(
        createError(result.errorCode || 'AUTH_FAILED', result.error || 'Authentication failed')
      );
    }

    const authUser = result.user;

    // Fetch full user data including roles
    const userResult = await db.query(
      `SELECT id, email, display_name, roles, is_admin, preferences, setup_completed_at
       FROM users WHERE id = $1`,
      [authUser.id]
    );

    const dbUser = userResult.rows[0];
    const roles = dbUser?.roles || ['user'];
    const isAdmin = dbUser?.is_admin || false;

    // Generate session tokens
    const tokens = generateTokens(authUser.id, authUser.email, roles);

    // Store refresh token for device if deviceId provided
    if (deviceId) {
      await db.query(
        `INSERT INTO refresh_tokens (user_id, token, device_id, platform, expires_at)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 days')
         ON CONFLICT (user_id, device_id)
         DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, updated_at = NOW()`,
        [authUser.id, tokens.refreshToken, deviceId, platform || 'ios']
      ).catch(err => {
        logger.warn(LogCategory.AUTH, 'Failed to store refresh token', { error: err.message });
      });
    }

    logger.info(LogCategory.AUTH, 'Apple Sign-In completed', {
      userId: authUser.id,
      isNewUser: authUser.isNewUser,
      deviceId: deviceId ? 'provided' : 'none'
    });

    // Return user data and tokens
    res.json({
      success: true,
      isNewUser: authUser.isNewUser,
      user: {
        id: authUser.id,
        email: authUser.email,
        name: authUser.displayName,
        displayName: authUser.displayName,
        isPrivateEmail: authUser.isPrivateEmail,
        roles: roles.map((role: string) => ({ id: role, name: role })),
        isAdmin,
        setupCompleted: !!dbUser?.setup_completed_at,
        preferences: dbUser?.preferences || {}
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 900 // 15 minutes in seconds
    });
  } catch (error) {
    logger.error(LogCategory.AUTH, 'Apple authentication error', {
      error: error instanceof Error ? error.message : String(error)
    });

    res.status(500).json(
      createError('SERVER_ERROR', 'Authentication failed. Please try again.')
    );
  }
});

/**
 * POST /api/auth/refresh
 *
 * Refresh access token using a valid refresh token.
 * Used for seamless session continuation.
 */
router.post('/refresh', apiRateLimits.auth, async (req: Request, res: Response) => {
  try {
    const validation = refreshSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json(
        createError('VALIDATION_ERROR', 'Refresh token is required')
      );
    }

    const { refreshToken, deviceId } = validation.data;

    // Verify refresh token
    let decoded: { userId: string; email: string; type: string };
    try {
      decoded = jwt.verify(refreshToken, REFRESH_SECRET) as typeof decoded;

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }
    } catch (err) {
      return res.status(401).json(
        createError('INVALID_TOKEN', 'Invalid or expired refresh token')
      );
    }

    // Validate against stored token if deviceId provided
    if (deviceId) {
      const stored = await db.query(
        `SELECT * FROM refresh_tokens
         WHERE user_id = $1 AND device_id = $2 AND token = $3 AND expires_at > NOW()`,
        [decoded.userId, deviceId, refreshToken]
      ).catch(() => null);

      if (!stored || stored.rows.length === 0) {
        // Token not found or expired - require re-authentication
        return res.status(401).json(
          createError('TOKEN_REVOKED', 'Session expired. Please sign in again.')
        );
      }
    }

    // Fetch current user data
    const userResult = await db.query(
      `SELECT id, email, display_name, roles, is_admin, is_active, preferences, setup_completed_at
       FROM users WHERE id = $1`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json(
        createError('USER_NOT_FOUND', 'User account not found')
      );
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      return res.status(403).json(
        createError('ACCOUNT_DISABLED', 'Account has been disabled')
      );
    }

    const roles = user.roles || ['user'];
    const tokens = generateTokens(user.id, user.email, roles);

    // Update stored refresh token
    if (deviceId) {
      await db.query(
        `UPDATE refresh_tokens
         SET token = $1, expires_at = NOW() + INTERVAL '30 days', updated_at = NOW()
         WHERE user_id = $2 AND device_id = $3`,
        [tokens.refreshToken, user.id, deviceId]
      ).catch(() => {});
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.display_name,
        displayName: user.display_name,
        roles: roles.map((role: string) => ({ id: role, name: role })),
        isAdmin: user.is_admin,
        setupCompleted: !!user.setup_completed_at,
        preferences: user.preferences || {}
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 900
    });
  } catch (error) {
    logger.error(LogCategory.AUTH, 'Token refresh error', {
      error: error instanceof Error ? error.message : String(error)
    });

    res.status(500).json(
      createError('SERVER_ERROR', 'Failed to refresh token')
    );
  }
});

/**
 * GET /api/auth/me
 *
 * Get current authenticated user's profile.
 */
router.get('/me', async (req: Request, res: Response) => {
  const token = extractBearerToken(req.headers['authorization']);

  if (!token) {
    return res.status(401).json(
      createError('NO_TOKEN', 'Authentication required')
    );
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

    const userResult = await db.query(
      `SELECT id, email, display_name, roles, permissions, is_admin, is_active,
              created_at, updated_at, last_login_at, setup_completed_at,
              avatar_url, preferences
       FROM users WHERE id = $1`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json(
        createError('USER_NOT_FOUND', 'User not found')
      );
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      return res.status(403).json(
        createError('ACCOUNT_DISABLED', 'Account has been disabled')
      );
    }

    // Fetch user's farms
    const farmsResult = await db.query(
      `SELECT id, name, status, created_at
       FROM farms
       WHERE owner_id = $1 OR created_by_user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [user.id]
    ).catch(() => ({ rows: [] }));

    // Parse preferences safely
    let preferences = {};
    if (user.preferences) {
      preferences = typeof user.preferences === 'string'
        ? JSON.parse(user.preferences)
        : user.preferences;
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.display_name,
        displayName: user.display_name,
        avatar: user.avatar_url,
        roles: (user.roles || ['user']).map((role: string) => ({
          id: role,
          name: role,
          permissions: []
        })),
        permissions: user.permissions || [],
        isAdmin: user.is_admin,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        lastLogin: user.last_login_at,
        setupCompleted: !!user.setup_completed_at,
        setupCompletedAt: user.setup_completed_at,
        farms: farmsResult.rows,
        preferences
      }
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json(
        createError('TOKEN_EXPIRED', 'Session expired. Please sign in again.')
      );
    }

    logger.error(LogCategory.AUTH, 'Get user error', {
      error: error instanceof Error ? error.message : String(error)
    });

    res.status(401).json(
      createError('INVALID_TOKEN', 'Invalid authentication token')
    );
  }
});

/**
 * POST /api/auth/logout
 *
 * Logout and invalidate session tokens.
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const token = extractBearerToken(req.headers['authorization']);
    const { deviceId, allDevices } = req.body;

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

        if (allDevices) {
          // Logout from all devices
          await db.query(
            'DELETE FROM refresh_tokens WHERE user_id = $1',
            [decoded.userId]
          ).catch(() => {});

          logger.info(LogCategory.AUTH, 'User logged out from all devices', {
            userId: decoded.userId
          });
        } else if (deviceId) {
          // Logout from specific device
          await db.query(
            'DELETE FROM refresh_tokens WHERE user_id = $1 AND device_id = $2',
            [decoded.userId, deviceId]
          ).catch(() => {});

          logger.info(LogCategory.AUTH, 'User logged out from device', {
            userId: decoded.userId,
            deviceId
          });
        } else {
          // Logout from all devices (default for safety)
          await db.query(
            'DELETE FROM refresh_tokens WHERE user_id = $1',
            [decoded.userId]
          ).catch(() => {});
        }
      } catch {
        // Token might be expired, but we still complete logout
      }
    }

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    // Always return success for logout
    res.json({ success: true, message: 'Logged out successfully' });
  }
});

/**
 * DELETE /api/auth/account
 *
 * Delete user account (App Store requirement).
 * Performs soft-delete: anonymizes data but preserves record.
 */
router.delete('/account', async (req: Request, res: Response) => {
  const token = extractBearerToken(req.headers['authorization']);

  if (!token) {
    return res.status(401).json(
      createError('NO_TOKEN', 'Authentication required')
    );
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

    // Require confirmation
    const { confirm } = req.body;
    if (confirm !== 'DELETE_MY_ACCOUNT') {
      return res.status(400).json(
        createError('CONFIRMATION_REQUIRED', 'Please confirm account deletion by sending { confirm: "DELETE_MY_ACCOUNT" }')
      );
    }

    const success = await appleAuthService.deleteAccount(decoded.userId);

    if (!success) {
      return res.status(404).json(
        createError('USER_NOT_FOUND', 'Account not found')
      );
    }

    // Invalidate all refresh tokens
    await db.query(
      'DELETE FROM refresh_tokens WHERE user_id = $1',
      [decoded.userId]
    ).catch(() => {});

    logger.info(LogCategory.AUTH, 'Account deleted', { userId: decoded.userId });

    res.json({
      success: true,
      message: 'Your account has been deleted. We\'re sorry to see you go.'
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json(
        createError('TOKEN_EXPIRED', 'Session expired. Please sign in again to delete account.')
      );
    }

    logger.error(LogCategory.AUTH, 'Account deletion error', {
      error: error instanceof Error ? error.message : String(error)
    });

    res.status(500).json(
      createError('SERVER_ERROR', 'Failed to delete account')
    );
  }
});

/**
 * GET /api/auth/setup-status
 *
 * Check if user needs to complete setup (for onboarding flow).
 */
router.get('/setup-status', async (req: Request, res: Response) => {
  const token = extractBearerToken(req.headers['authorization']);

  // Allow unauthenticated access for initial app state check
  if (!token) {
    return res.json({
      success: true,
      authenticated: false,
      requiresAuth: true
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

    const userResult = await db.query(
      `SELECT id, setup_completed_at, is_active FROM users WHERE id = $1`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.json({
        success: true,
        authenticated: false,
        requiresAuth: true
      });
    }

    const user = userResult.rows[0];

    res.json({
      success: true,
      authenticated: true,
      requiresAuth: false,
      setupCompleted: !!user.setup_completed_at,
      accountActive: user.is_active
    });
  } catch (error) {
    res.json({
      success: true,
      authenticated: false,
      requiresAuth: true
    });
  }
});

/**
 * POST /api/auth/complete-setup
 *
 * Mark user's onboarding setup as complete.
 */
router.post('/complete-setup', async (req: Request, res: Response) => {
  const token = extractBearerToken(req.headers['authorization']);

  if (!token) {
    return res.status(401).json(
      createError('NO_TOKEN', 'Authentication required')
    );
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const { preferences } = req.body;

    const result = await db.query(
      `UPDATE users
       SET setup_completed_at = COALESCE(setup_completed_at, NOW()),
           preferences = COALESCE($2, preferences),
           updated_at = NOW()
       WHERE id = $1
       RETURNING setup_completed_at, preferences`,
      [decoded.userId, preferences ? JSON.stringify(preferences) : null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(
        createError('USER_NOT_FOUND', 'User not found')
      );
    }

    logger.info(LogCategory.AUTH, 'Setup completed', { userId: decoded.userId });

    res.json({
      success: true,
      setupCompletedAt: result.rows[0].setup_completed_at,
      preferences: result.rows[0].preferences || {}
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json(
        createError('TOKEN_EXPIRED', 'Session expired. Please sign in again.')
      );
    }

    logger.error(LogCategory.AUTH, 'Complete setup error', {
      error: error instanceof Error ? error.message : String(error)
    });

    res.status(500).json(
      createError('SERVER_ERROR', 'Failed to complete setup')
    );
  }
});

/**
 * PUT /api/auth/profile
 *
 * Update user profile (display name, preferences).
 */
router.put('/profile', async (req: Request, res: Response) => {
  const token = extractBearerToken(req.headers['authorization']);

  if (!token) {
    return res.status(401).json(
      createError('NO_TOKEN', 'Authentication required')
    );
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const { displayName, preferences, avatar } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (displayName !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      values.push(displayName);
    }

    if (preferences !== undefined) {
      updates.push(`preferences = $${paramIndex++}`);
      values.push(JSON.stringify(preferences));
    }

    if (avatar !== undefined) {
      updates.push(`avatar_url = $${paramIndex++}`);
      values.push(avatar);
    }

    if (updates.length === 0) {
      return res.status(400).json(
        createError('VALIDATION_ERROR', 'No updates provided')
      );
    }

    updates.push('updated_at = NOW()');
    values.push(decoded.userId);

    const result = await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, display_name, preferences, avatar_url`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json(
        createError('USER_NOT_FOUND', 'User not found')
      );
    }

    res.json({
      success: true,
      user: {
        displayName: result.rows[0].display_name,
        preferences: result.rows[0].preferences || {},
        avatar: result.rows[0].avatar_url
      }
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json(
        createError('TOKEN_EXPIRED', 'Session expired')
      );
    }

    logger.error(LogCategory.AUTH, 'Profile update error', {
      error: error instanceof Error ? error.message : String(error)
    });

    res.status(500).json(
      createError('SERVER_ERROR', 'Failed to update profile')
    );
  }
});

/**
 * GET /api/auth/devices
 *
 * List user's active devices/sessions.
 */
router.get('/devices', async (req: Request, res: Response) => {
  const token = extractBearerToken(req.headers['authorization']);

  if (!token) {
    return res.status(401).json(
      createError('NO_TOKEN', 'Authentication required')
    );
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

    const result = await db.query(
      `SELECT device_id, platform, created_at, updated_at
       FROM refresh_tokens
       WHERE user_id = $1 AND expires_at > NOW()
       ORDER BY updated_at DESC`,
      [decoded.userId]
    );

    res.json({
      success: true,
      devices: result.rows.map(row => ({
        deviceId: row.device_id,
        platform: row.platform,
        lastActive: row.updated_at || row.created_at,
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json(
        createError('TOKEN_EXPIRED', 'Session expired')
      );
    }

    res.status(500).json(
      createError('SERVER_ERROR', 'Failed to fetch devices')
    );
  }
});

/**
 * DELETE /api/auth/devices/:deviceId
 *
 * Revoke access for a specific device.
 */
router.delete('/devices/:deviceId', async (req: Request, res: Response) => {
  const token = extractBearerToken(req.headers['authorization']);

  if (!token) {
    return res.status(401).json(
      createError('NO_TOKEN', 'Authentication required')
    );
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const { deviceId } = req.params;

    const result = await db.query(
      `DELETE FROM refresh_tokens WHERE user_id = $1 AND device_id = $2 RETURNING device_id`,
      [decoded.userId, deviceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(
        createError('DEVICE_NOT_FOUND', 'Device not found')
      );
    }

    logger.info(LogCategory.AUTH, 'Device revoked', {
      userId: decoded.userId,
      deviceId
    });

    res.json({
      success: true,
      message: 'Device access revoked'
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json(
        createError('TOKEN_EXPIRED', 'Session expired')
      );
    }

    res.status(500).json(
      createError('SERVER_ERROR', 'Failed to revoke device')
    );
  }
});

export default router;
