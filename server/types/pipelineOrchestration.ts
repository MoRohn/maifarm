/**
 * Type definitions for Pipeline Orchestration system
 */

export interface PipelinePhase {
  id: string;
  name: string;
  agentId?: string;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'skipped';
  dependencies: string[];
  timeout?: number;
  retryCount?: number;
  maxRetries?: number;
  startTime?: Date;
  endTime?: Date;
  error?: string;
  progress?: number;
  outputs?: Record<string, any>;
}

export interface Pipeline {
  id: string;
  name: string;
  type: string;
  status: 'initializing' | 'running' | 'completed' | 'failed' | 'paused';
  phases: PipelinePhase[];
  config: PipelineConfig;
  startTime?: Date;
  endTime?: Date;
  progress: number;
  metrics: PipelineMetrics;
  sharedState: Record<string, any>;
  coordinationPath: string;
}

export interface PipelineConfig {
  maxConcurrentPhases?: number;
  timeout?: number;
  retryPolicy?: 'none' | 'individual' | 'pipeline';
  failureMode?: 'stop' | 'continue' | 'retry';
  coordination?: 'sequential' | 'parallel' | 'hybrid';
}

export interface PipelineMetrics {
  totalPhases: number;
  completedPhases: number;
  failedPhases: number;
  avgPhaseTime: number;
  successRate: number;
}

export interface PipelineEvent {
  pipelineId: string;
  phaseId?: string;
  agentId?: string;
  type: 'phase:started' | 'phase:completed' | 'phase:failed' | 'pipeline:completed' | 'pipeline:failed' | 'agent:assigned';
  data: any;
  timestamp: Date;
  source: string;
}

export interface PipelineCreateConfig {
  name: string;
  type: string;
  phases: Omit<PipelinePhase, 'id' | 'status'>[];
  config?: PipelineConfig;
  coordinationPath?: string;
}

export interface SystemConfig {
  id: string;
  name: string;
  type: 'pipeline' | 'service' | 'external';
  coordinationPath: string;
  eventMappings: Record<string, string>;
  stateSchema: Record<string, any>;
  healthEndpoint?: string;
  apiEndpoints?: Record<string, string>;
}

export interface SystemState {
  systemId: string;
  status: 'active' | 'inactive' | 'error' | 'maintenance';
  lastHeartbeat: Date;
  version: string;
  capabilities: string[];
  activeConnections: number;
  metrics: SystemMetrics;
}

export interface SystemMetrics {
  messagesProcessed: number;
  messagesFailed: number;
  avgProcessingTime: number;
  lastSuccessfulOperation: Date;
}

export interface CrossSystemMessage {
  id: string;
  sourceSystem: string;
  targetSystem: string;
  eventType: string;
  data: any;
  timestamp: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
  retryCount?: number;
  maxRetries?: number;
}

export interface PipelineFilters {
  types?: string[];
  statuses?: string[];
  systems?: string[];
}

export interface MonitoringData {
  pipeline: {
    id: string;
    name: string;
    status: string;
    progress: number;
    startTime?: Date;
    endTime?: Date;
  };
  phases: {
    id: string;
    name: string;
    status: string;
    progress: number;
    agentId?: string;
    startTime?: Date;
    endTime?: Date;
    error?: string;
  }[];
  metrics: PipelineMetrics;
  realTimeStats: {
    activePhases: number;
    completedPhases: number;
    failedPhases: number;
    estimatedTimeRemaining: number;
  };
}

export interface TrumpInfogConfig {
  agentCount?: number;
  sources?: string[];
  outputFormats?: string[];
  qualityThresholds?: {
    contentAccuracy?: number;
    designConsistency?: number;
    processingSpeed?: number;
  };
}

export interface TrumpInfogPhaseData {
  dataCollection?: {
    articlesCollected: number;
    sources: string[];
    timestamp: Date;
    processingTime: number;
    successRate: number;
  };
  contentAnalysis?: {
    themes: string[];
    sentiment: Record<string, number>;
    entities: string[];
    statistics: Record<string, any>;
  };
  designGeneration?: {
    templates: string[];
    visualizations: string[];
    assets: string[];
  };
  outputAssembly?: {
    formats: string[];
    files: string[];
    qualityMetrics: Record<string, number>;
  };
}

export interface IntegrationMetrics {
  registeredSystems: number;
  activeSystems: number;
  inactiveSystems: number;
  errorSystems: number;
  totalMessagesProcessed: number;
  totalMessagesFailed: number;
  queueStatus: {
    length: number;
    processing: number;
    byPriority: Record<string, number>;
  };
  avgProcessingTime: number;
}

export interface ConnectionStats {
  totalConnections: number;
  pipelineSubscriptions: {
    pipelineId: string;
    subscribers: number;
  }[];
  systemSubscriptions: {
    systemId: string;
    subscribers: number;
  }[];
}

// Event type definitions for WebSocket communication
export interface PipelineWebSocketEvents {
  // Subscription events
  'pipeline:subscribe': (pipelineId: string) => void;
  'pipeline:unsubscribe': (pipelineId: string) => void;
  'pipeline:subscribe:all': (filters?: PipelineFilters) => void;
  'pipeline:unsubscribe:all': () => void;

