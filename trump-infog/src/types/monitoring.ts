export interface InfogSocketEvents {
  // Agent lifecycle events
  'agent:initialized': { agentId: string; agentType: string; capabilities: string[]; timestamp: string };
  'agent:ready': { agentId: string };
  'agent:status': { agentId: string; status: string; timestamp: string };
  'agent:progress': { agentId: string; stage: string; progress: number; message?: string };
  'agent:error': { agentId: string; stage: string; error: string; recoverable: boolean };
  'agent:shutdown': { agentId: string; reason: string };
  'agent:heartbeat': void;

  // Data collection events
  'data:collection_started': { agentId: string; sources: string[]; keywords: string[]; timestamp: string };
  'data:article_discovered': { agentId: string; article: { source: string; title: string; url: string }; timestamp: string };
  'data:feed_processed': { agentId: string; feedUrl: string; itemCount: number; timestamp: string };
  'data:duplicates_found': { agentId: string; duplicateCount: number; timestamp: string };
  'data:validation_update': { agentId: string; progress: number; validated: number; total: number };
  'data:collected': { articleCount: number; timestamp: string };
  'data:validated': { validCount: number; invalidCount: number };

  // Content analysis events
  'analysis:initiated': { agentId: string; articleCount: number; techniques: string[]; timestamp: string };
  'analysis:theme_extracted': { agentId: string; theme: string; frequency: number; sentiment: number; timestamp: string };
  'analysis:entity_recognized': { agentId: string; entity: string; entityType: string; mentionCount: number; timestamp: string };
  'analysis:sentiment_analyzed': { agentId: string; sentimentData: any; timestamp: string };
  'analysis:progress_update': { agentId: string; progress: number; currentPhase: string; analyzed: number; total: number };
  'analysis:complete': { themes: string[]; sentimentScore: number };

  // Design generation events
  'design:initiated': { agentId: string; templateType: string; dataPoints: number; timestamp: string };
  'design:template_chosen': { agentId: string; templateId: string; templateName: string; timestamp: string };
  'design:visualization_created': { agentId: string; chartType: string; dataSeriesCount: number; timestamp: string };
  'design:styling_applied': { agentId: string; colorScheme: any; timestamp: string };
  'design:progress_update': { agentId: string; progress: number; elementsCreated: number; totalElements: number };
  'design:created': { templateId: string; elementsCount: number };

  // Output assembly events
  'assembly:initiated': { agentId: string; targetFormats: string[]; resolution: string; timestamp: string };
  'assembly:render_progress': { agentId: string; format: string; renderProgress: number; timestamp: string };
  'assembly:format_ready': { agentId: string; format: string; fileSize: number; filePath: string; timestamp: string };
  'assembly:quality_validated': { agentId: string; format: string; qualityPassed: boolean; issues: string[]; timestamp: string };
  'assembly:progress_update': { agentId: string; progress: number; currentFormat: string; completed: number; total: number };
  'assembly:complete': { formats: string[]; fileSize: number };

  // Pipeline events
  'pipeline:update': { stage: string; status: string; progress: number; timestamp: string };
  'pipeline:stage_complete': { stage: string; nextStage: string };
  'pipeline:warning': { agentId: string; stage: string; message: string };
  'pipeline:error': { agentId: string; stage: string; error: string };

  // Coordination events
  'work:claimed': { agentId: string; workId: string; description: string; timestamp: string };
  'work:completed': { agentId: string; workId: string; outputs: string[]; timestamp: string };
  'coord:data_requested': { requestingAgent: string; dataType: string; timestamp: string };
  'coord:data_received': { fromAgent: string; dataType: string; payload: any; timestamp: string };
  'coord:agent_stage_ready': { agentId: string; stage: string; ready: boolean; timestamp: string };
  'coord:help_needed': { agentId: string; issue: string; severity: 'low' | 'medium' | 'high'; timestamp: string };

  // Project events
  'infograph:data_ready': any;
  'infograph:analysis_complete': any;
  'infograph:design_ready': any;
  'infograph:assembly_complete': any;
  'infograph:complete': { timestamp: string; outputs: string[]; totalSize: number };

  // Health and monitoring
  'health:update': { connectedAgents: string[]; totalConnections: number; healthStatus: any; timestamp: string };
  'state:sync': any;
}

export interface AgentStatus {
  agentId: string;
  status: 'initializing' | 'idle' | 'ready' | 'working' | 'error' | 'shutdown' | 'disconnected';
  currentTask?: string;
  progress?: number;
  lastUpdate: string;
}

export interface PipelineStage {
  name: string;
  status: 'pending' | 'in_progress' | 'complete' | 'error';
  progress: number;
  startTime?: string;
  endTime?: string;
  outputs?: string[];
  error?: string;
}

export interface MonitoringMetrics {
  // Agent metrics
  agentHealth: {
    [agentId: string]: {
      cpu: number;
      memory: number;
      taskCompletionRate: number;
      errorRate: number;
      avgResponseTime: number;
    };
  };
  
  // Pipeline metrics
  pipelineMetrics: {
    stageDurations: { [stage: string]: number };
    queueDepth: number;
    throughput: number;
    successRate: number;
    avgCompletionTime: number;
  };
  
  // Quality metrics
  qualityMetrics: {
    dataAccuracy: number;
    designQualityScore: number;
    outputCompleteness: number;
    validationPassRate: number;
  };
  
  // System metrics
  systemMetrics: {
    totalConnections: number;
    activeAgents: number;
    cpuUsage: number;
    memoryUsage: number;
    networkLatency: number;
  };
}

export interface ConnectionState {
  status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
  reconnectAttempts: number;
  lastConnected?: string;
  lastError?: string;
  latency?: number;
}

export interface InfographProject {
  id: string;
  name: string;
  status: 'initializing' | 'collecting' | 'analyzing' | 'designing' | 'assembling' | 'complete' | 'error';
  created: string;
  updated: string;
  pipeline: {
    dataCollection: PipelineStage;
    contentAnalysis: PipelineStage;
    designGeneration: PipelineStage;
    outputAssembly: PipelineStage;
  };
  agents: AgentStatus[];
  outputs?: {
    formats: string[];
    files: { [format: string]: string };
    metadata: any;
  };
}

export interface MonitoringState {
  project: InfographProject | null;
  agents: { [agentId: string]: AgentStatus };
  metrics: MonitoringMetrics;
  connectionState: ConnectionState;
  logs: LogEntry[];
  alerts: Alert[];
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
  metadata?: any;
}

export interface Alert {
  id: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'agent' | 'pipeline' | 'system' | 'quality';
  title: string;
  message: string;
  resolved: boolean;
  resolvedAt?: string;
}