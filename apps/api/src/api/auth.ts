import { Router, Request } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { apiRateLimits } from '../middleware/rateLimit';
import { db } from '../database/connection';
import { userManagementService } from '../services/userManagementService';
import { emailService } from '../services/emailService';
import { userAccountService, RegisterPayload, UserAccountError } from '../services/userAccountService';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'maifarm-secret-change-in-production';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'maifarm-refresh-secret-change-in-production';
const ACCESS_TOKEN_EXPIRY = '15m'; // Short-lived access token
const REFRESH_TOKEN_EXPIRY = '30d'; // Long-lived refresh token for mobile
const EMAIL_VERIFICATION_TTL_HOURS = parseInt(process.env.USER_EMAIL_VERIFICATION_HOURS || '48', 10);
const EMAIL_VERIFICATION_WINDOW_MS = EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000;

// Error codes for structured error responses
enum AuthErrorCode {
  EMAIL_EXISTS = 'EMAIL_EXISTS',
  USERNAME_EXISTS = 'USERNAME_EXISTS',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  DATABASE_ERROR = 'DATABASE_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  EMAIL_SEND_FAILED = 'EMAIL_SEND_FAILED',
  PASSWORD_REQUIRED = 'PASSWORD_REQUIRED',
  ACCOUNT_INACTIVE = 'ACCOUNT_INACTIVE'
}

// Structured error response helper
function createErrorResponse(code: AuthErrorCode, message: string, details?: any) {
  return {
    success: false,
    error: message,
    code,
    ...(details && { details })
  };
}

// Mock user for testing
const mockUser = {
  id: '1',
  email: 'test@maifarm.ai',
  name: 'Test User',
  roles: [{ id: '1', name: 'admin', description: 'Administrator', permissions: [] }],
  permissions: [],
  createdAt: new Date(),
  lastLogin: new Date(),
  mfaEnabled: false,
  authMode: 'password',
  emailVerified: true
};

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  authMode: z.enum(['password', 'passwordless']),
  username: z.string().regex(/^[a-zA-Z0-9_-]{3,30}$/).optional()
});

type MockUserRecord = {
  id: string;
  email: string;
  username: string;
  display_name: string;
  password?: string | null;
  auth_mode: 'password' | 'passwordless';
  email_verified?: boolean;
  roles: string[];
  permissions: string[];
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  setup_completed_at: string | null;
  avatar_url?: string | null;
  preferences?: Record<string, any>;
};

// Helper: Extract and validate Bearer token from Authorization header
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  const token = parts[1];
  if (!token || token.trim() === '') {
    return null;
  }

  return token;
}

