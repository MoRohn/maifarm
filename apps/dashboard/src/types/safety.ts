export interface SafetyBoundary {
  id: string;
  name: string;
  type: 'resource' | 'time' | 'api' | 'filesystem' | 'network';
  enabled: boolean;
  config: BoundaryConfig;
  violations: BoundaryViolation[];
  createdAt: Date;
  updatedAt: Date;
}

export interface BoundaryConfig {
  // Resource boundaries
  maxCpuPercent?: number;
  maxMemoryMB?: number;
  maxDiskIOMBps?: number;
  
  // Time boundaries
  maxDurationMinutes?: number;
  idleTimeoutMinutes?: number;
  
  // API boundaries
  maxApiCallsPerMinute?: number;
  maxTotalApiCalls?: number;
  allowedApiEndpoints?: string[];
  blockedApiEndpoints?: string[];
  
  // Filesystem boundaries
  allowedPaths?: string[];
  blockedPaths?: string[];
  maxFileOperations?: number;
  maxFileSizeMB?: number;
  
  // Network boundaries
  allowedDomains?: string[];
  blockedDomains?: string[];
  maxBandwidthMBps?: number;
  maxConnections?: number;
}

export interface BoundaryViolation {
  id: string;
  boundaryId: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  details: {
    current: number | string;
    limit: number | string;
    message: string;
  };
  action: 'warn' | 'throttle' | 'pause' | 'terminate';
  resolved: boolean;
}

export interface ExplorationSnapshot {
  id: string;
  sessionId: string;
  farmId: string;
  timestamp: Date;
  type: 'automatic' | 'manual' | 'checkpoint';
  state: {
    agents: AgentSnapshot[];
    tasks: TaskSnapshot[];
    resources: ResourceSnapshot;
    discoveries: string[];
    metrics: MetricsSnapshot;
  };
  metadata: {
    reason: string;
    size: number;
    compressed: boolean;
    checksum: string;
  };
}

export interface AgentSnapshot {
  id: string;
  status: string;
  memory: number;
  cpu: number;
  activeTask: string | null;
}

export interface TaskSnapshot {
  id: string;
  type: string;
  status: string;
  progress: number;
  results: any;
}

export interface ResourceSnapshot {
  cpu: number;
  memory: number;
  disk: number;
  network: number;
}

export interface MetricsSnapshot {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  discoveryCount: number;
  explorationDepth: number;
}

export interface RollbackRequest {
  snapshotId: string;
  type: 'full' | 'partial';
  components?: ('agents' | 'tasks' | 'resources' | 'discoveries')[];
  preview: boolean;
  reason: string;
}

export interface RollbackResult {
  id: string;
  snapshotId: string;
  status: 'success' | 'failed' | 'partial';
  startedAt: Date;
  completedAt: Date;
  changes: {
    agents: { added: number; removed: number; modified: number };
    tasks: { cancelled: number; restored: number };
    resources: { released: number; allocated: number };
    discoveries: { preserved: number; removed: number };
  };
  errors?: string[];
}

export interface SafetyMonitor {
  sessionId: string;
  status: 'active' | 'warning' | 'critical' | 'terminated';
  riskScore: number; // 0-100
  boundaries: SafetyBoundary[];
  activeViolations: BoundaryViolation[];
  metrics: {
    violationCount: number;
    warningCount: number;
    autoTerminations: number;
    rollbackCount: number;
  };
  recommendations: SafetyRecommendation[];
}

export interface SafetyRecommendation {
  id: string;
  type: 'boundary_adjustment' | 'resource_optimization' | 'risk_mitigation';
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  actions: {
    label: string;
    action: string;
    params?: any;
  }[];
}

export interface ExplorationHistory {
  sessionId: string;
  snapshots: ExplorationSnapshot[];
  rollbacks: RollbackResult[];
  violations: BoundaryViolation[];
  timeline: ExplorationEvent[];
}

export interface ExplorationEvent {
  id: string;
  timestamp: Date;
  type: 'start' | 'snapshot' | 'violation' | 'rollback' | 'complete' | 'terminate';
  severity: 'info' | 'warning' | 'error';
  title: string;
  description: string;
  metadata?: any;
}

export interface SafetyConfig {
  autoSnapshotInterval: number; // minutes
  maxSnapshotsPerSession: number;
  enableAutoRollback: boolean;
  rollbackThreshold: {
    violationCount: number;
    riskScore: number;
    criticalViolations: number;
  };
  monitoring: {
    checkInterval: number; // seconds
    metricsRetention: number; // hours
    alertChannels: ('ui' | 'email' | 'slack' | 'webhook')[];
  };
}