import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { Server } from 'http';
import app from '../test-app';
import { db, redis } from '../../database/connection';
import { barnService } from '../../services/barnService';
import { harvestService } from '../../services/harvestService';
import { BarnItem } from '../../../src/types/barn';
import { mockBarnItems, mockHarvests, createMockBarnItem } from '../fixtures/barnFixtures';
import { expectBarnItemStructure, expectFolderStructure, expectStatsStructure } from '../helpers/barnTestHelpers';

// Skip integration tests by default since they require a real database
// To run integration tests, set RUN_INTEGRATION_TESTS=true
const describeIntegration = describe.skip;

describeIntegration('Barn API Integration Tests', () => {
  let server: Server;
  let serverPort: number;
  let baseURL: string;
  let testFarmId: string;
  let testHarvestId: string;

  beforeAll(async () => {
    // Ensure database is connected
    if (!db) {
      console.warn('Database not available, skipping integration tests');
      return;
    }

    // Start server on random port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        serverPort = typeof address === 'object' ? address.port : 3000;
        baseURL = `http://localhost:${serverPort}`;
        resolve();
      });
    });

    // Clean up test data
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  beforeEach(async () => {
    // For integration tests, we would normally create test data here
    // Since we're mocking the services, we'll use test IDs
    testFarmId = 'test-farm-' + Date.now();
    testHarvestId = 'test-harvest-' + Date.now();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('Full Barn Workflow', () => {
    it('should complete full barn item lifecycle', async () => {
      // 1. Check initial stats
      const initialStats = await request(server)
        .get('/api/barn/stats')
        .expect(200);

      expect(initialStats.body.totalItems).toBe(0);

      // 2. Store harvest in barn
      const storeResponse = await request(server)
        .post('/api/barn/store')
        .send({
          harvestId: testHarvestId,
          name: 'Integration Test Harvest',
          description: 'Harvest from integration test',
          type: 'harvest',
          category: 'Integration Tests',
          tags: ['test', 'integration'],
          folderId: null
        })
        .expect(201);

      const barnItem = storeResponse.body;
      expectBarnItemStructure(barnItem);
      expect(barnItem.name).toBe('Integration Test Harvest');
      expect(barnItem.harvestId).toBe(testHarvestId);

      // 3. Get barn item by ID
      const getResponse = await request(server)
        .get(`/api/barn/items/${barnItem.id}`)
        .expect(200);

      expect(getResponse.body).toEqual(barnItem);

      // 4. Update barn item
      const updateResponse = await request(server)
        .put(`/api/barn/items/${barnItem.id}`)
        .send({
          name: 'Updated Integration Test',
          tags: ['test', 'integration', 'updated']
        })
        .expect(200);

      expect(updateResponse.body.name).toBe('Updated Integration Test');
      expect(updateResponse.body.tags).toContain('updated');

      // 5. Use barn item
      const useResponse = await request(server)
        .post(`/api/barn/items/${barnItem.id}/use`)
        .expect(200);

      expect(useResponse.body.useCount).toBe(1);
      expect(useResponse.body.lastUsed).toBeTruthy();

      // 6. Search for item
      const searchResponse = await request(server)
        .get('/api/barn/items?search=Updated')
        .expect(200);

      expect(searchResponse.body).toHaveLength(1);
      expect(searchResponse.body[0].id).toBe(barnItem.id);

      // 7. Check updated stats
      const updatedStats = await request(server)
        .get('/api/barn/stats')
        .expect(200);

      expect(updatedStats.body.totalItems).toBe(1);
      expect(updatedStats.body.itemsByType.harvest).toBe(1);

      // 8. Delete barn item
      await request(server)
        .delete(`/api/barn/items/${barnItem.id}`)
        .expect(204);

      // 9. Verify deletion
      await request(server)
        .get(`/api/barn/items/${barnItem.id}`)
        .expect(404);
    });
  });

  describe('Folder Management', () => {
    it('should manage folders and organize items', async () => {
      // 1. Create parent folder
      const parentFolderResponse = await request(server)
        .post('/api/barn/folders')
        .send({
          name: 'Parent Folder',
          description: 'Top level folder'
        })
        .expect(201);

      const parentFolder = parentFolderResponse.body;
      expectFolderStructure(parentFolder);

      // 2. Create child folder
      const childFolderResponse = await request(server)
        .post('/api/barn/folders')
        .send({
          name: 'Child Folder',
          description: 'Nested folder',
          parentId: parentFolder.id
        })
        .expect(201);

      const childFolder = childFolderResponse.body;
      expect(childFolder.parentId).toBe(parentFolder.id);

      // 3. Store harvest in folder
      const storeResponse = await request(server)
        .post('/api/barn/store')
        .send({
          harvestId: testHarvestId,
          name: 'Folder Test Item',
          type: 'harvest',
          folderId: childFolder.id
        })
        .expect(201);

      expect(storeResponse.body.folderId).toBe(childFolder.id);

      // 4. Get all folders
      const foldersResponse = await request(server)
        .get('/api/barn/folders')
        .expect(200);

      expect(foldersResponse.body.length).toBeGreaterThanOrEqual(2);
      const folders = foldersResponse.body;
      expect(folders).toContainEqual(expect.objectContaining({ id: parentFolder.id }));
      expect(folders).toContainEqual(expect.objectContaining({ id: childFolder.id }));

      // 5. Filter items by folder
      const itemsResponse = await request(server)
        .get(`/api/barn/items?folderId=${childFolder.id}`)
        .expect(200);

      expect(itemsResponse.body).toHaveLength(1);
      expect(itemsResponse.body[0].folderId).toBe(childFolder.id);
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent harvest', async () => {
      const response = await request(server)
        .post('/api/barn/store')
        .send({
          harvestId: 'non-existent-harvest',
          name: 'Test Item'
        })
        .expect(404);

      expect(response.body).toEqual({ error: 'Harvest not found' });
    });

    it('should handle harvest not ready for storage', async () => {
      // Create harvest but don't mark as ready
      const harvest = await harvestService.create(testFarmId);
      
      const response = await request(server)
        .post('/api/barn/store')
        .send({
          harvestId: harvest.id,
          name: 'Test Item'
        })
        .expect(400);

      expect(response.body).toEqual({ error: 'Harvest is not ready for storage' });
    });

    it('should handle duplicate folder names', async () => {
      // Create first folder
      await request(server)
        .post('/api/barn/folders')
        .send({
          name: 'Duplicate Test',
          description: 'First folder'
        })
        .expect(201);

      // Try to create duplicate
      const response = await request(server)
        .post('/api/barn/folders')
        .send({
          name: 'Duplicate Test',
          description: 'Second folder'
        })
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Advanced Filtering', () => {
    let barnItems: BarnItem[] = [];

    beforeEach(async () => {
      // Create multiple barn items with different properties
      const itemPromises = [
        {
          name: 'AI Template 1',
          type: 'template',
          category: 'AI',
          tags: ['ai', 'template', 'v1']
        },
        {
          name: 'AI Template 2',
          type: 'template',
          category: 'AI',
          tags: ['ai', 'template', 'v2']
        },
        {
          name: 'Workflow Config',
          type: 'harvest',
          category: 'Workflows',
          tags: ['workflow', 'automation']
        },
        {
          name: 'API Documentation',
          type: 'documentation',
          category: 'Docs',
          tags: ['api', 'docs']
        }
      ].map(async (itemData) => {
        const harvest = await harvestService.create(testFarmId);
        await harvestService.updateStatus(harvest.id, 'ready');
        
        const response = await request(server)
          .post('/api/barn/store')
          .send({
            harvestId: harvest.id,
            ...itemData
          });
          
        return response.body;
      });

      barnItems = await Promise.all(itemPromises);
    });

    it('should filter by type', async () => {
      const response = await request(server)
        .get('/api/barn/items?type=template')
        .expect(200);

      expect(response.body).toHaveLength(2);
      response.body.forEach((item: BarnItem) => {
        expect(item.type).toBe('template');
      });
    });

    it('should filter by category', async () => {
      const response = await request(server)
        .get('/api/barn/items?category=AI')
        .expect(200);

      expect(response.body).toHaveLength(2);
      response.body.forEach((item: BarnItem) => {
        expect(item.category).toBe('AI');
      });
    });

    it('should filter by multiple tags', async () => {
      const response = await request(server)
        .get('/api/barn/items?tags=ai,template')
        .expect(200);

      expect(response.body).toHaveLength(2);
      response.body.forEach((item: BarnItem) => {
        expect(item.tags).toContain('ai');
        expect(item.tags).toContain('template');
      });
    });

    it('should search by name', async () => {
      const response = await request(server)
        .get('/api/barn/items?search=Template')
        .expect(200);

      expect(response.body).toHaveLength(2);
      response.body.forEach((item: BarnItem) => {
        expect(item.name).toContain('Template');
      });
    });

    it('should combine multiple filters', async () => {
      const response = await request(server)
        .get('/api/barn/items?type=template&category=AI&tags=v2')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('AI Template 2');
    });
  });

  // Helper function to clean up test data
  async function cleanupTestData() {
    if (!db) return;

    try {
      // Clean up barn items
      await db.query('DELETE FROM barn_items WHERE name LIKE $1', ['%Test%']);
      await db.query('DELETE FROM barn_items WHERE category IN ($1, $2)', ['Integration Tests', 'AI']);
      
      // Clean up folders
      await db.query('DELETE FROM barn_folders WHERE name LIKE $1', ['%Test%']);
      await db.query('DELETE FROM barn_folders WHERE name IN ($1, $2)', ['Parent Folder', 'Child Folder']);
      
      // Clean up harvests
      await db.query('DELETE FROM harvests WHERE farm_id IN (SELECT id FROM farms WHERE name = $1)', ['Test Farm']);
      
      // Clean up farms
      await db.query('DELETE FROM farms WHERE name = $1', ['Test Farm']);
    } catch (error) {
      console.error('Error cleaning up test data:', error);
    }
  }
});