/**
 * Integration test for agent connection and task distribution
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { orchestratorService } from '../../apps/api/src/services/unified/farmService';
import { agentHandshakeService } from '../../apps/api/src/services/agentHandshakeService';
import { taskQueueManager } from '../../apps/api/src/services/taskQueueManager';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('Agent Connection Flow', () => {
  const testFarmId = `test-farm-${uuidv4().substring(0, 8)}`;
  let processId: string;
  
  beforeAll(async () => {
    // Ensure test coordination directory exists
    const coordinationDir = path.join(process.cwd(), 'maibarn', 'coordination', 'test');
    await fs.mkdir(coordinationDir, { recursive: true });
  });
  
  afterAll(async () => {
    // Cleanup test farm if it exists
    if (processId) {
      try {
        await orchestratorService.stopFarm(processId);
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    }
  });
  
  describe('Agent Wrapper Launch', () => {
    it('should launch agent wrapper and register with handshake service', async () => {
      // Launch a test farm with 2 agents
      processId = await orchestratorService.launchFarm({
        farmId: testFarmId,
        name: 'Test Farm',
        description: 'Testing agent connection flow',
        numberOfAgents: 2,
        prompt: 'This is a test prompt for agent connection verification',
        provider: 'mock', // Use mock provider for testing
        timeout: 60, // 1 minute timeout for test
        debug: true
      });
      
      expect(processId).toBeDefined();
      
      // Wait for agents to register (with timeout)
      const maxWaitTime = 30000; // 30 seconds
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        const connectedAgents = agentHandshakeService.getConnectedAgents();
        const farmAgents = connectedAgents.filter(a => a.farmId === testFarmId);
        
        if (farmAgents.length >= 2) {
          // Agents registered successfully
          expect(farmAgents).toHaveLength(2);
          
          // Verify agent properties
          farmAgents.forEach((agent, index) => {
            expect(agent.agentId).toContain(testFarmId);
            expect(agent.farmId).toBe(testFarmId);
            expect(agent.provider).toBe('mock');
            expect(agent.status).toMatch(/ready|idle|working/);
          });
          
          break;
        }
        
        // Wait before checking again
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Verify agents were registered
      const finalAgents = agentHandshakeService.getConnectedAgents()
        .filter(a => a.farmId === testFarmId);
      
      expect(finalAgents).toHaveLength(2);
    }, 60000); // 60 second timeout for test
  });
  
  describe('Task Distribution', () => {
    it('should distribute tasks to registered agents', async () => {
      // Submit a task to the farm
      const taskIds = await orchestratorService.sendPromptToFarm(
        testFarmId,
        'Test task: Calculate 2 + 2',
        { testContext: true }
      );
      
      expect(taskIds).toBeDefined();
      expect(taskIds.length).toBeGreaterThan(0);
      
      // Wait for task completion (mock provider should complete quickly)
      const maxWaitTime = 10000; // 10 seconds
      const startTime = Date.now();
      let taskCompleted = false;
      
      while (Date.now() - startTime < maxWaitTime && !taskCompleted) {
        for (const taskId of taskIds) {
          const result = taskQueueManager.getTaskResult(taskId);
          if (result) {
            taskCompleted = true;
            
            // Verify task result
            expect(result.taskId).toBe(taskId);
            expect(result.agentId).toContain(testFarmId);
            expect(result.result).toBeDefined();
            
            break;
          }
        }
        
        if (!taskCompleted) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      expect(taskCompleted).toBe(true);
    }, 30000); // 30 second timeout
  });
  
  describe('Agent Status Updates', () => {
    it('should track agent status changes', async () => {
      const agents = agentHandshakeService.getConnectedAgents()
        .filter(a => a.farmId === testFarmId);
      
      expect(agents.length).toBeGreaterThan(0);
      
      // Submit a task to trigger status change
      const taskId = await taskQueueManager.submitTask({
        prompt: 'Status test task',
        context: { farmId: testFarmId },
        priority: 100
      });
      
      // Wait for status change
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if any agent picked up the task
      const status = taskQueueManager.getTaskStatus(taskId);
      expect(status).toBeDefined();
      expect(['assigned', 'in_progress', 'completed']).toContain(status?.status);
    }, 10000);
  });
  
  describe('Queue Statistics', () => {
    it('should provide accurate queue statistics', () => {
      const stats = taskQueueManager.getQueueStats();
      
      expect(stats).toBeDefined();
      expect(stats.totalAgents).toBeGreaterThanOrEqual(2);
      expect(stats.availableAgents).toBeGreaterThanOrEqual(0);
      expect(stats.completed).toBeGreaterThanOrEqual(0);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle invalid farm ID gracefully', async () => {
      await expect(
        orchestratorService.sendPromptToFarm('invalid-farm-id', 'test')
      ).rejects.toThrow('Farm invalid-farm-id not found');
    });
    
    it('should handle agent disconnection', async () => {
      // Simulate agent disconnection by updating status
      const agents = agentHandshakeService.getConnectedAgents()
        .filter(a => a.farmId === testFarmId);
      
      if (agents.length > 0) {
        await agentHandshakeService.updateAgentStatus(
          agents[0].agentId,
          agentHandshakeService.AgentStatus.DISCONNECTED
        );
        
        // Verify agent is marked as disconnected
        const updatedAgent = agentHandshakeService.getAgent(agents[0].agentId);
        expect(updatedAgent?.status).toBe(agentHandshakeService.AgentStatus.DISCONNECTED);
      }
    });
  });
});

describe('Agent Wrapper Unit Tests', () => {
  describe('Mock Provider', () => {
    it('should handle mock provider correctly', async () => {
      // This would test the agent wrapper directly
      // For now, we're testing through the orchestrator
      
      const testFarmId = `mock-test-${uuidv4().substring(0, 8)}`;
      
      const processId = await orchestratorService.launchFarm({
        farmId: testFarmId,
        name: 'Mock Test',
        description: 'Testing mock provider',
        numberOfAgents: 1,
        prompt: 'Mock provider test',
        provider: 'mock',
        timeout: 30
      });
      
      expect(processId).toBeDefined();
      
      // Cleanup
      await orchestratorService.stopFarm(processId);
    }, 30000);
  });
});