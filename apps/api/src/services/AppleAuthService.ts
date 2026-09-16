/**
 * Apple Sign-In Authentication Service
 *
 * Handles verification of Apple identity tokens and user management
 * for iOS app authentication.
 *
 * Security features:
 * - JWT signature verification against Apple's public keys
 * - Token expiration validation
 * - Audience (app bundle ID) validation
 * - Issuer validation
 * - Nonce verification (when provided)
 * - Public key caching with automatic refresh
 */

import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { db } from '../database/connection';
import { logger, LogCategory } from './ProductionLogger';

// Apple's public key endpoint
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';

// Cache for Apple's public keys (refreshed every 24 hours)
interface ApplePublicKey {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

interface AppleKeysCache {
  keys: ApplePublicKey[];
  fetchedAt: number;
}

interface AppleTokenPayload {
  iss: string;           // Issuer (https://appleid.apple.com)
  aud: string;           // Audience (your app bundle ID)
  exp: number;           // Expiration time
  iat: number;           // Issued at
  sub: string;           // Subject (unique user identifier)
  nonce?: string;        // Nonce for replay protection
  nonce_supported?: boolean;
  email?: string;        // User's email (may be private relay)
  email_verified?: string | boolean;
  is_private_email?: string | boolean;
  real_user_status?: number; // 0=unsupported, 1=unknown, 2=likely real
  auth_time?: number;
}

interface AppleAuthUser {
  id: string;
  appleUserId: string;
  email: string | null;
  displayName: string;
  isPrivateEmail: boolean;
  isNewUser: boolean;
}

interface AppleAuthResult {
  success: boolean;
  user?: AppleAuthUser;
  error?: string;
  errorCode?: AppleAuthErrorCode;
}

export enum AppleAuthErrorCode {
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  INVALID_AUDIENCE = 'INVALID_AUDIENCE',
  INVALID_ISSUER = 'INVALID_ISSUER',
  INVALID_NONCE = 'INVALID_NONCE',
  KEY_FETCH_FAILED = 'KEY_FETCH_FAILED',
  DATABASE_ERROR = 'DATABASE_ERROR',
  ACCOUNT_DISABLED = 'ACCOUNT_DISABLED',
}

class AppleAuthService {
  private keysCache: AppleKeysCache | null = null;
  private keysCacheTTL = 24 * 60 * 60 * 1000; // 24 hours
  private keysFetchInProgress: Promise<ApplePublicKey[]> | null = null;

  // App bundle IDs that are allowed (configured via environment)
  private allowedAudiences: string[];

  constructor() {
    // Support multiple bundle IDs (e.g., dev and prod)
    const audiences = process.env.APPLE_APP_BUNDLE_IDS || process.env.APPLE_APP_BUNDLE_ID || '';
    this.allowedAudiences = audiences
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);

    if (this.allowedAudiences.length === 0) {
      logger.warn(LogCategory.AUTH, 'No Apple App Bundle IDs configured. Set APPLE_APP_BUNDLE_ID in .env');
    }
  }

  /**
   * Authenticate a user with Apple Sign-In
   *
   * @param identityToken - The JWT identity token from Apple
   * @param userInfo - Optional user info (only provided on first sign-in)
   * @param nonce - Optional nonce for replay protection
   */
  async authenticate(
    identityToken: string,
    userInfo?: { email?: string; name?: string },
    nonce?: string
  ): Promise<AppleAuthResult> {
    try {
      // Step 1: Verify the token
      const payload = await this.verifyIdentityToken(identityToken, nonce);

      if (!payload) {
        return {
          success: false,
          error: 'Failed to verify Apple identity token',
          errorCode: AppleAuthErrorCode.INVALID_TOKEN
        };
      }

      // Step 2: Find or create user
      const user = await this.findOrCreateUser(payload, userInfo);

      if (!user) {
        return {
          success: false,
          error: 'Failed to create or find user account',
          errorCode: AppleAuthErrorCode.DATABASE_ERROR
        };
      }

      // Step 3: Check if account is active
      if (!user.isActive) {
        return {
          success: false,
          error: 'Account has been disabled',
          errorCode: AppleAuthErrorCode.ACCOUNT_DISABLED
        };
      }

      logger.info(LogCategory.AUTH, 'Apple Sign-In successful', {
        userId: user.id,
        isNewUser: user.isNewUser,
        hasEmail: !!user.email
      });

      return {
        success: true,
        user: {
          id: user.id,
          appleUserId: user.appleUserId,
          email: user.email,
          displayName: user.displayName,
          isPrivateEmail: user.isPrivateEmail,
          isNewUser: user.isNewUser
        }
      };
    } catch (error) {
      logger.error(LogCategory.AUTH, 'Apple authentication failed', {
        error: error instanceof Error ? error.message : String(error)
      });

      if (error instanceof AppleAuthError) {
        return {
          success: false,
          error: error.message,
          errorCode: error.code
        };
      }

      return {
        success: false,
        error: 'Authentication failed',
        errorCode: AppleAuthErrorCode.INVALID_TOKEN
      };
    }
  }

