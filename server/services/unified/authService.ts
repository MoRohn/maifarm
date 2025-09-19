/**
 * Unified Auth Service - Stub Implementation
 */

import { BaseService } from './types';
import { UnifiedDatabaseService } from './databaseService';
import { UnifiedCacheService } from './cacheService';
import { logger, LogCategory } from '../../utils/logger';

export class UnifiedAuthService implements BaseService {
  constructor(
    private db: UnifiedDatabaseService,
    private cache: UnifiedCacheService
  ) {}

  async initialize(): Promise<void> {
    logger.info(LogCategory.AUTH, 'Auth Service initialized');
  }

  async shutdown(): Promise<void> {
    logger.info(LogCategory.AUTH, 'Auth Service shut down');
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return { healthy: true, message: 'Auth service operational' };
  }

  getStats(): Record<string, any> {
    return { sessions: 0 };
  }
}