import { db } from '../database/connection';
import { logger, LogCategory } from '../utils/logger';
import * as fs from 'fs/promises';
import path from 'path';

interface SettingValue {
  key: string;
  value: any;
  userId?: string;
  updatedAt: Date;
}

/**
 * Service for managing application settings
 * Provides centralized access to user and system preferences
 *
 * Performance optimizations:
 * - Per-key cache timestamps for granular invalidation
 * - Bulk query support to avoid N+1 problems
 * - Batched fallback writes to reduce disk I/O
 * - Performance metrics tracking
 */
class SettingsService {
  private cache: Map<string, any> = new Map();
  private cacheTimestamps: Map<string, number> = new Map(); // Per-key cache timestamps
  private cacheTimeout = 60000; // 1 minute cache
  private fallbackPath = path.resolve(process.cwd(), 'var', 'settings', 'system-settings.json');
  private fallbackData: Record<string, any> | null = null;
  private pendingFallbackWrites: Set<string> = new Set(); // Batched writes
  private fallbackWriteTimer: NodeJS.Timeout | null = null;

  // Performance metrics
  private metrics = {
    cacheHits: 0,
    cacheMisses: 0,
    dbQueries: 0,
    dbErrors: 0,
    avgQueryTime: 0,
    queryCount: 0
  };

  /**
   * Get a setting value by key
   */
  async getSetting(key: string, userId?: string): Promise<any> {
    const cacheKey = userId ? `${userId}:${key}` : key;
    try {
      // Check cache first with per-key timestamp
      const cacheTimestamp = this.cacheTimestamps.get(cacheKey) || 0;
      if (this.cache.has(cacheKey) && Date.now() - cacheTimestamp < this.cacheTimeout) {
        this.metrics.cacheHits++;
        return this.cache.get(cacheKey);
      }

      // Cache miss - query database
      this.metrics.cacheMisses++;
      const startTime = Date.now();

      const query = userId
        ? 'SELECT value FROM user_settings WHERE key = $1 AND user_id = $2'
        : 'SELECT value FROM system_settings WHERE key = $1';

      const params = userId ? [key, userId] : [key];
      const result = await db.query(query, params);

      // Track query performance
      const queryTime = Date.now() - startTime;
      this.updateQueryMetrics(queryTime);

      if (result.rows.length > 0) {
        const value = result.rows[0].value;
        this.cache.set(cacheKey, value);
        this.cacheTimestamps.set(cacheKey, Date.now());
        this.scheduleFallbackWrite(key, value, userId);
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
      logger.warn(LogCategory.SYSTEM, 'Error getting setting from database, falling back to disk cache:', error);
      return this.getFallbackValue(key, userId);
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

      // Update cache with per-key timestamp
      this.cache.set(cacheKey, value);
      this.cacheTimestamps.set(cacheKey, Date.now());
      this.scheduleFallbackWrite(key, value, userId);

      return true;
    } catch (error) {
      this.metrics.dbErrors++;
      logger.error(LogCategory.SYSTEM, 'Error setting value in database, updating disk cache instead:', error);
      this.scheduleFallbackWrite(key, value, userId);
      const cacheKey = userId ? `${userId}:${key}` : key;
      this.cache.set(cacheKey, value);
      this.cacheTimestamps.set(cacheKey, Date.now());
      return true;
    }
  }

  /**
   * Get multiple settings at once (optimized bulk query)
   */
  async getSettings(keys: string[], userId?: string): Promise<Record<string, any>> {
    const settings: Record<string, any> = {};
    const uncachedKeys: string[] = [];

    // Check cache first
    for (const key of keys) {
      const cacheKey = userId ? `${userId}:${key}` : key;
      const cacheTimestamp = this.cacheTimestamps.get(cacheKey) || 0;
      if (this.cache.has(cacheKey) && Date.now() - cacheTimestamp < this.cacheTimeout) {
        settings[key] = this.cache.get(cacheKey);
        this.metrics.cacheHits++;
      } else {
        uncachedKeys.push(key);
        this.metrics.cacheMisses++;
      }
    }

    // Bulk query for uncached keys (prevents N+1)
    if (uncachedKeys.length > 0) {
      try {
        const startTime = Date.now();
        const query = userId
          ? 'SELECT key, value FROM user_settings WHERE key = ANY($1) AND user_id = $2'
          : 'SELECT key, value FROM system_settings WHERE key = ANY($1)';

        const params = userId ? [uncachedKeys, userId] : [uncachedKeys];
        const result = await db.query(query, params);

        const queryTime = Date.now() - startTime;
        this.updateQueryMetrics(queryTime);

        // Update cache and results
        for (const row of result.rows) {
          settings[row.key] = row.value;
          const cacheKey = userId ? `${userId}:${row.key}` : row.key;
          this.cache.set(cacheKey, row.value);
          this.cacheTimestamps.set(cacheKey, Date.now());
        }
      } catch (error) {
        this.metrics.dbErrors++;
        logger.error(LogCategory.SYSTEM, 'Error bulk fetching settings:', error);
        // Fall back to individual queries for uncached keys
        for (const key of uncachedKeys) {
          settings[key] = await this.getSetting(key, userId);
        }
      }
    }

    return settings;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheTimestamps.clear();
    this.fallbackData = null;
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    const cacheHitRate = this.metrics.cacheHits + this.metrics.cacheMisses > 0
      ? (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)) * 100
      : 0;

    return {
      ...this.metrics,
      cacheHitRate: cacheHitRate.toFixed(2) + '%',
      avgQueryTime: this.metrics.avgQueryTime.toFixed(2) + 'ms'
    };
  }

