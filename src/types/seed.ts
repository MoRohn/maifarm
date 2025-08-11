export interface Seed {
  id: string;
  name: string;
  description: string;
  yaml: string;
  farmType: 'sequential' | 'collaborative' | 'autonomous';
  category: string;
  tags: string[];
  usage: {
    count: number;
    lastUsed?: Date;
    successRate: number;
  };
  metadata: {
    agentCount: number;
    estimatedDuration?: number;
    requiredCapabilities: string[];
  };
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  isPublic: boolean;
  isOfficial: boolean;
  // New fields for harvest integration
  harvestId?: string;
  sourceType?: 'manual' | 'harvest_completion' | 'barn_harvest' | 'template';
  additionalPrompt?: string;
  barnData?: {
    harvestId: string;
    farmName: string;
    yield: any[];
    results: any[];
    insights: any[];
    quality: any;
    summary: any;
    originalDescription: string;
  };
}

export interface SeedCreateInput {
  name: string;
  description: string;
  yaml: string;
  farmType: 'sequential' | 'collaborative' | 'autonomous';
  category?: string;
  tags?: string[];
  isPublic?: boolean;
  visibility?: 'public' | 'private' | 'team';
  config?: Record<string, any>;
  // New fields for harvest integration
  additionalPrompt?: string;
  harvestId?: string;
  sourceType?: 'manual' | 'harvest_completion' | 'barn_harvest' | 'template';
}

// New interface for creating seeds from harvests
export interface SeedFromHarvestInput {
  name: string;
  description?: string;
  additionalPrompt?: string;
  category?: string;
  tags?: string[];
  isPublic?: boolean;
}

// Enhanced seed with harvest information
export interface SeedWithHarvestInfo extends Seed {
  harvestInfo?: {
    harvestId: string;
    harvestName: string;
    farmName: string;
    harvestType: string;
    harvestCreatedAt: Date;
    barnData: any;
  };
}

export interface SeedUpdateInput {
  name?: string;
  description?: string;
  yaml?: string;
  category?: string;
  tags?: string[];
  isPublic?: boolean;
}

export interface SeedCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  seedCount: number;
}

export interface SeedFilter {
  category?: string;
  farmType?: string;
  tags?: string[];
  search?: string;
  isPublic?: boolean;
  isOfficial?: boolean;
  sourceType?: 'manual' | 'harvest_completion' | 'barn_harvest' | 'template';
  harvestDerived?: boolean;
  sortBy?: 'name' | 'usage' | 'createdAt' | 'successRate';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}