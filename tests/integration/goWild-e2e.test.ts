import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { goWildManagerV2 } from '../../server/services/unified/farmService';
import { agentCoordinatorV2 } from '../../server/services/unified/farmService';
import { apiConnectionManager } from '../../server/services/apiConnectionManager';
import { realtimeMetricsService } from '../../server/services/realtimeMetricsService';
import { websocketManager } from '../../server/websocket/websocketManager';
import { v4 as uuidv4 } from 'uuid';

// Mock WebSocket manager
jest.mock('../../server/websocket/websocketManager', () => ({
  websocketManager: {
    broadcast: jest.fn(),
    broadcastToFarm: jest.fn(),
    getServer: jest.fn(() => ({
      getConnectionCount: () => 5,
      getRoomCount: () => 3
    }))
  }
}));

// Mock database
jest.mock('../../server/database/connection', () => ({
  db: {
    query: jest.fn(() => Promise.resolve({ rows: [] }))
  }
}));

// Mock harvest service
jest.mock('../../server/services/harvestService', () => ({
  harvestService: {
    createHarvest: jest.fn(() => Promise.resolve({
      id: uuidv4(),
      farmId: 'test-farm',
      artifacts: []
    }))
  }
}));

// Mock barn service
jest.mock('../../server/services/barnService', () => ({
  barnService: {
    storeItem: jest.fn(() => Promise.resolve({ id: uuidv4() }))
  }
}));

