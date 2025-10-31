/**
 * Work Claim Types
 * Types for distributed work coordination and locking system
 */

export interface WorkClaim {
  id: string;
  agentId: string;
  agentUid?: string;
  timestamp: Date;
  type: 'file' | 'task' | 'feature' | 'test' | 'documentation';
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'planned' | 'claimed' | 'in_progress' | 'completed' | 'failed' | 'conflict';
  
  // Work details
  description: string;
  files: string[];
  dependencies?: string[]; // Other work claim IDs this depends on
  
  // Timing
  estimatedDuration?: number; // in minutes
  startTime?: Date;
  completionTime?: Date;
  
  // Conflict resolution
  conflictsWith?: string[]; // Other claim IDs that conflict
  resolution?: ConflictResolution;
}

export interface FileLock {
  id: string;
  filePath: string;
  agentId: string;
  agentUid?: string;
  workClaimId: string;
  timestamp: Date;
  expiresAt: Date;
  type: 'exclusive' | 'shared';
  operations: FileOperation[];
}

export type FileOperation = 'read' | 'write' | 'create' | 'delete' | 'rename';

export interface LockStatus {
  isLocked: boolean;
  locks: FileLock[];
  canAcquire: boolean;
  conflicts: LockConflict[];
}

export interface LockConflict {
  type: 'file_locked' | 'stale_lock' | 'exclusive_conflict';
  lockId: string;
  agentId: string;
  message: string;
}

export interface ConflictResolution {
  type: 'wait' | 'collaborate' | 'split' | 'override' | 'merge';
  strategy?: string;
  assignedTo?: string[];
  resolvedAt?: Date;
}

export interface PlannedWork {
  id: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  requiredFiles: string[];
  estimatedAgents: number;
  dependencies?: string[];
  tags?: string[];
  createdAt: Date;
  assignedAt?: Date;
  assignedTo?: string[];
}

export interface WorkQueue {
  pending: PlannedWork[];
  assigned: PlannedWork[];
  completed: string[]; // Work IDs
}

export interface ClaimResult {
  success: boolean;
  claim?: WorkClaim;
  locks?: FileLock[];
  conflicts?: LockConflict[];
  message: string;
}

export interface WorkCoordinationState {
  activeClaims: Map<string, WorkClaim>;
  fileLocks: Map<string, FileLock[]>;
  workQueue: WorkQueue;
  agentWorkload: Map<string, number>; // Agent ID -> number of active claims
  lastCleanup: Date;
}

export interface WorkCoordinationMetrics {
  totalClaims: number;
  activeClaims: number;
  completedClaims: number;
  failedClaims: number;
  conflicts: number;
  averageCompletionTime: number;
  locksHeld: number;
  staleLocks: number;
}

export interface AgentWorkProfile {
  agentId: string;
  agentUid?: string;
  activeClaims: WorkClaim[];
  completedWork: string[]; // Claim IDs
  filesLocked: string[];
  lastActivity: Date;
  metrics: {
    claimsCompleted: number;
    averageCompletionTime: number;
    conflictsEncountered: number;
    successRate: number;
  };
}