// Helper: Generate JWT tokens
function generateTokens(userId: string, email: string, roles: string[], permissions: string[] = []) {
  const accessToken = jwt.sign(
    { userId, email, roles, permissions, type: 'access' },
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

// Mock auth support (for development/testing)
const useMockAuth = process.env.NODE_ENV === 'development';
const mockUsersById = new Map<string, MockUserRecord>();

function getMockUserById(userId: string): MockUserRecord | null {
  return mockUsersById.get(userId) || null;
}

function saveMockUser(user: MockUserRecord): void {
  mockUsersById.set(user.id, user);
}

function sanitizeUserResponse(user: MockUserRecord | any) {
  return {
    id: user.id,
    email: user.email,
    name: user.display_name || user.name,
    username: user.username,
    roles: (user.roles || []).map((role: string) => ({
      id: role,
      name: role,
      permissions: []
    })),
    permissions: user.permissions || [],
    isAdmin: user.is_admin,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    lastLogin: user.last_login_at,
    setupCompletedAt: user.setup_completed_at,
    authMode: user.auth_mode || user.authMode || 'password',
    emailVerified: typeof user.email_verified === 'boolean'
      ? user.email_verified
      : Boolean(user.emailVerified),
    farms: [],
    harvests: []
  };
}

async function resolveUserFromRequest(req: Request): Promise<any> {
  const token = extractBearerToken(req.headers['authorization']);

  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    if (!decoded || !decoded.userId) {
      return null;
    }

    // Try to fetch from database
    try {
      const userResult = await db.query(
        'SELECT id, email, username, display_name, setup_completed_at FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (userResult.rows.length > 0) {
        return {
          id: userResult.rows[0].id,
          email: userResult.rows[0].email,
          username: userResult.rows[0].username,
          display_name: userResult.rows[0].display_name,
          setup_completed_at: userResult.rows[0].setup_completed_at
        };
      }
    } catch (dbError) {
      console.warn('Database error resolving user from request:', dbError);
    }

    // Fallback to mock user
    if (useMockAuth) {
      const mockUser = getMockUserById(decoded.userId);
      if (mockUser) {
        return {
          id: mockUser.id,
          email: mockUser.email,
          username: mockUser.username,
          display_name: mockUser.display_name,
          setup_completed_at: mockUser.setup_completed_at
        };
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

// Login endpoint
router.post('/login', apiRateLimits.auth, async (req, res) => {
  const { email, username, password, deviceId, platform } = req.body;

  try {
    if (!email && !username) {
      return res.status(400).json(
        createErrorResponse(
          AuthErrorCode.VALIDATION_ERROR,
          'Email or username is required'
        )
      );
    }

    const identifier = {
      email: email?.trim().toLowerCase(),
      username: username?.trim(),
      // Only include password if it's provided (not empty string)
      password: password && password.trim() !== '' ? password : undefined
    };

    const { user, source } = await userAccountService.authenticate(identifier);

    // Safely extract role names with null check
    const roleNames = Array.isArray(user.roles)
      ? user.roles.map(role => typeof role === 'string' ? role : role.name).filter(Boolean)
      : ['user'];
    const permissions = Array.isArray(user.permissions) ? user.permissions : [];

    const tokens = generateTokens(user.id, user.email, roleNames, permissions);

    if (source === 'database' && deviceId) {
      await db.query(
        `INSERT INTO refresh_tokens (user_id, token, device_id, platform, expires_at)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 days')
         ON CONFLICT (user_id, device_id)
         DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at`,
        [user.id, tokens.refreshToken, deviceId, platform || 'unknown']
      ).catch((err) => {
        console.error('[Auth] Failed to store refresh token:', err);
      });
    }

    if (source === 'database') {
      // Update last_login_at and set setup_completed_at if not already set
      await db.query(
        `UPDATE users
         SET last_login_at = NOW(),
             setup_completed_at = COALESCE(setup_completed_at, NOW())
         WHERE id = $1`,
        [user.id]
      ).catch((err) => {
        console.error('[Auth] Failed to update user login timestamp:', err);
      });
    }

    console.log(`[Auth] Successful login: ${user.email}`);

    res.json({
      success: true,
      user: { ...user, farms: [], harvests: [] },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 900,
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: 900
      }
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    if (error instanceof UserAccountError) {
      let errorCode = AuthErrorCode.INVALID_CREDENTIALS;
      let details: any = undefined;

      if (error.message.includes('not found')) {
        errorCode = AuthErrorCode.USER_NOT_FOUND;
      } else if (error.message.includes('verify your email')) {
        errorCode = AuthErrorCode.EMAIL_NOT_VERIFIED;
        details = {
          email: email || username,
          canResend: true
        };
      } else if (error.message.includes('deactivated')) {
        errorCode = AuthErrorCode.ACCOUNT_INACTIVE;
        details = { supportEmail: 'support@maifarm.ai' };
      } else if (error.message.includes('password') || error.message.includes('credentials')) {
        errorCode = AuthErrorCode.INVALID_CREDENTIALS;
      }

      return res.status(error.status).json(
        createErrorResponse(errorCode, error.message, details)
      );
    }

    res.status(500).json(
      createErrorResponse(
        AuthErrorCode.DATABASE_ERROR,
        'Login failed due to a server error. Please try again later.'
      )
    );
  }
});

// Apple Sign In endpoint (iOS)
router.post('/apple', apiRateLimits.auth, async (req, res) => {
  const { identityToken, email, name } = req.body;

  try {
    if (!identityToken) {
      return res.status(400).json(
        createErrorResponse(
          AuthErrorCode.VALIDATION_ERROR,
          'Identity token is required'
        )
      );
    }

    // In production, verify the identity token with Apple's servers
    // For now, decode and extract the subject (user identifier)
    let appleUserId: string;
    let userEmail: string | undefined = email;

    try {
      // Decode the JWT (without verification for now - add Apple verification in production)
      const tokenParts = identityToken.split('.');
      if (tokenParts.length !== 3) {
        throw new Error('Invalid token format');
      }

      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
      appleUserId = payload.sub;
      userEmail = userEmail || payload.email;

      if (!appleUserId) {
        throw new Error('No subject in token');
      }
    } catch (decodeError) {
      console.error('[Auth] Apple token decode error:', decodeError);
      return res.status(401).json(
        createErrorResponse(
          AuthErrorCode.INVALID_TOKEN,
          'Invalid Apple identity token'
        )
      );
    }

    // Check if user exists with this Apple ID
    let user;
    const existingAppleUser = await db.query(
      `SELECT * FROM users WHERE apple_user_id = $1`,
      [appleUserId]
    ).then(r => r.rows[0]).catch(() => null);

    if (existingAppleUser) {
      // Existing Apple user - log them in
      user = existingAppleUser;
    } else if (userEmail) {
      // Check if email exists
      const existingEmailUser = await db.query(
        `SELECT * FROM users WHERE email = $1`,
        [userEmail.toLowerCase()]
      ).then(r => r.rows[0]).catch(() => null);

      if (existingEmailUser) {
        // Link Apple ID to existing email account
        await db.query(
          `UPDATE users SET apple_user_id = $1, auth_mode = 'apple' WHERE id = $2`,
          [appleUserId, existingEmailUser.id]
        );
        user = { ...existingEmailUser, apple_user_id: appleUserId, auth_mode: 'apple' };
      } else {
        // Create new user with Apple
        const displayName = name || userEmail.split('@')[0];
        const result = await db.query(
          `INSERT INTO users (email, display_name, apple_user_id, auth_mode, email_verified, is_active, created_at, setup_completed_at)
           VALUES ($1, $2, $3, 'apple', true, true, NOW(), NOW())
           RETURNING *`,
          [userEmail.toLowerCase(), displayName, appleUserId]
        );
        user = result.rows[0];
      }
    } else {
      // No email provided and no existing account - create with Apple ID as identifier
      const result = await db.query(
        `INSERT INTO users (display_name, apple_user_id, auth_mode, email_verified, is_active, created_at, setup_completed_at)
         VALUES ($1, $2, 'apple', true, true, NOW(), NOW())
         RETURNING *`,
        [`Apple User ${appleUserId.substring(0, 8)}`, appleUserId]
      );
      user = result.rows[0];
    }

    // Generate tokens
    const roleNames = user.roles ? (Array.isArray(user.roles) ? user.roles : [user.roles]) : ['user'];
    const tokens = generateTokens(user.id, user.email || '', roleNames, []);

    // Update last login
    await db.query(
      `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
      [user.id]
    ).catch(err => console.error('[Auth] Failed to update Apple user login:', err));

    console.log(`[Auth] Apple Sign In successful: ${user.email || user.id}`);

    res.json({
      success: true,
      token: tokens.accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.display_name,
        role: roleNames[0] || 'user'
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    });
  } catch (error) {
    console.error('[Auth] Apple Sign In error:', error);
    res.status(500).json(
      createErrorResponse(
        AuthErrorCode.DATABASE_ERROR,
        'Apple Sign In failed. Please try again.'
      )
    );
  }
});

// Register endpoint
router.post('/register', apiRateLimits.auth, async (req, res) => {
  try {
    const parseResult = registerSchema.safeParse(req.body);

    if (!parseResult.success) {
      const { fieldErrors, formErrors } = parseResult.error.flatten();
      console.warn('[Auth] Registration validation failed:', fieldErrors);
      return res.status(400).json(
        createErrorResponse(
          AuthErrorCode.VALIDATION_ERROR,
          'Invalid registration data. Please check your inputs.',
          { fieldErrors, formErrors }
        )
      );
    }

    const payload: RegisterPayload = {
      email: parseResult.data.email.trim().toLowerCase(),
      name: parseResult.data.name.trim(),
      password: parseResult.data.password,
      authMode: parseResult.data.authMode,
      username: parseResult.data.username
    };

    // Validate passwordless mode requirements
    if (payload.authMode === 'passwordless' && payload.password) {
      console.warn('[Auth] Passwordless registration attempted with password provided');
      return res.status(400).json(
        createErrorResponse(
          AuthErrorCode.VALIDATION_ERROR,
          'Passwordless authentication does not require a password.',
          { field: 'password' }
        )
      );
    }

    // Validate password mode requirements
    if (payload.authMode === 'password' && !payload.password) {
      console.warn('[Auth] Password registration attempted without password');
      return res.status(400).json(
        createErrorResponse(
          AuthErrorCode.PASSWORD_REQUIRED,
          'Password is required for password-based authentication.',
          { field: 'password' }
        )
      );
    }

    // Check database availability first
    let dbAvailable = false;
    try {
      await db.query('SELECT 1');
      dbAvailable = true;
    } catch (dbError) {
      console.error('[Auth] Database not available for registration:', dbError);
    }

    if (!dbAvailable && !useMockAuth) {
      return res.status(503).json(
        createErrorResponse(
          AuthErrorCode.SERVICE_UNAVAILABLE,
          'Database service temporarily unavailable. Please try again later.',
          { retry: true, retryAfter: 30 }
        )
      );
    }

    const { user } = await userAccountService.register(payload);

    // Safely extract role names with null check
    const roleNames = Array.isArray(user.roles)
      ? user.roles.map(role => typeof role === 'string' ? role : role.name).filter(Boolean)
      : ['user'];
    const permissions = Array.isArray(user.permissions) ? user.permissions : [];

    const tokens = generateTokens(user.id, user.email, roleNames, permissions);

    console.log(`[Auth] User registered successfully: ${user.email} (authMode: ${payload.authMode})`);

    return res.status(201).json({
      success: true,
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 900,
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: 900
      },
      requiresVerification: false,
      message: 'Registration successful! You can now sign in.'
    });
  } catch (error: any) {
    console.error('[Auth] Registration error:', error);

    // Handle specific database errors
    if (error.code === '23505') { // PostgreSQL unique violation
      const field = error.constraint?.includes('email') ? 'email' : 'username';
      console.warn(`[Auth] Duplicate ${field} registration attempt:`, error.detail);
      return res.status(409).json(
        createErrorResponse(
          field === 'email' ? AuthErrorCode.EMAIL_EXISTS : AuthErrorCode.USERNAME_EXISTS,
          `A user with this ${field} already exists. Please try signing in instead.`,
          { field, canLogin: true }
        )
      );
    }

    // UserAccountError handling with proper error codes
    if (error instanceof UserAccountError) {
      let errorCode = AuthErrorCode.DATABASE_ERROR;

      if (error.message.includes('email') && error.message.includes('exists')) {
        errorCode = AuthErrorCode.EMAIL_EXISTS;
      } else if (error.message.includes('username') && error.message.includes('exists')) {
        errorCode = AuthErrorCode.USERNAME_EXISTS;
      } else if (error.message.includes('validation')) {
        errorCode = AuthErrorCode.VALIDATION_ERROR;
      }

      return res.status(error.status).json(
        createErrorResponse(errorCode, error.message)
      );
    }

    // Generic error fallback with logging
    console.error('[Auth] Unhandled registration error:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });

    return res.status(500).json(
      createErrorResponse(
        AuthErrorCode.DATABASE_ERROR,
        'Registration failed due to a server error. Please try again later.',
        { retry: true }
      )
    );
  }
});

// Refresh token endpoint
router.post('/refresh', apiRateLimits.auth, async (req, res) => {
  try {
    const { refreshToken, deviceId } = req.body;

    if (!refreshToken) {
      return res.status(400).json(
        createErrorResponse(
          AuthErrorCode.VALIDATION_ERROR,
          'Refresh token is required'
        )
      );
    }
    
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, REFRESH_SECRET) as any;
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }
      
      // Validate token in database if deviceId provided
      if (deviceId) {
        const result = await db.query(
          'SELECT * FROM refresh_tokens WHERE user_id = $1 AND device_id = $2 AND token = $3 AND expires_at > NOW()',
          [decoded.userId, deviceId, refreshToken]
        ).catch(() => null);
        
        // For mock/dev, allow even if DB check fails
        if (process.env.NODE_ENV === 'production' && (!result || result.rows.length === 0)) {
          throw new Error('Token not found or expired');
        }
      }
      
      // Look up the requesting user
      let dbUser: any = null;
      try {
        const userResult = await db.query(
          `SELECT id, email, username, display_name, roles, permissions, is_admin,
                  created_at, updated_at, setup_completed_at
           FROM users
           WHERE id = $1`,
          [decoded.userId]
        );

        dbUser = userResult.rows[0] || null;
      } catch (dbError) {
        console.warn('Database error during refresh, attempting mock fallback:', dbError);
      }

      if (!dbUser && useMockAuth) {
        const mockUser = getMockUserById(decoded.userId);
        if (mockUser) {
          const tokens = generateTokens(mockUser.id, mockUser.email, mockUser.roles);
          return res.json({
            success: true,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresIn: 900,
            tokens: {
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              expiresIn: 900,
            },
            user: sanitizeUserResponse(mockUser),
          });
        }
      }

      if (!dbUser) {
        return res.status(404).json(
          createErrorResponse(
            AuthErrorCode.USER_NOT_FOUND,
            'User account not found'
          )
        );
      }
      const userRoles: string[] = Array.isArray(dbUser.roles) && dbUser.roles.length > 0
        ? dbUser.roles
        : ['user'];

      // Generate new tokens based on the real user
      const tokens = generateTokens(dbUser.id, dbUser.email, userRoles);
      
      // Update refresh token in database
      if (deviceId) {
        await db.query(
          `UPDATE refresh_tokens 
           SET token = $1, expires_at = NOW() + INTERVAL '30 days'
           WHERE user_id = $2 AND device_id = $3`,
          [tokens.refreshToken, dbUser.id, deviceId]
        ).catch(() => {});
      }
      
      res.json({
        success: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: 900,
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: 900
        },
        user: {
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.display_name,
          username: dbUser.username,
          roles: userRoles.map((role) => ({
            id: role,
            name: role,
            permissions: []
          })),
          permissions: dbUser.permissions || [],
          createdAt: dbUser.created_at,
          updatedAt: dbUser.updated_at,
          isAdmin: dbUser.is_admin,
          setupCompletedAt: dbUser.setup_completed_at
        }
      });
    } catch (error) {
      res.status(401).json(
        createErrorResponse(
          AuthErrorCode.INVALID_TOKEN,
          'Invalid or expired refresh token'
        )
      );
    }
  } catch (error) {
    console.error('[Auth] Token refresh error:', error);
    res.status(500).json(
      createErrorResponse(
        AuthErrorCode.DATABASE_ERROR,
        'Token refresh failed due to a server error'
      )
    );
  }
});

// Get current user endpoint
router.get('/me', async (req, res) => {
  // REMOVED: Auth bypass mode - all users must authenticate properly

  // Require authentication with proper Bearer token format
  const token = extractBearerToken(req.headers['authorization']);

  if (!token) {
    return res.status(401).json(
      createErrorResponse(
        AuthErrorCode.INVALID_TOKEN,
        'Authentication required. Please provide a valid Bearer token.'
      )
    );
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Validate decoded token has required fields
    if (!decoded || !decoded.userId) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token payload'
      });
    }

    // Fetch user from database
    let dbUser: any = null;
    try {
      const userResult = await db.query(
        `SELECT id, email, username, display_name, roles, permissions, is_admin, created_at, updated_at, last_login_at, setup_completed_at, avatar_url, preferences
         FROM users WHERE id = $1`,
        [decoded.userId]
      );

      dbUser = userResult.rows[0] || null;
    } catch (dbError) {
      console.warn('Database error fetching user profile, attempting mock fallback:', dbError);
    }

    if (!dbUser && useMockAuth) {
      const mockUser = getMockUserById(decoded.userId);
      if (mockUser) {
        return res.json({ success: true, user: sanitizeUserResponse(mockUser) });
      }
    }

    if (!dbUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Fetch user's farms (using owner_id column)
    const farmsResult = await db.query(
      'SELECT id, name, status FROM farms WHERE owner_id = $1 OR created_by_user_id = $1 OR $2 = true',
      [decoded.userId, dbUser.is_admin]
    ).catch(() => ({ rows: [] }));

    // Fetch user's harvests (optimized with JOIN instead of subquery)
    const harvestsResult = await db.query(
      `SELECT h.id, h.farm_id, h.status, h.created_at
       FROM harvests h
       INNER JOIN farms f ON h.farm_id = f.id
       WHERE f.owner_id = $1 OR f.created_by_user_id = $1`,
      [decoded.userId]
    ).catch(() => ({ rows: [] }));

    // Parse preferences from JSON if they exist (with error handling)
    let preferences: Record<string, any> = {};
    if (dbUser.preferences) {
      if (typeof dbUser.preferences === 'string') {
        try {
          preferences = JSON.parse(dbUser.preferences);
        } catch (parseError) {
          console.warn('[Auth] Failed to parse user preferences JSON:', parseError);
          preferences = {};
        }
      } else if (typeof dbUser.preferences === 'object') {
        preferences = dbUser.preferences;
      }
    }

    // Construct full user object
    const user = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.display_name,
      username: dbUser.username,
      avatar: dbUser.avatar_url,
      roles: dbUser.roles?.map((role: string) => ({
        id: role,
        name: role,
        permissions: []
      })) || [],
      permissions: dbUser.permissions || [],
      isAdmin: dbUser.is_admin,
      createdAt: dbUser.created_at,
      updatedAt: dbUser.updated_at,
      lastLogin: dbUser.last_login_at,
      setupCompletedAt: dbUser.setup_completed_at,
      farms: farmsResult.rows,
      harvests: harvestsResult.rows,
      preferences
    };

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
});

// Profile endpoint (alias for /me for backwards compatibility)
router.get('/profile', async (req, res) => {
  // REMOVED: Auth bypass mode - all users must authenticate properly

  // Require authentication with proper Bearer token format
  const token = extractBearerToken(req.headers['authorization']);

  if (!token) {
    return res.status(401).json(
      createErrorResponse(
        AuthErrorCode.INVALID_TOKEN,
        'Authentication required. Please provide a valid Bearer token.'
      )
    );
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    if (!decoded || !decoded.userId) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token payload'
      });
    }

    // Fetch user from database
    const userResult = await db.query(
      `SELECT id, email, username, display_name, roles, permissions, is_admin, created_at, updated_at, last_login_at, setup_completed_at, avatar_url, preferences
       FROM users WHERE id = $1`,
      [decoded.userId]
    );

    const dbUser = userResult.rows[0] || null;

    if (!dbUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Format user response
    const user = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.display_name || dbUser.username || dbUser.email.split('@')[0],
      username: dbUser.username,
      displayName: dbUser.display_name,
      avatar: dbUser.avatar_url,
      roles: Array.isArray(dbUser.roles) ? dbUser.roles.map((r: any) =>
        typeof r === 'string' ? { id: r, name: r, permissions: [] } : r
      ) : [{ id: 'user', name: 'user', permissions: [] }],
      permissions: Array.isArray(dbUser.permissions) ? dbUser.permissions : [],
      isAdmin: dbUser.is_admin,
      createdAt: dbUser.created_at,
      updatedAt: dbUser.updated_at,
      lastLogin: dbUser.last_login_at,
      setupCompletedAt: dbUser.setup_completed_at,
      preferences: dbUser.preferences || {}
    };

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
});

// Setup status endpoint (for initial setup check)
router.get('/setup-status', async (req, res) => {
  // REMOVED: Auth bypass mode
  const bypassMode = false;

  try {
    let hasAdminUser = false;
    let totalUsers = 0;
    let dbAvailable = false;

    // Try to check database, but handle connection failures gracefully
    try {
      // First check if database connection is available
      await db.query('SELECT 1');
      dbAvailable = true;

      // Check if users table exists
      const tableCheckResult = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'users'
        ) as exists
      `);

      if (tableCheckResult.rows[0]?.exists) {
        // Table exists, now we can safely query it
        const adminCountResult = await db.query('SELECT COUNT(*)::int as count FROM users WHERE is_admin = true');
        hasAdminUser = (adminCountResult.rows[0]?.count || 0) > 0;

        const totalResult = await db.query('SELECT COUNT(*)::int as count FROM users');
        totalUsers = totalResult.rows[0]?.count || 0;
      }
    } catch (dbError: any) {
      console.warn('[Auth] Database check failed, using fallback:', dbError.message);
      // Database not ready, but don't fail the endpoint
      dbAvailable = false;
    }

    const isNewInstall = totalUsers === 0;
    const userContext = await resolveUserFromRequest(req as Request);

    const setupCompletedAt = userContext?.setup_completed_at || null;
    const requiresUserSetup = Boolean(userContext?.id) ? !setupCompletedAt : false;
    const requiresSetup = isNewInstall || requiresUserSetup || (!hasAdminUser && !bypassMode);

    res.json({
      success: true,
      requiresSetup,
      requiresUserSetup,
      hasAdminUser,
      totalUsers,
      isNewInstall,
      userSetupCompleted: Boolean(setupCompletedAt),
      setupCompletedAt,
      bypassMode,
      dbAvailable
    });
  } catch (error: any) {
    console.error('[Auth] Setup status check failed:', error.message);

    // Try mock auth fallback
    if (useMockAuth) {
      const users = Array.from(mockUsersById.values());
      const primaryUser = users.length > 0 ? users[0] : null;
      const setupCompletedAt = primaryUser?.setup_completed_at || null;

      return res.json({
        success: true,
        requiresSetup: users.length === 0 || !setupCompletedAt,
        requiresUserSetup: !setupCompletedAt,
        hasAdminUser: users.some((user: any) => user.is_admin),
        totalUsers: users.length,
        isNewInstall: users.length === 0,
        userSetupCompleted: Boolean(setupCompletedAt),
        setupCompletedAt,
        bypassMode,
        dbAvailable: false
      });
    }

    // Return a working response even on error
    res.json({
      success: true,
      requiresSetup: true,
      requiresUserSetup: true,
      hasAdminUser: false,
      totalUsers: 0,
      isNewInstall: true,
      userSetupCompleted: false,
      setupCompletedAt: null,
      bypassMode,
      dbAvailable: false
    });
  }
});

// Mark setup completion for authenticated user
router.post('/complete-setup', async (req, res) => {
  try {
    console.log('[Auth] Complete setup request received');

    // REMOVED: Auth bypass mode - all users must authenticate properly

    const userContext = await resolveUserFromRequest(req as Request);

    if (!userContext?.id) {
      console.warn('[Auth] Complete setup failed: No user context found');
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - Please ensure you are logged in'
      });
    }

    const { preferences } = req.body;

    console.log(`[Auth] Completing setup for user ${userContext.id}`);

    const result = await userAccountService.completeSetup(userContext.id, preferences);

    console.log(`[Auth] Setup completed successfully for user ${userContext.id}`);
    if (preferences) {
      console.log(`[Auth] Preferences saved with setup completion`);
    }

    res.json({
      success: true,
      setupCompletedAt: result.setupCompletedAt,
      preferencesSaved: !!preferences,
      preferences: result.preferences,
      source: result.source
    });
  } catch (error) {
    console.error('[Auth] Complete setup error:', error);

    if (error instanceof UserAccountError) {
      return res.status(error.status).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to complete setup - Internal server error'
    });
  }
});

// Send email verification
router.post('/send-verification', apiRateLimits.auth, async (req, res) => {
  try {
    const rawEmail = typeof req.body.email === 'string' ? req.body.email : '';
    const email = rawEmail.trim().toLowerCase();

    if (!email) {
      return res.status(400).json(
        createErrorResponse(
          AuthErrorCode.VALIDATION_ERROR,
          'Email is required to send a verification link.',
          { field: 'email' }
        )
      );
    }

    const userResult = await db.query(
      'SELECT id, email, username, email_verified FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json(
        createErrorResponse(
          AuthErrorCode.USER_NOT_FOUND,
          'No account found with that email address.',
          { email }
        )
      );
    }

    const user = userResult.rows[0];

    if (user.email_verified) {
      return res.status(400).json(
        createErrorResponse(
          AuthErrorCode.VALIDATION_ERROR,
          'This email has already been verified.',
          { email: user.email }
        )
      );
    }

    const verificationToken = emailService.generateVerificationToken();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_WINDOW_MS);

    await db.query(
      `UPDATE users
       SET email_verification_token = $1,
           email_verification_expires_at = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [verificationToken, expiresAt, user.id]
    );

    const emailSent = await emailService.sendVerificationEmail(
      user.email,
      verificationToken,
      user.username
    );

    if (!emailSent) {
      return res.status(502).json(
        createErrorResponse(
          AuthErrorCode.EMAIL_SEND_FAILED,
          'Failed to send verification email. Please try again later.',
          { email: user.email }
        )
      );
    }

    console.log(`[Auth] Verification email sent to ${user.email}`);

    return res.json({
      success: true,
      message: 'Verification email sent',
      details: {
        email: user.email,
        expiresAt: expiresAt.toISOString()
      }
    });
  } catch (error) {
    console.error('[Auth] Send verification error:', error);
    return res.status(500).json(
      createErrorResponse(
        AuthErrorCode.DATABASE_ERROR,
        'Failed to send verification email. Please try again later.'
      )
    );
  }
});

// Verify email with token
router.get('/verify/:token', async (req, res) => {
  try {
    const token = typeof req.params.token === 'string' ? req.params.token.trim() : '';

    if (!token) {
      return res.status(400).json(
        createErrorResponse(
          AuthErrorCode.VALIDATION_ERROR,
          'Verification token is required.'
        )
      );
    }

    const userResult = await db.query(
      `SELECT id, email, username, email_verification_expires_at
       FROM users
       WHERE email_verification_token = $1`,
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json(
        createErrorResponse(
          AuthErrorCode.INVALID_TOKEN,
          'Invalid or expired verification token.',
          { reason: 'not_found' }
        )
      );
    }

    const user = userResult.rows[0];
    const expiresAt = user.email_verification_expires_at
      ? new Date(user.email_verification_expires_at)
      : null;

    if (!expiresAt || expiresAt.getTime() < Date.now()) {
      return res.status(400).json(
        createErrorResponse(
          AuthErrorCode.INVALID_TOKEN,
          'Invalid or expired verification token.',
          { reason: 'expired' }
        )
      );
    }

    await db.query(
      `UPDATE users
       SET email_verified = true,
           email_verification_token = NULL,
           email_verification_expires_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    try {
      await emailService.sendWelcomeEmail(user.email, user.username);
    } catch (welcomeError) {
      console.warn('[Auth] Welcome email failed after verification:', welcomeError);
    }

    console.log(`[Auth] Email verified for user ${user.email}`);

    return res.json({
      success: true,
      message: 'Email verified successfully',
      email: user.email
    });
  } catch (error) {
    console.error('[Auth] Email verification error:', error);
    return res.status(500).json(
      createErrorResponse(
        AuthErrorCode.DATABASE_ERROR,
        'Failed to verify email. Please try again later.'
      )
    );
  }
});

// Request password reset
router.post('/forgot-password', apiRateLimits.auth, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Find user by email
    const userResult = await db.query(
      'SELECT id, email, username FROM users WHERE email = $1',
      [email]
    );

    // Always return success to prevent email enumeration
    if (userResult.rows.length === 0) {
      console.log(`[Auth] Password reset requested for non-existent email: ${email}`);
      return res.json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent'
      });
    }

    const user = userResult.rows[0];

    // Generate password reset token
    const resetToken = emailService.generatePasswordResetToken();

    // Update user with reset token
    await db.query(
      `UPDATE users
       SET password_reset_token = $1,
           password_reset_requested_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [resetToken, user.id]
    );

    // Send password reset email
    await emailService.sendPasswordResetEmail(
      user.email,
      resetToken,
      user.username
    );

    console.log(`[Auth] Password reset email sent to ${user.email}`);

    res.json({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent'
    });
  } catch (error) {
    console.error('[Auth] Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process password reset request'
    });
  }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Token and new password are required'
      });
    }

    // Validate token format and expiration
    const tokenValidation = emailService.validatePasswordResetToken(token);
    if (!tokenValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token'
      });
    }

    // Find user by reset token
    const userResult = await db.query(
      'SELECT id, email FROM users WHERE password_reset_token = $1',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token'
      });
    }

    const user = userResult.rows[0];

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update user password and clear reset token
    await db.query(
      `UPDATE users
       SET password_hash = $1,
           password_reset_token = NULL,
           password_reset_requested_at = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    console.log(`[Auth] Password reset successful for user ${user.email}`);

    res.json({
      success: true,
      message: 'Password reset successful'
    });
  } catch (error) {
    console.error('[Auth] Reset password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset password'
    });
  }
});

