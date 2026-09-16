/**
 * Retry Utility - Production-grade retry logic with exponential backoff
 *
 * Handles transient failures gracefully with:
 * - Exponential backoff with jitter
 * - Configurable retry conditions
 * - Detailed error logging
 * - Operation categorization
 */

import { logger, LogCategory } from './logger';

export interface RetryOptions {
  /**
   * Maximum number of attempts (including initial attempt)
   * @default 3
   */
  maxAttempts?: number;

  /**
   * Initial backoff delay in milliseconds
   * @default 1000
   */
  initialBackoffMs?: number;

  /**
   * Maximum backoff delay in milliseconds
   * @default 30000 (30 seconds)
   */
  maxBackoffMs?: number;

  /**
   * Function to determine if an error should trigger a retry
   * @default Retries on all errors
   */
  shouldRetry?: (error: Error, attempt: number) => boolean;

  /**
   * Human-readable name for the operation (used in logs)
   */
  operationName?: string;

  /**
   * Log category for this operation
   * @default LogCategory.SYSTEM
   */
  logCategory?: LogCategory;

  /**
   * Additional context to include in error logs
   */
  context?: Record<string, any>;

  /**
   * Whether to add jitter to backoff delays (prevents thundering herd)
   * @default true
   */
  useJitter?: boolean;

  /**
   * Callback function called before each retry
   */
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

export interface RetryResult<T> {
  value: T;
  attempts: number;
  totalDuration: number;
  errors: Error[];
}

/**
 * Default retry predicate - retries on common transient errors
 */
export const defaultShouldRetry = (error: Error, attempt: number): boolean => {
  const errorMessage = error.message.toLowerCase();

  // Always retry on these error patterns
  const retryablePatterns = [
    'econnrefused',      // Connection refused
    'econnreset',        // Connection reset
    'etimedout',         // Timeout
    'timeout',           // Generic timeout
    'socket hang up',    // Socket closed
    'network',           // Network errors
    'temporary',         // Temporary failures
    '503',              // Service Unavailable
    '429',              // Too Many Requests
    'deadlock',         // Database deadlocks
    'lock timeout',     // Database lock timeouts
    'serialization',    // Transaction serialization failures
  ];

  return retryablePatterns.some(pattern => errorMessage.includes(pattern));
};

/**
 * Calculate backoff delay with exponential growth and optional jitter
 */
function calculateBackoff(
  attempt: number,
  initialBackoffMs: number,
  maxBackoffMs: number,
  useJitter: boolean
): number {
  // Exponential backoff: initialBackoff * 2^(attempt - 1)
  const exponentialDelay = initialBackoffMs * Math.pow(2, attempt - 1);

  // Cap at maximum
  const cappedDelay = Math.min(exponentialDelay, maxBackoffMs);

  if (!useJitter) {
    return cappedDelay;
  }

  // Add jitter: randomize between 50% and 100% of calculated delay
  const jitterFactor = 0.5 + (Math.random() * 0.5);
  return Math.floor(cappedDelay * jitterFactor);
}

/**
 * Execute an async operation with retry logic
 *
 * @example
 * ```typescript
 * // Simple usage
 * const result = await withRetry(
 *   () => db.query('UPDATE farms SET status = $1 WHERE id = $2', [status, farmId]),
 *   { operationName: 'updateFarmStatus', maxAttempts: 3 }
 * );
 *
 * // Advanced usage with custom retry logic
 * const result = await withRetry(
 *   () => fetchExternalAPI(),
 *   {
 *     operationName: 'fetchAPI',
 *     maxAttempts: 5,
 *     shouldRetry: (error) => error.message.includes('rate limit'),
 *     onRetry: (error, attempt, delay) => {
 *       logger.warn('API rate limited, backing off...');
 *     }
 *   }
 * );
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialBackoffMs = 1000,
    maxBackoffMs = 30000,
    shouldRetry = defaultShouldRetry,
    operationName = 'operation',
    logCategory = LogCategory.SYSTEM,
    context = {},
    useJitter = true,
    onRetry
  } = options;

  const errors: Error[] = [];
  const startTime = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await operation();

      // Log success if there were previous failures
      if (attempt > 1) {
        const duration = Date.now() - startTime;
        logger.info(logCategory, `${operationName} succeeded after ${attempt} attempts (${duration}ms)`, {
          attempts: attempt,
          duration,
          previousErrors: errors.length,
          ...context
        });
      }

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push(err);

      // Check if we should retry
      const isLastAttempt = attempt === maxAttempts;
      const shouldAttemptRetry = !isLastAttempt && shouldRetry(err, attempt);

      if (!shouldAttemptRetry) {
        // Log final failure
        const duration = Date.now() - startTime;
        logger.error(logCategory, `${operationName} failed after ${attempt} attempts (${duration}ms)`, {
          error: err.message,
          stack: err.stack,
          attempts: attempt,
          duration,
          allErrors: errors.map(e => e.message),
          ...context
        });

        throw err;
      }

      // Calculate backoff delay
      const delayMs = calculateBackoff(attempt, initialBackoffMs, maxBackoffMs, useJitter);

      // Log retry attempt
      logger.warn(logCategory, `${operationName} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms`, {
        error: err.message,
        attempt,
        maxAttempts,
        delayMs,
        ...context
      });

      // Call retry callback if provided
      if (onRetry) {
        try {
          onRetry(err, attempt, delayMs);
        } catch (callbackError) {
          logger.error(logCategory, 'Error in retry callback', {
            error: callbackError,
            operationName
          });
        }
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw errors[errors.length - 1];
}

/**
 * Specialized retry for database operations
 * Uses database-specific error detection and retry logic
 */
export async function withDatabaseRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  context?: Record<string, any>
): Promise<T> {
  return withRetry(operation, {
    operationName,
    logCategory: LogCategory.DATABASE,
    maxAttempts: 3,
    initialBackoffMs: 500,
    maxBackoffMs: 5000,
    shouldRetry: (error) => {
      const msg = error.message.toLowerCase();
      return msg.includes('deadlock') ||
             msg.includes('lock timeout') ||
             msg.includes('connection') ||
             msg.includes('serialization') ||
             msg.includes('econnrefused') ||
             msg.includes('timeout');
    },
    context
  });
}

