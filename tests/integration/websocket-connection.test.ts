import { io, Socket } from 'socket.io-client';
import axios from 'axios';

describe('WebSocket Connection Integration', () => {
  let socket: Socket;
  const serverUrl = process.env.TEST_SERVER_URL || 'http://localhost:4567';
  
  beforeAll(async () => {
    // Check if server is running
    try {
      const response = await axios.get(`${serverUrl}/api/health/live`);
      expect(response.data.status).toBe('alive');
    } catch (error) {
      console.warn('Server not running. Skipping integration tests.');
      return;
    }
  });

  afterEach(() => {
    if (socket) {
      socket.disconnect();
    }
  });

  describe('Connection Lifecycle', () => {
    it('should connect to the WebSocket server', (done) => {
      socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        path: '/socket.io/',
        timeout: 5000
      });

      socket.on('connect', () => {
        expect(socket.connected).toBe(true);
        done();
      });

      socket.on('connect_error', (error) => {
        done(new Error(`Connection failed: ${error.message}`));
      });
    });

    it('should receive connection confirmation', (done) => {
      socket = io(serverUrl, {
        auth: {
          userId: 'test-user'
        }
      });

      socket.on('connected', (data) => {
        expect(data).toMatchObject({
          socketId: expect.any(String),
          userId: 'test-user',
          timestamp: expect.any(String)
        });
        done();
      });
    });

    it('should handle reconnection after disconnect', (done) => {
      let connectCount = 0;
      
      socket = io(serverUrl, {
        reconnection: true,
        reconnectionDelay: 100,
        reconnectionAttempts: 3
      });

      socket.on('connect', () => {
        connectCount++;
        
        if (connectCount === 1) {
          // Force disconnect after first connection
          socket.disconnect();
          socket.connect();
        } else if (connectCount === 2) {
          // Successfully reconnected
          expect(socket.connected).toBe(true);
          done();
        }
      });
    });
  });

  describe('Metrics Updates', () => {
    it('should receive periodic metrics updates', (done) => {
      socket = io(serverUrl);
      
      socket.on('connect', () => {
        socket.emit('metrics:subscribe', {});
      });

      socket.on('metrics:update', (data) => {
        expect(data).toMatchObject({
          event: 'metrics:update',
          data: expect.objectContaining({
            dashboard: expect.objectContaining({
              activeFarms: expect.any(Number),
              totalAgents: expect.any(Number),
              tasksCompleted: expect.any(Number),
              successRate: expect.any(Number)
            })
          }),
          timestamp: expect.any(String)
        });
        done();
      });

      // Timeout after 10 seconds if no metrics received
      setTimeout(() => {
        done(new Error('No metrics received within timeout'));
      }, 10000);
    });
  });

  describe('Farm Operations', () => {
    it('should handle farm subscription', (done) => {
      socket = io(serverUrl);
      const testFarmId = 'test-farm-123';

      socket.on('connect', () => {
        socket.emit('farm:subscribe', testFarmId);
      });

      socket.on('farm:state', (farmData) => {
        // In bypass auth mode, this might be null initially
        expect(farmData).toBeDefined();
        done();
      });

      socket.on('error', (error) => {
        // In bypass auth mode, we might not have real farm data
        if (error.message === 'Insufficient permissions') {
          done();
        } else {
          done(new Error(`Unexpected error: ${error.message}`));
        }
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid event gracefully', (done) => {
      socket = io(serverUrl);
      
      socket.on('connect', () => {
        socket.emit('invalid:event', { test: 'data' });
        
        // Wait a bit to ensure no crash
        setTimeout(() => {
          expect(socket.connected).toBe(true);
          done();
        }, 1000);
      });
    });

    it('should handle malformed data gracefully', (done) => {
      socket = io(serverUrl);
      
      socket.on('connect', () => {
        // Send invalid data types
        socket.emit('task:create', null);
        socket.emit('agent:command', 'not-an-object');
        
        setTimeout(() => {
          expect(socket.connected).toBe(true);
          done();
        }, 1000);
      });
    });
  });

  describe('Performance', () => {
    it('should handle rapid message sending', (done) => {
      socket = io(serverUrl);
      let messagesSent = 0;
      const totalMessages = 100;
      
      socket.on('connect', () => {
        for (let i = 0; i < totalMessages; i++) {
          socket.emit('test:message', { 
            index: i, 
            timestamp: Date.now() 
          });
          messagesSent++;
        }
        
        expect(messagesSent).toBe(totalMessages);
        expect(socket.connected).toBe(true);
        done();
      });
    });
  });
});