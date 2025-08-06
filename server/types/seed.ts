export interface Seed {
  id: string;
  name: string;
  description: string;
  yaml: string;
  farmType: 'sequential' | 'collaborative' | 'autonomous';
  category: string;
  tags: string[];
  usageCount: number;
  lastUsedAt?: Date;
  successRate: number;
  agentCount: number;
  estimatedDuration?: number;
  requiredCapabilities: string[];
  createdAt: Date;
  updatedAt: Date;
  userId: string;
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
  userId: string;
}

export interface SeedUpdateInput {
  name?: string;
  description?: string;
  yaml?: string;
  category?: string;
  tags?: string[];
  isPublic?: boolean;
}