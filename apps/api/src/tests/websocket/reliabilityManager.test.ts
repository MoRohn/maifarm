import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { WebSocketReliabilityManager, ReliabilityConfig, MessageOptions } from '../../websocket/reliabilityManager';
import { WebSocketHealthMonitor } from '../../websocket/healthMonitor';
import { WebSocketMessageQueue } from '../../websocket/messageQueue';
import { Socket } from 'socket.io';
import { SocketIOServer } from 'socket.io';
import { Redis } from 'ioredis';
import { EventEmitter } from 'events';

// Mock dependencies
jest.mock('../../websocket/healthMonitor');
jest.mock('../../websocket/messageQueue');
jest.mock('ioredis');

describe('WebSocketReliabilityManager', () => {
  let manager: WebSocketReliabilityManager;
  let mockIo: jest.Mocked<SocketIOServer>;
  let mockSocket: jest.Mocked<Socket>;
  let mockRedis: jest.Mocked<Redis>;
  let mockHealthMonitor: jest.Mocked<WebSocketHealthMonitor>;
  let mockMessageQueue: jest.Mocked<WebSocketMessageQueue>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Create mock instances
    mockIo = {
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
      sockets: {
        sockets: new Map()
      }
    } as any;

    mockSocket = {
      id: 'socket-123',
      emit: jest.fn((event, data, callback) => {
        if (callback) callback();
        return true;
      }),
      on: jest.fn(),
      disconnect: jest.fn()
    } as any;

    mockRedis = new Redis() as jest.Mocked<Redis>;
    
    manager = new WebSocketReliabilityManager({
      enableHealthMonitoring: true,
      enableMessageQueue: true,
      enableCompression: true,
      enableMetrics: true,
      requireAcknowledgments: true
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultManager = new WebSocketReliabilityManager();
      expect(defaultManager).toBeDefined();
    });

    it('should initialize health monitor when enabled', () => {
      manager.initialize(mockIo, mockRedis);
      expect(WebSocketHealthMonitor).toHaveBeenCalledWith(mockIo);
    });

    it('should initialize message queue when enabled', () => {
      manager.initialize(mockIo, mockRedis);
      expect(WebSocketMessageQueue).toHaveBeenCalledWith(mockRedis);
    });

    it('should skip components when disabled in config', () => {
      const minimalManager = new WebSocketReliabilityManager({
        enableHealthMonitoring: false,
        enableMessageQueue: false
      });
      minimalManager.initialize(mockIo);
      
      expect(WebSocketHealthMonitor).not.toHaveBeenCalled();
      expect(WebSocketMessageQueue).not.toHaveBeenCalled();
    });

    it('should load persisted messages from Redis on init', async () => {
      mockMessageQueue = WebSocketMessageQueue.mock.instances[0] as any;
      mockMessageQueue.loadPersistedMessages = jest.fn().mockResolvedValue([]);
      
      manager.initialize(mockIo, mockRedis);
      
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockMessageQueue.loadPersistedMessages).toHaveBeenCalled();
    });
  });

  describe('Reliable Message Sending', () => {
    beforeEach(() => {
      manager.initialize(mockIo, mockRedis);
      mockMessageQueue = WebSocketMessageQueue.mock.instances[0] as any;
      mockHealthMonitor = WebSocketHealthMonitor.mock.instances[0] as any;
    });

    it('should send message with acknowledgment', async () => {
      mockHealthMonitor.isHealthy = jest.fn().mockReturnValue(true);
      
      const result = await manager.sendReliableMessage(
        mockSocket,
        'test:event',
        { data: 'test' },
        { requireAck: true }
      );

      expect(result).toBe(true);
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'test:event',
        expect.objectContaining({ data: 'test' }),
        expect.any(Function)
      );
    });

    it('should queue message when socket unhealthy', async () => {
      mockHealthMonitor.isHealthy = jest.fn().mockReturnValue(false);
      mockMessageQueue.enqueue = jest.fn().mockResolvedValue(true);
      
      const result = await manager.sendReliableMessage(
        'socket-123',
        'test:event',
        { data: 'queued' }
      );

      expect(mockMessageQueue.enqueue).toHaveBeenCalledWith(
        'socket-123',
        expect.objectContaining({
          event: 'test:event',
          data: { data: 'queued' }
        })
      );
      expect(result).toBe(true);
    });

    it('should handle high priority messages', async () => {
      const result = await manager.sendReliableMessage(
        mockSocket,
        'critical:event',
        { alert: 'high' },
        { priority: 'high' }
      );

      expect(result).toBe(true);
      // High priority messages should bypass queue
      expect(mockSocket.emit).toHaveBeenCalled();
    });

    it('should retry failed messages', async () => {
      let attemptCount = 0;
      mockSocket.emit = jest.fn((event, data, callback) => {
        attemptCount++;
        if (attemptCount < 3 && callback) {
          callback(false); // Simulate failure
        } else if (callback) {
          callback(true); // Success on third attempt
        }
        return attemptCount >= 3;
      });

      const result = await manager.sendReliableMessage(
        mockSocket,
        'retry:event',
        { data: 'retry' },
        { retryOnFail: true, maxRetries: 3 }
      );

      expect(attemptCount).toBe(3);
      expect(result).toBe(true);
    });

    it('should respect message TTL', async () => {
      const ttl = 5000; // 5 seconds
      mockMessageQueue.enqueue = jest.fn().mockResolvedValue(true);
      mockHealthMonitor.isHealthy = jest.fn().mockReturnValue(false);

      await manager.sendReliableMessage(
        'socket-456',
        'ttl:event',
        { data: 'expires' },
        { ttl }
      );

      expect(mockMessageQueue.enqueue).toHaveBeenCalledWith(
        'socket-456',
        expect.objectContaining({
          ttl,
          expiresAt: expect.any(Number)
        })
      );
    });
  });

  describe('Connection Management', () => {
    beforeEach(() => {
      manager.initialize(mockIo, mockRedis);
    });

    it('should handle new connections', () => {
      manager.handleConnection(mockSocket, 'user-123');
      
      expect(manager.isConnected('socket-123')).toBe(true);
      expect(manager.getUserId('socket-123')).toBe('user-123');
    });

    it('should handle disconnections', () => {
      manager.handleConnection(mockSocket, 'user-123');
      manager.handleDisconnection('socket-123');
      
      expect(manager.isConnected('socket-123')).toBe(false);
      expect(manager.getUserId('socket-123')).toBeUndefined();
    });

    it('should process queued messages on reconnection', async () => {
      mockMessageQueue = WebSocketMessageQueue.mock.instances[0] as any;
      mockMessageQueue.dequeueForClient = jest.fn().mockResolvedValue([
        { event: 'queued:event', data: { msg: 'pending' } }
      ]);

      manager.handleConnection(mockSocket, 'user-123');
      await manager.processQueuedMessages('socket-123');

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'queued:event',
        expect.objectContaining({ msg: 'pending' }),
        expect.any(Function)
      );
    });

    it('should track connection state transitions', () => {
      const transitions: string[] = [];
      manager.on('connection:state', (state) => transitions.push(state));

      manager.handleConnection(mockSocket, 'user-123');
      manager.handleDisconnection('socket-123');
      manager.handleConnection(mockSocket, 'user-123');

      expect(transitions).toEqual(['connected', 'disconnected', 'reconnected']);
    });
  });

  describe('Health Monitoring', () => {
    beforeEach(() => {
      manager.initialize(mockIo, mockRedis);
      mockHealthMonitor = WebSocketHealthMonitor.mock.instances[0] as any;
    });

    it('should monitor client health', () => {
      mockHealthMonitor.getClientHealth = jest.fn().mockReturnValue({
        socketId: 'socket-123',
        healthy: true,
        latency: 50,
        lastPing: Date.now()
      });

      const health = manager.getClientHealth('socket-123');
      expect(health).toMatchObject({
        healthy: true,
        latency: 50
      });
    });

    it('should handle unhealthy clients', async () => {
      mockHealthMonitor.isHealthy = jest.fn().mockReturnValue(false);
      mockHealthMonitor.getUnhealthyClients = jest.fn().mockReturnValue(['socket-123']);

      const unhealthy = manager.getUnhealthyClients();
      expect(unhealthy).toContain('socket-123');
    });

    it('should auto-disconnect persistently unhealthy clients', () => {
      jest.advanceTimersByTime(60000); // 1 minute
      
      mockHealthMonitor.getUnhealthyClients = jest.fn().mockReturnValue([{
        socketId: 'socket-123',
        unhealthyDuration: 120000 // 2 minutes unhealthy
      }]);

      manager.cleanupUnhealthyConnections();
      
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('Message Queue Management', () => {
    beforeEach(() => {
      manager.initialize(mockIo, mockRedis);
      mockMessageQueue = WebSocketMessageQueue.mock.instances[0] as any;
    });

    it('should monitor queue size', () => {
      mockMessageQueue.size = jest.fn().mockReturnValue(150);
      
      const size = manager.getQueueSize();
      expect(size).toBe(150);
    });

    it('should prevent queue overflow', async () => {
      mockMessageQueue.size = jest.fn().mockReturnValue(1000); // Max size
      mockMessageQueue.enqueue = jest.fn().mockResolvedValue(false);
      
      const result = await manager.sendReliableMessage(
        'socket-123',
        'overflow:event',
        { data: 'too much' }
      );

      expect(result).toBe(false);
      expect(manager.emit).toHaveBeenCalledWith('queue:overflow', expect.any(Object));
    });

    it('should clear expired messages', async () => {
      mockMessageQueue.clearExpired = jest.fn().mockResolvedValue(10);
      
      const cleared = await manager.clearExpiredMessages();
      expect(cleared).toBe(10);
    });

    it('should persist queue to Redis', async () => {
      mockMessageQueue.persist = jest.fn().mockResolvedValue(true);
      
      await manager.persistQueue();
      expect(mockMessageQueue.persist).toHaveBeenCalled();
    });
  });

  describe('Fallback Mechanisms', () => {
    beforeEach(() => {
      manager = new WebSocketReliabilityManager({
        fallbackToPolling: true
      });
      manager.initialize(mockIo, mockRedis);
    });

    it('should fallback to polling when WebSocket fails', async () => {
      mockSocket.connected = false;
      
      const fallbackActive = manager.isFallbackActive('socket-123');
      expect(fallbackActive).toBe(true);
    });

    it('should store messages for polling retrieval', async () => {
      await manager.storeForPolling('user-123', {
        event: 'poll:event',
        data: { msg: 'fallback' }
      });

      const messages = await manager.getPollingMessages('user-123');
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        event: 'poll:event',
        data: { msg: 'fallback' }
      });
    });

    it('should clear polling messages after retrieval', async () => {
      await manager.storeForPolling('user-123', { event: 'test', data: {} });
      
      await manager.getPollingMessages('user-123');
      const secondFetch = await manager.getPollingMessages('user-123');
      
      expect(secondFetch).toHaveLength(0);
    });
  });

  describe('Metrics and Performance', () => {
    beforeEach(() => {
      manager.initialize(mockIo, mockRedis);
    });

    it('should collect performance metrics', () => {
      const metrics = manager.getMetrics();
      
      expect(metrics).toMatchObject({
        totalMessagesSent: expect.any(Number),
        totalMessagesQueued: expect.any(Number),
        totalMessagesDelivered: expect.any(Number),
        averageLatency: expect.any(Number),
        activeConnections: expect.any(Number),
        queueSize: expect.any(Number)
      });
    });

    it('should emit metrics periodically', () => {
      const metricsEvents: any[] = [];
      manager.on('metrics:update', (metrics) => metricsEvents.push(metrics));
      
      jest.advanceTimersByTime(30000); // 30 seconds
      
      expect(metricsEvents.length).toBeGreaterThan(0);
    });

    it('should track message delivery rates', async () => {
      for (let i = 0; i < 10; i++) {
        await manager.sendReliableMessage(mockSocket, 'test', {});
      }
      
      const metrics = manager.getMetrics();
      expect(metrics.deliveryRate).toBeGreaterThan(0);
    });
  });

  describe('Compression', () => {
    beforeEach(() => {
      manager = new WebSocketReliabilityManager({
        enableCompression: true
      });
      manager.initialize(mockIo, mockRedis);
    });

    it('should compress large messages', async () => {
      const largeData = { data: 'x'.repeat(10000) };
      
      await manager.sendReliableMessage(
        mockSocket,
        'large:event',
        largeData
      );

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'large:event',
        expect.objectContaining({
          compressed: true
        }),
        expect.any(Function)
      );
    });

    it('should skip compression for small messages', async () => {
      const smallData = { data: 'small' };
      
      await manager.sendReliableMessage(
        mockSocket,
        'small:event',
        smallData
      );

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'small:event',
        expect.objectContaining(smallData),
        expect.any(Function)
      );
    });
  });

  describe('Error Recovery', () => {
    beforeEach(() => {
      manager.initialize(mockIo, mockRedis);
    });

    it('should handle socket errors gracefully', async () => {
      mockSocket.emit = jest.fn().mockImplementation(() => {
        throw new Error('Socket error');
      });

      const result = await manager.sendReliableMessage(
        mockSocket,
        'error:event',
        { data: 'error' }
      );

      expect(result).toBe(false);
      expect(manager.emit).toHaveBeenCalledWith('error', expect.any(Error));
    });

    it('should reconnect after network failure', () => {
      manager.handleNetworkFailure();
      
      jest.advanceTimersByTime(5000); // Wait for reconnection attempt
      
      expect(manager.isReconnecting()).toBe(true);
    });

    it('should implement exponential backoff for reconnection', () => {
      const reconnectDelays: number[] = [];
      manager.on('reconnect:attempt', (delay) => reconnectDelays.push(delay));

      for (let i = 0; i < 5; i++) {
        manager.attemptReconnection();
        jest.advanceTimersByTime(Math.pow(2, i) * 1000);
      }

      expect(reconnectDelays).toEqual([1000, 2000, 4000, 8000, 16000]);
    });
  });
});