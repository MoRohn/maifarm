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

  constructor(private config: WebSocketRetryConfig) {}

  async retry(connectFn: () => Promise<boolean>): Promise<boolean> {
    if (this.isRetrying) {
      console.warn('Already retrying connection');
      return false;
    }

    this.isRetrying = true;

    while (this.retryCount < this.config.maxRetries) {
      const delay = this.calculateDelay();
      
      if (this.config.onRetry) {
        this.config.onRetry(this.retryCount + 1, delay);
      }

      await this.delay(delay);

      try {
        const success = await connectFn();
        if (success) {
          this.reset();
          return true;
        }
      } catch (error) {
        // Only log if not backend unavailable warning
        if (!window.__backendWarningShown) {
          console.error(`Connection attempt ${this.retryCount + 1} failed:`, error);
        }
      }

      this.retryCount++;
    }

    // Max retries reached
    if (this.config.onMaxRetriesReached) {
      this.config.onMaxRetriesReached();
    }

    this.isRetrying = false;
    return false;
  }

  private calculateDelay(): number {
    const delay = Math.min(
      this.config.initialDelay * Math.pow(this.config.backoffMultiplier, this.retryCount),
      this.config.maxDelay
    );
    
    // Add jitter to prevent thundering herd
    const jitter = delay * 0.1 * Math.random();
    return Math.floor(delay + jitter);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      this.retryTimer = setTimeout(resolve, ms);
    });
  }

  reset() {
    this.retryCount = 0;
    this.isRetrying = false;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  getRetryCount(): number {
    return this.retryCount;
  }

  isCurrentlyRetrying(): boolean {
    return this.isRetrying;
  }

  cancel() {
    this.reset();
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