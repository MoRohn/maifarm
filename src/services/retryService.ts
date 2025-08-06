interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
  onRetry?: (error: Error, attempt: number) => void;
}

interface RetryState {
  attempts: number;
  lastError?: Error;
  nextRetryTime?: number;
}

export class RetryService {
  private defaultConfig: RetryConfig = {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 60000,
    backoffMultiplier: 2
  };

  async retry<T>(
    operation: () => Promise<T>,
    config?: Partial<RetryConfig>
  ): Promise<T> {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const state: RetryState = { attempts: 0 };

    while (state.attempts < mergedConfig.maxAttempts) {
      try {
        return await operation();
      } catch (error) {
        state.attempts++;
        state.lastError = error as Error;

        if (!this.shouldRetry(error as Error, state, mergedConfig)) {
          throw error;
        }

        const delay = this.calculateDelay(state.attempts, mergedConfig);
        state.nextRetryTime = Date.now() + delay;

        if (mergedConfig.onRetry) {
          mergedConfig.onRetry(error as Error, state.attempts);
        }

        await this.delay(delay);
      }
    }

    throw state.lastError || new Error('Max retry attempts exceeded');
  }

  private shouldRetry(error: Error, state: RetryState, config: RetryConfig): boolean {
    // Check if we've exceeded max attempts
    if (state.attempts >= config.maxAttempts) {
      return false;
    }

    // Check if error is retryable
    if (config.retryableErrors && config.retryableErrors.length > 0) {
      return config.retryableErrors.some(retryableError => 
        error.message.includes(retryableError) ||
        error.name === retryableError
      );
    }

    // Default: retry on any error
    return true;
  }

  private calculateDelay(attempt: number, config: RetryConfig): number {
    const exponentialDelay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    const jitteredDelay = exponentialDelay * (0.5 + Math.random() * 0.5); // Add jitter
    return Math.min(jitteredDelay, config.maxDelay);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  createRetryableOperation<T>(
    operation: () => Promise<T>,
    config?: Partial<RetryConfig>
  ): () => Promise<T> {
    return () => this.retry(operation, config);
  }
}