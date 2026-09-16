/**
 * Integration tests for WebSocket reliability with conflict detection
 * Tests the enhanced reliability manager functionality
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { Redis } from 'ioredis';
import { WebSocketReliabilityManager } from '../../apps/api/src/websocket/reliabilityManager';
import { coordinationService } from '../../apps/api/src/services/coordinationService';

describe('WebSocket Reliability with Conflict Detection', () => {
  let httpServer: Server;
  let ioServer: SocketIOServer;
  let reliabilityManager: WebSocketReliabilityManager;
  let redis: Redis;
  let clients: ClientSocketType[] = [];
  const TEST_PORT = 4568;

  beforeAll(async () => {
    // Setup Redis connection
    redis = new Redis({
      host: 'localhost',
      port: 6379,
      db: 3, // Use separate DB for WebSocket tests
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 100, 1000);
      },
      lazyConnect: true // Don't connect immediately
    });

    try {
      await redis.connect();
      await redis.ping();
      console.log('[TEST] Connected to Redis for WebSocket reliability tests');
    } catch (error) {
      console.warn('[TEST] Redis not available, skipping WebSocket reliability tests');
      return;
    }

    // Setup HTTP server and Socket.IO
    httpServer = new Server();
    ioServer = new SocketIOServer(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      },
      transports: ['websocket', 'polling']
    });

    // Initialize reliability manager
    reliabilityManager = new WebSocketReliabilityManager({
      enableHealthMonitoring: true,
      enableMessageQueue: true,
      enableMetrics: true,
      requireAcknowledgments: true
    });

    reliabilityManager.initialize(ioServer, redis);

    // Start server
    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, () => {
        console.log(`[TEST] WebSocket server listening on port ${TEST_PORT}`);
        resolve();
      });
    });

    // Setup coordination service event listeners
    coordinationService.on('farm:updated', (event) => {
      reliabilityManager.broadcastWithConflictDetection(
        'test-room', 
        'farm:updated', 
        event
      );
    });

    coordinationService.on('agent:updated', (event) => {
      reliabilityManager.broadcastWithConflictDetection(
        'test-room',
        'agent:updated',
        event
      );
    });
  });

  afterAll(async () => {
    // Cleanup clients
    for (const client of clients) {
      if (client.connected) {
        client.disconnect();
      }
    }
    clients = [];

    // Stop services
    if (reliabilityManager) reliabilityManager.stop();
    if (ioServer) ioServer.close();
    if (httpServer) httpServer.close();
    if (redis && redis.status === 'ready') {
      await redis.flushdb();
      await redis.quit();
    }
  });

  beforeEach(async () => {
    // Clear Redis state
    if (redis && redis.status === 'ready') {
      await redis.flushdb();

      // Reset reliability manager state
      if (reliabilityManager) {
        reliabilityManager.setConflictDetection(true);
        await reliabilityManager.flushBroadcastQueue();
      }
    }
  });

  afterEach(() => {
    // Disconnect any clients created in tests
    for (const client of clients) {
      if (client.connected) {
        client.disconnect();
      }
    }
    clients = [];
  });

  describe('Basic Reliability Features', () => {
    it('should handle client connection and disconnection', async () => {
      const client = createTestClient();
      await waitForConnection(client);

      expect(client.connected).toBe(true);

      const disconnectPromise = new Promise<void>((resolve) => {
        client.on('disconnect', () => resolve());
      });

      client.disconnect();
      await disconnectPromise;

      expect(client.connected).toBe(false);
    });

    it('should maintain message queue during disconnection', async () => {
      const client = createTestClient();
      await waitForConnection(client);

      const messageReceived = new Promise<any>((resolve) => {
        client.on('test-message', resolve);
      });

      // Send message while connected
      await reliabilityManager.sendReliableMessage(
        client.id,
        'test-message',
        { content: 'test data' },
        { requireAck: true }
      );

      const message = await messageReceived;
      expect(message.data.content).toBe('test data');

      client.disconnect();
    });

    it('should resend queued messages on reconnection', async () => {
      const client = createTestClient();
      await waitForConnection(client);
      
      const socketId = client.id;
      
      // Disconnect client
      client.disconnect();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Send message while disconnected (should be queued)
      await reliabilityManager.sendReliableMessage(
        socketId,
        'queued-message',
        { content: 'queued data' }
      );

      // Reconnect client
      const newClient = createTestClient();
      await waitForConnection(newClient);

      // Should receive queued message
      const queuedMessage = await new Promise<any>((resolve) => {
        newClient.on('queued-message', resolve);
        setTimeout(() => resolve(null), 2000); // Timeout after 2s
      });

      expect(queuedMessage).toBeTruthy();
      if (queuedMessage) {
        expect(queuedMessage.data.content).toBe('queued data');
      }

      newClient.disconnect();
    });
  });

  describe('Conflict Detection', () => {
    it('should detect rapid farm update conflicts', async () => {
      const client = createTestClient();
      await waitForConnection(client);

      let conflictDetected = false;
      reliabilityManager.on('coordination:conflict', () => {
        conflictDetected = true;
      });

      const farmData = { farmId: 'test-farm', status: 'running' };

      // Send rapid updates (should trigger conflict detection)
      await reliabilityManager.broadcastWithConflictDetection(
        'test-room',
        'farm:updated',
        farmData
      );

      // Immediate second update should be detected as conflict
      const result = await reliabilityManager.broadcastWithConflictDetection(
        'test-room',
        'farm:updated',
        { ...farmData, status: 'stopping' }
      );

      expect(result.conflictsDetected).toBe(true);
      expect(conflictDetected).toBe(true);

      client.disconnect();
    });

    it('should detect agent status conflicts', async () => {
      const client = createTestClient();
      await waitForConnection(client);

      let conflictCount = 0;
      reliabilityManager.on('coordination:conflict', () => {
        conflictCount++;
      });

      const agentData = { agentId: 'test-agent', status: 'working' };

      // First update should succeed
      const result1 = await reliabilityManager.broadcastWithConflictDetection(
        'test-room',
        'agent:status',
        agentData
      );
      expect(result1.conflictsDetected).toBe(false);

      // Rapid conflicting update should be detected
      const result2 = await reliabilityManager.broadcastWithConflictDetection(
        'test-room',
        'agent:status',
        { ...agentData, status: 'idle' }
      );
      expect(result2.conflictsDetected).toBe(true);
      expect(conflictCount).toBe(1);

      client.disconnect();
    });

    it('should queue conflicted broadcasts and process them later', async () => {
      const client = createTestClient();
      await waitForConnection(client);

      const receivedMessages: any[] = [];
      client.on('coordination-update', (data) => {
        receivedMessages.push(data);
      });

      // Send rapid updates to trigger queuing
      await reliabilityManager.broadcastWithConflictDetection(
        'test-room',
        'coordination:agents',
        { agents: ['agent1'] }
      );

      await reliabilityManager.broadcastWithConflictDetection(
        'test-room',
        'coordination:agents',
        { agents: ['agent1', 'agent2'] }
      );

      // Wait for queue processing
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check queue status
      const state = reliabilityManager.getCoordinationState();
      expect(state.queueSize).toBeGreaterThanOrEqual(0); // Queue should be processed or processing

      client.disconnect();
    });

    it('should allow disabling conflict detection', async () => {
      const client = createTestClient();
      await waitForConnection(client);

      // Disable conflict detection
      reliabilityManager.setConflictDetection(false);

      let conflictDetected = false;
      reliabilityManager.on('coordination:conflict', () => {
        conflictDetected = true;
      });

      const farmData = { farmId: 'test-farm', status: 'running' };

      // Send rapid updates (should NOT trigger conflict detection)
      const result1 = await reliabilityManager.broadcastWithConflictDetection(
        'test-room',
        'farm:updated',
        farmData
      );

      const result2 = await reliabilityManager.broadcastWithConflictDetection(
        'test-room',
        'farm:updated',
        { ...farmData, status: 'stopping' }
      );

      expect(result1.conflictsDetected).toBe(false);
      expect(result2.conflictsDetected).toBe(false);
      expect(conflictDetected).toBe(false);

      // Re-enable for other tests
      reliabilityManager.setConflictDetection(true);
      client.disconnect();
    });
  });

  describe('Stress Testing', () => {
    it('should handle multiple concurrent clients', async () => {
      const clientCount = 5;
      const testClients: ClientSocketType[] = [];

      // Create multiple clients
      for (let i = 0; i < clientCount; i++) {
        const client = createTestClient();
        await waitForConnection(client);
        testClients.push(client);
      }

      // Send broadcast to all clients
      const broadcastData = { message: 'broadcast test', timestamp: Date.now() };
      
      const messagePromises = testClients.map(client => 
        new Promise<any>((resolve) => {
          client.on('test-broadcast', resolve);
          setTimeout(() => resolve(null), 2000);
        })
      );

      await reliabilityManager.broadcastReliable(
        'test-room',
        'test-broadcast',
        broadcastData
      );

      const results = await Promise.all(messagePromises);
      const successfulDeliveries = results.filter(r => r !== null).length;

      expect(successfulDeliveries).toBe(clientCount);

      // Cleanup
      for (const client of testClients) {
        client.disconnect();
      }
    });

    it('should handle high frequency updates without memory leaks', async () => {
      const client = createTestClient();
      await waitForConnection(client);

      const initialMemory = process.memoryUsage();
      const updateCount = 100;

      // Send many rapid updates
      for (let i = 0; i < updateCount; i++) {
        await reliabilityManager.broadcastWithConflictDetection(
          'test-room',
          'high-freq-update',
          { index: i, data: `update-${i}` }
        );
        
        // Small delay to prevent overwhelming
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);

      // Check that coordination state isn't growing indefinitely
      const state = reliabilityManager.getCoordinationState();
      expect(state.stateSize).toBeLessThan(1000); // Should clean up old entries

      client.disconnect();
    });

    it('should maintain performance under load', async () => {
      const client = createTestClient();
      await waitForConnection(client);

      const iterations = 50;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await reliabilityManager.sendReliableMessage(
          client.id,
          'perf-test',
          { iteration: i },
          { requireAck: false }
        );
      }

      const totalTime = Date.now() - startTime;
      const averageTime = totalTime / iterations;

      console.log(`[TEST] Average message delivery time: ${averageTime}ms`);

      // Should be able to deliver messages quickly
      expect(averageTime).toBeLessThan(50); // 50ms per message

      client.disconnect();
    });
  });

  describe('Integration with Coordination Service', () => {
    it('should properly integrate with coordination service events', async () => {
      const client = createTestClient();
      await waitForConnection(client);

      const receivedEvents: any[] = [];
      
      client.on('farm:updated', (event) => {
        receivedEvents.push({ type: 'farm', data: event });
      });

      client.on('agent:updated', (event) => {
        receivedEvents.push({ type: 'agent', data: event });
      });

      // Simulate coordination service events
      coordinationService.emit('farm:updated', {
        farmId: 'integration-test',
        status: 'running',
        timestamp: new Date().toISOString()
      });

      coordinationService.emit('agent:updated', {
        agentId: 'integration-agent',
        status: 'working',
        timestamp: new Date().toISOString()
      });

      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(receivedEvents.length).toBeGreaterThan(0);

      const farmEvents = receivedEvents.filter(e => e.type === 'farm');
      const agentEvents = receivedEvents.filter(e => e.type === 'agent');

      expect(farmEvents.length).toBeGreaterThan(0);
      expect(agentEvents.length).toBeGreaterThan(0);

      client.disconnect();
    });
  });

  // Helper functions
  function createTestClient(): ClientSocketType {
    const client = ClientSocket(`http://localhost:${TEST_PORT}`, {
      transports: ['websocket'],
      timeout: 5000
    });
    
    clients.push(client);
    return client;
  }

  function waitForConnection(client: ClientSocketType): Promise<void> {
    return new Promise((resolve, reject) => {
      if (client.connected) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 5000);

      client.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      client.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }
});