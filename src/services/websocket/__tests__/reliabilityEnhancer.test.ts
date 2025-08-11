import { reliabilityEnhancer } from '../reliabilityEnhancer';
import { Socket } from 'socket.io-client';

describe('WebSocketReliabilityEnhancer', () => {
  let mockSocket: jest.Mocked<Socket>;
  let enhancer: typeof reliabilityEnhancer;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Create a fresh enhancer instance
    enhancer = new (reliabilityEnhancer as any).constructor();
    
    // Create mock socket
    mockSocket = {
      connected: false,
      emit: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      disconnect: jest.fn()
    } as any;
  });

  afterEach(() => {
    jest.useRealTimers();
    enhancer.cleanup();
  });

  describe('Socket Enhancement', () => {
    test('should enhance socket without errors', () => {
      const enhanced = enhancer.enhanceSocket(mockSocket);
      
      expect(enhanced).toBe(mockSocket);
      expect(mockSocket.on).toHaveBeenCalled();
    });

    test('should not double-enhance the same socket', () => {
      enhancer.enhanceSocket(mockSocket);
      const onCallCount = mockSocket.on.mock.calls.length;
      
      enhancer.enhanceSocket(mockSocket);
      
      expect(mockSocket.on.mock.calls.length).toBe(onCallCount);
    });

    test('should add all reliability features by default', () => {
      enhancer.enhanceSocket(mockSocket);
      
      // Check for various event listeners
      const registeredEvents = mockSocket.on.mock.calls.map(call => call[0]);
      
      expect(registeredEvents).toContain('message:ack');
      expect(registeredEvents).toContain('messages:ack');
      expect(registeredEvents).toContain('ping');
      expect(registeredEvents).toContain('connection:latency');
      expect(registeredEvents).toContain('connection:warning');
      expect(registeredEvents).toContain('connect');
      expect(registeredEvents).toContain('disconnect');
    });
  });

  describe('Acknowledgment Support', () => {
    test('should handle message acknowledgments', async () => {
      const originalEmit = mockSocket.emit;
      enhancer.enhanceSocket(mockSocket);
      
      // Send a message requiring acknowledgment
      const promise = mockSocket.emit('test:event', {
        requiresAck: true,
        data: 'test'
      });
      
      // Get the message ID from the emitted call
      const emittedData = originalEmit.mock.calls[0][1];
      const messageId = emittedData.id;
      
      // Simulate acknowledgment
      const ackHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'message:ack'
      )?.[1];
      
      ackHandler?.(messageId);
      
      await expect(promise).resolves.toBe(true);
    });

    test('should timeout on missing acknowledgment', async () => {
      enhancer = new (reliabilityEnhancer as any).constructor({
        acknowledgmentTimeout: 1000
      });
      
      enhancer.enhanceSocket(mockSocket);
      
      const promise = mockSocket.emit('test:event', {
        requiresAck: true,
        data: 'test'
      });
      
      // Fast-forward past timeout
      jest.advanceTimersByTime(1100);
      
      await expect(promise).rejects.toThrow('Acknowledgment timeout');
    });

    test('should handle batch acknowledgments', () => {
      const originalEmit = mockSocket.emit;
      enhancer.enhanceSocket(mockSocket);
      
      // Send multiple messages
      const promises = [
        mockSocket.emit('test1', { requiresAck: true }),
        mockSocket.emit('test2', { requiresAck: true }),
        mockSocket.emit('test3', { requiresAck: true })
      ];
      
      // Get message IDs
      const messageIds = originalEmit.mock.calls.map(call => call[1].id);
      
      // Simulate batch acknowledgment
      const batchAckHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'messages:ack'
      )?.[1];
      
      batchAckHandler?.(messageIds);
      
      promises.forEach(promise => {
        expect(promise).resolves.toBe(true);
      });
    });

    test('should emit normal messages without acknowledgment', () => {
      const originalEmit = mockSocket.emit;
      enhancer.enhanceSocket(mockSocket);
      
      const result = mockSocket.emit('test:event', { data: 'test' });
      
      expect(originalEmit).toHaveBeenCalledWith('test:event', { data: 'test' });
      expect(result).not.toBeInstanceOf(Promise);
    });
  });

  describe('Latency Tracking', () => {
    test('should respond to ping with pong', () => {
      enhancer.enhanceSocket(mockSocket);
      
      const pingHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'ping'
      )?.[1];
      
      const timestamp = Date.now();
      pingHandler?.({ timestamp });
      
      // Fast-forward debounce timer
      jest.advanceTimersByTime(100);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('pong', { timestamp });
    });

    test('should debounce rapid pings', () => {
      enhancer.enhanceSocket(mockSocket);
      
      const pingHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'ping'
      )?.[1];
      
      // Send multiple rapid pings
      pingHandler?.({ timestamp: 1000 });
      pingHandler?.({ timestamp: 2000 });
      pingHandler?.({ timestamp: 3000 });
      
      // Only the last ping should be responded to
      jest.advanceTimersByTime(100);
      
      expect(mockSocket.emit).toHaveBeenCalledTimes(1);
      expect(mockSocket.emit).toHaveBeenCalledWith('pong', { timestamp: 3000 });
    });

    test('should track latency history', () => {
      enhancer.enhanceSocket(mockSocket);
      
      const latencyHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connection:latency'
      )?.[1];
      
      latencyHandler?.({ latency: 50 });
      latencyHandler?.({ latency: 100 });
      latencyHandler?.({ latency: 75 });
      
      const metrics = enhancer.getMetrics();
      expect(metrics.averageLatency).toBe(75);
      expect(metrics.latencyHistory).toEqual([50, 100, 75]);
    });

    test('should limit latency history to 20 entries', () => {
      enhancer.enhanceSocket(mockSocket);
      
      const latencyHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connection:latency'
      )?.[1];
      
      // Add 25 latency measurements
      for (let i = 0; i < 25; i++) {
        latencyHandler?.({ latency: i * 10 });
      }
      
      const metrics = enhancer.getMetrics();
      expect(metrics.latencyHistory.length).toBe(20);
      expect(metrics.latencyHistory[0]).toBe(50); // First 5 were shifted out
    });

    test('should warn on high latency', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      enhancer.enhanceSocket(mockSocket);
      
      const latencyHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connection:latency'
      )?.[1];
      
      latencyHandler?.({ latency: 600 });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('High latency detected: 600ms')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Message Queueing', () => {
    test('should queue messages when disconnected', () => {
      enhancer.enhanceSocket(mockSocket);
      mockSocket.connected = false;
      
      mockSocket.emit('test:event', { data: 'test' });
      
      const metrics = enhancer.getMetrics();
      expect(metrics.queuedMessages).toBe(1);
    });

    test('should not queue messages when connected', () => {
      const originalEmit = jest.fn();
      mockSocket.emit = originalEmit;
      
      enhancer.enhanceSocket(mockSocket);
      mockSocket.connected = true;
      
      mockSocket.emit('test:event', { data: 'test' });
      
      expect(originalEmit).toHaveBeenCalledWith('test:event', { data: 'test' });
      expect(enhancer.getMetrics().queuedMessages).toBe(0);
    });

    test('should flush queued messages on reconnect', () => {
      enhancer.enhanceSocket(mockSocket);
      mockSocket.connected = false;
      
      // Queue multiple messages
      mockSocket.emit('event1', { data: 1 });
      mockSocket.emit('event2', { data: 2 });
      mockSocket.emit('event3', { data: 3 });
      
      // Simulate reconnection
      mockSocket.connected = true;
      const connectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      
      connectHandler?.();
      
      // Fast-forward to flush all messages
      jest.advanceTimersByTime(150);
      
      // Check messages were sent with delays
      expect(mockSocket.emit).toHaveBeenCalledWith('event1', { data: 1 });
      expect(mockSocket.emit).toHaveBeenCalledWith('event2', { data: 2 });
      expect(mockSocket.emit).toHaveBeenCalledWith('event3', { data: 3 });
      
      expect(enhancer.getMetrics().queuedMessages).toBe(0);
    });

    test('should respect max queue size', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      enhancer = new (reliabilityEnhancer as any).constructor({
        maxQueueSize: 2
      });
      
      enhancer.enhanceSocket(mockSocket);
      mockSocket.connected = false;
      
      mockSocket.emit('event1', { data: 1 });
      mockSocket.emit('event2', { data: 2 });
      mockSocket.emit('event3', { data: 3 }); // Should be dropped
      
      expect(enhancer.getMetrics().queuedMessages).toBe(2);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Message queue full')
      );
      
      consoleSpy.mockRestore();
    });

    test('should handle queueing disabled', () => {
      enhancer = new (reliabilityEnhancer as any).constructor({
        enableQueueing: false
      });
      
      const originalEmit = jest.fn();
      mockSocket.emit = originalEmit;
      
      enhancer.enhanceSocket(mockSocket);
      mockSocket.connected = false;
      
      mockSocket.emit('test:event', { data: 'test' });
      
      // Should call original emit even when disconnected
      expect(originalEmit).toHaveBeenCalledWith('test:event', { data: 'test' });
      expect(enhancer.getMetrics().queuedMessages).toBe(0);
    });
  });

  describe('Connection Quality Monitoring', () => {
    test('should handle connection warnings', () => {
      enhancer.enhanceSocket(mockSocket);
      
      const warningHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connection:warning'
      )?.[1];
      
      warningHandler?.({ reason: 'High packet loss', missedPings: 3 });
      
      expect(mockSocket.emit).toHaveBeenCalledWith('connection:quality', {
        quality: 40,
        warning: { reason: 'High packet loss', missedPings: 3 }
      });
    });

    test('should update quality based on missed pings', () => {
      enhancer.enhanceSocket(mockSocket);
      
      const warningHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connection:warning'
      )?.[1];
      
      // Quality decreases by 20 per missed ping
      warningHandler?.({ reason: 'Missed pings', missedPings: 1 });
      expect(mockSocket.emit).toHaveBeenCalledWith('connection:quality', 
        expect.objectContaining({ quality: 80 }));
      
      warningHandler?.({ reason: 'Missed pings', missedPings: 5 });
      expect(mockSocket.emit).toHaveBeenCalledWith('connection:quality', 
        expect.objectContaining({ quality: 0 }));
    });

    test('should clear pending acknowledgments on disconnect', () => {
      enhancer.enhanceSocket(mockSocket);
      
      // Create some pending acknowledgments
      mockSocket.emit('test1', { requiresAck: true });
      mockSocket.emit('test2', { requiresAck: true });
      
      expect(enhancer.getMetrics().pendingAcknowledgments).toBe(2);
      
      // Simulate disconnect
      const disconnectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'disconnect'
      )?.[1];
      
      disconnectHandler?.('transport close');
      
      expect(enhancer.getMetrics().pendingAcknowledgments).toBe(0);
    });

    test('should reset quality on reconnection', () => {
      enhancer.enhanceSocket(mockSocket);
      
      // First reduce quality
      const warningHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connection:warning'
      )?.[1];
      warningHandler?.({ reason: 'Poor connection', missedPings: 3 });
      
      // Then reconnect
      const connectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
      
      // Quality should be reset
      // Check by triggering another warning and seeing the quality calculation
      warningHandler?.({ reason: 'Minor issue', missedPings: 1 });
      expect(mockSocket.emit).toHaveBeenLastCalledWith('connection:quality', 
        expect.objectContaining({ quality: 80 })); // 100 - 20 = 80
    });
  });

  describe('Metrics', () => {
    test('should provide comprehensive metrics', () => {
      enhancer.enhanceSocket(mockSocket);
      
      const metrics = enhancer.getMetrics();
      
      expect(metrics).toHaveProperty('queuedMessages');
      expect(metrics).toHaveProperty('pendingAcknowledgments');
      expect(metrics).toHaveProperty('averageLatency');
      expect(metrics).toHaveProperty('latencyHistory');
      
      expect(metrics.queuedMessages).toBe(0);
      expect(metrics.pendingAcknowledgments).toBe(0);
      expect(metrics.averageLatency).toBeNull();
      expect(metrics.latencyHistory).toEqual([]);
    });

    test('should track all metrics correctly', () => {
      enhancer.enhanceSocket(mockSocket);
      mockSocket.connected = false;
      
      // Queue a message
      mockSocket.emit('queued', { data: 'test' });
      
      // Add pending acknowledgment
      mockSocket.emit('acked', { requiresAck: true });
      
      // Add latency data
      const latencyHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connection:latency'
      )?.[1];
      latencyHandler?.({ latency: 100 });
      latencyHandler?.({ latency: 200 });
      
      const metrics = enhancer.getMetrics();
      
      expect(metrics.queuedMessages).toBe(1);
      expect(metrics.pendingAcknowledgments).toBe(1);
      expect(metrics.averageLatency).toBe(150);
      expect(metrics.latencyHistory).toEqual([100, 200]);
    });
  });

  describe('Cleanup', () => {
    test('should clean up all data', () => {
      enhancer.enhanceSocket(mockSocket);
      mockSocket.connected = false;
      
      // Add some data
      mockSocket.emit('queued', { data: 'test' });
      mockSocket.emit('acked', { requiresAck: true });
      
      const latencyHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connection:latency'
      )?.[1];
      latencyHandler?.({ latency: 100 });
      
      // Verify data exists
      let metrics = enhancer.getMetrics();
      expect(metrics.queuedMessages).toBeGreaterThan(0);
      expect(metrics.pendingAcknowledgments).toBeGreaterThan(0);
      expect(metrics.latencyHistory.length).toBeGreaterThan(0);
      
      // Clean up
      enhancer.cleanup();
      
      // Verify data is cleared
      metrics = enhancer.getMetrics();
      expect(metrics.queuedMessages).toBe(0);
      expect(metrics.pendingAcknowledgments).toBe(0);
      expect(metrics.averageLatency).toBeNull();
      expect(metrics.latencyHistory).toEqual([]);
    });

    test('should clear timeouts on cleanup', () => {
      enhancer.enhanceSocket(mockSocket);
      
      // Create pending acknowledgments with timeouts
      const promises = [
        mockSocket.emit('test1', { requiresAck: true }),
        mockSocket.emit('test2', { requiresAck: true })
      ];
      
      enhancer.cleanup();
      
      // All promises should resolve to false
      promises.forEach(promise => {
        expect(promise).resolves.toBe(false);
      });
    });
  });

  describe('Message ID Generation', () => {
    test('should generate unique message IDs', () => {
      enhancer.enhanceSocket(mockSocket);
      
      const ids = new Set();
      
      // Generate multiple messages
      for (let i = 0; i < 100; i++) {
        mockSocket.emit(`test${i}`, { requiresAck: true, id: undefined });
        const emittedData = mockSocket.emit.mock.calls[i][1];
        ids.add(emittedData.id);
      }
      
      // All IDs should be unique
      expect(ids.size).toBe(100);
    });

    test('should use provided message ID if available', () => {
      const originalEmit = mockSocket.emit;
      enhancer.enhanceSocket(mockSocket);
      
      mockSocket.emit('test', { requiresAck: true, id: 'custom-id' });
      
      const emittedData = originalEmit.mock.calls[0][1];
      expect(emittedData.id).toBe('custom-id');
    });
  });

  describe('Configuration Options', () => {
    test('should respect disabled acknowledgments', () => {
      enhancer = new (reliabilityEnhancer as any).constructor({
        enableAcknowledgments: false
      });
      
      enhancer.enhanceSocket(mockSocket);
      
      const registeredEvents = mockSocket.on.mock.calls.map(call => call[0]);
      expect(registeredEvents).not.toContain('message:ack');
      expect(registeredEvents).not.toContain('messages:ack');
    });

    test('should respect disabled latency tracking', () => {
      enhancer = new (reliabilityEnhancer as any).constructor({
        enableLatencyTracking: false
      });
      
      enhancer.enhanceSocket(mockSocket);
      
      const registeredEvents = mockSocket.on.mock.calls.map(call => call[0]);
      const pingHandlers = registeredEvents.filter(event => event === 'ping');
      
      // Should still have one ping handler for connection quality
      expect(pingHandlers.length).toBeLessThanOrEqual(1);
      expect(registeredEvents).not.toContain('connection:latency');
    });

    test('should use custom acknowledgment timeout', async () => {
      enhancer = new (reliabilityEnhancer as any).constructor({
        acknowledgmentTimeout: 500
      });
      
      enhancer.enhanceSocket(mockSocket);
      
      const promise = mockSocket.emit('test', { requiresAck: true });
      
      // Should not timeout before 500ms
      jest.advanceTimersByTime(400);
      await expect(Promise.race([promise, Promise.resolve('not-timeout')])).resolves.toBe('not-timeout');
      
      // Should timeout after 500ms
      jest.advanceTimersByTime(200);
      await expect(promise).rejects.toThrow('Acknowledgment timeout');
    });
  });
});