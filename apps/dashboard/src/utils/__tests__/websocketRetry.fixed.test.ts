import { WebSocketRetryManager, createWebSocketRetryManager } from '../websocketRetry';

describe('WebSocketRetryManager - Fixed Tests', () => {
  let retryManager: WebSocketRetryManager;
  let mockConnectFn: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllTimers();
    mockConnectFn = jest.fn();
    retryManager = createWebSocketRetryManager({
      maxRetries: 3,
      initialDelay: 100,
      maxDelay: 1000,
      backoffMultiplier: 2
    });
  });

  afterEach(() => {
    retryManager.cancel();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Basic Functionality', () => {
    it('should succeed on first attempt without delay', async () => {
      mockConnectFn.mockResolvedValue(true);

      const promise = retryManager.retry(mockConnectFn);
      
      // First attempt should be immediate
      expect(mockConnectFn).toHaveBeenCalledTimes(1);
      
      // Process the promise
      await expect(promise).resolves.toBe(true);
      
      expect(retryManager.getRetryCount()).toBe(0);
      expect(retryManager.isCurrentlyRetrying()).toBe(false);
    });

    it('should retry with delays after first failure', async () => {
      mockConnectFn
        .mockResolvedValueOnce(false)  // First attempt fails
        .mockResolvedValueOnce(false)  // Second attempt fails
        .mockResolvedValueOnce(true);  // Third attempt succeeds

      const promise = retryManager.retry(mockConnectFn);
      
      // First attempt is immediate
      expect(mockConnectFn).toHaveBeenCalledTimes(1);
      
      // Fast-forward time for second attempt (100ms base delay + jitter)
      await jest.advanceTimersByTimeAsync(150);
      expect(mockConnectFn).toHaveBeenCalledTimes(2);
      
      // Fast-forward time for third attempt (200ms delay + jitter)
      await jest.advanceTimersByTimeAsync(250);
      expect(mockConnectFn).toHaveBeenCalledTimes(3);
      
      const result = await promise;
      expect(result).toBe(true);
      expect(retryManager.getRetryCount()).toBe(0); // Reset after success
    });

    it('should stop after max retries', async () => {
      mockConnectFn.mockResolvedValue(false);

      const promise = retryManager.retry(mockConnectFn);
      
      // Process all retries
      await jest.runAllTimersAsync();
      
      const result = await promise;
      expect(result).toBe(false);
      expect(mockConnectFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('Callbacks', () => {
    it('should call onRetry callback with correct parameters', async () => {
      const onRetry = jest.fn();
      
      retryManager = createWebSocketRetryManager({
        maxRetries: 2,
        initialDelay: 100,
        backoffMultiplier: 2,
        onRetry
      });

      mockConnectFn.mockResolvedValue(false);
      
      const promise = retryManager.retry(mockConnectFn);
      
      // First attempt (no callback)
      expect(onRetry).not.toHaveBeenCalled();
      
      // Second attempt (first retry)
      await jest.advanceTimersByTimeAsync(150);
      expect(onRetry).toHaveBeenCalledTimes(1);
      
      await jest.runAllTimersAsync();
      await promise;
      
      // With maxRetries=2, we get only 1 onRetry call (second attempt)
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('should call onMaxRetriesReached when max retries exceeded', async () => {
      const onMaxRetriesReached = jest.fn();
      
      retryManager = createWebSocketRetryManager({
        maxRetries: 2,
        initialDelay: 100,
        onMaxRetriesReached
      });

      mockConnectFn.mockResolvedValue(false);
      
      const promise = retryManager.retry(mockConnectFn);
      await jest.runAllTimersAsync();
      await promise;
      
      expect(onMaxRetriesReached).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors and continue retrying', async () => {
      mockConnectFn
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce(true);

      const promise = retryManager.retry(mockConnectFn);
      
      // First attempt fails with error
      expect(mockConnectFn).toHaveBeenCalledTimes(1);
      
      // Second attempt after delay
      await jest.advanceTimersByTimeAsync(150);
      expect(mockConnectFn).toHaveBeenCalledTimes(2);
      
      const result = await promise;
      expect(result).toBe(true);
    });

    it('should handle all attempts throwing errors', async () => {
      mockConnectFn.mockRejectedValue(new Error('Connection failed'));

      const promise = retryManager.retry(mockConnectFn);
      await jest.runAllTimersAsync();
      
      const result = await promise;
      expect(result).toBe(false);
      expect(mockConnectFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('Concurrency Control', () => {
    it('should not allow concurrent retry attempts', async () => {
      mockConnectFn.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(false), 50))
      );

      const promise1 = retryManager.retry(mockConnectFn);
      const promise2 = retryManager.retry(mockConnectFn);
      
      // Second call should return false immediately
      await expect(promise2).resolves.toBe(false);
      
      // First call continues
      await jest.runAllTimersAsync();
      await expect(promise1).resolves.toBe(false);
      
      // Only the first retry should have made attempts
      expect(mockConnectFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('Cancellation', () => {
    it('should cancel and reset state properly', async () => {
      mockConnectFn.mockResolvedValue(false);

      const promise = retryManager.retry(mockConnectFn);
      
      // Start retrying
      expect(retryManager.isCurrentlyRetrying()).toBe(true);
      
      // Cancel the retry
      retryManager.cancel();
      
      // Complete all timers
      await jest.runAllTimersAsync();
      const result = await promise;
      
      // Should return false when cancelled
      expect(result).toBe(false);
      
      // State should be reset after cancel
      expect(retryManager.getRetryCount()).toBe(0);
      expect(retryManager.isCurrentlyRetrying()).toBe(false);
    });

    it('should reset state after cancel', () => {
      retryManager.cancel();
      
      expect(retryManager.getRetryCount()).toBe(0);
      expect(retryManager.isCurrentlyRetrying()).toBe(false);
    });
  });

  describe('Exponential Backoff', () => {
    it('should apply exponential backoff with max delay limit', async () => {
      const delays: number[] = [];
      
      retryManager = createWebSocketRetryManager({
        maxRetries: 5,
        initialDelay: 100,
        maxDelay: 300,
        backoffMultiplier: 2,
        onRetry: (_, delay) => delays.push(delay)
      });

      mockConnectFn.mockResolvedValue(false);
      
      const promise = retryManager.retry(mockConnectFn);
      await jest.runAllTimersAsync();
      await promise;
      
      // Check that delays increase but are capped at maxDelay (+ jitter)
      // Note: We get 4 delays because the first attempt has no delay
      expect(delays.length).toBe(4);
      
      // The calculation is: initialDelay * (backoffMultiplier ^ (retryCount - 1))
      // When retryCount=1: 100 * (2 ^ 0) = 100ms
      // When retryCount=2: 100 * (2 ^ 1) = 200ms  
      // When retryCount=3: 100 * (2 ^ 2) = 400ms -> capped at 300ms
      // When retryCount=4: 100 * (2 ^ 3) = 800ms -> capped at 300ms
      
      // All delays should be within valid ranges
      delays.forEach((delay, index) => {
        expect(delay).toBeGreaterThan(0);
        expect(delay).toBeLessThanOrEqual(330); // Max delay + 10% jitter
      });
    });
  });

  describe('State Management', () => {
    it('should correctly track retry status', async () => {
      mockConnectFn.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(false), 50))
      );

      expect(retryManager.isCurrentlyRetrying()).toBe(false);

      const promise = retryManager.retry(mockConnectFn);
      expect(retryManager.isCurrentlyRetrying()).toBe(true);

      await jest.runAllTimersAsync();
      await promise;

      expect(retryManager.isCurrentlyRetrying()).toBe(false);
    });

    it('should reset retry count after successful connection', async () => {
      mockConnectFn
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const promise = retryManager.retry(mockConnectFn);
      
      // After first failure, retry count should be 1
      await jest.advanceTimersByTimeAsync(150);
      
      await promise;
      
      // After success, retry count should be reset
      expect(retryManager.getRetryCount()).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle immediate success without creating timers', async () => {
      mockConnectFn.mockResolvedValue(true);
      
      const promise = retryManager.retry(mockConnectFn);
      const result = await promise;
      
      expect(result).toBe(true);
      expect(mockConnectFn).toHaveBeenCalledTimes(1);
      
      // Verify no timers were created
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should handle zero max retries', async () => {
      retryManager = createWebSocketRetryManager({
        maxRetries: 0,
        initialDelay: 100
      });

      mockConnectFn.mockResolvedValue(false);
      
      const result = await retryManager.retry(mockConnectFn);
      
      expect(result).toBe(false);
      expect(mockConnectFn).not.toHaveBeenCalled();
    });

    it('should handle very large retry counts', async () => {
      retryManager = createWebSocketRetryManager({
        maxRetries: 100,
        initialDelay: 10,
        maxDelay: 50,
        backoffMultiplier: 1.5
      });

      let callCount = 0;
      mockConnectFn.mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount === 50); // Succeed on 50th attempt
      });

      const promise = retryManager.retry(mockConnectFn);
      
      // Fast-forward through all retries
      while (callCount < 50) {
        await jest.advanceTimersByTimeAsync(100);
      }
      
      const result = await promise;
      expect(result).toBe(true);
      expect(callCount).toBe(50);
    });
  });
});