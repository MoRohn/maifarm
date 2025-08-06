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
      jest.advanceTimersByTime(150);
      expect(mockConnectFn).toHaveBeenCalledTimes(2);
      
      // Third attempt - after 200ms (100 * 2)
      jest.advanceTimersByTime(250);
      expect(mockConnectFn).toHaveBeenCalledTimes(3);
      
      const result = await promise;
      expect(result).toBe(true);
    });

    it('should stop after max retries', async () => {
      mockConnectFn.mockResolvedValue(false);
      const onMaxRetriesReached = jest.fn();

      retryManager = createWebSocketRetryManager({
        maxRetries: 3,
        initialDelay: 100,
        onMaxRetriesReached
      });

      const promise = retryManager.retry(mockConnectFn);
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe(false);
      expect(mockConnectFn).toHaveBeenCalledTimes(3);
      expect(onMaxRetriesReached).toHaveBeenCalled();
    });

    it('should call onRetry callback with correct parameters', async () => {
      mockConnectFn.mockResolvedValue(false);
      const onRetry = jest.fn();

      retryManager = createWebSocketRetryManager({
        maxRetries: 2,
        initialDelay: 100,
        backoffMultiplier: 2,
        onRetry
      });

      const promise = retryManager.retry(mockConnectFn);
      jest.runAllTimers();
      await promise;

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Number));
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Number));
    });

    it('should handle connection errors gracefully', async () => {
      mockConnectFn.mockRejectedValueOnce(new Error('Connection failed'));
      mockConnectFn.mockResolvedValueOnce(true);

      const promise = retryManager.retry(mockConnectFn);
      jest.advanceTimersByTime(150);
      const result = await promise;

      expect(result).toBe(true);
      expect(mockConnectFn).toHaveBeenCalledTimes(2);
    });

    it('should not allow concurrent retries', async () => {
      mockConnectFn.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(false), 500)));

      const promise1 = retryManager.retry(mockConnectFn);
      const promise2 = retryManager.retry(mockConnectFn);

      jest.runAllTimers();
      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(mockConnectFn).toHaveBeenCalledTimes(3); // Only from first retry
    });

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
      jest.runAllTimers();
      await promise;

      // Verify delays don't exceed maxDelay
      expect(delays.every(delay => delay <= 330)).toBe(true); // 330 to account for jitter
    });
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
    });
  });

  describe('reset', () => {
    it('should reset retry count after successful connection', async () => {
      mockConnectFn
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const promise = retryManager.retry(mockConnectFn);
      jest.runAllTimers();
      await promise;

      expect(retryManager.getRetryCount()).toBe(0);
    });
  });

  describe('isCurrentlyRetrying', () => {
    it('should correctly report retry status', async () => {
      mockConnectFn.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(true), 200)));

      expect(retryManager.isCurrentlyRetrying()).toBe(false);

      const promise = retryManager.retry(mockConnectFn);
      expect(retryManager.isCurrentlyRetrying()).toBe(true);

      jest.runAllTimers();
      await promise;

      expect(retryManager.isCurrentlyRetrying()).toBe(false);
    });
  });
});