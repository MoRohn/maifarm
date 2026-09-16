// ============================================
// SEED TYPES FOR MAIFARM DASHBOARD
// ============================================

export type FarmModeType = 'harvest' | 'quick_task' | 'go_wild';
export type AIEngineType = 'claude' | 'openai' | 'grok' | 'gpt-oss' | 'ollama';

export interface SeedSource {
  url?: string;
  title?: string;
  snippet?: string;
  query?: string;
  retrievedAt?: Date;
}

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

  // Harvest integration fields
  harvestId?: string;
  sourceType?: 'manual' | 'harvest_completion' | 'barn_harvest' | 'template' | 'viral';
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

  // Seeds Enhancement (Feature A) - new fields
  seedPrompt?: string;           // Canonical text injected into farm context
  modeCompatibility?: string;    // 'all' or comma-separated modes
  engineCompatibility?: string;  // 'all' or comma-separated engines
  version?: number;              // Version for pinning/reproducibility
  successChecklist?: string[];   // Checklist items for success criteria
  recommendedModes?: FarmModeType[];
  recommendedEngines?: AIEngineType[];
  safetyNotes?: string;
  exampleOutputs?: string[];
  sources?: SeedSource[];        // For Viral Seeds
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

  // Harvest integration
  additionalPrompt?: string;
  harvestId?: string;
  sourceType?: 'manual' | 'harvest_completion' | 'barn_harvest' | 'template' | 'viral';

  // Seeds enhancement
  seedPrompt?: string;
  modeCompatibility?: string;
  engineCompatibility?: string;
  successChecklist?: string[];
  recommendedModes?: FarmModeType[];
  recommendedEngines?: AIEngineType[];
  safetyNotes?: string;
  exampleOutputs?: string[];
  sources?: SeedSource[];
}

export interface SeedFromHarvestInput {
  name: string;
  description?: string;
  additionalPrompt?: string;
  category?: string;
  tags?: string[];
  isPublic?: boolean;
}

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
  seedPrompt?: string;
  modeCompatibility?: string;
  engineCompatibility?: string;
  successChecklist?: string[];
  recommendedModes?: FarmModeType[];
  recommendedEngines?: AIEngineType[];
  safetyNotes?: string;
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
  sourceType?: 'manual' | 'harvest_completion' | 'barn_harvest' | 'template' | 'viral';
  harvestDerived?: boolean;
  modeCompatibility?: FarmModeType;
  engineCompatibility?: AIEngineType;
  sortBy?: 'name' | 'usage' | 'createdAt' | 'successRate' | 'version';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

// ============================================
// VIRAL SEEDS TYPES (Feature B)
// ============================================

export interface ViralIntent {
  id: string;
  intent: string;
  category: string;
  rationale: string;
  sourceQuery: string;
  sourceSnippets: string[];
  relevanceScore: number;
}

export interface ViralSeedGenerationConfig {
  searchQueries?: string[];
  searchProvider?: 'websearch' | 'brave' | 'serper';
  maxResultsPerQuery?: number;
  includeCategories?: string[];
  excludeCategories?: string[];
  creativityLevel?: number;
  snapshotId?: string;  // For reproducible regeneration
}

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  query: string;
  position: number;
}

export interface ViralSeedSnapshot {
  id: string;
  userId: string;
  searchQueries: string[];
  searchProvider: string;
  searchResults: SearchResult[];
  viralIntents: ViralIntent[];
  generationPromptVersion: string;
  modelUsed: string;
  generatedSeedIds: string[];
  status: 'pending' | 'searching' | 'extracting' | 'generating' | 'completed' | 'failed';
  errorMessage?: string;
  searchDurationMs?: number;
  extractionDurationMs?: number;
  generationDurationMs?: number;
  totalDurationMs?: number;
  blockedContentCount: number;
  safetyFlags: string[];
  createdAt: Date;
  completedAt?: Date;
}

export interface ViralSeedGenerationResult {
  success: boolean;
  seeds: Seed[];
  snapshotId: string;
  snapshotMeta: {
    queriesUsed: string[];
    intentsFound: number;
    blockedCount: number;
    durationMs: number;
  };
  error?: string;
}

export type ViralSeedsPipelineStage =
  | 'idle'
  | 'searching'
  | 'extracting'
  | 'generating'
  | 'saving'
  | 'completed'
  | 'failed';

export interface ViralSeedsPipelineState {
  stage: ViralSeedsPipelineStage;
  progress: number;
  message: string;
  error?: string;
  generatedSeeds?: Seed[];
  snapshotId?: string;
}

// ============================================
// SEED APPLICATION TYPES
// ============================================

export interface SeedApplication {
  id: string;
  farmId: string;
  seedId: string;
  seedVersion: number;
  seedPromptSnapshot: string;
  applicationOrder: number;
  contextPosition: 'top' | 'middle' | 'bottom';
  injectionTimestamp: Date;
  runNumber: number;
  createdAt: Date;
}

export interface ApplySeedToFarmInput {
  farmId: string;
  seedIds: string[];
  pinVersions?: boolean;
}

export interface SeedCompatibilityResult {
  compatible: boolean;
  incompatibleSeeds: Array<{
    seedId: string;
    seedName?: string;
    reason: string;
  }>;
  warnings: string[];
}

// ============================================
// ACTIVE SEEDS DISPLAY
// ============================================

export interface ActiveSeed {
  seed: Seed;
  applicationOrder: number;
  pinnedVersion?: number;
  appliedAt: Date;
}

export interface ActiveSeedsState {
  seeds: ActiveSeed[];
  isLoading: boolean;
  error?: string;
}
