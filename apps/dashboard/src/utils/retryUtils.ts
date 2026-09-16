/**
 * Retry Utilities
 *
 * Professional retry logic with exponential backoff for failed API calls.
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  shouldRetry?: (error: any) => boolean;
  onRetry?: (attempt: number, error: any) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffFactor: 2,
  shouldRetry: () => true,
  onRetry: () => {}
};

/**
 * Retry a function with exponential backoff
 *
 * @param fn - The async function to retry
 * @param options - Retry configuration options
 * @returns Promise that resolves with the function result or rejects after max attempts
 *
 * @example
 * const data = await retryWithBackoff(
 *   () => fetch('/api/analytics/metrics'),
 *   {
 *     maxAttempts: 3,
 *     onRetry: (attempt) => console.log(`Retry attempt ${attempt}`)
 *   }
 * );
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry this error
      if (!opts.shouldRetry(error)) {
        throw error;
      }

      // Don't retry if this was the last attempt
      if (attempt === opts.maxAttempts) {
        break;
      }

      // Call retry callback
      opts.onRetry(attempt, error);

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelay * Math.pow(opts.backoffFactor, attempt - 1),
        opts.maxDelay
      );

      // Wait before retrying
      await sleep(delay);
    }
  }

  // All attempts failed
  throw lastError;
}

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable (network errors, 5xx errors, timeouts)
 */
export function isRetryableError(error: any): boolean {
  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // HTTP errors
  if (error.response) {
    const status = error.response.status;
    // Retry on 5xx server errors and 429 rate limit
    return status >= 500 || status === 429;
  }

  // Timeout errors
  if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
    return true;
  }

  // Default to not retrying
  return false;
}

/**
 * Fetch with automatic retry
 *
 * @example
 * const response = await fetchWithRetry('/api/analytics/metrics', {
 *   maxAttempts: 3,
 *   onRetry: (attempt) => toast.info(`Retrying... (${attempt}/3)`)
 * });
 */
export async function fetchWithRetry(
  url: string,
  fetchOptions?: RequestInit,
  retryOptions?: RetryOptions
): Promise<Response> {
  return retryWithBackoff(
    async () => {
      const response = await fetch(url, fetchOptions);

      // Throw on HTTP errors to trigger retry
      if (!response.ok) {
        const error: any = new Error(`HTTP ${response.status}: ${response.statusText}`);
        error.response = response;
        throw error;
      }

      return response;
    },
    {
      shouldRetry: isRetryableError,
      ...retryOptions
    }
  );
}

/**
 * Retry configuration presets
 */
export const RETRY_PRESETS = {
  /** Quick retry for interactive operations (3 attempts, 1s initial delay) */
  quick: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 5000,
    backoffFactor: 2
  },

  /** Standard retry for background operations (5 attempts, 2s initial delay) */
  standard: {
    maxAttempts: 5,
    initialDelay: 2000,
    maxDelay: 30000,
    backoffFactor: 2
  },

  /** Aggressive retry for critical operations (10 attempts, 500ms initial delay) */
  aggressive: {
    maxAttempts: 10,
    initialDelay: 500,
    maxDelay: 60000,
    backoffFactor: 1.5
  },

  /** No retry - fail immediately */
  none: {
    maxAttempts: 1,
    initialDelay: 0,
    maxDelay: 0,
    backoffFactor: 1
  }
} as const;

/**
 * Create a retryable version of an async function
 *
 * @example
 * const fetchMetrics = retryable(
 *   async () => {
 *     const res = await fetch('/api/metrics');
 *     return res.json();
 *   },
 *   RETRY_PRESETS.standard
 * );
 *
 * // Use it like a normal function
 * const metrics = await fetchMetrics();
 */
export function retryable<T, Args extends any[]>(
  fn: (...args: Args) => Promise<T>,
  options?: RetryOptions
): (...args: Args) => Promise<T> {
  return async (...args: Args) => {
    return retryWithBackoff(() => fn(...args), options);
  };
}

/**
 * Batch retry - retry multiple operations in parallel with individual retry logic
 *
 * @example
 * const [metrics, farms, agents] = await batchRetry([
 *   () => fetchMetrics(),
 *   () => fetchFarms(),
 *   () => fetchAgents()
 * ], RETRY_PRESETS.quick);
 */
export async function batchRetry<T>(
  operations: Array<() => Promise<T>>,
  options?: RetryOptions
): Promise<T[]> {
  return Promise.all(
    operations.map(op => retryWithBackoff(op, options))
  );
}