// Logout endpoint
router.post('/logout', apiRateLimits.auth, async (req, res) => {
  try {
    const token = extractBearerToken(req.headers['authorization']);
    const { deviceId } = req.body;

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        if (decoded?.userId) {
          // Invalidate refresh tokens for this user/device
          if (deviceId) {
            await db.query(
              'DELETE FROM refresh_tokens WHERE user_id = $1 AND device_id = $2',
              [decoded.userId, deviceId]
            ).catch(err => {
              console.warn('[Auth] Failed to delete device refresh token:', err.message);
            });
          } else {
            // If no deviceId, invalidate all refresh tokens for this user
            await db.query(
              'DELETE FROM refresh_tokens WHERE user_id = $1',
              [decoded.userId]
            ).catch(err => {
              console.warn('[Auth] Failed to delete user refresh tokens:', err.message);
            });
          }

          console.log(`[Auth] User ${decoded.userId} logged out successfully`);
        }
      } catch (tokenError) {
        // Token might be expired, but we still complete the logout
        console.warn('[Auth] Token verification failed during logout (non-critical):', tokenError);
      }
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('[Auth] Logout error:', error);
    // Still return success to client - logout should never fail from user perspective
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  }
});

// Biometric authentication endpoint
router.post('/biometric', apiRateLimits.auth, async (req, res) => {
  try {
    const { deviceId, biometricToken } = req.body;
    
    if (!deviceId || !biometricToken) {
      return res.status(400).json({
        success: false,
        error: 'Device ID and biometric token required'
      });
    }
    
    // Verify biometric token (in production, this would validate with device)
    // For iOS, this would be validated against stored Face ID/Touch ID credentials
    const result = await db.query(
      `SELECT u.* FROM users u
       JOIN user_devices ud ON u.id = ud.user_id
       WHERE ud.device_id = $1 AND ud.biometric_enabled = true`,
      [deviceId]
    ).catch(() => null);
    
    // For development, allow mock biometric auth
    const user = result?.rows[0] || mockUser;
    
    const tokens = generateTokens(user.id, user.email, ['admin']);
    
    res.json({
      success: true,
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 900
    });
  } catch (error) {
    console.error('Biometric auth error:', error);
    res.status(500).json({
      success: false,
      error: 'Biometric authentication failed'
    });
  }
});

// API Key authentication for persistent sessions
router.post('/api-key', apiRateLimits.auth, async (req, res) => {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API key required'
      });
    }
    
    // Validate API key
    const result = await db.query(
      `SELECT u.*, ak.id as key_id, ak.name as key_name
       FROM api_keys ak
       JOIN users u ON ak.user_id = u.id
       WHERE ak.key = $1 AND ak.active = true`,
      [apiKey]
    ).catch(() => null);
    
    if (!result || result.rows.length === 0) {
      // For development, allow mock API key
      if (apiKey === 'dev-api-key') {
        const tokens = generateTokens(mockUser.id, mockUser.email, ['admin']);
        return res.json({
          success: true,
          user: mockUser,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: 900
        });
      }
      
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }
    
    const user = result.rows[0];
    const tokens = generateTokens(user.id, user.email, ['admin']);
    
    // Update last used timestamp for API key
    await db.query(
      'UPDATE api_keys SET last_used = NOW() WHERE id = $1',
      [user.key_id]
    ).catch(() => {});
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 900
    });
  } catch (error) {
    console.error('API key auth error:', error);
    res.status(500).json({
      success: false,
      error: 'API key authentication failed'
    });
  }
});

export default router;
