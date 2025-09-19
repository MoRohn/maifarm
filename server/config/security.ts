import * as crypto from 'crypto';
import { logger } from '../utils/logger';

/**
 * Centralized security configuration
 * Ensures no hardcoded secrets and proper encryption
 */
class SecurityConfig {
  private static instance: SecurityConfig;
  private readonly requiredEnvVars = [
    'JWT_SECRET',
    'API_KEY_ENCRYPTION_KEY',
    'SESSION_SECRET'
  ];

  private constructor() {
    this.validateEnvironment();
  }

  static getInstance(): SecurityConfig {
    if (!SecurityConfig.instance) {
      SecurityConfig.instance = new SecurityConfig();
    }
    return SecurityConfig.instance;
  }

  /**
   * Validate that required security environment variables are set
   */
  private validateEnvironment(): void {
    const missing: string[] = [];
    
    for (const varName of this.requiredEnvVars) {
      if (!process.env[varName]) {
        missing.push(varName);
      }
    }

    if (missing.length > 0 && process.env.NODE_ENV === 'production') {
      const error = `SECURITY ERROR: Missing required environment variables: ${missing.join(', ')}`;
      logger.error(error);
      throw new Error(error);
    }

    if (missing.length > 0 && process.env.NODE_ENV !== 'production') {
      logger.warn(`Security Warning: Missing environment variables: ${missing.join(', ')}`);
      logger.warn('Using development defaults - DO NOT USE IN PRODUCTION');
    }
  }

  /**
   * Get JWT secret with validation
   */
  getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET is required in production');
      }
      // Generate a random secret for development
      const devSecret = this.generateSecureToken(32);
      logger.warn('Using generated JWT secret for development');
      return devSecret;
    }

    // Validate secret strength
    if (secret.length < 32) {
      logger.warn('JWT_SECRET should be at least 32 characters for security');
    }

    return secret;
  }

  /**
   * Get API key encryption key
   */
  getApiKeyEncryptionKey(): string {
    const key = process.env.API_KEY_ENCRYPTION_KEY;
    
    if (!key) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('API_KEY_ENCRYPTION_KEY is required in production');
      }
      // Generate for development
      const devKey = this.generateSecureToken(32);
      logger.warn('Using generated encryption key for development');
      return devKey;
    }

    return key;
  }

  /**
   * Get session secret
   */
  getSessionSecret(): string {
    const secret = process.env.SESSION_SECRET;
    
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('SESSION_SECRET is required in production');
      }
      const devSecret = this.generateSecureToken(32);
      logger.warn('Using generated session secret for development');
      return devSecret;
    }

    return secret;
  }

  /**
   * Generate a cryptographically secure random token
   */
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Hash a password using scrypt
   */
  async hashPassword(password: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(16).toString('hex');
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) reject(err);
        resolve(salt + ':' + derivedKey.toString('hex'));
      });
    });
  }

  /**
   * Verify a password against a hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const [salt, key] = hash.split(':');
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) reject(err);
        resolve(key === derivedKey.toString('hex'));
      });
    });
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(text: string): string {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(this.getApiKeyEncryptionKey(), 'hex').slice(0, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData: string): string {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(this.getApiKeyEncryptionKey(), 'hex').slice(0, 32);
    
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Generate CSRF token
   */
  generateCsrfToken(): string {
    return this.generateSecureToken(24);
  }

  /**
   * Validate CSRF token
   */
  validateCsrfToken(token: string, sessionToken: string): boolean {
    return token === sessionToken && token.length === 48;
  }

  /**
   * Sanitize user input to prevent XSS
   */
  sanitizeInput(input: string): string {
    // Basic HTML entity encoding
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Validate email format
   */
  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate UUID format
   */
  isValidUuid(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Check if running in production
   */
  isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  /**
   * Check if authentication bypass is enabled (development only)
   */
  isBypassAuthEnabled(): boolean {
    return process.env.BYPASS_AUTH === 'true' && !this.isProduction();
  }

  /**
   * Get secure cookie options
   */
  getCookieOptions(): any {
    return {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    };
  }

  /**
   * Rate limit configuration
   */
  getRateLimitConfig(): any {
    return {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: this.isProduction() ? 100 : 1000, // Limit requests
      message: 'Too many requests, please try again later',
      standardHeaders: true,
      legacyHeaders: false
    };
  }

  /**
   * Get allowed CORS origins
   */
  getAllowedOrigins(): string[] {
    const origins = process.env.ALLOWED_ORIGINS?.split(',') || [];
    
    if (!this.isProduction()) {
      // Add development origins
      origins.push(
        'http://localhost:3000',
        'http://localhost:4567',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:4567'
      );
    }

    return origins;
  }

  /**
   * Validate API key format
   */
  isValidApiKey(apiKey: string): boolean {
    // API keys should be at least 32 characters
    return apiKey.length >= 32;
  }

  /**
   * Generate API key
   */
  generateApiKey(): string {
    return `mf_${this.generateSecureToken(32)}`;
  }

  /**
   * Get security headers
   */
  getSecurityHeaders(): any {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Content-Security-Policy': this.isProduction() 
        ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
        : "default-src *; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline';"
    };
  }
}

// Export singleton instance
export const securityConfig = SecurityConfig.getInstance();

// Export commonly used functions
export const {
  getJwtSecret,
  getApiKeyEncryptionKey,
  getSessionSecret,
  generateSecureToken,
  hashPassword,
  verifyPassword,
  encrypt,
  decrypt,
  sanitizeInput,
  isValidEmail,
  isValidUuid,
  isProduction,
  isBypassAuthEnabled,
  getCookieOptions,
  getSecurityHeaders
} = securityConfig;