/**
 * Lock Manager
 * Handles distributed file locking for multi-agent coordination
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileLock, LockStatus, LockConflict, FileOperation } from '../types/workClaim';

export class LockManager {
  private locks: Map<string, FileLock[]> = new Map();
  private lockDirectory: string;
  private staleTimeout: number; // in milliseconds
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    lockDirectory: string = '/tmp/claude_coordination/locks',
    staleTimeout: number = 2 * 60 * 60 * 1000 // 2 hours
  ) {
    this.lockDirectory = lockDirectory;
    this.staleTimeout = staleTimeout;
    this.initialize();
  }

  private async initialize() {
    // Ensure lock directory exists
    await fs.mkdir(this.lockDirectory, { recursive: true });
    
    // Load existing locks from disk
    await this.loadLocks();
    
    // Start periodic cleanup
    this.startCleanupInterval();
  }

  private async loadLocks() {
    try {
      const files = await fs.readdir(this.lockDirectory);
      
      for (const file of files) {
        if (file.endsWith('.lock.json')) {
          try {
            const content = await fs.readFile(path.join(this.lockDirectory, file), 'utf-8');
            const lock = JSON.parse(content) as FileLock;
            
            // Convert string dates back to Date objects
            lock.timestamp = new Date(lock.timestamp);
            lock.expiresAt = new Date(lock.expiresAt);
            
            // Add to in-memory map
            const existing = this.locks.get(lock.filePath) || [];
            existing.push(lock);
            this.locks.set(lock.filePath, existing);
          } catch (error) {
            console.error(`Failed to load lock file ${file}:`, error);
          }
        }
      }
      
      // Clean stale locks on startup
      await this.cleanStaleLocks();
    } catch (error) {
      console.error('Failed to load locks:', error);
    }
  }

  private startCleanupInterval() {
    // Run cleanup every 30 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanStaleLocks().catch(console.error);
    }, 30 * 60 * 1000);
  }

  async acquireLock(
    filePath: string,
    agentId: string,
    workClaimId: string,
    operations: FileOperation[],
    type: 'exclusive' | 'shared' = 'exclusive',
    agentUid?: string
  ): Promise<FileLock | null> {
    // Check if lock can be acquired
    const status = await this.checkLock(filePath);
    
    if (!status.canAcquire) {
      return null;
    }

    // Create new lock
    const lock: FileLock = {
      id: uuidv4(),
      filePath,
      agentId,
      agentUid,
      workClaimId,
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + this.staleTimeout),
      type,
      operations
    };

    // Add to in-memory map
    const existing = this.locks.get(filePath) || [];
    existing.push(lock);
    this.locks.set(filePath, existing);

    // Persist to disk
    await this.saveLock(lock);

    return lock;
  }

  async releaseLock(lockId: string): Promise<boolean> {
    // Find and remove lock
    for (const [filePath, locks] of this.locks.entries()) {
      const index = locks.findIndex(l => l.id === lockId);
      if (index !== -1) {
        locks.splice(index, 1);
        
        // Update map
        if (locks.length === 0) {
          this.locks.delete(filePath);
        } else {
          this.locks.set(filePath, locks);
        }
        
        // Remove from disk
        await this.removeLockFile(lockId);
        
        return true;
      }
    }
    
    return false;
  }

  async checkLock(filePath: string): Promise<LockStatus> {
    const locks = this.locks.get(filePath) || [];
    const activeLocks = locks.filter(lock => !this.isStale(lock));
    
    const conflicts: LockConflict[] = [];
    let canAcquire = true;

    if (activeLocks.length > 0) {
      // Check for exclusive locks
      const exclusiveLocks = activeLocks.filter(l => l.type === 'exclusive');
      
      if (exclusiveLocks.length > 0) {
        canAcquire = false;
        conflicts.push({
          type: 'exclusive_conflict',
          lockId: exclusiveLocks[0].id,
          agentId: exclusiveLocks[0].agentId,
          message: `File is exclusively locked by agent ${exclusiveLocks[0].agentId}`
        });
      }
      
      // Check for stale locks
      const staleLocks = locks.filter(lock => this.isStale(lock));
      staleLocks.forEach(lock => {
        conflicts.push({
          type: 'stale_lock',
          lockId: lock.id,
          agentId: lock.agentId,
          message: `Stale lock detected from agent ${lock.agentId}`
        });
      });
    }

    return {
      isLocked: activeLocks.length > 0,
      locks: activeLocks,
      canAcquire,
      conflicts
    };
  }

  async cleanStaleLocks(): Promise<number> {
    let cleaned = 0;
    
    for (const [filePath, locks] of this.locks.entries()) {
      const staleLocks = locks.filter(lock => this.isStale(lock));
      
      for (const lock of staleLocks) {
        if (await this.releaseLock(lock.id)) {
          cleaned++;
          console.log(`Cleaned stale lock ${lock.id} for ${filePath} from agent ${lock.agentId}`);
        }
      }
    }
    
    return cleaned;
  }

  async getLocksByAgent(agentId: string): Promise<FileLock[]> {
    const agentLocks: FileLock[] = [];
    
    for (const locks of this.locks.values()) {
      agentLocks.push(...locks.filter(lock => lock.agentId === agentId && !this.isStale(lock)));
    }
    
    return agentLocks;
  }

  async releaseAllLocksByAgent(agentId: string): Promise<number> {
    const agentLocks = await this.getLocksByAgent(agentId);
    let released = 0;
    
    for (const lock of agentLocks) {
      if (await this.releaseLock(lock.id)) {
        released++;
      }
    }
    
    return released;
  }

  private isStale(lock: FileLock): boolean {
    return new Date() > new Date(lock.expiresAt);
  }

  private async saveLock(lock: FileLock): Promise<void> {
    const lockFile = path.join(this.lockDirectory, `${lock.id}.lock.json`);
    await fs.writeFile(lockFile, JSON.stringify(lock, null, 2));
  }

  private async removeLockFile(lockId: string): Promise<void> {
    const lockFile = path.join(this.lockDirectory, `${lockId}.lock.json`);
    try {
      await fs.unlink(lockFile);
    } catch (error) {
      // File might not exist
      if (error.code !== 'ENOENT') {
        console.error(`Failed to remove lock file ${lockFile}:`, error);
      }
    }
  }

  getAllLocks(): Map<string, FileLock[]> {
    // Return a copy to prevent external modification
    const copy = new Map<string, FileLock[]>();
    
    for (const [filePath, locks] of this.locks.entries()) {
      copy.set(filePath, locks.filter(lock => !this.isStale(lock)));
    }
    
    return copy;
  }

  async extendLock(lockId: string, additionalTime: number = this.staleTimeout): Promise<boolean> {
    for (const locks of this.locks.values()) {
      const lock = locks.find(l => l.id === lockId);
      if (lock) {
        lock.expiresAt = new Date(Date.now() + additionalTime);
        await this.saveLock(lock);
        return true;
      }
    }
    return false;
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Export singleton instance
export const lockManager = new LockManager();