/**
 * Work Coordination Service
 * Manages distributed work claims and prevents conflicts between agents
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { lockManager } from '../utils/lockManager';
import {
  WorkClaim,
  WorkCoordinationState,
  ClaimResult,
  PlannedWork,
  ConflictResolution,
  WorkCoordinationMetrics,
  AgentWorkProfile,
  LockConflict
} from '../types/workClaim';

export class WorkCoordinationService extends EventEmitter {
  private state: WorkCoordinationState;
  private coordinationDir: string;
  private claimsDir: string;
  private queueDir: string;
  private saveInterval: NodeJS.Timeout | null = null;

  constructor(coordinationDir: string = '/tmp/claude_coordination') {
    super();
    this.coordinationDir = coordinationDir;
    this.claimsDir = path.join(coordinationDir, 'work_claims');
    this.queueDir = path.join(coordinationDir, 'work_queue');
    
    this.state = {
      activeClaims: new Map(),
      fileLocks: new Map(),
      workQueue: {
        pending: [],
        assigned: [],
        completed: []
      },
      agentWorkload: new Map(),
      lastCleanup: new Date()
    };
    
    this.initialize();
  }

  private async initialize() {
    // Ensure directories exist
    await fs.mkdir(this.claimsDir, { recursive: true });
    await fs.mkdir(this.queueDir, { recursive: true });
    
    // Load existing state
    await this.loadState();
    
    // Start periodic state saving
    this.saveInterval = setInterval(() => {
      this.saveState().catch(console.error);
    }, 5000); // Save every 5 seconds
    
    console.log('[WorkCoordination] Service initialized');
  }

  async claimWork(agentId: string, workItem: Partial<WorkClaim>): Promise<ClaimResult> {
    try {
      // Check agent workload
      const currentWorkload = this.state.agentWorkload.get(agentId) || 0;
      if (currentWorkload >= 5) { // Max 5 concurrent claims per agent
        return {
          success: false,
          message: 'Agent has reached maximum concurrent work claims',
          conflicts: []
        };
      }

      // Create work claim
      const claim: WorkClaim = {
        id: uuidv4(),
        agentId,
        agentUid: workItem.agentUid,
        timestamp: new Date(),
        type: workItem.type || 'task',
        priority: workItem.priority || 'medium',
        status: 'claimed',
        description: workItem.description || '',
        files: workItem.files || [],
        dependencies: workItem.dependencies,
        estimatedDuration: workItem.estimatedDuration,
        startTime: new Date()
      };

      // Check for conflicts with existing claims
      const conflicts = await this.checkConflicts(claim);
      if (conflicts.length > 0) {
        // Attempt conflict resolution
        const resolution = await this.resolveConflicts(claim, conflicts);
        if (!resolution.success) {
          return {
            success: false,
            message: 'Unable to resolve conflicts',
            conflicts: resolution.conflicts
          };
        }
        claim.conflictsWith = conflicts.map(c => c.id);
        claim.resolution = resolution.resolution;
      }

      // Acquire file locks
      const lockResults = await this.acquireFileLocks(claim);
      if (!lockResults.success) {
        return {
          success: false,
          message: 'Unable to acquire necessary file locks',
          conflicts: lockResults.conflicts
        };
      }

      // Update state
      this.state.activeClaims.set(claim.id, claim);
      this.state.agentWorkload.set(agentId, currentWorkload + 1);
      
      // Save claim to disk
      await this.saveClaim(claim);
      
      // Emit event
      this.emit('work:claimed', {
        claim,
        agentId,
        timestamp: new Date()
      });

      return {
        success: true,
        claim,
        locks: lockResults.locks,
        message: 'Work successfully claimed'
      };
    } catch (error) {
      console.error('[WorkCoordination] Error claiming work:', error);
      return {
        success: false,
        message: `Error claiming work: ${error.message}`,
        conflicts: []
      };
    }
  }

  async completeWork(claimId: string, success: boolean = true): Promise<boolean> {
    const claim = this.state.activeClaims.get(claimId);
    if (!claim) {
      return false;
    }

    // Update claim status
    claim.status = success ? 'completed' : 'failed';
    claim.completionTime = new Date();
    
    // Release file locks
    const locks = await lockManager.getLocksByAgent(claim.agentId);
    for (const lock of locks) {
      if (lock.workClaimId === claimId) {
        await lockManager.releaseLock(lock.id);
      }
    }
    
    // Update state
    this.state.activeClaims.delete(claimId);
    const workload = this.state.agentWorkload.get(claim.agentId) || 1;
    this.state.agentWorkload.set(claim.agentId, Math.max(0, workload - 1));
    
    if (success) {
      this.state.workQueue.completed.push(claimId);
    }
    
    // Move to completed directory
    await this.archiveClaim(claim);
    
    // Emit event
    this.emit('work:completed', {
      claim,
      success,
      duration: claim.completionTime.getTime() - claim.startTime.getTime(),
      timestamp: new Date()
    });
    
    return true;
  }

  async queueWork(workItem: PlannedWork): Promise<void> {
    workItem.id = workItem.id || uuidv4();
    workItem.createdAt = new Date();
    
    this.state.workQueue.pending.push(workItem);
    
    // Save to queue directory
    const queueFile = path.join(this.queueDir, `${workItem.id}.json`);
    await fs.writeFile(queueFile, JSON.stringify(workItem, null, 2));
    
    // Emit event
    this.emit('work:queued', {
      workItem,
      queueLength: this.state.workQueue.pending.length,
      timestamp: new Date()
    });
  }

  async assignQueuedWork(agentId: string, count: number = 1): Promise<PlannedWork[]> {
    const assigned: PlannedWork[] = [];
    const currentWorkload = this.state.agentWorkload.get(agentId) || 0;
    const availableSlots = Math.max(0, 5 - currentWorkload);
    const toAssign = Math.min(count, availableSlots, this.state.workQueue.pending.length);
    
    for (let i = 0; i < toAssign; i++) {
      const workItem = this.state.workQueue.pending.shift();
      if (workItem) {
        workItem.assignedAt = new Date();
        workItem.assignedTo = workItem.assignedTo || [];
        workItem.assignedTo.push(agentId);
        
        this.state.workQueue.assigned.push(workItem);
        assigned.push(workItem);
        
        // Update queue file
        const queueFile = path.join(this.queueDir, `${workItem.id}.json`);
        await fs.writeFile(queueFile, JSON.stringify(workItem, null, 2));
      }
    }
    
    return assigned;
  }

  getActiveWork(): WorkClaim[] {
    return Array.from(this.state.activeClaims.values());
  }

  getWorkQueue(): PlannedWork[] {
    return [...this.state.workQueue.pending];
  }

  async getAgentProfile(agentId: string): Promise<AgentWorkProfile> {
    const activeClaims = Array.from(this.state.activeClaims.values())
      .filter(claim => claim.agentId === agentId);
    
    const completedWork = await this.getCompletedWorkByAgent(agentId);
    const filesLocked = (await lockManager.getLocksByAgent(agentId))
      .map(lock => lock.filePath);
    
    // Calculate metrics
    const completedClaims = completedWork.filter(c => c.status === 'completed');
    const totalCompletionTime = completedClaims.reduce((sum, claim) => {
      if (claim.startTime && claim.completionTime) {
        return sum + (new Date(claim.completionTime).getTime() - new Date(claim.startTime).getTime());
      }
      return sum;
    }, 0);
    
    const metrics = {
      claimsCompleted: completedClaims.length,
      averageCompletionTime: completedClaims.length > 0 ? totalCompletionTime / completedClaims.length : 0,
      conflictsEncountered: completedWork.filter(c => c.conflictsWith && c.conflictsWith.length > 0).length,
      successRate: completedWork.length > 0 ? (completedClaims.length / completedWork.length) * 100 : 0
    };
    
    return {
      agentId,
      activeClaims,
      completedWork: completedWork.map(c => c.id),
      filesLocked,
      lastActivity: new Date(),
      metrics
    };
  }

  async getMetrics(): Promise<WorkCoordinationMetrics> {
    const allClaims = await this.getAllClaims();
    const activeClaims = Array.from(this.state.activeClaims.values());
    const completedClaims = allClaims.filter(c => c.status === 'completed');
    const failedClaims = allClaims.filter(c => c.status === 'failed');
    const conflictClaims = allClaims.filter(c => c.status === 'conflict');
    
    const totalCompletionTime = completedClaims.reduce((sum, claim) => {
      if (claim.startTime && claim.completionTime) {
        return sum + (new Date(claim.completionTime).getTime() - new Date(claim.startTime).getTime());
      }
      return sum;
    }, 0);
    
    const allLocks = lockManager.getAllLocks();
    let totalLocks = 0;
    let staleLocks = 0;
    
    for (const locks of allLocks.values()) {
      totalLocks += locks.length;
      staleLocks += locks.filter(lock => new Date() > new Date(lock.expiresAt)).length;
    }
    
    return {
      totalClaims: allClaims.length,
      activeClaims: activeClaims.length,
      completedClaims: completedClaims.length,
      failedClaims: failedClaims.length,
      conflicts: conflictClaims.length,
      averageCompletionTime: completedClaims.length > 0 ? totalCompletionTime / completedClaims.length : 0,
      locksHeld: totalLocks,
      staleLocks
    };
  }

  private async checkConflicts(claim: WorkClaim): Promise<WorkClaim[]> {
    const conflicts: WorkClaim[] = [];
    
    // Check file conflicts
    for (const claimEntry of this.state.activeClaims.values()) {
      if (claimEntry.agentId === claim.agentId) continue; // Same agent
      
      // Check file overlap
      const fileOverlap = claim.files.some(file => claimEntry.files.includes(file));
      if (fileOverlap) {
        conflicts.push(claimEntry);
      }
      
      // Check dependency conflicts
      if (claim.dependencies && claimEntry.dependencies) {
        const depOverlap = claim.dependencies.some(dep => claimEntry.dependencies.includes(dep));
        if (depOverlap) {
          conflicts.push(claimEntry);
        }
      }
    }
    
    return conflicts;
  }

  private async resolveConflicts(claim: WorkClaim, conflicts: WorkClaim[]): Promise<{
    success: boolean;
    resolution?: ConflictResolution;
    conflicts: LockConflict[];
  }> {
    // Simple resolution strategies
    const lockConflicts: LockConflict[] = [];
    
    // Check if all conflicts are from the same agent (potential collaboration)
    const conflictingAgents = new Set(conflicts.map(c => c.agentId));
    if (conflictingAgents.size === 1) {
      // Single agent conflict - suggest collaboration
      return {
        success: true,
        resolution: {
          type: 'collaborate',
          strategy: 'Work together on overlapping files',
          assignedTo: [claim.agentId, ...Array.from(conflictingAgents)]
        }
      };
    }
    
    // Check if conflicts are on non-critical files
    const criticalConflicts = conflicts.filter(c => c.priority === 'critical');
    if (criticalConflicts.length === 0 && claim.priority !== 'critical') {
      // No critical conflicts - can wait
      return {
        success: true,
        resolution: {
          type: 'wait',
          strategy: 'Wait for non-critical work to complete'
        }
      };
    }
    
    // Check if work can be split
    if (claim.files.length > 1) {
      const conflictedFiles = new Set<string>();
      conflicts.forEach(c => c.files.forEach(f => conflictedFiles.add(f)));
      
      const unconflictedFiles = claim.files.filter(f => !conflictedFiles.has(f));
      if (unconflictedFiles.length > 0) {
        // Can work on non-conflicted files
        claim.files = unconflictedFiles;
        return {
          success: true,
          resolution: {
            type: 'split',
            strategy: `Work on ${unconflictedFiles.length} non-conflicted files`
          }
        };
      }
    }
    
    // Unable to resolve automatically
    conflicts.forEach(conflict => {
      lockConflicts.push({
        type: 'file_locked',
        lockId: conflict.id,
        agentId: conflict.agentId,
        message: `Conflict with claim ${conflict.id} by agent ${conflict.agentId}`
      });
    });
    
    return {
      success: false,
      conflicts: lockConflicts
    };
  }

  private async acquireFileLocks(claim: WorkClaim): Promise<{
    success: boolean;
    locks?: any[];
    conflicts: LockConflict[];
  }> {
    const locks = [];
    const conflicts: LockConflict[] = [];
    
    for (const file of claim.files) {
      const lock = await lockManager.acquireLock(
        file,
        claim.agentId,
        claim.id,
        ['read', 'write'],
        'exclusive',
        claim.agentUid
      );
      
      if (!lock) {
        // Failed to acquire lock
        const status = await lockManager.checkLock(file);
        conflicts.push(...status.conflicts);
      } else {
        locks.push(lock);
      }
    }
    
    // If any locks failed, release all acquired locks
    if (conflicts.length > 0) {
      for (const lock of locks) {
        await lockManager.releaseLock(lock.id);
      }
      return { success: false, conflicts };
    }
    
    return { success: true, locks, conflicts: [] };
  }

  private async saveClaim(claim: WorkClaim): Promise<void> {
    const claimFile = path.join(this.claimsDir, `${claim.agentId}_${claim.id}.json`);
    await fs.writeFile(claimFile, JSON.stringify(claim, null, 2));
  }

  private async archiveClaim(claim: WorkClaim): Promise<void> {
    const claimFile = path.join(this.claimsDir, `${claim.agentId}_${claim.id}.json`);
    const completedDir = path.join(this.coordinationDir, 'completed_work');
    await fs.mkdir(completedDir, { recursive: true });
    
    const archiveFile = path.join(completedDir, `${claim.agentId}_${claim.id}.json`);
    
    try {
      await fs.rename(claimFile, archiveFile);
    } catch (error) {
      // If rename fails, copy and delete
      await fs.copyFile(claimFile, archiveFile);
      await fs.unlink(claimFile).catch(() => {});
    }
  }

  private async loadState(): Promise<void> {
    try {
      // Load active claims
      const claimFiles = await fs.readdir(this.claimsDir).catch(() => []);
      for (const file of claimFiles) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(this.claimsDir, file), 'utf-8');
            const claim = JSON.parse(content) as WorkClaim;
            
            // Convert dates
            claim.timestamp = new Date(claim.timestamp);
            if (claim.startTime) claim.startTime = new Date(claim.startTime);
            if (claim.completionTime) claim.completionTime = new Date(claim.completionTime);
            
            this.state.activeClaims.set(claim.id, claim);
            
            // Update workload
            const currentWorkload = this.state.agentWorkload.get(claim.agentId) || 0;
            this.state.agentWorkload.set(claim.agentId, currentWorkload + 1);
          } catch (error) {
            console.error(`Failed to load claim ${file}:`, error);
          }
        }
      }
      
      // Load work queue
      const queueFiles = await fs.readdir(this.queueDir).catch(() => []);
      for (const file of queueFiles) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(this.queueDir, file), 'utf-8');
            const workItem = JSON.parse(content) as PlannedWork;
            
            // Convert dates
            workItem.createdAt = new Date(workItem.createdAt);
            if (workItem.assignedAt) workItem.assignedAt = new Date(workItem.assignedAt);
            
            if (workItem.assignedAt) {
              this.state.workQueue.assigned.push(workItem);
            } else {
              this.state.workQueue.pending.push(workItem);
            }
          } catch (error) {
            console.error(`Failed to load queue item ${file}:`, error);
          }
        }
      }
      
      console.log(`[WorkCoordination] Loaded ${this.state.activeClaims.size} active claims and ${this.state.workQueue.pending.length + this.state.workQueue.assigned.length} queued items`);
    } catch (error) {
      console.error('[WorkCoordination] Failed to load state:', error);
    }
  }

  private async saveState(): Promise<void> {
    // State is saved incrementally through individual operations
    // This method can be used for periodic consistency checks
  }

  private async getAllClaims(): Promise<WorkClaim[]> {
    const claims: WorkClaim[] = [];
    
    // Active claims
    claims.push(...Array.from(this.state.activeClaims.values()));
    
    // Completed claims
    const completedDir = path.join(this.coordinationDir, 'completed_work');
    const completedFiles = await fs.readdir(completedDir).catch(() => []);
    
    for (const file of completedFiles) {
      if (file.endsWith('.json')) {
        try {
          const content = await fs.readFile(path.join(completedDir, file), 'utf-8');
          const claim = JSON.parse(content) as WorkClaim;
          claims.push(claim);
        } catch (error) {
          console.error(`Failed to load completed claim ${file}:`, error);
        }
      }
    }
    
    return claims;
  }

  private async getCompletedWorkByAgent(agentId: string): Promise<WorkClaim[]> {
    const completedWork: WorkClaim[] = [];
    const completedDir = path.join(this.coordinationDir, 'completed_work');
    const files = await fs.readdir(completedDir).catch(() => []);
    
    for (const file of files) {
      if (file.startsWith(`${agentId}_`) && file.endsWith('.json')) {
        try {
          const content = await fs.readFile(path.join(completedDir, file), 'utf-8');
          const claim = JSON.parse(content) as WorkClaim;
          completedWork.push(claim);
        } catch (error) {
          console.error(`Failed to load completed work ${file}:`, error);
        }
      }
    }
    
    return completedWork;
  }

  destroy() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
    lockManager.destroy();
    this.removeAllListeners();
  }
}

// Export singleton instance
export const workCoordinationService = new WorkCoordinationService();