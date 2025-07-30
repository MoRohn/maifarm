import { Buffer } from 'buffer';

// Simple encryption utilities for client-side data protection
// Note: For production, use a more robust encryption library

export class EncryptionService {
  private static readonly ALGORITHM = 'AES-GCM';
  private static readonly KEY_LENGTH = 256;
  private static readonly IV_LENGTH = 16;
  private static readonly SALT_LENGTH = 32;
  private static readonly TAG_LENGTH = 16;
  private static readonly ITERATIONS = 100000;

  /**
   * Generate a random encryption key
   */
  static async generateKey(): Promise<string> {
    const key = crypto.getRandomValues(new Uint8Array(32));
    return this.arrayBufferToBase64(key);
  }

  /**
   * Derive a key from a password
   */
  static async deriveKey(
    password: string,
    salt: Uint8Array
  ): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    const importedKey = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: this.ITERATIONS,
        hash: 'SHA-256'
      },
      importedKey,
      { name: this.ALGORITHM, length: this.KEY_LENGTH },
      true,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt data with a password
   */
  static async encrypt(data: string, password: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);

      // Generate random salt and IV
      const salt = crypto.getRandomValues(new Uint8Array(this.SALT_LENGTH));
      const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));

      // Derive key from password
      const key = await this.deriveKey(password, salt);

      // Encrypt the data
      const encryptedData = await crypto.subtle.encrypt(
        {
          name: this.ALGORITHM,
          iv: iv
        },
        key,
        dataBuffer
      );

      // Combine salt, iv, and encrypted data
      const combined = new Uint8Array(
        salt.length + iv.length + encryptedData.byteLength
      );
      combined.set(salt, 0);
      combined.set(iv, salt.length);
      combined.set(new Uint8Array(encryptedData), salt.length + iv.length);

      return this.arrayBufferToBase64(combined);
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data with a password
   */
  static async decrypt(encryptedData: string, password: string): Promise<string> {
    try {
      const combined = this.base64ToArrayBuffer(encryptedData);
      const combinedArray = new Uint8Array(combined);

      // Extract salt, iv, and encrypted data
      const salt = combinedArray.slice(0, this.SALT_LENGTH);
      const iv = combinedArray.slice(this.SALT_LENGTH, this.SALT_LENGTH + this.IV_LENGTH);
      const data = combinedArray.slice(this.SALT_LENGTH + this.IV_LENGTH);

      // Derive key from password
      const key = await this.deriveKey(password, salt);

      // Decrypt the data
      const decryptedData = await crypto.subtle.decrypt(
        {
          name: this.ALGORITHM,
          iv: iv
        },
        key,
        data
      );

      const decoder = new TextDecoder();
      return decoder.decode(decryptedData);
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Hash a password for storage
   */
  static async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return this.arrayBufferToBase64(hash);
  }

  /**
   * Generate a secure random token
   */
  static generateToken(length: number = 32): string {
    const array = crypto.getRandomValues(new Uint8Array(length));
    return this.arrayBufferToBase64(array);
  }

  /**
   * Convert ArrayBuffer to Base64
   */
  private static arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert Base64 to ArrayBuffer
   */
  private static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

/**
 * Secure storage wrapper for encrypted local storage
 */
export class SecureStorage {
  private static encryptionKey: string | null = null;

  static async init(password: string): Promise<void> {
    this.encryptionKey = await EncryptionService.hashPassword(password);
  }

  static async setItem(key: string, value: any): Promise<void> {
    if (!this.encryptionKey) {
      throw new Error('SecureStorage not initialized');
    }

    const data = JSON.stringify(value);
    const encrypted = await EncryptionService.encrypt(data, this.encryptionKey);
    localStorage.setItem(`secure_${key}`, encrypted);
  }

  static async getItem<T>(key: string): Promise<T | null> {
    if (!this.encryptionKey) {
      throw new Error('SecureStorage not initialized');
    }

    const encrypted = localStorage.getItem(`secure_${key}`);
    if (!encrypted) return null;

    try {
      const decrypted = await EncryptionService.decrypt(encrypted, this.encryptionKey);
      return JSON.parse(decrypted);
    } catch {
      return null;
    }
  }

  static removeItem(key: string): void {
    localStorage.removeItem(`secure_${key}`);
  }

  static clear(): void {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('secure_')) {
        localStorage.removeItem(key);
      }
    });
  }
}