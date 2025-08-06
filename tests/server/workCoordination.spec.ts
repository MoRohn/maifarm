/**
 * Work Coordination Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { WorkCoordinationService } from '../services/workCoordination';
import { LockManager } from '../utils/lockManager';
import { WorkClaim, PlannedWork } from '../types/workClaim';

// Mock directories for testing
const TEST_COORD_DIR = '/tmp/test_claude_coordination';
const TEST_LOCK_DIR = path.join(TEST_COORD_DIR, 'locks');

describe('WorkCoordinationService', () => {
  let service: WorkCoordinationService;
  let lockManager: LockManager;

  beforeEach(async () => {
    // Clean up test directories
    await fs.rm(TEST_COORD_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_COORD_DIR, { recursive: true });
    
    // Create services with test directories
    lockManager = new LockManager(TEST_LOCK_DIR);
    service = new WorkCoordinationService(TEST_COORD_DIR);
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    // Clean up
    service.destroy();
    lockManager.destroy();
    await fs.rm(TEST_COORD_DIR, { recursive: true, force: true });
  });

  describe('claimWork', () => {
    it('should successfully claim work with no conflicts', async () => {
      const result = await service.claimWork('agent_1', {
        description: 'Test work item',
        files: ['src/test1.ts', 'src/test2.ts'],
        type: 'task',
        priority: 'medium'
      });

      expect(result.success).toBe(true);
      expect(result.claim).toBeDefined();
      expect(result.claim?.agentId).toBe('agent_1');
      expect(result.claim?.status).toBe('claimed');
      expect(result.locks).toHaveLength(2);
    });

    it('should prevent claiming conflicting files', async () => {
      // First agent claims files
      await service.claimWork('agent_1', {
        description: 'First work item',
        files: ['src/shared.ts'],
        type: 'task'
      });

      // Second agent tries to claim same file
      const result = await service.claimWork('agent_2', {
        description: 'Conflicting work item',
        files: ['src/shared.ts', 'src/other.ts'],
        type: 'task'
      });

      expect(result.success).toBe(true); // Should succeed with split resolution
      expect(result.claim?.files).toEqual(['src/other.ts']); // Only non-conflicted file
      expect(result.claim?.resolution?.type).toBe('split');
    });

    it('should enforce agent workload limits', async () => {
      // Claim maximum allowed work items
      for (let i = 0; i < 5; i++) {
        await service.claimWork('agent_1', {
          description: `Work item ${i}`,
          files: [`src/file${i}.ts`],
          type: 'task'
        });
      }

      // Try to claim one more
      const result = await service.claimWork('agent_1', {
        description: 'Excess work item',
        files: ['src/excess.ts'],
        type: 'task'
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('maximum concurrent work claims');
    });

    it('should handle collaboration resolution for same-agent conflicts', async () => {
      // Agent 1 claims some files
      await service.claimWork('agent_1', {
        description: 'Initial work',
        files: ['src/module.ts', 'src/module.spec.ts'],
        type: 'feature'
      });

      // Agent 2 tries to claim overlapping files from agent 1
      const result = await service.claimWork('agent_2', {
        description: 'Related work',
        files: ['src/module.ts', 'src/utils.ts'],
        type: 'feature'
      });

      expect(result.success).toBe(true);
      expect(result.claim?.resolution?.type).toBe('collaborate');
      expect(result.claim?.resolution?.assignedTo).toContain('agent_1');
      expect(result.claim?.resolution?.assignedTo).toContain('agent_2');
    });
  });

  describe('completeWork', () => {
    it('should complete work and release locks', async () => {
      // Claim work
      const claimResult = await service.claimWork('agent_1', {
        description: 'Work to complete',
        files: ['src/complete.ts'],
        type: 'task'
      });

      expect(claimResult.success).toBe(true);
      const claimId = claimResult.claim!.id;

      // Complete the work
      const completed = await service.completeWork(claimId, true);
      expect(completed).toBe(true);

      // Verify work is no longer active
      const activeWork = service.getActiveWork();
      expect(activeWork.find(w => w.id === claimId)).toBeUndefined();

      // Verify locks are released
      const lockStatus = await lockManager.checkLock('src/complete.ts');
      expect(lockStatus.isLocked).toBe(false);
    });

    it('should handle failed work completion', async () => {
      const claimResult = await service.claimWork('agent_1', {
        description: 'Work that will fail',
        files: ['src/fail.ts'],
        type: 'task'
      });

      const claimId = claimResult.claim!.id;
      const completed = await service.completeWork(claimId, false);
      
      expect(completed).toBe(true);
      
      // Check that work is archived with failed status
      const completedDir = path.join(TEST_COORD_DIR, 'completed_work');
      const files = await fs.readdir(completedDir);
      const claimFile = files.find(f => f.includes(claimId));
      expect(claimFile).toBeDefined();
      
      const content = await fs.readFile(path.join(completedDir, claimFile!), 'utf-8');
      const claim = JSON.parse(content) as WorkClaim;
      expect(claim.status).toBe('failed');
    });
  });

  describe('queueWork', () => {
    it('should queue planned work', async () => {
      const workItem: PlannedWork = {
        id: 'test-work-1',
        description: 'Planned work item',
        priority: 'high',
        requiredFiles: ['src/planned.ts'],
        estimatedAgents: 1,
        createdAt: new Date()
      };

      await service.queueWork(workItem);
      
      const queue = service.getWorkQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].description).toBe('Planned work item');
    });

    it('should assign queued work to agents', async () => {
      // Queue multiple work items
      for (let i = 0; i < 3; i++) {
        await service.queueWork({
          id: `work-${i}`,
          description: `Queued work ${i}`,
          priority: 'medium',
          requiredFiles: [`src/file${i}.ts`],
          estimatedAgents: 1,
          createdAt: new Date()
        });
      }

      // Assign work to agent
      const assigned = await service.assignQueuedWork('agent_1', 2);
      
      expect(assigned).toHaveLength(2);
      expect(assigned[0].assignedTo).toContain('agent_1');
      expect(assigned[1].assignedTo).toContain('agent_1');
      
      // Check remaining queue
      const queue = service.getWorkQueue();
      expect(queue).toHaveLength(1);
    });

    it('should respect agent workload when assigning', async () => {
      // Fill agent's workload
      for (let i = 0; i < 4; i++) {
        await service.claimWork('agent_1', {
          description: `Existing work ${i}`,
          files: [`src/existing${i}.ts`],
          type: 'task'
        });
      }

      // Queue work
      await service.queueWork({
        id: 'queued-1',
        description: 'Queued work',
        priority: 'medium',
        requiredFiles: ['src/queued.ts'],
        estimatedAgents: 1,
        createdAt: new Date()
      });

      // Try to assign (should only assign 1 due to workload limit)
      const assigned = await service.assignQueuedWork('agent_1', 5);
      expect(assigned).toHaveLength(1); // Only 1 slot available (5 - 4 = 1)
    });
  });

  describe('getAgentProfile', () => {
    it('should return comprehensive agent profile', async () => {
      // Create some work history
      const claim1 = await service.claimWork('agent_1', {
        description: 'First task',
        files: ['src/first.ts'],
        type: 'task',
        estimatedDuration: 30
      });
      
      await service.completeWork(claim1.claim!.id, true);

      const claim2 = await service.claimWork('agent_1', {
        description: 'Second task',
        files: ['src/second.ts'],
        type: 'task'
      });

      // Get profile
      const profile = await service.getAgentProfile('agent_1');
      
      expect(profile.agentId).toBe('agent_1');
      expect(profile.activeClaims).toHaveLength(1);
      expect(profile.completedWork).toHaveLength(1);
      expect(profile.filesLocked).toHaveLength(1);
      expect(profile.metrics.claimsCompleted).toBe(1);
      expect(profile.metrics.successRate).toBe(100);
    });
  });

  describe('getMetrics', () => {
    it('should calculate coordination metrics', async () => {
      // Create various work items
      const claim1 = await service.claimWork('agent_1', {
        description: 'Task 1',
        files: ['src/file1.ts'],
        type: 'task'
      });
      
      await service.completeWork(claim1.claim!.id, true);

      await service.claimWork('agent_2', {
        description: 'Task 2',
        files: ['src/file2.ts'],
        type: 'task'
      });

      const metrics = await service.getMetrics();
      
      expect(metrics.totalClaims).toBe(2);
      expect(metrics.activeClaims).toBe(1);
      expect(metrics.completedClaims).toBe(1);
      expect(metrics.failedClaims).toBe(0);
      expect(metrics.locksHeld).toBeGreaterThanOrEqual(1);
    });
  });

  describe('conflict resolution', () => {
    it('should wait for non-critical conflicts', async () => {
      // Agent 1 claims non-critical work
      await service.claimWork('agent_1', {
        description: 'Non-critical work',
        files: ['src/shared.ts'],
        type: 'task',
        priority: 'low'
      });

      // Agent 2 tries to claim same file with medium priority
      const result = await service.claimWork('agent_2', {
        description: 'Medium priority work',
        files: ['src/shared.ts'],
        type: 'task',
        priority: 'medium'
      });

      expect(result.success).toBe(true);
      expect(result.claim?.resolution?.type).toBe('wait');
    });

    it('should handle critical priority conflicts', async () => {
      // Agent 1 claims critical work
      await service.claimWork('agent_1', {
        description: 'Critical work',
        files: ['src/critical.ts'],
        type: 'task',
        priority: 'critical'
      });

      // Agent 2 tries to claim same file
      const result = await service.claimWork('agent_2', {
        description: 'Other work',
        files: ['src/critical.ts', 'src/other.ts'],
        type: 'task',
        priority: 'medium'
      });

      // Should split to work on non-conflicted files
      expect(result.success).toBe(true);
      expect(result.claim?.files).toEqual(['src/other.ts']);
      expect(result.claim?.resolution?.type).toBe('split');
    });
  });

  describe('persistence', () => {
    it('should persist and restore state', async () => {
      // Create some state
      await service.claimWork('agent_1', {
        description: 'Persistent work',
        files: ['src/persist.ts'],
        type: 'task'
      });

      await service.queueWork({
        id: 'queued-persist',
        description: 'Queued persistent work',
        priority: 'high',
        requiredFiles: ['src/queued.ts'],
        estimatedAgents: 1,
        createdAt: new Date()
      });

      // Destroy service
      service.destroy();

      // Create new service instance
      const newService = new WorkCoordinationService(TEST_COORD_DIR);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check state was restored
      const activeWork = newService.getActiveWork();
      const queue = newService.getWorkQueue();

      expect(activeWork).toHaveLength(1);
      expect(activeWork[0].description).toBe('Persistent work');
      expect(queue).toHaveLength(1);
      expect(queue[0].description).toBe('Queued persistent work');

      newService.destroy();
    });
  });
});

describe('LockManager', () => {
  let lockManager: LockManager;

  beforeEach(async () => {
    await fs.rm(TEST_LOCK_DIR, { recursive: true, force: true });
    lockManager = new LockManager(TEST_LOCK_DIR);
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(() => {
    lockManager.destroy();
  });

  describe('acquireLock', () => {
    it('should acquire exclusive lock', async () => {
      const lock = await lockManager.acquireLock(
        'src/test.ts',
        'agent_1',
        'claim_1',
        ['read', 'write'],
        'exclusive'
      );

      expect(lock).toBeDefined();
      expect(lock?.filePath).toBe('src/test.ts');
      expect(lock?.type).toBe('exclusive');
    });

    it('should prevent acquiring conflicting exclusive locks', async () => {
      // First lock
      await lockManager.acquireLock(
        'src/conflict.ts',
        'agent_1',
        'claim_1',
        ['write'],
        'exclusive'
      );

      // Try to acquire second lock
      const lock2 = await lockManager.acquireLock(
        'src/conflict.ts',
        'agent_2',
        'claim_2',
        ['read'],
        'exclusive'
      );

      expect(lock2).toBeNull();
    });

    it('should allow multiple shared locks', async () => {
      const lock1 = await lockManager.acquireLock(
        'src/shared.ts',
        'agent_1',
        'claim_1',
        ['read'],
        'shared'
      );

      const lock2 = await lockManager.acquireLock(
        'src/shared.ts',
        'agent_2',
        'claim_2',
        ['read'],
        'shared'
      );

      expect(lock1).toBeDefined();
      expect(lock2).toBeDefined();
    });
  });

  describe('releaseLock', () => {
    it('should release lock and allow re-acquisition', async () => {
      const lock = await lockManager.acquireLock(
        'src/release.ts',
        'agent_1',
        'claim_1',
        ['write'],
        'exclusive'
      );

      const released = await lockManager.releaseLock(lock!.id);
      expect(released).toBe(true);

      // Should be able to acquire again
      const newLock = await lockManager.acquireLock(
        'src/release.ts',
        'agent_2',
        'claim_2',
        ['write'],
        'exclusive'
      );

      expect(newLock).toBeDefined();
    });
  });

  describe('cleanStaleLocks', () => {
    it('should clean expired locks', async () => {
      // Create lock with short expiry
      const shortLockManager = new LockManager(TEST_LOCK_DIR, 100); // 100ms timeout
      
      await shortLockManager.acquireLock(
        'src/stale.ts',
        'agent_1',
        'claim_1',
        ['write'],
        'exclusive'
      );

      // Wait for lock to expire
      await new Promise(resolve => setTimeout(resolve, 200));

      const cleaned = await shortLockManager.cleanStaleLocks();
      expect(cleaned).toBe(1);

      // Should be able to acquire lock now
      const newLock = await shortLockManager.acquireLock(
        'src/stale.ts',
        'agent_2',
        'claim_2',
        ['write'],
        'exclusive'
      );

      expect(newLock).toBeDefined();
      shortLockManager.destroy();
    });
  });

  describe('extendLock', () => {
    it('should extend lock expiration', async () => {
      const lock = await lockManager.acquireLock(
        'src/extend.ts',
        'agent_1',
        'claim_1',
        ['write'],
        'exclusive'
      );

      const originalExpiry = lock!.expiresAt;
      
      // Extend lock
      const extended = await lockManager.extendLock(lock!.id, 60000); // 1 minute
      expect(extended).toBe(true);

      // Check new expiry
      const status = await lockManager.checkLock('src/extend.ts');
      const updatedLock = status.locks[0];
      expect(new Date(updatedLock.expiresAt).getTime()).toBeGreaterThan(new Date(originalExpiry).getTime());
    });
  });
});