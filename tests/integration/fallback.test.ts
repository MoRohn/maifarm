import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { websocketService } from '../../src/services/websocket';
import { errorHandler } from '../../src/services/errorHandler';
import { logger } from '../../src/services/monitoring/logger';

describe('Fallback Mechanism Integration Tests', () => {
  let originalFetch: typeof global.fetch;
  let mockServer: any;

  beforeAll(() => {
    // Save original fetch
    originalFetch = global.fetch;
    
    // Mock fetch for API calls
    global.fetch = vi.fn();
  });

  afterAll(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('WebSocket Fallback to Mock Data', () => {
    it('should seamlessly transition to mock data when server is unavailable', async () => {
      // Simulate server being down
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      // Force WebSocket to fail and enter mock mode
      const connectSpy = vi.spyOn(websocketService, 'connect');
      websocketService.connect('http://localhost:4567');

      // Simulate connection failures to trigger mock mode
      for (let i = 0; i < 10; i++) {
        const error = new Error('Connection failed');
        (error as any).type = 'TransportError';
        websocketService['handleReconnect']();
      }

      // Verify mock mode is active
      expect(websocketService.isUsingMockData()).toBe(true);
      expect(websocketService.getStatus()).toBe('mock');

      // Verify mock data is being generated
      const metricsPromise = new Promise((resolve) => {
        websocketService.on('metrics:update', (data) => {
          resolve(data);
        });
      });

      // Wait for mock data
      const mockData = await metricsPromise;
      expect(mockData).toBeTruthy();
      expect(mockData).toHaveProperty('data.dashboard');
    });

    it('should maintain application functionality with mock data', async () => {
      // Force mock mode
      (websocketService as any).useMockData = true;
      (websocketService as any).startMockDataGeneration();

      // Collect mock data over time
      const collectedData = {
        metrics: [],
        farms: [],
        agents: []
      };

      websocketService.on('metrics:update', (data) => {
        collectedData.metrics.push(data);
      });

      websocketService.on('farm_update', (data) => {
        collectedData.farms.push(data);
      });

      websocketService.on('agent_update', (data) => {
        collectedData.agents.push(data);
      });

      // Wait for data collection
      await new Promise(resolve => setTimeout(resolve, 15000));

      // Verify data was collected
      expect(collectedData.metrics.length).toBeGreaterThan(0);
      expect(collectedData.metrics[0]).toHaveProperty('data.dashboard.activeFarms');
      
      // Verify data variety (farms and agents should have some updates)
      const totalUpdates = collectedData.farms.length + collectedData.agents.length;
      expect(totalUpdates).toBeGreaterThan(0);
    });
  });

  describe('API Fallback Handling', () => {
    it('should handle API failures gracefully', async () => {
      // Mock failed API call
      (global.fetch as any).mockRejectedValueOnce(new Error('Server error'));

      // Create a mock API call that would fail
      const apiCall = async () => {
        const response = await fetch('/api/farms');
        if (!response.ok) throw new Error('API Error');
        return response.json();
      };

      // Use error handler to catch and handle the error
      let errorLogged = false;
      const unsubscribe = errorHandler.subscribe((error) => {
        if (error.type === 'api') {
          errorLogged = true;
        }
      });

      // Attempt API call
      try {
        await apiCall();
      } catch (error) {
        errorHandler.handleAPIError(error, '/api/farms', 'GET');
      }

      expect(errorLogged).toBe(true);
      unsubscribe();
    });

    it('should retry failed API calls with exponential backoff', async () => {
      let callCount = 0;
      
      // Mock fetch to fail twice then succeed
      (global.fetch as any).mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Server error'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        });
      });

      // API call with retry logic
      const apiCallWithRetry = async (retries = 3) => {
        for (let i = 0; i < retries; i++) {
          try {
            const response = await fetch('/api/test');
            if (response.ok) {
              return await response.json();
            }
            throw new Error('API Error');
          } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 100));
          }
        }
      };

      const result = await apiCallWithRetry();
      expect(result).toEqual({ success: true });
      expect(callCount).toBe(3);
    });
  });

  describe('Connection Status UI Updates', () => {
    it('should track connection status changes', () => {
      const statusChanges: string[] = [];
      
      // Monitor status changes
      const checkStatus = () => {
        const status = websocketService.getStatus();
        if (statusChanges[statusChanges.length - 1] !== status) {
          statusChanges.push(status);
        }
      };

      // Initial status
      checkStatus();
      
      // Attempt connection
      websocketService.connect();
      checkStatus();
      
      // Force disconnect
      websocketService.disconnect();
      checkStatus();
      
      // Force mock mode
      (websocketService as any).useMockData = true;
      checkStatus();

      expect(statusChanges).toContain('disconnected');
      expect(statusChanges.length).toBeGreaterThan(1);
    });

    it('should log appropriate messages for different connection states', () => {
      const logs: any[] = [];
      
      // Intercept logger calls
      const logSpy = vi.spyOn(logger, 'info').mockImplementation((category, message, data) => {
        logs.push({ category, message, data });
      });

      // Simulate connection lifecycle
      websocketService.connect();
      
      // Check for connection attempt log
      const connectionLogs = logs.filter(log => 
        log.category === 'WebSocket' || log.category === 'Network'
      );
      
      expect(connectionLogs.length).toBeGreaterThan(0);
      
      logSpy.mockRestore();
    });
  });

  describe('Error Recovery and Monitoring', () => {
    it('should track and report extended downtime', async () => {
      vi.useFakeTimers();
      
      let downtimeAlert = false;
      const unsubscribe = errorHandler.subscribe((error) => {
        if (error.message.includes('has been down for')) {
          downtimeAlert = true;
        }
      });

      // Simulate extended downtime
      errorHandler.trackConnectionFailure('WebSocket');
      
      // Advance time to trigger downtime alert
      vi.advanceTimersByTime(5 * 60 * 1000); // 5 minutes
      
      errorHandler.alertOnDowntime('WebSocket', 5);
      
      expect(downtimeAlert).toBe(true);
      
      unsubscribe();
      vi.useRealTimers();
    });

    it('should maintain error history for debugging', () => {
      // Log multiple errors
      const errors = [
        new Error('Connection timeout'),
        new Error('Server unreachable'),
        new Error('Invalid response')
      ];

      errors.forEach(error => {
        errorHandler.logError(error, { component: 'Test' });
      });

      // Get error history
      const errorHistory = errorHandler.getErrors({ type: 'system' });
      
      expect(errorHistory.length).toBeGreaterThanOrEqual(3);
      expect(errorHistory.some(e => e.message === 'Connection timeout')).toBe(true);
    });

    it('should clear resolved errors from tracking', () => {
      // Log an error
      const errorId = errorHandler.logError(
        'Test error',
        { component: 'Test' }
      );

      // Verify error exists
      let errors = errorHandler.getErrors();
      expect(errors.some(e => e.id === errorId)).toBe(true);

      // Mark as resolved
      errorHandler.markErrorResolved(errorId);

      // Verify error is marked as resolved
      errors = errorHandler.getErrors({ resolved: false });
      expect(errors.some(e => e.id === errorId)).toBe(false);
    });
  });
});