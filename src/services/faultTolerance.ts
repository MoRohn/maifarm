// Fault tolerance and retry mechanism service

import { RetryPolicy } from '../types/farm';

interface RetryOptions {
  maxRetries: number;
  backoffType: 'linear' | 'exponential' | 'constant';
  initialDelay: number;
  maxDelay?: number;
  retryableErrors?: string[];
  onRetry?: (error: Error, attempt: number) => void;
}

interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
  onStateChange?: (state: CircuitBreakerState) => void;
}

type CircuitBreakerState = 'closed' | 'open' | 'half-open';

class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: Date;
  private monitoringStart = Date.now();

  constructor(private options: CircuitBreakerOptions) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.setState('half-open');
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= 3) {
        this.setState('closed');
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.state === 'half-open') {
      this.setState('open');
      return;
    }

    const monitoringDuration = Date.now() - this.monitoringStart;
    if (monitoringDuration > this.options.monitoringPeriod) {
      // Reset monitoring window
      this.failureCount = 1;
      this.monitoringStart = Date.now();
    }

    if (this.failureCount >= this.options.failureThreshold) {
      this.setState('open');
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    
    const timeSinceLastFailure = Date.now() - this.lastFailureTime.getTime();
    return timeSinceLastFailure >= this.options.resetTimeout;
  }

  private setState(state: CircuitBreakerState): void {
    if (this.state !== state) {
      this.state = state;
      this.options.onStateChange?.(state);
      
      if (state === 'closed') {
        this.failureCount = 0;
        this.successCount = 0;
      }
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }
}

class FaultTolerance {
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  async retry<T>(
    fn: () => Promise<T>,
    options: RetryOptions
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        // Check if error is retryable
        if (options.retryableErrors && !this.isRetryableError(lastError, options.retryableErrors)) {
          throw lastError;
        }

        if (attempt < options.maxRetries) {
          const delay = this.calculateDelay(attempt, options);
          options.onRetry?.(lastError, attempt + 1);
          await this.delay(delay);
        }
      }
    }

    throw lastError!;
  }

  async retryWithBackoff<T>(
    fn: () => Promise<T>,
    policy: RetryPolicy
  ): Promise<T> {
    return this.retry(fn, {
      maxRetries: policy.maxRetries,
      backoffType: 'exponential',
      initialDelay: 1000,
      maxDelay: 30000,
    });
  }

  createCircuitBreaker(
    key: string,
    options: Partial<CircuitBreakerOptions> = {}
  ): CircuitBreaker {
    const breaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      monitoringPeriod: 300000, // 5 minutes
      ...options,
    });

    this.circuitBreakers.set(key, breaker);
    return breaker;
  }

  getCircuitBreaker(key: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(key);
  }

  async withCircuitBreaker<T>(
    key: string,
    fn: () => Promise<T>,
    options?: Partial<CircuitBreakerOptions>
  ): Promise<T> {
    let breaker = this.circuitBreakers.get(key);
    
    if (!breaker) {
      breaker = this.createCircuitBreaker(key, options);
    }

    return breaker.execute(fn);
  }

  async withTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
      ),
    ]);
  }

  async withFallback<T>(
    fn: () => Promise<T>,
    fallback: () => Promise<T> | T
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      console.warn('Operation failed, using fallback:', error);
      return await fallback();
    }
  }

  async bulkhead<T>(
    fn: () => Promise<T>,
    semaphore: Semaphore
  ): Promise<T> {
    await semaphore.acquire();
    try {
      return await fn();
    } finally {
      semaphore.release();
    }
  }

  private calculateDelay(attempt: number, options: RetryOptions): number {
    let delay: number;

    switch (options.backoffType) {
      case 'constant':
        delay = options.initialDelay;
        break;
      case 'linear':
        delay = options.initialDelay * (attempt + 1);
        break;
      case 'exponential':
        delay = options.initialDelay * Math.pow(2, attempt);
        break;
      default:
        delay = options.initialDelay;
    }

    if (options.maxDelay) {
      delay = Math.min(delay, options.maxDelay);
    }

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    return Math.floor(delay + jitter);
  }

  private isRetryableError(error: Error, retryableErrors: string[]): boolean {
    return retryableErrors.some(pattern => 
      error.message.includes(pattern) || error.name === pattern
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(private maxPermits: number) {
    this.permits = maxPermits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>(resolve => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift()!;
      resolve();
    } else {
      this.permits++;
    }
  }

  available(): number {
    return this.permits;
  }
}

// Health check manager for monitoring service health
class HealthCheckManager {
  private healthChecks: Map<string, HealthCheck> = new Map();

  registerHealthCheck(
    name: string,
    check: () => Promise<HealthStatus>
  ): void {
    this.healthChecks.set(name, {
      name,
      check,
      lastCheck: new Date(),
      status: 'unknown',
    });
  }

  async checkHealth(name?: string): Promise<HealthCheckResult[]> {
    const checks = name 
      ? [this.healthChecks.get(name)].filter(Boolean)
      : Array.from(this.healthChecks.values());

    const results = await Promise.all(
      checks.map(async (check) => {
        try {
          const status = await check!.check();
          check!.status = status.healthy ? 'healthy' : 'unhealthy';
          check!.lastCheck = new Date();
          
          return {
            name: check!.name,
            status: check!.status,
            message: status.message,
            timestamp: check!.lastCheck,
          };
        } catch (error) {
          check!.status = 'error';
          check!.lastCheck = new Date();
          
          return {
            name: check!.name,
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: check!.lastCheck,
          };
        }
      })
    );

    return results;
  }

  getOverallHealth(): 'healthy' | 'degraded' | 'unhealthy' {
    const statuses = Array.from(this.healthChecks.values()).map(c => c.status);
    
    if (statuses.some(s => s === 'error' || s === 'unhealthy')) {
      return 'unhealthy';
    }
    
    if (statuses.some(s => s === 'unknown')) {
      return 'degraded';
    }
    
    return 'healthy';
  }
}

interface HealthCheck {
  name: string;
  check: () => Promise<HealthStatus>;
  lastCheck: Date;
  status: 'healthy' | 'unhealthy' | 'error' | 'unknown';
}

interface HealthStatus {
  healthy: boolean;
  message?: string;
}

interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'unhealthy' | 'error' | 'unknown';
  message?: string;
  timestamp: Date;
}

export const faultTolerance = new FaultTolerance();
export const healthCheckManager = new HealthCheckManager();
export { Semaphore, CircuitBreaker };
export type { RetryOptions, CircuitBreakerOptions, HealthStatus, HealthCheckResult };