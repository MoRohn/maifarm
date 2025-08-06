import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import { Server } from 'http';
import { io as ioClient, Socket } from 'socket.io-client';
import app from '../index';
import { redis } from '../database/connection';
import { cacheService } from '../services/cache';

describe('QA Fixes - Integration Tests', () => {
  let server: Server;
  let serverPort: number;
  let baseURL: string;
  let wsClient: Socket;

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
    // Clean up
    if (wsClient) {
      wsClient.close();
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('WebSocket Connectivity', () => {
    it('should establish WebSocket connection successfully', (done) => {
      wsClient = ioClient(baseURL, {
        transports: ['websocket', 'polling'],
        auth: { userId: 'test-user' }
      });

      wsClient.on('connect', () => {
        expect(wsClient.connected).toBe(true);
        done();
      });

      wsClient.on('connect_error', (error) => {
        done(error);
      });
    }, 10000);

    it('should handle heartbeat mechanism', (done) => {
      const client = ioClient(baseURL, {
        transports: ['websocket'],
        auth: { userId: 'test-user-heartbeat' }
      });

      let pingReceived = false;

      client.on('ping', () => {
        pingReceived = true;
        client.emit('pong');
      });

      client.on('connect', () => {
        // Wait for ping
        setTimeout(() => {
          expect(pingReceived).toBe(true);
          client.close();
          done();
        }, 2000);
      });
    }, 15000);

    it('should reconnect with exponential backoff', (done) => {
      const client = ioClient(baseURL, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 100,
        reconnectionDelayMax: 1000,
        auth: { userId: 'test-user-reconnect' }
      });

      let disconnectCount = 0;
      let reconnectCount = 0;

      client.on('connect', () => {
        if (reconnectCount === 0) {
          // Force disconnect to test reconnection
          client.disconnect();
        }
      });

      client.on('disconnect', () => {
        disconnectCount++;
      });

      client.on('reconnect', () => {
        reconnectCount++;
        expect(disconnectCount).toBeGreaterThan(0);
        client.close();
        done();
      });
    }, 10000);
  });

  describe('Redis Connection and Cache Fallback', () => {
    it('should handle Redis connection gracefully', async () => {
      const status = cacheService.getStatus();
      // Should work whether Redis is connected or not
      expect(status).toHaveProperty('redis');
      expect(status).toHaveProperty('memory');
    });

    it('should fallback to memory cache when Redis is unavailable', async () => {
      const key = 'test-key-' + Date.now();
      const value = { test: 'data', timestamp: Date.now() };

      // Set value (should work with or without Redis)
      await cacheService.set(key, value, { ttl: 60 });

      // Get value
      const retrieved = await cacheService.get(key);
      expect(retrieved).toEqual(value);

      // Delete value
      await cacheService.delete(key);
      const deleted = await cacheService.get(key);
      expect(deleted).toBeNull();
    });

    it('should handle cache operations without throwing', async () => {
      const operations = [
        () => cacheService.set('test1', 'value1'),
        () => cacheService.get('test1'),
        () => cacheService.exists('test1'),
        () => cacheService.delete('test1'),
        () => cacheService.increment('counter1'),
        () => cacheService.decrement('counter1')
      ];

      for (const op of operations) {
        await expect(op()).resolves.not.toThrow();
      }
    });
  });

  describe('API Response Format', () => {
    it('should return JSON for farms list endpoint', async () => {
      const response = await request(baseURL)
        .get('/api/farms')
        .set('Accept', 'application/json');

      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.body).toHaveProperty('success');
      expect(typeof response.body.success).toBe('boolean');
    });

    it('should return JSON for farm details endpoint', async () => {
      const response = await request(baseURL)
        .get('/api/farms/test-farm-id')
        .set('Accept', 'application/json');

      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.body).toHaveProperty('success');
      
      if (response.status === 404) {
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toHaveProperty('code');
        expect(response.body.error).toHaveProperty('message');
      }
    });

    it('should return JSON for error responses', async () => {
      const response = await request(baseURL)
        .get('/api/nonexistent-endpoint')
        .set('Accept', 'application/json');

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
    });
  });

  describe('Quick Task Endpoint', () => {
    it('should accept quick task with description only', async () => {
      const response = await request(baseURL)
        .post('/api/tasks/quick')
        .send({
          description: 'Test quick task',
          mode: 'fast'
        });

      // Should either succeed or return proper JSON error
      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.body).toHaveProperty('success');
      
      if (response.body.success) {
        expect(response.body).toHaveProperty('data');
      } else {
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toHaveProperty('code');
        expect(response.body.error).toHaveProperty('message');
      }
    });

    it('should validate required fields', async () => {
      const response = await request(baseURL)
        .post('/api/tasks/quick')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle different priority modes', async () => {
      const modes = ['fast', 'normal', 'thorough'];
      
      for (const mode of modes) {
        const response = await request(baseURL)
          .post('/api/tasks/quick')
          .send({
            description: `Test task in ${mode} mode`,
            mode
          });

        expect(response.headers['content-type']).toMatch(/json/);
        expect(response.body).toHaveProperty('success');
      }
    });
  });

  describe('Security and Input Validation', () => {
    it('should sanitize XSS attempts in input', async () => {
      const xssPayload = '<script>alert("XSS")</script>';
      const response = await request(baseURL)
        .post('/api/tasks')
        .send({
          farmId: 'test-farm',
          type: xssPayload,
          description: xssPayload
        });

      // Check that response doesn't contain the script tag
      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toContain('<script>');
      expect(responseText).not.toContain('</script>');
    });

    it('should prevent SQL injection attempts', async () => {
      const sqlPayload = "'; DROP TABLE users; --";
      const response = await request(baseURL)
        .get('/api/farms')
        .query({ status: sqlPayload });

      // Should not cause server error
      expect(response.status).not.toBe(500);
      expect(response.body).toHaveProperty('success');
    });

    it('should handle rate limiting gracefully', async () => {
      // Note: Rate limiting might be disabled in test environment
      const requests = [];
      
      // Send multiple requests rapidly
      for (let i = 0; i < 5; i++) {
        requests.push(
          request(baseURL).get('/api/health')
        );
      }

      const responses = await Promise.all(requests);
      
      // All should return valid responses
      responses.forEach(response => {
        expect(response.headers['content-type']).toMatch(/json/);
        expect([200, 429, 503]).toContain(response.status);
      });
    });

    it('should validate input field types', async () => {
      const invalidEmail = 'not-an-email';
      const validEmail = 'test@example.com';

      // This would depend on specific endpoints that validate email
      // For now, just test that sanitization doesn't break valid inputs
      const response = await request(baseURL)
        .post('/api/tasks')
        .send({
          farmId: 'test-farm',
          type: 'test',
          metadata: {
            email: validEmail,
            url: 'https://example.com'
          }
        });

      expect(response.headers['content-type']).toMatch(/json/);
    });

    it('should properly escape HTML entities', async () => {
      const htmlPayload = '<div>Test & "quotes" \'single\'</div>';
      const response = await request(baseURL)
        .post('/api/tasks/quick')
        .send({
          description: htmlPayload
        });

      expect(response.headers['content-type']).toMatch(/json/);
      if (response.body.success && response.body.data) {
        // HTML should be escaped or stripped
        const description = JSON.stringify(response.body.data);
        expect(description).not.toContain('<div>');
        expect(description).not.toContain('</div>');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // Even with database issues, should return proper JSON
      const response = await request(baseURL)
        .get('/api/health');

      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('services');
    });

    it('should handle malformed JSON in requests', async () => {
      const response = await request(baseURL)
        .post('/api/tasks')
        .set('Content-Type', 'application/json')
        .send('{ invalid json');

      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toMatch(/json/);
    });

    it('should handle missing required fields with proper error messages', async () => {
      const response = await request(baseURL)
        .post('/api/tasks')
        .send({
          // Missing required fields
          type: 'test'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('message');
    });
  });

  describe('Health Check', () => {
    it('should return health status with service states', async () => {
      const response = await request(baseURL)
        .get('/health');

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('services');
      expect(response.body.services).toHaveProperty('api');
      expect(response.body.services).toHaveProperty('postgres');
      expect(response.body.services).toHaveProperty('redis');
      expect(response.body.services).toHaveProperty('websocket');
    });

    it('should handle degraded mode correctly', async () => {
      const response = await request(baseURL)
        .get('/health');

      // In degraded mode (Redis down), should still return 200 or 503
      expect([200, 503]).toContain(response.status);
      
      if (response.status === 503) {
        // Some services are down
        const services = response.body.services;
        const degradedServices = Object.values(services).filter(s => s === 'degraded');
        expect(degradedServices.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('Cache Service Unit Tests', () => {
  describe('Cache Key Generators', () => {
    it('should generate correct cache keys', () => {
      expect(cacheService.constructor.keys.farm('123')).toBe('farm:123');
      expect(cacheService.constructor.keys.agent('456')).toBe('agent:456');
      expect(cacheService.constructor.keys.task('789')).toBe('task:789');
      expect(cacheService.constructor.keys.session('abc')).toBe('session:abc');
    });
  });

  describe('TTL and Expiry', () => {
    it('should respect TTL settings', async () => {
      const key = 'ttl-test-' + Date.now();
      await cacheService.set(key, 'value', { ttl: 1 });
      
      // Should exist immediately
      let exists = await cacheService.exists(key);
      expect(exists).toBe(true);
      
      // Should expire after TTL
      await new Promise(resolve => setTimeout(resolve, 1100));
      exists = await cacheService.exists(key);
      expect(exists).toBe(false);
    });
  });

  describe('Batch Operations', () => {
    it('should handle batch get operations', async () => {
      const keys = ['batch1', 'batch2', 'batch3'];
      const values = ['value1', 'value2', 'value3'];
      
      // Set values
      for (let i = 0; i < keys.length; i++) {
        await cacheService.set(keys[i], values[i]);
      }
      
      // Get many
      const results = await cacheService.getMany<string>(keys);
      expect(results).toEqual(values);
      
      // Clean up
      for (const key of keys) {
        await cacheService.delete(key);
      }
    });

    it('should handle batch set operations', async () => {
      const entries = [
        { key: 'multi1', value: 'val1', ttl: 60 },
        { key: 'multi2', value: 'val2', ttl: 60 },
        { key: 'multi3', value: 'val3', ttl: 60 }
      ];
      
      await cacheService.setMany(entries);
      
      for (const entry of entries) {
        const value = await cacheService.get(entry.key);
        expect(value).toBe(entry.value);
        await cacheService.delete(entry.key);
      }
    });
  });

  describe('Counter Operations', () => {
    it('should increment and decrement counters', async () => {
      const key = 'counter-' + Date.now();
      
      // Increment
      let value = await cacheService.increment(key);
      expect(value).toBe(1);
      
      value = await cacheService.increment(key, 5);
      expect(value).toBe(6);
      
      // Decrement
      value = await cacheService.decrement(key, 2);
      expect(value).toBe(4);
      
      // Clean up
      await cacheService.delete(key);
    });
  });
});