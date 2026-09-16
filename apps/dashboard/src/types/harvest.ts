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
  startedAt?: Date | null;
  completedAt?: Date | null;
  useCount: number; // Number of times this harvest has been used
  
  // Summary of the farm's work
  summary: {
    description: string;
    totalFiles?: number;           // New: Total files to generate
    filesGenerated?: number;       // New: Files successfully generated
    filesFailed?: number;          // New: Files that failed to generate
    totalTasks: number;           // Legacy: Keep for compatibility
    completedTasks: number;       // Legacy: Maps to filesGenerated
    failedTasks: number;          // Legacy: Maps to filesFailed
    duration: number; // in seconds
    efficiency: number; // percentage
    agents?: any[]; // Agent data for the harvest
    fileCategories?: {            // New: Breakdown by file type
      text: number;
      code: number;
      image: number;
      data: number;
      config: number;
      other: number;
    };
  };
  
  // Farm configuration used for this harvest
  farmConfig?: any; // Original farm configuration
  
  // Aggregated results from all agents
  results: HarvestResult[];
  
  // Key insights and findings
  insights: HarvestInsight[];
  
  // Yield produced (files, reports, etc.)
  yield: HarvestYield[];
  artifacts?: HarvestYield[]; // Legacy alias from older API responses
  
  // Quality metrics
  quality: {
    completeness: number; // 0-100
    accuracy: number; // 0-100
    relevance: number; // 0-100
    overallScore: number; // 0-100
  };
  
  // Tags for categorization
  tags: string[];
  
  // Farmer template information (if created from a template)
  farmerTemplateId?: string;
  farmerTemplateName?: string;
  
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
  type?: 'discovery' | 'pattern' | 'recommendation' | 'warning' | 'summary';
  title?: string;
  description?: string;
  content?: string;
  importance?: 'low' | 'medium' | 'high' | 'critical';
  source?: {
    agentId?: string;
    agentName?: string;
    taskId?: string;
  };
  relatedResults?: string[]; // IDs of related HarvestResults
  timestamp: Date;
}

export interface HarvestYield {
  id: string;
  type: 'file' | 'report' | 'code' | 'documentation' | 'data' | 'model' | 'farm-output';
  name: string;
  description: string;
  mimeType?: string;
  size?: number; // in bytes
  location?: string; // file path or URL
  checksum?: string;
  data?: any; // Actual content data (for virtual files)
  createdBy?: {
    agentId: string;
    agentName: string;
  };
  createdAt?: Date;
  metadata?: Record<string, any>;
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
  includeYield?: boolean;
  includeArtifacts?: boolean; // Legacy support - maps to includeYield
  includeMetrics?: boolean;
  customTemplate?: string;
  template?: string;
}

export interface HarvestSummary {
  id: string;
  farmName: string;
  completedAt: Date;
  totalFiles?: number;          // New: Primary metric
  filesGenerated?: number;      // New: Files successfully created
  totalTasks?: number;          // Legacy: Keep for compatibility
  successRate?: number;         // Now based on farm success, not task completion
  overallQuality?: number;
  qualityScore?: number;
  artifactCount?: number;
  topInsights?: HarvestInsight[];
  yieldCount?: number;
  tags?: string[];
  farmerTemplateId?: string;
  farmerTemplateName?: string;
}
