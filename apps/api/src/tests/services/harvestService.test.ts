import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { HarvestService } from '../../services/harvestService';
import { unifiedWebSocketManager as websocketManager } from '../../websocket/UnifiedWebSocketManager';
import { db } from '../../database/connection';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

jest.mock('../../websocket/UnifiedWebSocketManager');
jest.mock('../../database/connection');
jest.mock('child_process');
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('HarvestService', () => {
  let harvestService: HarvestService;
  const mockFarmId = 'test-farm-123';
  const mockFarmName = 'Test Farm';
  const mockUserId = 'user-456';

  beforeEach(() => {
    jest.clearAllMocks();
    harvestService = new HarvestService();
    
    // Setup default mocks
    (websocketManager.broadcast as jest.Mock) = jest.fn();
    (db.query as jest.Mock) = jest.fn().mockResolvedValue({ rows: [] });
  });

  afterEach(() => {
    // Clean up any active intervals
    harvestService['activeHarvests'].forEach(timer => clearInterval(timer));
    jest.restoreAllMocks();
  });

  describe('startHarvest', () => {
    it('should create and start a new harvest', async () => {
      const harvest = await harvestService.startHarvest(mockFarmId, mockFarmName, mockUserId);

      expect(harvest).toBeDefined();
      expect(harvest.farmId).toBe(mockFarmId);
      expect(harvest.farmName).toBe(mockFarmName);
      expect(harvest.status).toBe('processing');
      expect(harvest.summary.description).toContain(mockFarmName);
      
      expect(websocketManager.broadcast).toHaveBeenCalledWith('harvest:started', {
        harvestId: harvest.id,
        farmId: mockFarmId,
        farmName: mockFarmName
      });
    });

    it('should track user ownership of harvest', async () => {
      const harvest = await harvestService.startHarvest(mockFarmId, mockFarmName, mockUserId);
      
      const userHarvests = harvestService.getUserHarvests(mockUserId);
      expect(userHarvests).toContain(harvest);
    });

    it('should handle errors during harvest creation', async () => {
      // Force an error by mocking websocketManager to throw
      (websocketManager.broadcast as jest.Mock).mockImplementation(() => {
        throw new Error('WebSocket error');
      });

      await expect(harvestService.startHarvest(mockFarmId, mockFarmName))
        .rejects.toThrow('Failed to start harvest');
    });

    it('should start monitoring the harvest', async () => {
      jest.useFakeTimers();
      
      const harvest = await harvestService.startHarvest(mockFarmId, mockFarmName);
      
      expect(harvestService['activeHarvests'].has(harvest.id)).toBe(true);
      
      // Advance timers to trigger monitoring
      jest.advanceTimersByTime(5000);
      
      expect(websocketManager.broadcast).toHaveBeenCalledWith(
        'harvest:progress',
        expect.objectContaining({
          harvestId: harvest.id
        })
      );
      
      jest.useRealTimers();
    });
  });

  describe('completeHarvest', () => {
    it('should complete harvest successfully', async () => {
      const harvest = await harvestService.startHarvest(mockFarmId, mockFarmName);
      
      const completedHarvest = await harvestService.completeHarvest(harvest.id);
      
      expect(completedHarvest.status).toBe('ready');
      expect(completedHarvest.completedAt).toBeDefined();
      expect(websocketManager.broadcast).toHaveBeenCalledWith('harvest:ready', {
        harvestId: harvest.id,
        harvest: completedHarvest
      });
    });

    it('should stop monitoring on completion', async () => {
      jest.useFakeTimers();
      
      const harvest = await harvestService.startHarvest(mockFarmId, mockFarmName);
      expect(harvestService['activeHarvests'].has(harvest.id)).toBe(true);
      
      await harvestService.completeHarvest(harvest.id);
      
      // Advance timers and verify monitoring stopped
      jest.advanceTimersByTime(10000);
      expect(harvestService['activeHarvests'].has(harvest.id)).toBe(false);
      
      jest.useRealTimers();
    });

    it('should handle completion of non-existent harvest', async () => {
      await expect(harvestService.completeHarvest('non-existent'))
        .rejects.toThrow('Harvest not found');
    });
  });

  describe('addResult', () => {
    it('should add result to harvest', async () => {
      const harvest = await harvestService.startHarvest(mockFarmId, mockFarmName);
      
      const result = {
        agentName: 'Test Agent',
        agentType: 'analyzer' as const,
        taskName: 'Test Task',
        output: 'Test output',
        artifacts: []
      };
      
      await harvestService.addResult(harvest.id, result);
      
      const updatedHarvest = harvestService.getHarvest(harvest.id);
      expect(updatedHarvest?.results).toHaveLength(1);
      expect(updatedHarvest?.results[0]).toMatchObject(result);
      expect(updatedHarvest?.summary.completedTasks).toBe(1);
    });

    it('should calculate quality after adding result', async () => {
      const harvest = await harvestService.startHarvest(mockFarmId, mockFarmName);
      
      await harvestService.addResult(harvest.id, {
        agentName: 'Agent 1',
        agentType: 'executor',
        taskName: 'Task 1',
        output: 'Comprehensive test output with detailed information',
        artifacts: [{ type: 'code', path: 'test.js', content: 'code' }]
      });
      
      const updatedHarvest = harvestService.getHarvest(harvest.id);
      expect(updatedHarvest?.quality.completeness).toBeGreaterThan(0);
    });
  });

  describe('addInsight', () => {
    it('should add insight to harvest', async () => {
      const harvest = await harvestService.startHarvest(mockFarmId, mockFarmName);
      
      const insight = {
        type: 'pattern' as const,
        title: 'Test Pattern',
        description: 'A test pattern was detected',
        importance: 'high' as const,
        source: 'Test Agent'
      };
      
      await harvestService.addInsight(harvest.id, insight);
      
      const updatedHarvest = harvestService.getHarvest(harvest.id);
      expect(updatedHarvest?.insights).toHaveLength(1);
      expect(updatedHarvest?.insights[0]).toMatchObject(insight);
    });
  });

  describe('collectQuickTaskOutput', () => {
    it('should collect output from quick task tmux session', async () => {
      const harvest = await harvestService.startHarvest('quick-task-abc123', 'Quick Task');
      
      // Mock spawn to simulate tmux output
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      (spawn as jest.Mock).mockReturnValue(mockProcess);
      
      // Trigger the collection
      const collectPromise = harvestService['collectQuickTaskOutput'](harvest);
      
      // Simulate tmux output
      mockProcess.stdout.emit('data', Buffer.from('Test command output\nProcessing...\nComplete!'));
      mockProcess.emit('exit', 0);
      
      await collectPromise;
      
      expect(spawn).toHaveBeenCalledWith('tmux', [
        'capture-pane',
        '-t', 'quick_abc123:0',
        '-p',
        '-S', '-500'
      ]);
    });
  });

  describe('getHarvest', () => {
    it('should retrieve existing harvest', async () => {
      const harvest = await harvestService.startHarvest(mockFarmId, mockFarmName);
      
      const retrieved = harvestService.getHarvest(harvest.id);
      expect(retrieved).toEqual(harvest);
    });

    it('should return undefined for non-existent harvest', () => {
      const harvest = harvestService.getHarvest('non-existent');
      expect(harvest).toBeUndefined();
    });
  });

  describe('getUserHarvests', () => {
    it('should return all harvests for a user', async () => {
      const harvest1 = await harvestService.startHarvest('farm-1', 'Farm 1', mockUserId);
      const harvest2 = await harvestService.startHarvest('farm-2', 'Farm 2', mockUserId);
      const harvest3 = await harvestService.startHarvest('farm-3', 'Farm 3', 'other-user');
      
      const userHarvests = harvestService.getUserHarvests(mockUserId);
      
      expect(userHarvests).toHaveLength(2);
      expect(userHarvests.map(h => h.id)).toContain(harvest1.id);
      expect(userHarvests.map(h => h.id)).toContain(harvest2.id);
      expect(userHarvests.map(h => h.id)).not.toContain(harvest3.id);
    });

    it('should return empty array for user with no harvests', () => {
      const harvests = harvestService.getUserHarvests('new-user');
      expect(harvests).toEqual([]);
    });
  });

  describe('filterHarvests', () => {
    beforeEach(async () => {
      // Create test harvests
      const harvest1 = await harvestService.startHarvest('farm-1', 'Farm Alpha', mockUserId);
      harvest1.tags = ['production', 'critical'];
      
      const harvest2 = await harvestService.startHarvest('farm-2', 'Farm Beta', mockUserId);
      harvest2.tags = ['testing'];
      await harvestService.completeHarvest(harvest2.id);
      
      const harvest3 = await harvestService.startHarvest('farm-3', 'Farm Gamma', 'other-user');
      harvest3.tags = ['production'];
    });

    it('should filter by status', () => {
      const readyHarvests = harvestService.filterHarvests({ status: 'ready' });
      expect(readyHarvests).toHaveLength(1);
      expect(readyHarvests[0].farmName).toBe('Farm Beta');
    });

    it('should filter by tags', () => {
      const productionHarvests = harvestService.filterHarvests({ tags: ['production'] });
      expect(productionHarvests).toHaveLength(2);
    });

    it('should filter by farm name', () => {
      const alphaHarvests = harvestService.filterHarvests({ farmName: 'Alpha' });
      expect(alphaHarvests).toHaveLength(1);
      expect(alphaHarvests[0].farmName).toBe('Farm Alpha');
    });

    it('should combine multiple filters', () => {
      const filtered = harvestService.filterHarvests({
        status: 'processing',
        tags: ['production']
      });
      expect(filtered).toHaveLength(2);
    });
  });

  describe('exportHarvest', () => {
    it('should export harvest in JSON format', async () => {
      const harvest = await harvestService.startHarvest(mockFarmId, mockFarmName);
      await harvestService.addResult(harvest.id, {
        agentName: 'Test Agent',
        agentType: 'executor',
        taskName: 'Test Task',
        output: 'Test output',
        artifacts: []
      });
      
      const exported = await harvestService.exportHarvest(harvest.id, 'json');
      
      expect(exported.format).toBe('json');
      expect(exported.content).toBeDefined();
      expect(JSON.parse(exported.content)).toMatchObject({
        id: harvest.id,
        farmId: mockFarmId
      });
    });

    it('should export harvest in Markdown format', async () => {
      const harvest = await harvestService.startHarvest(mockFarmId, mockFarmName);
      
      const exported = await harvestService.exportHarvest(harvest.id, 'markdown');
      
      expect(exported.format).toBe('markdown');
      expect(exported.content).toContain(`# Harvest Report: ${mockFarmName}`);
      expect(exported.content).toContain('## Summary');
    });

    it('should handle invalid export format', async () => {
      const harvest = await harvestService.startHarvest(mockFarmId, mockFarmName);
      
      await expect(harvestService.exportHarvest(harvest.id, 'invalid' as any))
        .rejects.toThrow('Unsupported export format');
    });
  });

  describe('archiveHarvest', () => {
    it('should archive completed harvest', async () => {
      const harvest = await harvestService.startHarvest(mockFarmId, mockFarmName);
      await harvestService.completeHarvest(harvest.id);
      
      await harvestService.archiveHarvest(harvest.id);
      
      const archived = harvestService.getHarvest(harvest.id);
      expect(archived?.status).toBe('archived');
    });

    it('should not archive processing harvest', async () => {
      const harvest = await harvestService.startHarvest(mockFarmId, mockFarmName);
      
      await expect(harvestService.archiveHarvest(harvest.id))
        .rejects.toThrow('Cannot archive harvest in processing state');
    });
  });

  describe('calculateQuality', () => {
    it('should calculate quality metrics accurately', async () => {
      const harvest = await harvestService.startHarvest(mockFarmId, mockFarmName);
      
      // Add comprehensive results
      await harvestService.addResult(harvest.id, {
        agentName: 'Agent 1',
        agentType: 'analyzer',
        taskName: 'Analysis',
        output: 'Detailed analysis with multiple insights and recommendations',
        artifacts: [
          { type: 'code', path: 'file1.js', content: 'code1' },
          { type: 'document', path: 'doc.md', content: 'documentation' }
        ]
      });
      
      await harvestService.addInsight(harvest.id, {
        type: 'pattern',
        title: 'Pattern Found',
        description: 'Important pattern',
        importance: 'high',
        source: 'Agent 1'
      });
      
      const quality = harvestService['calculateQuality'](harvest);
      
      expect(quality.completeness).toBeGreaterThan(0);
      expect(quality.accuracy).toBeGreaterThan(0);
      expect(quality.relevance).toBeGreaterThan(0);
      expect(quality.overallScore).toBeLessThanOrEqual(100);
    });
  });

  describe('cleanupOldHarvests', () => {
    it('should remove harvests older than retention period', async () => {
      const oldHarvest = await harvestService.startHarvest('old-farm', 'Old Farm');
      
      // Manually set old date
      oldHarvest.createdAt = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000); // 35 days old
      await harvestService.completeHarvest(oldHarvest.id);
      await harvestService.archiveHarvest(oldHarvest.id);
      
      const recentHarvest = await harvestService.startHarvest('recent-farm', 'Recent Farm');
      
      await harvestService.cleanupOldHarvests();
      
      expect(harvestService.getHarvest(oldHarvest.id)).toBeUndefined();
      expect(harvestService.getHarvest(recentHarvest.id)).toBeDefined();
    });
  });
});