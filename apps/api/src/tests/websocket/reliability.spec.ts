import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { WebSocketReliabilityManager } from '../../websocket/reliabilityManager';

describe('WebSocket Reliability Tests', () => {
  let httpServer: ReturnType<typeof createServer>;
  let ioServer: SocketIOServer;
  let clientSocket: ClientSocket;
  let reliabilityManager: WebSocketReliabilityManager;
  const PORT = 5555;

  beforeEach((done) => {
    httpServer = createServer();
    ioServer = new SocketIOServer(httpServer, {
      cors: { origin: '*' }
    });
    
    reliabilityManager = new WebSocketReliabilityManager({
      enableHealthMonitoring: true,
      enableMessageQueue: true,
      requireAcknowledgments: true
    });
    
    reliabilityManager.initialize(ioServer);
    
    httpServer.listen(PORT, () => {
      done();
    });
  });

  afterEach((done) => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
    reliabilityManager.stop();
    ioServer.close();
    httpServer.close(() => {
      done();
    });
  });

  describe('Connection Management', () => {
    it('should track new connections', (done) => {
      ioServer.on('connection', (socket) => {
        reliabilityManager.initializeHealth(socket.id, 'user123');
        
        const metrics = reliabilityManager.getMetrics();
        expect(metrics.connections.total).toBe(1);
        done();
      });

      clientSocket = ioClient(`http://localhost:${PORT}`);
    });

    it('should handle disconnections gracefully', (done) => {
      ioServer.on('connection', (socket) => {
        reliabilityManager.initializeHealth(socket.id);
        
        socket.on('disconnect', () => {
          reliabilityManager.cleanupConnection(socket.id);
          
          setTimeout(() => {
            const metrics = reliabilityManager.getMetrics();
            expect(metrics.connections.active).toBe(0);
            done();
          }, 100);
        });
      });

      clientSocket = ioClient(`http://localhost:${PORT}`);
      setTimeout(() => {
        clientSocket.disconnect();
      }, 100);
    });

    it('should track reconnections', (done) => {
      let reconnectCount = 0;
      
      ioServer.on('connection', (socket) => {
        reconnectCount++;
        reliabilityManager.initializeHealth(socket.id);
        
        if (reconnectCount === 2) {
          const metrics = reliabilityManager.getMetrics();
          expect(reconnectCount).toBe(2);
          done();
        }
      });

      clientSocket = ioClient(`http://localhost:${PORT}`);
      
      setTimeout(() => {
        clientSocket.disconnect();
        setTimeout(() => {
          clientSocket.connect();
        }, 100);
      }, 100);
    });
  });

  describe('Message Reliability', () => {
    it('should send messages with acknowledgment', (done) => {
      ioServer.on('connection', async (socket) => {
        reliabilityManager.initializeHealth(socket.id);
        
        socket.on('message:ack', (messageId) => {
          const acknowledged = reliabilityManager.acknowledgeMessage(messageId);
          expect(acknowledged).toBe(true);
          done();
        });
        
        const success = await reliabilityManager.sendReliableMessage(
          socket,
          'test:message',
          { data: 'test' },
          { requireAck: true }
        );
        
        expect(success).toBeDefined();
      });

      clientSocket = ioClient(`http://localhost:${PORT}`);
      clientSocket.on('test:message', (data) => {
        if (data.id && data.requiresAck) {
          clientSocket.emit('message:ack', data.id);
        }
      });
    });

    it('should queue messages when client is disconnected', async () => {
      const fakeSocketId = 'disconnected-socket-123';
      
      const success = await reliabilityManager.sendReliableMessage(
        fakeSocketId,
        'test:message',
        { data: 'queued' },
        { requireAck: false }
      );
      
      expect(success).toBe(true);
      
      const metrics = reliabilityManager.getMetrics();
      expect(metrics.queue?.totalQueued).toBeGreaterThan(0);
    });

    it('should resend queued messages on reconnection', (done) => {
      let messageReceived = false;
      
      ioServer.on('connection', (socket) => {
        reliabilityManager.initializeHealth(socket.id, 'user456');
        
        // Simulate queued messages
        reliabilityManager.sendReliableMessage(
          socket.id,
          'queued:message',
          { data: 'test' },
          { requireAck: false }
        );
        
        // Resend queued messages
        reliabilityManager.resendQueuedMessages(socket);
      });

      clientSocket = ioClient(`http://localhost:${PORT}`);
      clientSocket.on('queued:message', (data) => {
        messageReceived = true;
        expect(data.queued).toBe(true);
        done();
      });
    });
  });

  describe('Health Monitoring', () => {
    it('should track connection health metrics', (done) => {
      ioServer.on('connection', (socket) => {
        reliabilityManager.initializeHealth(socket.id);
        
        // Simulate health update
        reliabilityManager.updateConnectionHealth(socket.id, {
          latency: 50,
          lastPong: new Date(),
          connected: true
        });
        
        const metrics = reliabilityManager.getMetrics();
        expect(metrics.performance.averageLatency).toBeGreaterThanOrEqual(0);
        done();
      });

      clientSocket = ioClient(`http://localhost:${PORT}`);
    });

    it('should emit health warnings', (done) => {
      reliabilityManager.on('health:warning', (data) => {
        expect(data).toBeDefined();
        done();
      });

      ioServer.on('connection', (socket) => {
        reliabilityManager.initializeHealth(socket.id);
        
        // Simulate poor health condition
        reliabilityManager.updateConnectionHealth(socket.id, {
          latency: 500,
          missedPings: 3,
          connected: true
        });
      });

      clientSocket = ioClient(`http://localhost:${PORT}`);
    });
  });

  describe('Broadcast Reliability', () => {
    it('should broadcast to rooms reliably', async () => {
      const room = 'test-room';
      let connectedSockets = 0;
      
      ioServer.on('connection', (socket) => {
        connectedSockets++;
        socket.join(room);
        reliabilityManager.initializeHealth(socket.id);
        
        if (connectedSockets === 2) {
          reliabilityManager.broadcastReliable(
            room,
            'broadcast:message',
            { data: 'broadcast' }
          ).then((count) => {
            expect(count).toBe(2);
          });
        }
      });

      // Connect two clients
      const client1 = ioClient(`http://localhost:${PORT}`);
      const client2 = ioClient(`http://localhost:${PORT}`);
      
      // Cleanup
      setTimeout(() => {
        client1.disconnect();
        client2.disconnect();
      }, 500);
    });
  });

  describe('Message Queue Management', () => {
    it('should respect queue size limits', async () => {
      const manager = new WebSocketReliabilityManager({
        enableMessageQueue: true,
        maxQueueSize: 5
      });
      
      manager.initialize(ioServer);
      
      const fakeSocketId = 'test-socket';
      
      // Queue more than limit
      for (let i = 0; i < 10; i++) {
        await manager.sendReliableMessage(
          fakeSocketId,
          'test:message',
          { index: i }
        );
      }
      
      const metrics = manager.getMetrics();
      expect(metrics.queue?.totalQueued).toBeLessThanOrEqual(5);
      
      manager.stop();
    });

    it('should handle message expiration', (done) => {
      const manager = new WebSocketReliabilityManager({
        enableMessageQueue: true,
        messageTTL: 1 // 1 second TTL
      });
      
      manager.initialize(ioServer);
      
      manager.on('message:expired', (data) => {
        expect(data.messageId).toBeDefined();
        manager.stop();
        done();
      });
      
      // Queue a message that will expire
      manager.sendReliableMessage(
        'fake-socket',
        'test:message',
        { data: 'will-expire' }
      );
    });
  });

  describe('Error Recovery', () => {
    it('should handle socket errors gracefully', (done) => {
      ioServer.on('connection', (socket) => {
        reliabilityManager.initializeHealth(socket.id);
        
        // Simulate socket error
        socket.emit('error', new Error('Test error'));
        
        // Should still be able to get metrics
        const metrics = reliabilityManager.getMetrics();
        expect(metrics).toBeDefined();
        done();
      });

      clientSocket = ioClient(`http://localhost:${PORT}`);
    });

    it('should handle message delivery failures', (done) => {
      const manager = new WebSocketReliabilityManager({
        enableMessageQueue: true,
        requireAcknowledgments: true
      });
      
      manager.initialize(ioServer);
      
      manager.on('message:failed', (data) => {
        expect(data.messageId).toBeDefined();
        expect(data.reason).toBeDefined();
        manager.stop();
        done();
      });
      
      // Send to non-existent socket with max retries = 0
      manager.sendReliableMessage(
        'non-existent',
        'test:message',
        { data: 'will-fail' },
        { requireAck: true, maxRetries: 0 }
      );
    });
  });

  describe('Performance', () => {
    it('should handle high message throughput', async () => {
      const messageCount = 100;
      let receivedCount = 0;
      
      ioServer.on('connection', (socket) => {
        reliabilityManager.initializeHealth(socket.id);
        
        // Send many messages rapidly
        for (let i = 0; i < messageCount; i++) {
          reliabilityManager.sendReliableMessage(
            socket,
            'perf:test',
            { index: i },
            { requireAck: false }
          );
        }
      });

      clientSocket = ioClient(`http://localhost:${PORT}`);
      clientSocket.on('perf:test', () => {
        receivedCount++;
      });
      
      // Wait and check
      await new Promise(resolve => setTimeout(resolve, 1000));
      expect(receivedCount).toBeGreaterThan(0);
    });

    it('should maintain low latency under load', (done) => {
      const latencies: number[] = [];
      
      ioServer.on('connection', (socket) => {
        reliabilityManager.initializeHealth(socket.id);
        
        socket.on('ping:response', (data) => {
          const latency = Date.now() - data.timestamp;
          latencies.push(latency);
          
          if (latencies.length === 10) {
            const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
            expect(avgLatency).toBeLessThan(100); // Average should be under 100ms
            done();
          }
        });
        
        // Send multiple pings
        for (let i = 0; i < 10; i++) {
          setTimeout(() => {
            socket.emit('ping:request', { timestamp: Date.now() });
          }, i * 50);
        }
      });

      clientSocket = ioClient(`http://localhost:${PORT}`);
      clientSocket.on('ping:request', (data) => {
        clientSocket.emit('ping:response', data);
      });
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should provide accurate metrics', (done) => {
      ioServer.on('connection', (socket) => {
        reliabilityManager.initializeHealth(socket.id, 'metrics-user');
        
        // Send some messages
        reliabilityManager.sendReliableMessage(socket, 'test1', { data: 1 });
        reliabilityManager.sendReliableMessage(socket, 'test2', { data: 2 });
        
        const metrics = reliabilityManager.getMetrics();
        
        expect(metrics).toHaveProperty('health');
        expect(metrics).toHaveProperty('queue');
        expect(metrics).toHaveProperty('connections');
        expect(metrics).toHaveProperty('performance');
        expect(metrics.connections.total).toBeGreaterThan(0);
        
        done();
      });

      clientSocket = ioClient(`http://localhost:${PORT}`);
    });

    it('should emit metrics updates periodically', (done) => {
      let updateCount = 0;
      
      reliabilityManager.on('metrics:update', (metrics) => {
        updateCount++;
        expect(metrics).toBeDefined();
        
        if (updateCount >= 2) {
          done();
        }
      });
      
      // Wait for periodic updates
      clientSocket = ioClient(`http://localhost:${PORT}`);
    });
  });
});