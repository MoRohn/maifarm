import { db } from '../database/connection';
import { logger } from '../utils/logger';

interface SettingValue {
  key: string;
  value: any;
  userId?: string;
  updatedAt: Date;
}

/**
 * Service for managing application settings
 * Provides centralized access to user and system preferences
 */
class SettingsService {
  private cache: Map<string, any> = new Map();
  private cacheTimeout = 60000; // 1 minute cache
  private lastCacheUpdate = 0;

  /**
   * Get a setting value by key
   */
  async getSetting(key: string, userId?: string): Promise<any> {
    try {
      // Check cache first
      const cacheKey = userId ? `${userId}:${key}` : key;
      if (this.cache.has(cacheKey) && Date.now() - this.lastCacheUpdate < this.cacheTimeout) {
        return this.cache.get(cacheKey);
      }

      // Query database
      const query = userId
        ? 'SELECT value FROM user_settings WHERE key = $1 AND user_id = $2'
        : 'SELECT value FROM system_settings WHERE key = $1';
      
      const params = userId ? [key, userId] : [key];
      const result = await db.query(query, params);

      if (result.rows.length > 0) {
        const value = result.rows[0].value;
        this.cache.set(cacheKey, value);
        this.lastCacheUpdate = Date.now();
        return value;
      }

      // Check environment variables as fallback for system settings
      if (!userId) {
        const envKey = key.replace(/([A-Z])/g, '_$1').toUpperCase();
        const envValue = process.env[envKey];
        if (envValue !== undefined) {
          // Parse boolean strings
          if (envValue === 'true') return true;
          if (envValue === 'false') return false;
          return envValue;
        }
      }

      return undefined;
    } catch (error) {
      logger.error('[SettingsService] Error getting setting:', error);
      return undefined;
    }
  }

  /**
   * Set a setting value
   */
  async setSetting(key: string, value: any, userId?: string): Promise<boolean> {
    try {
      const cacheKey = userId ? `${userId}:${key}` : key;
      
      if (userId) {
        // User setting
        await db.query(
          `INSERT INTO user_settings (key, value, user_id, updated_at) 
           VALUES ($1, $2, $3, NOW()) 
           ON CONFLICT (key, user_id) 
           DO UPDATE SET value = $2, updated_at = NOW()`,
          [key, value, userId]
        );
      } else {
        // System setting
        await db.query(
          `INSERT INTO system_settings (key, value, updated_at) 
           VALUES ($1, $2, NOW()) 
           ON CONFLICT (key) 
           DO UPDATE SET value = $2, updated_at = NOW()`,
          [key, value]
        );
      }

      // Update cache
      this.cache.set(cacheKey, value);
      this.lastCacheUpdate = Date.now();

      logger.info(`[SettingsService] Updated setting ${key} = ${value} for ${userId || 'system'}`);
      return true;
    } catch (error) {
      logger.error('[SettingsService] Error setting value:', error);
      return false;
    }
  }

  /**
   * Get multiple settings at once
   */
  async getSettings(keys: string[], userId?: string): Promise<Record<string, any>> {
    const settings: Record<string, any> = {};
    
    for (const key of keys) {
      settings[key] = await this.getSetting(key, userId);
    }
    
    return settings;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    this.lastCacheUpdate = 0;
  }
}

// Export singleton instance
export const settingsService = new SettingsService();