export type FarmModeType = 'harvest' | 'quick_task' | 'go_wild';
export type AIEngineType = 'claude' | 'openai' | 'grok' | 'gpt-oss' | 'ollama';

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

  // New fields for Seeds enhancement (Feature A)
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

export interface SeedSource {
  url?: string;
  title?: string;
  snippet?: string;
  query?: string;
  retrievedAt?: Date;
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

  // New fields for Seeds enhancement
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

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  query: string;
  position: number;
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

export interface GeneratedSeedData {
  title: string;
  description: string;
  tags: string[];
  seedPrompt: string;
  recommendedModes: FarmModeType[];
  recommendedEngines: AIEngineType[];
  successChecklist: string[];
  category: string;
}

// JSON Schema for validating generated seeds
export const VIRAL_SEED_JSON_SCHEMA = {
  type: 'object',
  required: ['seeds'],
  properties: {
    seeds: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        required: ['title', 'description', 'tags', 'seedPrompt', 'recommendedModes', 'successChecklist'],
        properties: {
          title: { type: 'string', maxLength: 50 },
          description: { type: 'string', maxLength: 200 },
          tags: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 6 },
          seedPrompt: { type: 'string', minLength: 50 },
          recommendedModes: { type: 'array', items: { type: 'string', enum: ['harvest', 'quick_task', 'go_wild'] } },
          recommendedEngines: { type: 'array', items: { type: 'string', enum: ['claude', 'openai', 'grok', 'gpt-oss', 'ollama', 'any'] } },
          successChecklist: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 6 },
          category: { type: 'string' }
        }
      }
    }
  }
} as const;

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
    reason: string;
  }>;
  warnings: string[];
}

export interface SeedFilter {
  category?: string;
  farmType?: 'sequential' | 'collaborative' | 'autonomous';
  tags?: string[];
  search?: string;
  isPublic?: boolean;
  isOfficial?: boolean;
  modeCompatibility?: FarmModeType;
  engineCompatibility?: AIEngineType;
  sortBy?: 'name' | 'usage' | 'createdAt' | 'successRate' | 'version';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}