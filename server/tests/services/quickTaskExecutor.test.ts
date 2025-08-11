import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { QuickTaskExecutor } from '../../services/quickTaskExecutor';
import { quickTaskService } from '../../services/quickTaskService';
import { WebSocketManager } from '../../websocket/websocketManager';
import { db } from '../../database/connection';
import { spawn } from 'child_process';

jest.mock('child_process');
jest.mock('../../services/quickTaskService');
jest.mock('../../websocket/websocketManager');
jest.mock('../../database/connection');
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('QuickTaskExecutor', () => {
  let executor: QuickTaskExecutor;
  const mockConfig = {
    taskId: 'test-task-123',
    farmId: 'test-farm-456',
    title: 'Test Quick Task',
    description: 'Test description',
    timeout: 30000,
    metadata: { test: true }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    executor = new QuickTaskExecutor();
    
    // Setup default mocks
    (db.query as jest.Mock) = jest.fn().mockResolvedValue({ rows: [] });
    (WebSocketManager.broadcast as jest.Mock) = jest.fn();
  });

  afterEach(() => {
    // Clean up timers and sessions
    executor['executionTimers'].forEach(timer => clearTimeout(timer));
    jest.restoreAllMocks();
  });

  describe('Virtual Agent Management', () => {
    it('should create virtual agent for quick task', async () => {
      const agentId = await executor['createVirtualAgent'](mockConfig, 'claude');

      expect(agentId).toBeDefined();
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agents'),
        expect.arrayContaining([
          expect.any(String), // agentId
          mockConfig.farmId,
          expect.stringContaining('Quick Task Agent'),
          'quick-task',
          'launching'
        ])
      );

      expect(WebSocketManager.broadcast).toHaveBeenCalledWith('agent:created', {
        agent: expect.objectContaining({
          farmId: mockConfig.farmId,
          type: 'quick-task',
          status: 'launching',
          isVirtual: true,
          provider: 'claude'
        })
      });
    });

    it('should handle virtual agent creation errors', async () => {
      (db.query as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(executor['createVirtualAgent'](mockConfig, 'claude'))
        .rejects.toThrow('Database error');
    });

    it('should update virtual agent status', async () => {
      // First create the agent
      const agentId = await executor['createVirtualAgent'](mockConfig, 'claude');
      
      await executor['updateVirtualAgentStatus'](mockConfig.taskId, 'running', { progress: 50 });

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE agents'),
        expect.arrayContaining([
          'running',
          expect.any(Date),
          expect.any(Date),
          expect.stringContaining('"progress":50'),
          agentId
        ])
      );

      expect(WebSocketManager.broadcast).toHaveBeenCalledWith('agent:status', {
        agentId,
        status: 'running',
        timestamp: expect.any(Date),
        metadata: { progress: 50 }
      });
    });

    it('should remove virtual agent', async () => {
      const agentId = await executor['createVirtualAgent'](mockConfig, 'claude');
      
      await executor['removeVirtualAgent'](mockConfig.taskId);

      expect(db.query).toHaveBeenCalledWith(
        'DELETE FROM agents WHERE id = $1',
        [agentId]
      );

      expect(WebSocketManager.broadcast).toHaveBeenCalledWith('agent:removed', {
        agentId,
        timestamp: expect.any(Date)
      });

      // Verify agent is removed from internal map
      expect(executor['virtualAgents'].has(mockConfig.taskId)).toBe(false);
    });
  });

  describe('Task Execution', () => {
    it('should execute task with Claude provider', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();
      
      (spawn as jest.Mock).mockReturnValue(mockProcess);
      (quickTaskService.updateTaskStatus as jest.Mock) = jest.fn();

      const executionPromise = executor.executeQuickTask(mockConfig, 'claude');

      // Simulate process output
      mockProcess.stdout.emit('data', Buffer.from('Task output\n'));
      mockProcess.emit('exit', 0);

      const result = await executionPromise;

      expect(result.success).toBe(true);
      expect(result.output).toContain('Task output');
      expect(spawn).toHaveBeenCalledWith('tmux', [
        'new-session',
        '-d',
        '-s', expect.stringContaining('quick_'),
        'claude',
        expect.any(String)
      ]);
    });

    it('should execute task with Qwen provider', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();
      
      (spawn as jest.Mock).mockReturnValue(mockProcess);

      const executionPromise = executor.executeQuickTask(mockConfig, 'qwen');

      mockProcess.stdout.emit('data', Buffer.from('Qwen task output\n'));
      mockProcess.emit('exit', 0);

      const result = await executionPromise;

      expect(result.success).toBe(true);
      expect(spawn).toHaveBeenCalledWith('tmux', [
        'new-session',
        '-d',
        '-s', expect.stringContaining('quick_'),
        expect.stringContaining('python'),
        expect.stringContaining('qwen_cli.py')
      ]);
    });

    it('should handle task execution timeout', async () => {
      jest.useFakeTimers();
      
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();
      
      (spawn as jest.Mock).mockReturnValue(mockProcess);

      const shortTimeoutConfig = { ...mockConfig, timeout: 100 };
      const executionPromise = executor.executeQuickTask(shortTimeoutConfig, 'claude');

      // Advance timers to trigger timeout
      jest.advanceTimersByTime(150);

      const result = await executionPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
      expect(mockProcess.kill).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should handle task execution errors', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();
      
      (spawn as jest.Mock).mockReturnValue(mockProcess);

      const executionPromise = executor.executeQuickTask(mockConfig, 'claude');

      mockProcess.stderr.emit('data', Buffer.from('Error occurred\n'));
      mockProcess.emit('exit', 1);

      const result = await executionPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Error occurred');
    });

    it('should track active sessions', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();
      
      (spawn as jest.Mock).mockReturnValue(mockProcess);

      const executionPromise = executor.executeQuickTask(mockConfig, 'claude');

      // Session should be active during execution
      expect(executor['activeSessions'].has(mockConfig.taskId)).toBe(true);

      mockProcess.emit('exit', 0);
      await executionPromise;

      // Session should be cleaned up after completion
      expect(executor['activeSessions'].has(mockConfig.taskId)).toBe(false);
    });
  });

  describe('Queue Management', () => {
    it('should queue tasks when processing', async () => {
      executor['isProcessing'] = true;
      
      const task = {
        id: 'task-1',
        farmId: 'farm-1',
        type: 'quick' as const,
        config: { prompt: 'test' },
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      executor.queueTask(task);

      expect(executor['inMemoryQueue']).toContainEqual(task);
    });

    it('should process queued tasks in order', async () => {
      const tasks = [
        {
          id: 'task-1',
          farmId: 'farm-1',
          type: 'quick' as const,
          config: { prompt: 'test1' },
          status: 'pending' as const,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'task-2',
          farmId: 'farm-2',
          type: 'quick' as const,
          config: { prompt: 'test2' },
          status: 'pending' as const,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      tasks.forEach(task => executor.queueTask(task));
      
      const processedTasks: string[] = [];
      executor.on('task:processed', (taskId) => {
        processedTasks.push(taskId);
      });

      await executor.processQueue();

      expect(processedTasks).toEqual(['task-1', 'task-2']);
    });

    it('should handle queue processing errors gracefully', async () => {
      const task = {
        id: 'error-task',
        farmId: 'farm-1',
        type: 'quick' as const,
        config: { prompt: 'test' },
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      executor.queueTask(task);
      
      // Mock executeQuickTask to throw
      executor.executeQuickTask = jest.fn().mockRejectedValue(new Error('Execution failed'));

      await executor.processQueue();

      // Should not throw and queue should be empty
      expect(executor['inMemoryQueue']).toHaveLength(0);
    });
  });

  describe('Session Management', () => {
    it('should generate unique session names', () => {
      const sessionName1 = executor['generateSessionName']('task-1');
      const sessionName2 = executor['generateSessionName']('task-2');

      expect(sessionName1).toMatch(/^quick_[a-z0-9]+$/);
      expect(sessionName2).toMatch(/^quick_[a-z0-9]+$/);
      expect(sessionName1).not.toBe(sessionName2);
    });

    it('should check if tmux session exists', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      
      (spawn as jest.Mock).mockReturnValue(mockProcess);

      const checkPromise = executor.checkTmuxSession('test-session');

      mockProcess.emit('exit', 0); // Exit 0 means session exists

      const exists = await checkPromise;
      expect(exists).toBe(true);
    });

    it('should kill tmux session on cleanup', async () => {
      const sessionName = 'test-session';
      executor['activeSessions'].set('task-1', sessionName);

      const mockProcess = new EventEmitter() as any;
      (spawn as jest.Mock).mockReturnValue(mockProcess);

      const cleanupPromise = executor.cleanupSession('task-1');
      
      mockProcess.emit('exit', 0);
      await cleanupPromise;

      expect(spawn).toHaveBeenCalledWith('tmux', ['kill-session', '-t', sessionName]);
      expect(executor['activeSessions'].has('task-1')).toBe(false);
    });
  });

  describe('Output Capture', () => {
    it('should capture tmux session output', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      
      (spawn as jest.Mock).mockReturnValue(mockProcess);

      const capturePromise = executor.captureTmuxOutput('test-session');

      const testOutput = 'Line 1\nLine 2\nLine 3';
      mockProcess.stdout.emit('data', Buffer.from(testOutput));
      mockProcess.emit('exit', 0);

      const output = await capturePromise;

      expect(output).toBe(testOutput);
      expect(spawn).toHaveBeenCalledWith('tmux', [
        'capture-pane',
        '-t', 'test-session:0',
        '-p',
        '-S', '-1000'
      ]);
    });

    it('should handle output capture errors', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      
      (spawn as jest.Mock).mockReturnValue(mockProcess);

      const capturePromise = executor.captureTmuxOutput('non-existent');

      mockProcess.stderr.emit('data', Buffer.from('Session not found'));
      mockProcess.emit('exit', 1);

      const output = await capturePromise;
      expect(output).toBe('');
    });
  });

  describe('Event Emissions', () => {
    it('should emit task:started event', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      
      (spawn as jest.Mock).mockReturnValue(mockProcess);

      const startedListener = jest.fn();
      executor.on('task:started', startedListener);

      const executionPromise = executor.executeQuickTask(mockConfig, 'claude');

      expect(startedListener).toHaveBeenCalledWith({
        taskId: mockConfig.taskId,
        sessionName: expect.any(String),
        provider: 'claude'
      });

      mockProcess.emit('exit', 0);
      await executionPromise;
    });

    it('should emit task:completed event on success', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      
      (spawn as jest.Mock).mockReturnValue(mockProcess);

      const completedListener = jest.fn();
      executor.on('task:completed', completedListener);

      const executionPromise = executor.executeQuickTask(mockConfig, 'claude');

      mockProcess.stdout.emit('data', Buffer.from('Success output'));
      mockProcess.emit('exit', 0);

      await executionPromise;

      expect(completedListener).toHaveBeenCalledWith({
        taskId: mockConfig.taskId,
        success: true,
        output: expect.stringContaining('Success output'),
        executionTime: expect.any(Number)
      });
    });

    it('should emit task:error event on failure', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      
      (spawn as jest.Mock).mockReturnValue(mockProcess);

      const errorListener = jest.fn();
      executor.on('task:error', errorListener);

      const executionPromise = executor.executeQuickTask(mockConfig, 'claude');

      mockProcess.stderr.emit('data', Buffer.from('Fatal error'));
      mockProcess.emit('exit', 1);

      await executionPromise;

      expect(errorListener).toHaveBeenCalledWith({
        taskId: mockConfig.taskId,
        error: expect.stringContaining('Fatal error')
      });
    });
  });

  describe('Cleanup', () => {
    it('should cleanup all resources on shutdown', async () => {
      // Setup some active sessions and timers
      executor['activeSessions'].set('task-1', 'session-1');
      executor['activeSessions'].set('task-2', 'session-2');
      
      const timer = setTimeout(() => {}, 10000);
      executor['executionTimers'].set('task-1', timer);

      const mockProcess = new EventEmitter() as any;
      (spawn as jest.Mock).mockReturnValue(mockProcess);

      const shutdownPromise = executor.shutdown();
      
      // Simulate tmux kill-session success
      mockProcess.emit('exit', 0);
      
      await shutdownPromise;

      expect(executor['activeSessions'].size).toBe(0);
      expect(executor['executionTimers'].size).toBe(0);
      expect(spawn).toHaveBeenCalledWith('tmux', ['kill-session', '-t', 'session-1']);
      expect(spawn).toHaveBeenCalledWith('tmux', ['kill-session', '-t', 'session-2']);
    });
  });
});