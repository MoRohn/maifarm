import { Request, Response } from 'express';
import request from 'supertest';
import express from 'express';
import healthRouter from '../health';
import { checkDatabaseHealth } from '../../database/connection';

// Mock dependencies
jest.mock('../../database/connection');

const app = express();
app.use('/api/health', healthRouter);

describe('Health API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup default mock
    (checkDatabaseHealth as jest.Mock).mockResolvedValue({
      postgres: true,
      redis: true
    });
  });

  describe('GET /api/health', () => {
    it('should return healthy status when all services are up', async () => {
      // Mock global wsServer
      (global as any).wsServer = {
        getConnectionStats: () => ({ totalConnections: 5 })
      };

      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        services: {
          api: 'healthy',
          postgres: 'healthy',
          redis: 'healthy',
          websocket: 'healthy'
        },
        version: '2.0.0',
        connections: 5
      });
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.uptime).toBeDefined();
    });

    it('should return degraded status when database is down', async () => {
      (checkDatabaseHealth as jest.Mock).mockResolvedValue({
        postgres: false,
        redis: true
      });

      (global as any).wsServer = {
        getConnectionStats: () => ({ totalConnections: 0 })
      };

      const response = await request(app)
        .get('/api/health')
        .expect(503);

      expect(response.body).toMatchObject({
        status: 'degraded',
        services: {
          api: 'healthy',
          postgres: 'unhealthy',
          redis: 'healthy',
          websocket: 'healthy'
        }
      });
    });

    it('should handle health check errors gracefully', async () => {
      (checkDatabaseHealth as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      const response = await request(app)
        .get('/api/health')
        .expect(503);

      expect(response.body).toMatchObject({
        status: 'unhealthy',
        error: 'Failed to check health'
      });
      expect(response.body.timestamp).toBeDefined();
    });

    it('should handle missing WebSocket server', async () => {
      (global as any).wsServer = null;

      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.services.websocket).toBe('unhealthy');
      expect(response.body.connections).toBe(0);
    });
  });

  describe('GET /api/health/live', () => {
    it('should return alive status', async () => {
      const response = await request(app)
        .get('/api/health/live')
        .expect(200);

      expect(response.body).toEqual({ status: 'alive' });
    });
  });

  describe('GET /api/health/ready', () => {
    it('should return ready when database is available', async () => {
      const response = await request(app)
        .get('/api/health/ready')
        .expect(200);

      expect(response.body).toEqual({ status: 'ready' });
    });

    it('should return ready in BYPASS_AUTH mode even without database', async () => {
      const originalBypassAuth = process.env.BYPASS_AUTH;
      process.env.BYPASS_AUTH = 'true';

      (checkDatabaseHealth as jest.Mock).mockResolvedValue({
        postgres: false,
        redis: false
      });

      const response = await request(app)
        .get('/api/health/ready')
        .expect(200);

      expect(response.body).toEqual({ status: 'ready' });

      process.env.BYPASS_AUTH = originalBypassAuth;
    });

    it('should return not ready when database is unavailable', async () => {
      const originalBypassAuth = process.env.BYPASS_AUTH;
      process.env.BYPASS_AUTH = 'false';

      (checkDatabaseHealth as jest.Mock).mockResolvedValue({
        postgres: false,
        redis: false
      });

      const response = await request(app)
        .get('/api/health/ready')
        .expect(503);

      expect(response.body).toEqual({
        status: 'not ready',
        reason: 'database unavailable'
      });

      process.env.BYPASS_AUTH = originalBypassAuth;
    });

    it('should handle readiness check errors', async () => {
      (checkDatabaseHealth as jest.Mock).mockRejectedValue(new Error('Check failed'));

      const response = await request(app)
        .get('/api/health/ready')
        .expect(503);

      expect(response.body).toEqual({
        status: 'not ready',
        reason: 'health check failed'
      });
    });
  });
});