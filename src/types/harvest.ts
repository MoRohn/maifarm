// Harvest type definitions for MaiFarm

export interface Harvest {
  id: string;
  farmId: string;
  farmName: string;
  name: string; // Name of the harvest
  description: string; // Description of the harvest
  type: 'app' | 'tool' | 'script' | 'workflow' | 'other'; // Type of harvest
  status: 'processing' | 'ready' | 'archived' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  useCount: number; // Number of times this harvest has been used
  
  // Summary of the farm's work
  summary: {
    description: string;
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    duration: number; // in seconds
    efficiency: number; // percentage
    agents?: any[]; // Agent data for the harvest
  };
  
  // Farm configuration used for this harvest
  farmConfig?: any; // Original farm configuration
  
  // Aggregated results from all agents
  results: HarvestResult[];
  
  // Key insights and findings
  insights: HarvestInsight[];
  
  // Artifacts produced (files, reports, etc.)
  artifacts: HarvestArtifact[];
  
  // Quality metrics
  quality: {
    completeness: number; // 0-100
    accuracy: number; // 0-100
    relevance: number; // 0-100
    overallScore: number; // 0-100
  };
  
  // Tags for categorization
  tags: string[];
  
  // Export options
  exportFormats: ('json' | 'pdf' | 'markdown' | 'csv')[];
}

export interface HarvestResult {
  id: string;
  agentId: string;
  agentName: string;
  agentType: string;
  taskType: string;
  content: string;
  metadata: Record<string, any>;
  timestamp: Date;
  processingTime: number; // in seconds
  success: boolean;
  error?: string;
}

export interface HarvestInsight {
  id: string;
  type: 'discovery' | 'pattern' | 'recommendation' | 'warning' | 'summary';
  title: string;
  description: string;
  importance: 'low' | 'medium' | 'high' | 'critical';
  source: {
    agentId?: string;
    agentName?: string;
    taskId?: string;
  };
  relatedResults: string[]; // IDs of related HarvestResults
  timestamp: Date;
}

export interface HarvestArtifact {
  id: string;
  type: 'file' | 'report' | 'code' | 'documentation' | 'data' | 'model';
  name: string;
  description: string;
  mimeType: string;
  size: number; // in bytes
  location: string; // file path or URL
  checksum: string;
  createdBy: {
    agentId: string;
    agentName: string;
  };
  createdAt: Date;
  metadata: Record<string, any>;
}

export interface HarvestFilter {
  farmId?: string;
  status?: Harvest['status'][];
  tags?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  qualityThreshold?: number;
  searchQuery?: string;
}

export interface HarvestExport {
  harvestId: string;
  format: 'json' | 'pdf' | 'markdown' | 'csv';
  includeResults?: boolean;
  includeInsights?: boolean;
  includeArtifacts?: boolean;
  customTemplate?: string;
}

export interface HarvestSummary {
  id: string;
  farmName: string;
  completedAt: Date;
  totalTasks: number;
  successRate: number;
  overallQuality: number;
  topInsights: HarvestInsight[];
  artifactCount: number;
  tags: string[];
}