  /**
   * Verify an Apple identity token
   */
  async verifyIdentityToken(token: string, expectedNonce?: string): Promise<AppleTokenPayload | null> {
    try {
      // Decode header to get key ID
      const header = this.decodeTokenHeader(token);
      if (!header || !header.kid) {
        throw new AppleAuthError('Invalid token header', AppleAuthErrorCode.INVALID_TOKEN);
      }

      // Get Apple's public key
      const publicKey = await this.getApplePublicKey(header.kid);
      if (!publicKey) {
        throw new AppleAuthError('Unable to find matching Apple public key', AppleAuthErrorCode.KEY_FETCH_FAILED);
      }

      // Build verify options
      const verifyOptions: jwt.VerifyOptions = {
        algorithms: ['RS256'],
        issuer: APPLE_ISSUER
      };

      // Add audience validation if configured
      if (this.allowedAudiences.length === 1) {
        verifyOptions.audience = this.allowedAudiences[0];
      } else if (this.allowedAudiences.length > 1) {
        // For multiple audiences, we validate manually after decode
      }

      // Verify and decode the token
      const payload = jwt.verify(token, publicKey, verifyOptions) as AppleTokenPayload;

      // Manual audience check for multiple bundle IDs
      if (this.allowedAudiences.length > 1 && !this.allowedAudiences.includes(payload.aud)) {
        throw new AppleAuthError('Invalid token audience', AppleAuthErrorCode.INVALID_AUDIENCE);
      }

      // Additional validations
      this.validatePayload(payload, expectedNonce);

      return payload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppleAuthError('Token has expired', AppleAuthErrorCode.TOKEN_EXPIRED);
      }
      if (error instanceof jwt.JsonWebTokenError) {
        if (error.message.includes('audience')) {
          throw new AppleAuthError('Invalid token audience', AppleAuthErrorCode.INVALID_AUDIENCE);
        }
        if (error.message.includes('issuer')) {
          throw new AppleAuthError('Invalid token issuer', AppleAuthErrorCode.INVALID_ISSUER);
        }
        throw new AppleAuthError('Invalid token signature', AppleAuthErrorCode.INVALID_SIGNATURE);
      }
      if (error instanceof AppleAuthError) {
        throw error;
      }

      logger.error(LogCategory.AUTH, 'Token verification failed', {
        error: error instanceof Error ? error.message : String(error)
      });

      throw new AppleAuthError('Token verification failed', AppleAuthErrorCode.INVALID_TOKEN);
    }
  }

  /**
   * Delete a user's account (App Store requirement)
   */
  async deleteAccount(userId: string): Promise<boolean> {
    try {
      // Soft delete: mark as inactive and anonymize data
      const result = await db.query(
        `UPDATE users
         SET is_active = false,
             email = NULL,
             display_name = 'Deleted User',
             apple_user_id = CONCAT('deleted_', apple_user_id),
             deleted_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
         RETURNING id`,
        [userId]
      );

      if (result.rows.length === 0) {
        logger.warn(LogCategory.AUTH, 'Account deletion failed: user not found', { userId });
        return false;
      }

      logger.info(LogCategory.AUTH, 'User account deleted', { userId });
      return true;
    } catch (error) {
      logger.error(LogCategory.AUTH, 'Account deletion failed', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Revoke Apple Sign-In (called when user revokes in Apple ID settings)
   * Apple sends a server-to-server notification for this
   */
  async handleAppleRevocation(appleUserId: string): Promise<boolean> {
    try {
      const result = await db.query(
        `UPDATE users
         SET is_active = false,
             updated_at = NOW()
         WHERE apple_user_id = $1
         RETURNING id`,
        [appleUserId]
      );

      if (result.rows.length > 0) {
        logger.info(LogCategory.AUTH, 'Apple Sign-In revoked', {
          userId: result.rows[0].id,
          appleUserId
        });
        return true;
      }

      return false;
    } catch (error) {
      logger.error(LogCategory.AUTH, 'Failed to handle Apple revocation', {
        appleUserId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  // Private methods

  private decodeTokenHeader(token: string): { kid: string; alg: string } | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      return header;
    } catch {
      return null;
    }
  }

  private async getApplePublicKey(keyId: string): Promise<string | null> {
    const keys = await this.fetchApplePublicKeys();
    const key = keys.find(k => k.kid === keyId);

    if (!key) {
      // Key not found - try refreshing cache
      this.keysCache = null;
      const refreshedKeys = await this.fetchApplePublicKeys();
      const refreshedKey = refreshedKeys.find(k => k.kid === keyId);

      if (!refreshedKey) {
        return null;
      }

      return this.convertJWKtoPEM(refreshedKey);
    }

    return this.convertJWKtoPEM(key);
  }

  private async fetchApplePublicKeys(): Promise<ApplePublicKey[]> {
    // Return cached keys if still valid
    if (this.keysCache && Date.now() - this.keysCache.fetchedAt < this.keysCacheTTL) {
      return this.keysCache.keys;
    }

    // Prevent multiple concurrent fetches
    if (this.keysFetchInProgress) {
      return this.keysFetchInProgress;
    }

    this.keysFetchInProgress = this.doFetchApplePublicKeys();

    try {
      const keys = await this.keysFetchInProgress;
      return keys;
    } finally {
      this.keysFetchInProgress = null;
    }
  }

  private async doFetchApplePublicKeys(): Promise<ApplePublicKey[]> {
    try {
      const response = await fetch(APPLE_KEYS_URL, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`Apple keys endpoint returned ${response.status}`);
      }

      const data = await response.json() as { keys: ApplePublicKey[] };

      if (!data.keys || !Array.isArray(data.keys)) {
        throw new Error('Invalid response format from Apple keys endpoint');
      }

      this.keysCache = {
        keys: data.keys,
        fetchedAt: Date.now()
      };

      logger.info(LogCategory.AUTH, 'Fetched Apple public keys', {
        keyCount: data.keys.length
      });

      return data.keys;
    } catch (error) {
      logger.error(LogCategory.AUTH, 'Failed to fetch Apple public keys', {
        error: error instanceof Error ? error.message : String(error)
      });

      // Return cached keys if available (even if stale)
      if (this.keysCache) {
        logger.warn(LogCategory.AUTH, 'Using stale Apple public keys due to fetch failure');
        return this.keysCache.keys;
      }

      throw new AppleAuthError('Unable to fetch Apple public keys', AppleAuthErrorCode.KEY_FETCH_FAILED);
    }
  }

  private convertJWKtoPEM(jwk: ApplePublicKey): string {
    // Convert JWK (n, e) to PEM format
    const n = Buffer.from(jwk.n, 'base64url');
    const e = Buffer.from(jwk.e, 'base64url');

    // Build the RSA public key in DER format
    const nLen = n.length;
    const eLen = e.length;

    // ASN.1 DER encoding for RSA public key
    const sequence = (contents: Buffer): Buffer => {
      const len = contents.length;
      if (len < 128) {
        return Buffer.concat([Buffer.from([0x30, len]), contents]);
      }
      const lenBytes = [];
      let tempLen = len;
      while (tempLen > 0) {
        lenBytes.unshift(tempLen & 0xff);
        tempLen >>= 8;
      }
      return Buffer.concat([
        Buffer.from([0x30, 0x80 | lenBytes.length, ...lenBytes]),
        contents
      ]);
    };

    const integer = (value: Buffer): Buffer => {
      // Add leading zero if high bit is set (to indicate positive number)
      const needsPadding = value[0] & 0x80;
      const len = value.length + (needsPadding ? 1 : 0);

      if (len < 128) {
        if (needsPadding) {
          return Buffer.concat([Buffer.from([0x02, len, 0x00]), value]);
        }
        return Buffer.concat([Buffer.from([0x02, len]), value]);
      }

      const lenBytes = [];
      let tempLen = len;
      while (tempLen > 0) {
        lenBytes.unshift(tempLen & 0xff);
        tempLen >>= 8;
      }

      if (needsPadding) {
        return Buffer.concat([
          Buffer.from([0x02, 0x80 | lenBytes.length, ...lenBytes, 0x00]),
          value
        ]);
      }
      return Buffer.concat([
        Buffer.from([0x02, 0x80 | lenBytes.length, ...lenBytes]),
        value
      ]);
    };

    // RSA public key structure: SEQUENCE { n INTEGER, e INTEGER }
    const rsaKey = sequence(Buffer.concat([integer(n), integer(e)]));

    // Wrap in SubjectPublicKeyInfo structure
    // Algorithm identifier for RSA: 1.2.840.113549.1.1.1
    const algorithmId = Buffer.from([
      0x30, 0x0d,                                           // SEQUENCE
      0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, // OID
      0x05, 0x00                                            // NULL
    ]);

    // BIT STRING wrapping the RSA key
    const bitString = Buffer.concat([
      Buffer.from([0x03, rsaKey.length + 1, 0x00]), // BIT STRING header with 0 unused bits
      rsaKey
    ]);

    const spki = sequence(Buffer.concat([algorithmId, bitString]));

    // Convert to PEM
    const base64 = spki.toString('base64');
    const lines = base64.match(/.{1,64}/g) || [];

    return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
  }

  private validatePayload(payload: AppleTokenPayload, expectedNonce?: string): void {
    // Validate issuer
    if (payload.iss !== APPLE_ISSUER) {
      throw new AppleAuthError('Invalid token issuer', AppleAuthErrorCode.INVALID_ISSUER);
    }

    // Validate audience if configured
    if (this.allowedAudiences.length > 0 && !this.allowedAudiences.includes(payload.aud)) {
      throw new AppleAuthError('Invalid token audience', AppleAuthErrorCode.INVALID_AUDIENCE);
    }

    // Validate nonce if provided
    if (expectedNonce && payload.nonce) {
      // Hash the expected nonce to compare (Apple hashes it with SHA256)
      const hashedNonce = crypto.createHash('sha256').update(expectedNonce).digest('hex');
      if (payload.nonce !== hashedNonce && payload.nonce !== expectedNonce) {
        throw new AppleAuthError('Invalid nonce', AppleAuthErrorCode.INVALID_NONCE);
      }
    }

    // Validate subject exists
    if (!payload.sub) {
      throw new AppleAuthError('Missing subject in token', AppleAuthErrorCode.INVALID_TOKEN);
    }
  }

  private async findOrCreateUser(
    payload: AppleTokenPayload,
    userInfo?: { email?: string; name?: string }
  ): Promise<{
    id: string;
    appleUserId: string;
    email: string | null;
    displayName: string;
    isPrivateEmail: boolean;
    isNewUser: boolean;
    isActive: boolean;
  } | null> {
    const appleUserId = payload.sub;
    const email = userInfo?.email || payload.email || null;
    const isPrivateEmail = payload.is_private_email === 'true' || payload.is_private_email === true;

    try {
      // Check for existing user by Apple ID
      const existingResult = await db.query(
        `SELECT id, apple_user_id, email, display_name, is_active
         FROM users
         WHERE apple_user_id = $1`,
        [appleUserId]
      );

      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];

        // Update last login
        await db.query(
          `UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [existing.id]
        );

        return {
          id: existing.id,
          appleUserId: existing.apple_user_id,
          email: existing.email,
          displayName: existing.display_name,
          isPrivateEmail,
          isNewUser: false,
          isActive: existing.is_active
        };
      }

      // Check if email exists (to link accounts)
      if (email) {
        const emailResult = await db.query(
          `SELECT id, display_name, is_active
           FROM users
           WHERE email = $1 AND apple_user_id IS NULL`,
          [email.toLowerCase()]
        );

        if (emailResult.rows.length > 0) {
          // Link Apple ID to existing account
          const existing = emailResult.rows[0];

          await db.query(
            `UPDATE users
             SET apple_user_id = $1,
                 auth_mode = 'apple',
                 last_login_at = NOW(),
                 updated_at = NOW()
             WHERE id = $2`,
            [appleUserId, existing.id]
          );

          logger.info(LogCategory.AUTH, 'Linked Apple ID to existing account', {
            userId: existing.id,
            email
          });

          return {
            id: existing.id,
            appleUserId,
            email,
            displayName: existing.display_name,
            isPrivateEmail,
            isNewUser: false,
            isActive: existing.is_active
          };
        }
      }

      // Create new user
      const displayName = userInfo?.name ||
                          (email ? email.split('@')[0] : null) ||
                          `User ${appleUserId.substring(0, 8)}`;

      const insertResult = await db.query(
        `INSERT INTO users (
          email,
          display_name,
          apple_user_id,
          auth_mode,
          email_verified,
          is_active,
          created_at,
          last_login_at,
          setup_completed_at
        ) VALUES ($1, $2, $3, 'apple', true, true, NOW(), NOW(), NOW())
        RETURNING id`,
        [email?.toLowerCase() || null, displayName, appleUserId]
      );

      const newUserId = insertResult.rows[0].id;

      logger.info(LogCategory.AUTH, 'Created new Apple Sign-In user', {
        userId: newUserId,
        hasEmail: !!email
      });

      return {
        id: newUserId,
        appleUserId,
        email: email?.toLowerCase() || null,
        displayName,
        isPrivateEmail,
        isNewUser: true,
        isActive: true
      };
    } catch (error) {
      logger.error(LogCategory.AUTH, 'Database error in findOrCreateUser', {
        appleUserId,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }
}

class AppleAuthError extends Error {
  code: AppleAuthErrorCode;

  constructor(message: string, code: AppleAuthErrorCode) {
    super(message);
    this.code = code;
    this.name = 'AppleAuthError';
  }
}

// Export singleton instance
export const appleAuthService = new AppleAuthService();

// Export types and error class
export { AppleAuthError };
export type { AppleAuthResult, AppleAuthUser, AppleTokenPayload };
