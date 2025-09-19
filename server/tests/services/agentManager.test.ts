import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AgentManager } from '../../services/unified/farmService';
import { Agent } from '../../types/farm';
import { EventEmitter } from 'events';
import * as child_process from 'child_process';

// Mock dependencies
jest.mock('child_process');
jest.mock('../../database/client');
jest.mock('../../websocket/socketServer');
jest.mock('../../services/coordinationService');
jest.mock('../../services/tmuxHelper');
jest.mock('fs/promises');

const mockSpawn = child_process.spawn as jest.MockedFunction<typeof child_process.spawn>;
const mockExec = child_process.exec as jest.MockedFunction<typeof child_process.exec>;

describe('AgentManager', () => {
  let agentManager: AgentManager;
  let mockProcess: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock child process
    mockProcess = {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      on: jest.fn((event, handler) => {
        if (event === 'spawn') handler();
        return mockProcess;
      }),
      kill: jest.fn(),
      pid: 12345
    };
    
    mockSpawn.mockReturnValue(mockProcess as any);
    agentManager = new AgentManager();
  });

  afterEach(() => {
    agentManager.shutdown();
  });

  describe('Agent Lifecycle', () => {
    it('should create and start a new agent', async () => {
      const agentConfig = {
        id: 'test-agent-1',
        name: 'Test Agent',
        type: 'claude' as const,
        role: 'developer',
        capabilities: ['coding', 'testing'],
        workingDirectory: '/tmp/test-agent'
      };

      const agent = await agentManager.createAgent(agentConfig);

      expect(agent).toMatchObject({
        id: agentConfig.id,
        name: agentConfig.name,
        status: 'starting',
        pid: mockProcess.pid
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['claude', 'code']),
        expect.objectContaining({
          cwd: agentConfig.workingDirectory
        })
      );
    });

    it('should handle agent startup errors', async () => {
      mockSpawn.mockImplementation(() => {
        const errorProcess = new EventEmitter() as any;
        errorProcess.stdout = new EventEmitter();
        errorProcess.stderr = new EventEmitter();
        errorProcess.kill = jest.fn();
        
        setTimeout(() => {
          errorProcess.emit('error', new Error('Failed to start'));
        }, 0);
        
        return errorProcess;
      });

      const agentConfig = {
        id: 'error-agent',
        name: 'Error Agent',
        type: 'claude' as const,
        role: 'developer',
        capabilities: ['coding']
      };

      await expect(agentManager.createAgent(agentConfig)).rejects.toThrow(
        'Failed to start agent'
      );
    });

    it('should stop an agent gracefully', async () => {
      const agentConfig = {
        id: 'stop-agent',
        name: 'Stop Agent',
        type: 'claude' as const,
        role: 'developer',
        capabilities: ['coding']
      };

      const agent = await agentManager.createAgent(agentConfig);
      const result = await agentManager.stopAgent(agent.id);

      expect(result.status).toBe('stopped');
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should force kill an agent if graceful stop fails', async () => {
      jest.useFakeTimers();

      const agentConfig = {
        id: 'force-kill-agent',
        name: 'Force Kill Agent',
        type: 'claude' as const,
        role: 'developer',
        capabilities: ['coding']
      };

      // Mock process that doesn't respond to SIGTERM
      mockProcess.kill.mockImplementation((signal) => {
        if (signal === 'SIGTERM') {
          // Don't emit exit event
          return true;
        }
        if (signal === 'SIGKILL') {
          setTimeout(() => mockProcess.emit('exit', 0, 'SIGKILL'), 0);
          return true;
        }
      });

      const agent = await agentManager.createAgent(agentConfig);
      const stopPromise = agentManager.stopAgent(agent.id, { force: true });

      // Advance timers to trigger force kill
      jest.advanceTimersByTime(5000);

      const result = await stopPromise;
      expect(result.status).toBe('killed');
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');

      jest.useRealTimers();
    });
  });

  describe('Agent Communication', () => {
    it('should send commands to agent', async () => {
      const agentConfig = {
        id: 'command-agent',
        name: 'Command Agent',
        type: 'claude' as const,
        role: 'developer',
        capabilities: ['coding']
      };

      const agent = await agentManager.createAgent(agentConfig);
      
      const command = {
        type: 'task',
        payload: {
          taskId: 'task-123',
          description: 'Write unit tests'
        }
      };

      await agentManager.sendCommand(agent.id, command);

      // Verify command was written to stdin or coordination file
      expect(mockProcess.stdin?.write).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(command))
      );
    });

    it('should handle agent responses', async () => {
      const agentConfig = {
        id: 'response-agent',
        name: 'Response Agent',
        type: 'claude' as const,
        role: 'developer',
        capabilities: ['coding']
      };

      const responseHandler = jest.fn();
      agentManager.on('agent:response', responseHandler);

      const agent = await agentManager.createAgent(agentConfig);

      // Simulate agent output
      const response = { status: 'completed', taskId: 'task-123' };
      mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(response) + '\n'));

      expect(responseHandler).toHaveBeenCalledWith({
        agentId: agent.id,
        response
      });
    });

    it('should handle agent errors', async () => {
      const agentConfig = {
        id: 'error-output-agent',
        name: 'Error Output Agent',
        type: 'claude' as const,
        role: 'developer',
        capabilities: ['coding']
      };

      const errorHandler = jest.fn();
      agentManager.on('agent:error', errorHandler);

      const agent = await agentManager.createAgent(agentConfig);

      // Simulate error output
      mockProcess.stderr.emit('data', Buffer.from('Error: Task failed\n'));

      expect(errorHandler).toHaveBeenCalledWith({
        agentId: agent.id,
        error: 'Error: Task failed'
      });
    });
  });

  describe('Agent Monitoring', () => {
    it('should track agent status', async () => {
      const agentConfig = {
        id: 'status-agent',
        name: 'Status Agent',
        type: 'claude' as const,
        role: 'developer',
        capabilities: ['coding']
      };

      const agent = await agentManager.createAgent(agentConfig);
      
      // Update status
      await agentManager.updateAgentStatus(agent.id, 'active');
      
      const status = await agentManager.getAgentStatus(agent.id);
      expect(status).toBe('active');
    });

    it('should collect agent metrics', async () => {
      const agentConfig = {
        id: 'metrics-agent',
        name: 'Metrics Agent',
        type: 'claude' as const,
        role: 'developer',
        capabilities: ['coding']
      };

      const agent = await agentManager.createAgent(agentConfig);
      
      const metrics = await agentManager.getAgentMetrics(agent.id);
      
      expect(metrics).toMatchObject({
        cpuUsage: expect.any(Number),
        memoryUsage: expect.any(Number),
        uptime: expect.any(Number),
        tasksCompleted: expect.any(Number),
        tasksFailed: expect.any(Number)
      });
    });

    it('should detect and restart crashed agents', async () => {
      const agentConfig = {
        id: 'crash-agent',
        name: 'Crash Agent',
        type: 'claude' as const,
        role: 'developer',
        capabilities: ['coding'],
        autoRestart: true
      };

      const agent = await agentManager.createAgent(agentConfig);
      
      // Simulate crash
      mockProcess.emit('exit', 1, null);
      
      // Wait for restart
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(mockSpawn).toHaveBeenCalledTimes(2); // Initial + restart
      
      const newAgent = await agentManager.getAgent(agent.id);
      expect(newAgent?.status).toBe('starting');
      expect(newAgent?.restartCount).toBe(1);
    });

    it('should limit restart attempts', async () => {
      const agentConfig = {
        id: 'restart-limit-agent',
        name: 'Restart Limit Agent',
        type: 'claude' as const,
        role: 'developer',
        capabilities: ['coding'],
        autoRestart: true,
        maxRestarts: 3
      };

      const agent = await agentManager.createAgent(agentConfig);
      
      // Simulate multiple crashes
      for (let i = 0; i < 5; i++) {
        mockProcess.emit('exit', 1, null);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Should only restart 3 times
      expect(mockSpawn).toHaveBeenCalledTimes(4); // Initial + 3 restarts
      
      const finalAgent = await agentManager.getAgent(agent.id);
      expect(finalAgent?.status).toBe('failed');
      expect(finalAgent?.restartCount).toBe(3);
    });
  });

  describe('Agent Pool Management', () => {
    it('should manage multiple agents', async () => {
      const agents = await Promise.all([
        agentManager.createAgent({
          id: 'pool-agent-1',
          name: 'Pool Agent 1',
          type: 'claude',
          role: 'developer',
          capabilities: ['coding']
        }),
        agentManager.createAgent({
          id: 'pool-agent-2',
          name: 'Pool Agent 2',
          type: 'claude',
          role: 'tester',
          capabilities: ['testing']
        }),
        agentManager.createAgent({
          id: 'pool-agent-3',
          name: 'Pool Agent 3',
          type: 'claude',
          role: 'reviewer',
          capabilities: ['reviewing']
        })
      ]);

      const allAgents = await agentManager.getAllAgents();
      expect(allAgents).toHaveLength(3);
      expect(allAgents.map(a => a.id)).toEqual(expect.arrayContaining([
        'pool-agent-1',
        'pool-agent-2',
        'pool-agent-3'
      ]));
    });

    it('should find agents by capability', async () => {
      await Promise.all([
        agentManager.createAgent({
          id: 'coder-1',
          name: 'Coder 1',
          type: 'claude',
          role: 'developer',
          capabilities: ['coding', 'debugging']
        }),
        agentManager.createAgent({
          id: 'tester-1',
          name: 'Tester 1',
          type: 'claude',
          role: 'tester',
          capabilities: ['testing', 'debugging']
        })
      ]);

      const debuggers = await agentManager.findAgentsByCapability('debugging');
      expect(debuggers).toHaveLength(2);

      const coders = await agentManager.findAgentsByCapability('coding');
      expect(coders).toHaveLength(1);
      expect(coders[0].id).toBe('coder-1');
    });

    it('should balance load across agents', async () => {
      const agents = await Promise.all([
        agentManager.createAgent({
          id: 'load-agent-1',
          name: 'Load Agent 1',
          type: 'claude',
          role: 'developer',
          capabilities: ['coding']
        }),
        agentManager.createAgent({
          id: 'load-agent-2',
          name: 'Load Agent 2',
          type: 'claude',
          role: 'developer',
          capabilities: ['coding']
        })
      ]);

      // Assign tasks
      const task1 = { id: 'task-1', type: 'coding' };
      const task2 = { id: 'task-2', type: 'coding' };
      const task3 = { id: 'task-3', type: 'coding' };

      const assigned1 = await agentManager.assignTask(task1);
      const assigned2 = await agentManager.assignTask(task2);
      const assigned3 = await agentManager.assignTask(task3);

      // Should distribute across agents
      expect(new Set([assigned1, assigned2, assigned3]).size).toBeGreaterThan(1);
    });
  });

  describe('Agent Health Checks', () => {
    it('should perform health checks', async () => {
      const agentConfig = {
        id: 'health-agent',
        name: 'Health Agent',
        type: 'claude' as const,
        role: 'developer',
        capabilities: ['coding'],
        healthCheckInterval: 1000
      };

      jest.useFakeTimers();

      const agent = await agentManager.createAgent(agentConfig);
      
      const healthHandler = jest.fn();
      agentManager.on('agent:health', healthHandler);

      // Trigger health check
      jest.advanceTimersByTime(1000);

      expect(healthHandler).toHaveBeenCalledWith({
        agentId: agent.id,
        healthy: true,
        metrics: expect.any(Object)
      });

      jest.useRealTimers();
    });

    it('should detect unhealthy agents', async () => {
      const agentConfig = {
        id: 'unhealthy-agent',
        name: 'Unhealthy Agent',
        type: 'claude' as const,
        role: 'developer',
        capabilities: ['coding']
      };

      const agent = await agentManager.createAgent(agentConfig);
      
      // Simulate unresponsive agent
      jest.spyOn(agentManager, 'pingAgent').mockResolvedValue(false);

      const health = await agentManager.checkAgentHealth(agent.id);
      
      expect(health).toMatchObject({
        healthy: false,
        reason: expect.stringContaining('unresponsive')
      });
    });
  });

  describe('Agent Coordination', () => {
    it('should coordinate task handoffs between agents', async () => {
      const agent1 = await agentManager.createAgent({
        id: 'handoff-agent-1',
        name: 'Handoff Agent 1',
        type: 'claude',
        role: 'developer',
        capabilities: ['coding']
      });

      const agent2 = await agentManager.createAgent({
        id: 'handoff-agent-2',
        name: 'Handoff Agent 2',
        type: 'claude',
        role: 'tester',
        capabilities: ['testing']
      });

      const task = {
        id: 'handoff-task',
        stages: ['coding', 'testing']
      };

      // Start with agent1
      await agentManager.assignTaskToAgent(task, agent1.id);
      
      // Complete coding stage
      await agentManager.completeTaskStage(task.id, 'coding');
      
      // Should automatically handoff to agent2
      const currentAssignment = await agentManager.getTaskAssignment(task.id);
      expect(currentAssignment.agentId).toBe(agent2.id);
      expect(currentAssignment.stage).toBe('testing');
    });

    it('should handle agent collaboration', async () => {
      const agents = await Promise.all([
        agentManager.createAgent({
          id: 'collab-agent-1',
          name: 'Collab Agent 1',
          type: 'claude',
          role: 'developer',
          capabilities: ['coding']
        }),
        agentManager.createAgent({
          id: 'collab-agent-2',
          name: 'Collab Agent 2',
          type: 'claude',
          role: 'developer',
          capabilities: ['coding']
        })
      ]);

      const collaborationTask = {
        id: 'collab-task',
        type: 'parallel',
        subtasks: ['subtask-1', 'subtask-2']
      };

      const assignments = await agentManager.assignCollaborativeTask(collaborationTask);
      
      expect(assignments).toHaveLength(2);
      expect(assignments[0].agentId).not.toBe(assignments[1].agentId);
    });
  });

  describe('Resource Management', () => {
    it('should track agent resource usage', async () => {
      const agent = await agentManager.createAgent({
        id: 'resource-agent',
        name: 'Resource Agent',
        type: 'claude',
        role: 'developer',
        capabilities: ['coding']
      });

      const usage = await agentManager.getResourceUsage(agent.id);
      
      expect(usage).toMatchObject({
        cpu: expect.any(Number),
        memory: expect.any(Number),
        disk: expect.any(Number)
      });
    });

    it('should enforce resource limits', async () => {
      const agent = await agentManager.createAgent({
        id: 'limited-agent',
        name: 'Limited Agent',
        type: 'claude',
        role: 'developer',
        capabilities: ['coding'],
        resourceLimits: {
          cpu: 50,
          memory: 1024
        }
      });

      // Mock high resource usage
      jest.spyOn(agentManager, 'getResourceUsage').mockResolvedValue({
        cpu: 80,
        memory: 2048,
        disk: 100
      });

      const violation = await agentManager.checkResourceViolation(agent.id);
      
      expect(violation).toMatchObject({
        violated: true,
        violations: expect.arrayContaining(['cpu', 'memory'])
      });
    });
  });

  describe('Cleanup', () => {
    it('should cleanup all agents on shutdown', async () => {
      const agents = await Promise.all([
        agentManager.createAgent({
          id: 'cleanup-agent-1',
          name: 'Cleanup Agent 1',
          type: 'claude',
          role: 'developer',
          capabilities: ['coding']
        }),
        agentManager.createAgent({
          id: 'cleanup-agent-2',
          name: 'Cleanup Agent 2',
          type: 'claude',
          role: 'tester',
          capabilities: ['testing']
        })
      ]);

      await agentManager.shutdown();

      // All processes should be killed
      expect(mockProcess.kill).toHaveBeenCalledTimes(agents.length);
      
      const remainingAgents = await agentManager.getAllAgents();
      expect(remainingAgents).toHaveLength(0);
    });
  });
});