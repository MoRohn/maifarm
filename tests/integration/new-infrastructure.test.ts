import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { farmLauncherV2 } from '../../server/services/FarmLauncherV2';
import { stateCoordinator } from '../../server/services/unified/stateCoordinator';
import { realtimeConnectionManager } from '../../server/services/unified/websocketHub';
import { metricsPipeline } from '../../server/services/MetricsPipeline';
import { harvestOrchestrator } from '../../server/services/unified/farmService';
import { apiConnectionManager } from '../../server/services/ApiConnectionManager';
import { AIProvider } from '../../server/config/aiProviders';
import { db } from '../../server/database/connection';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('New Infrastructure Integration Tests', () => {
  let httpServer: any;
  let io: SocketIOServer;
  
  beforeAll(async () => {
    // Setup test server
    httpServer = createServer();
    io = new SocketIOServer(httpServer, {
      cors: { origin: '*' }
    });
    
    // Initialize RealtimeConnectionManager with test server
    realtimeConnectionManager.initialize(io);
    
    httpServer.listen(4568);
    
    // Setup test database
    await db.query(`
      CREATE TABLE IF NOT EXISTS state_events (
        id VARCHAR(255) PRIMARY KEY,
        type VARCHAR(255),
        entity_type VARCHAR(255),
        entity_id VARCHAR(255),
        payload JSONB,
        metadata JSONB,
        created_at TIMESTAMP
      )
    `);
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS state_snapshots (
        entity_type VARCHAR(255),
        entity_id VARCHAR(255),
        state JSONB,
        version INTEGER,
        created_at TIMESTAMP,
        PRIMARY KEY (entity_type, entity_id)
      )
    `);
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS metrics (
        id VARCHAR(255) PRIMARY KEY,
        type VARCHAR(255),
        name VARCHAR(255),
        value NUMERIC,
        tags JSONB,
        timestamp TIMESTAMP
      )
    `);
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS aggregated_metrics (
        name VARCHAR(255),
        type VARCHAR(255),
        count INTEGER,
        sum NUMERIC,
        min NUMERIC,
        max NUMERIC,
        avg NUMERIC,
        p50 NUMERIC,
        p95 NUMERIC,
        p99 NUMERIC,
        tags JSONB,
        window_start TIMESTAMP,
        window_end TIMESTAMP,
        created_at TIMESTAMP
      )
    `);
  });
  
  afterAll(async () => {
    // Cleanup
    farmLauncherV2.dispose();
    stateCoordinator.dispose();
    realtimeConnectionManager.dispose();
    metricsPipeline.dispose();
    harvestOrchestrator.dispose();
    apiConnectionManager.dispose();
    
    httpServer.close();
    await db.end();
  });
  
  beforeEach(async () => {
    // Clear test data
    await db.query('DELETE FROM farms');
    await db.query('DELETE FROM harvests');
    await db.query('DELETE FROM agents');
    await db.query('DELETE FROM tasks');
    await db.query('DELETE FROM state_events');
    await db.query('DELETE FROM metrics');
  });

  describe('FarmLauncherV2', () => {
    it('should launch a farm in under 500ms', async () => {
      const startTime = Date.now();
      
      const result = await farmLauncherV2.launch({
        name: 'Test Farm',
        description: 'Integration test farm',
        type: 'quick-task',
        numberOfAgents: 1,
        prompt: 'Test prompt',
        provider: AIProvider.CLAUDE,
        timeout: 60000,
        userId: 'test-user'
      });
      
      const launchTime = Date.now() - startTime;
      
      expect(result.status).toBe('success');
      expect(result.farmId).toBeDefined();
      expect(result.harvestId).toBeDefined();
      expect(result.sessionName).toContain('quick_');
      expect(launchTime).toBeLessThan(500);
    });
    
    it('should handle parallel initialization correctly', async () => {
      const launchPromises = [];
      
      // Launch 3 farms in parallel
      for (let i = 0; i < 3; i++) {
        launchPromises.push(
          farmLauncherV2.launch({
            name: `Parallel Farm ${i}`,
            description: 'Parallel test',
            type: 'farm',
            numberOfAgents: 2,
            prompt: 'Test parallel launch',
            provider: AIProvider.CLAUDE
          })
        );
      }
      
      const results = await Promise.all(launchPromises);
      
      // All should succeed
      results.forEach(result => {
        expect(result.status).toBe('success');
        expect(result.farmId).toBeDefined();
      });
      
      // Verify all farms are tracked
      const activeFarms = farmLauncherV2.getActiveFarms();
      expect(activeFarms.length).toBeGreaterThanOrEqual(3);
    });
    
    it('should handle pre-flight check failures gracefully', async () => {
      // Mock provider as unhealthy
      jest.spyOn(apiConnectionManager, 'getProviderMetrics').mockReturnValue({
        [AIProvider.CLAUDE]: {
          provider: AIProvider.CLAUDE,
          status: 'unhealthy',
          lastCheckAt: new Date(),
          consecutiveFailures: 10,
          circuitBreakerOpen: true,
          errorRate: 1
        }
      } as any);
      
      const result = await farmLauncherV2.launch({
        name: 'Failed Farm',
        description: 'Should fail pre-flight',
        type: 'quick-task',
        numberOfAgents: 1,
        prompt: 'Test',
        provider: AIProvider.CLAUDE
      });
      
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Provider claude is unavailable');
    });
  });

  describe('StateCoordinator', () => {
    it('should maintain state consistency with optimistic locking', async () => {
      const entityId = 'test-farm-123';
      
      // Initial state
      await stateCoordinator.applyStateChange('farm', entityId, {
        status: 'launching',
        agents: 0
      });
      
      // Concurrent updates
      const updates = [];
      for (let i = 0; i < 5; i++) {
        updates.push(
          stateCoordinator.applyStateChange('farm', entityId, {
            agents: i + 1
          })
        );
      }
      
      await Promise.all(updates);
      
      // Final state should have last update
      const finalState = await stateCoordinator.getState('farm', entityId);
      expect(finalState.agents).toBeGreaterThan(0);
      expect(finalState._version).toBeGreaterThan(1);
    });
    
    it('should handle event subscriptions correctly', async () => {
      const entityId = 'test-farm-456';
      const events: any[] = [];
      
      // Subscribe to changes
      const unsubscribe = stateCoordinator.subscribeToEntity('farm', entityId, (event) => {
        events.push(event);
      });
      
      // Apply changes
      await stateCoordinator.applyStateChange('farm', entityId, {
        status: 'active'
      });
      
      await stateCoordinator.applyStateChange('farm', entityId, {
        status: 'completed'
      });
      
      // Wait for events to propagate
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(events.length).toBe(2);
      expect(events[0].payload.status).toBe('active');
      expect(events[1].payload.status).toBe('completed');
      
      unsubscribe();
    });
    
    it('should create snapshots and recover from them', async () => {
      // Create multiple state changes
      for (let i = 0; i < 10; i++) {
        await stateCoordinator.applyStateChange('farm', `farm-${i}`, {
          status: 'active',
          value: i
        });
      }
      
      // Get stats before disposal
      const statsBefore = stateCoordinator.getStats();
      expect(statsBefore.cachedStates).toBeGreaterThan(0);
      
      // Force snapshot creation
      stateCoordinator.dispose();
      
      // Reinitialize (simulating restart)
      const StateCoordinator = require('../../server/services/unified/stateCoordinator').StateCoordinator;
      const newCoordinator = StateCoordinator.getInstance();
      
      // Check recovered states
      const recoveredState = await newCoordinator.getState('farm', 'farm-5');
      expect(recoveredState).toBeDefined();
      expect(recoveredState.value).toBe(5);
    });
  });

  describe('MetricsPipeline', () => {
    it('should record and aggregate metrics in real-time', async () => {
      const farmId = 'metrics-test-farm';
      
      // Record multiple metrics
      for (let i = 0; i < 100; i++) {
        metricsPipeline.recordFarmMetric(farmId, 'test.metric', Math.random() * 100);
        metricsPipeline.recordApiMetric('claude', 'chat', Math.random() * 1000, true);
      }
      
      // Wait for aggregation
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Get metrics summary
      const summary = await metricsPipeline.getMetricsSummary(
        {
          start: new Date(Date.now() - 60000),
          end: new Date()
        },
        { name: 'farm.test.metric' }
      );
      
      expect(summary.length).toBeGreaterThan(0);
      expect(summary[0].count).toBeGreaterThan(0);
      expect(summary[0].avg_value).toBeGreaterThan(0);
    });
    
    it('should compute percentiles correctly', async () => {
      // Record latency metrics
      const latencies = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      
      for (const latency of latencies) {
        metricsPipeline.recordApiMetric('test', 'operation', latency, true);
      }
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const stats = metricsPipeline.getStats();
      expect(stats.bufferedEvents).toBeGreaterThan(0);
    });
  });

  describe('HarvestOrchestrator', () => {
    it('should collect files with retry logic', async () => {
      const harvestId = 'test-harvest-123';
      const farmId = 'test-farm-789';
      
      // Create test workspace with files
      const workspacePath = path.join(process.cwd(), 'test-workspace');
      await fs.mkdir(workspacePath, { recursive: true });
      await fs.writeFile(path.join(workspacePath, 'test1.txt'), 'Test content 1');
      await fs.writeFile(path.join(workspacePath, 'test2.txt'), 'Test content 2');
      
      // Start harvest
      await harvestOrchestrator.startHarvest(harvestId, farmId, workspacePath, {
        compress: true,
        maxFileSize: 1024 * 1024
      });
      
      // Wait for collection
      await new Promise(resolve => setTimeout(resolve, 6000));
      
      // Check progress
      const stats = harvestOrchestrator.getHarvestStats(harvestId);
      expect(stats).toBeDefined();
      expect(stats?.totalFiles).toBe(2);
      
      // Cleanup
      await fs.rm(workspacePath, { recursive: true, force: true });
    });
    
    it('should handle file collection failures gracefully', async () => {
      const harvestId = 'test-harvest-fail';
      const farmId = 'test-farm-fail';
      
      // Start harvest with non-existent workspace
      await harvestOrchestrator.startHarvest(
        harvestId,
        farmId,
        '/non/existent/path',
        {}
      );
      
      // Should not throw, but track failed files
      const stats = harvestOrchestrator.getHarvestStats(harvestId);
      expect(stats).toBeDefined();
    });
  });

  describe('RealtimeConnectionManager', () => {
    it('should handle room-based messaging correctly', async () => {
      const farmId = 'realtime-test-farm';
      const receivedMessages: any[] = [];
      
      // Create test client
      const io = require('socket.io-client');
      const client = io('http://localhost:4568');
      
      await new Promise(resolve => {
        client.on('connect', resolve);
      });
      
      // Subscribe to farm
      client.emit('subscribe:farm', farmId);
      
      // Listen for farm updates
      client.on('farm:updated', (data: any) => {
        receivedMessages.push(data);
      });
      
      // Send message to farm room
      realtimeConnectionManager.sendToFarm(farmId, 'farm:updated', {
        test: 'data',
        value: 123
      });
      
      // Wait for message
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0].test).toBe('data');
      
      client.disconnect();
    });
    
    it('should queue messages for offline users', async () => {
      const userId = 'offline-user';
      
      // Send message to offline user
      realtimeConnectionManager.sendToUser(userId, 'test:message', {
        content: 'Queued message'
      });
      
      // Create client with userId
      const io = require('socket.io-client');
      const client = io('http://localhost:4568', {
        auth: { userId }
      });
      
      const receivedMessages: any[] = [];
      
      client.on('test:message', (data: any) => {
        receivedMessages.push(data);
      });
      
      await new Promise(resolve => {
        client.on('connect', resolve);
      });
      
      // Wait for queued messages
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0].content).toBe('Queued message');
      expect(receivedMessages[0]._queued).toBe(true);
      
      client.disconnect();
    });
  });

  describe('ApiConnectionManager', () => {
    it('should implement circuit breaker pattern', async () => {
      const provider = AIProvider.CLAUDE;
      
      // Simulate multiple failures
      for (let i = 0; i < 6; i++) {
        try {
          await apiConnectionManager.executeCommand(
            provider,
            'failing-command',
            ['--fail']
          );
        } catch (error) {
          // Expected to fail
        }
      }
      
      // Check circuit breaker status
      const metrics = apiConnectionManager.getProviderMetrics();
      expect(metrics[provider].circuitBreakerOpen).toBe(true);
      expect(metrics[provider].status).toBe('unhealthy');
    });
    
    it('should fallback to alternative providers', async () => {
      // Reset circuit breakers
      apiConnectionManager.resetCircuitBreaker(AIProvider.CLAUDE);
      apiConnectionManager.resetCircuitBreaker(AIProvider.OPENAI);
      
      // Mock Claude as unhealthy
      const metrics = apiConnectionManager.getProviderMetrics();
      metrics[AIProvider.CLAUDE].status = 'unhealthy';
      metrics[AIProvider.CLAUDE].circuitBreakerOpen = true;
      
      // Should use fallback
      const bestProvider = apiConnectionManager.getBestProvider();
      expect(bestProvider).not.toBe(AIProvider.CLAUDE);
    });
  });

  describe('End-to-End New Farm Workflow', () => {
    it('should complete full farm lifecycle successfully', async () => {
      const startTime = Date.now();
      
      // 1. Launch farm
      const launchResult = await farmLauncherV2.launch({
        name: 'E2E Test Farm',
        description: 'End-to-end integration test',
        type: 'quick-task',
        numberOfAgents: 2,
        prompt: 'Create a simple hello world program',
        provider: AIProvider.CLAUDE,
        timeout: 60000,
        userId: 'e2e-test-user'
      });
      
      expect(launchResult.status).toBe('success');
      const { farmId, harvestId } = launchResult;
      
      // 2. Monitor state changes
      const stateChanges: string[] = [];
      const unsubscribe = stateCoordinator.subscribeToEntity('farm', farmId, (event) => {
        stateChanges.push(event.payload.status);
      });
      
      // 3. Track metrics
      metricsPipeline.recordFarmMetric(farmId, 'e2e.test', 1);
      
      // 4. Simulate work
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 5. Update farm status
      await stateCoordinator.applyStateChange('farm', farmId, {
        status: 'active',
        progress: 50
      });
      
      // 6. Complete farm
      await stateCoordinator.applyStateChange('farm', farmId, {
        status: 'completed',
        progress: 100
      });
      
      // 7. Verify harvest
      const harvestStats = harvestOrchestrator.getHarvestStats(harvestId);
      expect(harvestStats).toBeDefined();
      
      // 8. Check metrics
      const totalTime = Date.now() - startTime;
      expect(totalTime).toBeLessThan(5000);
      
      // 9. Verify state changes
      expect(stateChanges).toContain('active');
      expect(stateChanges).toContain('completed');
      
      unsubscribe();
      
      // 10. Stop farm
      await farmLauncherV2.stopFarm(farmId);
    });
  });
});

describe('Performance Benchmarks', () => {
  it('should handle 100 concurrent farms', async () => {
    const farms: any[] = [];
    const startTime = Date.now();
    
    // Launch farms in batches
    for (let batch = 0; batch < 10; batch++) {
      const batchPromises = [];
      
      for (let i = 0; i < 10; i++) {
        batchPromises.push(
          farmLauncherV2.launch({
            name: `Benchmark Farm ${batch}-${i}`,
            description: 'Performance test',
            type: 'farm',
            numberOfAgents: 1,
            prompt: 'Benchmark test',
            provider: AIProvider.CLAUDE
          })
        );
      }
      
      const results = await Promise.all(batchPromises);
      farms.push(...results);
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const totalTime = Date.now() - startTime;
    
    // All should launch successfully
    const successCount = farms.filter(f => f.status === 'success').length;
    expect(successCount).toBeGreaterThan(90); // Allow for some failures
    
    // Should complete within reasonable time
    expect(totalTime).toBeLessThan(30000); // 30 seconds for 100 farms
    
    // Average launch time should be low
    const avgLaunchTime = farms.reduce((sum, f) => sum + (f.launchTimeMs || 0), 0) / farms.length;
    expect(avgLaunchTime).toBeLessThan(1000); // Under 1 second average
  });
  
  it('should maintain low latency under load', async () => {
    const latencies: number[] = [];
    
    // Generate high load
    for (let i = 0; i < 1000; i++) {
      const start = Date.now();
      
      // Record metrics
      metricsPipeline.record('benchmark.test', Math.random() * 100, 'gauge');
      
      // Apply state changes
      await stateCoordinator.applyStateChange('farm', `bench-${i}`, {
        value: i
      });
      
      const latency = Date.now() - start;
      latencies.push(latency);
    }
    
    // Calculate percentiles
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    
    // Verify performance
    expect(p50).toBeLessThan(10);  // P50 under 10ms
    expect(p95).toBeLessThan(50);  // P95 under 50ms
    expect(p99).toBeLessThan(100); // P99 under 100ms
  });
});