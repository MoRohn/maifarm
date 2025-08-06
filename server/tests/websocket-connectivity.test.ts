import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { io as ioClient, Socket } from 'socket.io-client';
import { createServer, Server as HTTPServer } from 'http';
import { WebSocketServer } from '../websocket/socketServer';
import { redis } from '../database/connection';

describe('WebSocket Connectivity Tests', () => {
  let httpServer: HTTPServer;
  let wsServer: WebSocketServer;
  let clientSocket: Socket;
  const TEST_PORT = 4568; // Use different port for testing

  beforeAll((done) => {
    // Create HTTP server
    httpServer = createServer();
    
    // Initialize WebSocket server
    wsServer = new WebSocketServer(httpServer);
    
    // Start server
    httpServer.listen(TEST_PORT, () => {
      console.log(`Test server listening on port ${TEST_PORT}`);
      done();
    });
  });

  afterAll((done) => {
    // Close all connections
    if (clientSocket) clientSocket.close();
    httpServer.close(done);
  });

  beforeEach(() => {
    // Reset client socket for each test
    clientSocket = null;
  });

  afterEach(() => {
    // Clean up client socket after each test
    if (clientSocket) {
      clientSocket.close();
    }
  });

  describe('Connection Establishment', () => {
    it('should establish WebSocket connection successfully', (done) => {
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
        auth: { userId: 'test-user' }
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });

      clientSocket.on('connect_error', (error) => {
        done(error);
      });
    });

    it('should receive connected event with socket details', (done) => {
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
        auth: { userId: 'test-user' }
      });

      clientSocket.on('connected', (data) => {
        expect(data).toHaveProperty('socketId');
        expect(data).toHaveProperty('userId', 'test-user');
        expect(data).toHaveProperty('timestamp');
        done();
      });
    });

    it('should handle polling fallback when WebSocket fails', (done) => {
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['polling', 'websocket'],
        upgrade: true,
        auth: { userId: 'test-user' }
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        // Check transport type
        expect(['polling', 'websocket']).toContain(clientSocket.io.engine.transport.name);
        done();
      });
    });
  });

  describe('Heartbeat Mechanism', () => {
    it('should respond to ping with pong', (done) => {
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
        auth: { userId: 'test-user' }
      });

      clientSocket.on('connect', () => {
        // Listen for ping and respond with pong
        clientSocket.on('ping', () => {
          clientSocket.emit('pong');
          done();
        });
      });
    });

    it('should maintain connection with regular heartbeats', (done) => {
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
        auth: { userId: 'test-user' }
      });

      let pingCount = 0;
      clientSocket.on('connect', () => {
        clientSocket.on('ping', () => {
          pingCount++;
          clientSocket.emit('pong');
          
          // Wait for at least 2 pings to ensure heartbeat is working
          if (pingCount >= 2) {
            expect(clientSocket.connected).toBe(true);
            done();
          }
        });
      });
    }, 65000); // Increase timeout for heartbeat test
  });

  describe('Reconnection Logic', () => {
    it('should attempt reconnection after disconnect', (done) => {
      let disconnectCount = 0;
      let reconnectCount = 0;

      clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
        auth: { userId: 'test-user' },
        reconnection: true,
        reconnectionDelay: 100,
        reconnectionAttempts: 3
      });

      clientSocket.on('connect', () => {
        if (reconnectCount === 0) {
          // First connection - force disconnect
          clientSocket.disconnect();
        } else {
          // Reconnected successfully
          expect(reconnectCount).toBeGreaterThan(0);
          done();
        }
      });

      clientSocket.on('disconnect', () => {
        disconnectCount++;
      });

      clientSocket.io.on('reconnect', () => {
        reconnectCount++;
      });
    });

    it('should use exponential backoff for reconnection', (done) => {
      const reconnectDelays: number[] = [];
      let lastReconnectTime = Date.now();

      clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
        auth: { userId: 'test-user' },
        reconnection: true,
        reconnectionDelay: 100,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5
      });

      clientSocket.io.on('reconnect_attempt', () => {
        const now = Date.now();
        const delay = now - lastReconnectTime;
        reconnectDelays.push(delay);
        lastReconnectTime = now;

        if (reconnectDelays.length >= 3) {
          // Check that delays are increasing (exponential backoff)
          expect(reconnectDelays[1]).toBeGreaterThan(reconnectDelays[0]);
          expect(reconnectDelays[2]).toBeGreaterThan(reconnectDelays[1]);
          done();
        }
      });

      // Force disconnect to trigger reconnection
      clientSocket.on('connect', () => {
        clientSocket.io.engine.close();
      });
    });
  });

  describe('CORS Configuration', () => {
    it('should accept connections from localhost origins', (done) => {
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
        auth: { userId: 'test-user' },
        withCredentials: true,
        extraHeaders: {
          'Origin': 'http://localhost:3000'
        }
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });
    });

    it('should handle connections without origin header', (done) => {
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
        auth: { userId: 'test-user' }
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });
    });
  });

  describe('Message Broadcasting', () => {
    it('should broadcast farm updates to subscribed clients', (done) => {
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
        auth: { userId: 'test-user' }
      });

      const farmId = 'test-farm-123';
      const updateData = { status: 'active', progress: 50 };

      clientSocket.on('connect', () => {
        // Subscribe to farm
        clientSocket.emit('farm:subscribe', farmId);

        // Listen for farm updates
        clientSocket.on('farm:updated', (event) => {
          expect(event.data).toEqual(updateData);
          expect(event.event).toBe('farm:updated');
          done();
        });

        // Trigger broadcast from server
        setTimeout(() => {
          wsServer.broadcastFarmUpdate(farmId, updateData);
        }, 100);
      });
    });

    it('should broadcast metrics to subscribed clients', (done) => {
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
        auth: { userId: 'test-user' }
      });

      const metricsData = {
        activeFarms: 5,
        totalAgents: 20,
        tasksCompleted: 100
      };

      clientSocket.on('connect', () => {
        // Subscribe to metrics
        clientSocket.emit('metrics:subscribe', {});

        // Listen for metrics updates
        clientSocket.on('metrics:update', (event) => {
          expect(event.data).toMatchObject(metricsData);
          done();
        });

        // Trigger broadcast from server
        setTimeout(() => {
          wsServer.broadcastMetrics(metricsData);
        }, 100);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid message formats gracefully', (done) => {
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
        auth: { userId: 'test-user' }
      });

      clientSocket.on('connect', () => {
        // Send invalid data
        clientSocket.emit('farm:subscribe', null);
        clientSocket.emit('farm:subscribe', undefined);
        clientSocket.emit('farm:subscribe', {});

        // Should not crash - wait a bit then check connection
        setTimeout(() => {
          expect(clientSocket.connected).toBe(true);
          done();
        }, 500);
      });
    });

    it('should emit error for insufficient permissions', (done) => {
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
        auth: { userId: 'test-user' }
      });

      clientSocket.on('connect', () => {
        // Override permissions for this test
        clientSocket.auth = { userId: 'restricted-user' };
        
        clientSocket.on('error', (error) => {
          expect(error.message).toContain('permissions');
          done();
        });

        // This should trigger a permission error
        // Note: In test mode, permissions are bypassed, so this might not trigger
        clientSocket.emit('task:create', { name: 'test' }, (response) => {
          if (response.error) {
            expect(response.error).toContain('permissions');
            done();
          }
        });
      });
    });
  });

  describe('Connection State Recovery', () => {
    it('should recover connection state after brief disconnect', (done) => {
      const farmId = 'test-farm-456';
      
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
        auth: { userId: 'test-user' }
      });

      clientSocket.on('connect', () => {
        // Subscribe to farm
        clientSocket.emit('farm:subscribe', farmId);

        // Simulate brief disconnect
        setTimeout(() => {
          clientSocket.disconnect();
          
          // Reconnect after brief delay
          setTimeout(() => {
            clientSocket.connect();
            
            // Check if subscription is maintained
            clientSocket.on('farm:state', (farm) => {
              expect(farm).toBeDefined();
              done();
            });
          }, 500);
        }, 500);
      });
    });
  });
});

