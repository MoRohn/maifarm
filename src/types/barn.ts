export interface BarnItem {
  id: string;
  harvestId: string;
  farmId: string;
  farmName: string;
  name: string;
  description: string;
  type: 'app' | 'tool' | 'script' | 'workflow' | 'other';
  category: string;
  tags: string[];
  artifacts: BarnArtifact[];
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
}

export interface BarnArtifact {
  id: string;
  name: string;
  type: 'file' | 'directory' | 'output' | 'log';
  path: string;
  content?: string; // For small files
  size: number;
  mimeType?: string;
  checksum?: string;
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
  totalItems: number;
  totalHarvests: number; // Alias for totalItems
  itemsByType: Record<string, number>;
  harvestsByType: Record<string, number>; // Alias for itemsByType
  totalStorage: number; // in bytes
  mostUsedItems: Array<{
    id: string;
    name: string;
    useCount: number;
  }>;
  mostUsedHarvests: Array<{
    id: string;
    name: string;
    useCount: number;
  }>; // Alias for mostUsedItems
  recentItems: BarnItem[];
  recentHarvests: BarnItem[]; // Alias for recentItems
}

// Type alias for backward compatibility
export type Harvest = BarnItem;