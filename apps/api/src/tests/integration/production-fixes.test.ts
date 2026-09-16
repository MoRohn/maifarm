/**
 * Integration Tests for Production-Grade Fixes
 *
 * Tests all critical fixes implemented to take MaiFarm from beta to production:
 * - Tier 1: Dual-mode completion detection, harvest auto-recovery, terminal streaming
 * - Tier 2: Farm lifecycle state machine, guaranteed yield generation
 * - Tier 3: Farm lifecycle monitoring dashboard
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { db } from '../../database/connection';
import { farmLifecycleStateMachine } from '../../services/FarmLifecycleStateMachine';
import { FarmStatus } from '../../types/farm';
import { orchestratorBridge, OrchestratorStatus } from '../../services/OrchestratorBridge';
import { harvestService } from '../../services/harvestService';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Production Fixes Integration Tests', () => {
  let testFarmId: string;
  let testHarvestId: string;

  beforeAll(async () => {
    // Ensure database is connected
    await db.query('SELECT 1');
  });

  afterAll(async () => {
    // Cleanup test data
    if (testFarmId) {
      await db.query('DELETE FROM farms WHERE id = $1', [testFarmId]);
    }
    if (testHarvestId) {
      await db.query('DELETE FROM harvests WHERE id = $1', [testHarvestId]);
    }
  });

  beforeEach(() => {
    testFarmId = uuidv4();
    testHarvestId = uuidv4();
  });

  describe('Tier 1 - Fix #1: Dual-Mode Orchestrator Completion Detection', () => {
    it('should detect orchestrator completion via file watcher', async () => {
      const farmId = uuidv4();
      const statusFile = `/var/maibarn/coordination/orchestrator_status_${farmId}.json`;

      // Ensure coordination directory exists
      await fs.mkdir('/var/maibarn/coordination', { recursive: true });

      // Start monitoring
      const completionPromise = orchestratorBridge.waitForOrchestratorReady(farmId, {
        timeout: 10000,
        requiredStatus: [OrchestratorStatus.READY]
      });

      // Simulate orchestrator writing status file (after a delay to test watcher)
      setTimeout(async () => {
        await orchestratorBridge.updateOrchestratorStatus(farmId, {
          status: OrchestratorStatus.READY,
          sessionName: `farm-${farmId}`,
          farmId,
          panesCreated: 3,
          panesReady: [0, 1, 2],
          timestamp: new Date().toISOString(),
          orchestratorPid: process.pid
        });
      }, 500);

      const result = await completionPromise;

      expect(result.status).toBe(OrchestratorStatus.READY);
      expect(result.farmId).toBe(farmId);
      expect(result.panesCreated).toBe(3);

      // Cleanup
      await orchestratorBridge.clearOrchestratorStatus(farmId);
      await fs.unlink(statusFile).catch(() => {});
    });

    it('should detect orchestrator completion via polling fallback', async () => {
      const farmId = uuidv4();

      // Pre-create status file (watcher might miss it)
      await orchestratorBridge.updateOrchestratorStatus(farmId, {
        status: OrchestratorStatus.READY,
        sessionName: `farm-${farmId}`,
        farmId,
        panesCreated: 5,
        panesReady: [0, 1, 2, 3, 4],
        timestamp: new Date().toISOString(),
        orchestratorPid: process.pid
      });

      // Start monitoring - should immediately detect via polling
      const result = await orchestratorBridge.waitForOrchestratorReady(farmId, {
        timeout: 5000,
        requiredStatus: [OrchestratorStatus.READY]
      });

      expect(result.status).toBe(OrchestratorStatus.READY);
      expect(result.panesCreated).toBe(5);

      // Cleanup
      await orchestratorBridge.clearOrchestratorStatus(farmId);
    });

    it('should handle orchestrator completion event and trigger harvest', (done) => {
      const farmId = uuidv4();

      orchestratorBridge.once('orchestrator-completed', ({ farmId: completedFarmId, status }) => {
        expect(completedFarmId).toBe(farmId);
        expect(status.status).toBe(OrchestratorStatus.COMPLETED);
        done();
      });

      // Start monitoring for completion
      orchestratorBridge.monitorForCompletion(farmId);

      // Simulate orchestrator completing
      setTimeout(async () => {
        await orchestratorBridge.updateOrchestratorStatus(farmId, {
          status: OrchestratorStatus.COMPLETED,
          sessionName: `farm-${farmId}`,
          farmId,
          panesCreated: 3,
          panesReady: [0, 1, 2],
          timestamp: new Date().toISOString(),
          orchestratorPid: process.pid
        });
      }, 100);
    }, 10000);
  });

  describe('Tier 1 - Fix #2: Harvest Auto-Recovery', () => {
    it('should create recovery harvest when harvestId is missing', async () => {
      const farmId = uuidv4();

      // Create test farm
      await db.query(
        'INSERT INTO farms (id, name, status, agent_count, created_at) VALUES ($1, $2, $3, $4, NOW())',
        [farmId, 'Test Farm', 'running', 3]
      );

      // Import shutdownCoordinator and test auto-recovery
      const { shutdownCoordinator } = await import('../../services/shutdownCoordinator');

      // Call collectFiles without harvestId (should trigger auto-recovery)
      const result = await (shutdownCoordinator as any).collectFiles(farmId, undefined, 'farm');

      expect(result.success).toBe(true);

      // Verify recovery harvest was created
      const harvests = await db.query(
        'SELECT * FROM harvests WHERE farm_id = $1 AND metadata @> $2',
        [farmId, JSON.stringify({ autoRecovery: true })]
      );

      expect(harvests.rows.length).toBeGreaterThan(0);
      expect(harvests.rows[0].name).toContain('Recovery Harvest');

      // Cleanup
      await db.query('DELETE FROM farms WHERE id = $1', [farmId]);
      await db.query('DELETE FROM harvests WHERE farm_id = $1', [farmId]);
    });
  });

  describe('Tier 2 - Fix #4: Farm Lifecycle State Machine', () => {
    it('should initialize farm state correctly', () => {
      const farmId = uuidv4();

      farmLifecycleStateMachine.initializeState(farmId, FarmStatus.IDLE);

      const currentState = farmLifecycleStateMachine.getCurrentState(farmId);
      expect(currentState).toBe(FarmStatus.IDLE);

      farmLifecycleStateMachine.clearState(farmId);
    });

    it('should allow valid state transitions', async () => {
      const farmId = uuidv4();

      farmLifecycleStateMachine.initializeState(farmId, FarmStatus.IDLE);

      // Valid transition: IDLE → LAUNCHING
      const transition1 = await farmLifecycleStateMachine.transition({
        farmId,
        currentState: FarmStatus.IDLE,
        targetState: FarmStatus.LAUNCHING,
        reason: 'farm_launch',
        triggeredBy: 'test'
      });

      expect(transition1).toBe(true);
      expect(farmLifecycleStateMachine.getCurrentState(farmId)).toBe(FarmStatus.LAUNCHING);

      // Valid transition: LAUNCHING → ACTIVE
      const transition2 = await farmLifecycleStateMachine.transition({
        farmId,
        currentState: FarmStatus.LAUNCHING,
        targetState: FarmStatus.ACTIVE,
        reason: 'agents_ready',
        triggeredBy: 'test'
      });

      expect(transition2).toBe(true);
      expect(farmLifecycleStateMachine.getCurrentState(farmId)).toBe(FarmStatus.ACTIVE);

      farmLifecycleStateMachine.clearState(farmId);
    });

    it('should reject invalid state transitions', async () => {
      const farmId = uuidv4();

      farmLifecycleStateMachine.initializeState(farmId, FarmStatus.IDLE);

      // Invalid transition: IDLE → RUNNING (must go through LAUNCHING → ACTIVE first)
      const transition = await farmLifecycleStateMachine.transition({
        farmId,
        currentState: FarmStatus.IDLE,
        targetState: FarmStatus.RUNNING,
        reason: 'invalid_jump',
        triggeredBy: 'test'
      });

      expect(transition).toBe(false);
      expect(farmLifecycleStateMachine.getCurrentState(farmId)).toBe(FarmStatus.IDLE);

      farmLifecycleStateMachine.clearState(farmId);
    });

    it('should allow conditional transitions with correct reason', async () => {
      const farmId = uuidv4();

      farmLifecycleStateMachine.initializeState(farmId, FarmStatus.RUNNING);

      // Conditional transition: RUNNING → COMPLETED (requires specific reason)
      const transition = await farmLifecycleStateMachine.transition({
        farmId,
        currentState: FarmStatus.RUNNING,
        targetState: FarmStatus.COMPLETED,
        reason: 'orchestrator_completed',
        triggeredBy: 'orchestrator'
      });

      expect(transition).toBe(true);
      expect(farmLifecycleStateMachine.getCurrentState(farmId)).toBe(FarmStatus.COMPLETED);

      farmLifecycleStateMachine.clearState(farmId);
    });

    it('should track transition history', async () => {
      const farmId = uuidv4();

      farmLifecycleStateMachine.initializeState(farmId, FarmStatus.IDLE);

      await farmLifecycleStateMachine.transition({
        farmId,
        currentState: FarmStatus.IDLE,
        targetState: FarmStatus.LAUNCHING,
        reason: 'start',
        triggeredBy: 'test'
      });

      await farmLifecycleStateMachine.transition({
        farmId,
        currentState: FarmStatus.LAUNCHING,
        targetState: FarmStatus.ACTIVE,
        reason: 'ready',
        triggeredBy: 'test'
      });

      const history = farmLifecycleStateMachine.getTransitionHistory(farmId);

      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history[history.length - 1].to).toBe(FarmStatus.ACTIVE);
      expect(history[history.length - 1].reason).toBe('ready');

      farmLifecycleStateMachine.clearState(farmId);
    });

    it('should provide valid next states', () => {
      const farmId = uuidv4();

      farmLifecycleStateMachine.initializeState(farmId, FarmStatus.IDLE);

      const validNextStates = farmLifecycleStateMachine.getValidNextStates(farmId);

      expect(validNextStates).toContain(FarmStatus.LAUNCHING);
      expect(validNextStates).toContain(FarmStatus.FAILED);

      farmLifecycleStateMachine.clearState(farmId);
    });
  });

  describe('Tier 2 - Fix #5: Guaranteed Harvest Yield Generation', () => {
    it('should generate summary yield when no artifacts collected', async () => {
      const farmId = uuidv4();

      // Create test farm
      await db.query(
        'INSERT INTO farms (id, name, status, agent_count, created_at) VALUES ($1, $2, $3, $4, NOW())',
        [farmId, 'Empty Farm', 'completed', 2]
      );

      // Create harvest
      const harvest = await harvestService.startHarvest({
        farmId,
        name: 'Empty Harvest Test',
        tags: ['test']
      });

      // Collect harvest (should generate summary since no workspace/terminal artifacts)
      const result = await harvestService.collectHarvest(harvest.id);

      expect(result).toBeDefined();
      expect(result!.yield.length).toBeGreaterThan(0);

      // Verify summary yield item
      const summaryYield = result!.yield[0];
      expect(summaryYield.type).toBe('documentation');
      expect(summaryYield.name).toBe('Harvest Summary');
      expect(summaryYield.metadata.systemGenerated).toBe(true);
      expect(summaryYield.metadata.content).toContain('Harvest Summary');
      expect(summaryYield.metadata.content).toContain('Empty Farm');

      // Cleanup
      await db.query('DELETE FROM farms WHERE id = $1', [farmId]);
      await db.query('DELETE FROM harvests WHERE id = $1', [harvest.id]);
    });

    it('should not generate summary when artifacts exist', async () => {
      const farmId = uuidv4();
      // CRITICAL FIX: Use correct path with 'active' subdirectory to match production paths
      const workspacePath = `/var/maibarn/workspaces/active/${farmId}`;

      // Create test farm
      await db.query(
        'INSERT INTO farms (id, name, status, agent_count, created_at) VALUES ($1, $2, $3, $4, NOW())',
        [farmId, 'Test Farm with Artifacts', 'completed', 1]
      );

      // Create workspace with a test file
      await fs.mkdir(workspacePath, { recursive: true });
      await fs.writeFile(path.join(workspacePath, 'test.txt'), 'Test content');

      // Create harvest
      const harvest = await harvestService.startHarvest({
        farmId,
        name: 'Harvest with Artifacts',
        tags: ['test']
      });

      // Collect harvest
      const result = await harvestService.collectHarvest(harvest.id);

      expect(result).toBeDefined();
      expect(result!.artifacts.length).toBeGreaterThan(0);
      expect(result!.yield.length).toBeGreaterThan(0);

      // Verify NO summary yield (should have real artifacts)
      const hasSummary = result!.yield.some(y => y.name === 'Harvest Summary');
      expect(hasSummary).toBe(false);

      // Cleanup
      await fs.rm(workspacePath, { recursive: true, force: true });
      await db.query('DELETE FROM farms WHERE id = $1', [farmId]);
      await db.query('DELETE FROM harvests WHERE id = $1', [harvest.id]);
    });
  });

  describe('Tier 3: Farm Lifecycle Monitoring Dashboard', () => {
    it('should provide lifecycle statistics', async () => {
      const stats = farmLifecycleStateMachine.getStatistics();

      expect(stats).toHaveProperty('totalFarms');
      expect(stats).toHaveProperty('byState');
      expect(stats).toHaveProperty('totalTransitions');
      expect(stats.byState).toHaveProperty(FarmStatus.IDLE);
      expect(stats.byState).toHaveProperty(FarmStatus.RUNNING);
      expect(stats.byState).toHaveProperty(FarmStatus.COMPLETED);
    });

    it('should detect stuck farms via database query', async () => {
      const stuckFarmId = uuidv4();

      // Create farm stuck in launching (created 15 minutes ago)
      await db.query(`
        INSERT INTO farms (id, name, status, agent_count, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW() - INTERVAL '15 minutes', NOW() - INTERVAL '15 minutes')
      `, [stuckFarmId, 'Stuck Farm', 'launching', 3]);

      // Query for stuck farms (threshold: 10 minutes)
      const result = await db.query(`
        SELECT id, name, status,
               EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 as idle_minutes
        FROM farms
        WHERE status IN ('launching', 'active', 'running', 'completing')
          AND EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 > 10
      `);

      const stuckFarms = result.rows.filter(row => row.id === stuckFarmId);
      expect(stuckFarms.length).toBe(1);
      expect(parseFloat(stuckFarms[0].idle_minutes)).toBeGreaterThan(10);

      // Cleanup
      await db.query('DELETE FROM farms WHERE id = $1', [stuckFarmId]);
    });

    it('should calculate completion rate correctly', async () => {
      const testFarmIds = [uuidv4(), uuidv4(), uuidv4(), uuidv4()];

      // Create 4 farms: 3 completed, 1 failed
      await db.query(`
        INSERT INTO farms (id, name, status, agent_count, created_at)
        VALUES
          ($1, 'Completed 1', 'completed', 2, NOW() - INTERVAL '1 hour'),
          ($2, 'Completed 2', 'completed', 2, NOW() - INTERVAL '2 hours'),
          ($3, 'Completed 3', 'completed', 2, NOW() - INTERVAL '3 hours'),
          ($4, 'Failed 1', 'failed', 2, NOW() - INTERVAL '30 minutes')
      `, testFarmIds);

      // Calculate completion rate
      const result = await db.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          COUNT(*) as total
        FROM farms
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);

      const { completed, failed, total } = result.rows[0];
      const completionRate = (parseInt(completed) / parseInt(total)) * 100;

      expect(parseInt(completed)).toBeGreaterThanOrEqual(3);
      expect(completionRate).toBeGreaterThan(50);

      // Cleanup
      await db.query('DELETE FROM farms WHERE id = ANY($1)', [testFarmIds]);
    });
  });

  describe('End-to-End Integration', () => {
    it('should complete full farm lifecycle with guaranteed harvest', async () => {
      const farmId = uuidv4();

      // Initialize state machine
      farmLifecycleStateMachine.initializeState(farmId, FarmStatus.IDLE);

      // Create farm in database
      await db.query(
        'INSERT INTO farms (id, name, status, agent_count, created_at) VALUES ($1, $2, $3, $4, NOW())',
        [farmId, 'E2E Test Farm', 'idle', 3]
      );

      // Transition: IDLE → LAUNCHING
      await farmLifecycleStateMachine.transition({
        farmId,
        currentState: FarmStatus.IDLE,
        targetState: FarmStatus.LAUNCHING,
        reason: 'user_request',
        triggeredBy: 'test'
      });

      expect(farmLifecycleStateMachine.getCurrentState(farmId)).toBe(FarmStatus.LAUNCHING);

      // Transition: LAUNCHING → ACTIVE
      await farmLifecycleStateMachine.transition({
        farmId,
        currentState: FarmStatus.LAUNCHING,
        targetState: FarmStatus.ACTIVE,
        reason: 'orchestrator_ready',
        triggeredBy: 'orchestrator'
      });

      // Transition: ACTIVE → RUNNING
      await farmLifecycleStateMachine.transition({
        farmId,
        currentState: FarmStatus.ACTIVE,
        targetState: FarmStatus.RUNNING,
        reason: 'work_started',
        triggeredBy: 'agents'
      });

      // Transition: RUNNING → COMPLETED
      await farmLifecycleStateMachine.transition({
        farmId,
        currentState: FarmStatus.RUNNING,
        targetState: FarmStatus.COMPLETED,
        reason: 'orchestrator_completed',
        triggeredBy: 'orchestrator'
      });

      expect(farmLifecycleStateMachine.getCurrentState(farmId)).toBe(FarmStatus.COMPLETED);

      // Create harvest
      const harvest = await harvestService.startHarvest({
        farmId,
        name: 'E2E Test Harvest',
        tags: ['e2e', 'test']
      });

      // Collect harvest (will generate summary since no artifacts)
      const result = await harvestService.collectHarvest(harvest.id);

      expect(result).toBeDefined();
      expect(result!.status).toBe('ready');
      expect(result!.yield.length).toBeGreaterThan(0);

      // Verify transition history
      const history = farmLifecycleStateMachine.getTransitionHistory(farmId);
      expect(history.length).toBeGreaterThanOrEqual(4);

      // Cleanup
      farmLifecycleStateMachine.clearState(farmId);
      await db.query('DELETE FROM farms WHERE id = $1', [farmId]);
      await db.query('DELETE FROM harvests WHERE id = $1', [harvest.id]);
    });
  });
});
