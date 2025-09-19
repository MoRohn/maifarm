/**
 * Unified Cache Service - Stub Implementation
 */

import { BaseService } from './types';
import { logger, LogCategory } from '../../utils/logger';
import { redis } from '../../database/connection';

export class UnifiedCacheService implements BaseService {
  private cache = redis;

  async initialize(): Promise<void> {
    logger.info(LogCategory.CACHE, 'Cache Service initialized');
  }

  async shutdown(): Promise<void> {
    logger.info(LogCategory.CACHE, 'Cache Service shut down');
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      await this.cache.ping();
      return { healthy: true, message: 'Cache operational' };
    } catch (error) {
      return { healthy: false, message: error.message };
    }
  }

  getStats(): Record<string, any> {
    return { entries: 0 };
  }

  async get(key: string): Promise<any> {
    const value = await this.cache.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    const stringValue = JSON.stringify(value);
    if (ttl) {
      await this.cache.setex(key, ttl, stringValue);
    } else {
      await this.cache.set(key, stringValue);
    }
  }

  async delete(key: string): Promise<void> {
    await this.cache.del(key);
  }
}