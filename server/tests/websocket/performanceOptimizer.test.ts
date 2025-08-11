import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { WebSocketPerformanceOptimizer } from '../../websocket/performanceOptimizer';
import { Socket } from 'socket.io';

// Mock Socket.io
const mockSocket = {
  id: 'test-socket-123',
  connected: true,
  emit: jest.fn(),
  disconnect: jest.fn()
} as unknown as Socket;

describe('WebSocketPerformanceOptimizer', () => {
  let optimizer: WebSocketPerformanceOptimizer;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    optimizer = new WebSocketPerformanceOptimizer();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Message Batching', () => {
    it('should batch messages within interval', () => {
      optimizer.addToPool('client-1', mockSocket);
      
      optimizer.queueMessage('test-socket-123', 'event1', { data: 'test1' });
      optimizer.queueMessage('test-socket-123', 'event2', { data: 'test2' });
      
      // Messages should not be sent immediately
      expect(mockSocket.emit).not.toHaveBeenCalled();
      
      // Advance timers to trigger batch send
      jest.advanceTimersByTime(100);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('batch', {
        messages: [
          { event: 'event1', data: { data: 'test1' } },
          { event: 'event2', data: { data: 'test2' } }
        ],
        timestamp: expect.any(Number)
      });
    });

    it('should send immediately when batch is full', () => {
      optimizer.addToPool('client-1', mockSocket);
      
      // Queue MAX_BATCH_SIZE messages
      for (let i = 0; i < 50; i++) {
        optimizer.queueMessage('test-socket-123', `event${i}`, { data: `test${i}` });
      }
      
      // Should send immediately without waiting for timer
      expect(mockSocket.emit).toHaveBeenCalledTimes(1);
      expect(mockSocket.emit).toHaveBeenCalledWith('batch', {
        messages: expect.arrayContaining([
          expect.objectContaining({ event: 'event0' })
        ]),
        timestamp: expect.any(Number)
      });
    });

    it('should handle multiple clients independently', () => {
      const mockSocket2 = {
        id: 'test-socket-456',
        connected: true,
        emit: jest.fn(),
        disconnect: jest.fn()
      } as unknown as Socket;
      
      optimizer.addToPool('client-1', mockSocket);
      optimizer.addToPool('client-2', mockSocket2);
      
      optimizer.queueMessage('test-socket-123', 'event1', { data: 'client1' });
      optimizer.queueMessage('test-socket-456', 'event2', { data: 'client2' });
      
      jest.advanceTimersByTime(100);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('batch', {
        messages: [{ event: 'event1', data: { data: 'client1' } }],
        timestamp: expect.any(Number)
      });
      
      expect(mockSocket2.emit).toHaveBeenCalledWith('batch', {
        messages: [{ event: 'event2', data: { data: 'client2' } }],
        timestamp: expect.any(Number)
      });
    });
  });

  describe('Connection Pooling', () => {
    it('should limit connections per client', () => {
      const sockets = Array.from({ length: 5 }, (_, i) => ({
        id: `socket-${i}`,
        connected: true,
        emit: jest.fn(),
        disconnect: jest.fn()
      })) as unknown as Socket[];
      
      // Add more than MAX_CONNECTIONS_PER_CLIENT
      sockets.forEach(socket => {
        optimizer.addToPool('client-1', socket);
      });
      
      // First two sockets should be disconnected
      expect(sockets[0].disconnect).toHaveBeenCalled();
      expect(sockets[1].disconnect).toHaveBeenCalled();
      expect(sockets[2].disconnect).not.toHaveBeenCalled();
    });

    it('should use round-robin for load balancing', () => {
      const sockets = Array.from({ length: 3 }, (_, i) => ({
        id: `socket-${i}`,
        connected: true,
        emit: jest.fn(),
        disconnect: jest.fn()
      })) as unknown as Socket[];
      
      sockets.forEach(socket => {
        optimizer.addToPool('client-1', socket);
      });
      
      // Queue messages for different socket IDs
      for (let i = 0; i < 3; i++) {
        optimizer.queueMessage(`socket-${i}`, 'test', { data: i });
        jest.advanceTimersByTime(100);
        jest.clearAllMocks();
      }
      
      // Each socket should have been used
      sockets.forEach(socket => {
        expect(socket.emit).toHaveBeenCalled();
      });
    });
  });

  describe('Caching', () => {
    it('should cache and retrieve data', () => {
      const testData = { test: 'data', nested: { value: 123 } };
      
      optimizer.setCached('test-key', testData);
      const retrieved = optimizer.getCached<typeof testData>('test-key');
      
      expect(retrieved).toEqual(testData);
    });

    it('should return undefined for non-existent cache keys', () => {
      const result = optimizer.getCached('non-existent');
      expect(result).toBeUndefined();
    });

    it('should skip broadcast if data unchanged', () => {
      const mockIo = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn()
      };
      
      const data = { test: 'data' };
      
      // First broadcast
      optimizer.optimizedBroadcast('room1', 'event1', data, mockIo);
      expect(mockIo.to).toHaveBeenCalledWith('room1');
      expect(mockIo.emit).toHaveBeenCalled();
      
      jest.clearAllMocks();
      
      // Second broadcast with same data - should be skipped
      optimizer.optimizedBroadcast('room1', 'event1', data, mockIo);
      expect(mockIo.to).not.toHaveBeenCalled();
      expect(mockIo.emit).not.toHaveBeenCalled();
    });
  });

  describe('Compression', () => {
    it('should compress large messages', () => {
      const largeData = { data: 'x'.repeat(2000) };
      expect(optimizer.shouldCompress(largeData)).toBe(true);
    });

    it('should not compress small messages', () => {
      const smallData = { data: 'small' };
      expect(optimizer.shouldCompress(smallData)).toBe(false);
    });

    it('should include compression flag in broadcast', () => {
      const mockIo = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn()
      };
      
      const largeData = { data: 'x'.repeat(2000) };
      
      optimizer.optimizedBroadcast('room1', 'event1', largeData, mockIo);
      
      expect(mockIo.emit).toHaveBeenCalledWith('event1', {
        data: expect.any(String),
        compressed: true,
        timestamp: expect.any(Number)
      });
    });
  });

  describe('Backpressure Handling', () => {
    it('should detect and handle backpressure', () => {
      optimizer.addToPool('client-1', mockSocket);
      
      // Queue many messages to trigger backpressure
      for (let i = 0; i < 101; i++) {
        optimizer.queueMessage('test-socket-123', `event${i}`, { data: i });
      }
      
      const hasBackpressure = optimizer.handleBackpressure(mockSocket);
      
      expect(hasBackpressure).toBe(true);
      expect(mockSocket.emit).toHaveBeenCalledWith('backpressure', {
        queueSize: expect.any(Number),
        message: expect.stringContaining('high load')
      });
    });

    it('should drop messages when critically full', () => {
      optimizer.addToPool('client-1', mockSocket);
      
      // Queue enough messages to trigger message dropping
      for (let i = 0; i < 151; i++) {
        optimizer.queueMessage('test-socket-123', `event${i}`, { data: i });
      }
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      optimizer.handleBackpressure(mockSocket);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Dropped'),
        expect.stringContaining('messages')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Cleanup', () => {
    it('should clean up resources on disconnect', () => {
      optimizer.addToPool('client-1', mockSocket);
      optimizer.queueMessage('test-socket-123', 'event1', { data: 'test' });
      
      optimizer.cleanup('test-socket-123');
      
      // Try to queue message after cleanup
      optimizer.queueMessage('test-socket-123', 'event2', { data: 'test2' });
      
      // Advance timer - nothing should be sent
      jest.advanceTimersByTime(100);
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('Garbage Collection', () => {
    it('should remove disconnected sockets from pool', () => {
      const connectedSocket = {
        id: 'connected',
        connected: true,
        emit: jest.fn(),
        disconnect: jest.fn()
      } as unknown as Socket;
      
      const disconnectedSocket = {
        id: 'disconnected',
        connected: false,
        emit: jest.fn(),
        disconnect: jest.fn()
      } as unknown as Socket;
      
      optimizer.addToPool('client-1', connectedSocket);
      optimizer.addToPool('client-1', disconnectedSocket);
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      optimizer.performGarbageCollection();
      
      const metrics = optimizer.getMetrics();
      expect(metrics.activeConnections).toBe(1);
      
      consoleSpy.mockRestore();
    });
  });

  describe('Metrics', () => {
    it('should provide accurate metrics', () => {
      optimizer.addToPool('client-1', mockSocket);
      optimizer.queueMessage('test-socket-123', 'event1', { data: 'test' });
      optimizer.setCached('key1', 'value1');
      
      const metrics = optimizer.getMetrics();
      
      expect(metrics).toEqual({
        queuedMessages: 1,
        activeConnections: 1,
        cacheSize: 1,
        cacheHitRate: expect.any(Number)
      });
    });
  });
});