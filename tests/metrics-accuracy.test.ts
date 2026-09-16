/**
 * Metrics Accuracy Test Suite
 * Verifies that dashboard metrics are calculated accurately
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { metricsAggregator } from '../apps/api/src/services/metricsAggregator';
import { db } from '../apps/api/src/database/connection';

describe('Dashboard Metrics Accuracy', () => {
  beforeAll(async () => {
    // Ensure database connection is ready
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  describe('Live Farms Metric', () => {
    it('should accurately count farms with active statuses', async () => {
      // Get metrics from aggregator
      const metrics = await metricsAggregator.getDashboardMetrics();
      
      // Verify directly from database
      const result = await db.query(`
        SELECT COUNT(*) as count 
        FROM farms 
        WHERE status IN ('running', 'active', 'launching', 'harvesting')
      `);
      
      const expectedCount = parseInt(result.rows[0].count);
      
      expect(metrics.liveFarms).toBe(expectedCount);
    });

    it('should not count completed or failed farms as live', async () => {
      const metrics = await metricsAggregator.getDashboardMetrics();
      
      // Check that completed/failed farms are excluded
      const excludedResult = await db.query(`
        SELECT COUNT(*) as count 
        FROM farms 
        WHERE status IN ('completed', 'failed', 'stopped', 'error')
      `);
      
      const totalResult = await db.query(`
        SELECT COUNT(*) as count FROM farms
      `);
      
      const totalFarms = parseInt(totalResult.rows[0].count);
      const excludedFarms = parseInt(excludedResult.rows[0].count);
      
      // Live farms should not include excluded statuses
      expect(metrics.liveFarms).toBeLessThanOrEqual(totalFarms - excludedFarms);
    });
  });

  describe('Agents Working Metric', () => {
    it('should accurately count unique active agents', async () => {
      const metrics = await metricsAggregator.getDashboardMetrics();
      
      // Verify with deduplicated query
      const result = await db.query(`
        SELECT COUNT(DISTINCT a.id) as count
        FROM agents a
        INNER JOIN farms f ON a.farm_id = f.id
        WHERE f.status IN ('running', 'active', 'launching', 'harvesting')
        AND a.status IN ('running', 'active', 'working', 'processing')
      `);
      
      const expectedCount = parseInt(result.rows[0].count);
      
      expect(metrics.agentsWorking).toBe(expectedCount);
    });

    it('should not double-count agents across farms', async () => {
      const metrics = await metricsAggregator.getDashboardMetrics();
      
      // Get total unique agents
      const uniqueResult = await db.query(`
        SELECT COUNT(DISTINCT id) as unique_count,
               COUNT(*) as total_count
        FROM agents
        WHERE status IN ('running', 'active', 'working', 'processing')
      `);
      
      const uniqueAgents = parseInt(uniqueResult.rows[0].unique_count);
      
      // Working agents should never exceed unique agents
      expect(metrics.agentsWorking).toBeLessThanOrEqual(uniqueAgents);
    });
  });

  describe('Harvests Completed Metric', () => {
    it('should accurately count completed harvests', async () => {
      const metrics = await metricsAggregator.getDashboardMetrics();
      
      // Verify from database
      const result = await db.query(`
        SELECT COUNT(*) as count
        FROM harvests
        WHERE status IN ('ready', 'completed', 'collected')
      `);
      
      const expectedCount = parseInt(result.rows[0].count);
      
      expect(metrics.harvestsCompleted).toBe(expectedCount);
    });
  });

  describe('Yielded Items Metric', () => {
    it('should accurately count all yielded items', async () => {
      const metrics = await metricsAggregator.getDashboardMetrics();
      
      // Verify from harvest_yield table
      const result = await db.query(`
        SELECT COUNT(*) as count
        FROM harvest_yield
      `);
      
      const expectedCount = parseInt(result.rows[0].count);
      
      expect(metrics.yieldedItems).toBe(expectedCount);
    });

    it('should handle empty yield correctly', async () => {
      const metrics = await metricsAggregator.getDashboardMetrics();
      
      // Yielded items should never be negative
      expect(metrics.yieldedItems).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Metrics Caching', () => {
    it('should use cache for rapid successive calls', async () => {
      const start = Date.now();
      
      // First call (may hit database)
      const metrics1 = await metricsAggregator.getDashboardMetrics();
      const firstCallTime = Date.now() - start;
      
      // Second call (should use cache)
      const cacheStart = Date.now();
      const metrics2 = await metricsAggregator.getDashboardMetrics();
      const secondCallTime = Date.now() - cacheStart;
      
      // Cache should be much faster
      expect(secondCallTime).toBeLessThan(firstCallTime / 2);
      
      // Values should be identical
      expect(metrics2).toEqual(metrics1);
    });

    it('should invalidate cache after data changes', async () => {
      // Get initial metrics
      const initialMetrics = await metricsAggregator.getDashboardMetrics();
      
      // Invalidate cache
      metricsAggregator.invalidateCache();
      
      // Force refresh
      const refreshedMetrics = await metricsAggregator.refresh();
      
      // Should have fresh timestamp
      const accuracy = metricsAggregator.getAccuracy();
      expect(accuracy.staleness).toBe(0);
    });
  });

  describe('Metrics Accuracy Score', () => {
    it('should provide high confidence for fresh data', async () => {
      await metricsAggregator.refresh();
      const accuracy = metricsAggregator.getAccuracy();
      
      expect(accuracy.confidence).toBeGreaterThanOrEqual(95);
      expect(accuracy.staleness).toBeLessThanOrEqual(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero farms gracefully', async () => {
      // Even with no farms, metrics should return valid zeros
      const metrics = await metricsAggregator.getDashboardMetrics();
      
      expect(metrics.liveFarms).toBeGreaterThanOrEqual(0);
      expect(metrics.agentsWorking).toBeGreaterThanOrEqual(0);
      expect(metrics.harvestsCompleted).toBeGreaterThanOrEqual(0);
      expect(metrics.yieldedItems).toBeGreaterThanOrEqual(0);
    });

    it('should never return NaN or undefined values', async () => {
      const metrics = await metricsAggregator.getDashboardMetrics();
      
      expect(metrics.liveFarms).not.toBeNaN();
      expect(metrics.agentsWorking).not.toBeNaN();
      expect(metrics.harvestsCompleted).not.toBeNaN();
      expect(metrics.yieldedItems).not.toBeNaN();
      
      expect(metrics.liveFarms).toBeDefined();
      expect(metrics.agentsWorking).toBeDefined();
      expect(metrics.harvestsCompleted).toBeDefined();
      expect(metrics.yieldedItems).toBeDefined();
    });

    it('should handle database errors gracefully', async () => {
      // Temporarily break database connection
      const originalQuery = db.query;
      db.query = jest.fn().mockRejectedValue(new Error('Database error'));
      
      // Should return empty metrics rather than crash
      const metrics = await metricsAggregator.getDashboardMetrics();
      
      expect(metrics.liveFarms).toBe(0);
      expect(metrics.agentsWorking).toBe(0);
      expect(metrics.harvestsCompleted).toBe(0);
      expect(metrics.yieldedItems).toBe(0);
      
      // Restore database
      db.query = originalQuery;
    });
  });
});