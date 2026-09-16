import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PoolClient } from 'pg';

import { db } from '../database/connection';
import { emailService } from './emailService';
import { shouldEnforceEmailVerification } from '../config/authSettings';
import { logger, LogCategory } from './ProductionLogger';

// Custom error class for email already exists - exported for use in userAccountService
export class EmailExistsError extends Error {
  constructor(message: string = 'Email already exists') {
    super(message);
    this.name = 'EmailExistsError';
  }
}

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;
const USER_CREATION_LOCK_KEY = 48721032; // Consistent advisory lock to serialize user creation
const EMAIL_VERIFICATION_TTL_HOURS = parseInt(process.env.USER_EMAIL_VERIFICATION_HOURS || '48', 10);

export interface RawUserRecord {
  id: string;
  email: string;
  username: string;
  display_name: string;
  roles: string[];
  permissions: string[];
  is_admin: boolean;
  is_active: boolean;
  auth_mode: 'password' | 'passwordless';
  email_verified: boolean;
  preferences: any;
  avatar_url: string | null;
  setup_completed_at: Date | null;
  last_login_at: Date | null;
  mfa_enabled: boolean | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserCreationInput {
  email: string;
  password?: string;
  authMode?: 'password' | 'passwordless';
  username?: string;
  name?: string;
  displayName?: string;
  avatarUrl?: string | null;
  roles?: string[];
  permissions?: string[];
  preferences?: Record<string, any>;
  isActive?: boolean;
  sendWelcomeEmail?: boolean;
  requireEmailVerification?: boolean;
  createdByUserId?: string;
  metadata?: Record<string, any>;
}

export interface UserCreationResult {
  user: RawUserRecord;
  isFirstUser: boolean;
  verificationToken?: string | null;
}

const userCreationSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).optional(),
  authMode: z.enum(['password', 'passwordless']).optional(),
  username: z.string().regex(USERNAME_REGEX).optional(),
  name: z.string().min(2).max(100).optional(),
  displayName: z.string().min(2).max(100).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  roles: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
  preferences: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
  sendWelcomeEmail: z.boolean().optional(),
  requireEmailVerification: z.boolean().optional(),
  createdByUserId: z.string().min(1).optional(),
  metadata: z.record(z.any()).optional()
});

class UserCreationService {
  async createUser(input: UserCreationInput): Promise<UserCreationResult> {
    const parsed = userCreationSchema.parse(input);
    const normalizedEmail = parsed.email.trim().toLowerCase();

    const authMode: 'password' | 'passwordless' = parsed.authMode || (parsed.password ? 'password' : 'passwordless');
    if (authMode === 'password' && !parsed.password) {
      throw new Error('Password must be provided for password authentication');
    }

    const baseDisplayName = (parsed.displayName || parsed.name || parsed.username || normalizedEmail.split('@')[0]).trim();
    const sendWelcomeEmail = parsed.sendWelcomeEmail ?? true;
    const enforceEmailVerification = shouldEnforceEmailVerification();
    // Only force verification when enforcement is enabled (e.g. prod or email service active)
    const requireEmailVerification = enforceEmailVerification
      ? (parsed.requireEmailVerification ?? (authMode === 'passwordless'))
      : false;

    const creationResult = await db.transaction(async (client: PoolClient) => {
      try {
        // Use advisory lock to prevent concurrent user creation race conditions
        await client.query('SELECT pg_advisory_xact_lock($1)', [USER_CREATION_LOCK_KEY]);

        await this.assertEmailAvailable(client, normalizedEmail);

        const sanitizedBaseUsername = this.sanitizeUsername(parsed.username || baseDisplayName || normalizedEmail);
        const username = await this.ensureUniqueUsername(client, sanitizedBaseUsername);

        const isFirstUser = await this.isFirstUser(client);
        const roles = this.deriveRoles(parsed.roles, isFirstUser);

        // Default permissions for regular users
        const defaultPermissions = [
          'farms:read',
          'farms:create',
          'farms:update',
          'farms:delete',
          'farms:control',
          'farms:harvest',
          'farms:write'
        ];

        // If admin, grant all permissions
        const userPermissions = roles.includes('admin')
          ? ['*']
          : (parsed.permissions || defaultPermissions);

        const permissions = Array.from(new Set(userPermissions));
        const isAdmin = roles.includes('admin');

        const passwordHash = authMode === 'password' && parsed.password
          ? await bcrypt.hash(parsed.password, 10)
          : null;

        const emailVerified = !requireEmailVerification;
        const verificationToken = requireEmailVerification ? emailService.generateVerificationToken() : null;
        const verificationExpiry = verificationToken
          ? new Date(Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000)
          : null;

        const userId = uuidv4();
        const preferences = parsed.preferences ? JSON.stringify(parsed.preferences) : JSON.stringify({});
        const avatarUrl = parsed.avatarUrl ?? null;
        const isActive = parsed.isActive ?? true;

        const insertResult = await client.query<RawUserRecord>(
          `INSERT INTO users (
            id, email, username, display_name, password_hash, roles, permissions,
            preferences, auth_mode, email_verified, email_verification_token,
            email_verification_expires_at, is_admin, is_active, avatar_url,
            mfa_enabled, last_login_at, setup_completed_at, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11,
            $12, $13, $14, $15,
            $16, NULL, NULL, NOW(), NOW()
          )
          RETURNING
            id, email, username, display_name, roles, permissions, is_admin, is_active,
            auth_mode, email_verified, preferences, avatar_url, setup_completed_at,
            last_login_at, mfa_enabled, created_at, updated_at`,
          [
            userId,
            normalizedEmail,
            username,
            baseDisplayName,
            passwordHash,
            roles,
            permissions,
            preferences,
            authMode,
            emailVerified,
            verificationToken,
            verificationExpiry,
            isAdmin,
            isActive,
            avatarUrl,
            false
          ]
        );

        const user = insertResult.rows[0];

        await this.logAuditEvent(client, parsed.createdByUserId || userId, userId, {
          roles,
          permissions,
          authMode,
          isFirstUser,
          metadata: parsed.metadata || {}
        });

        return {
          user,
          isFirstUser,
          verificationToken,
          emailPayload: {
            email: normalizedEmail,
            displayName: baseDisplayName,
            verificationToken,
            shouldSendVerification: Boolean(verificationToken),
            sendWelcomeEmail,
            emailVerified
          }
        };
      } catch (error) {
        // Transaction will automatically rollback on error
        logger.error(LogCategory.DATABASE, 'User creation transaction failed', error as Error);
        throw error;
      }
    });

    this.handlePostCreationEmails(creationResult.emailPayload).catch(error => {
      logger.warn(LogCategory.API, 'Failed to send user creation email', error as Error);
    });

    return {
      user: creationResult.user,
      isFirstUser: creationResult.isFirstUser,
      verificationToken: creationResult.verificationToken
    };
  }

