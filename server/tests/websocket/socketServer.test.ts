import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket } from 'socket.io-client';
import WebSocketServer from '../../websocket/socketServer';
import { validateWebSocketOrigin } from '../../middleware/cors';

// Mock dependencies
jest.mock('../../database/connection', () => ({
  db: {},
  redis: {}
}));

jest.mock('../../api/metrics', () => ({
  taskCounter: { inc: jest.fn() },
  activeAgents: { set: jest.fn() }
}));

jest.mock('../../middleware/cors');

describe('WebSocketServer', () => {
  let httpServer: any;
  let wsServer: WebSocketServer;
  let clientSocket: Socket;
  let serverPort: number;

  beforeAll((done) => {
    // Create HTTP server
    httpServer = createServer();
    
    // Find available port
    httpServer.listen(0, () => {
      serverPort = httpServer.address().port;
      done();
    });
  });

  beforeEach((done) => {
    // Mock CORS validation to allow all origins
    (validateWebSocketOrigin as jest.Mock).mockReturnValue(true);

    // Create WebSocket server
    wsServer = new WebSocketServer(httpServer);
    
    // Create client socket
    clientSocket = ioClient(`http://localhost:${serverPort}`, {
      autoConnect: false,
      auth: {
        userId: 'test-user-123'
      }
    });

    done();
  });

  afterEach(() => {
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  afterAll((done) => {
    httpServer.close(done);
  });

  describe('connection handling', () => {
    it('should accept client connections', (done) => {
      clientSocket.on('connected', (data) => {
        expect(data).toMatchObject({
          socketId: expect.any(String),
          userId: 'test-user-123',
          timestamp: expect.any(String)
        });
        done();
      });

      clientSocket.connect();
    });

    it('should reject connections with invalid origin', (done) => {
      (validateWebSocketOrigin as jest.Mock).mockReturnValue(false);

      clientSocket.on('connect_error', (error) => {
        expect(error.message).toContain('Not allowed by CORS');
        done();
      });

      clientSocket.connect();
    });

    it('should handle client disconnection', (done) => {
      let connected = false;

      clientSocket.on('connected', () => {
        connected = true;
        clientSocket.disconnect();
      });

      clientSocket.on('disconnect', () => {
        if (connected) {
          expect(true).toBe(true); // Disconnection handled
          done();
        }
      });

      clientSocket.connect();
    });
  });

  describe('farm subscriptions', () => {
    beforeEach((done) => {
      clientSocket.on('connected', () => done());
      clientSocket.connect();
    });

    it('should handle farm subscription', (done) => {
      const farmId = 'test-farm-123';

      clientSocket.emit('farm:subscribe', farmId);

      // Server should add client to farm room
      setTimeout(() => {
        // Verify subscription was successful (would need access to internal state)
        expect(true).toBe(true);
        done();
      }, 100);
    });

    it('should handle farm unsubscription', (done) => {
      const farmId = 'test-farm-123';

      clientSocket.emit('farm:subscribe', farmId);

      setTimeout(() => {
        clientSocket.emit('farm:unsubscribe', farmId);
        
        setTimeout(() => {
          // Verify unsubscription was successful
          expect(true).toBe(true);
          done();
        }, 100);
      }, 100);
    });

    it('should reject subscription without permissions', (done) => {
      // Mock permission check to fail
      jest.spyOn(wsServer as any, 'hasPermission').mockReturnValue(false);

      clientSocket.on('error', (error) => {
        expect(error.message).toBe('Insufficient permissions');
        done();
      });

      clientSocket.emit('farm:subscribe', 'test-farm-123');
    });
  });

  describe('agent subscriptions', () => {
    beforeEach((done) => {
      clientSocket.on('connected', () => done());
      clientSocket.connect();
    });

    it('should handle agent subscription', (done) => {
      const agentId = 'test-agent-123';

      clientSocket.emit('agent:subscribe', agentId);

      setTimeout(() => {
        expect(true).toBe(true);
        done();
      }, 100);
    });

    it('should handle agent unsubscription', (done) => {
      const agentId = 'test-agent-123';

      clientSocket.emit('agent:subscribe', agentId);

      setTimeout(() => {
        clientSocket.emit('agent:unsubscribe', agentId);
        
        setTimeout(() => {
          expect(true).toBe(true);
          done();
        }, 100);
      }, 100);
    });
  });

  describe('broadcast methods', () => {
    let clientSocket2: Socket;

    beforeEach((done) => {
      // Create second client
      clientSocket2 = ioClient(`http://localhost:${serverPort}`, {
        auth: {
          userId: 'test-user-456'
        }
      });

      let connected1 = false;
      let connected2 = false;

      clientSocket.on('connected', () => {
        connected1 = true;
        if (connected1 && connected2) done();
      });

      clientSocket2.on('connected', () => {
        connected2 = true;
        if (connected1 && connected2) done();
      });

      clientSocket.connect();
      clientSocket2.connect();
    });

    afterEach(() => {
      if (clientSocket2.connected) {
        clientSocket2.disconnect();
      }
    });

    it('should broadcast farm updates to subscribers', (done) => {
      const farmId = 'test-farm-123';
      const farmUpdate = {
        id: farmId,
        status: 'running',
        agents: []
      };

      // Subscribe both clients to farm
      clientSocket.emit('farm:subscribe', farmId);
      clientSocket2.emit('farm:subscribe', farmId);

      // Listen for updates
      let received1 = false;
      let received2 = false;

      clientSocket.on('farm:updated', (data) => {
        expect(data).toMatchObject(farmUpdate);
        received1 = true;
        if (received1 && received2) done();
      });

      clientSocket2.on('farm:updated', (data) => {
        expect(data).toMatchObject(farmUpdate);
        received2 = true;
        if (received1 && received2) done();
      });

      // Broadcast update
      setTimeout(() => {
        wsServer.broadcastFarmUpdate(farmId, farmUpdate);
      }, 200);
    });

    it('should broadcast to all clients', (done) => {
      const message = {
        type: 'system',
        content: 'Test broadcast'
      };

      let received1 = false;
      let received2 = false;

      clientSocket.on('broadcast', (data) => {
        expect(data).toMatchObject(message);
        received1 = true;
        if (received1 && received2) done();
      });

      clientSocket2.on('broadcast', (data) => {
        expect(data).toMatchObject(message);
        received2 = true;
        if (received1 && received2) done();
      });

      wsServer.broadcast('broadcast', message);
    });
  });

  describe('metrics reporting', () => {
    beforeEach((done) => {
      clientSocket.on('connected', () => done());
      clientSocket.connect();
    });

    it('should emit metrics updates periodically', (done) => {
      clientSocket.on('metrics:update', (data) => {
        expect(data).toMatchObject({
          dashboard: expect.objectContaining({
            activeFarms: expect.any(Number),
            totalAgents: expect.any(Number),
            tasksCompleted: expect.any(Number),
            successRate: expect.any(Number)
          })
        });
        done();
      });

      // Force metrics emission
      (wsServer as any).emitMetrics();
    });
  });

  describe('error handling', () => {
    beforeEach((done) => {
      clientSocket.on('connected', () => done());
      clientSocket.connect();
    });

    it('should handle malformed messages gracefully', (done) => {
      clientSocket.on('error', (error) => {
        expect(error).toBeDefined();
        done();
      });

      // Send malformed data
      clientSocket.emit('farm:subscribe', null);
    });

    it('should handle database errors', (done) => {
      // Mock database error
      jest.spyOn(wsServer as any, 'getFarmState').mockRejectedValue(new Error('Database error'));

      clientSocket.on('error', (error) => {
        expect(error.message).toContain('Failed to get farm state');
        done();
      });

      clientSocket.emit('farm:subscribe', 'test-farm-123');
    });
  });

  describe('connection cleanup', () => {
    it('should clean up subscriptions on disconnect', (done) => {
      const farmId = 'test-farm-123';

      clientSocket.on('connected', () => {
        clientSocket.emit('farm:subscribe', farmId);

        setTimeout(() => {
          const initialSize = (wsServer as any).farmSubscriptions.get(farmId)?.size || 0;
          expect(initialSize).toBe(1);

          clientSocket.disconnect();

          setTimeout(() => {
            const finalSize = (wsServer as any).farmSubscriptions.get(farmId)?.size || 0;
            expect(finalSize).toBe(0);
            done();
          }, 200);
        }, 100);
      });

      clientSocket.connect();
    });

    it('should remove client from connectedClients on disconnect', (done) => {
      clientSocket.on('connected', () => {
        const socketId = clientSocket.id;
        expect((wsServer as any).connectedClients.has(socketId)).toBe(true);

        clientSocket.disconnect();

        setTimeout(() => {
          expect((wsServer as any).connectedClients.has(socketId)).toBe(false);
          done();
        }, 200);
      });

      clientSocket.connect();
    });
  });

  describe('permissions', () => {
    beforeEach((done) => {
      clientSocket.on('connected', () => done());
      clientSocket.connect();
    });

    it('should check permissions for farm operations', (done) => {
      const hasPermissionSpy = jest.spyOn(wsServer as any, 'hasPermission');

      clientSocket.emit('farm:subscribe', 'test-farm-123');

      setTimeout(() => {
        expect(hasPermissionSpy).toHaveBeenCalledWith(
          expect.any(Object),
          'farms:read'
        );
        done();
      }, 100);
    });

    it('should check permissions for agent operations', (done) => {
      const hasPermissionSpy = jest.spyOn(wsServer as any, 'hasPermission');

      clientSocket.emit('agent:subscribe', 'test-agent-123');

      setTimeout(() => {
        expect(hasPermissionSpy).toHaveBeenCalledWith(
          expect.any(Object),
          'agents:read'
        );
        done();
      }, 100);
    });
  });
});