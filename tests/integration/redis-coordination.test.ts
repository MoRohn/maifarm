/**
 * Integration tests for Redis-based coordination system
 * Tests the new atomic architecture end-to-end
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { Redis } from 'ioredis';
import { RedisCoordinationStore } from '../../apps/api/src/services/unified/stateCoordinator';
import { SessionController } from '../../apps/api/src/services/sessionController';
import { AtomicCoordinator } from '../../apps/api/src/services/atomicCoordinator';
import { multiClaudeServiceV2 } from '../../apps/api/src/services/multiClaudeServiceV2';

describe('Redis Coordination System Integration Tests', () => {
  let redis: Redis;
  let store: RedisCoordinationStore;
  let sessionController: SessionController;
  let coordinator: AtomicCoordinator;

  beforeAll(async () => {
    // Connect to test Redis instance
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 1, // Use separate DB for tests
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 100, 1000);
      },
      lazyConnect: true // Don't connect immediately
    });

    try {
      // Wait for Redis connection
      await redis.connect();
      await redis.ping();
      console.log('[TEST] Connected to Redis for testing');

      // Initialize services
      store = new RedisCoordinationStore(redis);
      sessionController = new SessionController(redis);
      coordinator = new AtomicCoordinator(redis);
    } catch (error) {
      console.warn('[TEST] Redis not available, skipping redis-coordination tests');
      return;
    }
  });

  afterAll(async () => {
    if (redis && redis.status === 'ready') {
      // Cleanup all test data
      await redis.flushdb();

      // Destroy services
      if (store) await store.destroy();
      if (sessionController) await sessionController.destroy();
      if (coordinator) await coordinator.destroy();

      await redis.quit();
    }
  });

  beforeEach(async () => {
    // Clear test data before each test
    if (redis && redis.status === 'ready') {
      await redis.flushdb();
    }
  });

  afterEach(async () => {
    // Ensure clean state after each test
    if (redis && redis.status === 'ready') {
      const keys = await redis.keys('maifarm:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
  });

  describe('RedisCoordinationStore', () => {
    it('should create and manage farm state', async () => {
      const farmState = await store.createFarm({
        status: 'launching',
        sessionId: 'test-session',
        agentCount: 3,
        startTime: new Date(),
        lastUpdate: new Date(),
        config: { timeout: 300000 },
        agents: []
      });

      expect(farmState).toBeDefined();
      expect(farmState.id).toBeDefined();
      expect(farmState.agentCount).toBe(3);
      expect(farmState.status).toBe('launching');

      // Verify farm can be retrieved
      const retrievedFarm = await store.getFarmState(farmState.id);
      expect(retrievedFarm).toBeDefined();
      expect(retrievedFarm!.id).toBe(farmState.id);
    });

    it('should create and manage agent states', async () => {
      // First create a farm
      const farm = await store.createFarm({
        status: 'running',
        sessionId: 'test-session',
        agentCount: 2,
        startTime: new Date(),
        lastUpdate: new Date(),
        config: {},
        agents: []
      });

      // Create agents
      const agent1 = await store.createAgent({
        farmId: farm.id,
        sessionId: 'test-session',
        status: 'ready',
        tmuxPane: 'test-session:agents.0',
        startTime: new Date(),
        lastHeartbeat: new Date(),
        metadata: { index: 0 }
      });

      const agent2 = await store.createAgent({
        farmId: farm.id,
        sessionId: 'test-session',
        status: 'ready',
        tmuxPane: 'test-session:agents.1',
        startTime: new Date(),
        lastHeartbeat: new Date(),
        metadata: { index: 1 }
      });

      expect(agent1).toBeDefined();
      expect(agent2).toBeDefined();
      expect(agent1.farmId).toBe(farm.id);
      expect(agent2.farmId).toBe(farm.id);

      // Get all farm agents
      const farmAgents = await store.getFarmAgents(farm.id);
      expect(farmAgents).toHaveLength(2);
      expect(farmAgents.map(a => a.id)).toContain(agent1.id);
      expect(farmAgents.map(a => a.id)).toContain(agent2.id);
    });

    it('should handle work claims with conflict detection', async () => {
      // Create farm and agent
      const farm = await store.createFarm({
        status: 'running',
        sessionId: 'test-session',
        agentCount: 1,
        startTime: new Date(),
        lastUpdate: new Date(),
        config: {},
        agents: []
      });

      const agent = await store.createAgent({
        farmId: farm.id,
        sessionId: 'test-session',
        status: 'ready',
        tmuxPane: 'test-session:agents.0',
        startTime: new Date(),
        lastHeartbeat: new Date(),
        metadata: {}
      });

      // Create work claim
      const claim1 = await store.createWorkClaim({
        agentId: agent.id,
        farmId: farm.id,
        description: 'Test task',
        files: ['file1.ts', 'file2.ts'],
        priority: 'high',
        status: 'claimed'
      });

      expect(claim1).toBeDefined();
      expect(claim1!.agentId).toBe(agent.id);

      // Try to create conflicting claim (should fail)
      const claim2 = await store.createWorkClaim({
        agentId: agent.id,
        farmId: farm.id,
        description: 'Conflicting task',
        files: ['file1.ts'], // Conflict with first claim
        priority: 'medium',
        status: 'claimed'
      });

      expect(claim2).toBeNull(); // Should be rejected due to file conflict
    });

    it('should monitor agent health correctly', async () => {
      const farm = await store.createFarm({
        status: 'running',
        sessionId: 'test-session',
        agentCount: 3,
        startTime: new Date(),
        lastUpdate: new Date(),
        config: {},
        agents: []
      });

      // Create healthy agent
      const healthyAgent = await store.createAgent({
        farmId: farm.id,
        sessionId: 'test-session',
        status: 'ready',
        tmuxPane: 'test-session:agents.0',
        startTime: new Date(),
        lastHeartbeat: new Date(),
        metadata: {}
      });

      // Create stale agent
      const staleDate = new Date(Date.now() - 90000); // 1.5 minutes ago
      const staleAgent = await store.createAgent({
        farmId: farm.id,
        sessionId: 'test-session',
        status: 'working',
        tmuxPane: 'test-session:agents.1',
        startTime: staleDate,
        lastHeartbeat: staleDate,
        metadata: {}
      });

      // Create failed agent
      const failedAgent = await store.createAgent({
        farmId: farm.id,
        sessionId: 'test-session',
        status: 'error',
        tmuxPane: 'test-session:agents.2',
        startTime: new Date(),
        lastHeartbeat: new Date(),
        metadata: {}
      });

      const health = await store.getHealthStatus(farm.id);
      
      expect(health.healthy).toHaveLength(1);
      expect(health.stale).toHaveLength(1);
      expect(health.failed).toHaveLength(1);
      
      expect(health.healthy[0].id).toBe(healthyAgent.id);
      expect(health.stale[0].id).toBe(staleAgent.id);
      expect(health.failed[0].id).toBe(failedAgent.id);
    });
  });

  describe('SessionController', () => {
    it('should create tmux session with proper configuration', async () => {
      const sessionOptions = {
        farmId: 'test-farm-session',
        agentCount: 3,
        config: {
          windowName: 'agents',
          layout: 'tiled' as const,
          mouseSupport: true,
          aggressiveResize: true,
          statusBar: true
        },
        timeout: 30000
      };

      const session = await sessionController.createSession(sessionOptions);
      
      expect(session).toBeDefined();
      expect(session.farmId).toBe('test-farm-session');
      expect(session.agentCount).toBe(3);
      expect(session.status).toBe('active');
      expect(session.panes).toHaveLength(3);

      // Verify session can be retrieved
      const retrievedSession = await sessionController.getSession(session.id);
      expect(retrievedSession).toBeDefined();
      expect(retrievedSession!.id).toBe(session.id);

      // Cleanup
      await sessionController.stopSession(session.id, true);
    });

    it('should prevent duplicate session creation', async () => {
      const sessionOptions = {
        farmId: 'duplicate-test-farm',
        agentCount: 2,
        timeout: 30000
      };

      const session1 = await sessionController.createSession(sessionOptions);
      expect(session1).toBeDefined();

      // Try to create another session for same farm
      await expect(
        sessionController.createSession(sessionOptions)
      ).rejects.toThrow();

      // Cleanup
      await sessionController.stopSession(session1.id, true);
    });

    it('should handle session health monitoring', async () => {
      const session = await sessionController.createSession({
        farmId: 'health-test-farm',
        agentCount: 2,
        timeout: 30000
      });

      const health = await sessionController.getSessionHealth(session.id);
      
      expect(health.session).toBeDefined();
      expect(health.tmuxExists).toBe(true);
      expect(health.paneCount).toBe(2);
      expect(health.issues).toHaveLength(0); // No issues for fresh session

      // Cleanup
      await sessionController.stopSession(session.id, true);
    });
  });

  describe('AtomicCoordinator', () => {
    it('should perform atomic farm launch', async () => {
      const farmRequest = {
        farmId: 'atomic-test-farm',
        prompt: 'Test prompt for atomic launch',
        agentCount: 2,
        config: {
          timeout: 60000,
          maxRetries: 3,
          provider: 'claude' as const,
          workingDirectory: process.cwd()
        },
        metadata: {
          name: 'Atomic Test Farm',
          description: 'Testing atomic operations',
          debug: true
        }
      };

      const result = await coordinator.launchFarm(farmRequest);
      
      expect(result.success).toBe(true);
      expect(result.farmState).toBeDefined();
      expect(result.session).toBeDefined();
      expect(result.agents).toBeDefined();
      expect(result.agents!).toHaveLength(2);

      // Verify farm exists in store
      const farmState = await store.getFarmState(farmRequest.farmId);
      expect(farmState).toBeDefined();
      expect(farmState!.status).toBe('running');

      // Cleanup
      await coordinator.stopFarm(farmRequest.farmId, true);
    });

    it('should handle atomic operation rollback on failure', async () => {
      const invalidRequest = {
        farmId: 'rollback-test-farm',
        prompt: 'Test prompt',
        agentCount: -1, // Invalid agent count should cause failure
        config: {
          timeout: 5000,
          provider: 'claude' as const,
          workingDirectory: '/nonexistent/directory' // Invalid directory
        },
        metadata: {}
      };

      const result = await coordinator.launchFarm(invalidRequest);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      // Verify no orphaned state remains
      const farmState = await store.getFarmState(invalidRequest.farmId);
      expect(farmState).toBeNull();

      // Verify no session was created
      const session = await sessionController.getSessionByFarm(invalidRequest.farmId);
      expect(session).toBeNull();
    });

    it('should handle concurrent farm launch conflicts', async () => {
      const farmId = 'concurrent-test-farm';
      const baseRequest = {
        farmId,
        prompt: 'Concurrent test',
        agentCount: 1,
        config: {
          timeout: 30000,
          provider: 'claude' as const,
          workingDirectory: process.cwd()
        },
        metadata: {}
      };

      // Launch two farms concurrently with same ID
      const [result1, result2] = await Promise.allSettled([
        coordinator.launchFarm(baseRequest),
        coordinator.launchFarm(baseRequest)
      ]);

      // Only one should succeed
      const results = [result1, result2].map(r => 
        r.status === 'fulfilled' ? r.value : null
      ).filter(Boolean);

      const successfulResults = results.filter(r => r.success);
      const failedResults = results.filter(r => !r.success);

      expect(successfulResults).toHaveLength(1);
      expect(failedResults).toHaveLength(1);
      expect(failedResults[0].error).toContain('Another operation is already running');

      // Cleanup successful farm
      if (successfulResults.length > 0) {
        await coordinator.stopFarm(farmId, true);
      }
    });
  });

  describe('End-to-End Integration', () => {
    it('should handle complete farm lifecycle', async () => {
      const farmId = 'e2e-test-farm';
      
      // 1. Launch farm
      const launchResult = await coordinator.launchFarm({
        farmId,
        prompt: 'End-to-end test farm',
        agentCount: 2,
        config: {
          timeout: 60000,
          provider: 'claude',
          workingDirectory: process.cwd()
        },
        metadata: {
          name: 'E2E Test Farm',
          description: 'Complete lifecycle test'
        }
      });

      expect(launchResult.success).toBe(true);

      // 2. Verify farm is running
      const farmState = await store.getFarmState(farmId);
      expect(farmState).toBeDefined();
      expect(farmState!.status).toBe('running');

      // 3. Verify agents are created
      const agents = await store.getFarmAgents(farmId);
      expect(agents).toHaveLength(2);

      // 4. Verify session is active
      const session = await sessionController.getSessionByFarm(farmId);
      expect(session).toBeDefined();
      expect(session!.status).toBe('active');

      // 5. Update agent status (simulate activity)
      for (const agent of agents) {
        await store.updateAgentState(agent.id, {
          status: 'working',
          currentTask: 'Test task',
          lastHeartbeat: new Date()
        });
      }

      // 6. Check health status
      const health = await store.getHealthStatus(farmId);
      expect(health.healthy).toHaveLength(2);

      // 7. Stop farm
      const stopResult = await coordinator.stopFarm(farmId);
      expect(stopResult.success).toBe(true);

      // 8. Verify cleanup
      const finalFarmState = await store.getFarmState(farmId);
      expect(finalFarmState!.status).toBe('stopped');

      const finalSession = await sessionController.getSessionByFarm(farmId);
      expect(finalSession).toBeNull(); // Should be cleaned up
    }, 30000); // 30 second timeout for full lifecycle

    it('should handle Redis connection failures gracefully', async () => {
      // Create a separate Redis instance to test disconnection
      const testRedis = new Redis({
        host: 'localhost',
        port: 6379,
        db: 2,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
          if (times > 1) return null;
          return 100;
        }
      });

      const testStore = new RedisCoordinationStore(testRedis);

      try {
        // First verify normal operation
        const farm = await testStore.createFarm({
          status: 'launching',
          sessionId: 'disconnect-test',
          agentCount: 1,
          startTime: new Date(),
          lastUpdate: new Date(),
          config: {},
          agents: []
        });

        expect(farm).toBeDefined();

        // Simulate Redis disconnection
        await testRedis.quit();

        // Try operation that should fail gracefully
        await expect(
          testStore.getFarmState(farm.id)
        ).rejects.toThrow();

      } finally {
        await testStore.destroy();
      }
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle multiple concurrent operations', async () => {
      const operationCount = 10;
      const operations: Promise<any>[] = [];

      // Create multiple farms concurrently
      for (let i = 0; i < operationCount; i++) {
        operations.push(
          coordinator.launchFarm({
            farmId: `perf-test-${i}`,
            prompt: `Performance test farm ${i}`,
            agentCount: 1,
            config: {
              timeout: 30000,
              provider: 'claude',
              workingDirectory: process.cwd()
            },
            metadata: {}
          })
        );
      }

      const results = await Promise.allSettled(operations);
      const successful = results.filter(r => 
        r.status === 'fulfilled' && r.value.success
      ).length;

      // Most operations should succeed
      expect(successful).toBeGreaterThan(operationCount * 0.8);

      // Cleanup all farms
      for (let i = 0; i < operationCount; i++) {
        try {
          await coordinator.stopFarm(`perf-test-${i}`, true);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }, 60000); // 60 second timeout

    it('should maintain performance under load', async () => {
      const startTime = Date.now();
      const iterations = 20;

      for (let i = 0; i < iterations; i++) {
        const farmId = `load-test-${i}`;
        
        const launchResult = await coordinator.launchFarm({
          farmId,
          prompt: 'Load test',
          agentCount: 1,
          config: {
            timeout: 10000,
            provider: 'claude',
            workingDirectory: process.cwd()
          },
          metadata: {}
        });

        if (launchResult.success) {
          await coordinator.stopFarm(farmId, true);
        }
      }

      const totalTime = Date.now() - startTime;
      const averageTime = totalTime / iterations;

      console.log(`[TEST] Average operation time: ${averageTime}ms`);
      
      // Should complete operations reasonably quickly
      expect(averageTime).toBeLessThan(5000); // 5 seconds per operation
    }, 120000); // 2 minute timeout
  });
});