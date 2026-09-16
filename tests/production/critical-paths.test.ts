/**
 * Critical Path Tests for Production
 * Tests the most important user flows and failure scenarios
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { Server } from 'http';
import { Socket as ClientSocket, io } from 'socket.io-client';
import { createTestApp } from '../test-helpers';
import { db } from '../../apps/api/src/database/connection';
import { redis } from '../../apps/api/src/services/redis';
import { circuitBreakerManager } from '../../apps/api/src/services/circuitBreaker';
import { errorRecoveryService } from '../../apps/api/src/services/errorRecoveryService';
import { productionHealthCheck } from '../../apps/api/src/services/productionHealthCheck';
import { performanceOptimizer } from '../../apps/api/src/services/performanceOptimizer';

describe('Production Critical Paths', () => {
  let server: Server;
  let serverUrl: string;
  let client: ClientSocket;

  beforeAll(async () => {
    // Set up test server
    const app = await createTestApp();
    server = app.listen(0);
    const address = server.address();
    serverUrl = `http://localhost:${address.port}`;

    // Initialize Redis
    await redis.initialize();
  });

  afterAll(async () => {
    if (client) client.disconnect();
    if (server) server.close();
    await db.end();
    await redis.cleanup();
  });

  beforeEach(() => {
    // Reset circuit breakers before each test
    circuitBreakerManager.resetAll();
  });

  describe('Farm Launch Critical Path', () => {
    it('should successfully launch a farm with multiple agents', async () => {
      const response = await fetch(`${serverUrl}/api/farms/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Farm',
          description: 'Production test farm',
          numberOfAgents: 3,
          prompt: 'Test prompt',
          mode: 'quick-task'
        })
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.farmId).toBeDefined();
      expect(data.status).toBe('launching');

      // Wait for farm to become active
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify farm status
      const statusResponse = await fetch(`${serverUrl}/api/farms/${data.farmId}`);
      const statusData = await statusResponse.json();
      expect(['active', 'running']).toContain(statusData.status);
    });

    it('should handle farm launch failures gracefully', async () => {
      // Simulate a failure by providing invalid configuration
      const response = await fetch(`${serverUrl}/api/farms/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Farm',
          numberOfAgents: -1, // Invalid
          prompt: 'Test prompt'
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it('should enforce timeout limits', async () => {
      jest.setTimeout(320000); // 5+ minutes for this test

      const response = await fetch(`${serverUrl}/api/farms/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Timeout Test Farm',
          numberOfAgents: 1,
          prompt: 'Sleep for 10 minutes',
          mode: 'quick-task' // 5 minute timeout
        })
      });

      const data = await response.json();
      const farmId = data.farmId;

      // Wait for timeout (5 minutes + grace period)
      await new Promise(resolve => setTimeout(resolve, 310000));

      // Check that farm was terminated
      const statusResponse = await fetch(`${serverUrl}/api/farms/${farmId}`);
      const statusData = await statusResponse.json();
      expect(['completed', 'timeout', 'failed']).toContain(statusData.status);
    });
  });

  describe('WebSocket Connection Resilience', () => {
    beforeEach(() => {
      client = io(serverUrl, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 100,
        reconnectionAttempts: 5
      });
    });

    afterEach(() => {
      if (client) client.disconnect();
    });

    it('should handle WebSocket reconnection', async () => {
      const connectPromise = new Promise(resolve => {
        client.on('connect', resolve);
      });

      await connectPromise;
      expect(client.connected).toBe(true);

      // Simulate disconnection
      client.disconnect();
      expect(client.connected).toBe(false);

      // Reconnect
      client.connect();
      const reconnectPromise = new Promise(resolve => {
        client.on('connect', resolve);
      });

      await reconnectPromise;
      expect(client.connected).toBe(true);
    });

    it('should maintain terminal subscriptions across reconnection', async () => {
      await new Promise(resolve => client.on('connect', resolve));

      const sessionId = 'test-session-123';
      const receivedOutputs: any[] = [];

      // Subscribe to terminal
      client.emit('terminal:join', { sessionId });

      // Listen for outputs
      client.on('terminal:output', (data) => {
        receivedOutputs.push(data);
      });

      // Simulate disconnection and reconnection
      client.disconnect();
      await new Promise(resolve => setTimeout(resolve, 500));
      client.connect();

      await new Promise(resolve => client.on('connect', resolve));

      // Re-subscribe
      client.emit('terminal:join', { sessionId });

      // Emit test output
      client.emit('test:terminal:output', {
        sessionId,
        output: 'Test output after reconnection'
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Should have received cached outputs
      expect(receivedOutputs.length).toBeGreaterThan(0);
    });

    it('should handle rapid connect/disconnect cycles', async () => {
      const cycles = 10;
      const errors: any[] = [];

      client.on('error', (error) => {
        errors.push(error);
      });

      for (let i = 0; i < cycles; i++) {
        client.connect();
        await new Promise(resolve => setTimeout(resolve, 50));
        client.disconnect();
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Should handle cycles without errors
      expect(errors.length).toBe(0);
    });
  });

  describe('Circuit Breaker Functionality', () => {
    it('should open circuit after threshold failures', async () => {
      const breaker = circuitBreakerManager.getBreaker({
        name: 'test-breaker',
        failureThreshold: 3,
        resetTimeout: 1000
      });

      const failingFunction = async () => {
        throw new Error('Service unavailable');
      };

      // Trigger failures
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingFunction);
        } catch (error) {
          // Expected to fail
        }
      }

      // Circuit should be open now
      const metrics = breaker.getMetrics();
      expect(metrics.state).toBe('open');

      // Further calls should be rejected immediately
      await expect(breaker.execute(failingFunction)).rejects.toThrow('Circuit breaker test-breaker is OPEN');
    });

    it('should recover to closed state after successful calls', async () => {
      const breaker = circuitBreakerManager.getBreaker({
        name: 'recovery-breaker',
        failureThreshold: 2,
        resetTimeout: 500,
        successThreshold: 2
      });

      let shouldFail = true;
      const testFunction = async () => {
        if (shouldFail) throw new Error('Failure');
        return 'Success';
      };

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(testFunction);
        } catch (error) {
          // Expected
        }
      }

      expect(breaker.getMetrics().state).toBe('open');

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 600));

      // Now allow success
      shouldFail = false;

      // Circuit should be half-open, needs successful calls to close
      for (let i = 0; i < 2; i++) {
        await breaker.execute(testFunction);
      }

      expect(breaker.getMetrics().state).toBe('closed');
    });
  });

  describe('Error Recovery Service', () => {
    it('should retry database connection errors', async () => {
      let attempts = 0;
      const mockDbQuery = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Connection refused');
        }
        return Promise.resolve({ rows: [] });
      });

      // Replace db.query temporarily
      const originalQuery = db.query;
      db.query = mockDbQuery;

      try {
        const recovered = await errorRecoveryService.handleError(
          new Error('Connection refused'),
          'database'
        );

        expect(recovered).toBe(true);
        expect(attempts).toBe(3);
      } finally {
        db.query = originalQuery;
      }
    });

    it('should escalate critical errors', async () => {
      const escalationPromise = new Promise(resolve => {
        errorRecoveryService.once('error-escalated', resolve);
      });

      await errorRecoveryService.handleError(
        new Error('Out of memory'),
        'system'
      );

      const escalation = await escalationPromise;
      expect(escalation).toBeDefined();
      expect(escalation.service).toBe('system');
    });
  });

  describe('Health Check System', () => {
    it('should detect unhealthy services', async () => {
      // Force a service to be unhealthy
      const originalQuery = db.query;
      db.query = jest.fn().mockRejectedValue(new Error('Database unavailable'));

      try {
        const report = await productionHealthCheck.forceCheck();

        expect(report.status).not.toBe('healthy');
        expect(report.services.database).not.toBe('healthy');
      } finally {
        db.query = originalQuery;
      }
    });

    it('should trigger alerts on critical status', async () => {
      const alertPromise = new Promise(resolve => {
        productionHealthCheck.once('critical-alert', resolve);
      });

      // Simulate critical conditions
      const report = {
        status: 'critical' as any,
        system: {
          cpu: 95,
          memory: { percentage: 96 },
          disk: { percentage: 98 }
        }
      };

      productionHealthCheck.emit('health-update', report);

      const alert = await alertPromise;
      expect(alert).toBeDefined();
      expect(alert.severity).toBe('critical');
    });
  });

  describe('Performance Optimization', () => {
    it('should cache frequently accessed data', async () => {
      const cache = performanceOptimizer.getCache('test-cache', {
        ttl: 1000,
        maxSize: 100
      });

      // Set value
      await cache.set('key1', { data: 'test' });

      // Get value (should be from cache)
      const value = await cache.get('key1');
      expect(value).toEqual({ data: 'test' });

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Value should be expired
      const expiredValue = await cache.get('key1');
      expect(expiredValue).toBeUndefined();
    });

    it('should batch database operations', async () => {
      const processedBatches: any[] = [];

      const batcher = performanceOptimizer.getBatcher('test-batcher', {
        maxSize: 5,
        maxWait: 100,
        processor: async (items) => {
          processedBatches.push(items);
        }
      });

      // Add items
      for (let i = 0; i < 8; i++) {
        batcher.add({ id: i });
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should have processed in batches
      expect(processedBatches.length).toBe(2);
      expect(processedBatches[0].length).toBe(5);
      expect(processedBatches[1].length).toBe(3);
    });

    it('should manage resource pools efficiently', async () => {
      let resourceId = 0;
      const pool = performanceOptimizer.getPool('test-pool', {
        min: 2,
        max: 5,
        create: async () => ({ id: ++resourceId }),
        destroy: async () => {},
        validate: async () => true
      });

      // Acquire resources
      const resources = [];
      for (let i = 0; i < 3; i++) {
        resources.push(await pool.acquire());
      }

      const stats = pool.getStats();
      expect(stats.inUse).toBe(3);

      // Release resources
      for (const resource of resources) {
        await pool.release(resource);
      }

      const finalStats = pool.getStats();
      expect(finalStats.available).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Graceful Shutdown', () => {
    it('should complete harvest collection before shutdown', async () => {
      // Launch a farm
      const launchResponse = await fetch(`${serverUrl}/api/farms/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Shutdown Test Farm',
          numberOfAgents: 2,
          prompt: 'Create test files',
          mode: 'quick-task'
        })
      });

      const { farmId } = await launchResponse.json();

      // Wait for farm to be active
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Trigger shutdown
      const shutdownResponse = await fetch(`${serverUrl}/api/farms/${farmId}/shutdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'user_request' })
      });

      expect(shutdownResponse.ok).toBe(true);

      // Wait for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 35000)); // 30s grace + buffer

      // Verify harvest was collected
      const harvestResponse = await fetch(`${serverUrl}/api/farms/${farmId}/harvest`);
      const harvestData = await harvestResponse.json();

      expect(harvestData).toBeDefined();
      expect(harvestData.status).toMatch(/collected|completed/);
    });
  });

  describe('Load Testing', () => {
    it('should handle 10 concurrent farms', async () => {
      jest.setTimeout(120000); // 2 minutes for load test

      const farmPromises = [];

      for (let i = 0; i < 10; i++) {
        const promise = fetch(`${serverUrl}/api/farms/launch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `Load Test Farm ${i}`,
            numberOfAgents: 2,
            prompt: 'Echo test',
            mode: 'quick-task'
          })
        });
        farmPromises.push(promise);
      }

      const responses = await Promise.all(farmPromises);
      const successCount = responses.filter(r => r.ok).length;

      // At least 8 out of 10 should succeed under load
      expect(successCount).toBeGreaterThanOrEqual(8);

      // Check system health after load
      const healthResponse = await fetch(`${serverUrl}/api/health`);
      const health = await healthResponse.json();
      expect(['healthy', 'degraded']).toContain(health.status);
    });

    it('should handle 100 WebSocket connections', async () => {
      const clients: ClientSocket[] = [];
      const connectionPromises = [];

      for (let i = 0; i < 100; i++) {
        const client = io(serverUrl, {
          transports: ['websocket'],
          reconnection: false
        });

        clients.push(client);

        const promise = new Promise((resolve, reject) => {
          client.on('connect', resolve);
          client.on('connect_error', reject);
          setTimeout(() => reject(new Error('Connection timeout')), 5000);
        });

        connectionPromises.push(promise);
      }

      const results = await Promise.allSettled(connectionPromises);
      const connectedCount = results.filter(r => r.status === 'fulfilled').length;

      // At least 90% should connect successfully
      expect(connectedCount).toBeGreaterThanOrEqual(90);

      // Cleanup
      clients.forEach(c => c.disconnect());
    });
  });
});

describe('Production Memory Leak Tests', () => {
  it('should not leak memory on repeated farm launches', async () => {
    jest.setTimeout(300000); // 5 minutes

    const initialMemory = process.memoryUsage().heapUsed;
    const iterations = 20;

    for (let i = 0; i < iterations; i++) {
      // Launch and complete a farm
      const response = await fetch(`${serverUrl}/api/farms/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Memory Test Farm ${i}`,
          numberOfAgents: 1,
          prompt: 'Quick test',
          mode: 'quick-task'
        })
      });

      const { farmId } = await response.json();

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Clean up
      await fetch(`${serverUrl}/api/farms/${farmId}/cleanup`, {
        method: 'POST'
      });

      // Force GC if available
      if (global.gc) {
        global.gc();
      }
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryGrowth = finalMemory - initialMemory;
    const averageGrowthPerIteration = memoryGrowth / iterations;

    // Average growth per iteration should be less than 10MB
    expect(averageGrowthPerIteration).toBeLessThan(10 * 1024 * 1024);
  });

  it('should clean up terminal watchers properly', async () => {
    const { terminalOutputWatcher } = await import('../../apps/api/src/services/unified/terminalService');

    const initialWatcherCount = terminalOutputWatcher.getWatchedSessions().length;

    // Start watching multiple sessions
    for (let i = 0; i < 10; i++) {
      await terminalOutputWatcher.startWatching(`test-session-${i}`, undefined, 3);
    }

    expect(terminalOutputWatcher.getWatchedSessions().length).toBe(initialWatcherCount + 10);

    // Stop watching all sessions
    for (let i = 0; i < 10; i++) {
      terminalOutputWatcher.stopWatching(`test-session-${i}`);
    }

    expect(terminalOutputWatcher.getWatchedSessions().length).toBe(initialWatcherCount);
  });
});