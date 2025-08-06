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
  sortBy?: 'name' | 'usage' | 'createdAt' | 'successRate';
  sortOrder?: 'asc' | 'desc';
}