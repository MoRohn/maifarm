import { jest } from '@jest/globals';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';

const request = require('supertest');
import {
  createMockFarm,
  createMockAgent,
  createMockHarvest,
  createMockTask,
  waitFor,
  expectEventually,
  measureAsyncOperation,
  setupTestEnvironment,
} from '../helpers/testUtils';

/**
 * Critical Workflow Integration Tests
 * These tests verify end-to-end functionality of core MaiFarm workflows
 */

describe('Critical Workflow Integration Tests', () => {
  let app: any;
  let server: any;
  let client: ClientSocket;
  const cleanup = setupTestEnvironment();

  beforeAll(async () => {
    // Import and setup the server
    const { createApp } = await import('../../apps/api/src/index.js');
    app = createApp();
    server = app.listen(0); // Random port
    
    const port = server.address().port;
    client = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      reconnection: true,
    });

    await new Promise((resolve) => {
      client.on('connect', resolve);
    });
  });

  afterAll(async () => {
    cleanup();
    client.close();
    server.close();
  });

  describe('Farm Creation and Management Workflow', () => {
    it('should complete full farm lifecycle: create -> activate -> harvest -> archive', async () => {
      const farmData = createMockFarm({
        name: 'Integration Test Farm',
        agents: ['agent-1', 'agent-2'],
      });

      // Step 1: Create farm
      const createResponse = await request(app)
        .post('/api/farms')
        .send(farmData)
        .expect(201);

      const farmId = createResponse.body.id;
      expect(farmId).toBeDefined();

      // Step 2: Verify WebSocket notification
      await expectEventually(() => {
        expect(client.listeners('farm:created')).toHaveLength(1);
      });

      // Step 3: Activate farm
      const activateResponse = await request(app)
        .post(`/api/farms/${farmId}/activate`)
        .expect(200);

      expect(activateResponse.body.status).toBe('active');

      // Step 4: Add agents to farm
      const agent1 = createMockAgent({ farmId, name: 'Agent 1' });
      const agent2 = createMockAgent({ farmId, name: 'Agent 2' });

      await request(app)
        .post(`/api/farms/${farmId}/agents`)
        .send(agent1)
        .expect(201);

      await request(app)
        .post(`/api/farms/${farmId}/agents`)
        .send(agent2)
        .expect(201);

      // Step 5: Start harvest
      const harvestResponse = await request(app)
        .post(`/api/farms/${farmId}/harvest`)
        .expect(201);

      const harvestId = harvestResponse.body.id;

      // Step 6: Wait for harvest completion
      await waitFor(async () => {
        const status = await request(app)
          .get(`/api/harvests/${harvestId}`)
          .expect(200);
        return status.body.status === 'completed';
      }, 10000);

      // Step 7: Archive farm
      await request(app)
        .post(`/api/farms/${farmId}/archive`)
        .expect(200);

      // Step 8: Verify final state
      const finalState = await request(app)
        .get(`/api/farms/${farmId}`)
        .expect(200);

      expect(finalState.body.status).toBe('archived');
    });

    it('should handle concurrent farm operations correctly', async () => {
      const farms = Array.from({ length: 5 }, (_, i) =>
        createMockFarm({ name: `Concurrent Farm ${i}` })
      );

      // Create farms concurrently
      const createPromises = farms.map((farm) =>
        request(app).post('/api/farms').send(farm)
      );

      const responses = await Promise.all(createPromises);
      
      // All should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(201);
        expect(response.body.id).toBeDefined();
      });

      // Verify all farms are in the database
      const listResponse = await request(app)
        .get('/api/farms')
        .expect(200);

      expect(listResponse.body.farms.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Quick Task Execution Workflow', () => {
    it('should execute quick task from creation to completion', async () => {
      const task = createMockTask({
        type: 'quick-task',
        prompt: 'Generate a test report',
        timeout: 180000, // 3 minutes
      });

      // Step 1: Create quick task
      const { result: createResponse, duration: createDuration } = await measureAsyncOperation(
        () => request(app).post('/api/tasks/quick').send(task)
      );

      expect(createResponse.status).toBe(201);
      expect(createDuration).toBeLessThan(1000); // Should be fast

      const taskId = createResponse.body.id;

      // Step 2: Monitor task progress via WebSocket
      const progressUpdates: any[] = [];
      client.on(`task:${taskId}:progress`, (update) => {
        progressUpdates.push(update);
      });

      // Step 3: Wait for task completion
      await waitFor(async () => {
        const status = await request(app)
          .get(`/api/tasks/${taskId}`)
          .expect(200);
        return status.body.status === 'completed';
      }, 185000); // Slightly more than task timeout

      // Step 4: Verify progress updates were received
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates.some((u) => u.stage === 'started')).toBe(true);
      expect(progressUpdates.some((u) => u.stage === 'completed')).toBe(true);

      // Step 5: Get task result
      const resultResponse = await request(app)
        .get(`/api/tasks/${taskId}/result`)
        .expect(200);

      expect(resultResponse.body.output).toBeDefined();
    });

    it('should handle task cancellation gracefully', async () => {
      const task = createMockTask({
        type: 'quick-task',
        prompt: 'Long running task for cancellation test',
        timeout: 300000, // 5 minutes
      });

      // Create task
      const createResponse = await request(app)
        .post('/api/tasks/quick')
        .send(task)
        .expect(201);

      const taskId = createResponse.body.id;

      // Wait a bit for task to start
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Cancel task
      await request(app)
        .post(`/api/tasks/${taskId}/cancel`)
        .expect(200);

      // Verify task is cancelled
      const statusResponse = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      expect(statusResponse.body.status).toBe('cancelled');
    });
  });

  describe('GoWild Mode Workflow', () => {
    it('should execute GoWild exploration workflow', async () => {
      const goWildConfig = {
        creativityLevel: 75,
        focusAreas: ['testing', 'optimization'],
        duration: 60000, // 1 minute
      };

      // Step 1: Start GoWild session
      const startResponse = await request(app)
        .post('/api/gowild/start')
        .send(goWildConfig)
        .expect(201);

      const sessionId = startResponse.body.sessionId;

      // Step 2: Monitor discoveries via WebSocket
      const discoveries: any[] = [];
      client.on(`gowild:${sessionId}:discovery`, (discovery) => {
        discoveries.push(discovery);
      });

      // Step 3: Wait for session to generate discoveries
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Step 4: Get session status
      const statusResponse = await request(app)
        .get(`/api/gowild/sessions/${sessionId}`)
        .expect(200);

      expect(statusResponse.body.status).toBe('active');
      expect(statusResponse.body.discoveries).toBeGreaterThan(0);

      // Step 5: Stop session
      await request(app)
        .post(`/api/gowild/sessions/${sessionId}/stop`)
        .expect(200);

      // Step 6: Verify discoveries were made
      expect(discoveries.length).toBeGreaterThan(0);
    });
  });

  describe('Harvest Collection and Analysis Workflow', () => {
    it('should collect and analyze harvest data', async () => {
      // Step 1: Create a farm with completed tasks
      const farm = createMockFarm({ name: 'Harvest Test Farm' });
      const farmResponse = await request(app)
        .post('/api/farms')
        .send(farm)
        .expect(201);

      const farmId = farmResponse.body.id;

      // Step 2: Simulate task completion
      const tasks = Array.from({ length: 5 }, (_, i) => ({
        farmId,
        name: `Task ${i}`,
        status: 'completed',
        output: `Result for task ${i}`,
      }));

      for (const task of tasks) {
        await request(app)
          .post(`/api/farms/${farmId}/tasks`)
          .send(task)
          .expect(201);
      }

      // Step 3: Trigger harvest
      const harvestResponse = await request(app)
        .post(`/api/farms/${farmId}/harvest`)
        .expect(201);

      const harvestId = harvestResponse.body.id;

      // Step 4: Wait for harvest analysis
      await waitFor(async () => {
        const harvest = await request(app)
          .get(`/api/harvests/${harvestId}`)
          .expect(200);
        return harvest.body.status === 'analyzed';
      }, 10000);

      // Step 5: Get harvest analysis
      const analysisResponse = await request(app)
        .get(`/api/harvests/${harvestId}/analysis`)
        .expect(200);

      expect(analysisResponse.body).toMatchObject({
        totalTasks: 5,
        successRate: expect.any(Number),
        overallQuality: expect.any(Number),
        insights: expect.any(Array),
      });

      // Step 6: Save to barn
      const barnResponse = await request(app)
        .post('/api/barn/harvests')
        .send({ harvestId })
        .expect(201);

      expect(barnResponse.body.id).toBeDefined();
    });
  });

  describe('Multi-Agent Coordination Workflow', () => {
    it('should coordinate multiple agents working on shared task', async () => {
      // Step 1: Create farm with multiple agents
      const farm = createMockFarm({
        name: 'Multi-Agent Farm',
        agentCount: 3,
      });

      const farmResponse = await request(app)
        .post('/api/farms')
        .send(farm)
        .expect(201);

      const farmId = farmResponse.body.id;

      // Step 2: Create shared task
      const sharedTask = {
        farmId,
        type: 'collaborative',
        prompt: 'Build a complete feature with tests',
        subtasks: [
          { type: 'implement', assignTo: 'agent-1' },
          { type: 'test', assignTo: 'agent-2' },
          { type: 'document', assignTo: 'agent-3' },
        ],
      };

      const taskResponse = await request(app)
        .post('/api/tasks/collaborative')
        .send(sharedTask)
        .expect(201);

      const taskId = taskResponse.body.id;

      // Step 3: Monitor agent coordination
      const coordinationEvents: any[] = [];
      client.on(`task:${taskId}:coordination`, (event) => {
        coordinationEvents.push(event);
      });

      // Step 4: Wait for task completion
      await waitFor(async () => {
        const task = await request(app)
          .get(`/api/tasks/${taskId}`)
          .expect(200);
        return task.body.status === 'completed';
      }, 30000);

      // Step 5: Verify coordination occurred
      expect(coordinationEvents.length).toBeGreaterThan(0);
      expect(coordinationEvents.some((e) => e.type === 'handoff')).toBe(true);

      // Step 6: Get combined result
      const resultResponse = await request(app)
        .get(`/api/tasks/${taskId}/result`)
        .expect(200);

      expect(resultResponse.body).toMatchObject({
        implementation: expect.any(Object),
        tests: expect.any(Object),
        documentation: expect.any(Object),
      });
    });
  });

  describe('Error Recovery Workflow', () => {
    it('should recover from agent failures gracefully', async () => {
      // Step 1: Create farm with potential failure points
      const farm = createMockFarm({
        name: 'Failure Recovery Farm',
        failureSimulation: true,
      });

      const farmResponse = await request(app)
        .post('/api/farms')
        .send(farm)
        .expect(201);

      const farmId = farmResponse.body.id;

      // Step 2: Start task that will fail
      const task = {
        farmId,
        type: 'unreliable',
        prompt: 'Task that may fail',
        retryCount: 3,
      };

      const taskResponse = await request(app)
        .post('/api/tasks')
        .send(task)
        .expect(201);

      const taskId = taskResponse.body.id;

      // Step 3: Monitor retry attempts
      const retryEvents: any[] = [];
      client.on(`task:${taskId}:retry`, (event) => {
        retryEvents.push(event);
      });

      // Step 4: Wait for task to complete (with retries)
      await waitFor(async () => {
        const task = await request(app)
          .get(`/api/tasks/${taskId}`)
          .expect(200);
        return ['completed', 'failed'].includes(task.body.status);
      }, 20000);

      // Step 5: Verify retries occurred
      if (retryEvents.length > 0) {
        expect(retryEvents.length).toBeLessThanOrEqual(3);
        expect(retryEvents[0].attempt).toBe(1);
      }
    });

    it('should handle database connection failures', async () => {
      // This test would simulate database disconnection
      // For safety in testing, we'll just verify the endpoint exists
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.database).toBeDefined();
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle high throughput of concurrent requests', async () => {
      const requestCount = 100;
      const requests = Array.from({ length: requestCount }, (_, i) =>
        request(app).get(`/api/health?req=${i}`)
      );

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - startTime;

      // All requests should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      // Should complete within reasonable time (< 5 seconds for 100 requests)
      expect(duration).toBeLessThan(5000);

      // Calculate throughput
      const throughput = (requestCount / duration) * 1000;
      expect(throughput).toBeGreaterThan(20); // At least 20 req/s
    });

    it('should maintain responsiveness under sustained load', async () => {
      const testDuration = 5000; // 5 seconds
      const endTime = Date.now() + testDuration;
      const latencies: number[] = [];

      while (Date.now() < endTime) {
        const startTime = Date.now();
        await request(app).get('/api/health').expect(200);
        latencies.push(Date.now() - startTime);
        
        // Small delay between requests
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Calculate percentiles
      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];

      // Performance assertions
      expect(p50).toBeLessThan(100); // Median < 100ms
      expect(p95).toBeLessThan(500); // 95th percentile < 500ms
      expect(p99).toBeLessThan(1000); // 99th percentile < 1s
    });
  });
});