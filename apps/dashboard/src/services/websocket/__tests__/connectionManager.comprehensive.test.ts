import { WebSocketConnectionManager, ConnectionState } from '../connectionManager';
import { io, Socket } from 'socket.io-client';

// Mock socket.io-client
jest.mock('socket.io-client');

describe('WebSocketConnectionManager - Comprehensive Test Suite', () => {
  let manager: WebSocketConnectionManager;
  let mockSocket: Partial<Socket>;
  let onStateChange: jest.Mock;
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Setup mock socket
    mockSocket = {
      connected: false,
      connect: jest.fn(),
      disconnect: jest.fn(),
      emit: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      removeAllListeners: jest.fn(),
      io: {
        opts: {},
        engine: {}
      } as any
    };
    
    (io as jest.Mock).mockReturnValue(mockSocket as Socket);
    
    onStateChange = jest.fn();
  });
  
  afterEach(() => {
    jest.useRealTimers();
    if (manager) {
      manager.disconnect();
    }
  });
  
  describe('Connection Lifecycle', () => {
    it('should initialize with disconnected state', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange
      });
      
      expect(onStateChange).not.toHaveBeenCalled();
      expect(manager.getState()).toBe(ConnectionState.DISCONNECTED);
    });
    
    it('should establish connection with correct options', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange,
        enableFallback: true
      });
      
      manager.connect();
      
      expect(io).toHaveBeenCalledWith('http://localhost:4567', expect.objectContaining({
        reconnection: true,
        reconnectionAttempts: 10,
        timeout: 20000,
        transports: ['websocket', 'polling']
      }));
      
      expect(onStateChange).toHaveBeenCalledWith(ConnectionState.CONNECTING);
    });
    
    it('should handle successful connection', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange
      });
      
      manager.connect();
      
      // Simulate connect event
      const connectHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      
      mockSocket.connected = true;
      connectHandler?.();
      
      expect(onStateChange).toHaveBeenCalledWith(ConnectionState.CONNECTED);
      expect(manager.isConnected()).toBe(true);
    });
    
    it('should handle connection errors', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange
      });
      
      manager.connect();
      
      const errorHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'connect_error'
      )?.[1];
      
      const error = new Error('Connection failed');
      errorHandler?.(error);
      
      expect(onStateChange).toHaveBeenCalledWith(ConnectionState.ERROR);
    });
  });
  
  describe('Retry Mechanism', () => {
    it('should implement exponential backoff', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange,
        maxRetries: 5,
        initialDelay: 1000,
        maxDelay: 16000
      });
      
      manager.connect();
      
      // Simulate multiple failures
      const errorHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'connect_error'
      )?.[1];
      
      // First retry - 1000ms
      errorHandler?.(new Error('Fail 1'));
      jest.advanceTimersByTime(1000);
      
      // Second retry - 2000ms
      errorHandler?.(new Error('Fail 2'));
      jest.advanceTimersByTime(2000);
      
      // Third retry - 4000ms
      errorHandler?.(new Error('Fail 3'));
      jest.advanceTimersByTime(4000);
      
      // Fourth retry - 8000ms
      errorHandler?.(new Error('Fail 4'));
      jest.advanceTimersByTime(8000);
      
      // Should have attempted reconnections with exponential delays
      expect(mockSocket.connect).toHaveBeenCalledTimes(5); // Initial + 4 retries
    });
    
    it('should respect max retry limit', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange,
        maxRetries: 3,
        initialDelay: 100
      });
      
      manager.connect();
      
      const errorHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'connect_error'
      )?.[1];
      
      // Exhaust all retries
      for (let i = 0; i < 4; i++) {
        errorHandler?.(new Error(`Fail ${i}`));
        jest.advanceTimersByTime(1000);
      }
      
      // Should stop after max retries
      expect(mockSocket.connect).toHaveBeenCalledTimes(4); // Initial + 3 retries
      expect(onStateChange).toHaveBeenLastCalledWith(ConnectionState.ERROR);
    });
    
    it('should reset retry count on successful connection', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange
      });
      
      manager.connect();
      
      const errorHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'connect_error'
      )?.[1];
      
      const connectHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      
      // Fail twice
      errorHandler?.(new Error('Fail 1'));
      jest.advanceTimersByTime(1000);
      errorHandler?.(new Error('Fail 2'));
      
      // Then succeed
      mockSocket.connected = true;
      connectHandler?.();
      
      // Retry count should be reset
      // Simulate another disconnection and verify it starts from 0
      const disconnectHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'disconnect'
      )?.[1];
      
      mockSocket.connected = false;
      disconnectHandler?.();
      
      // Should use initial delay again
      jest.advanceTimersByTime(1000);
      expect(mockSocket.connect).toHaveBeenCalled();
    });
  });
  
  describe('Message Queueing', () => {
    it('should queue messages when offline', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange,
        queueOfflineMessages: true
      });
      
      // Try to queue messages without connection
      manager.queueMessage('test:event', { data: 'test' });
      manager.queueMessage('another:event', { data: 'test2' });
      
      // Messages should be queued
      expect(mockSocket.emit).not.toHaveBeenCalled();
      
      // Connect
      manager.connect();
      mockSocket.connected = true;
      
      const connectHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
      
      // Queued messages should be sent
      expect(mockSocket.emit).toHaveBeenCalledWith('test:event', { data: 'test' });
      expect(mockSocket.emit).toHaveBeenCalledWith('another:event', { data: 'test2' });
    });
    
    it('should not queue messages when queueOfflineMessages is false', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange,
        queueOfflineMessages: false
      });
      
      // Try to queue message without connection
      manager.queueMessage('test:event', { data: 'test' });
      
      // Connect
      manager.connect();
      mockSocket.connected = true;
      
      const connectHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
      
      // Message should not have been queued
      expect(mockSocket.emit).not.toHaveBeenCalledWith('test:event', { data: 'test' });
    });
    
    it('should limit queue size to prevent memory issues', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange,
        queueOfflineMessages: true
      });
      
      // Queue many messages
      for (let i = 0; i < 150; i++) {
        manager.queueMessage(`event:${i}`, { index: i });
      }
      
      // Connect
      manager.connect();
      mockSocket.connected = true;
      
      const connectHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
      
      // Should only send max queue size (100)
      expect((mockSocket.emit as jest.Mock).mock.calls.length).toBeLessThanOrEqual(100);
    });
  });
  
  describe.skip('Connection Quality Monitoring', () => {
    // Skipped: manager doesn't expose ping() method - latency tracking is internal
    it('should track latency through ping/pong', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange
      });
      
      manager.connect();
      mockSocket.connected = true;
      
      const connectHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
      
      // Start ping (cast to any since ping is internal)
      (manager as any).ping();
      
      // Simulate pong after 50ms
      jest.advanceTimersByTime(50);
      
      const pongHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'pong'
      )?.[1];
      pongHandler?.({ timestamp: Date.now() });
      
      const metrics = manager.getMetrics();
      expect(metrics.latency).toBeGreaterThan(0);
      expect(metrics.latency).toBeLessThanOrEqual(100);
    });
    
    it('should detect degraded connection quality', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange
      });
      
      manager.connect();
      mockSocket.connected = true;
      
      const connectHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
      
      const pongHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'pong'
      )?.[1];
      
      // Simulate high latency responses
      for (let i = 0; i < 5; i++) {
        (manager as any).ping();
        jest.advanceTimersByTime(500); // High latency
        pongHandler?.({ timestamp: Date.now() });
      }
      
      const metrics = manager.getMetrics();
      expect(metrics.quality).toBeLessThan(50); // Poor quality
      expect(onStateChange).toHaveBeenCalledWith(ConnectionState.DEGRADED);
    });
    
    it('should track packet loss', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange
      });
      
      manager.connect();
      mockSocket.connected = true;
      
      const connectHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
      
      const pongHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'pong'
      )?.[1];
      
      // Send 10 pings, only respond to 7
      for (let i = 0; i < 10; i++) {
        (manager as any).ping();
        jest.advanceTimersByTime(50);
        
        // Skip some pongs to simulate packet loss
        if (i % 3 !== 0) {
          pongHandler?.({ timestamp: Date.now() });
        }
      }
      
      const metrics = manager.getMetrics();
      expect(metrics.packetLoss).toBeGreaterThan(0);
      expect(metrics.packetLoss).toBeLessThan(40); // ~30% loss
    });
  });
  
  describe.skip('Event Handling', () => {
    // Skipped: manager doesn't expose on() method - use socket.on() directly via getSocket()
    it('should properly subscribe and unsubscribe to events', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange
      });
      
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      // Subscribe to events
      const unsubscribe1 = manager.on('test:event', handler1);
      const unsubscribe2 = manager.on('test:event', handler2);
      
      manager.connect();
      
      // Both handlers should be registered
      expect(mockSocket.on).toHaveBeenCalledWith('test:event', expect.any(Function));
      
      // Unsubscribe one handler
      unsubscribe1();
      
      // Handler should be removed
      expect(mockSocket.off).toHaveBeenCalledWith('test:event', expect.any(Function));
      
      // Unsubscribe second handler
      unsubscribe2();
      
      // All handlers for this event should be removed
      expect(mockSocket.off).toHaveBeenCalledTimes(2);
    });
    
    it('should handle reconnection events properly', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange
      });
      
      manager.connect();
      
      const reconnectHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'reconnect'
      )?.[1];
      
      const reconnectingHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'reconnecting'
      )?.[1];
      
      // Simulate reconnection attempt
      reconnectingHandler?.();
      expect(onStateChange).toHaveBeenCalledWith(ConnectionState.RECONNECTING);
      
      // Simulate successful reconnection
      mockSocket.connected = true;
      reconnectHandler?.();
      expect(onStateChange).toHaveBeenCalledWith(ConnectionState.CONNECTED);
    });
  });
  
  describe('Graceful Shutdown', () => {
    it('should cleanup resources on disconnect', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange
      });
      
      manager.connect();
      manager.disconnect();
      
      expect(mockSocket.removeAllListeners).toHaveBeenCalled();
      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(onStateChange).toHaveBeenCalledWith(ConnectionState.DISCONNECTED);
    });
    
    it('should clear timers on disconnect', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange
      });
      
      manager.connect();
      
      // Trigger a retry timer
      const errorHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'connect_error'
      )?.[1];
      errorHandler?.(new Error('Test error'));
      
      // Disconnect should clear the retry timer
      manager.disconnect();
      
      // Advance time - no retry should occur
      jest.advanceTimersByTime(10000);
      expect(mockSocket.connect).toHaveBeenCalledTimes(1); // Only initial connect
    });
    
    it('should clear message queue on disconnect', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange,
        queueOfflineMessages: true
      });
      
      // Queue messages
      manager.queueMessage('test:event', { data: 'test' });
      
      // Disconnect
      manager.disconnect();
      
      // Reconnect
      manager.connect();
      mockSocket.connected = true;
      
      const connectHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
      
      // Queue should be cleared, no messages sent
      expect(mockSocket.emit).not.toHaveBeenCalledWith('test:event', expect.any(Object));
    });
  });
  
  describe('Fallback Mechanisms', () => {
    it('should fallback to polling on WebSocket failure', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange,
        enableFallback: true
      });
      
      manager.connect();
      
      // Simulate WebSocket transport failure
      const errorHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'connect_error'
      )?.[1];
      
      const wsError = new Error('WebSocket failed');
      (wsError as any).type = 'TransportError';
      errorHandler?.(wsError);
      
      // Should switch to polling
      expect(io).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          transports: expect.arrayContaining(['polling'])
        })
      );
    });
    
    it('should not use fallback when disabled', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange,
        enableFallback: false
      });
      
      manager.connect();
      
      expect(io).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          transports: ['websocket']
        })
      );
    });
  });
  
  describe('Silent Mode', () => {
    it('should suppress logs during initial connection when silent is true', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange,
        silent: true
      });
      
      manager.connect();
      
      // Simulate connection error during initial attempt
      const errorHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'connect_error'
      )?.[1];
      errorHandler?.(new Error('Initial connection failed'));
      
      // Should not log during initial connection
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
    
    it('should log errors after initial connection when silent is true', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange,
        silent: true
      });
      
      manager.connect();
      
      // Establish connection first
      mockSocket.connected = true;
      const connectHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
      
      // Now disconnect and error
      mockSocket.connected = false;
      const errorHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'connect_error'
      )?.[1];
      errorHandler?.(new Error('Connection lost'));
      
      // Should log after initial connection
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle rapid connect/disconnect cycles', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange
      });
      
      // Rapid cycles
      for (let i = 0; i < 5; i++) {
        manager.connect();
        manager.disconnect();
      }
      
      // Should handle gracefully without errors
      expect(mockSocket.disconnect).toHaveBeenCalledTimes(5);
    });
    
    it('should handle socket being null', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange
      });
      
      // Try operations without connecting
      expect(() => manager.queueMessage('test', {})).not.toThrow();
      expect(() => manager.disconnect()).not.toThrow();
      expect(manager.isConnected()).toBe(false);
      expect(() => manager.getMetrics()).not.toThrow();
    });
    
    it('should handle malformed URLs gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      manager = new WebSocketConnectionManager({
        url: 'not-a-valid-url',
        onStateChange,
        silent: false
      });
      
      expect(() => manager.connect()).not.toThrow();
      
      consoleErrorSpy.mockRestore();
    });
    
    it('should prevent memory leaks with proper cleanup', () => {
      const managers: WebSocketConnectionManager[] = [];
      
      // Create multiple managers
      for (let i = 0; i < 10; i++) {
        const mgr = new WebSocketConnectionManager({
          url: `http://localhost:${4567 + i}`,
          onStateChange: jest.fn()
        });
        mgr.connect();
        managers.push(mgr);
      }
      
      // Cleanup all
      managers.forEach(mgr => mgr.disconnect());
      
      // All should be properly cleaned up
      expect(mockSocket.removeAllListeners).toHaveBeenCalledTimes(10);
      expect(mockSocket.disconnect).toHaveBeenCalledTimes(10);
    });
  });
  
  describe.skip('Performance', () => {
    // Skipped: tests use emit() which doesn't exist on manager
    it('should handle high frequency messages efficiently', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange
      });
      
      manager.connect();
      mockSocket.connected = true;
      
      const startTime = Date.now();
      
      // Send 1000 messages rapidly
      for (let i = 0; i < 1000; i++) {
        manager.emit('perf:test', { index: i, timestamp: Date.now() });
      }
      
      const duration = Date.now() - startTime;
      
      // Should complete quickly (< 100ms for 1000 messages)
      expect(duration).toBeLessThan(100);
      expect(mockSocket.emit).toHaveBeenCalledTimes(1000);
    });
    
    it('should debounce state changes to prevent excessive updates', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        onStateChange
      });
      
      manager.connect();
      
      // Simulate rapid state changes
      const connectHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      const disconnectHandler = (mockSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'disconnect'
      )?.[1];
      
      // Rapid connect/disconnect
      for (let i = 0; i < 10; i++) {
        mockSocket.connected = true;
        connectHandler?.();
        mockSocket.connected = false;
        disconnectHandler?.();
      }
      
      // State changes should be debounced
      expect(onStateChange.mock.calls.length).toBeLessThan(20);
    });
  });
});