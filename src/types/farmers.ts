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