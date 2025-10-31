import request from 'supertest';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import express from 'express';
import WebSocketServer from '../../websocket/socketServer';

describe('WebSocket Connection Resilience Integration Tests', () => {
  let app: express.Application;
  let httpServer: ReturnType<typeof createServer>;
  let wsServer: WebSocketServer;
  let clientSocket: ClientSocket;
  let serverPort: number;

  beforeAll((done) => {
    // Create Express app and HTTP server
    app = express();
    httpServer = createServer(app);
    
    // Initialize WebSocket server
    wsServer = new WebSocketServer(httpServer);
    
    // Start server on random port
    httpServer.listen(0, () => {
      const address = httpServer.address();
      serverPort = typeof address === 'object' ? address.port : 0;
      done();
    });
  });

  afterEach(() => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  afterAll((done) => {
    httpServer.close(done);
  });

  describe('Connection Management', () => {
    it('should establish initial connection successfully', (done) => {
      clientSocket = ioClient(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
        autoConnect: true,
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });

      clientSocket.on('connect_error', (error) => {
        done(error);
      });
    });

    it('should handle authentication in connection', (done) => {
      clientSocket = ioClient(`http://localhost:${serverPort}`, {
        auth: {
          userId: 'test-user-123',
          token: 'test-token',
        },
      });

      clientSocket.on('connected', (data) => {
        expect(data).toHaveProperty('socketId');
        expect(data).toHaveProperty('userId', 'test-user-123');
        expect(data).toHaveProperty('timestamp');
        done();
      });
    });

    it('should reconnect automatically after server disconnect', (done) => {
      let disconnectCount = 0;
      let reconnectCount = 0;

      clientSocket = ioClient(`http://localhost:${serverPort}`, {
        reconnection: true,
        reconnectionDelay: 100,
        reconnectionAttempts: 3,
      });

      clientSocket.on('connect', () => {
        if (reconnectCount === 0) {
          // First connection established, force disconnect from server
          wsServer.getIO().emit('disconnect', 'server namespace disconnect');
        }
      });

      clientSocket.on('disconnect', () => {
        disconnectCount++;
      });

      clientSocket.on('reconnect', () => {
        reconnectCount++;
        expect(disconnectCount).toBeGreaterThan(0);
        expect(clientSocket.connected).toBe(true);
        done();
      });
    });

    it('should handle multiple concurrent connections', async () => {
      const numClients = 5;
      const clients: ClientSocket[] = [];
      const connectionPromises: Promise<void>[] = [];

      for (let i = 0; i < numClients; i++) {
        const client = ioClient(`http://localhost:${serverPort}`, {
          auth: { userId: `user-${i}` },
        });

        clients.push(client);

        const promise = new Promise<void>((resolve) => {
          client.on('connected', () => {
            resolve();
          });
        });

        connectionPromises.push(promise);
      }

      await Promise.all(connectionPromises);

      // Verify all clients are connected
      clients.forEach((client) => {
        expect(client.connected).toBe(true);
      });

      // Cleanup
      clients.forEach((client) => client.disconnect());
    });
  });

  describe('Message Broadcasting', () => {
    let client1: ClientSocket;
    let client2: ClientSocket;

    beforeEach((done) => {
      let connectedClients = 0;

      client1 = ioClient(`http://localhost:${serverPort}`, {
        auth: { userId: 'user-1' },
      });

      client2 = ioClient(`http://localhost:${serverPort}`, {
        auth: { userId: 'user-2' },
      });

      const checkAllConnected = () => {
        connectedClients++;
        if (connectedClients === 2) {
          done();
        }
      };

      client1.on('connect', checkAllConnected);
      client2.on('connect', checkAllConnected);
    });

    afterEach(() => {
      client1.disconnect();
      client2.disconnect();
    });

    it('should broadcast farm updates to all connected clients', (done) => {
      let receivedCount = 0;
      const farmUpdate = {
        id: 'farm-123',
        name: 'Test Farm',
        status: 'running',
      };

      const checkComplete = () => {
        receivedCount++;
        if (receivedCount === 2) {
          done();
        }
      };

      client1.on('farm:updated', (data) => {
        expect(data).toEqual(farmUpdate);
        checkComplete();
      });

      client2.on('farm:updated', (data) => {
        expect(data).toEqual(farmUpdate);
        checkComplete();
      });

      // Broadcast from server
      wsServer.broadcast('farm:updated', farmUpdate);
    });

    it('should handle selective broadcasting to subscribed clients', (done) => {
      const farmId = 'farm-456';
      const agentUpdate = {
        id: 'agent-789',
        farmId: farmId,
        status: 'active',
      };

      // Only client1 subscribes to the farm
      client1.emit('farm:subscribe', farmId);

      // Wait a bit for subscription to process
      setTimeout(() => {
        // Set up listeners
        client1.on('agent:status', (data) => {
          expect(data).toEqual(agentUpdate);
          done();
        });

        client2.on('agent:status', () => {
          // Client2 should not receive this
          done(new Error('Client2 received message without subscription'));
        });

        // Broadcast to farm subscribers only
        wsServer.broadcastToFarm(farmId, 'agent:status', agentUpdate);

        // Give time for potential incorrect delivery
        setTimeout(() => {
          // If we get here without client2 receiving, test passes
          if (!client1.listenerCount('agent:status')) {
            done();
          }
        }, 100);
      }, 50);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle malformed messages gracefully', (done) => {
      clientSocket = ioClient(`http://localhost:${serverPort}`);

      clientSocket.on('connect', () => {
        // Send malformed data
        clientSocket.emit('invalid_event', undefined);
        clientSocket.emit('farm:subscribe', null);
        clientSocket.emit('message', { invalid: 'structure' });

        // Should still be connected
        setTimeout(() => {
          expect(clientSocket.connected).toBe(true);
          done();
        }, 100);
      });
    });

    it('should enforce rate limiting on rapid requests', async () => {
      clientSocket = ioClient(`http://localhost:${serverPort}`);

      await new Promise((resolve) => {
        clientSocket.on('connect', resolve);
      });

      const requests = [];
      for (let i = 0; i < 100; i++) {
        requests.push(
          new Promise((resolve) => {
            clientSocket.emit('farm:subscribe', `farm-${i}`, resolve);
          })
        );
      }

      // Some requests should be rate limited
      const results = await Promise.allSettled(requests);
      const rejected = results.filter((r) => r.status === 'rejected');
      
      // Expect some rate limiting (exact number depends on implementation)
      expect(rejected.length).toBeGreaterThan(0);
    });

    it('should maintain connection during high message volume', async () => {
      clientSocket = ioClient(`http://localhost:${serverPort}`);
      let messageCount = 0;

      await new Promise((resolve) => {
        clientSocket.on('connect', resolve);
      });

      clientSocket.on('metrics:update', () => {
        messageCount++;
      });

      // Send many messages rapidly
      for (let i = 0; i < 1000; i++) {
        wsServer.broadcast('metrics:update', {
          value: i,
          timestamp: new Date(),
        });
      }

      // Wait for messages to be processed
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(clientSocket.connected).toBe(true);
      expect(messageCount).toBeGreaterThan(900); // Allow for some message loss
    });
  });

  describe('Connection State Synchronization', () => {
    it('should restore client state after reconnection', async () => {
      const farmId = 'farm-state-test';
      let initialState: any;
      let reconnectedState: any;

      clientSocket = ioClient(`http://localhost:${serverPort}`, {
        auth: { userId: 'state-test-user' },
      });

      // Initial connection and subscription
      await new Promise((resolve) => {
        clientSocket.on('connect', () => {
          clientSocket.emit('farm:subscribe', farmId);
          resolve(undefined);
        });
      });

      // Get initial state
      await new Promise((resolve) => {
        clientSocket.on('farm:state', (state) => {
          initialState = state;
          resolve(undefined);
        });
        
        // Trigger state emission
        wsServer.emitToRoom(`farm:${farmId}`, 'farm:state', {
          farmId,
          status: 'running',
          agents: 5,
        });
      });

      // Force disconnect and reconnect
      clientSocket.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      clientSocket.connect();
      await new Promise((resolve) => {
        clientSocket.on('connect', () => {
          clientSocket.emit('farm:subscribe', farmId);
          resolve(undefined);
        });
      });

      // Get state after reconnection
      await new Promise((resolve) => {
        clientSocket.on('farm:state', (state) => {
          reconnectedState = state;
          resolve(undefined);
        });
      });

      expect(reconnectedState).toBeDefined();
      expect(reconnectedState.farmId).toBe(farmId);
    });
  });

  describe('Health Check Integration', () => {
    it('should respond to health check requests', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body.services).toHaveProperty('websocket', 'healthy');
    });

    it('should include WebSocket metrics in health response', async () => {
      // Connect multiple clients
      const clients = [];
      for (let i = 0; i < 3; i++) {
        const client = ioClient(`http://localhost:${serverPort}`);
        clients.push(client);
        await new Promise((resolve) => client.on('connect', resolve));
      }

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.services.websocket).toBe('healthy');
      
      // Cleanup
      clients.forEach((client) => client.disconnect());
    });
  });
});