// @ts-nocheck
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
const request = require('supertest');
const express = require('express');

jest.mock('../../services/metricsService.js', () => ({
  metricsService: {
    getSystemMetrics: jest.fn().mockResolvedValue({}),
    getMetricsByDateRange: jest.fn().mockResolvedValue({})
  }
}), { virtual: true });

jest.mock('../../services/costTrackingService.js', () => ({
  costTrackingService: {
    getCurrentCosts: jest.fn().mockResolvedValue({
      totalCost: 0,
      breakdown: {}
    }),
    analyzeCosts: jest.fn().mockResolvedValue({
      total: 0,
      breakdown: {}
    })
  }
}), { virtual: true });

jest.mock('../../services/monitoringService.js', () => ({
  monitoringService: {
    getPerformanceMetrics: jest.fn().mockResolvedValue({})
  }
}), { virtual: true });

const { analyticsRouter } = require('../../api/analytics');
import { db } from '../../database/connection';

jest.mock('../../monitoring/metricsCollector', () => ({
  recordEndpointLatency: jest.fn()
}));

const mockedDb = db as unknown as { query: jest.Mock };

describe('Analytics API', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/analytics', analyticsRouter);
    mockedDb.query.mockReset();
  });

  describe('GET /farm-yield', () => {
    it('should return farm yield metrics without timeRange', async () => {
      const response = await request(app)
        .get('/analytics/farm-yield')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalFarms');
      expect(response.body.data).toHaveProperty('completedFarms');
      expect(response.body.data).toHaveProperty('successRate');
      expect(response.body.data).toHaveProperty('farmsByStatus');
      expect(response.body.data.farmsByStatus).toHaveProperty('idle');
      expect(response.body.data.farmsByStatus).toHaveProperty('active');
      expect(response.body.data.farmsByStatus).toHaveProperty('completed');
    });

    it('should return farm yield metrics with timeRange', async () => {
      const start = new Date('2025-01-01').toISOString();
      const end = new Date('2025-12-31').toISOString();

      const response = await request(app)
        .get(`/analytics/farm-yield?start=${start}&end=${end}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('timeRange');
      expect(response.body.data.timeRange).toHaveProperty('start');
      expect(response.body.data.timeRange).toHaveProperty('end');
    });

    it('should not throw "is not a function" error', async () => {
      // Regression test for: analyticsService.getFarmYieldMetrics is not a function
      const response = await request(app)
        .get('/analytics/farm-yield')
        .expect(200);

      expect(response.body.success).toBe(true);
      // Should not return 500 error
      expect(response.statusCode).not.toBe(500);
    });
  });

  describe('GET /metrics', () => {
    it('should return aggregated metrics with database-backed counts', async () => {
      const now = new Date();
      mockedDb.query
        .mockResolvedValueOnce({
          rows: [{
            total_calls: 12,
            avg_response_time: 4800,
            farm_id: 'farm-123',
            agent_id: 'agent-123',
            date: now
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            agent_id: 'agent-123',
            farm_id: 'farm-123',
            agent_name: 'Agent Prime',
            agent_type: 'builder',
            tasks_total: 6,
            tasks_completed: 5,
            errors: 1,
            avg_response_time: 2200,
            last_active: now.toISOString()
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            total: 10,
            completed: 8,
            failed: 1,
            pending: 1,
            avg_completion_time: 3500
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            total_harvests: 3,
            avg_yield: 9.5,
            total_yield: 28.5,
            successful_harvests: 2
          }]
        });

      const response = await request(app)
        .get('/analytics/metrics?timeRange=1h')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('resourceMetrics');
      expect(response.body.data).toHaveProperty('agentEfficiency');
      expect(Array.isArray(response.body.data.agentEfficiency)).toBe(true);
      expect(response.body.data.agentEfficiency[0]).toMatchObject({
        agentId: 'agent-123',
        tasksCompleted: 5,
        tasksTotal: 6
      });
      expect(response.body.data.taskCompletion).toMatchObject({
        totalTasks: 10,
        completedTasks: 8,
        failedTasks: 1,
        pendingTasks: 1
      });

      // Ensure queries received resolved window start
      expect(mockedDb.query).toHaveBeenCalledTimes(4);
      const windowStartParam = mockedDb.query.mock.calls[1][1][0];
      expect(windowStartParam).toBeInstanceOf(Date);
      const delta = Date.now() - windowStartParam.getTime();
      expect(delta).toBeGreaterThan(0);
      expect(delta).toBeLessThanOrEqual(60 * 60 * 1000 + 1000); // 1h ±1s tolerance
    });

    it('should fallback to defaults when queries fail', async () => {
      mockedDb.query.mockRejectedValueOnce(new Error('db offline'));

      const response = await request(app)
        .get('/analytics/metrics?timeRange=invalid')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.agentEfficiency).toEqual([]);
      expect(response.body.data.taskCompletion).toMatchObject({
        totalTasks: 0,
        completedTasks: 0
      });

      const windowStartParam = mockedDb.query.mock.calls[0]?.[1]?.[0];
      if (windowStartParam instanceof Date) {
        const delta = Date.now() - windowStartParam.getTime();
        // Default window should be 24h when invalid input is provided
        expect(delta).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 1000);
      }
    });
  });
});
