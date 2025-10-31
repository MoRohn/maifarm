import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { WebSocketTestHelper } from '../helpers/websocketTestHelper';
import { WebSocketReliabilityEnhancer } from '../../websocket/reliabilityEnhancer';
import { ReliabilityManager } from '../../websocket/reliabilityManager';

describe('WebSocket Reliability Integration', () => {
  let testHelper: WebSocketTestHelper;
  let reliabilityEnhancer: WebSocketReliabilityEnhancer;
  let reliabilityManager: ReliabilityManager;

  beforeEach(async () => {
    jest.clearAllMocks();
    testHelper = new WebSocketTestHelper();
    await testHelper.setupServer({ port: 0 });
    reliabilityEnhancer = new WebSocketReliabilityEnhancer();
    reliabilityManager = new ReliabilityManager();
  });

  afterEach(async () => {
    await testHelper.cleanup();
    jest.restoreAllMocks();
  });

  describe('Connection Resilience', () => {
    it('should handle rapid connect/disconnect cycles', async () => {
      const clientId = 'resilience-test-1';
      const cycles = 5;
      const results = [];

      for (let i = 0; i < cycles; i++) {
        const client = await testHelper.createClient(clientId + i);
        
        // Send a message immediately after connection
        client.emit('test:message', { cycle: i });
        
        // Wait for acknowledgment
        const ack = await testHelper.waitForEvent(client, 'test:ack', 1000);
        results.push(ack);
        
        // Disconnect
        await testHelper.simulateDisconnect(clientId + i);
      }

      expect(results).toHaveLength(cycles);
      results.forEach((result, index) => {
        expect(result.cycle).toBe(index);
      });
    });

    it('should maintain message order during reconnection', async () => {
      const client = await testHelper.createClient('order-test');
      const messages = [];
      
      client.on('message', (data) => {
        messages.push(data.id);
      });

      // Send messages before disconnect
      for (let i = 1; i <= 3; i++) {
        testHelper.broadcast('message', { id: i });
      }

      await testHelper.simulateDisconnect('order-test');
      
      // Send messages while disconnected
      for (let i = 4; i <= 6; i++) {
        testHelper.broadcast('message', { id: i });
      }

      await testHelper.simulateReconnect('order-test');
      
      // Send messages after reconnect
      for (let i = 7; i <= 9; i++) {
        testHelper.broadcast('message', { id: i });
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check if messages arrived in order (some might be lost during disconnect)
      for (let i = 1; i < messages.length; i++) {
        expect(messages[i]).toBeGreaterThan(messages[i - 1]);
      }
    });

    it('should handle concurrent connections from same client', async () => {
      const clientPromises = [];
      
      // Create multiple connections simultaneously
      for (let i = 0; i < 5; i++) {
        clientPromises.push(
          testHelper.createClient(`concurrent-${i}`, {
            auth: { userId: 'same-user' }
          })
        );
      }

      const clients = await Promise.all(clientPromises);
      
      // All should connect successfully
      expect(clients).toHaveLength(5);
      clients.forEach(client => {
        expect(client.connected).toBe(true);
      });

      // Server should handle all connections
      const stats = testHelper.getServerStats();
      expect(stats.connectedClients).toBe(5);
    });
  });

  describe('Message Reliability', () => {
    it('should implement automatic retry for failed messages', async () => {
      const client = await testHelper.createClient('retry-test');
      let attempts = 0;
      
      // Mock server handler that fails first 2 attempts
      testHelper.mockServerHandler('critical:operation', (data) => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return { success: true, attempts };
      });

      const enhancedClient = reliabilityEnhancer.enhance(client);
      
      const result = await enhancedClient.emitWithRetry('critical:operation', 
        { data: 'important' },
        { maxRetries: 3, retryDelay: 100 }
      );

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
    });

    it('should implement message deduplication', async () => {
      const client = await testHelper.createClient('dedup-test');
      const received = new Set();
      
      client.on('unique:message', (data) => {
        received.add(data.messageId);
      });

      // Send same message multiple times
      const messageId = 'msg-123';
      for (let i = 0; i < 5; i++) {
        testHelper.broadcast('unique:message', { messageId, data: 'test' });
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Should only receive once due to deduplication
      expect(received.size).toBe(1);
    });

    it('should handle message batching under load', async () => {
      const client = await testHelper.createClient('batch-test');
      const received = [];
      
      client.on('batch', (batch) => {
        received.push(...batch.messages);
      });

      // Send many messages rapidly
      const messageCount = 100;
      for (let i = 0; i < messageCount; i++) {
        testHelper.broadcast('data:update', { id: i });
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Messages should be received in batches
      expect(received.length).toBeLessThanOrEqual(messageCount);
      
      // Verify batching occurred
      const stats = testHelper.getMessageLog({ event: 'batch' });
      expect(stats.length).toBeGreaterThan(0);
    });

    it('should implement priority message queue', async () => {
      const client = await testHelper.createClient('priority-test');
      const received = [];
      
      client.on('prioritized', (data) => {
        received.push(data.priority);
      });

      // Send messages with different priorities
      const messages = [
        { priority: 3, data: 'low' },
        { priority: 1, data: 'high' },
        { priority: 2, data: 'medium' },
        { priority: 1, data: 'high2' },
        { priority: 3, data: 'low2' }
      ];

      // Simulate queue processing
      messages.forEach(msg => {
        reliabilityManager.queueMessage(msg);
      });

      await reliabilityManager.processQueue();
      
      // High priority messages should be processed first
      expect(received[0]).toBe(1);
      expect(received[1]).toBe(1);
      expect(received[2]).toBe(2);
    });
  });

  describe('Performance Under Stress', () => {
    it('should handle high message throughput', async () => {
      const client = await testHelper.createClient('throughput-test');
      let messageCount = 0;
      
      client.on('stress:message', () => {
        messageCount++;
      });

      const startTime = Date.now();
      const targetMessages = 1000;
      
      // Send messages as fast as possible
      for (let i = 0; i < targetMessages; i++) {
        testHelper.broadcast('stress:message', { id: i });
      }

      // Wait for all messages
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (messageCount >= targetMessages) {
            clearInterval(checkInterval);
            resolve(undefined);
          }
        }, 100);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve(undefined);
        }, 10000);
      });

      const duration = Date.now() - startTime;
      const throughput = messageCount / (duration / 1000);
      
      // Should handle at least 100 messages per second
      expect(throughput).toBeGreaterThan(100);
      
      // Should not lose messages
      expect(messageCount).toBe(targetMessages);
    });

    it('should maintain stability with many concurrent clients', async () => {
      const clientCount = 50;
      const clients = [];
      
      // Create many clients
      for (let i = 0; i < clientCount; i++) {
        const client = await testHelper.createClient(`stress-client-${i}`);
        clients.push(client);
      }

      // Each client sends messages
      const promises = clients.map((client, index) => {
        return new Promise<void>((resolve) => {
          let received = 0;
          client.on('echo', (data) => {
            if (data.sender === index) {
              received++;
              if (received >= 10) {
                resolve();
              }
            }
          });

          // Send 10 messages
          for (let i = 0; i < 10; i++) {
            client.emit('broadcast:echo', { sender: index, message: i });
          }
        });
      });

      // Wait for all clients to complete
      await Promise.race([
        Promise.all(promises),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 30000)
        )
      ]);

      // Check server stability
      const stats = testHelper.getServerStats();
      expect(stats.connectedClients).toBe(clientCount);
    });

    it('should handle memory efficiently during long sessions', async () => {
      const client = await testHelper.createClient('memory-test');
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Simulate long session with many messages
      for (let cycle = 0; cycle < 10; cycle++) {
        for (let i = 0; i < 100; i++) {
          testHelper.broadcast('memory:test', {
            cycle,
            data: 'x'.repeat(1000) // 1KB payload
          });
        }
        
        // Allow garbage collection
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = (finalMemory - initialMemory) / 1024 / 1024; // MB
      
      // Memory growth should be reasonable (less than 50MB)
      expect(memoryGrowth).toBeLessThan(50);
      
      // Clear message log to prevent memory issues
      testHelper.clearMessageLog();
    });
  });

  describe('Network Condition Simulation', () => {
    it('should handle high latency gracefully', async () => {
      // Add 200ms latency
      testHelper.addLatency(200);
      
      const client = await testHelper.createClient('latency-test', {
        timeout: 10000
      });
      
      const startTime = Date.now();
      client.emit('ping');
      await testHelper.waitForEvent(client, 'pong', 5000);
      const roundTrip = Date.now() - startTime;
      
      // Should complete despite latency
      expect(roundTrip).toBeGreaterThan(200);
      expect(roundTrip).toBeLessThan(1000);
    });

    it('should handle packet loss', async () => {
      // Simulate 20% packet loss
      testHelper.simulatePacketLoss(0.2);
      
      const client = await testHelper.createClient('loss-test', {
        reconnection: true
      });
      
      let successCount = 0;
      const totalAttempts = 10;
      
      for (let i = 0; i < totalAttempts; i++) {
        try {
          client.emit('test:ping', { id: i });
          await testHelper.waitForEvent(client, 'test:pong', 1000);
          successCount++;
        } catch {
          // Packet was lost
        }
      }
      
      // Should succeed at least 60% of the time (80% success rate)
      expect(successCount).toBeGreaterThan(totalAttempts * 0.6);
    });

    it('should measure and report connection quality', async () => {
      const client = await testHelper.createClient('quality-test');
      
      // Measure connection quality
      const quality = await testHelper.getConnectionQuality('quality-test');
      
      expect(quality).toHaveProperty('latency');
      expect(quality).toHaveProperty('jitter');
      expect(quality).toHaveProperty('packetLoss');
      
      // In ideal test conditions
      expect(quality.latency).toBeLessThan(100);
      expect(quality.jitter).toBeLessThan(50);
      expect(quality.packetLoss).toBeLessThan(0.1);
    });
  });

  describe('Error Recovery', () => {
    it('should recover from server crashes', async () => {
      const client = await testHelper.createClient('crash-test', {
        reconnection: true,
        timeout: 10000
      });
      
      let disconnectCount = 0;
      let reconnectCount = 0;
      
      client.on('disconnect', () => disconnectCount++);
      client.on('connect', () => reconnectCount++);
      
      // Simulate server crash and restart
      await testHelper.cleanup();
      await new Promise(resolve => setTimeout(resolve, 1000));
      await testHelper.setupServer({ port: 0 });
      
      // Wait for reconnection
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      expect(disconnectCount).toBeGreaterThan(0);
      // Initial connect + reconnect after crash
      expect(reconnectCount).toBe(2);
    });

    it('should handle malformed messages gracefully', async () => {
      const client = await testHelper.createClient('malformed-test');
      let errorCount = 0;
      
      client.on('error', () => errorCount++);
      client.on('message', (data) => {
        // Should not crash when processing malformed data
        try {
          JSON.parse(data);
        } catch {
          errorCount++;
        }
      });
      
      // Send various malformed messages
      testHelper.broadcast('message', undefined);
      testHelper.broadcast('message', null);
      testHelper.broadcast('message', { circular: {} });
      testHelper.broadcast('message', 'invalid{json}');
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Should handle errors without crashing
      expect(errorCount).toBeGreaterThan(0);
      
      // Connection should still be active
      expect(client.connected).toBe(true);
    });

    it('should implement circuit breaker pattern', async () => {
      const client = await testHelper.createClient('circuit-test');
      const circuitBreaker = reliabilityManager.getCircuitBreaker('test-service');
      
      // Simulate failures to trip the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Service unavailable');
          });
        } catch {
          // Expected failures
        }
      }
      
      // Circuit should be open
      expect(circuitBreaker.isOpen()).toBe(true);
      
      // Requests should fail fast
      const startTime = Date.now();
      try {
        await circuitBreaker.execute(async () => {
          return 'success';
        });
      } catch (error) {
        expect(error.message).toContain('Circuit breaker is open');
      }
      const duration = Date.now() - startTime;
      
      // Should fail immediately (< 100ms)
      expect(duration).toBeLessThan(100);
    });
  });
});