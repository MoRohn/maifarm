export interface BarnItem {
  id: string;
  harvestId: string;
  farmId: string;
  farmName: string;
  name: string;
  description: string;
  summary?: string; // Optional summary property for NewHarvestSpotlight
  type: 'app' | 'tool' | 'script' | 'workflow' | 'other';
  category: string;
  tags: string[];
  artifacts: BarnArtifact[];
  yield: BarnArtifact[]; // Alias for artifacts for compatibility with harvest components
  config: {
    yaml?: string;
    env?: Record<string, string>;
    dependencies?: string[];
    runtime?: string;
    entryPoint?: string;
  };
  metadata: {
    agentCount: number;
    taskCount: number;
    duration: number; // in seconds
    successRate: number;
    resourceUsage?: {
      cpu: number;
      memory: number;
    };
  };
  parentItemId?: string; // For versioning
  version: string;
  status: 'draft' | 'saved' | 'archived';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
  useCount: number;
  farmerTemplateId?: string;
  farmerTemplateName?: string;
}

export interface BarnArtifact {
  id: string;
  name: string;
  type: 'file' | 'directory' | 'output' | 'log';
  path: string;
  location: string; // Alias for path for compatibility
  content?: string; // For small files
  size: number;
  mimeType?: string;
  checksum?: string;
  description?: string; // Added for harvest compatibility
  createdAt?: Date; // Added for harvest compatibility
  metadata?: Record<string, any>; // Added for harvest compatibility
}

export interface BarnFolder {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  harvestIds: string[];
  subFolderIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface BarnStats {
  totalItems?: number;
  totalHarvests?: number; // Alias for totalItems
  itemsByType?: Record<string, number>;
  harvestsByType?: Record<string, number>; // Alias for itemsByType
  byType?: Record<string, number>; // Alternative API response format
  totalStorage?: number; // in bytes
  totalSize?: number; // Alternative API response format (in bytes)
  mostUsedItems?: Array<{
    id: string;
    name: string;
    useCount: number;
  }>;
  mostUsedHarvests?: Array<{
    id: string;
    name: string;
    useCount: number;
  }>; // Alias for mostUsedItems
  mostAccessed?: BarnItem; // Alternative API response format (single item)
  recentItems?: BarnItem[];
  recentHarvests?: BarnItem[]; // Alias for recentItems
  mostRecent?: BarnItem; // Alternative API response format (single item)
  publicItems?: number;
  privateItems?: number;
}

// Type alias for backward compatibility
export type Harvest = BarnItem;