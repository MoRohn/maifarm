/**
 * Shared farm-related enums and types used across orchestrator and farm services
 * and re-exported for both backend and frontend usage.
 */

import type {
  Agent as SharedAgent,
  AgentStatus,
  TaskStatus as SharedTaskStatus
} from '../../../shared/types/unified';

export const FarmMode = {
  HARVEST: 'harvest',
  QUICK_TASK: 'quick_task',
  GO_WILD: 'go_wild',
  COLLABORATIVE: 'collaborative',
  SEQUENTIAL: 'sequential',
  AUTONOMOUS: 'autonomous'
} as const;

export type FarmMode = typeof FarmMode[keyof typeof FarmMode];

export const FarmStatus = {
  IDLE: 'idle',
  LAUNCHING: 'launching',
  ACTIVE: 'active',
  RUNNING: 'running',
  PAUSED: 'paused',
  HARVESTING: 'harvesting',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CRASHED: 'crashed',
  TERMINATED: 'terminated',
  STOPPED: 'stopped',
  STALE: 'stale',
  RECOVERING: 'recovering',
  ORPHANED: 'orphaned'
} as const;

export type FarmStatus = typeof FarmStatus[keyof typeof FarmStatus];

// CRITICAL FIX: Added 'grok' to FarmProvider type
export type FarmProvider = 'claude' | 'openai' | 'grok' | 'gpt-oss' | 'llama' | 'ollama';

export type Agent = SharedAgent;
export type TaskStatus = SharedTaskStatus;
export type { AgentStatus };

export interface FarmMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  duration: number;
  efficiency: number;
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
  [key: string]: any;
}

export interface FarmConfig {
  id?: string;
  name: string;
  description: string;
  mode: FarmMode;
  provider: FarmProvider;
  numberOfAgents: number;
  prompt: string;
  yamlContent?: string;
  timeout?: number;
  autoScale?: boolean;
  retryPolicy?: {
    enabled?: boolean;
    maxRetries?: number;
    backoffMultiplier?: number;
  };
  goWildMode?: {
    enabled?: boolean;
    creativityLevel?: number;
    boundaries?: string[];
  };
  userId?: string;
  farmerTemplateId?: string;
  farmerTemplateName?: string;
  contextFiles?: string[];
  barnReferences?: string[];
  staggerDelay?: number;
  debug?: boolean;
  orchestratorType?: 'xenosync' | 'maifarm';
  attachedFiles?: string[];
  metadata?: Record<string, any>;
  // Seeds context injection (Feature A: Seeds can Seed a Farm)
  appliedSeedIds?: string[];
  seedsTextSnapshot?: string;
  [key: string]: any;
}

export interface Farm {
  id: string;
  name: string;
  description?: string;
  mode: FarmMode;
  status: FarmStatus;
  provider?: FarmProvider;
  agents: Agent[] | string[];
  sessionName?: string;
  tmuxSession?: string;
  tmuxWindow?: string;
  workspacePath?: string;
  harvestId?: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  config?: Record<string, any>;
  metrics?: FarmMetrics;
  metadata?: Record<string, any>;

  // Incubation fields
  autoIncubate?: boolean;
  parentFarmId?: string;
  incubationVersion?: number;
  incubationLineage?: string[];

  // Seeds context injection (Feature A: Seeds can Seed a Farm)
  appliedSeedIds?: string[];
  appliedSeedTextSnapshot?: string;
}

export interface FarmCreateInput {
  name: string;
  description?: string;
  mode?: FarmMode | string;
  prompt?: string;
  provider?: FarmProvider;
  numberOfAgents?: number;
  config?: Record<string, any>;
  contextFiles?: any[];
  attachedFiles?: string[];
  barnReferences?: string[];
  userId?: string;
  farmerTemplateId?: string;
  farmerTemplateName?: string;
  metadata?: Record<string, any>;

  // Incubation fields
  autoIncubate?: boolean;
  parentFarmId?: string;
  incubationVersion?: number;

  // Seeds context injection (Feature A: Seeds can Seed a Farm)
  appliedSeedIds?: string[];

  [key: string]: any;
}

export type FarmUpdateInput = Partial<FarmCreateInput> & { id?: string };