  private sanitizeUsername(value: string): string {
    const sanitized = value
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30);

    if (sanitized.length === 0) {
      return `user_${Date.now().toString().slice(-6)}`;
    }
    return sanitized;
  }

  private async ensureUniqueUsername(client: PoolClient, base: string): Promise<string> {
    let candidate = base;
    let attempts = 0;

    while (attempts < 20) {
      const existing = await client.query('SELECT 1 FROM users WHERE username = $1', [candidate]);
      if (existing.rows.length === 0) {
        return candidate;
      }
      attempts++;
      candidate = `${base}_${Math.random().toString(36).slice(2, 6)}`.slice(0, 30);
    }

    throw new Error('Unable to generate unique username');
  }

  private async assertEmailAvailable(client: PoolClient, email: string): Promise<void> {
    const result = await client.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (result.rows.length > 0) {
      throw new EmailExistsError();
    }
  }

  private async isFirstUser(client: PoolClient): Promise<boolean> {
    const result = await client.query('SELECT COUNT(*)::int AS count FROM users');
    return result.rows[0]?.count === 0;
  }

  private deriveRoles(explicitRoles: string[] | undefined, isFirstUser: boolean): string[] {
    if (explicitRoles && explicitRoles.length > 0) {
      return Array.from(new Set(explicitRoles.map(role => role.trim())));
    }
    return isFirstUser ? ['admin', 'user'] : ['user'];
  }

  private async logAuditEvent(
    client: PoolClient,
    actorId: string,
    resourceId: string,
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      // Use a savepoint so audit log failures don't abort the main transaction
      await client.query('SAVEPOINT audit_log');
      await client.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, timestamp)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [actorId, 'CREATE_USER', 'user', resourceId, metadata]
      );
      await client.query('RELEASE SAVEPOINT audit_log');
    } catch (error) {
      // Rollback to savepoint so transaction can continue
      await client.query('ROLLBACK TO SAVEPOINT audit_log').catch(() => {});
      logger.warn(LogCategory.API, 'Failed to write user creation audit log', error as Error);
    }
  }

  private async handlePostCreationEmails(options: {
    email: string;
    displayName: string;
    verificationToken: string | null;
    shouldSendVerification: boolean;
    sendWelcomeEmail: boolean;
    emailVerified: boolean;
  }): Promise<void> {
    const { email, displayName, verificationToken, shouldSendVerification, sendWelcomeEmail, emailVerified } = options;

    if (shouldSendVerification && verificationToken) {
      await emailService.sendVerificationEmail(email, verificationToken, displayName);
      return;
    }

    if (sendWelcomeEmail && emailVerified) {
      await emailService.sendWelcomeEmail(email, displayName);
    }
  }
}

export const userCreationService = new UserCreationService();
