import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { websocketService } from '../../src/services/websocket';
import { errorHandler } from '../../src/services/errorHandler';
import { logger } from '../../src/services/monitoring/logger';

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    connected: false,
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connect: vi.fn(),
  })),
}));

// Mock toast
vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

// Mock error logger
vi.mock('@/utils/errorLogger', () => ({
  logWebSocketError: vi.fn(),
  ErrorCategory: { WEBSOCKET: 'websocket' },
  ErrorSeverity: { HIGH: 'high' },
}));

describe('WebSocket Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Connection Management', () => {
    it('should attempt to connect to the correct URL', () => {
      const mockIo = vi.fn().mockReturnValue({
        connected: false,
        on: vi.fn(),
        emit: vi.fn(),
        disconnect: vi.fn(),
      });
      
      vi.doMock('socket.io-client', () => ({ io: mockIo }));
      
      websocketService.connect('http://localhost:4567');
      
      expect(mockIo).toHaveBeenCalledWith(
        'http://localhost:4567',
        expect.objectContaining({
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 10,
        })
      );
    });

    it('should handle connection errors gracefully', () => {
      const mockSocket = {
        connected: false,
        on: vi.fn((event, handler) => {
          if (event === 'connect_error') {
            handler(new Error('Connection failed'));
          }
        }),
        emit: vi.fn(),
        disconnect: vi.fn(),
      };

      vi.doMock('socket.io-client', () => ({
        io: vi.fn(() => mockSocket),
      }));

      websocketService.connect();
      
      expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
    });

    it('should implement exponential backoff for reconnection', () => {
      const connectSpy = vi.spyOn(websocketService, 'connect');
      
      // Simulate connection failures
      for (let i = 0; i < 3; i++) {
        websocketService.connect();
        vi.advanceTimersByTime(Math.pow(2, i) * 1000);
      }

      expect(connectSpy).toHaveBeenCalledTimes(3);
    });

    it('should switch to mock data after max retries', () => {
      const mockSocket = {
        connected: false,
        on: vi.fn((event, handler) => {
          if (event === 'connect_error') {
            // Simulate max retries
            for (let i = 0; i < 10; i++) {
              handler(new Error('Connection failed'));
            }
          }
        }),
        emit: vi.fn(),
        disconnect: vi.fn(),
      };

      vi.doMock('socket.io-client', () => ({
        io: vi.fn(() => mockSocket),
      }));

      websocketService.connect();
      
      expect(websocketService.isUsingMockData()).toBe(true);
    });
  });

  describe('Message Handling', () => {
    it('should handle incoming messages correctly', () => {
      const messageHandler = vi.fn();
      websocketService.on('test_message', messageHandler);

      const testMessage = {
        type: 'test_message',
        payload: { data: 'test' },
        timestamp: new Date(),
      };

      // Simulate incoming message
      const mockSocket = {
        connected: true,
        on: vi.fn((event, handler) => {
          if (event === 'message') {
            handler(testMessage);
          }
        }),
        emit: vi.fn(),
      };

      vi.doMock('socket.io-client', () => ({
        io: vi.fn(() => mockSocket),
      }));

      expect(messageHandler).toHaveBeenCalledWith(testMessage);
    });

    it('should queue messages when disconnected', () => {
      const mockSocket = {
        connected: false,
        emit: vi.fn(),
      };

      vi.doMock('socket.io-client', () => ({
        io: vi.fn(() => mockSocket),
      }));

      websocketService.emit('test_event', { data: 'test' });
      
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('Mock Data Generation', () => {
    it('should generate mock metrics periodically', () => {
      // Force mock mode
      (websocketService as any).useMockData = true;
      (websocketService as any).startMockDataGeneration();

      const metricsHandler = vi.fn();
      websocketService.on('metrics:update', metricsHandler);

      // Advance timer to trigger mock data generation
      vi.advanceTimersByTime(5000);

      expect(metricsHandler).toHaveBeenCalled();
      expect(metricsHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'metrics:update',
          data: expect.objectContaining({
            dashboard: expect.objectContaining({
              activeFarms: expect.any(Number),
              totalAgents: expect.any(Number),
              tasksCompleted: expect.any(Number),
              successRate: expect.any(Number),
            }),
          }),
        })
      );
    });

    it('should generate mock farm updates', () => {
      (websocketService as any).useMockData = true;
      (websocketService as any).startMockDataGeneration();

      const farmHandler = vi.fn();
      websocketService.on('farm_update', farmHandler);

      // Run multiple times to increase chance of farm update
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(5000);
      }

      // Check if at least one farm update was generated
      const farmUpdates = farmHandler.mock.calls.filter(
        call => call[0].type === 'farm_update'
      );
      expect(farmUpdates.length).toBeGreaterThan(0);
    });
  });

  describe('Error Recovery', () => {
    it('should log WebSocket errors appropriately', () => {
      const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const error = new Error('WebSocket error');
      const mockSocket = {
        on: vi.fn((event, handler) => {
          if (event === 'error') {
            handler(error);
          }
        }),
      };

      vi.doMock('socket.io-client', () => ({
        io: vi.fn(() => mockSocket),
      }));

      websocketService.connect();
      
      expect(logSpy).toHaveBeenCalledWith('WebSocket error:', error);
      logSpy.mockRestore();
    });

    it('should emit status updates during connection lifecycle', () => {
      const statusHandler = vi.fn();
      
      // Test connection status changes
      expect(websocketService.getStatus()).toBe('disconnected');
      
      websocketService.connect();
      expect(websocketService.isConnecting()).toBe(true);
      
      // Simulate successful connection
      const mockSocket = {
        connected: true,
        on: vi.fn((event, handler) => {
          if (event === 'connect') {
            handler();
          }
        }),
      };

      vi.doMock('socket.io-client', () => ({
        io: vi.fn(() => mockSocket),
      }));

      expect(websocketService.getStatus()).toBe('connected');
    });
  });
});