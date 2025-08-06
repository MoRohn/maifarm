import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import { Server } from 'http';
import app from '../test-app';
import { barnService } from '../../services/barnService';
import { harvestService } from '../../services/harvestService';
import { BarnItem, BarnFolder, BarnStats } from '../../../src/types/barn';
import { HarvestStatus } from '../../../src/types/harvest';

// Mock the services
jest.mock('../../services/barnService');
jest.mock('../../services/harvestService');
jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

const mockedBarnService = jest.mocked(barnService);
const mockedHarvestService = jest.mocked(harvestService);

describe('Barn API Endpoints', () => {
  let server: Server;
  let serverPort: number;
  let baseURL: string;

  beforeAll(async () => {
    // Start server on random port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        serverPort = typeof address === 'object' ? address.port : 3000;
        baseURL = `http://localhost:${serverPort}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/barn/stats', () => {
    it('should return barn statistics successfully', async () => {
      const mockStats: BarnStats = {
        totalItems: 42,
        itemsByType: {
          harvest: 20,
          template: 10,
          resource: 8,
          documentation: 4
        },
        totalSize: 1024 * 1024 * 50, // 50MB
        lastUpdated: new Date().toISOString(),
        topCategories: ['AI Prompts', 'Templates', 'Documentation']
      };

      mockedBarnService.getStats.mockResolvedValue(mockStats);

      const response = await request(server)
        .get('/api/barn/stats')
        .expect(200);

      expect(response.body).toEqual(mockStats);
      expect(mockedBarnService.getStats).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when getting stats', async () => {
      mockedBarnService.getStats.mockRejectedValue(new Error('Database error'));

      const response = await request(server)
        .get('/api/barn/stats')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to retrieve barn statistics'
      });
    });
  });

  describe('GET /api/barn/items', () => {
    const mockItems: BarnItem[] = [
      {
        id: 'item-1',
        name: 'Test Harvest',
        description: 'A test harvest item',
        type: 'harvest',
        category: 'Templates',
        tags: ['test', 'sample'],
        folderId: 'folder-1',
        harvestId: 'harvest-1',
        status: 'ready',
        size: 2048,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastUsed: null,
        useCount: 0,
        metadata: {
          farmId: 'farm-1',
          agentCount: 2
        }
      },
      {
        id: 'item-2',
        name: 'Documentation',
        description: 'Project documentation',
        type: 'documentation',
        category: 'Docs',
        tags: ['docs', 'readme'],
        folderId: null,
        harvestId: 'harvest-2',
        status: 'archived',
        size: 4096,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        useCount: 5
      }
    ];

    it('should return all barn items without filters', async () => {
      mockedBarnService.findAll.mockResolvedValue(mockItems);

      const response = await request(server)
        .get('/api/barn/items')
        .expect(200);

      expect(response.body).toEqual(mockItems);
      expect(mockedBarnService.findAll).toHaveBeenCalledWith({
        type: undefined,
        category: undefined,
        tags: undefined,
        folderId: undefined,
        searchQuery: undefined
      });
    });

    it('should filter barn items by type', async () => {
      mockedBarnService.findAll.mockResolvedValue([mockItems[0]]);

      const response = await request(server)
        .get('/api/barn/items?type=harvest')
        .expect(200);

      expect(response.body).toEqual([mockItems[0]]);
      expect(mockedBarnService.findAll).toHaveBeenCalledWith({
        type: 'harvest',
        category: undefined,
        tags: undefined,
        folderId: undefined,
        searchQuery: undefined
      });
    });

    it('should filter barn items by tags', async () => {
      mockedBarnService.findAll.mockResolvedValue([mockItems[0]]);

      const response = await request(server)
        .get('/api/barn/items?tags=test,sample')
        .expect(200);

      expect(response.body).toEqual([mockItems[0]]);
      expect(mockedBarnService.findAll).toHaveBeenCalledWith({
        type: undefined,
        category: undefined,
        tags: ['test', 'sample'],
        folderId: undefined,
        searchQuery: undefined
      });
    });

    it('should search barn items', async () => {
      mockedBarnService.findAll.mockResolvedValue([mockItems[1]]);

      const response = await request(server)
        .get('/api/barn/items?search=documentation')
        .expect(200);

      expect(response.body).toEqual([mockItems[1]]);
      expect(mockedBarnService.findAll).toHaveBeenCalledWith({
        type: undefined,
        category: undefined,
        tags: undefined,
        folderId: undefined,
        searchQuery: 'documentation'
      });
    });

    it('should handle errors when getting items', async () => {
      mockedBarnService.findAll.mockRejectedValue(new Error('Database error'));

      const response = await request(server)
        .get('/api/barn/items')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to retrieve barn items'
      });
    });
  });

  describe('GET /api/barn/items/:id', () => {
    const mockItem: BarnItem = {
      id: 'item-1',
      name: 'Test Harvest',
      description: 'A test harvest item',
      type: 'harvest',
      category: 'Templates',
      tags: ['test', 'sample'],
      folderId: 'folder-1',
      harvestId: 'harvest-1',
      status: 'ready',
      size: 2048,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastUsed: null,
      useCount: 0
    };

    it('should return a specific barn item', async () => {
      mockedBarnService.findById.mockResolvedValue(mockItem);

      const response = await request(server)
        .get('/api/barn/items/item-1')
        .expect(200);

      expect(response.body).toEqual(mockItem);
      expect(mockedBarnService.findById).toHaveBeenCalledWith('item-1');
    });

    it('should return 404 when item not found', async () => {
      mockedBarnService.findById.mockResolvedValue(null);

      const response = await request(server)
        .get('/api/barn/items/non-existent')
        .expect(404);

      expect(response.body).toEqual({
        error: 'Barn item not found'
      });
    });

    it('should handle errors when getting item', async () => {
      mockedBarnService.findById.mockRejectedValue(new Error('Database error'));

      const response = await request(server)
        .get('/api/barn/items/item-1')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to retrieve barn item'
      });
    });
  });

  describe('POST /api/barn/store', () => {
    const mockHarvest = {
      id: 'harvest-1',
      farmId: 'farm-1',
      status: 'ready' as HarvestStatus,
      tasks: [],
      outputs: {},
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };

    const mockBarnItem: BarnItem = {
      id: 'item-1',
      name: 'New Harvest',
      description: 'A newly stored harvest',
      type: 'harvest',
      category: 'Templates',
      tags: ['new', 'harvest'],
      folderId: 'folder-1',
      harvestId: 'harvest-1',
      status: 'ready',
      size: 2048,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastUsed: null,
      useCount: 0
    };

    it('should store harvest in barn successfully', async () => {
      mockedBarnService.storeHarvest.mockResolvedValue(mockBarnItem);

      const response = await request(server)
        .post('/api/barn/store')
        .send({
          harvestId: 'harvest-1',
          name: 'New Harvest',
          description: 'A newly stored harvest',
          type: 'harvest',
          category: 'Templates',
          tags: ['new', 'harvest'],
          folderId: 'folder-1'
        })
        .expect(201);

      expect(response.body).toEqual(mockBarnItem);
      expect(mockedBarnService.storeHarvest).toHaveBeenCalledWith('harvest-1', {
        name: 'New Harvest',
        description: 'A newly stored harvest',
        type: 'harvest',
        category: 'Templates',
        tags: ['new', 'harvest'],
        folderId: 'folder-1'
      });
    });

    it('should return 400 when harvestId is missing', async () => {
      const response = await request(server)
        .post('/api/barn/store')
        .send({
          name: 'New Harvest',
          description: 'A newly stored harvest'
        })
        .expect(400);

      expect(response.body).toEqual({
        error: 'Harvest ID is required'
      });
      expect(mockedBarnService.storeHarvest).not.toHaveBeenCalled();
    });

    it('should return 404 when harvest not found', async () => {
      mockedBarnService.storeHarvest.mockRejectedValue(new Error('Harvest not found'));

      const response = await request(server)
        .post('/api/barn/store')
        .send({
          harvestId: 'non-existent',
          name: 'New Harvest'
        })
        .expect(404);

      expect(response.body).toEqual({
        error: 'Harvest not found'
      });
    });

    it('should return 400 when harvest is not ready', async () => {
      mockedBarnService.storeHarvest.mockRejectedValue(new Error('Harvest is not ready for storage'));

      const response = await request(server)
        .post('/api/barn/store')
        .send({
          harvestId: 'harvest-1',
          name: 'New Harvest'
        })
        .expect(400);

      expect(response.body).toEqual({
        error: 'Harvest is not ready for storage'
      });
    });
  });

  describe('PUT /api/barn/items/:id', () => {
    const mockItem: BarnItem = {
      id: 'item-1',
      name: 'Updated Harvest',
      description: 'An updated harvest item',
      type: 'harvest',
      category: 'Templates',
      tags: ['updated', 'test'],
      folderId: 'folder-1',
      harvestId: 'harvest-1',
      status: 'archived',
      size: 2048,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastUsed: null,
      useCount: 0
    };

    it('should update barn item successfully', async () => {
      mockedBarnService.updateItem.mockResolvedValue(mockItem);

      const response = await request(server)
        .put('/api/barn/items/item-1')
        .send({
          name: 'Updated Harvest',
          description: 'An updated harvest item',
          tags: ['updated', 'test'],
          status: 'archived'
        })
        .expect(200);

      expect(response.body).toEqual(mockItem);
      expect(mockedBarnService.updateItem).toHaveBeenCalledWith('item-1', {
        name: 'Updated Harvest',
        description: 'An updated harvest item',
        tags: ['updated', 'test'],
        status: 'archived'
      });
    });

    it('should update only provided fields', async () => {
      mockedBarnService.updateItem.mockResolvedValue(mockItem);

      const response = await request(server)
        .put('/api/barn/items/item-1')
        .send({
          name: 'Updated Harvest'
        })
        .expect(200);

      expect(response.body).toEqual(mockItem);
      expect(mockedBarnService.updateItem).toHaveBeenCalledWith('item-1', {
        name: 'Updated Harvest'
      });
    });

    it('should return 404 when item not found', async () => {
      mockedBarnService.updateItem.mockRejectedValue(new Error('Barn item not found'));

      const response = await request(server)
        .put('/api/barn/items/non-existent')
        .send({
          name: 'Updated Harvest'
        })
        .expect(404);

      expect(response.body).toEqual({
        error: 'Barn item not found'
      });
    });
  });

  describe('POST /api/barn/items/:id/use', () => {
    const mockItem: BarnItem = {
      id: 'item-1',
      name: 'Test Harvest',
      description: 'A test harvest item',
      type: 'harvest',
      category: 'Templates',
      tags: ['test', 'sample'],
      folderId: 'folder-1',
      harvestId: 'harvest-1',
      status: 'ready',
      size: 2048,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      useCount: 1
    };

    it('should mark barn item as used', async () => {
      mockedBarnService.useItem.mockResolvedValue(mockItem);

      const response = await request(server)
        .post('/api/barn/items/item-1/use')
        .expect(200);

      expect(response.body).toEqual(mockItem);
      expect(response.body.useCount).toBe(1);
      expect(response.body.lastUsed).toBeTruthy();
      expect(mockedBarnService.useItem).toHaveBeenCalledWith('item-1');
    });

    it('should return 404 when item not found', async () => {
      mockedBarnService.useItem.mockRejectedValue(new Error('Barn item not found'));

      const response = await request(server)
        .post('/api/barn/items/non-existent/use')
        .expect(404);

      expect(response.body).toEqual({
        error: 'Barn item not found'
      });
    });
  });

  describe('DELETE /api/barn/items/:id', () => {
    it('should delete barn item successfully', async () => {
      mockedBarnService.deleteItem.mockResolvedValue(undefined);

      await request(server)
        .delete('/api/barn/items/item-1')
        .expect(204);

      expect(mockedBarnService.deleteItem).toHaveBeenCalledWith('item-1');
    });

    it('should return 404 when item not found', async () => {
      mockedBarnService.deleteItem.mockRejectedValue(new Error('Barn item not found'));

      const response = await request(server)
        .delete('/api/barn/items/non-existent')
        .expect(404);

      expect(response.body).toEqual({
        error: 'Barn item not found'
      });
    });
  });

  describe('GET /api/barn/folders', () => {
    const mockFolders: BarnFolder[] = [
      {
        id: 'folder-1',
        name: 'Templates',
        description: 'Template storage',
        parentId: null,
        itemCount: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'folder-2',
        name: 'AI Prompts',
        description: 'AI prompt templates',
        parentId: 'folder-1',
        itemCount: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    it('should return all folders', async () => {
      mockedBarnService.getFolders.mockResolvedValue(mockFolders);

      const response = await request(server)
        .get('/api/barn/folders')
        .expect(200);

      expect(response.body).toEqual(mockFolders);
      expect(mockedBarnService.getFolders).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when getting folders', async () => {
      mockedBarnService.getFolders.mockRejectedValue(new Error('Database error'));

      const response = await request(server)
        .get('/api/barn/folders')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to retrieve barn folders'
      });
    });
  });

  describe('POST /api/barn/folders', () => {
    const mockFolder: BarnFolder = {
      id: 'folder-3',
      name: 'New Folder',
      description: 'A new folder',
      parentId: 'folder-1',
      itemCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    it('should create new folder successfully', async () => {
      mockedBarnService.createFolder.mockResolvedValue(mockFolder);

      const response = await request(server)
        .post('/api/barn/folders')
        .send({
          name: 'New Folder',
          description: 'A new folder',
          parentId: 'folder-1'
        })
        .expect(201);

      expect(response.body).toEqual(mockFolder);
      expect(mockedBarnService.createFolder).toHaveBeenCalledWith(
        'New Folder',
        'A new folder',
        'folder-1'
      );
    });

    it('should return 400 when folder name is missing', async () => {
      const response = await request(server)
        .post('/api/barn/folders')
        .send({
          description: 'A new folder'
        })
        .expect(400);

      expect(response.body).toEqual({
        error: 'Folder name is required'
      });
      expect(mockedBarnService.createFolder).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/barn/items/:id/to-seed', () => {
    const mockYaml = `name: Test Template
description: A test template from barn
agents:
  - role: developer
    tasks:
      - implement feature
`;

    it('should create seed from barn item', async () => {
      mockedBarnService.createSeedFromItem.mockResolvedValue(mockYaml);

      const response = await request(server)
        .post('/api/barn/items/item-1/to-seed')
        .expect(200);

      expect(response.body).toEqual({ yaml: mockYaml });
      expect(mockedBarnService.createSeedFromItem).toHaveBeenCalledWith('item-1');
    });

    it('should return 404 when item not found', async () => {
      mockedBarnService.createSeedFromItem.mockRejectedValue(new Error('Barn item not found'));

      const response = await request(server)
        .post('/api/barn/items/non-existent/to-seed')
        .expect(404);

      expect(response.body).toEqual({
        error: 'Barn item not found'
      });
    });

    it('should return 400 when item has no YAML', async () => {
      mockedBarnService.createSeedFromItem.mockRejectedValue(
        new Error('Barn item does not have YAML configuration')
      );

      const response = await request(server)
        .post('/api/barn/items/item-1/to-seed')
        .expect(400);

      expect(response.body).toEqual({
        error: 'Barn item does not have YAML configuration'
      });
    });
  });
});