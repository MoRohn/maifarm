export interface HistoricalFarm {
  id: string;
  name: string;
  description: string;
  type: 'debug' | 'build' | 'test' | 'analysis' | 'custom';
  status: 'completed' | 'failed' | 'cancelled' | 'archived';
  createdAt: Date;
  completedAt?: Date;
  duration: number; // minutes
  agents: HistoricalAgent[];
  metrics: FarmMetrics;
  insights?: FarmInsight[];
  tags: string[];
  archived: boolean;
}

export interface HistoricalAgent {
  id: string;
  name: string;
  role: string;
  tasksCompleted: number;
  interactions: number;
  performance: {
    efficiency: number; // 0-100
    accuracy: number; // 0-100
    creativity: number; // 0-100
  };
}

export interface FarmMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgTaskTime: number; // minutes
  totalInteractions: number;
  resourceUsage: {
    cpu: number[]; // time series
    memory: number[]; // time series
    timestamps: Date[];
  };
}

export interface FarmInsight {
  id: string;
  type: 'performance' | 'collaboration' | 'optimization' | 'warning';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  recommendation?: string;
  timestamp: Date;
}

export interface TimelineEvent {
  id: string;
  farmId: string;
  timestamp: Date;
  type: 'task_started' | 'task_completed' | 'agent_added' | 'agent_removed' | 
        'error' | 'milestone' | 'interaction';
  agentId?: string;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface HistoricalFilters {
  search?: string;
  types?: string[];
  statuses?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  tags?: string[];
  archived?: boolean;
  sortBy?: 'date' | 'duration' | 'performance' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export interface BulkAction {
  type: 'archive' | 'unarchive' | 'delete' | 'export' | 'tag';
  farmIds: string[];
  options?: {
    exportFormat?: 'json' | 'csv' | 'pdf';
    tags?: string[];
  };
}

export interface HistoricalStats {
  totalFarms: number;
  averageDuration: number;
  successRate: number;
  topPerformers: {
    farmId: string;
    name: string;
    score: number;
  }[];
  commonPatterns: {
    pattern: string;
    frequency: number;
    impact: 'positive' | 'negative' | 'neutral';
  }[];
}