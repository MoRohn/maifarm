import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { OrchestratorService } from '../../services/OrchestratorService';
import { CoordinationService } from '../../services/coordinationService';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('child_process');
jest.mock('../../services/coordinationService');
jest.mock('../../services/farmManager');

describe('Multi-Agent Coordination', () => {
  let orchestratorService: OrchestratorService;
  let coordinationService: CoordinationService;
  let eventEmitter: EventEmitter;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    eventEmitter = new EventEmitter();
    coordinationService = new CoordinationService();
    orchestratorService = new OrchestratorService();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('Agent Initialization and Registration', () => {
    it('should initialize multiple agents with unique IDs', async () => {
      const config = {
        agentCount: 3,
        taskPrompt: 'Build a REST API',
        provider: 'claude' as const
      };

      const agents = await orchestratorService.initializeAgents(config);
      
      expect(agents).toHaveLength(3);
      expect(new Set(agents.map(a => a.id)).size).toBe(3); // All IDs unique
      agents.forEach(agent => {
        expect(agent.status).toBe('initializing');
        expect(agent.provider).toBe('claude');
      });
    });

    it('should register agents in coordination file', async () => {
      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify({ agents: [] }));

      const agents = [
        { id: 'agent-1', status: 'active', role: 'frontend' },
        { id: 'agent-2', status: 'active', role: 'backend' },
        { id: 'agent-3', status: 'active', role: 'testing' }
      ];

      await coordinationService.registerAgents(agents);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('active_agents.json'),
        expect.stringContaining('agent-1'),
        'utf-8'
      );
    });

    it('should handle agent registration failures gracefully', async () => {
      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.writeFile.mockRejectedValue(new Error('Permission denied'));

      const agents = [{ id: 'agent-1', status: 'active' }];
      
      const result = await coordinationService.registerAgents(agents);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });
  });

  describe('Task Distribution', () => {
    it('should distribute tasks evenly among agents', async () => {
      const agents = [
        { id: 'agent-1', status: 'idle', workload: 0 },
        { id: 'agent-2', status: 'idle', workload: 0 },
        { id: 'agent-3', status: 'idle', workload: 0 }
      ];

      const tasks = [
        { id: 'task-1', type: 'code', priority: 1 },
        { id: 'task-2', type: 'test', priority: 2 },
        { id: 'task-3', type: 'docs', priority: 3 },
        { id: 'task-4', type: 'code', priority: 1 },
        { id: 'task-5', type: 'test', priority: 2 },
        { id: 'task-6', type: 'docs', priority: 3 }
      ];

      const distribution = await orchestratorService.distributeTasks(agents, tasks);
      
      // Each agent should get 2 tasks
      expect(distribution['agent-1']).toHaveLength(2);
      expect(distribution['agent-2']).toHaveLength(2);
      expect(distribution['agent-3']).toHaveLength(2);
    });

    it('should prioritize high-priority tasks', async () => {
      const agents = [
        { id: 'agent-1', status: 'idle', capabilities: ['code', 'test'] }
      ];

      const tasks = [
        { id: 'task-1', type: 'code', priority: 3 }, // Low priority
        { id: 'task-2', type: 'test', priority: 1 }, // High priority
        { id: 'task-3', type: 'code', priority: 2 }  // Medium priority
      ];

      const distribution = await orchestratorService.distributeTasks(agents, tasks);
      
      expect(distribution['agent-1'][0].id).toBe('task-2'); // High priority first
      expect(distribution['agent-1'][1].id).toBe('task-3'); // Medium priority second
      expect(distribution['agent-1'][2].id).toBe('task-1'); // Low priority last
    });

    it('should match agent capabilities with task requirements', async () => {
      const agents = [
        { id: 'agent-1', status: 'idle', capabilities: ['frontend', 'react'] },
        { id: 'agent-2', status: 'idle', capabilities: ['backend', 'nodejs'] },
        { id: 'agent-3', status: 'idle', capabilities: ['testing', 'jest'] }
      ];

      const tasks = [
        { id: 'task-1', type: 'frontend', requirements: ['react'] },
        { id: 'task-2', type: 'backend', requirements: ['nodejs'] },
        { id: 'task-3', type: 'testing', requirements: ['jest'] }
      ];

      const distribution = await orchestratorService.distributeTasks(agents, tasks);
      
      expect(distribution['agent-1']).toContainEqual(
        expect.objectContaining({ id: 'task-1' })
      );
      expect(distribution['agent-2']).toContainEqual(
        expect.objectContaining({ id: 'task-2' })
      );
      expect(distribution['agent-3']).toContainEqual(
        expect.objectContaining({ id: 'task-3' })
      );
    });

    it('should handle task dependencies', async () => {
      const agents = [
        { id: 'agent-1', status: 'idle' },
        { id: 'agent-2', status: 'idle' }
      ];

      const tasks = [
        { id: 'task-1', dependencies: [] },
        { id: 'task-2', dependencies: ['task-1'] }, // Depends on task-1
        { id: 'task-3', dependencies: ['task-1', 'task-2'] } // Depends on both
      ];

      const executionPlan = await orchestratorService.createExecutionPlan(tasks);
      
      expect(executionPlan.phases).toHaveLength(3);
      expect(executionPlan.phases[0]).toContain('task-1');
      expect(executionPlan.phases[1]).toContain('task-2');
      expect(executionPlan.phases[2]).toContain('task-3');
    });
  });

  describe('Agent Communication', () => {
    it('should broadcast messages to all agents', async () => {
      const mockFs = fs as jest.Mocked<typeof fs>;
      const agents = ['agent-1', 'agent-2', 'agent-3'];
      
      const message = {
        type: 'task_update',
        from: 'agent-1',
        data: { taskId: 'task-1', status: 'completed' }
      };

      await coordinationService.broadcast(message, agents);
      
      // Should write to each agent's message queue
      expect(mockFs.writeFile).toHaveBeenCalledTimes(agents.length);
      agents.forEach(agentId => {
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          expect.stringContaining(agentId),
          expect.stringContaining('task_update'),
          'utf-8'
        );
      });
    });

    it('should handle direct agent-to-agent communication', async () => {
      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.appendFile.mockResolvedValue(undefined);

      const message = {
        from: 'agent-1',
        to: 'agent-2',
        type: 'collaboration_request',
        data: { taskId: 'shared-task', proposal: 'Pair programming on API' }
      };

      await coordinationService.sendDirectMessage(message);
      
      expect(mockFs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('agent-2'),
        expect.stringContaining('collaboration_request'),
        'utf-8'
      );
    });

    it('should implement message acknowledgment system', async () => {
      const message = {
        id: 'msg-123',
        from: 'agent-1',
        to: 'agent-2',
        requiresAck: true,
        data: { task: 'critical-update' }
      };

      const ackPromise = coordinationService.sendWithAck(message, 5000);
      
      // Simulate acknowledgment after 1 second
      setTimeout(() => {
        coordinationService.acknowledgeMessage('msg-123', 'agent-2');
      }, 1000);

      jest.advanceTimersByTime(1500);
      
      const result = await ackPromise;
      expect(result.acknowledged).toBe(true);
      expect(result.acknowledgedBy).toBe('agent-2');
    });

    it('should timeout on unacknowledged messages', async () => {
      const message = {
        id: 'msg-456',
        from: 'agent-1',
        to: 'agent-2',
        requiresAck: true,
        data: { task: 'update' }
      };

      const ackPromise = coordinationService.sendWithAck(message, 2000);
      
      jest.advanceTimersByTime(3000); // Past timeout
      
      await expect(ackPromise).rejects.toThrow('Message acknowledgment timeout');
    });
  });

  describe('Load Balancing', () => {
    it('should redistribute tasks from overloaded agents', async () => {
      const agents = [
        { id: 'agent-1', status: 'busy', workload: 10, maxWorkload: 5 },
        { id: 'agent-2', status: 'idle', workload: 1, maxWorkload: 5 },
        { id: 'agent-3', status: 'idle', workload: 2, maxWorkload: 5 }
      ];

      const rebalanced = await orchestratorService.rebalanceWorkload(agents);
      
      // Workload should be more evenly distributed
      expect(rebalanced.every(a => a.workload <= a.maxWorkload)).toBe(true);
      
      const totalWorkload = agents.reduce((sum, a) => sum + a.workload, 0);
      const rebalancedTotal = rebalanced.reduce((sum, a) => sum + a.workload, 0);
      expect(rebalancedTotal).toBe(totalWorkload); // No work lost
    });

    it('should consider agent performance metrics', async () => {
      const agents = [
        { id: 'agent-1', performance: { avgTaskTime: 100, successRate: 0.95 } },
        { id: 'agent-2', performance: { avgTaskTime: 200, successRate: 0.80 } },
        { id: 'agent-3', performance: { avgTaskTime: 150, successRate: 0.90 } }
      ];

      const complexTask = { id: 'complex-1', complexity: 'high', estimatedTime: 300 };
      
      const assignment = await orchestratorService.assignTask(complexTask, agents);
      
      // Should assign to agent-1 (best performance)
      expect(assignment.agentId).toBe('agent-1');
    });

    it('should handle agent failures and reassign tasks', async () => {
      const agents = [
        { id: 'agent-1', status: 'active', tasks: ['task-1', 'task-2'] },
        { id: 'agent-2', status: 'active', tasks: [] },
        { id: 'agent-3', status: 'active', tasks: ['task-3'] }
      ];

      // Simulate agent-1 failure
      await orchestratorService.handleAgentFailure('agent-1', agents);
      
      // Tasks should be reassigned
      const remainingAgents = agents.filter(a => a.id !== 'agent-1');
      const allTasks = remainingAgents.flatMap(a => a.tasks);
      
      expect(allTasks).toContain('task-1');
      expect(allTasks).toContain('task-2');
      expect(allTasks).toContain('task-3');
    });
  });

  describe('Consensus Mechanisms', () => {
    it('should achieve consensus on task completion', async () => {
      const agents = ['agent-1', 'agent-2', 'agent-3'];
      const taskId = 'task-consensus-1';
      
      // Agents vote on task completion
      await coordinationService.submitVote(taskId, 'agent-1', 'complete');
      await coordinationService.submitVote(taskId, 'agent-2', 'complete');
      await coordinationService.submitVote(taskId, 'agent-3', 'incomplete');
      
      const consensus = await coordinationService.checkConsensus(taskId, agents);
      
      expect(consensus.reached).toBe(true);
      expect(consensus.decision).toBe('complete'); // Majority wins
      expect(consensus.votes).toEqual({
        complete: 2,
        incomplete: 1
      });
    });

    it('should handle split decisions with tiebreaker', async () => {
      const agents = ['agent-1', 'agent-2', 'agent-3', 'agent-4'];
      const taskId = 'task-split-1';
      
      await coordinationService.submitVote(taskId, 'agent-1', 'approach-A');
      await coordinationService.submitVote(taskId, 'agent-2', 'approach-A');
      await coordinationService.submitVote(taskId, 'agent-3', 'approach-B');
      await coordinationService.submitVote(taskId, 'agent-4', 'approach-B');
      
      const consensus = await coordinationService.checkConsensus(
        taskId, 
        agents,
        { tiebreakerAgent: 'agent-1' } // Agent-1 is lead
      );
      
      expect(consensus.reached).toBe(true);
      expect(consensus.decision).toBe('approach-A'); // Tiebreaker's choice
    });

    it('should implement quorum requirements', async () => {
      const agents = ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5'];
      const taskId = 'task-quorum-1';
      
      // Only 2 out of 5 agents vote
      await coordinationService.submitVote(taskId, 'agent-1', 'approve');
      await coordinationService.submitVote(taskId, 'agent-2', 'approve');
      
      const consensus = await coordinationService.checkConsensus(
        taskId,
        agents,
        { quorumPercent: 0.6 } // Require 60% participation
      );
      
      expect(consensus.reached).toBe(false);
      expect(consensus.reason).toBe('Insufficient quorum');
    });
  });

  describe('Agent Health Monitoring', () => {
    it('should detect unresponsive agents', async () => {
      const agents = [
        { id: 'agent-1', lastHeartbeat: Date.now() },
        { id: 'agent-2', lastHeartbeat: Date.now() - 65000 }, // Over 1 minute
        { id: 'agent-3', lastHeartbeat: Date.now() - 10000 }
      ];

      const healthCheck = await orchestratorService.checkAgentHealth(agents);
      
      expect(healthCheck['agent-1'].status).toBe('healthy');
      expect(healthCheck['agent-2'].status).toBe('unresponsive');
      expect(healthCheck['agent-3'].status).toBe('healthy');
    });

    it('should restart failed agents automatically', async () => {
      const agent = {
        id: 'agent-1',
        status: 'failed',
        restartCount: 0,
        maxRestarts: 3
      };

      const restarted = await orchestratorService.restartAgent(agent);
      
      expect(restarted.status).toBe('restarting');
      expect(restarted.restartCount).toBe(1);
    });

    it('should prevent infinite restart loops', async () => {
      const agent = {
        id: 'agent-1',
        status: 'failed',
        restartCount: 3,
        maxRestarts: 3
      };

      await expect(
        orchestratorService.restartAgent(agent)
      ).rejects.toThrow('Maximum restart attempts exceeded');
    });

    it('should track agent resource usage', async () => {
      const metrics = await orchestratorService.getAgentMetrics('agent-1');
      
      expect(metrics).toHaveProperty('cpuUsage');
      expect(metrics).toHaveProperty('memoryUsage');
      expect(metrics).toHaveProperty('taskThroughput');
      expect(metrics).toHaveProperty('errorRate');
      expect(metrics.cpuUsage).toBeGreaterThanOrEqual(0);
      expect(metrics.cpuUsage).toBeLessThanOrEqual(100);
    });
  });

  describe('Coordination Strategies', () => {
    it('should implement leader election', async () => {
      const agents = [
        { id: 'agent-1', priority: 2 },
        { id: 'agent-2', priority: 1 },
        { id: 'agent-3', priority: 3 }
      ];

      const leader = await coordinationService.electLeader(agents);
      
      expect(leader.id).toBe('agent-3'); // Highest priority
      expect(leader.role).toBe('leader');
    });

    it('should handle leader failure and re-election', async () => {
      let agents = [
        { id: 'agent-1', role: 'leader', status: 'active' },
        { id: 'agent-2', role: 'follower', status: 'active' },
        { id: 'agent-3', role: 'follower', status: 'active' }
      ];

      // Leader fails
      agents[0].status = 'failed';
      
      const newLeader = await coordinationService.handleLeaderFailure(agents);
      
      expect(newLeader.id).not.toBe('agent-1');
      expect(newLeader.role).toBe('leader');
    });

    it('should coordinate parallel task execution', async () => {
      const tasks = [
        { id: 'task-1', canParallelize: true },
        { id: 'task-2', canParallelize: true },
        { id: 'task-3', canParallelize: false, dependencies: ['task-1', 'task-2'] }
      ];

      const executionPlan = await orchestratorService.planParallelExecution(tasks);
      
      expect(executionPlan.parallel).toContain('task-1');
      expect(executionPlan.parallel).toContain('task-2');
      expect(executionPlan.sequential).toContain('task-3');
    });
  });

  describe('Work Claims System', () => {
    it('should prevent duplicate work claims', async () => {
      const task = { id: 'task-1', type: 'implementation' };
      
      const claim1 = await coordinationService.claimWork('agent-1', task);
      const claim2 = await coordinationService.claimWork('agent-2', task);
      
      expect(claim1.success).toBe(true);
      expect(claim2.success).toBe(false);
      expect(claim2.reason).toBe('Already claimed by agent-1');
    });

    it('should expire stale work claims', async () => {
      const task = { id: 'task-1', type: 'implementation' };
      
      await coordinationService.claimWork('agent-1', task, { ttl: 2000 });
      
      // Check claim exists
      let owner = await coordinationService.getWorkOwner('task-1');
      expect(owner).toBe('agent-1');
      
      // Advance time past TTL
      jest.advanceTimersByTime(3000);
      
      // Claim should be expired
      owner = await coordinationService.getWorkOwner('task-1');
      expect(owner).toBeNull();
    });

    it('should track work progress', async () => {
      const task = { id: 'task-1', type: 'feature' };
      
      await coordinationService.claimWork('agent-1', task);
      await coordinationService.updateWorkProgress('task-1', 'agent-1', {
        progress: 25,
        status: 'in_progress',
        details: 'Setting up project structure'
      });
      
      const progress = await coordinationService.getWorkProgress('task-1');
      
      expect(progress.progress).toBe(25);
      expect(progress.status).toBe('in_progress');
      expect(progress.owner).toBe('agent-1');
    });
  });
});