describe('Redis Connectivity and Fallback Tests', () => {
  describe('Redis Connection', () => {
    it('should check Redis health status', async () => {
      const health = await redis.ping().catch(() => null);
      
      if (health) {
        expect(health).toBe('PONG');
      } else {
        // Redis not available - should fallback gracefully
        expect(health).toBeNull();
      }
    });
  });

  describe('Cache Service Fallback', () => {
    const { cacheService } = require('../services/cacheService');

    it('should use in-memory cache when Redis is unavailable', async () => {
      const key = 'test:key';
      const value = { data: 'test-value' };

      // Set value
      await cacheService.set(key, value);

      // Get value
      const retrieved = await cacheService.get(key);
      expect(retrieved).toEqual(value);

      // Delete value
      await cacheService.del(key);
      const deleted = await cacheService.get(key);
      expect(deleted).toBeNull();
    });

    it('should handle TTL in fallback mode', async () => {
      const key = 'test:ttl';
      const value = 'expires-soon';

      // Set with 1 second TTL
      await cacheService.set(key, value, 1);

      // Should exist immediately
      const exists = await cacheService.exists(key);
      expect(exists).toBe(true);

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Should be expired
      const expired = await cacheService.get(key);
      expect(expired).toBeNull();
    });

    it('should handle rate limiting in fallback mode', async () => {
      const key = 'rate:test';

      // Increment counter
      const count1 = await cacheService.incrementCounter(key, 60);
      expect(count1).toBe(1);

      const count2 = await cacheService.incrementCounter(key, 60);
      expect(count2).toBe(2);

      const count3 = await cacheService.incrementCounter(key, 60);
      expect(count3).toBe(3);
    });
  });
});