/**
 * Specialized retry for WebSocket operations
 * Uses WebSocket-specific error detection
 */
export async function withWebSocketRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  context?: Record<string, any>
): Promise<T> {
  return withRetry(operation, {
    operationName,
    logCategory: LogCategory.WEBSOCKET,
    maxAttempts: 5,
    initialBackoffMs: 1000,
    maxBackoffMs: 10000,
    shouldRetry: (error) => {
      const msg = error.message.toLowerCase();
      return msg.includes('socket') ||
             msg.includes('connection') ||
             msg.includes('disconnected') ||
             msg.includes('timeout');
    },
    context
  });
}

/**
 * Specialized retry for file system operations
 * Uses filesystem-specific error detection
 */
export async function withFilesystemRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  context?: Record<string, any>
): Promise<T> {
  return withRetry(operation, {
    operationName,
    logCategory: LogCategory.FILESYSTEM,
    maxAttempts: 3,
    initialBackoffMs: 500,
    maxBackoffMs: 3000,
    shouldRetry: (error) => {
      const msg = error.message.toLowerCase();
      // Don't retry on permission errors (EACCES) or file not found (ENOENT)
      if (msg.includes('eacces') || msg.includes('enoent')) {
        return false;
      }
      // Retry on locks, busy files, or temporary issues
      return msg.includes('ebusy') ||
             msg.includes('locked') ||
             msg.includes('eagain');
    },
    context
  });
}

/**
 * Retry with timeout - operation must complete within timeout or fail
 */
export async function withRetryAndTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  retryOptions: RetryOptions = {}
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([
    withRetry(operation, retryOptions),
    timeoutPromise
  ]);
}

/**
 * Batch retry - retry multiple operations in parallel, fail fast if any fail
 */
export async function batchRetry<T>(
  operations: Array<() => Promise<T>>,
  options: RetryOptions = {}
): Promise<T[]> {
  return Promise.all(
    operations.map(op => withRetry(op, options))
  );
}

/**
 * Batch retry with partial success - returns results and errors
 */
export async function batchRetryPartial<T>(
  operations: Array<() => Promise<T>>,
  options: RetryOptions = {}
): Promise<{
  results: T[];
  errors: Error[];
  successCount: number;
  failureCount: number;
}> {
  type SuccessOutcome<T> = { success: true; value: T };
  type FailureOutcome = { success: false; error: Error };
  type Outcome<T> = SuccessOutcome<T> | FailureOutcome;

  const promises = operations.map(op =>
    withRetry(op, options)
      .then((value): Outcome<T> => ({ success: true, value }))
      .catch((error): Outcome<T> => ({ success: false, error }))
  );

  const outcomes = await Promise.all(promises);

  const results: T[] = [];
  const errors: Error[] = [];

  for (const outcome of outcomes) {
    if (outcome.success === true) {
      results.push(outcome.value);
    } else {
      errors.push(outcome.error);
    }
  }

  return {
    results,
    errors,
    successCount: results.length,
    failureCount: errors.length
  };
}
