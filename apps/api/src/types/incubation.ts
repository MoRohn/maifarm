/**
 * Incubation System Types
 * Types for optional farm output evolution system
 */

export type IncubationStatus =
  | 'pending'
  | 'incubating'
  | 'paused'
  | 'stopped'
  | 'completed'
  | 'failed';

export type IncubationControlState = 'running' | 'paused' | 'stopped';

export interface IncubationStage {
  number: number;
  name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  output?: any;
  progress?: number; // 0-100
}

export interface IncubationSession {
  id: string;
  farmId: string;
  harvestId: string;

  // Status
  status: IncubationStatus;
  currentStage: number;
  totalStages: number;

  // Control state
  controlState: IncubationControlState;
  pausedAt?: Date;
  resumedAt?: Date;
  stoppedAt?: Date;
  stoppedReason?: string;

  // User context (optional guidance)
  userContext?: string;
  userId?: string;

  // Inputs and outputs
  originalOutput: any;
  stageOutputs: any[];
  finalOutput?: any;
  incubationLog?: IncubationLog;
  nextSteps?: NextSteps;

  // Stage details
  stageNames: string[];
  stageProgress: IncubationStage[];

  // Agent metadata
  agentId?: string;
  tmuxSessionName?: string;
  orchestratorPid?: number;
  promptUsed?: string;
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };

  // Timing
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;

  // Additional metadata
  metadata?: Record<string, any>;
}

export interface IncubationLog {
  elevated: string[];      // List of enhancements made
  fixed: string[];         // List of issues fixed
  innovated: string[];     // List of innovations added
  removed?: string[];      // List of items removed/simplified
  notes?: string;          // Additional notes
}

export interface NextSteps {
  build: string[];         // Build steps
  test: string[];          // Testing steps
  launch: string[];        // Launch/deployment steps
  techStack?: string[];    // Recommended tech stack
  timeline?: string;       // Estimated timeline
}

export interface IncubationLineage {
  farmId: string;
  farmName: string;
  version: number;
  parentFarmId?: string;
  parentFarmName?: string;
  parentVersion?: number;
  createdAt: Date;
  status: string;
  autoIncubate: boolean;
  ancestorsCount: number;
  incubationLineage: string[];
  childrenCount: number;
}

export interface IncubationStats {
  farmId: string;
  farmName: string;
  incubationVersion: number;
  totalIncubations: number;
  completedIncubations: number;
  failedIncubations: number;
  stoppedIncubations: number;
  avgDurationMs: number;
  lastIncubationAt?: Date;
  incubationHistory: IncubationHistoryItem[];
}

export interface IncubationHistoryItem {
  id: string;
  status: IncubationStatus;
  createdAt: Date;
  durationMs?: number;
  hasUserContext: boolean;
}

export interface IncubationAncestor {
  farmId: string;
  farmName: string;
  version: number;
  createdAt: Date;
  status: string;
  depth: number;
}

export interface StartIncubationInput {
  farmId: string;
  harvestId: string;
  userContext?: string;
  userId?: string;
}

export interface CreateIncubationFarmInput {
  parentFarmId: string;
  userContext?: string;
  userId?: string;
  customPrompt?: string; // Override default incubation prompt
}

export interface IncubationProgressEvent {
  sessionId: string;
  farmId: string;
  stage: number;
  stageName: string;
  progress: number;
  message: string;
  timestamp: Date;
}

export interface IncubationControlEvent {
  sessionId: string;
  farmId: string;
  action: 'pause' | 'resume' | 'stop';
  reason?: string;
  timestamp: Date;
}