  // System events
  'system:subscribe': (systemId: string) => void;
  'system:unsubscribe': (systemId: string) => void;

  // Control events
  'pipeline:create': (config: PipelineCreateConfig, callback: (result: { success: boolean; pipelineId?: string; error?: string }) => void) => void;
  'pipeline:start': (pipelineId: string, callback: (result: { success: boolean; error?: string }) => void) => void;
  'pipeline:pause': (pipelineId: string, callback: (result: { success: boolean; error?: string }) => void) => void;
  'pipeline:resume': (pipelineId: string, callback: (result: { success: boolean; error?: string }) => void) => void;
  'pipeline:cancel': (pipelineId: string, callback: (result: { success: boolean; error?: string }) => void) => void;

  // Query events
  'pipeline:get': (pipelineId: string, callback: (result: { success: boolean; data?: Pipeline; error?: string }) => void) => void;
  'pipeline:list': (filters: PipelineFilters, callback: (result: { success: boolean; data?: Pipeline[]; error?: string }) => void) => void;
  'pipeline:metrics': (callback: (result: { success: boolean; data?: any; error?: string }) => void) => void;

  // Trump Infog specific events
  'trump-infog:subscribe': () => void;
  'trump-infog:unsubscribe': () => void;
  'trump-infog:trigger': (config: TrumpInfogConfig, callback: (result: { success: boolean; pipelineId?: string; error?: string }) => void) => void;

  // Monitoring events
  'monitor:pipeline:subscribe': (pipelineId: string) => void;
  'monitor:system:subscribe': (systemId: string) => void;

  // Integration events
  'integration:metrics': (callback: (result: { success: boolean; data?: IntegrationMetrics; error?: string }) => void) => void;
  'system:status': (systemId: string, callback: (result: { success: boolean; data?: SystemState; error?: string }) => void) => void;
  'system:trigger-sync': (systemId: string, callback: (result: { success: boolean; error?: string }) => void) => void;
}

// Outgoing WebSocket event types
export interface PipelineWebSocketOutgoingEvents {
  // Pipeline state events
  'pipeline:state': (data: { event: string; data: Pipeline; timestamp: Date; source: string }) => void;
  'pipeline:created': (data: { event: string; data: any; timestamp: Date; source: string }) => void;
  'pipeline:list': (data: { event: string; data: Pipeline[]; timestamp: Date; source: string }) => void;

  // Phase events
  'phase:started': (data: { event: string; data: any; timestamp: Date; source: string }) => void;
  'phase:completed': (data: { event: string; data: any; timestamp: Date; source: string }) => void;
  'phase:failed': (data: { event: string; data: any; timestamp: Date; source: string }) => void;

  // System events
  'system:state': (data: { event: string; data: SystemState; timestamp: Date; source: string }) => void;
  'system:health:changed': (data: { event: string; data: any; timestamp: Date; source: string }) => void;

  // Monitoring events
  'pipeline:monitoring': (data: { event: string; data: MonitoringData; timestamp: Date; source: string }) => void;
  'pipeline:monitoring:update': (data: { event: string; data: any; timestamp: Date; source: string }) => void;
  'system:monitoring': (data: { event: string; data: any; timestamp: Date; source: string }) => void;
  'system:monitoring:update': (data: { event: string; data: any; timestamp: Date; source: string }) => void;

  // Trump Infog events
  'trump-infog:pipelines': (data: { event: string; data: Pipeline[]; timestamp: Date; source: string }) => void;
  'trump-infog:triggered': (data: { event: string; data: any; timestamp: Date; source: string }) => void;
  'trump-infog:event': (data: { event: string; data: any; timestamp: Date; source: string }) => void;

  // Cross-system events
  'cross-system:event': (data: { event: string; data: any; timestamp: Date; source: string }) => void;
  'integration:message:processed': (data: { event: string; data: any; timestamp: Date; source: string }) => void;
}

// Error types
export class PipelineError extends Error {
  constructor(
    message: string,
    public code: string,
    public pipelineId?: string,
    public phaseId?: string
  ) {
    super(message);
    this.name = 'PipelineError';
  }
}

export class SystemIntegrationError extends Error {
  constructor(
    message: string,
    public code: string,
    public systemId?: string
  ) {
    super(message);
    this.name = 'SystemIntegrationError';
  }
}

// Utility types
export type PipelineStatus = Pipeline['status'];
export type PhaseStatus = PipelinePhase['status'];
export type SystemStatus = SystemState['status'];
export type MessagePriority = CrossSystemMessage['priority'];

// Type guards
export function isPipelineEvent(event: any): event is PipelineEvent {
  return event && 
    typeof event.pipelineId === 'string' &&
    typeof event.type === 'string' &&
    event.timestamp instanceof Date;
}

export function isSystemConfig(config: any): config is SystemConfig {
  return config &&
    typeof config.id === 'string' &&
    typeof config.name === 'string' &&
    typeof config.coordinationPath === 'string';
}

export function isCrossSystemMessage(message: any): message is CrossSystemMessage {
  return message &&
    typeof message.id === 'string' &&
    typeof message.sourceSystem === 'string' &&
    typeof message.targetSystem === 'string' &&
    typeof message.eventType === 'string';
}