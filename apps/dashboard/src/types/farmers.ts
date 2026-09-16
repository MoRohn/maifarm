export interface FarmerAgent {
  name: string;
  role: string;
  emoji?: string;
  capabilities: string[];
  personality: string;
  specialties?: string[];
}

export interface FarmerConfig {
  autoScale?: boolean;
  maxAgents?: number;
  timeout?: number;
  coordination?: 'collaborative' | 'sequential' | 'parallel';
  stagger?: number;
}

export interface FarmerMetadata {
  created_at: string;
  ai_generated?: boolean;
  purpose: 'startup' | 'development' | 'creative' | 'research' | 'operations' | 'review' | 'general';
  num_agents: number;
  complexity: 'beginner' | 'moderate' | 'advanced' | 'expert';
  farm_theme?: boolean;
  author?: string;
  version?: string;
}

export interface FarmerTemplate {
  id: string;
  name: string;
  title: string; // Display title
  description: string;
  category: 'startup' | 'technical' | 'creative' | 'research' | 'operations';
  agents: FarmerAgent[];
  initial_prompt: string;
  steps: string[];
  config: FarmerConfig;
  metadata: FarmerMetadata;
  yaml_path: string;
  yaml_content?: string;
  featured?: boolean; // Whether this farmer is featured/promoted
}

export interface FarmerProfile {
  id: string;
  farmerId: string;
  nickname: string;
  avatar: string; // Emoji or image path
  backstory: string;
  personality_traits: {
    trait: string;
    level: number; // 0-100
    description: string;
  }[];
  skills: {
    name: string;
    level: number; // 0-100
    category: string;
  }[];
  achievements: {
    id: string;
    name: string;
    description: string;
    icon: string;
    unlocked: boolean;
    unlockedAt?: Date;
  }[];
  quotes: string[];
  mood: 'energetic' | 'focused' | 'creative' | 'analytical' | 'supportive';
  specialty_badges: {
    name: string;
    color: string;
    icon: string;
  }[];
  fun_facts: string[];
}

export interface FarmerStats {
  farmerId: string;
  totalUses: number;
  successRate: number;
  averageDuration: number; // in minutes
  lastUsed?: Date;
  popularityRank: number;
  userRatings: {
    average: number;
    count: number;
  };
  topUseCases: string[];
  performanceMetrics: {
    speed: number; // 0-100
    quality: number; // 0-100
    creativity: number; // 0-100
    reliability: number; // 0-100
  };
}

export interface FarmerCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  farmerCount: number;
}

export interface FarmerListResponse {
  success: boolean;
  data: FarmerTemplate[];
  categories: FarmerCategory[];
}

export interface FarmerDetailResponse {
  success: boolean;
  data: {
    template: FarmerTemplate;
    profile: FarmerProfile;
    stats: FarmerStats;
  };
}

// ============================================
// Farmer Groups Types
// ============================================

export interface FarmerGroup {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  displayOrder: number;
  isSystem: boolean;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  farmerCount?: number;
  farmers?: string[];
}

export interface FarmerDbStats {
  id: string;
  farmerId: string;
  totalUses: number;
  successfulFarms: number;
  failedFarms: number;
  cancelledFarms: number;
  totalAgentsSpawned: number;
  avgCompletionTimeSeconds: number | null;
  minCompletionTimeSeconds: number | null;
  maxCompletionTimeSeconds: number | null;
  avgRating: number;
  ratingCount: number;
  lastUsedAt: string | null;
  lastSuccessfulAt: string | null;
  successRate: number;
}

export interface FarmerRating {
  id: string;
  farmerId: string;
  userId: string;
  farmId: string | null;
  rating: number;
  review: string | null;
  isPublic: boolean;
  helpfulCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FarmerGroupListResponse {
  success: boolean;
  data: FarmerGroup[];
  count: number;
}

export interface FarmerGroupDetailResponse {
  success: boolean;
  data: {
    group: FarmerGroup;
    farmers: FarmerTemplate[];
    count: number;
  };
}