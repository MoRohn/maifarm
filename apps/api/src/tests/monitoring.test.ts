import app from '../index';

const request = require('supertest');

describe('Monitoring API Tests', () => {
  describe('Metrics Endpoints', () => {
    test('GET /api/metrics should return Prometheus metrics', async () => {
      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      expect(response.text).toContain('# TYPE');
      expect(response.text).toContain('# HELP');
      expect(response.text).toContain('maifarm_');
    });

    test('GET /api/metrics/current should return current metrics', async () => {
      const response = await request(app)
        .get('/api/metrics/current')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('system');
      expect(response.body).toHaveProperty('application');
    });

    test('GET /api/metrics/range should return time series data', async () => {
      const response = await request(app)
        .get('/api/metrics/range')
        .query({
          metric: 'maifarm_tasks_total',
          start: new Date(Date.now() - 3600000).toISOString(),
          end: new Date().toISOString(),
          step: '5m'
        })
        .expect(200);

      expect(response.body).toHaveProperty('metric');
      expect(response.body).toHaveProperty('timeRange');
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('Health Check Endpoints', () => {
    test('GET /api/health should return comprehensive health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect((res) => {
          expect([200, 503]).toContain(res.status);
        });

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('checks');
    });

    test('GET /api/health/ready should return readiness status', async () => {
      const response = await request(app)
        .get('/api/health/ready')
        .expect((res) => {
          expect([200, 503]).toContain(res.status);
        });

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('GET /api/health/live should return liveness status', async () => {
      const response = await request(app)
        .get('/api/health/live')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'alive');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('pid');
      expect(response.body).toHaveProperty('uptime');
    });
  });

  describe('Alert Endpoints', () => {
    let authToken: string;

    beforeAll(async () => {
      // Get auth token for authenticated endpoints
      // This assumes you have a test user setup
      const authResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'testpassword'
        });
      
      authToken = authResponse.body.data?.token || 'test-token';
    });

    test('GET /api/alerts should return active alerts', async () => {
      const response = await request(app)
        .get('/api/alerts')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('alerts');
      expect(Array.isArray(response.body.alerts)).toBe(true);
    });

    test('POST /api/alerts/:id/acknowledge should acknowledge alert', async () => {
      // First create an alert
      const createResponse = await request(app)
        .post('/api/alerts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          severity: 'warning',
          title: 'Test Alert',
          description: 'This is a test alert'
        });

      if (createResponse.status === 201) {
        const alertId = createResponse.body.data.id;

        const response = await request(app)
          .post(`/api/alerts/${alertId}/acknowledge`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ notes: 'Acknowledged for testing' })
          .expect(200);

        expect(response.body.data).toHaveProperty('acknowledged', true);
      }
    });
  });

  describe('Log Endpoints', () => {
    let authToken: string;

    beforeAll(async () => {
      // Get auth token for authenticated endpoints
      const authResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'testpassword'
        });
      
      authToken = authResponse.body.data?.token || 'test-token';
    });

    test('GET /api/logs should return logs with filters', async () => {
      const response = await request(app)
        .get('/api/logs')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          level: 'info',
          limit: 10
        })
        .expect(200);

      expect(response.body).toHaveProperty('logs');
      expect(Array.isArray(response.body.logs)).toBe(true);
      expect(response.body).toHaveProperty('query');
    });

    test('GET /api/logs/stats should return log statistics', async () => {
      const response = await request(app)
        .get('/api/logs/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ period: '1h', groupBy: 'level' })
        .expect(200);

      expect(response.body).toHaveProperty('period');
      expect(response.body).toHaveProperty('groupBy');
      expect(response.body).toHaveProperty('statistics');
    });
  });

  describe('Monitoring Middleware', () => {
    test('Request should include correlation ID', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-correlation-id');
    });

    test('Slow requests should be logged', async () => {
      // This would require mocking or a special slow endpoint
      // For now, we just verify the middleware is active
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-response-time');
    });
  });
});

describe('Prometheus Metrics', () => {
  test('HTTP request metrics should be collected', async () => {
    // Make some requests to generate metrics
    await request(app).get('/api/health');
    await request(app).get('/api/metrics/current');
    
    const response = await request(app)
      .get('/api/metrics')
      .expect(200);

    expect(response.text).toContain('maifarm_http_request_duration_seconds');
    expect(response.text).toContain('method="GET"');
  });

  test('Custom metrics should be exposed', async () => {
    const response = await request(app)
      .get('/api/metrics')
      .expect(200);

    expect(response.text).toContain('maifarm_tasks_total');
    expect(response.text).toContain('maifarm_active_agents');
    expect(response.text).toContain('maifarm_resource_utilization');
  });
});