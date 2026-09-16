import express from 'express';
import healthRouter from '../../routes/health';
import fs from 'fs/promises';

const request = require('supertest');

// Mock fs/promises for coordination directory checks
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock the dependencies that health router uses
jest.mock('../../monitoring/metricsCollector', () => ({
  metricsCollector: {
    getCurrentMetrics: () => ({
      farms: Promise.resolve({ values: [] }),
      agents: Promise.resolve({ values: [] }),
      clients: Promise.resolve({ values: [] }),
      resources: Promise.resolve({ values: [] })
    })
  }
}));

jest.mock('../../services/farmHealthMonitor', () => ({
  farmHealthMonitor: {
    getHealth: jest.fn(),
    getAllHealth: jest.fn(() => new Map()),
    emit: jest.fn()
  }
}));

// Create app with router mounted at root (router already includes /api prefix)
const app = express();
app.use(healthRouter);

describe('Health API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: coordination directory exists
    mockFs.access.mockResolvedValue(undefined);
  });

  describe('GET /api/health', () => {
    it('should return health status with required fields', async () => {
      const response = await request(app)
        .get('/api/health');

      // Status can be healthy, degraded, or unhealthy depending on environment/mock state
      expect(['healthy', 'degraded', 'unhealthy']).toContain(response.body.status);
      expect(response.body.checks).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.uptime).toBeDefined();
    });

    it('should return unhealthy status when coordination directory is inaccessible', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      const response = await request(app)
        .get('/api/health')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body.checks.coordination.status).toBe('fail');
    });

    it('should include system metrics in response', async () => {
      const response = await request(app)
        .get('/api/health');

      // Status code can be 200 (healthy/degraded) or 503 (unhealthy)
      expect([200, 503]).toContain(response.status);
      expect(response.body.system).toBeDefined();
      expect(response.body.system.cpu).toBeDefined();
      expect(response.body.system.memory).toBeDefined();
    });

    it('should include response time header', async () => {
      const response = await request(app)
        .get('/api/health');

      // Status code can be 200 (healthy/degraded) or 503 (unhealthy)
      expect([200, 503]).toContain(response.status);
      expect(response.headers['x-response-time']).toBeDefined();
    });
  });

  describe('GET /api/health/live', () => {
    it('should return alive status', async () => {
      const response = await request(app)
        .get('/api/health/live')
        .expect(200);

      expect(response.body.status).toBe('alive');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.pid).toBeDefined();
      expect(response.body.uptime).toBeDefined();
    });
  });

  describe('GET /api/health/ready', () => {
    it('should return ready when all services are available', async () => {
      const response = await request(app)
        .get('/api/health/ready')
        .expect(200);

      expect(response.body.status).toBe('ready');
      expect(response.body.timestamp).toBeDefined();
    });

    it('should return not ready when coordination directory is inaccessible', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      const response = await request(app)
        .get('/api/health/ready')
        .expect(503);

      expect(response.body.status).toBe('not ready');
      expect(response.body.coordination).toBe(false);
    });
  });

  describe('GET /api/health/detailed', () => {
    it('should return detailed system information', async () => {
      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.system).toBeDefined();
      expect(response.body.system.node).toBeDefined();
      expect(response.body.system.os).toBeDefined();
      expect(response.body.system.application).toBeDefined();
    });
  });
});