import * as crypto from 'crypto';

/**
 * Create a hash of the given data using the specified algorithm
 * @param data - The data to hash
 * @param algorithm - The hash algorithm to use (default: 'sha256')
 * @returns The hex-encoded hash string
 */
export function createHash(data: string, algorithm: string = 'sha256'): string {
  return crypto.createHash(algorithm).update(data).digest('hex');
}

/**
 * Generate a random string of the specified length
 * @param length - The length of the random string
 * @returns A random hex string
 */
export function generateRandomString(length: number = 32): string {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

/**
 * Create a hash with salt
 * @param data - The data to hash
 * @param salt - The salt to use
 * @param algorithm - The hash algorithm to use (default: 'sha256')
 * @returns The hex-encoded hash string
 */
export function createHashWithSalt(data: string, salt: string, algorithm: string = 'sha256'): string {
  return crypto.createHash(algorithm).update(data + salt).digest('hex');
}

/**
 * Compare a plain text value with a hash
 * @param plainText - The plain text to compare
 * @param hash - The hash to compare against
 * @param salt - Optional salt if the hash was created with salt
 * @param algorithm - The hash algorithm used (default: 'sha256')
 * @returns True if the plain text matches the hash
 */
export function compareHash(plainText: string, hash: string, salt?: string, algorithm: string = 'sha256'): boolean {
  const computedHash = salt 
    ? createHashWithSalt(plainText, salt, algorithm)
    : createHash(plainText, algorithm);
  return computedHash === hash;
}

/**
 * Generate a cryptographically secure random salt
 * @param length - The length of the salt in bytes (default: 16)
 * @returns A hex-encoded salt string
 */
export function generateSalt(length: number = 16): string {
  return crypto.randomBytes(length).toString('hex');
}

// Re-export crypto module for direct access if needed
export { crypto };