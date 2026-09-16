import { WebSocketRetryManager, createWebSocketRetryManager } from '../websocketRetry';

describe('WebSocketRetryManager', () => {
  let retryManager: WebSocketRetryManager;
  let mockConnectFn: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    mockConnectFn = jest.fn();
    retryManager = createWebSocketRetryManager({
      maxRetries: 3,
      initialDelay: 100,
      maxDelay: 1000,
      backoffMultiplier: 2
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    retryManager.cancel();
  });

  describe('retry', () => {
    it('should succeed on first attempt', async () => {
      mockConnectFn.mockResolvedValue(true);

      const promise = retryManager.retry(mockConnectFn);
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe(true);
      expect(mockConnectFn).toHaveBeenCalledTimes(1);
      expect(retryManager.getRetryCount()).toBe(0);
    });

    it('should retry on failure with exponential backoff', async () => {
      mockConnectFn
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const promise = retryManager.retry(mockConnectFn);

      // First attempt - immediate
      expect(mockConnectFn).toHaveBeenCalledTimes(1);

      // Second attempt - after 100ms
      await jest.advanceTimersByTimeAsync(150);
      expect(mockConnectFn).toHaveBeenCalledTimes(2);

      // Third attempt - after 200ms (100 * 2)
      await jest.advanceTimersByTimeAsync(250);
      expect(mockConnectFn).toHaveBeenCalledTimes(3);

      const result = await promise;
      expect(result).toBe(true);
    }, 15000); // Increased timeout for multiple retries

    it('should stop after max retries', async () => {
      mockConnectFn.mockResolvedValue(false);
      const onMaxRetriesReached = jest.fn();

      retryManager = createWebSocketRetryManager({
        maxRetries: 3,
        initialDelay: 100,
        onMaxRetriesReached
      });

      const promise = retryManager.retry(mockConnectFn);

      // Run all timers and flush promises
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe(false);
      expect(mockConnectFn).toHaveBeenCalledTimes(3);
      expect(onMaxRetriesReached).toHaveBeenCalled();
    }, 15000); // Increased timeout for multiple retries

    it('should call onRetry callback with correct parameters', async () => {
      mockConnectFn.mockResolvedValue(false);
      const onRetry = jest.fn();

      retryManager = createWebSocketRetryManager({
        maxRetries: 3,  // 3 attempts total = 1 initial + 2 retries
        initialDelay: 100,
        backoffMultiplier: 2,
        onRetry
      });

      const promise = retryManager.retry(mockConnectFn);
      await jest.runAllTimersAsync();
      await promise;

      expect(onRetry).toHaveBeenCalledTimes(2);  // Called for retry 1 and retry 2
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Number));
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Number));
    }, 15000); // Increased timeout for multiple retries

    it('should handle connection errors gracefully', async () => {
      mockConnectFn.mockRejectedValueOnce(new Error('Connection failed'));
      mockConnectFn.mockResolvedValueOnce(true);

      const promise = retryManager.retry(mockConnectFn);
      await jest.advanceTimersByTimeAsync(150);
      const result = await promise;

      expect(result).toBe(true);
      expect(mockConnectFn).toHaveBeenCalledTimes(2);
    }, 15000); // Increased timeout for async operations

    it('should not allow concurrent retries', async () => {
      // Use fake timer compatible implementation
      mockConnectFn.mockResolvedValue(false);

      const promise1 = retryManager.retry(mockConnectFn);
      const promise2 = retryManager.retry(mockConnectFn);

      await jest.runAllTimersAsync();
      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(mockConnectFn).toHaveBeenCalledTimes(3); // Only from first retry
    }, 15000); // Increased timeout for async operations

    it('should respect max delay limit', async () => {
      mockConnectFn.mockResolvedValue(false);
      const delays: number[] = [];

      retryManager = createWebSocketRetryManager({
        maxRetries: 5,
        initialDelay: 100,
        maxDelay: 300,
        backoffMultiplier: 2,
        onRetry: (_, delay) => delays.push(delay)
      });

      const promise = retryManager.retry(mockConnectFn);
      await jest.runAllTimersAsync();
      await promise;

      // Verify delays don't exceed maxDelay
      expect(delays.every(delay => delay <= 330)).toBe(true); // 330 to account for jitter
    }, 15000); // Increased timeout for multiple retries
  });

  describe('cancel', () => {
    it('should cancel ongoing retry attempts', async () => {
      mockConnectFn.mockResolvedValue(false);

      const promise = retryManager.retry(mockConnectFn);
      jest.advanceTimersByTime(50);

      retryManager.cancel();
      jest.runAllTimers();

      const result = await promise;

      expect(result).toBe(false);
      expect(retryManager.getRetryCount()).toBe(0);
      expect(retryManager.isCurrentlyRetrying()).toBe(false);
    }, 15000); // Increased timeout for async operations
  });

  describe('reset', () => {
    it('should reset retry count after successful connection', async () => {
      mockConnectFn
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const promise = retryManager.retry(mockConnectFn);
      await jest.runAllTimersAsync();
      await promise;

      expect(retryManager.getRetryCount()).toBe(0);
    }, 15000); // Increased timeout for async operations
  });

  describe('isCurrentlyRetrying', () => {
    it('should correctly report retry status', async () => {
      // Use fake timer compatible implementation
      mockConnectFn.mockResolvedValue(true);

      expect(retryManager.isCurrentlyRetrying()).toBe(false);

      const promise = retryManager.retry(mockConnectFn);
      expect(retryManager.isCurrentlyRetrying()).toBe(true);

      await jest.runAllTimersAsync();
      await promise;

      expect(retryManager.isCurrentlyRetrying()).toBe(false);
    }, 15000); // Increased timeout for async operations
  });
});