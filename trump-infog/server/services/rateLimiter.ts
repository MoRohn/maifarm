import Bottleneck from 'bottleneck';
import { IRateLimiter, RateLimitOptions } from './types.js';

export class RateLimiter implements IRateLimiter {
  private limiter: Bottleneck;

  constructor(options?: RateLimitOptions) {
    this.limiter = new Bottleneck({
      maxConcurrent: options?.maxConcurrent || 2,
      minTime: options?.minTime || 100, // Minimum time between requests (ms)
      reservoir: options?.reservoir || 100, // Initial reservoir value
      reservoirRefreshAmount: options?.reservoirRefreshAmount || 100,
      reservoirRefreshInterval: options?.reservoirRefreshInterval || 60 * 1000, // Refresh every minute
    });

    this.limiter.on('error', (error) => {
      console.error('Rate limiter error:', error);
    });

    this.limiter.on('failed', async (error, jobInfo) => {
      const { retryCount } = jobInfo;
      console.warn(`Job failed (retry ${retryCount}):`, error.message);
      
      if (retryCount < 3) {
        return 1000 * Math.pow(2, retryCount); // Exponential backoff
      }
    });

    this.limiter.on('retry', (message, jobInfo) => {
      console.info(`Retrying job (attempt ${jobInfo.retryCount + 1})`);
    });
  }

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    return this.limiter.schedule(fn);
  }

  currentReservoir(): number {
    return this.limiter.currentReservoir() || 0;
  }

  async stop(): Promise<void> {
    await this.limiter.stop();
  }

  updateSettings(options: RateLimitOptions): void {
    if (options.maxConcurrent !== undefined) {
      this.limiter.updateSettings({ maxConcurrent: options.maxConcurrent });
    }
    if (options.minTime !== undefined) {
      this.limiter.updateSettings({ minTime: options.minTime });
    }
    if (options.reservoir !== undefined) {
      this.limiter.updateSettings({ reservoir: options.reservoir });
    }
  }

  async waitForEmpty(): Promise<void> {
    await this.limiter.done();
  }

  counts() {
    return this.limiter.counts();
  }
}

export const rateLimiter = new RateLimiter();