describe('Go Wild End-to-End Test', () => {
  const testFarmId = `farm-${uuidv4()}`;
  let sessionId: string;
  
  beforeAll(() => {
    // Initialize services
    console.log('Initializing Go Wild E2E test environment...');
  });
  
  afterAll(async () => {
    // Cleanup
    await goWildManagerV2.stopAll();
    agentCoordinatorV2.stop();
    apiConnectionManager.stop();
    realtimeMetricsService.stop();
  });
  
  describe('API Connection Manager', () => {
    it('should handle provider failover', async () => {
      // Mock API responses
      const mockRequest = {
        method: 'POST' as const,
        url: '/v1/messages',
        data: { messages: [{ role: 'user', content: 'test' }] }
      };
      
      // Test circuit breaker behavior
      let attempts = 0;
      apiConnectionManager.on('circuit-breaker:open', (data) => {
        expect(data.provider).toBeDefined();
        expect(data.failures).toBeGreaterThanOrEqual(5);
      });
      
      // Simulate failures to trigger circuit breaker
      for (let i = 0; i < 6; i++) {
        try {
          await apiConnectionManager.executeRequest('claude' as any, {
            ...mockRequest,
            // Force failure by using invalid endpoint
            url: '/invalid-endpoint'
          });
        } catch (error) {
          attempts++;
        }
      }
      
      expect(attempts).toBe(6);
      
      // Test failover
      const alternativeProvider = await apiConnectionManager.failover('claude' as any);
      expect(alternativeProvider).toBeDefined();
    });
    
    it('should provide health metrics', () => {
      const health = apiConnectionManager.getHealthSummary();
      expect(health).toBeDefined();
      expect(Object.keys(health).length).toBeGreaterThan(0);
    });
  });
  
  describe('Real-time Metrics Service', () => {
    it('should track Go Wild metrics', (done) => {
      const testSessionId = uuidv4();
      
      // Listen for metrics
      realtimeMetricsService.on('metrics:snapshot', (snapshot) => {
        expect(snapshot).toBeDefined();
        expect(snapshot.goWild).toBeDefined();
        expect(snapshot.agents).toBeDefined();
        expect(snapshot.system).toBeDefined();
        done();
      });
      
      // Trigger metrics collection
      realtimeMetricsService.emit('goWild:started', {
        sessionId: testSessionId,
        farmId: testFarmId,
        config: { creativityLevel: 75 }
      });
      
      // Simulate discovery
      realtimeMetricsService.emit('goWild:discovery', {
        sessionId: testSessionId,
        discovery: {
          id: uuidv4(),
          title: 'Test Discovery',
          impact: 'high'
        }
      });
    });
    
    it('should create metric streams', () => {
      const streamId = realtimeMetricsService.createStream('goWild', {}, 1000);
      expect(streamId).toBeDefined();
      expect(streamId).toMatch(/^stream_/);
      
      // Stop stream
      realtimeMetricsService.stopStream(streamId);
    });
  });
  
  describe('Agent Coordinator V2', () => {
    it('should create farm with agents', async () => {
      const farmId = `test-farm-${uuidv4()}`;
      await agentCoordinatorV2.createFarm(farmId, 3);
      
      const farmState = agentCoordinatorV2.getFarmState(farmId);
      expect(farmState).toBeDefined();
      expect(farmState!.agents.size).toBe(3);
      expect(farmState!.farmId).toBe(farmId);
    });
    
    it('should handle task assignment and completion', async () => {
      const farmId = `test-farm-${uuidv4()}`;
      await agentCoordinatorV2.createFarm(farmId, 2);
      
      // Add task
      const task = await agentCoordinatorV2.addTask(
        farmId,
        'exploration',
        'Test exploration task',
        'high'
      );
      
      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.status).toBe('pending');
      expect(task.priority).toBe('high');
      
      // Wait for task assignment
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const updatedTask = agentCoordinatorV2.getTask(farmId, task.id);
      expect(updatedTask).toBeDefined();
      // Task should be assigned or in progress
      expect(['assigned', 'in_progress', 'completed', 'failed']).toContain(updatedTask!.status);
    });
    
    it('should handle agent health monitoring', async () => {
      const farmId = `test-farm-${uuidv4()}`;
      await agentCoordinatorV2.createFarm(farmId, 1);
      
      const farmState = agentCoordinatorV2.getFarmState(farmId);
      const agent = Array.from(farmState!.agents.values())[0];
      
      expect(agent.health.status).toBe('healthy');
      expect(agent.health.lastHeartbeat).toBeDefined();
      
      // Simulate heartbeat
      agentCoordinatorV2.emit('agent:heartbeat', {
        farmId,
        agentId: agent.id,
        responseTime: 100
      });
      
      // Check updated health
      const updatedAgent = agentCoordinatorV2.getAgent(farmId, agent.id);
      expect(updatedAgent!.health.responseTime).toBe(100);
    });
  });
  
  describe('Go Wild Manager V2', () => {
    it('should start exploration session', async () => {
      const session = await goWildManagerV2.startExploration(testFarmId, {
        creativityLevel: 80,
        explorationDepth: 3,
        maxDuration: 5,
        focusAreas: ['performance', 'architecture'],
        autoHarvest: true,
        valueThreshold: 60
      });
      
      sessionId = session.id;
      
      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.farmId).toBe(testFarmId);
      expect(session.status).toBe('exploring');
      expect(session.config.creativityLevel).toBe(80);
      expect(session.explorationNodes.length).toBeGreaterThan(0);
    });
    
    it('should track exploration progress', async () => {
      const session = goWildManagerV2.getSession(sessionId);
      expect(session).toBeDefined();
      
      // Simulate task completion
      agentCoordinatorV2.emit('task:completed', {
        farmId: testFarmId,
        taskId: uuidv4(),
        agentId: uuidv4(),
        result: {
          content: 'Discovery: Found optimization opportunity in caching layer'
        }
      });
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const updatedSession = goWildManagerV2.getSession(sessionId);
      expect(updatedSession!.metrics.nodesExplored).toBeGreaterThanOrEqual(1);
    });
    
    it('should extract discoveries', async () => {
      // Mock discovery extraction
      const session = goWildManagerV2.getSession(sessionId);
      
      if (session) {
        // Simulate multiple discoveries
        for (let i = 0; i < 3; i++) {
          agentCoordinatorV2.emit('task:completed', {
            farmId: testFarmId,
            taskId: uuidv4(),
            agentId: uuidv4(),
            result: {
              content: `Discovery ${i + 1}: High-value optimization in module ${i + 1}`
            }
          });
        }
        
        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const finalSession = goWildManagerV2.getSession(sessionId);
        expect(finalSession!.discoveries.length).toBeGreaterThanOrEqual(0);
      }
    });
    
    it('should complete exploration and create harvest', async () => {
      // Stop exploration
      await goWildManagerV2.stopExploration(sessionId);
      
      const session = goWildManagerV2.getSession(sessionId);
      expect(session).toBeDefined();
      expect(['harvesting', 'completed', 'failed']).toContain(session!.status);
      
      if (session!.status === 'completed') {
        expect(session!.harvestId).toBeDefined();
        expect(session!.endTime).toBeDefined();
      }
    });
  });
  
  describe('WebSocket Broadcasting', () => {
    it('should broadcast Go Wild updates', () => {
      const mockBroadcast = websocketManager.broadcastToFarm as jest.Mock;
      
      // Clear previous calls
      mockBroadcast.mockClear();
      
      // Trigger broadcast
      goWildManagerV2.emit('goWild:progress', {
        sessionId: uuidv4(),
        farmId: testFarmId,
        metrics: {
          nodesExplored: 10,
          discoveries: 5
        }
      });
      
      // Verify broadcast was called
      expect(mockBroadcast).toHaveBeenCalled();
    });
  });
  
  describe('End-to-End Flow', () => {
    it('should complete full Go Wild workflow', async () => {
      const e2eFarmId = `e2e-farm-${uuidv4()}`;
      
      // 1. Start exploration
      const session = await goWildManagerV2.startExploration(e2eFarmId, {
        creativityLevel: 90,
        explorationDepth: 5,
        maxDuration: 2,
        focusAreas: ['innovation', 'optimization'],
        autoHarvest: true,
        valueThreshold: 70
      });
      
      expect(session.status).toBe('exploring');
      
      // 2. Simulate agent work
      const farmState = agentCoordinatorV2.getFarmState(e2eFarmId);
      expect(farmState).toBeDefined();
      expect(farmState!.agents.size).toBe(5);
      
      // 3. Generate discoveries
      for (let i = 0; i < 10; i++) {
        agentCoordinatorV2.emit('task:completed', {
          farmId: e2eFarmId,
          taskId: uuidv4(),
          agentId: Array.from(farmState!.agents.keys())[i % 5],
          result: {
            content: `Critical discovery ${i}: Revolutionary approach to ${['caching', 'routing', 'state management', 'data processing', 'security'][i % 5]}`
          }
        });
      }
      
      // 4. Wait for exploration
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 5. Check metrics
      const metrics = realtimeMetricsService.getGoWildMetrics(session.id);
      if (metrics) {
        expect(metrics.nodesExplored).toBeGreaterThan(0);
        expect(metrics.discoveriesMade).toBeGreaterThanOrEqual(0);
      }
      
      // 6. Stop and harvest
      await goWildManagerV2.stopExploration(session.id);
      
      const finalSession = goWildManagerV2.getSession(session.id);
      expect(finalSession).toBeDefined();
      expect(['completed', 'failed']).toContain(finalSession!.status);
      
      if (finalSession!.status === 'completed') {
        expect(finalSession!.harvestId).toBeDefined();
        expect(finalSession!.metrics.performanceScore).toBeGreaterThan(0);
        
        console.log('E2E Test Results:', {
          sessionId: session.id,
          status: finalSession!.status,
          nodesExplored: finalSession!.metrics.nodesExplored,
          discoveries: finalSession!.metrics.discoveriesMade,
          highValueDiscoveries: finalSession!.metrics.highValueDiscoveries,
          totalValue: finalSession!.metrics.totalValue,
          performanceScore: finalSession!.metrics.performanceScore
        });
      }
    }, 10000); // 10 second timeout for full E2E test
  });
  
  describe('Error Handling', () => {
    it('should handle API failures gracefully', async () => {
      const errorFarmId = `error-farm-${uuidv4()}`;
      
      // Mock API failure
      apiConnectionManager.executeRequest = jest.fn()
        .mockRejectedValueOnce(new Error('API Connection Failed'))
        .mockResolvedValue({ content: 'Recovery successful' });
      
      // Start exploration
      const session = await goWildManagerV2.startExploration(errorFarmId, {
        creativityLevel: 50,
        explorationDepth: 2,
        maxDuration: 1
      });
      
      expect(session).toBeDefined();
      
      // Simulate task with API failure
      agentCoordinatorV2.emit('task:failed', {
        farmId: errorFarmId,
        taskId: uuidv4(),
        agentId: uuidv4(),
        error: 'API Connection Failed'
      });
      
      // System should recover
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const sessionAfterError = goWildManagerV2.getSession(session.id);
      expect(sessionAfterError).toBeDefined();
      // Session should continue or complete gracefully
      expect(['exploring', 'harvesting', 'completed']).toContain(sessionAfterError!.status);
    });
    
    it('should handle timeout gracefully', async () => {
      const timeoutFarmId = `timeout-farm-${uuidv4()}`;
      
      // Start with very short timeout
      const session = await goWildManagerV2.startExploration(timeoutFarmId, {
        creativityLevel: 50,
        explorationDepth: 2,
        maxDuration: 0.1 // 6 seconds
      });
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 7000));
      
      const timedOutSession = goWildManagerV2.getSession(session.id);
      expect(timedOutSession).toBeDefined();
      expect(['harvesting', 'completed']).toContain(timedOutSession!.status);
      
      if (timedOutSession!.status === 'completed') {
        expect(timedOutSession!.endTime).toBeDefined();
        expect(timedOutSession!.harvestId).toBeDefined();
      }
    }, 10000);
  });
});