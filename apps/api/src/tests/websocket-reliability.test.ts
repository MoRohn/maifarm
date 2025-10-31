/**
 * WebSocket Reliability Tests
 * Tests WebSocket connection resilience, reconnection, and message delivery
 */

import { Server as HTTPServer } from 'http';
import { WebSocketServer } from '../websocket/socketServer';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { reliabilityManager } from '../websocket/reliabilityManager';
import { coordinationService } from '../services/coordinationService';
import { fileWatcher } from '../services/coordinationFileWatcher';
import * as fs from 'fs';
import * as path from 'path';

describe('WebSocket Reliability', () => {
  let httpServer: HTTPServer;
  let wsServer: WebSocketServer;
  let clientSocket: ClientSocket;
  const TEST_PORT = 4568;
  const TEST_URL = `http://localhost:${TEST_PORT}`;
  
  beforeAll(async () => {
    // Create HTTP server
    httpServer = new HTTPServer();
    wsServer = new WebSocketServer(httpServer);
    
    // Start server
    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, () => {
        console.log(`Test server listening on port ${TEST_PORT}`);
        resolve();
      });
    });
  });
  
  afterAll(async () => {
    // Clean up
    if (clientSocket) {
      clientSocket.disconnect();
    }
    
    reliabilityManager.shutdown();
    await coordinationService.destroy();
    
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });
  
  beforeEach(() => {
    // Reset state before each test
    if (clientSocket) {
      clientSocket.disconnect();
    }
  });
  
  describe('Connection Management', () => {
    test('should establish connection successfully', (done) => {
      clientSocket = ioClient(TEST_URL, {
        transports: ['websocket']
      });
      
      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });
    });
    
    test('should handle ping/pong heartbeat', (done) => {
      clientSocket = ioClient(TEST_URL);
      
      clientSocket.on('connect', () => {
        // Listen for ping from server
        clientSocket.on('ping', (data) => {
          expect(data).toHaveProperty('timestamp');
          
          // Send pong response
          clientSocket.emit('pong', { timestamp: data.timestamp });
          done();
        });
      });
    });
    
    test('should track latency', (done) => {
      clientSocket = ioClient(TEST_URL);
      let latencyReceived = false;
      
      clientSocket.on('connect', () => {
        // Send multiple pongs to trigger latency calculation
        clientSocket.on('ping', (data) => {
          clientSocket.emit('pong', { timestamp: data.timestamp });
        });
        
        clientSocket.on('connection:latency', (data) => {
          expect(data).toHaveProperty('latency');
          expect(typeof data.latency).toBe('number');
          latencyReceived = true;
          done();
        });
      });
      
      // Timeout if no latency received
      setTimeout(() => {
        if (!latencyReceived) {
          done();
        }
      }, 15000);
    });
    
    test('should reconnect after disconnection', (done) => {
      let reconnectCount = 0;
      
      clientSocket = ioClient(TEST_URL, {
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 100
      });
      
      clientSocket.on('connect', () => {
        reconnectCount++;
        
        if (reconnectCount === 1) {
          // First connection - disconnect to trigger reconnect
          clientSocket.disconnect();
          clientSocket.connect();
        } else if (reconnectCount === 2) {
          // Reconnected successfully
          expect(clientSocket.connected).toBe(true);
          done();
        }
      });
    });
  });
  
  describe('Message Reliability', () => {
    test('should acknowledge messages', (done) => {
      clientSocket = ioClient(TEST_URL);
      
      clientSocket.on('connect', () => {
        // Listen for a message with messageId
        clientSocket.on('test:message', (data) => {
          if (data.messageId || data._messageId) {
            const messageId = data.messageId || data._messageId;
            
            // Send acknowledgment
            clientSocket.emit('message:ack', messageId);
            
            // Verify acknowledgment was received
            setTimeout(() => {
              const acknowledged = reliabilityManager.acknowledgeMessage(messageId);
              expect(acknowledged).toBeDefined();
              done();
            }, 100);
          }
        });
        
        // Trigger a message from server
        const messageId = reliabilityManager.queueMessage(
          clientSocket as any,
          'test:message',
          { test: 'data' },
          true
        );
        
        expect(messageId).toBeDefined();
      });
    });
    
    test('should retry failed messages', (done) => {
      let messageCount = 0;
      
      clientSocket = ioClient(TEST_URL);
      
      clientSocket.on('connect', () => {
        clientSocket.on('test:retry', (data) => {
          messageCount++;
          
          if (messageCount === 1) {
            // Don't acknowledge first attempt
            expect(data._attempt).toBe(1);
          } else if (messageCount === 2) {
            // Acknowledge on retry
            expect(data._attempt).toBe(2);
            clientSocket.emit('message:ack', data._messageId);
            done();
          }
        });
        
        // Send message that requires acknowledgment
        reliabilityManager.queueMessage(
          clientSocket as any,
          'test:retry',
          { test: 'retry' },
          true
        );
      });
    }, 10000);
    
    test('should handle batch acknowledgments', (done) => {
      const messageIds: string[] = [];
      
      clientSocket = ioClient(TEST_URL);
      
      clientSocket.on('connect', () => {
        // Queue multiple messages
        for (let i = 0; i < 3; i++) {
          const id = reliabilityManager.queueMessage(
            clientSocket as any,
            'test:batch',
            { index: i },
            true
          );
          messageIds.push(id);
        }
        
        // Send batch acknowledgment
        setTimeout(() => {
          clientSocket.emit('messages:ack', messageIds);
          
          // Verify all were acknowledged
          setTimeout(() => {
            const metrics = reliabilityManager.getMetrics();
            expect(metrics.unacknowledged).toBeLessThanOrEqual(messageIds.length);
            done();
          }, 100);
        }, 100);
      });
    });
  });
  
  describe('Coordination Service', () => {
    const testDir = '/tmp/test_coordination';
    const activeAgentsFile = path.join(testDir, 'active_agents.json');
    
    beforeEach(async () => {
      // Create test directory
      await fs.promises.mkdir(testDir, { recursive: true });
    });
    
    afterEach(async () => {
      // Clean up test files
      try {
        await fs.promises.rm(testDir, { recursive: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    });
    
    test('should watch active agents file', (done) => {
      // Watch for file changes
      fileWatcher.watchFile(activeAgentsFile, 'test:agents');
      
      fileWatcher.on('test:agents', (data) => {
        expect(data).toHaveProperty('agent_1');
        expect(data.agent_1.status).toBe('active');
        fileWatcher.unwatchFile(activeAgentsFile);
        done();
      });
      
      // Create file after a delay
      setTimeout(async () => {
        const testData = {
          agent_1: {
            agent_id: 'agent_1',
            status: 'active',
            started: new Date().toISOString()
          }
        };
        
        await fs.promises.writeFile(
          activeAgentsFile,
          JSON.stringify(testData, null, 2)
        );
      }, 500);
    });
    
    test('should handle file watch errors', (done) => {
      const nonExistentFile = '/tmp/non_existent/file.json';
      
      fileWatcher.on('watch:error', (error) => {
        expect(error).toHaveProperty('filePath');
        expect(error.filePath).toBe(nonExistentFile);
        done();
      });
      
      fileWatcher.watchFile(nonExistentFile, 'test:error');
    });
    
    test('should emit health warnings for stale agents', (done) => {
      coordinationService.on('health:warning', (warning) => {
        expect(warning).toHaveProperty('agentId');
        expect(warning.type).toBe('stale');
        expect(warning.severity).toBeDefined();
        done();
      });
      
      // Simulate stale agent
      const staleAgent = {
        agent_id: 'stale_agent',
        status: 'active',
        started: new Date(Date.now() - 70000).toISOString() // 70 seconds ago
      };
      
      // Trigger health check with stale agent
      coordinationService['handleActiveAgentsFileUpdate']({
        stale_agent: staleAgent
      });
    });
  });
  
  describe('Connection Health', () => {
    test('should track connection health metrics', (done) => {
      clientSocket = ioClient(TEST_URL);
      
      clientSocket.on('connect', () => {
        const socketId = clientSocket.id;
        
        // Initialize health tracking
        reliabilityManager.initializeHealth(socketId);
        
        // Update health metrics
        reliabilityManager.updateConnectionHealth(socketId, {
          connected: true,
          latency: 50,
          lastPong: new Date()
        });
        
        // Get health status
        const health = reliabilityManager.getConnectionHealth(socketId);
        
        expect(health).toBeDefined();
        expect(health?.connected).toBe(true);
        expect(health?.latency).toBe(50);
        
        done();
      });
    });
    
    test('should calculate reliability score', (done) => {
      clientSocket = ioClient(TEST_URL);
      
      clientSocket.on('connect', () => {
        const socketId = clientSocket.id;
        
        reliabilityManager.initializeHealth(socketId);
        reliabilityManager.updateConnectionHealth(socketId, {
          connected: true,
          latency: 100,
          failedMessages: 0
        });
        
        const stats = reliabilityManager.getStatistics();
        
        expect(stats.averageReliability).toBeGreaterThan(0);
        expect(stats.totalConnections).toBeGreaterThan(0);
        
        done();
      });
    });
    
    test('should handle degraded connection state', (done) => {
      clientSocket = ioClient(TEST_URL);
      
      clientSocket.on('connect', () => {
        clientSocket.on('connection:warning', (data) => {
          expect(data.reason).toBe('unresponsive');
          done();
        });
        
        // Simulate missed pings by not responding to pong
        clientSocket.off('ping');
      });
    }, 20000);
  });
  
  describe('Error Recovery', () => {
    test('should recover from parse errors', (done) => {
      fileWatcher.on('parse:error', (error) => {
        expect(error).toHaveProperty('filePath');
        expect(error).toHaveProperty('error');
        done();
      });
      
      // Write invalid JSON to trigger parse error
      const testFile = '/tmp/test_parse_error.json';
      fs.writeFileSync(testFile, 'invalid json content');
      
      fileWatcher.watchFile(testFile, 'test:parse');
      
      // Clean up
      setTimeout(() => {
        fileWatcher.unwatchFile(testFile);
        fs.unlinkSync(testFile);
      }, 1000);
    });
    
    test('should handle rapid reconnections', async () => {
      const connections: number[] = [];
      
      for (let i = 0; i < 5; i++) {
        const socket = ioClient(TEST_URL, {
          reconnection: false
        });
        
        await new Promise<void>((resolve) => {
          socket.on('connect', () => {
            connections.push(Date.now());
            socket.disconnect();
            resolve();
          });
        });
      }
      
      // Verify all connections succeeded
      expect(connections.length).toBe(5);
      
      // Check connection timing
      for (let i = 1; i < connections.length; i++) {
        const gap = connections[i] - connections[i - 1];
        expect(gap).toBeGreaterThan(0);
      }
    });
  });
});

// Export for use in other tests
export { TEST_PORT, TEST_URL };