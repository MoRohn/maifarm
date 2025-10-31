import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import analyticsRouter from '../../api/analytics';

describe('Analytics API', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/analytics', analyticsRouter);
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
});
