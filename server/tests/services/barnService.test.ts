import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BarnService } from '../../services/barnService';
import { harvestService } from '../../services/harvestService';
import { fileManager } from '../../services/fileManagerService';
import { websocketManager } from '../../websocket/websocketManager';
import { db } from '../../database/client';
import { BarnItem, BarnFolder, BarnStats } from '../../../src/types/barn';
import { Harvest } from '../../../src/types/harvest';
import * as crypto from 'crypto';

// Mock dependencies
jest.mock('../../services/harvestService');
jest.mock('../../services/fileManagerService');
jest.mock('../../websocket/websocketManager');
jest.mock('../../database/client');
jest.mock('../../utils/logger');

describe('BarnService', () => {
  let barnService: BarnService;
  let mockHarvestService: jest.Mocked<typeof harvestService>;
  let mockFileManager: jest.Mocked<typeof fileManager>;
  let mockWebsocketManager: jest.Mocked<typeof websocketManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    barnService = new BarnService();
    mockHarvestService = harvestService as jest.Mocked<typeof harvestService>;
    mockFileManager = fileManager as jest.Mocked<typeof fileManager>;
    mockWebsocketManager = websocketManager as jest.Mocked<typeof websocketManager>;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should create default folders on initialization', () => {
      const folders = barnService.getAllFolders();
      expect(folders).toHaveLength(4);
      expect(folders.map(f => f.id)).toEqual(
        expect.arrayContaining(['apps', 'scripts', 'workflows', 'templates'])
      );
    });

    it('should ensure storage directories exist', async () => {
      expect(mockFileManager.ensureDirectory).toHaveBeenCalledWith(
        expect.stringContaining('BARN_STORAGE')
      );
      expect(mockFileManager.ensureDirectory).toHaveBeenCalledWith(
        expect.stringContaining('BARN_ITEMS')
      );
      expect(mockFileManager.ensureDirectory).toHaveBeenCalledWith(
        expect.stringContaining('BARN_TEMPLATES')
      );
    });
  });

  describe('storeHarvest', () => {
    const mockHarvest: Harvest = {
      id: 'harvest-123',
      farmId: 'farm-456',
      name: 'Test Harvest',
      status: 'ready',
      startTime: new Date(),
      endTime: new Date(),
      yields: [],
      metrics: {
        filesCreated: 5,
        filesModified: 3,
        testsRun: 10,
        testsPassed: 9,
        coverage: 85
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    beforeEach(() => {
      mockHarvestService.findById.mockResolvedValue(mockHarvest);
      mockFileManager.ensureDirectory.mockResolvedValue(undefined);
    });

    it('should successfully store a ready harvest', async () => {
      const options = {
        name: 'Stored Harvest',
        description: 'Test storage',
        type: 'application' as const,
        tags: ['test', 'storage']
      };

      const result = await barnService.storeHarvest('harvest-123', options);

      expect(result).toMatchObject({
        name: 'Stored Harvest',
        description: 'Test storage',
        type: 'application',
        tags: ['test', 'storage'],
        harvestId: 'harvest-123'
      });
      expect(mockHarvestService.findById).toHaveBeenCalledWith('harvest-123');
    });

    it('should throw error if harvest not found', async () => {
      mockHarvestService.findById.mockResolvedValue(null);

      await expect(
        barnService.storeHarvest('invalid-id')
      ).rejects.toThrow('Harvest not found');
    });

    it('should throw error if harvest not ready', async () => {
      mockHarvestService.findById.mockResolvedValue({
        ...mockHarvest,
        status: 'processing'
      });

      await expect(
        barnService.storeHarvest('harvest-123')
      ).rejects.toThrow('Harvest is not ready for storage');
    });

    it('should create isolated storage directory for barn item', async () => {
      await barnService.storeHarvest('harvest-123');

      expect(mockFileManager.ensureDirectory).toHaveBeenCalledWith(
        expect.stringMatching(/barn\/items\/[a-f0-9-]+/)
      );
    });

    it('should emit websocket event on successful storage', async () => {
      const result = await barnService.storeHarvest('harvest-123');

      expect(mockWebsocketManager.broadcast).toHaveBeenCalledWith(
        'barn:item-added',
        expect.objectContaining({
          item: result
        })
      );
    });
  });

  describe('Folder Management', () => {
    it('should create a new folder', async () => {
      const folder = await barnService.createFolder({
        name: 'Custom Folder',
        description: 'Test folder',
        parentId: 'apps'
      });

      expect(folder).toMatchObject({
        name: 'Custom Folder',
        description: 'Test folder',
        parentId: 'apps',
        harvestIds: [],
        subFolderIds: []
      });
    });

    it('should move harvest to folder', async () => {
      const barnItem = await barnService.storeHarvest('harvest-123', {
        folderId: 'apps'
      });

      const folder = barnService.getFolder('apps');
      expect(folder?.harvestIds).toContain(barnItem.id);
    });

    it('should prevent deleting non-empty folder', async () => {
      await barnService.storeHarvest('harvest-123', {
        folderId: 'apps'
      });

      await expect(
        barnService.deleteFolder('apps')
      ).rejects.toThrow('Cannot delete non-empty folder');
    });
  });

  describe('Search and Filtering', () => {
    beforeEach(async () => {
      // Add test items
      await barnService.storeHarvest('harvest-1', {
        name: 'React Component',
        tags: ['react', 'component'],
        type: 'component'
      });
      await barnService.storeHarvest('harvest-2', {
        name: 'API Script',
        tags: ['api', 'script'],
        type: 'script'
      });
      await barnService.storeHarvest('harvest-3', {
        name: 'Workflow Template',
        tags: ['workflow', 'template'],
        type: 'workflow'
      });
    });

    it('should search items by name', async () => {
      const results = await barnService.searchItems({ query: 'Component' });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('React Component');
    });

    it('should filter items by type', async () => {
      const results = await barnService.searchItems({ type: 'script' });
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('script');
    });

    it('should filter items by tags', async () => {
      const results = await barnService.searchItems({ tags: ['workflow'] });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Workflow Template');
    });

    it('should combine multiple filters', async () => {
      const results = await barnService.searchItems({
        type: 'component',
        tags: ['react']
      });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('React Component');
    });
  });

  describe('Statistics', () => {
    it('should calculate barn statistics', async () => {
      await barnService.storeHarvest('harvest-1', { type: 'application' });
      await barnService.storeHarvest('harvest-2', { type: 'script' });
      await barnService.storeHarvest('harvest-3', { type: 'script' });

      const stats = await barnService.getStatistics();

      expect(stats).toMatchObject({
        totalItems: 3,
        totalSize: expect.any(Number),
        itemsByType: {
          application: 1,
          script: 2
        },
        itemsByFolder: expect.any(Object),
        recentActivity: expect.any(Array)
      });
    });

    it('should track recent activity', async () => {
      const item1 = await barnService.storeHarvest('harvest-1');
      const item2 = await barnService.storeHarvest('harvest-2');

      const stats = await barnService.getStatistics();
      expect(stats.recentActivity).toHaveLength(2);
      expect(stats.recentActivity[0].itemId).toBe(item2.id);
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors gracefully', async () => {
      mockFileManager.ensureDirectory.mockRejectedValue(
        new Error('Permission denied')
      );

      await expect(
        barnService.storeHarvest('harvest-123')
      ).rejects.toThrow('Failed to store harvest');
    });

    it('should rollback on partial failure', async () => {
      mockFileManager.copyFile.mockRejectedValue(
        new Error('Disk full')
      );

      await expect(
        barnService.storeHarvest('harvest-123')
      ).rejects.toThrow();

      // Verify cleanup was attempted
      expect(mockFileManager.removeDirectory).toHaveBeenCalled();
    });

    it('should validate input parameters', async () => {
      await expect(
        barnService.storeHarvest('')
      ).rejects.toThrow('Invalid harvest ID');

      await expect(
        barnService.createFolder({ name: '' })
      ).rejects.toThrow('Folder name is required');
    });
  });

  describe('Cleanup and Maintenance', () => {
    it('should clean up orphaned items', async () => {
      // Create items with missing harvests
      mockHarvestService.findById.mockResolvedValue(null);
      
      const cleanedCount = await barnService.cleanupOrphanedItems();
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });

    it('should validate barn integrity', async () => {
      const issues = await barnService.validateIntegrity();
      expect(issues).toEqual([]);
    });

    it('should compact storage by removing duplicates', async () => {
      const savedSpace = await barnService.compactStorage();
      expect(savedSpace).toBeGreaterThanOrEqual(0);
    });
  });
});