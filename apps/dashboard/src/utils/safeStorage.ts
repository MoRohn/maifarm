/**
 * Safe localStorage wrapper that handles:
 * - Incognito/private browsing mode where localStorage throws
 * - SSR/Node.js environments where localStorage doesn't exist
 * - Quota exceeded errors
 * - Security exceptions
 *
 * Usage:
 *   import { safeStorage } from '@/utils/safeStorage';
 *   const token = safeStorage.getItem('accessToken');
 *   safeStorage.setItem('theme', 'dark');
 */

type StorageValue = string | null;

interface SafeStorageOptions {
  /** Fallback to use when localStorage is unavailable */
  fallbackStorage?: Map<string, string>;
  /** Whether to log warnings when localStorage fails */
  logWarnings?: boolean;
}

class SafeStorage {
  private fallbackStorage: Map<string, string>;
  private logWarnings: boolean;
  private isAvailable: boolean | null = null;

  constructor(options: SafeStorageOptions = {}) {
    this.fallbackStorage = options.fallbackStorage ?? new Map();
    this.logWarnings = options.logWarnings ?? false;
  }

  /**
   * Check if localStorage is available and functional
   */
  private checkAvailability(): boolean {
    // Return cached result if we've already checked
    if (this.isAvailable !== null) {
      return this.isAvailable;
    }

    try {
      // Check if window and localStorage exist
      if (typeof window === 'undefined' || !window.localStorage) {
        this.isAvailable = false;
        return false;
      }

      // Test actual functionality with a test key
      const testKey = '__maifarm_storage_test__';
      window.localStorage.setItem(testKey, 'test');
      window.localStorage.removeItem(testKey);

      this.isAvailable = true;
      return true;
    } catch {
      // localStorage is not available (incognito mode, security restrictions, etc.)
      this.isAvailable = false;
      if (this.logWarnings) {
        console.warn('[SafeStorage] localStorage is not available, using in-memory fallback');
      }
      return false;
    }
  }

  /**
   * Get an item from storage
   */
  getItem(key: string): StorageValue {
    try {
      if (this.checkAvailability()) {
        return window.localStorage.getItem(key);
      }
      return this.fallbackStorage.get(key) ?? null;
    } catch (error) {
      if (this.logWarnings) {
        console.warn(`[SafeStorage] Error reading key "${key}":`, error);
      }
      return this.fallbackStorage.get(key) ?? null;
    }
  }

  /**
   * Set an item in storage
   */
  setItem(key: string, value: string): boolean {
    try {
      if (this.checkAvailability()) {
        window.localStorage.setItem(key, value);
        return true;
      }
      this.fallbackStorage.set(key, value);
      return true;
    } catch (error) {
      // Handle quota exceeded errors
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        if (this.logWarnings) {
          console.warn('[SafeStorage] Storage quota exceeded, using fallback');
        }
      } else if (this.logWarnings) {
        console.warn(`[SafeStorage] Error writing key "${key}":`, error);
      }
      // Fall back to memory storage
      this.fallbackStorage.set(key, value);
      return false;
    }
  }

  /**
   * Remove an item from storage
   */
  removeItem(key: string): boolean {
    try {
      if (this.checkAvailability()) {
        window.localStorage.removeItem(key);
      }
      this.fallbackStorage.delete(key);
      return true;
    } catch (error) {
      if (this.logWarnings) {
        console.warn(`[SafeStorage] Error removing key "${key}":`, error);
      }
      this.fallbackStorage.delete(key);
      return false;
    }
  }

  /**
   * Clear all items from storage
   */
  clear(): boolean {
    try {
      if (this.checkAvailability()) {
        window.localStorage.clear();
      }
      this.fallbackStorage.clear();
      return true;
    } catch (error) {
      if (this.logWarnings) {
        console.warn('[SafeStorage] Error clearing storage:', error);
      }
      this.fallbackStorage.clear();
      return false;
    }
  }

  /**
   * Get a key by index
   */
  key(index: number): StorageValue {
    try {
      if (this.checkAvailability()) {
        return window.localStorage.key(index);
      }
      const keys = Array.from(this.fallbackStorage.keys());
      return keys[index] ?? null;
    } catch (error) {
      if (this.logWarnings) {
        console.warn(`[SafeStorage] Error getting key at index ${index}:`, error);
      }
      return null;
    }
  }

  /**
   * Get the number of items in storage
   */
  get length(): number {
    try {
      if (this.checkAvailability()) {
        return window.localStorage.length;
      }
      return this.fallbackStorage.size;
    } catch {
      return this.fallbackStorage.size;
    }
  }

  /**
   * Check if storage is available (cached check)
   */
  get isStorageAvailable(): boolean {
    return this.checkAvailability();
  }

  /**
   * Get a JSON parsed value from storage
   */
  getJSON<T>(key: string, defaultValue: T): T {
    const value = this.getItem(key);
    if (value === null) {
      return defaultValue;
    }
    try {
      return JSON.parse(value) as T;
    } catch {
      return defaultValue;
    }
  }

  /**
   * Set a JSON stringified value to storage
   */
  setJSON<T>(key: string, value: T): boolean {
    try {
      return this.setItem(key, JSON.stringify(value));
    } catch (error) {
      if (this.logWarnings) {
        console.warn(`[SafeStorage] Error serializing value for key "${key}":`, error);
      }
      return false;
    }
  }
}

// Export a singleton instance for general use
export const safeStorage = new SafeStorage({ logWarnings: false });

// Export the class for cases where a custom instance is needed
export { SafeStorage };

// Export type-safe accessors for common keys
export const AUTH_KEYS = {
  ACCESS_TOKEN: 'accessToken',
  REFRESH_TOKEN: 'refreshToken',
  USER: 'user',
  AUTH_STATE: 'authState'
} as const;

export const getAccessToken = (): string | null => safeStorage.getItem(AUTH_KEYS.ACCESS_TOKEN);
export const setAccessToken = (token: string): boolean => safeStorage.setItem(AUTH_KEYS.ACCESS_TOKEN, token);
export const removeAccessToken = (): boolean => safeStorage.removeItem(AUTH_KEYS.ACCESS_TOKEN);

export const getRefreshToken = (): string | null => safeStorage.getItem(AUTH_KEYS.REFRESH_TOKEN);
export const setRefreshToken = (token: string): boolean => safeStorage.setItem(AUTH_KEYS.REFRESH_TOKEN, token);
export const removeRefreshToken = (): boolean => safeStorage.removeItem(AUTH_KEYS.REFRESH_TOKEN);