  /**
   * Schedule a batched fallback write (reduces disk I/O)
   */
  private scheduleFallbackWrite(key: string, value: any, userId?: string): void {
    const writeKey = userId ? `${userId}:${key}` : key;
    this.pendingFallbackWrites.add(writeKey);

    // Debounce writes - flush after 1 second of inactivity
    if (this.fallbackWriteTimer) {
      clearTimeout(this.fallbackWriteTimer);
    }

    this.fallbackWriteTimer = setTimeout(async () => {
      await this.flushPendingFallbackWrites();
    }, 1000);
  }

  /**
   * Flush pending fallback writes in batch
   */
  private async flushPendingFallbackWrites(): Promise<void> {
    if (this.pendingFallbackWrites.size === 0) return;

    await this.ensureFallbackLoaded();
    if (!this.fallbackData) {
      this.fallbackData = {};
    }

    // Process all pending writes
    for (const writeKey of this.pendingFallbackWrites) {
      const [userIdOrKey, actualKey] = writeKey.includes(':')
        ? writeKey.split(':')
        : [null, writeKey];

      if (userIdOrKey && actualKey) {
        // User setting
        const userSettings = this.fallbackData.__users ?? {};
        const existing = userSettings[userIdOrKey] ?? {};
        const cacheKey = `${userIdOrKey}:${actualKey}`;
        userSettings[userIdOrKey] = { ...existing, [actualKey]: this.cache.get(cacheKey) };
        this.fallbackData.__users = userSettings;
      } else {
        // System setting
        this.fallbackData[writeKey] = this.cache.get(writeKey);
      }
    }

    await this.flushFallback();
    this.pendingFallbackWrites.clear();
  }

  /**
   * Update query performance metrics
   */
  private updateQueryMetrics(queryTime: number): void {
    this.metrics.dbQueries++;
    this.metrics.queryCount++;

    // Calculate rolling average
    this.metrics.avgQueryTime =
      (this.metrics.avgQueryTime * (this.metrics.queryCount - 1) + queryTime) /
      this.metrics.queryCount;
  }

  /**
   * Get all system settings (used by API)
   */
  async getAllSystemSettings(): Promise<Record<string, any>> {
    try {
      const result = await db.query('SELECT key, value FROM system_settings ORDER BY key');
      const settings = result.rows.reduce((acc: Record<string, any>, row: SettingValue) => {
        acc[row.key] = row.value;
        return acc;
      }, {});
      await this.persistFallbackSnapshot(settings);
      return settings;
    } catch (error) {
      logger.warn(LogCategory.SYSTEM, 'Failed to load settings from database, using disk cache snapshot', error);
      return this.getFallbackSnapshot();
    }
  }

  private async ensureFallbackLoaded(): Promise<void> {
    if (this.fallbackData) {
      return;
    }
    try {
      const raw = await fs.readFile(this.fallbackPath, 'utf-8');
      this.fallbackData = JSON.parse(raw);
    } catch {
      this.fallbackData = {};
      await fs.mkdir(path.dirname(this.fallbackPath), { recursive: true }).catch(() => {});
    }
  }

  // Removed: persistFallbackValue - replaced with batched scheduleFallbackWrite

  private async persistFallbackSnapshot(settings: Record<string, any>): Promise<void> {
    await this.ensureFallbackLoaded();
    this.fallbackData = {
      ...(this.fallbackData || {}),
      ...settings,
    };
    await this.flushFallback();
  }

  private async flushFallback(): Promise<void> {
    if (!this.fallbackData) {
      return;
    }
    await fs.mkdir(path.dirname(this.fallbackPath), { recursive: true }).catch(() => {});
    await fs.writeFile(this.fallbackPath, JSON.stringify(this.fallbackData, null, 2));
  }

  private async getFallbackValue(key: string, userId?: string): Promise<any> {
    await this.ensureFallbackLoaded();
    if (!this.fallbackData) {
      return undefined;
    }
    if (userId) {
      return this.fallbackData.__users?.[userId]?.[key];
    }
    return this.fallbackData[key];
  }

  private async getFallbackSnapshot(): Promise<Record<string, any>> {
    await this.ensureFallbackLoaded();
    if (!this.fallbackData) {
      return {};
    }
    const { __users, ...system } = this.fallbackData;
    return system;
  }
}

// Export singleton instance
export const settingsService = new SettingsService();
