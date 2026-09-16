/**
 * Authentication Settings
 *
 * MaiFarm uses Apple Sign-In as the primary (and only) authentication method.
 * This provides:
 * - Zero-friction sign-in (Face ID / Touch ID)
 * - No passwords to manage or breach
 * - Built-in identity verification
 * - Privacy-focused (Hide My Email support)
 *
 * Email verification is not needed since Apple verifies identities.
 */

// Apple Sign-In configuration
export const appleAuthConfig = {
  // App bundle ID(s) for token audience validation
  bundleIds: (process.env.APPLE_APP_BUNDLE_IDS || process.env.APPLE_APP_BUNDLE_ID || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean),

  // Apple's identity token issuer
  issuer: 'https://appleid.apple.com',

  // Apple's public keys endpoint
  keysUrl: 'https://appleid.apple.com/auth/keys',

  // How long to cache Apple's public keys (24 hours)
  keysCacheTtlMs: 24 * 60 * 60 * 1000
};

// JWT configuration
export const jwtConfig = {
  secret: process.env.JWT_SECRET || 'maifarm-secret-change-in-production',
  refreshSecret: process.env.REFRESH_SECRET || 'maifarm-refresh-secret-change-in-production',
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '30d'
};

// Development bypass (NEVER enable in production)
export const isDevelopmentBypass = process.env.NODE_ENV === 'development' &&
  process.env.BYPASS_AUTH === 'true';

// Legacy: Email verification is disabled (Apple handles identity)
export const isEmailServiceEnabled = false;

/**
 * Email verification is disabled for all environments.
 * Apple Sign-In provides verified identities.
 */
export function shouldEnforceEmailVerification(): boolean {
  return false;
}

/**
 * Check if auth configuration is properly set up for production
 */
export function validateAuthConfig(): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (appleAuthConfig.bundleIds.length === 0) {
    warnings.push('APPLE_APP_BUNDLE_ID not configured - Apple Sign-In will fail');
  }

  if (jwtConfig.secret.includes('change-in-production') || jwtConfig.secret.includes('maifarm-secret')) {
    warnings.push('JWT_SECRET should be changed from default value');
  }

  if (jwtConfig.refreshSecret.includes('change-in-production') || jwtConfig.refreshSecret.includes('maifarm-refresh')) {
    warnings.push('REFRESH_SECRET should be changed from default value');
  }

  if (process.env.NODE_ENV === 'production' && isDevelopmentBypass) {
    warnings.push('BYPASS_AUTH is enabled in production - this is a security risk');
  }

  return {
    valid: warnings.length === 0,
    warnings
  };
}
