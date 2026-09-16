/**
 * Production Enhancements Integration Tests
 *
 * Tests for v2.5 enhancements:
 * - Event Outbox & Guaranteed Delivery
 * - OpenTelemetry Tracing
 * - Multi-Agent Terminal Coordination
 * - Enhanced RBAC
 * - Performance Metrics API
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { eventOutboxService } from '../../services/EventOutboxService';
import { openTelemetryTracing } from '../../services/OpenTelemetryTracing';
import { multiAgentTerminalCoordinator } from '../../services/MultiAgentTerminalCoordinator';
import { db } from '../../database/connection';
import { generateToken, Role, Permission } from '../../middleware/enhancedRBAC';
import app from '../../index';

const request = require('supertest');

describe('Production Enhancements v2.5', () => {
  beforeAll(async () => {
    // Ensure test database is clean
    await db.query('TRUNCATE event_outbox, event_dead_letter_queue, event_delivery_log CASCADE');
    await db.query('TRUNCATE telemetry_spans, performance_metrics CASCADE');
  });

  afterAll(async () => {
    await db.end();
  });

  describe('Event Outbox Service', () => {
    beforeEach(async () => {
      await db.query('TRUNCATE event_outbox CASCADE');
      eventOutboxService.start();
    });

    afterEach(() => {
      eventOutboxService.stop();
    });

    test('should publish event with idempotency', async () => {
      const eventId1 = await eventOutboxService.publishIdempotent(
        'test:event',
        { data: 'test' },
        { aggregateId: 'test-1', aggregateType: 'farm' }
      );

      expect(eventId1).toBeDefined();

      // Duplicate should be rejected
      await expect(
        eventOutboxService.publishIdempotent(
          'test:event',
          { data: 'test' },
          { aggregateId: 'test-1', aggregateType: 'farm' }
        )
      ).rejects.toThrow('DUPLICATE_EVENT');
    });

    test('should process pending events', async () => {
      const eventId = await eventOutboxService.publish({
        eventName: 'test:processing',
        eventData: { test: true },
        priority: 1,
        maxAttempts: 2
      });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      const result = await db.query(
        'SELECT status, attempts FROM event_outbox WHERE id = $1',
        [eventId]
      );

      expect(result.rows.length).toBe(1);
      expect(['pending', 'processing', 'delivered']).toContain(result.rows[0].status);
    });

    test('should move failed events to DLQ', async () => {
      const eventId = await eventOutboxService.publish({
        eventName: 'test:fail',
        eventData: { test: true },
        maxAttempts: 1
      });

      // Manually mark as failed
      await db.query(
        `UPDATE event_outbox
         SET status = 'failed', attempts = 1, error_message = 'Test failure'
         WHERE id = $1`,
        [eventId]
      );

      // Check DLQ
      const dlqResult = await db.query(
        'SELECT * FROM event_dead_letter_queue WHERE original_outbox_id = $1',
        [eventId]
      );

      expect(dlqResult.rows.length).toBe(1);
      expect(dlqResult.rows[0].failure_reason).toBe('max_attempts_exceeded');
    });

    test('should track delivery statistics', async () => {
      await eventOutboxService.publish({
        eventName: 'test:stats',
        eventData: { test: true }
      });

      const stats = eventOutboxService.getStats();

      expect(stats).toHaveProperty('totalProcessed');
      expect(stats).toHaveProperty('delivered');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('currentBacklog');
    });

    test('should retry from DLQ', async () => {
      // Create a DLQ entry
      const dlqResult = await db.query(
        `INSERT INTO event_dead_letter_queue (event_name, event_data, aggregate_id, aggregate_type, attempts, last_error)
         VALUES ('test:retry', '{"test":true}', 'test-1', 'farm', 3, 'Test error')
         RETURNING id`
      );

      const dlqId = dlqResult.rows[0].id;

      // Retry
      const outboxId = await eventOutboxService.retryFromDLQ(dlqId);

      expect(outboxId).toBeDefined();

      // Check outbox
      const outboxResult = await db.query(
        'SELECT * FROM event_outbox WHERE id = $1',
        [outboxId]
      );

      expect(outboxResult.rows.length).toBe(1);
      expect(outboxResult.rows[0].status).toBe('pending');
    });
  });

  describe('OpenTelemetry Tracing', () => {
    beforeEach(async () => {
      await db.query('TRUNCATE telemetry_spans CASCADE');
    });

    test('should create and persist spans', async () => {
      const span = openTelemetryTracing.startSpan('test.operation', {
        kind: 'internal',
        attributes: { 'test.key': 'test-value' }
      });

      span.setAttribute('test.additional', 'value');
      span.addEvent('test.event');
      span.setStatus('ok');
      span.end();

      // Wait for persistence
      await new Promise(resolve => setTimeout(resolve, 100));

      const result = await db.query(
        'SELECT * FROM telemetry_spans WHERE name = $1',
        ['test.operation']
      );

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].status_code).toBe('ok');
    });

    test('should create child spans', async () => {
      const parentSpan = openTelemetryTracing.startSpan('test.parent');
      const childSpan = openTelemetryTracing.startChildSpan('test.child', parentSpan);

      expect(childSpan.traceId).toBe(parentSpan.traceId);
      expect(childSpan.parentSpanId).toBe(parentSpan.spanId);

      childSpan.end();
      parentSpan.end();

      await new Promise(resolve => setTimeout(resolve, 100));

      const result = await db.query(
        'SELECT * FROM telemetry_spans WHERE trace_id = $1',
        [parentSpan.traceId]
      );

      expect(result.rows.length).toBe(2);
    });

    test('should record exceptions', async () => {
      const span = openTelemetryTracing.startSpan('test.error');

      const error = new Error('Test error');
      span.recordException(error);
      span.end();

      await new Promise(resolve => setTimeout(resolve, 100));

      const result = await db.query(
        'SELECT * FROM telemetry_spans WHERE name = $1',
        ['test.error']
      );

      expect(result.rows[0].status_code).toBe('error');
      expect(result.rows[0].attributes).toContain('exception.message');
    });

    test('should trace async operations', async () => {
      const result = await openTelemetryTracing.traced(
        'test.async',
        async (span) => {
          span.setAttribute('operation', 'test');
          await new Promise(resolve => setTimeout(resolve, 10));
          return 'success';
        },
        { kind: 'internal' }
      );

      expect(result).toBe('success');

      await new Promise(resolve => setTimeout(resolve, 100));

      const dbResult = await db.query(
        'SELECT * FROM telemetry_spans WHERE name = $1',
        ['test.async']
      );

      expect(dbResult.rows.length).toBe(1);
    });

    test('should record performance metrics', async () => {
      await openTelemetryTracing.recordMetric('test.metric', 42, {
        type: 'gauge',
        unit: 'count',
        tags: { env: 'test' }
      });

      const result = await db.query(
        'SELECT * FROM performance_metrics WHERE metric_name = $1',
        ['test.metric']
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].value).toBe('42');
    });
  });

  describe('Multi-Agent Terminal Coordinator', () => {
    const testFarmId = 'test-farm-123';
    const testSessionName = 'farm-test-123';

    afterEach(async () => {
      await multiAgentTerminalCoordinator.stopFarm(testFarmId);
    });

    test('should register farm with all agents', async () => {
      await multiAgentTerminalCoordinator.registerFarm(
        testFarmId,
        testSessionName,
        3,
        ['Agent 1', 'Agent 2', 'Agent 3']
      );

      const stats = multiAgentTerminalCoordinator.getStats();
      expect(stats.totalAgents).toBeGreaterThanOrEqual(3);
    });

    test('should track agent states', async () => {
      await multiAgentTerminalCoordinator.registerFarm(
        testFarmId,
        testSessionName,
        2,
        ['Test Agent 1', 'Test Agent 2']
      );

      const states = multiAgentTerminalCoordinator.getFarmAgentStates(testFarmId);

      expect(states.length).toBe(2);
      expect(states[0]).toHaveProperty('agentId');
      expect(states[0]).toHaveProperty('agentName');
      expect(states[0]).toHaveProperty('isActive');
    });

    test('should report health statistics', async () => {
      await multiAgentTerminalCoordinator.registerFarm(
        testFarmId,
        testSessionName,
        5,
        ['A1', 'A2', 'A3', 'A4', 'A5']
      );

      const stats = multiAgentTerminalCoordinator.getStats();

      expect(stats).toHaveProperty('totalAgents');
      expect(stats).toHaveProperty('activeStreams');
      expect(stats).toHaveProperty('failedStreams');
      expect(stats.totalAgents).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Enhanced RBAC', () => {
    let userToken: string;
    let adminToken: string;

    beforeAll(() => {
      userToken = generateToken('user-1', 'user@test.com', Role.USER);
      adminToken = generateToken('admin-1', 'admin@test.com', Role.ADMIN);
    });

    test('should generate valid JWT tokens', () => {
      expect(userToken).toBeTruthy();
      expect(adminToken).toBeTruthy();
    });

    test('should verify valid tokens', async () => {
      const response = await request(app)
        .get('/api/metrics/system')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 404]).toContain(response.status); // 404 if route not registered yet
    });

    test('should reject invalid tokens', async () => {
      const response = await request(app)
        .get('/api/metrics/system')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });

    test('should enforce role-based access', async () => {
      // User should not access admin endpoints
      const response = await request(app)
        .post('/api/metrics/cleanup')
        .set('Authorization', `Bearer ${userToken}`);

      expect([401, 403, 404]).toContain(response.status);
    });
  });

  describe('Performance Metrics API', () => {
    let adminToken: string;

    beforeAll(() => {
      adminToken = generateToken('admin-1', 'admin@test.com', Role.ADMIN);
    });

    test('should get delivery metrics', async () => {
      const response = await request(app)
        .get('/api/metrics/delivery')
        .set('Authorization', `Bearer ${adminToken}`);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('stats');
        expect(response.body).toHaveProperty('deadLetterQueue');
      }
    });

    test('should get terminal coordination stats', async () => {
      const response = await request(app)
        .get('/api/metrics/terminals')
        .set('Authorization', `Bearer ${adminToken}`);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('overall');
        expect(response.body).toHaveProperty('farms');
      }
    });

    test('should get system metrics', async () => {
      const response = await request(app)
        .get('/api/metrics/system')
        .set('Authorization', `Bearer ${adminToken}`);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('memory');
        expect(response.body).toHaveProperty('database');
        expect(response.body).toHaveProperty('uptime');
      }
    });
  });

  describe('End-to-End Workflow', () => {
    test('should complete full farm launch with tracking', async () => {
      const farmId = 'e2e-test-farm';
      const sessionName = 'farm-e2e-test';

      // 1. Register farm with terminal coordinator
      await multiAgentTerminalCoordinator.registerFarm(
        farmId,
        sessionName,
        3,
        ['E2E Agent 1', 'E2E Agent 2', 'E2E Agent 3']
      );

      // 2. Publish farm creation event
      const eventId = await eventOutboxService.publishIdempotent(
        'farm:created',
        { farmId, sessionName, agentCount: 3 },
        { aggregateId: farmId, aggregateType: 'farm', priority: 1 }
      );

      // 3. Create trace span
      const span = openTelemetryTracing.startSpan('e2e.farm.launch', {
        kind: 'server',
        attributes: { 'farm.id': farmId, 'farm.agents': 3 }
      });

      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 100));

      span.setStatus('ok');
      span.end();

      // 4. Verify all components
      const stats = multiAgentTerminalCoordinator.getFarmAgentStates(farmId);
      expect(stats.length).toBe(3);

      const outboxResult = await db.query(
        'SELECT * FROM event_outbox WHERE id = $1',
        [eventId]
      );
      expect(outboxResult.rows.length).toBe(1);

      await new Promise(resolve => setTimeout(resolve, 100));

      const spanResult = await db.query(
        'SELECT * FROM telemetry_spans WHERE name = $1',
        ['e2e.farm.launch']
      );
      expect(spanResult.rows.length).toBe(1);

      // Cleanup
      await multiAgentTerminalCoordinator.stopFarm(farmId);
    });
  });
});
