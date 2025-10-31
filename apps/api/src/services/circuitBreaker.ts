/**
 * Circuit Breaker Pattern for Production Resilience
 * Prevents cascading failures by detecting and isolating failing services
 */

import { EventEmitter } from 'events';
import { logger, LogCategory } from '../utils/logger';

export enum CircuitState {
  CLOSED = 'closed',   // Normal operation
  OPEN = 'open',       // Failing, reject all requests
  HALF_OPEN = 'half-open' // Testing recovery
}

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;      // Number of failures before opening
  resetTimeout?: number;           // Time in ms before trying again
  monitoringPeriod?: number;       // Time window for failure tracking
  successThreshold?: number;       // Successes needed to close from half-open
  fallbackFunction?: () => any;   // Fallback when circuit is open
}

export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailureTime?: Date;
  private nextAttempt?: Date;
  private resetTimer?: NodeJS.Timeout;

  // Metrics
  private totalRequests = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private circuitOpenCount = 0;

  constructor(private options: CircuitBreakerOptions) {
    super();
    this.options = {
      failureThreshold: 5,
      resetTimeout: 60000,  // 1 minute
      monitoringPeriod: 60000,  // 1 minute
      successThreshold: 3,
      ...options
    };
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (this.canAttemptReset()) {
        this.transitionToHalfOpen();
      } else {
        this.emit('rejected', { name: this.options.name, state: this.state });
        if (this.options.fallbackFunction) {
          return this.options.fallbackFunction();
        }
        throw new Error(`Circuit breaker ${this.options.name} is OPEN`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.totalSuccesses++;
    this.failures = 0;  // Reset consecutive failures

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;

      if (this.successes >= this.options.successThreshold!) {
        this.transitionToClosed();
      }
    }

    this.emit('success', {
      name: this.options.name,
      state: this.state,
      metrics: this.getMetrics()
    });
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: any): void {
    this.totalFailures++;
    this.failures++;
    this.lastFailureTime = new Date();

    logger.error(LogCategory.SYSTEM, `Circuit breaker ${this.options.name} failure:`, error);

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionToOpen();
    } else if (this.state === CircuitState.CLOSED) {
      if (this.failures >= this.options.failureThreshold!) {
        this.transitionToOpen();
      }
    }

    this.emit('failure', {
      name: this.options.name,
      state: this.state,
      error: error.message,
      failureCount: this.failures,
      metrics: this.getMetrics()
    });
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    this.state = CircuitState.OPEN;
    this.circuitOpenCount++;
    this.nextAttempt = new Date(Date.now() + this.options.resetTimeout!);

    logger.warn(LogCategory.SYSTEM,
      `Circuit breaker ${this.options.name} is now OPEN. Will retry at ${this.nextAttempt.toISOString()}`);

    this.emit('state-change', {
      name: this.options.name,
      previousState: this.state,
      newState: CircuitState.OPEN,
      nextAttempt: this.nextAttempt
    });

    // Set timer to attempt reset
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }

    this.resetTimer = setTimeout(() => {
      this.transitionToHalfOpen();
    }, this.options.resetTimeout!);
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    const previousState = this.state;
    this.state = CircuitState.HALF_OPEN;
    this.successes = 0;

    logger.info(LogCategory.SYSTEM,
      `Circuit breaker ${this.options.name} is now HALF_OPEN, testing recovery`);

    this.emit('state-change', {
      name: this.options.name,
      previousState,
      newState: CircuitState.HALF_OPEN
    });
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    const previousState = this.state;
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;

    logger.info(LogCategory.SYSTEM,
      `Circuit breaker ${this.options.name} is now CLOSED, service recovered`);

    this.emit('state-change', {
      name: this.options.name,
      previousState,
      newState: CircuitState.CLOSED
    });

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }
  }

  /**
   * Check if we can attempt reset
   */
  private canAttemptReset(): boolean {
    return this.nextAttempt ? Date.now() >= this.nextAttempt.getTime() : false;
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics() {
    const errorRate = this.totalRequests > 0
      ? (this.totalFailures / this.totalRequests) * 100
      : 0;

    return {
      state: this.state,
      totalRequests: this.totalRequests,
      totalSuccesses: this.totalSuccesses,
      totalFailures: this.totalFailures,
      errorRate: errorRate.toFixed(2) + '%',
      consecutiveFailures: this.failures,
      circuitOpenCount: this.circuitOpenCount,
      lastFailure: this.lastFailureTime,
      nextAttempt: this.nextAttempt
    };
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = undefined;
    this.nextAttempt = undefined;

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }

    logger.info(LogCategory.SYSTEM, `Circuit breaker ${this.options.name} has been reset`);
  }

  /**
   * Force open the circuit (for testing/emergency)
   */
  forceOpen(): void {
    this.transitionToOpen();
  }

  /**
   * Force close the circuit (for testing/recovery)
   */
  forceClose(): void {
    this.transitionToClosed();
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
    this.removeAllListeners();
  }
}

/**
 * Circuit Breaker Manager for centralized management
 */
export class CircuitBreakerManager {
  private static instance: CircuitBreakerManager;
  private breakers: Map<string, CircuitBreaker> = new Map();

  static getInstance(): CircuitBreakerManager {
    if (!CircuitBreakerManager.instance) {
      CircuitBreakerManager.instance = new CircuitBreakerManager();
    }
    return CircuitBreakerManager.instance;
  }

  /**
   * Create or get a circuit breaker
   */
  getBreaker(options: CircuitBreakerOptions): CircuitBreaker {
    if (!this.breakers.has(options.name)) {
      const breaker = new CircuitBreaker(options);
      this.breakers.set(options.name, breaker);

      // Log state changes
      breaker.on('state-change', (event) => {
        logger.info(LogCategory.SYSTEM,
          `Circuit breaker ${event.name}: ${event.previousState} → ${event.newState}`);
      });
    }

    return this.breakers.get(options.name)!;
  }

  /**
   * Get all circuit breakers metrics
   */
  getAllMetrics() {
    const metrics: Record<string, any> = {};

    this.breakers.forEach((breaker, name) => {
      metrics[name] = breaker.getMetrics();
    });

    return metrics;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.breakers.forEach(breaker => breaker.reset());
  }

  /**
   * Cleanup all circuit breakers
   */
  destroy(): void {
    this.breakers.forEach(breaker => breaker.destroy());
    this.breakers.clear();
  }
}

export const circuitBreakerManager = CircuitBreakerManager.getInstance();