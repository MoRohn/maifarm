/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures when external services are down
 */

import { EventEmitter } from 'events';
import { logger } from './logger';
import { LogCategory } from './logger';

export enum CircuitState {
  CLOSED = 'CLOSED',  // Normal operation
  OPEN = 'OPEN',      // Service is down, fail fast
  HALF_OPEN = 'HALF_OPEN' // Testing if service is back
}

export interface CircuitBreakerOptions {
  failureThreshold: number;      // Number of failures before opening
  successThreshold: number;       // Number of successes to close from half-open
  timeout: number;               // Request timeout in ms
  resetTimeout: number;          // Time to wait before trying half-open
  volumeThreshold: number;       // Minimum requests before opening can occur
  errorFilter?: (error: any) => boolean; // Filter which errors trigger the breaker
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  totalRequests: number;
  openedAt?: Date;
  halfOpenAt?: Date;
}

export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private consecutiveFailures: number = 0;
  private consecutiveSuccesses: number = 0;
  private totalRequests: number = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private openedAt?: Date;
  private halfOpenAt?: Date;
  private resetTimer?: NodeJS.Timeout;
  
  private readonly options: CircuitBreakerOptions;
  private readonly name: string;

  constructor(name: string, options: Partial<CircuitBreakerOptions> = {}) {
    super();
    this.name = name;
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      successThreshold: options.successThreshold || 2,
      timeout: options.timeout || 3000,
      resetTimeout: options.resetTimeout || 30000,
      volumeThreshold: options.volumeThreshold || 10,
      errorFilter: options.errorFilter || (() => true)
    };
    
    logger.info(LogCategory.MONITORING, `Circuit breaker '${name}' initialized`, this.options);
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      const error = new Error(`Circuit breaker '${this.name}' is OPEN`);
      (error as any).code = 'CIRCUIT_OPEN';
      throw error;
    }

    this.totalRequests++;

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(`Circuit breaker '${this.name}' timeout after ${this.options.timeout}ms`);
        (error as any).code = 'CIRCUIT_TIMEOUT';
        reject(error);
      }, this.options.timeout);

      fn()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.successes++;
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;
    this.lastSuccessTime = new Date();

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.consecutiveSuccesses >= this.options.successThreshold) {
        this.close();
      }
    }

    this.emit('success', { circuitBreaker: this.name, state: this.state });
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: any): void {
    // Check if this error should trigger the breaker
    if (!this.options.errorFilter!(error)) {
      return;
    }

    this.failures++;
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = new Date();

    logger.warn(LogCategory.ERROR, `Circuit breaker '${this.name}' failure`, {
      consecutiveFailures: this.consecutiveFailures,
      state: this.state,
      error: error.message
    });

    if (this.state === CircuitState.HALF_OPEN) {
      this.open();
    } else if (this.state === CircuitState.CLOSED) {
      if (this.consecutiveFailures >= this.options.failureThreshold &&
          this.totalRequests >= this.options.volumeThreshold) {
        this.open();
      }
    }

    this.emit('failure', { circuitBreaker: this.name, state: this.state, error });
  }

  /**
   * Open the circuit (fail fast mode)
   */
  private open(): void {
    this.state = CircuitState.OPEN;
    this.openedAt = new Date();
    
    logger.error(LogCategory.ERROR, `Circuit breaker '${this.name}' OPENED`, {
      failures: this.failures,
      consecutiveFailures: this.consecutiveFailures,
      lastFailure: this.lastFailureTime
    });

    this.emit('open', { circuitBreaker: this.name });

    // Schedule transition to half-open
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
    this.resetTimer = setTimeout(() => {
      this.halfOpen();
    }, this.options.resetTimeout);
  }

  /**
   * Transition to half-open (testing if service is back)
   */
  private halfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.halfOpenAt = new Date();
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    
    logger.info(LogCategory.MONITORING, `Circuit breaker '${this.name}' HALF-OPEN (testing recovery)`);
    this.emit('halfOpen', { circuitBreaker: this.name });
  }

  /**
   * Close the circuit (normal operation)
   */
  private close(): void {
    this.state = CircuitState.CLOSED;
    this.consecutiveFailures = 0;
    this.failures = 0;
    this.openedAt = undefined;
    this.halfOpenAt = undefined;
    
    logger.info(LogCategory.MONITORING, `Circuit breaker '${this.name}' CLOSED (recovered)`);
    this.emit('close', { circuitBreaker: this.name });
  }

  /**
   * Force the circuit to open
   */
  public forceOpen(): void {
    this.open();
  }

  /**
   * Force the circuit to close
   */
  public forceClose(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }
    this.close();
  }

  /**
   * Reset all metrics
   */
  public reset(): void {
    this.forceClose();
    this.failures = 0;
    this.successes = 0;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.totalRequests = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
  }

  /**
   * Get current metrics
   */
  public getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      openedAt: this.openedAt,
      halfOpenAt: this.halfOpenAt
    };
  }

  /**
   * Get current state
   */
  public getState(): CircuitState {
    return this.state;
  }

  /**
   * Check if circuit is open
   */
  public isOpen(): boolean {
    return this.state === CircuitState.OPEN;
  }

  /**
   * Check if circuit is closed
   */
  public isClosed(): boolean {
    return this.state === CircuitState.CLOSED;
  }

  /**
   * Check if circuit is half-open
   */
  public isHalfOpen(): boolean {
    return this.state === CircuitState.HALF_OPEN;
  }
}

/**
 * Circuit breaker factory for managing multiple breakers
 */
export class CircuitBreakerFactory {
  private static breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create a circuit breaker
   */
  static getBreaker(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, options));
    }
    return this.breakers.get(name)!;
  }

  /**
   * Get all breakers
   */
  static getAllBreakers(): Map<string, CircuitBreaker> {
    return this.breakers;
  }

  /**
   * Get metrics for all breakers
   */
  static getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};
    this.breakers.forEach((breaker, name) => {
      metrics[name] = breaker.getMetrics();
    });
    return metrics;
  }

  /**
   * Reset all breakers
   */
  static resetAll(): void {
    this.breakers.forEach(breaker => breaker.reset());
  }

  /**
   * Remove a breaker
   */
  static removeBreaker(name: string): void {
    this.breakers.delete(name);
  }
}