export interface WebSocketRetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  onRetry?: (attempt: number, delay: number) => void;
  onMaxRetriesReached?: () => void;
}

export class WebSocketRetryManager {
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private isRetrying = false;
  private stopRequested = false;
  private pendingResolve: ((value: boolean) => void) | null = null;

  constructor(private config: WebSocketRetryConfig) {}

  async retry(connectFn: () => Promise<boolean>): Promise<boolean> {
    if (this.isRetrying) {
      console.warn('Already retrying connection');
      return false;
    }

    this.isRetrying = true;
    this.retryCount = 0;
    this.stopRequested = false;

    return new Promise<boolean>((resolve) => {
      this.pendingResolve = resolve;
      // Don't await here - let it run asynchronously
      this.executeAttempt(connectFn).catch((error) => {
        console.error('Unexpected error in retry execution:', error);
        this.resolve(false);
      });
    });
  }

  private async executeAttempt(connectFn: () => Promise<boolean>): Promise<void> {
    if (this.stopRequested) {
      this.resolve(false);
      return;
    }

    const attemptNumber = this.retryCount + 1;

    try {
      const success = await connectFn();
      if (success) {
        this.resolve(true);
        return;
      }
    } catch (error) {
      if (typeof window !== 'undefined' && !(window as any).__backendWarningShown) {
        console.error(`Connection attempt ${attemptNumber} failed:`, error);
      }
    }

    this.retryCount = attemptNumber;

    if (this.stopRequested) {
      this.resolve(false);
      return;
    }

    if (this.retryCount >= this.config.maxRetries) {
      if (this.config.onMaxRetriesReached) {
        this.config.onMaxRetriesReached();
      }
      this.resolve(false);
      return;
    }

    const delay = this.calculateDelay(this.retryCount);

    if (this.config.onRetry) {
      this.config.onRetry(this.retryCount, delay);
    }

    this.retryTimer = setTimeout(() => {
      // Don't await - the promise chain is maintained through pendingResolve
      this.executeAttempt(connectFn).catch((error) => {
        console.error('Error during retry attempt:', error);
        this.resolve(false);
      });
    }, delay);
  }

  private calculateDelay(attemptNumber: number): number {
    const delay = Math.min(
      this.config.initialDelay * Math.pow(this.config.backoffMultiplier, Math.max(0, attemptNumber - 1)),
      this.config.maxDelay
    );
    
    // Add jitter to prevent thundering herd
    const jitter = delay * 0.1 * Math.random();
    return Math.floor(delay + jitter);
  }

  reset() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.retryCount = 0;
    this.isRetrying = false;
    this.stopRequested = false;
    this.pendingResolve = null;
  }

  getRetryCount(): number {
    return this.retryCount;
  }

  isCurrentlyRetrying(): boolean {
    return this.isRetrying;
  }

  cancel() {
    if (!this.isRetrying) {
      return;
    }

    this.stopRequested = true;

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    if (this.pendingResolve) {
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      this.retryCount = 0;
      this.isRetrying = false;
      resolve(false);
    }
  }

  private resolve(success: boolean) {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    const resolve = this.pendingResolve;
    this.pendingResolve = null;
    this.retryCount = 0;
    this.isRetrying = false;
    this.stopRequested = false;

    if (resolve) {
      resolve(success);
    }
  }
}

// Factory function for creating retry manager with sensible defaults
export function createWebSocketRetryManager(
  options: Partial<WebSocketRetryConfig> = {}
): WebSocketRetryManager {
  const defaultConfig: WebSocketRetryConfig = {
    maxRetries: 10,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 1.5,
    ...options
  };

  return new WebSocketRetryManager(defaultConfig);
}
