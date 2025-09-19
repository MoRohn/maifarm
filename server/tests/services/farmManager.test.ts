import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { FarmManager } from '../../services/unified/farmService';
import { FarmConfig, FarmStatus, Agent, TaskStatus } from '../../types/farm';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('../../database/client');
jest.mock('../../websocket/socketServer');
jest.mock('../../services/agentManager');
jest.mock('../../services/coordinationService');
jest.mock('child_process');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('FarmManager', () => {
  let farmManager: FarmManager;
  let mockEventEmitter: EventEmitter;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEventEmitter = new EventEmitter();
    farmManager = new FarmManager();
  });

  afterEach(() => {
    mockEventEmitter.removeAllListeners();
  });

  describe('Farm Creation', () => {
    it('should create a new farm with valid configuration', async () => {
      const farmConfig: FarmConfig = {
        id: 'test-farm-123',
        name: 'Test Farm',
        description: 'A test farm for unit testing',
        agents: [
          {
            id: 'agent-1',
            name: 'Test Agent 1',
            type: 'claude',
            role: 'developer',
            capabilities: ['coding', 'testing'],
            status: 'idle' as const,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        tasks: [
          {
            id: 'task-1',
            title: 'Test Task',
            description: 'A test task',
            status: 'pending' as TaskStatus,
            assignedAgent: 'agent-1',
            priority: 1,
            dependencies: [],
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        settings: {
          maxConcurrentAgents: 5,
          autoScale: true,
          resourceLimits: {
            cpu: 80,
            memory: 90,
            timeout: 3600000
          }
        },
        status: 'initializing' as FarmStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const result = await farmManager.createFarm(farmConfig);

      expect(result).toMatchObject({
        id: farmConfig.id,
        name: farmConfig.name,
        status: 'initializing'
      });

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining(farmConfig.id),
        { recursive: true }
      );

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('config.json'),
        expect.stringContaining(farmConfig.name)
      );
    });

    it('should reject farm creation with invalid configuration', async () => {
      const invalidConfig = {
        // Missing required fields
        name: 'Invalid Farm'
      } as any;

      await expect(farmManager.createFarm(invalidConfig)).rejects.toThrow(
        'Invalid farm configuration'
      );
    });

    it('should handle duplicate farm IDs', async () => {
      const farmConfig: FarmConfig = {
        id: 'duplicate-farm',
        name: 'Duplicate Farm',
        agents: [],
        tasks: [],
        settings: {
          maxConcurrentAgents: 5,
          autoScale: false,
          resourceLimits: {
            cpu: 80,
            memory: 90,
            timeout: 3600000
          }
        },
        status: 'initializing',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      // Create first farm
      await farmManager.createFarm(farmConfig);

      // Try to create duplicate
      mockFs.mkdir.mockRejectedValue(new Error('EEXIST: file already exists'));

      await expect(farmManager.createFarm(farmConfig)).rejects.toThrow(
        'Farm with ID duplicate-farm already exists'
      );
    });
  });

  describe('Farm Status Management', () => {
    const farmId = 'status-test-farm';

    beforeEach(async () => {
      const farmConfig: FarmConfig = {
        id: farmId,
        name: 'Status Test Farm',
        agents: [],
        tasks: [],
        settings: {
          maxConcurrentAgents: 3,
          autoScale: false,
          resourceLimits: {
            cpu: 80,
            memory: 90,
            timeout: 3600000
          }
        },
        status: 'initializing',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(farmConfig));

      await farmManager.createFarm(farmConfig);
    });

    it('should update farm status to running', async () => {
      const result = await farmManager.updateFarmStatus(farmId, 'running');

      expect(result.status).toBe('running');
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('config.json'),
        expect.stringContaining('"status":"running"')
      );
    });

    it('should update farm status to paused', async () => {
      const result = await farmManager.updateFarmStatus(farmId, 'paused');

      expect(result.status).toBe('paused');
      expect(result.pausedAt).toBeDefined();
    });

    it('should update farm status to completed', async () => {
      const result = await farmManager.updateFarmStatus(farmId, 'completed');

      expect(result.status).toBe('completed');
      expect(result.completedAt).toBeDefined();
    });

    it('should emit status change events', async () => {
      const statusHandler = jest.fn();
      farmManager.on('statusChange', statusHandler);

      await farmManager.updateFarmStatus(farmId, 'running');

      expect(statusHandler).toHaveBeenCalledWith({
        farmId,
        oldStatus: 'initializing',
        newStatus: 'running',
        timestamp: expect.any(Date)
      });
    });

    it('should prevent invalid status transitions', async () => {
      await farmManager.updateFarmStatus(farmId, 'completed');

      await expect(
        farmManager.updateFarmStatus(farmId, 'running')
      ).rejects.toThrow('Invalid status transition from completed to running');
    });
  });

  describe('Agent Management', () => {
    const farmId = 'agent-test-farm';

    beforeEach(async () => {
      const farmConfig: FarmConfig = {
        id: farmId,
        name: 'Agent Test Farm',
        agents: [],
        tasks: [],
        settings: {
          maxConcurrentAgents: 3,
          autoScale: true,
          resourceLimits: {
            cpu: 80,
            memory: 90,
            timeout: 3600000
          }
        },
        status: 'running',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(farmConfig));

      await farmManager.createFarm(farmConfig);
    });

    it('should add agent to farm', async () => {
      const agent: Agent = {
        id: 'new-agent',
        name: 'New Agent',
        type: 'claude',
        role: 'developer',
        capabilities: ['coding'],
        status: 'idle',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await farmManager.addAgent(farmId, agent);

      expect(result.agents).toContainEqual(expect.objectContaining({
        id: agent.id,
        name: agent.name
      }));
    });

    it('should not exceed max concurrent agents', async () => {
      // Add agents up to the limit
      for (let i = 0; i < 3; i++) {
        const agent: Agent = {
          id: `agent-${i}`,
          name: `Agent ${i}`,
          type: 'claude',
          role: 'developer',
          capabilities: ['coding'],
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date()
        };
        await farmManager.addAgent(farmId, agent);
      }

      // Try to add one more active agent
      const extraAgent: Agent = {
        id: 'extra-agent',
        name: 'Extra Agent',
        type: 'claude',
        role: 'developer',
        capabilities: ['coding'],
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await expect(farmManager.addAgent(farmId, extraAgent)).rejects.toThrow(
        'Maximum concurrent agents limit reached'
      );
    });

    it('should remove agent from farm', async () => {
      const agent: Agent = {
        id: 'remove-agent',
        name: 'Remove Agent',
        type: 'claude',
        role: 'developer',
        capabilities: ['coding'],
        status: 'idle',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await farmManager.addAgent(farmId, agent);
      const result = await farmManager.removeAgent(farmId, agent.id);

      expect(result.agents).not.toContainEqual(
        expect.objectContaining({ id: agent.id })
      );
    });

    it('should update agent status', async () => {
      const agent: Agent = {
        id: 'status-agent',
        name: 'Status Agent',
        type: 'claude',
        role: 'developer',
        capabilities: ['coding'],
        status: 'idle',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await farmManager.addAgent(farmId, agent);
      const result = await farmManager.updateAgentStatus(farmId, agent.id, 'active');

      const updatedAgent = result.agents.find(a => a.id === agent.id);
      expect(updatedAgent?.status).toBe('active');
    });
  });

  describe('Task Management', () => {
    const farmId = 'task-test-farm';

    beforeEach(async () => {
      const farmConfig: FarmConfig = {
        id: farmId,
        name: 'Task Test Farm',
        agents: [
          {
            id: 'worker-agent',
            name: 'Worker Agent',
            type: 'claude',
            role: 'developer',
            capabilities: ['coding'],
            status: 'idle',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        tasks: [],
        settings: {
          maxConcurrentAgents: 3,
          autoScale: false,
          resourceLimits: {
            cpu: 80,
            memory: 90,
            timeout: 3600000
          }
        },
        status: 'running',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(farmConfig));

      await farmManager.createFarm(farmConfig);
    });

    it('should assign task to available agent', async () => {
      const task = {
        id: 'task-1',
        title: 'Test Task',
        description: 'A test task',
        status: 'pending' as TaskStatus,
        priority: 1,
        dependencies: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await farmManager.assignTask(farmId, task);

      expect(result.assignedAgent).toBe('worker-agent');
      expect(result.status).toBe('assigned');
    });

    it('should queue task when no agents available', async () => {
      // Set agent to busy
      await farmManager.updateAgentStatus(farmId, 'worker-agent', 'busy');

      const task = {
        id: 'task-2',
        title: 'Queued Task',
        description: 'A task that should be queued',
        status: 'pending' as TaskStatus,
        priority: 1,
        dependencies: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await farmManager.assignTask(farmId, task);

      expect(result.assignedAgent).toBeUndefined();
      expect(result.status).toBe('queued');
    });

    it('should respect task dependencies', async () => {
      const task1 = {
        id: 'task-dep-1',
        title: 'Dependency Task',
        description: 'Must complete first',
        status: 'pending' as TaskStatus,
        priority: 1,
        dependencies: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const task2 = {
        id: 'task-dep-2',
        title: 'Dependent Task',
        description: 'Depends on task-dep-1',
        status: 'pending' as TaskStatus,
        priority: 1,
        dependencies: ['task-dep-1'],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await farmManager.assignTask(farmId, task1);
      const result = await farmManager.assignTask(farmId, task2);

      expect(result.status).toBe('waiting');
      expect(result.waitingFor).toContain('task-dep-1');
    });

    it('should prioritize high priority tasks', async () => {
      const lowPriorityTask = {
        id: 'low-priority',
        title: 'Low Priority Task',
        description: 'Low priority',
        status: 'pending' as TaskStatus,
        priority: 3,
        dependencies: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const highPriorityTask = {
        id: 'high-priority',
        title: 'High Priority Task',
        description: 'High priority',
        status: 'pending' as TaskStatus,
        priority: 1,
        dependencies: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Queue both tasks
      await farmManager.updateAgentStatus(farmId, 'worker-agent', 'busy');
      await farmManager.assignTask(farmId, lowPriorityTask);
      await farmManager.assignTask(farmId, highPriorityTask);

      // Free up agent
      await farmManager.updateAgentStatus(farmId, 'worker-agent', 'idle');

      // Process queue
      const nextTask = await farmManager.getNextTask(farmId);
      expect(nextTask?.id).toBe('high-priority');
    });
  });

  describe('Resource Management', () => {
    const farmId = 'resource-test-farm';

    beforeEach(async () => {
      const farmConfig: FarmConfig = {
        id: farmId,
        name: 'Resource Test Farm',
        agents: [],
        tasks: [],
        settings: {
          maxConcurrentAgents: 3,
          autoScale: true,
          resourceLimits: {
            cpu: 80,
            memory: 90,
            timeout: 3600000
          }
        },
        status: 'running',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(farmConfig));

      await farmManager.createFarm(farmConfig);
    });

    it('should monitor resource usage', async () => {
      const metrics = await farmManager.getResourceMetrics(farmId);

      expect(metrics).toMatchObject({
        cpu: expect.any(Number),
        memory: expect.any(Number),
        activeAgents: expect.any(Number),
        queuedTasks: expect.any(Number)
      });
    });

    it('should trigger auto-scaling when threshold reached', async () => {
      // Simulate high load
      const highLoadMetrics = {
        cpu: 85,
        memory: 95,
        activeAgents: 3,
        queuedTasks: 10
      };

      jest.spyOn(farmManager, 'getResourceMetrics').mockResolvedValue(highLoadMetrics);

      const scalingDecision = await farmManager.checkAutoScaling(farmId);

      expect(scalingDecision).toMatchObject({
        shouldScale: true,
        direction: 'up',
        reason: expect.stringContaining('high')
      });
    });

    it('should respect resource limits', async () => {
      // Try to exceed CPU limit
      const exceedLimitMetrics = {
        cpu: 95,
        memory: 85,
        activeAgents: 2,
        queuedTasks: 5
      };

      jest.spyOn(farmManager, 'getResourceMetrics').mockResolvedValue(exceedLimitMetrics);

      await expect(farmManager.validateResourceLimits(farmId)).rejects.toThrow(
        'CPU usage exceeds limit'
      );
    });
  });

  describe('Farm Cleanup', () => {
    const farmId = 'cleanup-test-farm';

    beforeEach(async () => {
      const farmConfig: FarmConfig = {
        id: farmId,
        name: 'Cleanup Test Farm',
        agents: [
          {
            id: 'cleanup-agent',
            name: 'Cleanup Agent',
            type: 'claude',
            role: 'developer',
            capabilities: ['coding'],
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        tasks: [
          {
            id: 'cleanup-task',
            title: 'Cleanup Task',
            description: 'Task to clean up',
            status: 'in-progress',
            assignedAgent: 'cleanup-agent',
            priority: 1,
            dependencies: [],
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        settings: {
          maxConcurrentAgents: 3,
          autoScale: false,
          resourceLimits: {
            cpu: 80,
            memory: 90,
            timeout: 3600000
          }
        },
        status: 'running',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(farmConfig));
      mockFs.rm.mockResolvedValue(undefined);

      await farmManager.createFarm(farmConfig);
    });

    it('should gracefully shutdown farm', async () => {
      const result = await farmManager.shutdownFarm(farmId);

      expect(result.status).toBe('stopped');
      expect(result.agents.every(a => a.status === 'stopped')).toBe(true);
      expect(result.tasks.filter(t => t.status === 'in-progress').length).toBe(0);
    });

    it('should delete farm and cleanup resources', async () => {
      await farmManager.deleteFarm(farmId);

      expect(mockFs.rm).toHaveBeenCalledWith(
        expect.stringContaining(farmId),
        { recursive: true, force: true }
      );
    });

    it('should handle cleanup errors gracefully', async () => {
      mockFs.rm.mockRejectedValue(new Error('Permission denied'));

      const result = await farmManager.deleteFarm(farmId, { force: true });

      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining('Permission denied'),
        partialCleanup: true
      });
    });
  });

  describe('Event Handling', () => {
    it('should emit farm lifecycle events', async () => {
      const events = {
        created: jest.fn(),
        started: jest.fn(),
        paused: jest.fn(),
        resumed: jest.fn(),
        stopped: jest.fn(),
        deleted: jest.fn()
      };

      Object.entries(events).forEach(([event, handler]) => {
        farmManager.on(`farm:${event}`, handler);
      });

      const farmConfig: FarmConfig = {
        id: 'event-farm',
        name: 'Event Farm',
        agents: [],
        tasks: [],
        settings: {
          maxConcurrentAgents: 3,
          autoScale: false,
          resourceLimits: {
            cpu: 80,
            memory: 90,
            timeout: 3600000
          }
        },
        status: 'initializing',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(farmConfig));
      mockFs.rm.mockResolvedValue(undefined);

      // Create farm
      await farmManager.createFarm(farmConfig);
      expect(events.created).toHaveBeenCalled();

      // Start farm
      await farmManager.updateFarmStatus('event-farm', 'running');
      expect(events.started).toHaveBeenCalled();

      // Pause farm
      await farmManager.updateFarmStatus('event-farm', 'paused');
      expect(events.paused).toHaveBeenCalled();

      // Resume farm
      await farmManager.updateFarmStatus('event-farm', 'running');
      expect(events.resumed).toHaveBeenCalled();

      // Stop farm
      await farmManager.shutdownFarm('event-farm');
      expect(events.stopped).toHaveBeenCalled();

      // Delete farm
      await farmManager.deleteFarm('event-farm');
      expect(events.deleted).toHaveBeenCalled();
    });
  });

  describe('Error Recovery', () => {
    it('should recover from transient errors', async () => {
      const farmConfig: FarmConfig = {
        id: 'error-farm',
        name: 'Error Farm',
        agents: [],
        tasks: [],
        settings: {
          maxConcurrentAgents: 3,
          autoScale: false,
          resourceLimits: {
            cpu: 80,
            memory: 90,
            timeout: 3600000
          }
        },
        status: 'initializing',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Simulate transient error then success
      mockFs.mkdir
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const result = await farmManager.createFarm(farmConfig, { retries: 3 });

      expect(result).toBeDefined();
      expect(mockFs.mkdir).toHaveBeenCalledTimes(2);
    });

    it('should implement exponential backoff for retries', async () => {
      jest.useFakeTimers();

      const farmConfig: FarmConfig = {
        id: 'backoff-farm',
        name: 'Backoff Farm',
        agents: [],
        tasks: [],
        settings: {
          maxConcurrentAgents: 3,
          autoScale: false,
          resourceLimits: {
            cpu: 80,
            memory: 90,
            timeout: 3600000
          }
        },
        status: 'initializing',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockFs.mkdir.mockRejectedValue(new Error('Connection timeout'));
      mockFs.writeFile.mockResolvedValue(undefined);

      const createPromise = farmManager.createFarm(farmConfig, {
        retries: 3,
        backoffMultiplier: 2
      });

      // Advance through retry delays
      jest.advanceTimersByTime(1000); // First retry after 1s
      jest.advanceTimersByTime(2000); // Second retry after 2s
      jest.advanceTimersByTime(4000); // Third retry after 4s

      await expect(createPromise).rejects.toThrow('Connection timeout');
      expect(mockFs.mkdir).toHaveBeenCalledTimes(4); // Initial + 3 retries

      jest.useRealTimers();
    });
  });
});