/**
 * Safe localStorage wrapper with error handling and fallback to in-memory storage
 *
 * Handles edge cases:
 * - localStorage disabled (privacy mode)
 * - Quota exceeded
 * - Invalid JSON
 * - Access denied
 */

// In-memory fallback storage
const memoryStorage: Map<string, string> = new Map();

// Test if localStorage is available
let isLocalStorageAvailable = false;
try {
  const testKey = '__maifarm_ls_test__';
  localStorage.setItem(testKey, 'test');
  localStorage.removeItem(testKey);
  isLocalStorageAvailable = true;
} catch (e) {
  console.warn('[SafeLocalStorage] localStorage not available, using in-memory fallback');
  isLocalStorageAvailable = false;
}

/**
 * Safely set item in localStorage with automatic fallback
 * @param key Storage key
 * @param value String value to store
 * @returns true if successful, false otherwise
 */
export function safeLocalStorageSet(key: string, value: string): boolean {
  try {
    if (isLocalStorageAvailable) {
      localStorage.setItem(key, value);
      return true;
    } else {
      // Fallback to in-memory storage
      memoryStorage.set(key, value);
      return true;
    }
  } catch (error) {
    // Handle QuotaExceededError by clearing old data
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('[SafeLocalStorage] Quota exceeded, attempting to clear old data');
      try {
        // Clear old maifarm keys except critical ones
        const criticalKeys = ['accessToken', 'refreshToken', 'maifarm:initialized'];
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const keyToCheck = localStorage.key(i);
          if (keyToCheck && keyToCheck.startsWith('maifarm') && !criticalKeys.includes(keyToCheck)) {
            localStorage.removeItem(keyToCheck);
          }
        }

        // Retry set
        localStorage.setItem(key, value);
        return true;
      } catch (retryError) {
        // If still fails, use memory fallback
        console.error('[SafeLocalStorage] Failed to set after clearing, using memory fallback:', retryError);
        memoryStorage.set(key, value);
        return false;
      }
    }

    // For other errors, log and use memory fallback
    console.error('[SafeLocalStorage] Failed to set item, using memory fallback:', error);
    memoryStorage.set(key, value);
    return false;
  }
}

/**
 * Safely get item from localStorage with fallback
 * @param key Storage key
 * @returns Value or null if not found
 */
export function safeLocalStorageGet(key: string): string | null {
  try {
    if (isLocalStorageAvailable) {
      return localStorage.getItem(key);
    } else {
      return memoryStorage.get(key) || null;
    }
  } catch (error) {
    console.error('[SafeLocalStorage] Failed to get item, checking memory fallback:', error);
    return memoryStorage.get(key) || null;
  }
}

/**
 * Safely remove item from localStorage
 * @param key Storage key
 * @returns true if successful
 */
export function safeLocalStorageRemove(key: string): boolean {
  try {
    if (isLocalStorageAvailable) {
      localStorage.removeItem(key);
    }
    memoryStorage.delete(key);
    return true;
  } catch (error) {
    console.error('[SafeLocalStorage] Failed to remove item:', error);
    memoryStorage.delete(key);
    return false;
  }
}

/**
 * Safely clear all localStorage items
 * @returns true if successful
 */
export function safeLocalStorageClear(): boolean {
  try {
    if (isLocalStorageAvailable) {
      localStorage.clear();
    }
    memoryStorage.clear();
    return true;
  } catch (error) {
    console.error('[SafeLocalStorage] Failed to clear storage:', error);
    memoryStorage.clear();
    return false;
  }
}

/**
 * Get JSON value with automatic parsing and error handling
 * @param key Storage key
 * @param defaultValue Default value if parsing fails
 * @returns Parsed JSON object or default value
 */
export function safeLocalStorageGetJSON<T = any>(key: string, defaultValue: T): T {
  const value = safeLocalStorageGet(key);
  if (!value) {
    return defaultValue;
  }

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.error(`[SafeLocalStorage] Failed to parse JSON for key "${key}", using default:`, error);
    // Clear corrupted data
    safeLocalStorageRemove(key);
    return defaultValue;
  }
}

/**
 * Set JSON value with automatic stringification and error handling
 * @param key Storage key
 * @param value Object to store
 * @returns true if successful
 */
export function safeLocalStorageSetJSON(key: string, value: any): boolean {
  try {
    const jsonString = JSON.stringify(value);
    return safeLocalStorageSet(key, jsonString);
  } catch (error) {
    console.error(`[SafeLocalStorage] Failed to stringify JSON for key "${key}":`, error);
    return false;
  }
}

/**
 * Check if localStorage is available
 * @returns true if native localStorage is available
 */
export function isLocalStorageWorking(): boolean {
  return isLocalStorageAvailable;
}

/**
 * Get storage type being used
 * @returns 'localStorage' or 'memory'
 */
export function getStorageType(): 'localStorage' | 'memory' {
  return isLocalStorageAvailable ? 'localStorage' : 'memory';
}

// Export as default object for convenience
export default {
  set: safeLocalStorageSet,
  get: safeLocalStorageGet,
  remove: safeLocalStorageRemove,
  clear: safeLocalStorageClear,
  getJSON: safeLocalStorageGetJSON,
  setJSON: safeLocalStorageSetJSON,
  isWorking: isLocalStorageWorking,
  getType: getStorageType
};
