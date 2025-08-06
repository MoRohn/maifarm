import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer } from 'http';
import { Socket as ClientSocket } from 'socket.io-client';
import WebSocketServer from '../websocket/socketServer';
import { WebSocketManager } from '../websocket/websocketManager';

describe('WebSocket Connection Reliability', () => {
  let httpServer: ReturnType<typeof createServer>;
  let wsServer: WebSocketServer;
  let clientSocket: ClientSocket;
  const TEST_PORT = 9999;

  beforeEach((done) => {
    httpServer = createServer();
    wsServer = new WebSocketServer(httpServer);
    WebSocketManager.setServer(wsServer);
    
    httpServer.listen(TEST_PORT, () => {
      done();
    });
  });

  afterEach((done) => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    httpServer.close(() => {
      done();
    });
  });

  describe('Connection Management', () => {
    it('should establish connection successfully', (done) => {
      const { io } = require('socket.io-client');
      clientSocket = io(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket', 'polling'],
        reconnection: false
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });

      clientSocket.on('connect_error', (error) => {
        done(error);
      });
    });

    it('should handle reconnection after disconnect', (done) => {
      const { io } = require('socket.io-client');
      let connectCount = 0;
      
      clientSocket = io(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 100,
        reconnectionAttempts: 3
      });

      clientSocket.on('connect', () => {
        connectCount++;
        if (connectCount === 1) {
          // First connection established, now disconnect
          clientSocket.disconnect();
          setTimeout(() => {
            clientSocket.connect();
          }, 200);
        } else if (connectCount === 2) {
          // Reconnected successfully
          expect(clientSocket.connected).toBe(true);
          done();
        }
      });

      clientSocket.on('connect_error', (error) => {
        if (connectCount === 0) {
          done(error);
        }
      });
    });

    it('should timeout on unresponsive connection', (done) => {
      const { io } = require('socket.io-client');
      
      // Connect to a non-existent server
      clientSocket = io('http://localhost:8888', {
        transports: ['websocket'],
        reconnection: false,
        timeout: 1000
      });

      const startTime = Date.now();
      
      clientSocket.on('connect_error', (error) => {
        const duration = Date.now() - startTime;
        expect(error.type).toBe('TransportError');
        expect(duration).toBeGreaterThan(900);
        expect(duration).toBeLessThan(2000);
        done();
      });

      clientSocket.on('connect', () => {
        done(new Error('Should not connect to non-existent server'));
      });
    });
  });

  describe('Error Handling', () => {
    it('should emit error event on malformed data', (done) => {
      const { io } = require('socket.io-client');
      clientSocket = io(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket']
      });

      clientSocket.on('connect', () => {
        // Listen for error response
        clientSocket.on('error', (error) => {
          expect(error).toBeDefined();
          expect(error.message).toContain('Invalid');
          done();
        });

        // Send malformed data
        clientSocket.emit('farm:subscribe', null);
      });
    });

    it('should handle rapid reconnections gracefully', async () => {
      const { io } = require('socket.io-client');
      const connections: ClientSocket[] = [];
      const connectionPromises: Promise<void>[] = [];

      // Create multiple connections rapidly
      for (let i = 0; i < 5; i++) {
        const promise = new Promise<void>((resolve, reject) => {
          const socket = io(`http://localhost:${TEST_PORT}`, {
            transports: ['websocket'],
            reconnection: false
          });

          socket.on('connect', () => {
            connections.push(socket);
            resolve();
          });

          socket.on('connect_error', reject);
        });

        connectionPromises.push(promise);
      }

      await Promise.all(connectionPromises);
      
      expect(connections.length).toBe(5);
      expect(connections.every(s => s.connected)).toBe(true);

      // Clean up
      connections.forEach(s => s.disconnect());
    });
  });

  describe('Message Reliability', () => {
    it('should deliver messages in order', (done) => {
      const { io } = require('socket.io-client');
      clientSocket = io(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket']
      });

      const receivedMessages: number[] = [];
      const expectedMessages = [1, 2, 3, 4, 5];

      clientSocket.on('connect', () => {
        // Listen for test messages
        clientSocket.on('test:message', (data: { order: number }) => {
          receivedMessages.push(data.order);
          
          if (receivedMessages.length === expectedMessages.length) {
            expect(receivedMessages).toEqual(expectedMessages);
            done();
          }
        });

        // Send messages in order
        expectedMessages.forEach((order, index) => {
          setTimeout(() => {
            wsServer.broadcast('test:message', { order });
          }, index * 10);
        });
      });
    });

    it('should handle large messages', (done) => {
      const { io } = require('socket.io-client');
      clientSocket = io(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket']
      });

      // Create a large payload (1MB)
      const largeData = {
        id: 'test-large',
        data: 'x'.repeat(1024 * 1024)
      };

      clientSocket.on('connect', () => {
        clientSocket.on('test:large', (receivedData) => {
          expect(receivedData.id).toBe(largeData.id);
          expect(receivedData.data.length).toBe(largeData.data.length);
          done();
        });

        // Server broadcasts the large message
        wsServer.broadcast('test:large', largeData);
      });
    });
  });

  describe('Connection Health Monitoring', () => {
    it('should track connection statistics', (done) => {
      const { io } = require('socket.io-client');
      
      // Create multiple connections
      const socket1 = io(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket']
      });
      
      const socket2 = io(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket']
      });

      Promise.all([
        new Promise(resolve => socket1.on('connect', resolve)),
        new Promise(resolve => socket2.on('connect', resolve))
      ]).then(() => {
        const stats = wsServer.getConnectionStats();
        
        expect(stats.totalConnections).toBe(2);
        expect(stats.activeConnections).toBe(2);
        
        socket1.disconnect();
        
        setTimeout(() => {
          const updatedStats = wsServer.getConnectionStats();
          expect(updatedStats.activeConnections).toBe(1);
          
          socket2.disconnect();
          done();
        }, 100);
      });
    });

    it('should detect and handle zombie connections', (done) => {
      const { io } = require('socket.io-client');
      clientSocket = io(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
        pingInterval: 100,
        pingTimeout: 200
      });

      clientSocket.on('connect', () => {
        const socketId = clientSocket.id;
        
        // Simulate network interruption by stopping pong responses
        clientSocket.io.engine.on('ping', () => {
          // Don't respond to ping
        });

        setTimeout(() => {
          // Check if server detected the zombie connection
          const stats = wsServer.getConnectionStats();
          const isStillConnected = wsServer['connectedClients'].has(socketId);
          
          expect(isStillConnected).toBe(false);
          done();
        }, 500);
      });
    });
  });

  describe('Fallback Mechanisms', () => {
    it('should switch to polling when websocket fails', (done) => {
      const { io } = require('socket.io-client');
      
      // Block WebSocket upgrade
      const originalUpgrade = httpServer.listeners('upgrade')[0];
      httpServer.removeAllListeners('upgrade');

      clientSocket = io(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket', 'polling'],
        upgrade: true
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.io.engine.transport.name).toBe('polling');
        done();
      });

      clientSocket.on('connect_error', (error) => {
        done(error);
      });
    });
  });

  describe('Performance Under Load', () => {
    it('should handle burst of messages efficiently', async () => {
      const { io } = require('socket.io-client');
      clientSocket = io(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket']
      });

      await new Promise(resolve => clientSocket.on('connect', resolve));

      const messageCount = 1000;
      let receivedCount = 0;
      const startTime = Date.now();

      const messagePromise = new Promise<void>((resolve) => {
        clientSocket.on('test:burst', () => {
          receivedCount++;
          if (receivedCount === messageCount) {
            resolve();
          }
        });
      });

      // Send burst of messages
      for (let i = 0; i < messageCount; i++) {
        wsServer.broadcast('test:burst', { index: i });
      }

      await messagePromise;
      
      const duration = Date.now() - startTime;
      const messagesPerSecond = (messageCount / duration) * 1000;
      
      expect(receivedCount).toBe(messageCount);
      expect(messagesPerSecond).toBeGreaterThan(100); // Should handle at least 100 msg/s
    });
  });
});

describe('WebSocket Security', () => {
  let httpServer: ReturnType<typeof createServer>;
  let wsServer: WebSocketServer;
  const TEST_PORT = 9998;

  beforeEach((done) => {
    httpServer = createServer();
    wsServer = new WebSocketServer(httpServer);
    httpServer.listen(TEST_PORT, done);
  });

  afterEach((done) => {
    httpServer.close(done);
  });

  it('should reject connections without proper auth in production mode', (done) => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.BYPASS_AUTH = 'false';

    const { io } = require('socket.io-client');
    const clientSocket = io(`http://localhost:${TEST_PORT}`, {
      transports: ['websocket'],
      auth: {
        // No token provided
      }
    });

    clientSocket.on('connect_error', (error) => {
      expect(error.message).toContain('Authentication');
      process.env.NODE_ENV = originalEnv;
      clientSocket.disconnect();
      done();
    });

    clientSocket.on('connect', () => {
      process.env.NODE_ENV = originalEnv;
      done(new Error('Should not connect without auth'));
    });
  });
});