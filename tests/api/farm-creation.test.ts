import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

const API_URL = process.env.API_URL || 'http://localhost:4567';

describe('Farm Creation API Tests', () => {
  let createdFarmId: string;

  describe('POST /api/farms', () => {
    it('should create a simple farm without agents', async () => {
      const response = await request(API_URL)
        .post('/api/farms')
        .send({
          name: 'Test Farm',
          description: 'A test farm for API testing'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.name).toBe('Test Farm');
      expect(response.body.data.status).toBe('idle');
      expect(response.body.data.agents).toEqual([]);
      
      createdFarmId = response.body.data.id;
    });

    it('should create a farm with agents defined in YAML', async () => {
      const response = await request(API_URL)
        .post('/api/farms')
        .send({
          name: 'Agent Farm',
          description: 'Farm with multiple agents',
          type: 'collaborative',
          config: {
            maxAgents: 3,
            autoScale: true,
            yaml: `agents:
  - name: Frontend Developer
    type: builder
    capabilities: [React, TypeScript]
  - name: Backend Developer
    type: builder
    capabilities: [Node.js, Express]
  - name: QA Engineer
    type: tester
    capabilities: [Jest, Cypress]`
          }
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.agents).toHaveLength(3);
      expect(response.body.data.config.autoScale).toBe(true);
      expect(response.body.data.config.maxAgents).toBe(3);
    });

    it('should fail when farm name is missing', async () => {
      const response = await request(API_URL)
        .post('/api/farms')
        .send({
          description: 'Farm without a name'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('name is required');
    });
  });

  describe('GET /api/farms', () => {
    it('should retrieve all farms', async () => {
      const response = await request(API_URL)
        .get('/api/farms')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toHaveProperty('total');
      expect(response.body.meta).toHaveProperty('page');
      expect(response.body.meta).toHaveProperty('limit');
    });

    it('should filter farms by status', async () => {
      const response = await request(API_URL)
        .get('/api/farms?status=idle')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /api/farms/:id', () => {
    it('should retrieve a specific farm', async () => {
      const response = await request(API_URL)
        .get(`/api/farms/${createdFarmId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.farm.id).toBe(createdFarmId);
      expect(response.body.data).toHaveProperty('agents');
    });

    it('should return 404 for non-existent farm', async () => {
      const response = await request(API_URL)
        .get('/api/farms/non-existent-id')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/farms/:id/start', () => {
    it('should start a farm', async () => {
      const response = await request(API_URL)
        .post(`/api/farms/${createdFarmId}/start`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('running');
    });

    it('should fail to start non-existent farm', async () => {
      const response = await request(API_URL)
        .post('/api/farms/non-existent-id/start')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_STATE');
    });
  });

  describe('POST /api/farms/:id/pause', () => {
    it('should pause a running farm', async () => {
      const response = await request(API_URL)
        .post(`/api/farms/${createdFarmId}/pause`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('paused');
    });
  });

  describe('PUT /api/farms/:id', () => {
    it('should update farm configuration', async () => {
      const response = await request(API_URL)
        .put(`/api/farms/${createdFarmId}`)
        .send({
          name: 'Updated Farm Name',
          config: {
            maxAgents: 10
          }
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Updated Farm Name');
    });
  });

  describe('DELETE /api/farms/:id', () => {
    it('should delete a farm', async () => {
      const response = await request(API_URL)
        .delete(`/api/farms/${createdFarmId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(createdFarmId);
    });

    it('should return 404 when deleting non-existent farm', async () => {
      const response = await request(API_URL)
        .delete('/api/farms/non-existent-id')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });
});

// WebSocket Event Tests
describe('Farm WebSocket Events', () => {
  it('should emit farm:created event when creating a farm', (done) => {
    // This test requires WebSocket client setup
    // Placeholder for WebSocket testing
    done();
  });

  it('should emit farm:updated event when updating a farm', (done) => {
    // This test requires WebSocket client setup
    // Placeholder for WebSocket testing
    done();
  });

  it('should emit farm:started event when starting a farm', (done) => {
    // This test requires WebSocket client setup
    // Placeholder for WebSocket testing
    done();
  });
});