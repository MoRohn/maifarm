/**
 * Comprehensive Error Recovery System for MaiFarm
 * Provides robust error handling, recovery strategies, and system resilience
 */

import { logger, LogCategory } from './logger';
import { db } from '../database/connection';
import { FarmError, ErrorCode } from '../types/errors';

export interface RecoveryStrategy {
  name: string;
  condition: (error: any) => boolean;
  recover: (error: any, context?: any) => Promise<void>;
  maxRetries: number;
}

export interface ErrorContext {
  operation: string;
  farmId?: string;
  agentId?: string;
  metadata?: Record<string, any>;
}

/**
 * Error Recovery Manager
 */
export class ErrorRecoveryManager {
  private static instance: ErrorRecoveryManager;
  private recoveryStrategies: Map<string, RecoveryStrategy> = new Map();
  private retryAttempts: Map<string, number> = new Map();

  static getInstance(): ErrorRecoveryManager {
    if (!ErrorRecoveryManager.instance) {
      ErrorRecoveryManager.instance = new ErrorRecoveryManager();
    }
    return ErrorRecoveryManager.instance;
  }

  constructor() {
    this.initializeStrategies();
  }

  /**
   * Initialize default recovery strategies
   */
  private initializeStrategies(): void {
    // Database column missing strategy
    this.registerStrategy({
      name: 'missing-column',
      condition: (error) => error.code === '42703', // PostgreSQL column not found
      recover: async (error, context) => {
        const match = error.message.match(/column "(\w+)" of relation "(\w+)" does not exist/);
        if (match) {
          const [, column, table] = match;
          logger.warn(LogCategory.DATABASE, `Attempting to add missing column ${column} to ${table}`);
          await this.addMissingColumn(table, column);
        }
      },
      maxRetries: 1
    });

    // WebSocket method missing strategy
    this.registerStrategy({
      name: 'missing-method',
      condition: (error) => error.message?.includes('is not a function'),
      recover: async (error, context) => {
        logger.warn(LogCategory.WEBSOCKET, `Method missing: ${error.message}. Using fallback.`);
        // Fallback handled in calling code
      },
      maxRetries: 0
    });

    // XenoSync not installed strategy
    this.registerStrategy({
      name: 'xenosync-missing',
      condition: (error) => error.message?.includes('XenoSync launcher not found'),
      recover: async (error, context) => {
        logger.warn(LogCategory.SYSTEM, 'XenoSync not found, attempting fallback to standard orchestration');
        // Fallback to standard orchestration handled in farmService
      },
      maxRetries: 0
    });

    // Undefined property access strategy
    this.registerStrategy({
      name: 'undefined-property',
      condition: (error) => error.message?.includes('Cannot read properties of undefined'),
      recover: async (error, context) => {
        logger.warn(LogCategory.SYSTEM, `Undefined property access: ${error.message}. Using safe defaults.`);
        // Safe defaults handled in calling code
      },
      maxRetries: 0
    });

    // Database connection lost strategy
    this.registerStrategy({
      name: 'db-connection-lost',
      condition: (error) =>
        error.code === 'ECONNREFUSED' ||
        error.code === '57P01' || // PostgreSQL admin shutdown
        error.code === '57P02' || // PostgreSQL crash shutdown
        error.message?.includes('Connection terminated'),
      recover: async (error, context) => {
        logger.warn(LogCategory.DATABASE, 'Database connection lost, attempting reconnection');
        await this.reconnectDatabase();
      },
      maxRetries: 3
    });

    // Farm launch failure strategy
    this.registerStrategy({
      name: 'farm-launch-failure',
      condition: (error) => error.code >= 1300 && error.code < 1400,
      recover: async (error, context) => {
        if (context?.farmId) {
          logger.warn(LogCategory.SYSTEM, `Farm ${context.farmId} launch failed, updating status`);
          await this.updateFarmStatus(context.farmId, 'failed', error.message);
        }
      },
      maxRetries: 1
    });
  }

  /**
   * Register a new recovery strategy
   */
  registerStrategy(strategy: RecoveryStrategy): void {
    this.recoveryStrategies.set(strategy.name, strategy);
    logger.info(LogCategory.SYSTEM, `Registered recovery strategy: ${strategy.name}`);
  }

  /**
   * Attempt to recover from an error
   */
  async recover(error: any, context?: ErrorContext): Promise<boolean> {
    try {
      // Find applicable strategies
      const applicableStrategies = Array.from(this.recoveryStrategies.values())
        .filter(strategy => strategy.condition(error));

      if (applicableStrategies.length === 0) {
        logger.debug(LogCategory.SYSTEM, 'No recovery strategy found for error', {
          error: error.message,
          code: error.code
        });
        return false;
      }

      // Try each applicable strategy
      for (const strategy of applicableStrategies) {
        const retryKey = `${strategy.name}-${context?.operation || 'unknown'}`;
        const attempts = this.retryAttempts.get(retryKey) || 0;

        if (attempts >= strategy.maxRetries) {
          logger.warn(LogCategory.SYSTEM, `Max retries reached for strategy ${strategy.name}`);
          continue;
        }

        this.retryAttempts.set(retryKey, attempts + 1);

        try {
          logger.info(LogCategory.SYSTEM, `Attempting recovery with strategy: ${strategy.name}`);
          await strategy.recover(error, context);

          // Clear retry counter on success
          this.retryAttempts.delete(retryKey);
          return true;
        } catch (recoveryError) {
          logger.error(LogCategory.SYSTEM, `Recovery strategy ${strategy.name} failed:`, recoveryError);
        }
      }

      return false;
    } catch (error) {
      logger.error(LogCategory.SYSTEM, 'Error in recovery system:', error);
      return false;
    }
  }

