import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
  resetTimeout?: number;
  volumeThreshold?: number;
  errorFilter?: (error: Error) => boolean;
  fallback?: () => Promise<any>;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  totalRequests: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  errorRate: number;
  nextAttemptTime?: Date;
}

/**
 * Circuit Breaker implementation for fault tolerance
 * Prevents cascading failures in distributed systems
 */
export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private totalRequests = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private nextAttemptTime?: Date;
  private requestWindow: number[] = [];
  private readonly windowSize = 60000; // 1 minute window

  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly timeout: number;
  private readonly resetTimeout: number;
  private readonly volumeThreshold: number;
  private readonly errorFilter?: (error: Error) => boolean;
  private readonly fallback?: () => Promise<any>;

  constructor(options: CircuitBreakerOptions) {
    super();
    this.name = options.name;
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 3000;
    this.resetTimeout = options.resetTimeout || 30000;
    this.volumeThreshold = options.volumeThreshold || 10;
    this.errorFilter = options.errorFilter;
    this.fallback = options.fallback;

    this.startWindowCleaner();
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (this.canAttemptReset()) {
        this.transitionToHalfOpen();
      } else {
        return this.handleOpen();
      }
    }

    // Track request in window
    this.trackRequest();

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      await this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Execute function with timeout protection
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Circuit breaker timeout after ${this.timeout}ms`));
      }, this.timeout);

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
    this.totalRequests++;
    this.lastSuccessTime = new Date();

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successes >= this.successThreshold) {
        this.transitionToClosed();
      }
    }

    // Reset failure count on success in closed state
    if (this.state === CircuitState.CLOSED) {
      this.failures = 0;
    }

    this.emit('success', {
      circuitName: this.name,
      state: this.state
    });
  }

  /**
   * Handle failed execution
   */
  private async onFailure(error: Error): Promise<void> {
    // Check if error should be counted
    if (this.errorFilter && !this.errorFilter(error)) {
      return;
    }

    this.failures++;
    this.totalRequests++;
    this.lastFailureTime = new Date();

    logger.warn(`[CircuitBreaker] ${this.name} failure`, {
      error: error.message,
      failures: this.failures,
      state: this.state
    });

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionToOpen();
    } else if (this.state === CircuitState.CLOSED) {
      if (this.shouldTrip()) {
        this.transitionToOpen();
      }
    }

    this.emit('failure', {
      circuitName: this.name,
      state: this.state,
      error
    });
  }

  /**
   * Check if circuit should trip to open
   */
  private shouldTrip(): boolean {
    // Need minimum volume before tripping
    if (this.getRequestCount() < this.volumeThreshold) {
      return false;
    }

    // Check failure threshold
    return this.failures >= this.failureThreshold;
  }

  /**
   * Handle open circuit state
   */
  private async handleOpen<T>(): Promise<T> {
    logger.debug(`[CircuitBreaker] ${this.name} is OPEN, rejecting request`);

    this.emit('reject', {
      circuitName: this.name,
      state: this.state
    });

    // Use fallback if available
    if (this.fallback) {
      try {
        return await this.fallback();
      } catch (fallbackError) {
        logger.error(`[CircuitBreaker] ${this.name} fallback failed`, {
          error: fallbackError
        });
      }
    }

    throw new Error(`Circuit breaker ${this.name} is OPEN`);
  }

  /**
   * Check if reset attempt is allowed
   */
  private canAttemptReset(): boolean {
    if (!this.nextAttemptTime) {
      return true;
    }
    return new Date() >= this.nextAttemptTime;
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.nextAttemptTime = undefined;

    logger.info(`[CircuitBreaker] ${this.name} transitioned to CLOSED`);

    this.emit('stateChange', {
      circuitName: this.name,
      oldState: CircuitState.HALF_OPEN,
      newState: CircuitState.CLOSED
    });
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = new Date(Date.now() + this.resetTimeout);

    logger.warn(`[CircuitBreaker] ${this.name} transitioned to OPEN`, {
      nextAttemptTime: this.nextAttemptTime
    });

    this.emit('stateChange', {
      circuitName: this.name,
      oldState: this.state,
      newState: CircuitState.OPEN
    });

    this.emit('open', {
      circuitName: this.name,
      failures: this.failures,
      nextAttemptTime: this.nextAttemptTime
    });
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.successes = 0;
    this.failures = 0;

    logger.info(`[CircuitBreaker] ${this.name} transitioned to HALF_OPEN`);

    this.emit('stateChange', {
      circuitName: this.name,
      oldState: CircuitState.OPEN,
      newState: CircuitState.HALF_OPEN
    });
  }

  /**
   * Track request in time window
   */
  private trackRequest(): void {
    const now = Date.now();
    this.requestWindow.push(now);
  }

  /**
   * Get request count in window
   */
  private getRequestCount(): number {
    const cutoff = Date.now() - this.windowSize;
    this.requestWindow = this.requestWindow.filter(time => time > cutoff);
    return this.requestWindow.length;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    const requestCount = this.getRequestCount();
    const errorRate = requestCount > 0 ? this.failures / requestCount : 0;

    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      errorRate,
      nextAttemptTime: this.nextAttemptTime
    };
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.totalRequests = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.nextAttemptTime = undefined;
    this.requestWindow = [];

    logger.info(`[CircuitBreaker] ${this.name} reset`);

    this.emit('reset', {
      circuitName: this.name
    });
  }

  /**
   * Force open the circuit
   */
  forceOpen(): void {
    this.transitionToOpen();
  }

  /**
   * Force close the circuit
   */
  forceClose(): void {
    this.transitionToClosed();
  }

  /**
   * Start window cleaner interval
   */
  private startWindowCleaner(): void {
    setInterval(() => {
      const cutoff = Date.now() - this.windowSize;
      this.requestWindow = this.requestWindow.filter(time => time > cutoff);
    }, 10000); // Clean every 10 seconds
  }
}

/**
 * Circuit Breaker Manager for managing multiple circuit breakers
 */
export class CircuitBreakerManager {
  private static instance: CircuitBreakerManager;
  private circuits: Map<string, CircuitBreaker> = new Map();

  private constructor() {}

  static getInstance(): CircuitBreakerManager {
    if (!CircuitBreakerManager.instance) {
      CircuitBreakerManager.instance = new CircuitBreakerManager();
    }
    return CircuitBreakerManager.instance;
  }

  /**
   * Create or get a circuit breaker
   */
  getCircuit(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    if (!this.circuits.has(name)) {
      const circuit = new CircuitBreaker({
        name,
        ...options
      });
      this.circuits.set(name, circuit);
    }
    return this.circuits.get(name)!;
  }

  /**
   * Get all circuits
   */
  getAllCircuits(): Map<string, CircuitBreaker> {
    return this.circuits;
  }

  /**
   * Get statistics for all circuits
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    this.circuits.forEach((circuit, name) => {
      stats[name] = circuit.getStats();
    });
    return stats;
  }

  /**
   * Reset all circuits
   */
  resetAll(): void {
    this.circuits.forEach(circuit => circuit.reset());
  }

  /**
   * Remove a circuit
   */
  removeCircuit(name: string): boolean {
    return this.circuits.delete(name);
  }
}

// Export singleton instance
export const circuitBreakerManager = CircuitBreakerManager.getInstance();