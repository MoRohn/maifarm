import { HarvestService } from '../../apps/api/src/services/unified/farmService';
import { websocketManager } from '../../apps/api/src/websocket/websocketManager';
import { harvestFileCollector } from '../../apps/api/src/services/unified/farmService';
import { db } from '../../apps/api/src/database/client';
import { logger } from '../../apps/api/src/utils/logger';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock dependencies
jest.mock('../../apps/api/src/websocket/websocketManager');
jest.mock('../../apps/api/src/services/harvestFileCollector');
jest.mock('../../apps/api/src/database/client');
jest.mock('../../apps/api/src/utils/logger');
jest.mock('child_process');

describe('Harvest Pipeline Integration', () => {
  let harvestService: HarvestService;
  let mockBroadcast: jest.Mock;
  let mockSpawn: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Setup mocks
    mockBroadcast = jest.fn();
    (websocketManager as any).broadcast = mockBroadcast;
    
    mockSpawn = spawn as jest.Mock;
    
    // Create service instance
    harvestService = new HarvestService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Harvest Lifecycle', () => {
    test('should start a harvest successfully', async () => {
      const farmId = 'test-farm-123';
      const farmName = 'Test Farm';
      const userId = 'user-456';

      const harvest = await harvestService.startHarvest(farmId, farmName, userId);

      expect(harvest).toMatchObject({
        farmId,
        farmName,
        status: 'processing',
        summary: expect.objectContaining({
          description: `Harvesting outputs from farm ${farmName}`,
          totalTasks: 0,
          completedTasks: 0
        })
      });

      expect(mockBroadcast).toHaveBeenCalledWith('harvest:started', {
        harvestId: harvest.id,
        farmId,
        farmName
      });
    });

    test('should monitor harvest progress', async () => {
      const harvest = await harvestService.startHarvest('test-farm', 'Test Farm');

      // Fast-forward to trigger monitoring
      jest.advanceTimersByTime(5000);

      expect(mockBroadcast).toHaveBeenCalledWith('harvest:progress', expect.objectContaining({
        harvestId: harvest.id,
        progress: expect.any(Number),
        summary: expect.any(Object)
      }));
    });

    test('should handle multiple harvests simultaneously', async () => {
      const harvest1 = await harvestService.startHarvest('farm-1', 'Farm 1');
      const harvest2 = await harvestService.startHarvest('farm-2', 'Farm 2');
      const harvest3 = await harvestService.startHarvest('farm-3', 'Farm 3');

      expect(harvest1.id).not.toBe(harvest2.id);
      expect(harvest2.id).not.toBe(harvest3.id);

      const harvests = await harvestService.getHarvests();
      expect(harvests).toHaveLength(3);
    });

    test('should track user harvests', async () => {
      const userId = 'user-123';
      
      const harvest1 = await harvestService.startHarvest('farm-1', 'Farm 1', userId);
      const harvest2 = await harvestService.startHarvest('farm-2', 'Farm 2', userId);

      const userHarvests = await harvestService.getUserHarvests(userId);
      
      expect(userHarvests).toHaveLength(2);
      expect(userHarvests.map(h => h.id)).toContain(harvest1.id);
      expect(userHarvests.map(h => h.id)).toContain(harvest2.id);
    });
  });

  describe('Quick Task Integration', () => {
    test('should collect output from quick task tmux session', async () => {
      const taskId = 'abc123def456';
      const farmId = `quick-task-${taskId}`;
      const sessionOutput = 'Task execution output\nProcessing...\nCompleted successfully';

      // Mock tmux capture
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockSpawn.mockReturnValue(mockProcess);

      const harvest = await harvestService.startHarvest(farmId, 'Quick Task');

      // Trigger monitoring
      jest.advanceTimersByTime(5000);

      // Emit tmux output
      process.nextTick(() => {
        mockProcess.stdout.emit('data', Buffer.from(sessionOutput));
        mockProcess.emit('exit', 0);
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockSpawn).toHaveBeenCalledWith('tmux', [
        'capture-pane',
        '-t', `quick_${taskId.substring(0, 8)}:0`,
        '-p',
        '-S', '-500'
      ]);
    });

    test('should handle tmux capture timeout', async () => {
      const farmId = 'quick-task-timeout-test';
      
      // Mock tmux that never responds
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockSpawn.mockReturnValue(mockProcess);

      const harvest = await harvestService.startHarvest(farmId, 'Quick Task');

      // Trigger monitoring
      jest.advanceTimersByTime(5000);

      // Fast-forward past timeout
      jest.advanceTimersByTime(2100);

      // Should continue without error
      expect(harvest.status).toBe('processing');
    });
  });

  describe('Agent Management', () => {
    test('should add agent to harvest', async () => {
      const harvest = await harvestService.startHarvest('test-farm', 'Test Farm');
      
      const agentData = {
        id: 'agent-123',
        name: 'Test Agent',
        type: 'executor',
        status: 'active'
      };

      await harvestService.addAgentToHarvest(harvest.id, agentData);

      const agents = await harvestService.getHarvestAgents(harvest.id);
      expect(agents).toHaveLength(1);
      expect(agents[0]).toMatchObject(agentData);
    });

    test('should update agent status', async () => {
      const harvest = await harvestService.startHarvest('test-farm', 'Test Farm');
      const agentId = 'agent-456';

      await harvestService.addAgentToHarvest(harvest.id, {
        id: agentId,
        name: 'Test Agent',
        status: 'active'
      });

      await harvestService.updateAgentStatus(harvest.id, agentId, 'completed');

      const agents = await harvestService.getHarvestAgents(harvest.id);
      expect(agents[0].status).toBe('completed');
    });

    test('should handle multiple agents per harvest', async () => {
      const harvest = await harvestService.startHarvest('test-farm', 'Test Farm');

      for (let i = 0; i < 5; i++) {
        await harvestService.addAgentToHarvest(harvest.id, {
          id: `agent-${i}`,
          name: `Agent ${i}`,
          type: i % 2 === 0 ? 'executor' : 'analyzer',
          status: 'active'
        });
      }

      const agents = await harvestService.getHarvestAgents(harvest.id);
      expect(agents).toHaveLength(5);
      
      const executors = agents.filter(a => a.type === 'executor');
      expect(executors).toHaveLength(3);
    });
  });

  describe('File Collection', () => {
    test('should collect files for harvest', async () => {
      const mockCollection = {
        harvestId: '',
        farmId: 'test-farm',
        files: [
          { path: '/workspace/output.txt', size: 1024, type: 'text' },
          { path: '/workspace/result.json', size: 2048, type: 'json' }
        ],
        totalSize: 3072,
        collectedAt: new Date()
      };

      (harvestFileCollector.collectHarvestFiles as jest.Mock).mockResolvedValue(mockCollection);

      const harvest = await harvestService.startHarvest('test-farm', 'Test Farm');
      const files = await harvestService.collectHarvestFiles(harvest.id);

      expect(files).toEqual(mockCollection);
      expect(harvestFileCollector.collectHarvestFiles).toHaveBeenCalledWith(
        harvest.id,
        'test-farm'
      );
    });

    test('should handle file collection errors', async () => {
      (harvestFileCollector.collectHarvestFiles as jest.Mock).mockRejectedValue(
        new Error('File system error')
      );

      const harvest = await harvestService.startHarvest('test-farm', 'Test Farm');
      
      await expect(harvestService.collectHarvestFiles(harvest.id))
        .rejects.toThrow('Failed to collect harvest files');
    });
  });

  describe('Result Processing', () => {
    test('should add results to harvest', async () => {
      const harvest = await harvestService.startHarvest('test-farm', 'Test Farm');

      const result = {
        agentId: 'agent-123',
        agentName: 'Test Agent',
        taskId: 'task-456',
        output: 'Task completed successfully',
        artifacts: [
          { type: 'log', path: '/logs/output.log' }
        ]
      };

      await harvestService.addResult(harvest.id, result);

      const updatedHarvest = await harvestService.getHarvest(harvest.id);
      expect(updatedHarvest?.results).toHaveLength(1);
      expect(updatedHarvest?.results[0]).toMatchObject(result);
    });

    test('should generate insights from results', async () => {
      const harvest = await harvestService.startHarvest('test-farm', 'Test Farm');

      // Add multiple results
      for (let i = 0; i < 3; i++) {
        await harvestService.addResult(harvest.id, {
          agentId: `agent-${i}`,
          agentName: `Agent ${i}`,
          output: `Result ${i}`,
          success: true
        });
      }

      const insights = await harvestService.generateInsights(harvest.id);

      expect(insights).toContainEqual(
        expect.objectContaining({
          type: 'summary',
          confidence: expect.any(Number)
        })
      );
    });

    test('should calculate quality metrics', async () => {
      const harvest = await harvestService.startHarvest('test-farm', 'Test Farm');

      // Add results with varying quality
      await harvestService.addResult(harvest.id, {
        agentId: 'agent-1',
        output: 'High quality output with detailed information',
        success: true,
        quality: 0.9
      });

      await harvestService.addResult(harvest.id, {
        agentId: 'agent-2',
        output: 'Medium quality output',
        success: true,
        quality: 0.6
      });

      const quality = await harvestService.calculateQuality(harvest.id);

      expect(quality).toHaveProperty('completeness');
      expect(quality).toHaveProperty('accuracy');
      expect(quality).toHaveProperty('relevance');
      expect(quality.overallScore).toBeGreaterThan(0);
      expect(quality.overallScore).toBeLessThanOrEqual(1);
    });
  });

  describe('Harvest Completion', () => {
    test('should complete harvest successfully', async () => {
      const harvest = await harvestService.startHarvest('test-farm', 'Test Farm');

      // Add some results
      await harvestService.addResult(harvest.id, {
        agentId: 'agent-1',
        output: 'Task completed'
      });

      await harvestService.completeHarvest(harvest.id);

      const completed = await harvestService.getHarvest(harvest.id);
      expect(completed?.status).toBe('ready');
      expect(completed?.completedAt).toBeDefined();

      expect(mockBroadcast).toHaveBeenCalledWith('harvest:ready', expect.objectContaining({
        harvestId: harvest.id
      }));
    });

    test('should stop monitoring on completion', async () => {
      const harvest = await harvestService.startHarvest('test-farm', 'Test Farm');

      await harvestService.completeHarvest(harvest.id);

      // Fast-forward to check monitoring stopped
      jest.advanceTimersByTime(10000);

      // Should only have the initial progress and completion broadcasts
      const progressCalls = mockBroadcast.mock.calls.filter(
        call => call[0] === 'harvest:progress'
      );
      expect(progressCalls.length).toBeLessThanOrEqual(1);
    });

    test('should handle harvest failure', async () => {
      const harvest = await harvestService.startHarvest('test-farm', 'Test Farm');

      await harvestService.failHarvest(harvest.id, 'Critical error occurred');

      const failed = await harvestService.getHarvest(harvest.id);
      expect(failed?.status).toBe('failed');
      expect(failed?.error).toBe('Critical error occurred');

      expect(mockBroadcast).toHaveBeenCalledWith('harvest:failed', expect.objectContaining({
        harvestId: harvest.id,
        error: 'Critical error occurred'
      }));
    });
  });

  describe('Export Functionality', () => {
    test('should export harvest as JSON', async () => {
      const harvest = await harvestService.startHarvest('test-farm', 'Test Farm');
      
      await harvestService.addResult(harvest.id, {
        agentId: 'agent-1',
        output: 'Test output'
      });

      const exported = await harvestService.exportHarvest(harvest.id, 'json');

      expect(exported).toHaveProperty('format', 'json');
      expect(exported).toHaveProperty('content');
      
      const content = JSON.parse(exported.content);
      expect(content).toHaveProperty('id', harvest.id);
      expect(content.results).toHaveLength(1);
    });

    test('should export harvest as markdown', async () => {
      const harvest = await harvestService.startHarvest('test-farm', 'Test Farm');
      
      await harvestService.addResult(harvest.id, {
        agentId: 'agent-1',
        agentName: 'Test Agent',
        output: 'Test output'
      });

      const exported = await harvestService.exportHarvest(harvest.id, 'markdown');

      expect(exported.format).toBe('markdown');
      expect(exported.content).toContain('# Harvest Report');
      expect(exported.content).toContain('Test Farm');
      expect(exported.content).toContain('Test Agent');
    });

    test('should validate export format', async () => {
      const harvest = await harvestService.startHarvest('test-farm', 'Test Farm');

      await expect(harvestService.exportHarvest(harvest.id, 'invalid' as any))
        .rejects.toThrow('Unsupported export format');
    });
  });

  describe('Filtering and Search', () => {
    test('should filter harvests by status', async () => {
      await harvestService.startHarvest('farm-1', 'Farm 1');
      const harvest2 = await harvestService.startHarvest('farm-2', 'Farm 2');
      await harvestService.startHarvest('farm-3', 'Farm 3');

      await harvestService.completeHarvest(harvest2.id);

      const readyHarvests = await harvestService.getHarvests({ status: 'ready' });
      expect(readyHarvests).toHaveLength(1);
      expect(readyHarvests[0].id).toBe(harvest2.id);

      const processingHarvests = await harvestService.getHarvests({ status: 'processing' });
      expect(processingHarvests).toHaveLength(2);
    });

    test('should filter harvests by date range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      await harvestService.startHarvest('farm-1', 'Farm 1');
      await harvestService.startHarvest('farm-2', 'Farm 2');

      const harvests = await harvestService.getHarvests({
        startDate: yesterday,
        endDate: tomorrow
      });

      expect(harvests).toHaveLength(2);
    });

    test('should search harvests by tags', async () => {
      const harvest1 = await harvestService.startHarvest('farm-1', 'Farm 1');
      const harvest2 = await harvestService.startHarvest('farm-2', 'Farm 2');

      await harvestService.addTags(harvest1.id, ['production', 'critical']);
      await harvestService.addTags(harvest2.id, ['development', 'test']);

      const productionHarvests = await harvestService.getHarvests({
        tags: ['production']
      });

      expect(productionHarvests).toHaveLength(1);
      expect(productionHarvests[0].id).toBe(harvest1.id);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large number of results', async () => {
      const harvest = await harvestService.startHarvest('test-farm', 'Test Farm');

      // Add 1000 results
      const promises = [];
      for (let i = 0; i < 1000; i++) {
        promises.push(harvestService.addResult(harvest.id, {
          agentId: `agent-${i}`,
          output: `Result ${i}`,
          timestamp: new Date()
        }));
      }

      await Promise.all(promises);

      const updatedHarvest = await harvestService.getHarvest(harvest.id);
      expect(updatedHarvest?.results).toHaveLength(1000);
      expect(updatedHarvest?.summary.totalTasks).toBe(1000);
    });

    test('should batch process results efficiently', async () => {
      const harvest = await harvestService.startHarvest('test-farm', 'Test Farm');

      const batchSize = 100;
      const batches = 10;

      for (let batch = 0; batch < batches; batch++) {
        const results = [];
        for (let i = 0; i < batchSize; i++) {
          results.push({
            agentId: `agent-${batch}-${i}`,
            output: `Batch ${batch} Result ${i}`
          });
        }
        
        await harvestService.addBatchResults(harvest.id, results);
      }

      const updatedHarvest = await harvestService.getHarvest(harvest.id);
      expect(updatedHarvest?.results).toHaveLength(batchSize * batches);
    });
  });

  describe('Error Recovery', () => {
    test('should recover from partial failures', async () => {
      const harvest = await harvestService.startHarvest('test-farm', 'Test Farm');

      // Add some successful results
      await harvestService.addResult(harvest.id, {
        agentId: 'agent-1',
        output: 'Success',
        success: true
      });

      // Add a failed result
      await harvestService.addResult(harvest.id, {
        agentId: 'agent-2',
        output: 'Failed',
        success: false,
        error: 'Task failed'
      });

      // Should still be able to complete
      await harvestService.completeHarvest(harvest.id);

      const completed = await harvestService.getHarvest(harvest.id);
      expect(completed?.status).toBe('ready');
      expect(completed?.summary.failedTasks).toBe(1);
      expect(completed?.summary.completedTasks).toBe(1);
    });

    test('should handle database errors gracefully', async () => {
      (db.insert as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      await expect(harvestService.startHarvest('test-farm', 'Test Farm'))
        .rejects.toThrow('Failed to start harvest');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to start harvest:',
        expect.any(Error)
      );
    });

    test('should cleanup on service shutdown', async () => {
      const harvest1 = await harvestService.startHarvest('farm-1', 'Farm 1');
      const harvest2 = await harvestService.startHarvest('farm-2', 'Farm 2');

      await harvestService.shutdown();

      // All active monitors should be stopped
      jest.advanceTimersByTime(10000);
      
      const progressCalls = mockBroadcast.mock.calls.filter(
        call => call[0] === 'harvest:progress'
      );
      
      // Should have no new progress calls after shutdown
      expect(progressCalls.length).toBe(0);
    });
  });
});