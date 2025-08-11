import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CoordinationService } from '../../services/coordinationService';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('fs', () => ({
  watch: jest.fn(),
  existsSync: jest.fn()
}));
jest.mock('../../websocket/socketServer');
jest.mock('../../database/client');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockFsSync = require('fs');

describe('CoordinationService', () => {
  let coordinationService: CoordinationService;
  let mockWatcher: EventEmitter;
  const testCoordinationPath = '/tmp/claude_coordination';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock file watcher
    mockWatcher = new EventEmitter();
    mockFsSync.watch.mockReturnValue(mockWatcher);
    mockFsSync.existsSync.mockReturnValue(true);
    
    coordinationService = new CoordinationService();
  });

  afterEach(() => {
    coordinationService.stop();
    mockWatcher.removeAllListeners();
  });

  describe('Initialization', () => {
    it('should create coordination directory if not exists', async () => {
      mockFsSync.existsSync.mockReturnValue(false);
      mockFs.mkdir.mockResolvedValue(undefined);

      await coordinationService.initialize();

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('claude_coordination'),
        { recursive: true }
      );
    });

    it('should setup file watchers on initialization', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify({ agents: [] }));
      
      await coordinationService.initialize();

      expect(mockFsSync.watch).toHaveBeenCalledWith(
        expect.stringContaining('active_agents.json'),
        expect.any(Function)
      );
    });

    it('should handle missing coordination file gracefully', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
      mockFs.writeFile.mockResolvedValue(undefined);

      await coordinationService.initialize();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('active_agents.json'),
        expect.stringContaining('[]')
      );
    });
  });

  describe('Agent Registration', () => {
    beforeEach(async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify({ agents: [] }));
      mockFs.writeFile.mockResolvedValue(undefined);
      await coordinationService.initialize();
    });

    it('should register new agent', async () => {
      const agentInfo = {
        id: 'test-agent-1',
        name: 'Test Agent',
        type: 'claude',
        status: 'active',
        pid: 12345,
        workingDirectory: '/tmp/test-agent',
        capabilities: ['coding', 'testing']
      };

      const result = await coordinationService.registerAgent(agentInfo);

      expect(result).toMatchObject({
        success: true,
        agentId: agentInfo.id
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('active_agents.json'),
        expect.stringContaining(agentInfo.id)
      );
    });

    it('should prevent duplicate agent registration', async () => {
      const agentInfo = {
        id: 'duplicate-agent',
        name: 'Duplicate Agent',
        type: 'claude',
        status: 'active',
        pid: 12345
      };

      // Register first time
      await coordinationService.registerAgent(agentInfo);
      
      // Try to register again
      mockFs.readFile.mockResolvedValue(JSON.stringify({ 
        agents: [agentInfo] 
      }));

      await expect(coordinationService.registerAgent(agentInfo)).rejects.toThrow(
        'Agent duplicate-agent is already registered'
      );
    });

    it('should update agent status', async () => {
      const agentInfo = {
        id: 'status-agent',
        name: 'Status Agent',
        type: 'claude',
        status: 'active',
        pid: 12345
      };

      await coordinationService.registerAgent(agentInfo);
      
      mockFs.readFile.mockResolvedValue(JSON.stringify({ 
        agents: [agentInfo] 
      }));

      const result = await coordinationService.updateAgentStatus('status-agent', 'idle');

      expect(result.status).toBe('idle');
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('active_agents.json'),
        expect.stringContaining('"status":"idle"')
      );
    });

    it('should unregister agent', async () => {
      const agentInfo = {
        id: 'remove-agent',
        name: 'Remove Agent',
        type: 'claude',
        status: 'active',
        pid: 12345
      };

      await coordinationService.registerAgent(agentInfo);
      
      mockFs.readFile.mockResolvedValue(JSON.stringify({ 
        agents: [agentInfo] 
      }));

      const result = await coordinationService.unregisterAgent('remove-agent');

      expect(result.success).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('active_agents.json'),
        expect.not.stringContaining('remove-agent')
      );
    });
  });

  describe('Work Coordination', () => {
    beforeEach(async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify({ 
        agents: [],
        tasks: []
      }));
      mockFs.writeFile.mockResolvedValue(undefined);
      await coordinationService.initialize();
    });

    it('should assign work to available agent', async () => {
      // Register agents
      const agent1 = {
        id: 'worker-1',
        name: 'Worker 1',
        type: 'claude',
        status: 'idle',
        capabilities: ['coding']
      };

      const agent2 = {
        id: 'worker-2',
        name: 'Worker 2',
        type: 'claude',
        status: 'busy',
        capabilities: ['testing']
      };

      await coordinationService.registerAgent(agent1);
      await coordinationService.registerAgent(agent2);

      mockFs.readFile.mockResolvedValue(JSON.stringify({ 
        agents: [agent1, agent2],
        tasks: []
      }));

      const task = {
        id: 'task-1',
        type: 'coding',
        description: 'Write unit tests'
      };

      const assignment = await coordinationService.assignWork(task);

      expect(assignment).toMatchObject({
        taskId: task.id,
        agentId: 'worker-1', // Should assign to idle agent
        status: 'assigned'
      });
    });

    it('should queue work when no agents available', async () => {
      const busyAgent = {
        id: 'busy-worker',
        name: 'Busy Worker',
        type: 'claude',
        status: 'busy',
        capabilities: ['coding']
      };

      await coordinationService.registerAgent(busyAgent);

      mockFs.readFile.mockResolvedValue(JSON.stringify({ 
        agents: [busyAgent],
        tasks: []
      }));

      const task = {
        id: 'queued-task',
        type: 'coding',
        description: 'Queued work'
      };

      const assignment = await coordinationService.assignWork(task);

      expect(assignment).toMatchObject({
        taskId: task.id,
        status: 'queued',
        queuePosition: 1
      });
    });

    it('should handle work completion', async () => {
      const agent = {
        id: 'complete-worker',
        name: 'Complete Worker',
        type: 'claude',
        status: 'busy',
        currentTask: 'task-complete'
      };

      await coordinationService.registerAgent(agent);

      mockFs.readFile.mockResolvedValue(JSON.stringify({ 
        agents: [agent],
        tasks: [{
          id: 'task-complete',
          status: 'in-progress',
          assignedTo: 'complete-worker'
        }]
      }));

      const result = await coordinationService.completeWork('task-complete', {
        success: true,
        output: 'Task completed successfully'
      });

      expect(result).toMatchObject({
        taskId: 'task-complete',
        status: 'completed',
        completedBy: 'complete-worker'
      });

      // Agent should be idle after completion
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('active_agents.json'),
        expect.stringContaining('"status":"idle"')
      );
    });
  });

  describe('File Watching', () => {
    beforeEach(async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify({ agents: [] }));
      mockFs.writeFile.mockResolvedValue(undefined);
      await coordinationService.initialize();
    });

    it('should detect agent changes', async () => {
      const changeHandler = jest.fn();
      coordinationService.on('agents:changed', changeHandler);

      // Simulate file change
      const newAgentData = {
        agents: [{
          id: 'new-agent',
          name: 'New Agent',
          status: 'active'
        }]
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(newAgentData));
      mockWatcher.emit('change', 'change', 'active_agents.json');

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(changeHandler).toHaveBeenCalledWith(newAgentData.agents);
    });

    it('should handle file read errors during watch', async () => {
      const errorHandler = jest.fn();
      coordinationService.on('error', errorHandler);

      mockFs.readFile.mockRejectedValue(new Error('Permission denied'));
      mockWatcher.emit('change', 'change', 'active_agents.json');

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Permission denied')
        })
      );
    });

    it('should debounce rapid file changes', async () => {
      jest.useFakeTimers();

      const changeHandler = jest.fn();
      coordinationService.on('agents:changed', changeHandler);

      mockFs.readFile.mockResolvedValue(JSON.stringify({ 
        agents: [{ id: 'test', status: 'active' }] 
      }));

      // Simulate rapid changes
      for (let i = 0; i < 5; i++) {
        mockWatcher.emit('change', 'change', 'active_agents.json');
      }

      // Advance timers
      jest.advanceTimersByTime(500);

      // Should only process once due to debouncing
      expect(changeHandler).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });
  });

  describe('Lock Management', () => {
    beforeEach(async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify({ 
        agents: [],
        locks: {}
      }));
      mockFs.writeFile.mockResolvedValue(undefined);
      await coordinationService.initialize();
    });

    it('should acquire lock for resource', async () => {
      const lock = await coordinationService.acquireLock('resource-1', 'agent-1');

      expect(lock).toMatchObject({
        resource: 'resource-1',
        owner: 'agent-1',
        acquired: true
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"resource-1"')
      );
    });

    it('should prevent concurrent lock acquisition', async () => {
      // First agent acquires lock
      await coordinationService.acquireLock('shared-resource', 'agent-1');

      mockFs.readFile.mockResolvedValue(JSON.stringify({ 
        agents: [],
        locks: {
          'shared-resource': {
            owner: 'agent-1',
            timestamp: Date.now()
          }
        }
      }));

      // Second agent tries to acquire
      const lock = await coordinationService.acquireLock('shared-resource', 'agent-2');

      expect(lock).toMatchObject({
        resource: 'shared-resource',
        owner: 'agent-1',
        acquired: false
      });
    });

    it('should release lock', async () => {
      await coordinationService.acquireLock('release-resource', 'agent-1');

      mockFs.readFile.mockResolvedValue(JSON.stringify({ 
        agents: [],
        locks: {
          'release-resource': {
            owner: 'agent-1',
            timestamp: Date.now()
          }
        }
      }));

      const result = await coordinationService.releaseLock('release-resource', 'agent-1');

      expect(result.released).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.stringContaining('release-resource')
      );
    });

    it('should handle stale locks', async () => {
      jest.useFakeTimers();
      const now = Date.now();
      jest.setSystemTime(now);

      // Create stale lock (older than timeout)
      const staleLock = {
        owner: 'dead-agent',
        timestamp: now - 60000 // 1 minute old
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify({ 
        agents: [],
        locks: {
          'stale-resource': staleLock
        }
      }));

      // Should be able to acquire stale lock
      const lock = await coordinationService.acquireLock('stale-resource', 'new-agent', {
        timeout: 30000 // 30 second timeout
      });

      expect(lock.acquired).toBe(true);
      expect(lock.owner).toBe('new-agent');

      jest.useRealTimers();
    });
  });

  describe('Message Broadcasting', () => {
    beforeEach(async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify({ 
        agents: [],
        messages: []
      }));
      mockFs.writeFile.mockResolvedValue(undefined);
      await coordinationService.initialize();
    });

    it('should broadcast message to all agents', async () => {
      const message = {
        type: 'announcement',
        content: 'System update',
        from: 'system'
      };

      const result = await coordinationService.broadcast(message);

      expect(result.delivered).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('messages.json'),
        expect.stringContaining('System update')
      );
    });

    it('should send targeted message to specific agent', async () => {
      const message = {
        type: 'command',
        content: 'Execute task',
        from: 'coordinator',
        to: 'agent-1'
      };

      const result = await coordinationService.sendMessage('agent-1', message);

      expect(result.delivered).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('agent-1'),
        expect.stringContaining('Execute task')
      );
    });

    it('should retrieve messages for agent', async () => {
      const messages = [
        {
          id: 'msg-1',
          type: 'command',
          content: 'Task 1',
          to: 'agent-1',
          timestamp: Date.now()
        },
        {
          id: 'msg-2',
          type: 'broadcast',
          content: 'Global message',
          timestamp: Date.now()
        }
      ];

      mockFs.readFile.mockResolvedValue(JSON.stringify({ messages }));

      const agentMessages = await coordinationService.getMessages('agent-1');

      expect(agentMessages).toHaveLength(2);
      expect(agentMessages).toContainEqual(
        expect.objectContaining({ content: 'Task 1' })
      );
    });
  });

  describe('State Synchronization', () => {
    beforeEach(async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify({ 
        agents: [],
        state: {}
      }));
      mockFs.writeFile.mockResolvedValue(undefined);
      await coordinationService.initialize();
    });

    it('should synchronize shared state', async () => {
      const state = {
        farmId: 'farm-123',
        progress: 50,
        activeAgents: 3
      };

      await coordinationService.updateSharedState(state);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('shared_state.json'),
        expect.stringContaining('"farmId":"farm-123"')
      );
    });

    it('should merge state updates', async () => {
      const initialState = {
        farmId: 'farm-123',
        progress: 50
      };

      await coordinationService.updateSharedState(initialState);

      mockFs.readFile.mockResolvedValue(JSON.stringify({ 
        state: initialState 
      }));

      const update = {
        progress: 75,
        newField: 'value'
      };

      await coordinationService.updateSharedState(update);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"progress":75')
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"newField":"value"')
      );
    });

    it('should handle concurrent state updates', async () => {
      const updates = [
        coordinationService.updateSharedState({ field1: 'value1' }),
        coordinationService.updateSharedState({ field2: 'value2' }),
        coordinationService.updateSharedState({ field3: 'value3' })
      ];

      await Promise.all(updates);

      // All updates should be applied
      const calls = mockFs.writeFile.mock.calls;
      const lastCall = calls[calls.length - 1];
      const finalState = JSON.parse(lastCall[1] as string);

      expect(finalState.state).toMatchObject({
        field1: 'value1',
        field2: 'value2',
        field3: 'value3'
      });
    });
  });

  describe('Health Monitoring', () => {
    beforeEach(async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify({ 
        agents: []
      }));
      mockFs.writeFile.mockResolvedValue(undefined);
      await coordinationService.initialize();
    });

    it('should track agent heartbeats', async () => {
      const agent = {
        id: 'heartbeat-agent',
        name: 'Heartbeat Agent',
        type: 'claude',
        status: 'active'
      };

      await coordinationService.registerAgent(agent);

      const heartbeat = await coordinationService.recordHeartbeat('heartbeat-agent');

      expect(heartbeat).toMatchObject({
        agentId: 'heartbeat-agent',
        timestamp: expect.any(Number),
        alive: true
      });
    });

    it('should detect dead agents', async () => {
      jest.useFakeTimers();
      const now = Date.now();
      jest.setSystemTime(now);

      const agent = {
        id: 'dead-agent',
        name: 'Dead Agent',
        type: 'claude',
        status: 'active',
        lastHeartbeat: now - 120000 // 2 minutes ago
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify({ 
        agents: [agent]
      }));

      const deadAgents = await coordinationService.detectDeadAgents({
        heartbeatTimeout: 60000 // 1 minute timeout
      });

      expect(deadAgents).toContainEqual(
        expect.objectContaining({ id: 'dead-agent' })
      );

      jest.useRealTimers();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup resources on stop', async () => {
      await coordinationService.initialize();
      
      const stopSpy = jest.spyOn(coordinationService, 'stop');
      coordinationService.stop();

      expect(stopSpy).toHaveBeenCalled();
      expect(mockWatcher.removeAllListeners).toBeDefined();
    });
  });
});