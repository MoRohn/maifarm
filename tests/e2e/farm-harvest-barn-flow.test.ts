/**
 * Comprehensive E2E Test for Farm → Harvest → Barn Flow
 * Tests the complete lifecycle of farm operations in MaiFarm
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import { io as ioClient, Socket } from 'socket.io-client';
import { spawn } from 'child_process';
import { 
  createTestFarm, 
  createTestAgent,
  createTestHarvest,
  createTestBarnItem,
  createTestYamlConfig,
  createTestEcosystem 
} from '../helpers/testFactories';

describe('Farm → Harvest → Barn E2E Flow', () => {
  let app: any;
  let server: any;
  let wsClient: Socket;
  let baseURL: string;
  let farmId: string;
  let harvestId: string;
  let sessionName: string;

  beforeAll(async () => {
    // Start test server
    process.env.NODE_ENV = 'test';
    process.env.BYPASS_AUTH = 'true';
    
    const serverModule = await import('../../apps/api/src/index');
    app = serverModule.app;
    server = app.listen(0); // Random port
    const port = server.address().port;
    baseURL = `http://localhost:${port}`;
    
    // Connect WebSocket client
    wsClient = ioClient(baseURL, {
      transports: ['websocket'],
      reconnection: true
    });
    
    await new Promise((resolve) => {
      wsClient.on('connect', resolve);
    });
  });

  afterAll(async () => {
    wsClient.close();
    server.close();
    // Clean up any tmux sessions
    spawn('tmux', ['kill-server']);
  });

  describe('Phase 1: Farm Creation', () => {
    it('should create a new farm with proper configuration', async () => {
      const farmConfig = createTestFarm({
        name: 'E2E Test Farm',
        config: {
          maxAgents: 3,
          timeout: 600000, // 10 minutes
          provider: 'claude'
        }
      });

      const response = await request(baseURL)
        .post('/api/farms')
        .send(farmConfig)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        name: 'E2E Test Farm',
        status: 'idle',
        config: expect.objectContaining({
          maxAgents: 3
        })
      });

      farmId = response.body.data.id;
      expect(farmId).toBeDefined();
    });

    it('should validate YAML configuration before farm creation', async () => {
      const yamlConfig = createTestYamlConfig({
        name: 'e2e-test-farm',
        agents: [
          { name: 'Developer', role: 'coding', capabilities: ['javascript', 'typescript'] },
          { name: 'Tester', role: 'testing', capabilities: ['unit', 'integration'] },
          { name: 'Reviewer', role: 'review', capabilities: ['code-review', 'documentation'] }
        ]
      });

      const response = await request(baseURL)
        .post('/api/yaml/validate')
        .send({ yaml: yamlConfig })
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.agentCount).toBe(3);
    });

    it('should transition farm status from idle to launching', async () => {
      const launchResponse = await request(baseURL)
        .post(`/api/farms/${farmId}/launch`)
        .send({
          prompt: 'Test E2E task execution',
          numberOfAgents: 3
        })
        .expect(200);

      expect(launchResponse.body.success).toBe(true);
      expect(launchResponse.body.data.status).toBe('launching');
      
      sessionName = `farm-${farmId.substring(0, 8)}`;
    });

    it('should receive WebSocket events for farm status updates', (done) => {
      const statusUpdates: string[] = [];
      
      wsClient.on('farm:status', (data) => {
        if (data.farmId === farmId) {
          statusUpdates.push(data.status);
          
          if (data.status === 'active') {
            expect(statusUpdates).toContain('launching');
            done();
          }
        }
      });

      // Trigger status check
      setTimeout(async () => {
        await request(baseURL)
          .get(`/api/farms/${farmId}`)
          .expect(200);
      }, 1000);
    });

    it('should verify tmux session creation with correct number of panes', async () => {
      // Wait for session to be created
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const sessionsResponse = await request(baseURL)
        .get(`/api/harvest/terminal/sessions?farmId=${farmId}`)
        .expect(200);

      expect(sessionsResponse.body.success).toBe(true);
      expect(sessionsResponse.body.data).toHaveLength(1);
      expect(sessionsResponse.body.data[0]).toMatchObject({
        sessionName,
        paneCount: 3,
        active: true
      });
    });
  });

  describe('Phase 2: Farm Operation & Monitoring', () => {
    it('should track agent activities in real-time', (done) => {
      const agentUpdates: any[] = [];
      
      wsClient.on('agent:status', (data) => {
        agentUpdates.push(data);
        
        if (agentUpdates.length >= 3) {
          expect(agentUpdates).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ status: 'active' })
            ])
          );
          done();
        }
      });

      // Request agent status
      wsClient.emit('farm:agents:request', { farmId });
    });

    it('should capture terminal output from agents', async () => {
      const terminalResponse = await request(baseURL)
        .get(`/api/harvest/terminal/${sessionName}/0`)
        .query({ lines: 100 })
        .expect(200);

      expect(terminalResponse.body.success).toBe(true);
      expect(terminalResponse.body.data).toHaveProperty('lines');
      expect(Array.isArray(terminalResponse.body.data.lines)).toBe(true);
    });

    it('should handle agent coordination and work claims', async () => {
      const coordinationResponse = await request(baseURL)
        .get(`/api/coordination/farms/${farmId}`)
        .expect(200);

      expect(coordinationResponse.body).toMatchObject({
        activeAgents: expect.any(Array),
        workClaims: expect.any(Array),
        completedWork: expect.any(Array)
      });
    });

    it('should monitor farm health and performance metrics', async () => {
      const metricsResponse = await request(baseURL)
        .get(`/api/farms/${farmId}/metrics`)
        .expect(200);

      expect(metricsResponse.body).toMatchObject({
        cpu: expect.any(Number),
        memory: expect.any(Number),
        agentUtilization: expect.any(Number),
        tasksCompleted: expect.any(Number),
        errorRate: expect.any(Number)
      });
    });
  });

  describe('Phase 3: Harvest Collection', () => {
    beforeEach(async () => {
      // Ensure farm is in harvestable state
      await request(baseURL)
        .patch(`/api/farms/${farmId}`)
        .send({ status: 'active' });
    });

    it('should initiate harvest when farm completes or on manual trigger', async () => {
      const harvestResponse = await request(baseURL)
        .post(`/api/harvests/trigger/${farmId}`)
        .send({ userId: 'test-user' })
        .expect(200);

      expect(harvestResponse.body.success).toBe(true);
      expect(harvestResponse.body).toHaveProperty('harvestId');
      harvestId = harvestResponse.body.harvestId;
    });

    it('should collect outputs from all agents', async () => {
      // Wait for collection
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const harvestResponse = await request(baseURL)
        .get(`/api/harvests/${harvestId}`)
        .expect(200);

      expect(harvestResponse.body.success).toBe(true);
      expect(harvestResponse.body.data).toMatchObject({
        id: harvestId,
        farmId,
        status: expect.stringMatching(/collecting|processing|completed/),
        results: expect.any(Array)
      });
    });

    it('should generate harvest insights and summary', async () => {
      const insightsResponse = await request(baseURL)
        .get(`/api/harvests/${harvestId}/insights`)
        .expect(200);

      expect(insightsResponse.body).toMatchObject({
        summary: expect.objectContaining({
          totalAgents: expect.any(Number),
          duration: expect.any(Number),
          tasksCompleted: expect.any(Number),
          successRate: expect.any(Number)
        }),
        insights: expect.any(Array),
        recommendations: expect.any(Array)
      });
    });

    it('should calculate harvest quality score', async () => {
      const qualityResponse = await request(baseURL)
        .get(`/api/harvests/${harvestId}/quality`)
        .expect(200);

      expect(qualityResponse.body).toMatchObject({
        score: expect.any(Number),
        metrics: expect.objectContaining({
          completeness: expect.any(Number),
          accuracy: expect.any(Number),
          timeliness: expect.any(Number)
        }),
        grade: expect.stringMatching(/A|B|C|D|F/)
      });
    });

    it('should handle harvest errors gracefully', async () => {
      // Test with non-existent harvest
      const errorResponse = await request(baseURL)
        .get('/api/harvests/non-existent-id')
        .expect(404);

      expect(errorResponse.body.success).toBe(false);
      expect(errorResponse.body.error).toMatchObject({
        message: expect.any(String),
        code: 'NOT_FOUND'
      });
    });
  });

  describe('Phase 4: Barn Storage', () => {
    let barnItemId: string;

    it('should automatically store completed harvest in barn', async () => {
      // Complete the harvest
      await request(baseURL)
        .post(`/api/harvests/${harvestId}/complete`)
        .expect(200);

      // Check barn storage
      const barnResponse = await request(baseURL)
        .get(`/api/barn/harvests/${harvestId}`)
        .expect(200);

      expect(barnResponse.body.success).toBe(true);
      expect(barnResponse.body.data).toMatchObject({
        harvestId,
        items: expect.any(Array),
        metadata: expect.any(Object)
      });

      if (barnResponse.body.data.items.length > 0) {
        barnItemId = barnResponse.body.data.items[0].id;
      }
    });

    it('should categorize and tag barn items', async () => {
      if (!barnItemId) {
        barnItemId = 'test-item-' + Date.now();
        // Create a test barn item
        const createResponse = await request(baseURL)
          .post('/api/barn/items')
          .send(createTestBarnItem(harvestId))
          .expect(201);
        barnItemId = createResponse.body.data.id;
      }

      const itemResponse = await request(baseURL)
        .get(`/api/barn/items/${barnItemId}`)
        .expect(200);

      expect(itemResponse.body.data).toMatchObject({
        id: barnItemId,
        category: expect.any(String),
        tags: expect.any(Array),
        quality: expect.objectContaining({
          score: expect.any(Number)
        })
      });
    });

    it('should search barn items by various criteria', async () => {
      const searchResponse = await request(baseURL)
        .get('/api/barn/search')
        .query({
          query: 'test',
          category: 'general',
          minQuality: 70
        })
        .expect(200);

      expect(searchResponse.body.success).toBe(true);
      expect(searchResponse.body.data).toMatchObject({
        items: expect.any(Array),
        total: expect.any(Number),
        facets: expect.any(Object)
      });
    });

    it('should generate seeds from barn items', async () => {
      const seedResponse = await request(baseURL)
        .post(`/api/barn/items/${barnItemId}/seed`)
        .send({
          name: 'Test Seed from Barn',
          description: 'Seed generated from barn item'
        })
        .expect(201);

      expect(seedResponse.body.success).toBe(true);
      expect(seedResponse.body.data).toMatchObject({
        name: 'Test Seed from Barn',
        sourceItemId: barnItemId,
        config: expect.any(Object)
      });
    });

    it('should export barn items in various formats', async () => {
      const formats = ['json', 'csv', 'markdown'];
      
      for (const format of formats) {
        const exportResponse = await request(baseURL)
          .get(`/api/barn/export`)
          .query({ format, itemIds: [barnItemId] })
          .expect(200);

        expect(exportResponse.headers['content-type']).toContain(
          format === 'json' ? 'application/json' :
          format === 'csv' ? 'text/csv' :
          'text/markdown'
        );
      }
    });
  });

  describe('Phase 5: Error Recovery & Edge Cases', () => {
    it('should recover from farm launch failures', async () => {
      // Create farm with invalid config
      const invalidFarm = await request(baseURL)
        .post('/api/farms')
        .send(createTestFarm({ config: { maxAgents: -1 } }))
        .expect(400);

      expect(invalidFarm.body.success).toBe(false);
      expect(invalidFarm.body.error).toBeDefined();
    });

    it('should handle WebSocket disconnections gracefully', (done) => {
      wsClient.disconnect();
      
      setTimeout(() => {
        wsClient.connect();
        
        wsClient.once('connect', () => {
          expect(wsClient.connected).toBe(true);
          done();
        });
      }, 1000);
    });

    it('should clean up resources on farm termination', async () => {
      const terminateResponse = await request(baseURL)
        .post(`/api/farms/${farmId}/terminate`)
        .expect(200);

      expect(terminateResponse.body.success).toBe(true);
      
      // Verify tmux session is cleaned up
      const sessionsResponse = await request(baseURL)
        .get(`/api/harvest/terminal/sessions?farmId=${farmId}`)
        .expect(200);

      expect(sessionsResponse.body.data).toHaveLength(0);
    });

    it('should handle concurrent farm operations', async () => {
      const farmPromises = Array.from({ length: 3 }, () =>
        request(baseURL)
          .post('/api/farms')
          .send(createTestFarm())
      );

      const responses = await Promise.all(farmPromises);
      
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });
    });

    it('should enforce resource limits', async () => {
      // Try to create farm exceeding resource limits
      const response = await request(baseURL)
        .post('/api/farms')
        .send(createTestFarm({
          config: {
            maxAgents: 1000,
            resourceLimits: {
              totalCpu: 10000,
              totalMemory: 1000000
            }
          }
        }))
        .expect(400);

      expect(response.body.error).toContain('resource');
    });
  });

  describe('Phase 6: Performance Benchmarks', () => {
    it('should complete farm launch within 3 seconds', async () => {
      const startTime = Date.now();
      
      const farm = await request(baseURL)
        .post('/api/farms')
        .send(createTestFarm())
        .expect(201);

      await request(baseURL)
        .post(`/api/farms/${farm.body.data.id}/launch`)
        .send({ prompt: 'Performance test', numberOfAgents: 3 })
        .expect(200);

      const launchTime = Date.now() - startTime;
      expect(launchTime).toBeLessThan(3000);
    });

    it('should handle high-frequency WebSocket messages', (done) => {
      let messageCount = 0;
      const targetMessages = 100;
      
      wsClient.on('test:message', () => {
        messageCount++;
        if (messageCount >= targetMessages) {
          done();
        }
      });

      // Send rapid messages
      for (let i = 0; i < targetMessages; i++) {
        wsClient.emit('test:ping', { index: i });
      }
    });

    it('should process harvest collection within 10 seconds', async () => {
      const startTime = Date.now();
      
      await request(baseURL)
        .post(`/api/harvests/trigger/${farmId}`)
        .expect(200);

      // Wait for harvest to complete
      let completed = false;
      while (!completed && (Date.now() - startTime) < 10000) {
        const response = await request(baseURL)
          .get(`/api/harvests/${harvestId}`)
          .expect(200);
        
        completed = response.body.data?.status === 'completed';
        if (!completed) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      const processingTime = Date.now() - startTime;
      expect(processingTime).toBeLessThan(10000);
      expect(completed).toBe(true);
    });
  });
});

// Helper function to wait for condition
async function waitForCondition(
  checkFn: () => Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await checkFn()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  return false;
}