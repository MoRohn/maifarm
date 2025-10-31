import { jest } from '@jest/globals';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { ReliabilityManager } from '../../websocket/reliabilityManager';
import { MessageQueue } from '../../websocket/messageQueue';
import { HealthMonitor } from '../../websocket/healthMonitor';
import { PerformanceOptimizer } from '../../websocket/performanceOptimizer';

describe('WebSocket Reliability Enhanced Tests', () => {
  let io: SocketIOServer;
  let serverSocket: any;
  let clientSocket: ClientSocket;
  let httpServer: any;
  let reliabilityManager: ReliabilityManager;
  let messageQueue: MessageQueue;
  let healthMonitor: HealthMonitor;
  let performanceOptimizer: PerformanceOptimizer;

  beforeAll((done) => {
    httpServer = createServer();
    io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    reliabilityManager = new ReliabilityManager(io);
    messageQueue = new MessageQueue();
    healthMonitor = new HealthMonitor(io);
    performanceOptimizer = new PerformanceOptimizer(io);

    httpServer.listen(() => {
      const port = (httpServer.address() as AddressInfo).port;
      
      io.on('connection', (socket) => {
        serverSocket = socket;
        reliabilityManager.handleConnection(socket);
        healthMonitor.trackConnection(socket);
        performanceOptimizer.optimizeConnection(socket);
      });

      clientSocket = ioClient(`http://localhost:${port}`, {
        reconnection: true,
        reconnectionDelay: 100,
        reconnectionAttempts: 5,
      });

      clientSocket.on('connect', done);
    });
  });

  afterAll(() => {
    io.close();
    clientSocket.close();
    httpServer.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    messageQueue.clear();
  });

  describe('Connection Resilience', () => {
    it('should handle rapid connect/disconnect cycles', async () => {
      const connectionPromises = [];
      const disconnectionPromises = [];

      for (let i = 0; i < 10; i++) {
        const connectPromise = new Promise<void>((resolve) => {
          clientSocket.once('connect', () => resolve());
          clientSocket.connect();
        });

        const disconnectPromise = new Promise<void>((resolve) => {
          clientSocket.once('disconnect', () => resolve());
          clientSocket.disconnect();
        });

        connectionPromises.push(connectPromise);
        disconnectionPromises.push(disconnectPromise);
      }

      await Promise.all([...connectionPromises, ...disconnectionPromises]);
      
      // Verify connection state is stable
      clientSocket.connect();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(clientSocket.connected).toBe(true);
    });

    it('should maintain message order during reconnection', async () => {
      const messages: string[] = [];
      const expectedMessages = ['msg1', 'msg2', 'msg3', 'msg4', 'msg5'];

      clientSocket.on('ordered-message', (msg: string) => {
        messages.push(msg);
      });

      // Send messages before disconnect
      expectedMessages.slice(0, 2).forEach((msg) => {
        serverSocket.emit('ordered-message', msg);
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Simulate disconnect
      serverSocket.disconnect(true);
      
      // Queue messages during disconnect
      expectedMessages.slice(2).forEach((msg) => {
        messageQueue.enqueue('ordered-message', msg, serverSocket.id);
      });

      // Wait for reconnection
      await new Promise<void>((resolve) => {
        clientSocket.once('connect', () => {
          // Flush queued messages
          const queuedMessages = messageQueue.getMessages(serverSocket.id);
          queuedMessages.forEach(({ event, data }) => {
            serverSocket.emit(event, data);
          });
          resolve();
        });
        clientSocket.connect();
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(messages).toEqual(expectedMessages);
    });

    it('should handle network latency spikes gracefully', async () => {
      const latencies: number[] = [];
      const startTime = Date.now();

      // Simulate varying network conditions
      const simulateLatency = async (delay: number) => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return Date.now() - startTime;
      };

      for (const delay of [10, 100, 500, 1000, 50, 10]) {
        const latency = await simulateLatency(delay);
        latencies.push(latency);
        
        // Send ping during latency
        clientSocket.emit('ping');
        await new Promise<void>((resolve) => {
          serverSocket.once('ping', () => {
            serverSocket.emit('pong');
            resolve();
          });
        });
      }

      // Verify connection remained stable
      expect(clientSocket.connected).toBe(true);
      expect(latencies.length).toBe(6);
    });
  });

  describe('Message Queue Management', () => {
    it('should queue messages when client is disconnected', () => {
      const testMessages = [
        { event: 'update', data: { id: 1, value: 'test1' } },
        { event: 'update', data: { id: 2, value: 'test2' } },
        { event: 'notification', data: { message: 'hello' } },
      ];

      testMessages.forEach(({ event, data }) => {
        messageQueue.enqueue(event, data, 'test-client-id');
      });

      const queuedMessages = messageQueue.getMessages('test-client-id');
      expect(queuedMessages).toHaveLength(3);
      expect(queuedMessages[0]).toMatchObject(testMessages[0]);
    });

    it('should respect queue size limits', () => {
      const maxQueueSize = 100;
      
      for (let i = 0; i < maxQueueSize + 50; i++) {
        messageQueue.enqueue('test', { index: i }, 'test-client');
      }

      const messages = messageQueue.getMessages('test-client');
      expect(messages.length).toBeLessThanOrEqual(maxQueueSize);
    });

    it('should prioritize critical messages', () => {
      messageQueue.enqueue('normal', { priority: 'low' }, 'client1');
      messageQueue.enqueue('critical', { priority: 'high' }, 'client1', true);
      messageQueue.enqueue('normal', { priority: 'low' }, 'client1');

      const messages = messageQueue.getMessages('client1');
      expect(messages[0].event).toBe('critical');
    });

    it('should clear expired messages', async () => {
      const ttl = 100; // 100ms TTL
      messageQueue.enqueue('expired', { data: 'old' }, 'client1');
      
      await new Promise((resolve) => setTimeout(resolve, ttl + 10));
      
      messageQueue.clearExpired(ttl);
      const messages = messageQueue.getMessages('client1');
      expect(messages).toHaveLength(0);
    });
  });

  describe('Health Monitoring', () => {
    it('should track connection health metrics', async () => {
      const metrics = healthMonitor.getMetrics();
      
      expect(metrics).toMatchObject({
        activeConnections: expect.any(Number),
        totalConnections: expect.any(Number),
        averageLatency: expect.any(Number),
        errorRate: expect.any(Number),
      });
    });

    it('should detect unhealthy connections', async () => {
      // Simulate unhealthy connection with high error rate
      for (let i = 0; i < 10; i++) {
        healthMonitor.recordError(serverSocket.id, new Error('Test error'));
      }

      const isHealthy = healthMonitor.isConnectionHealthy(serverSocket.id);
      expect(isHealthy).toBe(false);
    });

    it('should trigger alerts for degraded performance', async () => {
      const alertCallback = jest.fn();
      healthMonitor.onAlert(alertCallback);

      // Simulate degraded performance
      for (let i = 0; i < 5; i++) {
        healthMonitor.recordLatency(serverSocket.id, 5000); // 5 second latency
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(alertCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'performance_degradation',
          severity: 'warning',
        })
      );
    });
  });

  describe('Performance Optimization', () => {
    it('should batch messages for better performance', async () => {
      const messages: any[] = [];
      clientSocket.on('batch', (batch: any[]) => {
        messages.push(...batch);
      });

      // Send multiple messages quickly
      const testData = Array.from({ length: 20 }, (_, i) => ({ id: i }));
      
      performanceOptimizer.enableBatching(serverSocket.id);
      testData.forEach((data) => {
        performanceOptimizer.send(serverSocket.id, 'update', data);
      });

      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(messages.length).toBe(20);
    });

    it('should compress large messages', async () => {
      const largeData = {
        content: 'x'.repeat(10000), // Large string
        metadata: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          value: Math.random(),
        })),
      };

      let receivedData: any;
      clientSocket.on('compressed', (data: any) => {
        receivedData = data;
      });

      performanceOptimizer.sendCompressed(serverSocket.id, 'compressed', largeData);
      
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(receivedData).toEqual(largeData);
    });

    it('should throttle high-frequency events', async () => {
      const receivedEvents: number[] = [];
      clientSocket.on('throttled', (timestamp: number) => {
        receivedEvents.push(timestamp);
      });

      // Send 100 events rapidly
      for (let i = 0; i < 100; i++) {
        performanceOptimizer.sendThrottled(
          serverSocket.id,
          'throttled',
          Date.now(),
          50 // 50ms throttle
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
      
      // Should receive significantly fewer events due to throttling
      expect(receivedEvents.length).toBeLessThan(20);
    });
  });

  describe('Error Recovery', () => {
    it('should recover from server errors', async () => {
      const errorHandler = jest.fn();
      serverSocket.on('error', errorHandler);

      // Simulate server error
      serverSocket.emit('error', new Error('Server error'));
      
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      // Connection should remain active
      expect(clientSocket.connected).toBe(true);
      expect(errorHandler).toHaveBeenCalled();
    });

    it('should handle malformed messages gracefully', async () => {
      const errorCallback = jest.fn();
      clientSocket.on('error', errorCallback);

      // Send malformed data
      serverSocket.emit('data', undefined);
      serverSocket.emit('data', null);
      serverSocket.emit('data', { [Symbol('test')]: 'invalid' });

      await new Promise((resolve) => setTimeout(resolve, 100));
      
      // Should not crash the connection
      expect(clientSocket.connected).toBe(true);
    });

    it('should implement exponential backoff for reconnection', async () => {
      const reconnectAttempts: number[] = [];
      let lastAttemptTime = Date.now();

      clientSocket.on('reconnect_attempt', () => {
        const now = Date.now();
        reconnectAttempts.push(now - lastAttemptTime);
        lastAttemptTime = now;
      });

      // Force disconnect
      clientSocket.disconnect();
      
      // Try to reconnect multiple times
      for (let i = 0; i < 3; i++) {
        clientSocket.connect();
        await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, i)));
      }

      // Verify backoff pattern
      for (let i = 1; i < reconnectAttempts.length; i++) {
        expect(reconnectAttempts[i]).toBeGreaterThan(reconnectAttempts[i - 1]);
      }
    });
  });

  describe('Load Testing', () => {
    it('should handle multiple concurrent connections', async () => {
      const clients: ClientSocket[] = [];
      const connectionPromises: Promise<void>[] = [];

      for (let i = 0; i < 50; i++) {
        const client = ioClient(`http://localhost:${(httpServer.address() as AddressInfo).port}`, {
          reconnection: false,
        });

        const promise = new Promise<void>((resolve) => {
          client.on('connect', () => resolve());
        });

        clients.push(client);
        connectionPromises.push(promise);
      }

      await Promise.all(connectionPromises);
      
      // Verify all clients connected
      expect(clients.every((c) => c.connected)).toBe(true);

      // Cleanup
      clients.forEach((c) => c.close());
    });

    it('should maintain performance under high message load', async () => {
      const messageCount = 1000;
      const receivedMessages: any[] = [];
      const startTime = Date.now();

      clientSocket.on('load-test', (data: any) => {
        receivedMessages.push(data);
      });

      // Send messages
      for (let i = 0; i < messageCount; i++) {
        serverSocket.emit('load-test', { index: i, timestamp: Date.now() });
      }

      // Wait for all messages
      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (receivedMessages.length === messageCount) {
            clearInterval(checkInterval);
            resolve(undefined);
          }
        }, 10);
      });

      const duration = Date.now() - startTime;
      const messagesPerSecond = (messageCount / duration) * 1000;

      expect(receivedMessages).toHaveLength(messageCount);
      expect(messagesPerSecond).toBeGreaterThan(100); // At least 100 msg/s
    });
  });

  describe('Security', () => {
    it('should rate limit connections from same IP', async () => {
      const connections: ClientSocket[] = [];
      const rejections: number = 0;

      for (let i = 0; i < 20; i++) {
        try {
          const client = ioClient(`http://localhost:${(httpServer.address() as AddressInfo).port}`, {
            reconnection: false,
          });
          connections.push(client);
        } catch (error) {
          rejections++;
        }
      }

      // Some connections should be rejected due to rate limiting
      expect(rejections).toBeGreaterThan(0);

      // Cleanup
      connections.forEach((c) => c.close());
    });

    it('should validate message size limits', async () => {
      const oversizedMessage = {
        data: 'x'.repeat(1024 * 1024 * 10), // 10MB
      };

      const errorCallback = jest.fn();
      serverSocket.on('error', errorCallback);

      clientSocket.emit('message', oversizedMessage);
      
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('size limit'),
        })
      );
    });
  });
});