  /**
   * Add missing column to database table
   */
  private async addMissingColumn(table: string, column: string): Promise<void> {
    // Determine column type based on naming conventions
    let columnType = 'TEXT';
    if (column.endsWith('_id')) {
      columnType = 'UUID';
    } else if (column.endsWith('_at')) {
      columnType = 'TIMESTAMP';
    } else if (column === 'name' || column === 'status') {
      columnType = 'VARCHAR(255)';
    }

    try {
      const query = `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${columnType}`;
      await db.query(query);
      logger.info(LogCategory.DATABASE, `Added missing column ${column} to ${table}`);
    } catch (error) {
      logger.error(LogCategory.DATABASE, `Failed to add column ${column} to ${table}:`, error);
      throw error;
    }
  }

  /**
   * Reconnect to database
   */
  private async reconnectDatabase(): Promise<void> {
    const maxAttempts = 5;
    const retryDelay = 2000;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        await db.query('SELECT 1');
        logger.info(LogCategory.DATABASE, 'Database reconnection successful');
        return;
      } catch (error) {
        logger.warn(LogCategory.DATABASE, `Database reconnection attempt ${i + 1} failed`);
        if (i < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    throw new Error('Failed to reconnect to database after maximum attempts');
  }

  /**
   * Update farm status after failure
   */
  private async updateFarmStatus(farmId: string, status: string, errorMessage: string): Promise<void> {
    try {
      await db.query(
        `UPDATE farms
         SET status = $1,
             metrics = jsonb_set(metrics, '{error}', $2::jsonb),
             updated_at = NOW()
         WHERE id = $3`,
        [status, JSON.stringify(errorMessage), farmId]
      );
      logger.info(LogCategory.DATABASE, `Updated farm ${farmId} status to ${status}`);
    } catch (error) {
      logger.error(LogCategory.DATABASE, `Failed to update farm status:`, error);
    }
  }

  /**
   * Clear retry attempts for a specific operation
   */
  clearRetryAttempts(operation?: string): void {
    if (operation) {
      const keysToDelete = Array.from(this.retryAttempts.keys())
        .filter(key => key.includes(operation));
      keysToDelete.forEach(key => this.retryAttempts.delete(key));
    } else {
      this.retryAttempts.clear();
    }
  }

  /**
   * Get recovery statistics
   */
  getStats(): Record<string, any> {
    return {
      registeredStrategies: this.recoveryStrategies.size,
      activeRetries: this.retryAttempts.size,
      strategies: Array.from(this.recoveryStrategies.keys()),
      retryAttempts: Object.fromEntries(this.retryAttempts)
    };
  }
}

/**
 * Wrap an async operation with error recovery
 */
export async function withRecovery<T>(
  operation: () => Promise<T>,
  context: ErrorContext,
  fallback?: T
): Promise<T> {
  const recoveryManager = ErrorRecoveryManager.getInstance();

  try {
    return await operation();
  } catch (error) {
    logger.error(LogCategory.SYSTEM, `Error in ${context.operation}:`, error);

    // Attempt recovery
    const recovered = await recoveryManager.recover(error, context);

    if (recovered) {
      // Retry the operation after recovery
      try {
        return await operation();
      } catch (retryError) {
        logger.error(LogCategory.SYSTEM, `Retry failed after recovery:`, retryError);
      }
    }

    // Return fallback if available
    if (fallback !== undefined) {
      logger.warn(LogCategory.SYSTEM, `Using fallback value for ${context.operation}`);
      return fallback;
    }

    // Re-throw as FarmError
    throw new FarmError(
      ErrorCode.OPERATION_FAILED,
      `${context.operation} failed: ${error instanceof Error ? error.message : String(error)}`,
      context.metadata
    );
  }
}

/**
 * Safe property access helper
 */
export function safeGet<T>(obj: any, path: string, defaultValue: T): T {
  try {
    const keys = path.split('.');
    let result = obj;

    for (const key of keys) {
      if (result === null || result === undefined) {
        return defaultValue;
      }
      result = result[key];
    }

    return result !== undefined ? result : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Ensure required properties exist
 */
export function ensureProperties<T extends Record<string, any>>(
  obj: T,
  required: Array<keyof T>,
  defaults: Partial<T> = {}
): T {
  const result = { ...obj };

  for (const key of required) {
    if (result[key] === undefined) {
      if (defaults[key] !== undefined) {
        result[key] = defaults[key];
      } else {
        // Set sensible defaults based on type
        if (key.toString().endsWith('_at')) {
          result[key] = new Date() as any;
        } else if (key.toString().endsWith('_id')) {
          result[key] = null as any;
        } else if (key === 'status') {
          result[key] = 'unknown' as any;
        } else {
          result[key] = null as any;
        }
      }

      logger.debug(LogCategory.SYSTEM, `Set default value for missing property: ${String(key)}`);
    }
  }

  return result;
}

// Export singleton instance
export const errorRecovery = ErrorRecoveryManager.getInstance();