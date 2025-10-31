/**
 * Types for Farm Archive Feature
 */

export interface AgentMessage {
  id: string;
  agentId: string;
  agentName: string;
  timestamp: Date;
  type: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  metadata?: {
    model?: string;
    tokenCount?: number;
    processingTime?: number;
  };
}

export interface HarvestOutput {
  id: string;
  name: string;
  type: 'file' | 'directory' | 'output' | 'log' | 'artifact';
  path: string;
  content?: string;
  size: number;
  mimeType?: string;
  checksum?: string;
  createdAt: Date;
}

export interface FarmArchiveMetadata {
  agentCount: number;
  executionTimeSeconds: number;
  tokenUsage: number;
  totalCost: number;
  resourceUsage?: {
    cpu: number;
    memory: number;
    storage: number;
  };
  provider?: string;
  model?: string;
  errorCount?: number;
  successRate?: number;
}

export interface ArchivedFarm {
  id: string;
  farmId: string;
  farmName: string;
  farmDescription?: string;
  farmType?: string;

  // Core archive data
  originalPrompt: string;
  farmConfig: Record<string, any>;
  agentMessages: AgentMessage[];
  finalOutputs: Record<string, any>;
  artifacts: HarvestOutput[];
  yieldItems: HarvestOutput[];

  // Metadata
  metadata: FarmArchiveMetadata;
  agentNames: string[];

  // Archive info
  archivedAt: Date;
  archivedBy: string;
  archivedByUsername?: string;
  archiveReason?: string;
  archiveNotes?: string;

  // Categorization
  category?: string;
  subcategory?: string;
  tags: string[];
  keywords: string[];

  // Timestamps
  farmCreatedAt: Date;
  farmCompletedAt?: Date;

  // Usage tracking
  viewCount: number;
  lastViewedAt?: Date;
  exportCount: number;
  lastExportedAt?: Date;

  // Status
  isPublic: boolean;
  isPinned: boolean;
  qualityScore?: number; // 0.00 to 5.00
  currentFarmStatus?: string;
}

export interface ArchivedFarmSummary {
  id: string;
  farmId: string;
  farmName: string;
  farmDescription?: string;
  farmType?: string;
  agentCount: number;
  executionTimeSeconds: number;
  totalCost: number;
  archivedAt: Date;
  archivedBy: string;
  archivedByUsername?: string;
  category?: string;
  tags: string[];
  isPublic: boolean;
  isPinned: boolean;
  qualityScore?: number;
  viewCount: number;
  currentFarmStatus?: string;
}

export interface ArchiveFilter {
  search?: string;
  category?: string;
  tags?: string[];
  archivedBy?: string;
  dateFrom?: Date;
  dateTo?: Date;
  isPublic?: boolean;
  isPinned?: boolean;
  minQualityScore?: number;
  sortBy?: 'archivedAt' | 'farmName' | 'executionTime' | 'cost' | 'viewCount' | 'qualityScore';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface ArchiveExportOptions {
  format: 'json' | 'yaml' | 'pdf' | 'markdown';
  includeMessages?: boolean;
  includeOutputs?: boolean;
  includeMetadata?: boolean;
  includeArtifacts?: boolean;
}

export interface ArchiveStats {
  totalArchived: number;
  totalSize: number; // in bytes
  categoryCounts: Record<string, number>;
  topTags: Array<{ tag: string; count: number }>;
  averageExecutionTime: number;
  averageCost: number;
  mostViewed: ArchivedFarmSummary[];
  recentlyArchived: ArchivedFarmSummary[];
  pinnedArchives: ArchivedFarmSummary[];
}

// API Response types
export interface ArchiveResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ArchiveListResponse extends ArchiveResponse<{
  archives: ArchivedFarmSummary[];
  total: number;
  page: number;
  pageSize: number;
}> {}

export interface ArchiveDetailResponse extends ArchiveResponse<ArchivedFarm> {}

export interface ArchiveStatsResponse extends ArchiveResponse<ArchiveStats> {}

// Actions
export interface ArchiveFarmRequest {
  farmId: string;
  reason?: string;
  notes?: string;
  category?: string;
  tags?: string[];
  isPublic?: boolean;
}

export interface RestoreFarmRequest {
  farmId: string;
  createCopy?: boolean; // If true, creates a new farm instead of restoring the original
}

export interface UpdateArchiveRequest {
  category?: string;
  tags?: string[];
  notes?: string;
  isPublic?: boolean;
  isPinned?: boolean;
  qualityScore?: number;
}