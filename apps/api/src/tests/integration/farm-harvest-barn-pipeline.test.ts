/**
 * Comprehensive integration test for Farm → Harvest → Barn pipeline
 * Tests the complete flow from farm completion to yield items stored in barn
 */

import { harvestService } from '../../services/harvestService';
import { barnService } from '../../services/unified/barnService';
import { shutdownCoordinator } from '../../services/shutdownCoordinator';
import { db } from '../../database/connection';
import * as fs from 'fs/promises';
import * as path from 'path';
import { pathConfig } from '../../config/paths';

describe('Farm → Harvest → Barn Pipeline Integration', () => {
  const testFarmId = 'test-farm-pipeline-001';
  const testUserId = '00000000-0000-0000-0000-000000000000';
  let harvestId: string;
  let barnItemId: string;

  beforeAll(async () => {
    // Create test workspace and terminal directories
    const workspacePath = pathConfig.getWorkspacePath(testFarmId);
    const terminalDir = pathConfig.getTerminalDir(testFarmId);

    if (workspacePath) {
      await fs.mkdir(workspacePath, { recursive: true });
      // Create sample workspace files
      await fs.writeFile(
        path.join(workspacePath, 'test-code.ts'),
        'export function hello() { return "world"; }'
      );
      await fs.writeFile(
        path.join(workspacePath, 'README.md'),
        '# Test Project\n\nThis is a test project.'
      );
      // Create HTML file to test HTML document collection
      await fs.writeFile(
        path.join(workspacePath, 'report.html'),
        '<!DOCTYPE html><html><head><title>Test Report</title></head><body><h1>Test Results</h1><p>All tests passed successfully.</p></body></html>'
      );
    }

    if (terminalDir) {
      await fs.mkdir(terminalDir, { recursive: true });
      // Create sample terminal log
      await fs.writeFile(
        path.join(terminalDir, 'agent-0.log'),
        'Agent started\nRunning tests...\nTests passed\n'
      );
    }
  });

  afterAll(async () => {
    // Cleanup test data
    try {
      await db.query('DELETE FROM harvest_yield WHERE farm_id = $1', [testFarmId]);
      await db.query('DELETE FROM harvests WHERE farm_id = $1', [testFarmId]);
      await db.query('DELETE FROM barn_items WHERE metadata->>\'farmId\' = $1', [testFarmId]);
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  describe('Step 1: Harvest Creation and Collection', () => {
    it('should create a harvest for the farm', async () => {
      const harvest = await harvestService.startHarvest({
        farmId: testFarmId,
        name: 'Test Pipeline Harvest',
        tags: ['test', 'pipeline'],
        metadata: {
          mode: 'test',
          farmName: 'Test Farm'
        }
      });

      expect(harvest).toBeDefined();
      expect(harvest.id).toBeDefined();
      expect(harvest.farmId).toBe(testFarmId);
      expect(harvest.status).toBe('processing');

      harvestId = harvest.id;
    });

    it('should collect artifacts from workspace and terminal', async () => {
      const harvest = await harvestService.collectHarvest(harvestId);

      expect(harvest).toBeDefined();
      expect(harvest!.artifacts.length).toBeGreaterThan(0);
      expect(harvest!.yield.length).toBeGreaterThan(0);

      // Verify artifacts include workspace files
      const workspaceArtifacts = harvest!.artifacts.filter(a => a.source === 'workspace');
      expect(workspaceArtifacts.length).toBeGreaterThanOrEqual(3); // test-code.ts, README.md, report.html

      // Verify artifacts include terminal logs
      const terminalArtifacts = harvest!.artifacts.filter(a => a.source === 'terminal');
      expect(terminalArtifacts.length).toBeGreaterThanOrEqual(1);
    });

    it('should create yield items with proper types', async () => {
      const harvest = await harvestService.getHarvest(harvestId);

      expect(harvest).toBeDefined();
      expect(harvest!.yield).toBeDefined();
      expect(harvest!.yield.length).toBeGreaterThan(0);

      // Verify yield items have required properties
      for (const yieldItem of harvest!.yield) {
        expect(yieldItem.id).toBeDefined();
        expect(yieldItem.type).toBeDefined();
        expect((yieldItem as any).name).toBeDefined();
        expect((yieldItem as any).size).toBeGreaterThan(0);
        expect(yieldItem.metadata).toBeDefined();
      }

      // Verify we have different types
      const types = new Set(harvest!.yield.map(y => y.type));
      expect(types.size).toBeGreaterThan(1); // Should have multiple types (code, documentation, report, etc.)
    });

    it('should correctly classify and collect HTML files', async () => {
      const harvest = await harvestService.getHarvest(harvestId);

      expect(harvest).toBeDefined();

      // Find the HTML artifact
      const htmlArtifact = harvest!.artifacts.find(a => a.name === 'report.html');
      expect(htmlArtifact).toBeDefined();
      expect(htmlArtifact!.type).toBe('document');
      expect((htmlArtifact as any).mimeType).toBe('text/html');
      expect(htmlArtifact!.source).toBe('workspace');

      // Find the HTML yield item
      const htmlYield = harvest!.yield.find(y => (y as any).name === 'report.html');
      expect(htmlYield).toBeDefined();
      expect(htmlYield!.type).toBe('documentation');
      expect((htmlYield as any).mimeType).toBe('text/html');
    });
  });

  describe('Step 2: Harvest Yield Persistence', () => {
    it('should save yield items to harvest_yield table', async () => {
      const result = await db.query(
        'SELECT * FROM harvest_yield WHERE harvest_id = $1',
        [harvestId]
      );

      expect(result.rows.length).toBeGreaterThan(0);

      // Verify each yield item has required fields
      for (const row of result.rows) {
        expect(row.id).toBeDefined();
        expect(row.harvest_id).toBe(harvestId);
        expect(row.farm_id).toBe(testFarmId);
        expect(row.item_type).toBeDefined();
        expect(row.item_name).toBeDefined();
        expect(row.item_value).toBeDefined();
        expect(row.quality_score).toBeDefined();
        expect(parseFloat(row.quality_score)).toBeGreaterThanOrEqual(0);
        expect(parseFloat(row.quality_score)).toBeLessThanOrEqual(1);
      }
    });

    it('should calculate quality scores correctly', async () => {
      const result = await db.query(
        `SELECT item_type, AVG(quality_score::numeric) as avg_score
         FROM harvest_yield
         WHERE harvest_id = $1
         GROUP BY item_type`,
        [harvestId]
      );

      expect(result.rows.length).toBeGreaterThan(0);

      // Verify quality scores are reasonable
      for (const row of result.rows) {
        const avgScore = parseFloat(row.avg_score);
        expect(avgScore).toBeGreaterThanOrEqual(0.3); // Even low quality should be > 0.3
        expect(avgScore).toBeLessThanOrEqual(1.0);

        // High-value types should have higher scores
        if (['code', 'documentation', 'data'].includes(row.item_type)) {
          expect(avgScore).toBeGreaterThanOrEqual(0.5);
        }
      }
    });
  });

  describe('Step 3: Barn Storage', () => {
    it('should store harvest in barn', async () => {
      const harvest = await harvestService.getHarvest(harvestId);
      expect(harvest).toBeDefined();

      const barnItem = await barnService.storeHarvest(harvest as any, {
        name: 'Test Farm Harvest',
        description: 'Automated test harvest',
        tags: ['test', 'pipeline', 'integration']
      });

      expect(barnItem).toBeDefined();
      expect(barnItem.id).toBeDefined();
      expect(barnItem.metadata.harvestId).toBe(harvestId);
      expect(barnItem.metadata.farmId).toBe(testFarmId);
      expect((barnItem.metadata as any).yieldCount).toBeGreaterThan(0);

      barnItemId = barnItem.id;
    });

    it('should extract and create individual barn items from yield', async () => {
      // Query barn items that link to this harvest
      const yieldBarnItems = await barnService.findAll({
        userId: testUserId
      });

      const harvestYieldItems = yieldBarnItems.filter(
        item => (item.metadata as any).parentBarnItemId === barnItemId
      );

      expect(harvestYieldItems.length).toBeGreaterThan(0);

      // Verify each yield barn item has proper structure
      for (const item of harvestYieldItems) {
        expect(item.id).toBeDefined();
        expect(item.name).toBeDefined();
        expect(item.type).toBeDefined();
        expect(item.metadata.harvestId).toBe(harvestId);
        expect(item.metadata.farmId).toBe(testFarmId);
        expect((item.metadata as any).parentBarnItemId).toBe(barnItemId);
        expect((item.metadata as any).yieldItemId).toBeDefined();
        expect((item.metadata as any).yieldType).toBeDefined();
        expect((item.metadata as any).qualityScore).toBeDefined();
        expect(item.metadata.tags).toBeDefined();
        expect(Array.isArray(item.metadata.tags)).toBe(true);
      }
    });

    it('should create catalog entries for yield items', async () => {
      const catalog = await barnService.getCatalog();

      const yieldCatalogEntries = catalog.filter(
        entry => {
          const barnItem = barnService.findById(entry.barnItemId);
          return barnItem && (barnItem as any).then === undefined &&
                 (barnItem as any).metadata?.harvestId === harvestId;
        }
      );

      expect(yieldCatalogEntries.length).toBeGreaterThan(0);

      // Verify catalog entries have proper categorization
      const categories = new Set(yieldCatalogEntries.map(e => e.category));
      expect(categories.size).toBeGreaterThan(0);

      // Common categories we expect
      const expectedCategories = ['Code & Scripts', 'Documentation', 'Reports & Insights'];
      const hasExpectedCategory = Array.from(categories).some(c =>
        expectedCategories.includes(c)
      );
      expect(hasExpectedCategory).toBe(true);
    });

    it('should properly tag yield items for discovery', async () => {
      const yieldBarnItems = await barnService.findAll({
        tags: ['yield'],
        userId: testUserId
      });

      const harvestYieldItems = yieldBarnItems.filter(
        item => item.metadata.harvestId === harvestId
      );

      expect(harvestYieldItems.length).toBeGreaterThan(0);

      // Verify tags are meaningful
      for (const item of harvestYieldItems) {
        const tags = item.metadata.tags || [];
        expect(tags).toContain('yield');

        // Should have type-specific tag
        if ((item.metadata as any).yieldType) {
          expect(tags).toContain((item.metadata as any).yieldType);
        }

        // Should have source tag
        const sourceTags = tags.filter((t: string) => t.startsWith('source:'));
        expect(sourceTags.length).toBeGreaterThan(0);
      }
    });

    it('should properly store HTML files in barn with correct metadata', async () => {
      // Find the HTML barn item
      const allBarnItems = await barnService.findAll({ userId: testUserId });
      const htmlBarnItem = allBarnItems.find(
        item => item.name === 'report.html' &&
               item.metadata.harvestId === harvestId
      );

      expect(htmlBarnItem).toBeDefined();
      expect(htmlBarnItem!.type).toBe('RESOURCE');
      expect((htmlBarnItem!.metadata as any).yieldType).toBe('documentation');
      expect((htmlBarnItem!.metadata as any).mimeType).toBe('text/html');
      expect(htmlBarnItem!.metadata.tags).toContain('documentation');
      expect(htmlBarnItem!.metadata.tags).toContain('yield');

      // Verify it has a catalog entry
      const catalog = await barnService.getCatalog();
      const htmlCatalogEntry = catalog.find(e => e.barnItemId === htmlBarnItem!.id);

      expect(htmlCatalogEntry).toBeDefined();
      expect(htmlCatalogEntry!.category).toBe('Documentation');
      expect(htmlCatalogEntry!.keywords).toContain('html');
    });
  });

  describe('Step 4: End-to-End Pipeline Verification', () => {
    it('should maintain complete traceability from farm to barn', async () => {
      // Get harvest from database
      const harvestResult = await db.query(
        'SELECT * FROM harvests WHERE id = $1',
        [harvestId]
      );
      expect(harvestResult.rows.length).toBe(1);
      expect(harvestResult.rows[0].farm_id).toBe(testFarmId);

      // Get yield items from harvest_yield
      const yieldResult = await db.query(
        'SELECT * FROM harvest_yield WHERE harvest_id = $1',
        [harvestId]
      );
      expect(yieldResult.rows.length).toBeGreaterThan(0);

      // Get barn items
      const barnResult = await db.query(
        `SELECT * FROM barn_items WHERE metadata->'harvestId' = $1`,
        [JSON.stringify(harvestId)]
      );
      expect(barnResult.rows.length).toBeGreaterThan(0);

      // Verify counts match
      const harvest = await harvestService.getHarvest(harvestId);
      expect(yieldResult.rows.length).toBe(harvest!.yield.length);
    });

    it('should support searching yield items by farm name', async () => {
      const searchResults = await barnService.findAll({
        search: 'Test Farm',
        userId: testUserId
      });

      expect(searchResults.length).toBeGreaterThan(0);

      const hasMatchingItems = searchResults.some(
        item => item.metadata.farmName === 'Test Farm'
      );
      expect(hasMatchingItems).toBe(true);
    });

    it('should support filtering yield items by quality', async () => {
      const allYieldItems = await barnService.findAll({
        tags: ['yield'],
        userId: testUserId
      });

      const highQualityItems = allYieldItems.filter(
        item => (item.metadata.tags || []).includes('high-quality')
      );

      const goodQualityItems = allYieldItems.filter(
        item => (item.metadata.tags || []).includes('good-quality')
      );

      // We should have some quality-tagged items
      expect(highQualityItems.length + goodQualityItems.length).toBeGreaterThan(0);
    });

    it('should support retrieving yield items by category', async () => {
      const catalog = await barnService.getCatalog();

      const categorizedItems = catalog.filter(entry => {
        const barnItem = barnService.findById(entry.barnItemId);
        return barnItem && (barnItem as any).then === undefined &&
               (barnItem as any).metadata?.harvestId === harvestId;
      });

      // Group by category
      const byCategory = categorizedItems.reduce((acc, entry) => {
        acc[entry.category] = (acc[entry.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      expect(Object.keys(byCategory).length).toBeGreaterThan(0);

      // Log distribution for visibility
      console.log('Yield items by category:', byCategory);
    });
  });

  describe('Step 5: Pipeline Performance', () => {
    it('should complete the entire pipeline efficiently', async () => {
      const startTime = Date.now();

      // Create new harvest
      const harvest = await harvestService.startHarvest({
        farmId: `${testFarmId}-perf`,
        name: 'Performance Test Harvest'
      });

      // Collect harvest
      await harvestService.collectHarvest(harvest.id);

      // Store in barn
      await barnService.storeHarvest(harvest as any);

      const duration = Date.now() - startTime;

      // Pipeline should complete in reasonable time (< 5 seconds)
      expect(duration).toBeLessThan(5000);

      console.log(`Pipeline completed in ${duration}ms`);

      // Cleanup
      await db.query('DELETE FROM harvest_yield WHERE harvest_id = $1', [harvest.id]);
      await db.query('DELETE FROM harvests WHERE id = $1', [harvest.id]);
    });
  });

  describe('Step 6: Error Handling', () => {
    it('should handle harvests with no artifacts gracefully', async () => {
      const emptyHarvest = await harvestService.startHarvest({
        farmId: 'empty-farm-test',
        name: 'Empty Harvest Test'
      });

      const collected = await harvestService.collectHarvest(emptyHarvest.id);

      // Should have at least the summary yield
      expect(collected!.yield.length).toBeGreaterThanOrEqual(1);

      // Summary yield should be system-generated
      const summaryYield = collected!.yield.find(y =>
        y.metadata?.systemGenerated === true
      );
      expect(summaryYield).toBeDefined();

      // Should still store in barn successfully
      const barnItem = await barnService.storeHarvest(collected as any);
      expect(barnItem).toBeDefined();

      // Cleanup
      await db.query('DELETE FROM harvest_yield WHERE harvest_id = $1', [emptyHarvest.id]);
      await db.query('DELETE FROM harvests WHERE id = $1', [emptyHarvest.id]);
    });

    it('should handle missing harvest gracefully', async () => {
      await expect(
        barnService.storeHarvest('non-existent-harvest-id')
      ).rejects.toThrow('Harvest not found');
    });
  });
});
