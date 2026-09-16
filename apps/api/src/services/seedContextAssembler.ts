/**
 * Seed Context Assembler
 *
 * Canonical service for assembling Seeds into farm context.
 * This ensures Seeds are ALWAYS injected consistently across:
 * - All AI engines (Claude, OpenAI, Grok, GPT-OSS, Ollama)
 * - All execution modes (Harvest, Quick Task, GoWild)
 * - All farm runs (including retries/resumes)
 *
 * Seeds appear as a clearly delimited section at the top of the context:
 * [SEEDS]
 * Seed 1: <seedPrompt>
 * Seed 2: <seedPrompt>
 * [/SEEDS]
 */

import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/client';
import {
  Seed,
  FarmModeType,
  AIEngineType,
  SeedCompatibilityResult,
  SeedApplication
} from '../types/seed';
import { Farm, FarmMode } from '../types/farm';
import { randomUUID } from 'crypto';

export interface AssembledContext {
  // The full context string with Seeds section
  fullContext: string;
  // Seeds section only (for logging/debugging)
  seedsSection: string;
  // Applied seeds with metadata
  appliedSeeds: Array<{
    seedId: string;
    seedName: string;
    seedVersion: number;
    seedPrompt: string;
  }>;
  // Any warnings during assembly
  warnings: string[];
}

export interface ContextAssemblyOptions {
  farmId: string;
  mode: FarmMode | string;
  provider: AIEngineType | string;
  basePrompt: string;
  seedIds?: string[];
  pinVersions?: boolean;
  runNumber?: number;
}

class SeedContextAssembler {
  private static instance: SeedContextAssembler;

  private constructor() {}

  static getInstance(): SeedContextAssembler {
    if (!SeedContextAssembler.instance) {
      SeedContextAssembler.instance = new SeedContextAssembler();
    }
    return SeedContextAssembler.instance;
  }

  /**
   * Assemble context with Seeds section for a farm
   */
  async assembleContext(options: ContextAssemblyOptions): Promise<AssembledContext> {
    const { farmId, mode, provider, basePrompt, seedIds, pinVersions, runNumber = 1 } = options;

    logger.info(LogCategory.FARM, `Assembling context for farm ${farmId} with ${seedIds?.length || 0} seeds`);

    const warnings: string[] = [];
    const appliedSeeds: AssembledContext['appliedSeeds'] = [];

    // If no seeds specified, return base prompt without modification
    if (!seedIds || seedIds.length === 0) {
      return {
        fullContext: basePrompt,
        seedsSection: '',
        appliedSeeds: [],
        warnings: []
      };
    }

    // Fetch seeds from database
    const seeds = await this.fetchSeeds(seedIds);

    if (seeds.length === 0) {
      warnings.push('No valid seeds found for the provided IDs');
      return {
        fullContext: basePrompt,
        seedsSection: '',
        appliedSeeds: [],
        warnings
      };
    }

    // Validate compatibility
    const normalizedMode = this.normalizeMode(mode);
    const normalizedProvider = this.normalizeProvider(provider);

    const compatibilityResult = await this.validateCompatibility(
      seeds,
      normalizedMode,
      normalizedProvider
    );

    if (!compatibilityResult.compatible) {
      for (const incompatible of compatibilityResult.incompatibleSeeds) {
        warnings.push(`Seed ${incompatible.seedId} skipped: ${incompatible.reason}`);
      }
    }
    warnings.push(...compatibilityResult.warnings);

    // Filter to only compatible seeds
    const compatibleSeedIds = new Set(
      compatibilityResult.incompatibleSeeds.map(s => s.seedId)
    );
    const compatibleSeeds = seeds.filter(s => !compatibleSeedIds.has(s.id));

    if (compatibleSeeds.length === 0) {
      warnings.push('No compatible seeds after filtering');
      return {
        fullContext: basePrompt,
        seedsSection: '',
        appliedSeeds: [],
        warnings
      };
    }

    // Build the seeds section
    const seedsSection = this.buildSeedsSection(compatibleSeeds);

    // Record seed applications for tracking
    for (let i = 0; i < compatibleSeeds.length; i++) {
      const seed = compatibleSeeds[i];
      appliedSeeds.push({
        seedId: seed.id,
        seedName: seed.name,
        seedVersion: seed.version || 1,
        seedPrompt: seed.seedPrompt || seed.description
      });

      // Store application record
      await this.recordSeedApplication({
        farmId,
        seedId: seed.id,
        seedVersion: seed.version || 1,
        seedPromptSnapshot: seed.seedPrompt || seed.description,
        applicationOrder: i,
        runNumber
      });
    }

    // Assemble full context: Seeds at top, then base prompt
    const fullContext = `${seedsSection}\n\n${basePrompt}`;

    logger.info(LogCategory.FARM, `Context assembled with ${appliedSeeds.length} seeds for farm ${farmId}`);

    return {
      fullContext,
      seedsSection,
      appliedSeeds,
      warnings
    };
  }

  /**
   * Build the [SEEDS] section from an array of seeds
   */
  private buildSeedsSection(seeds: Seed[]): string {
    if (seeds.length === 0) return '';

    const lines: string[] = ['[SEEDS]', ''];

    for (let i = 0; i < seeds.length; i++) {
      const seed = seeds[i];
      const seedNumber = i + 1;
      const seedPrompt = seed.seedPrompt || seed.description || 'No seed prompt defined';

      lines.push(`# Seed ${seedNumber}: ${seed.name}`);
      if (seed.category) {
        lines.push(`# Category: ${seed.category}`);
      }
      if (seed.version && seed.version > 1) {
        lines.push(`# Version: ${seed.version}`);
      }
      lines.push('');
      lines.push(seedPrompt);
      lines.push('');

      // Add success checklist if present
      if (seed.successChecklist && seed.successChecklist.length > 0) {
        lines.push('Success Criteria:');
        for (const item of seed.successChecklist) {
          lines.push(`  - ${item}`);
        }
        lines.push('');
      }

      // Add safety notes if present
      if (seed.safetyNotes) {
        lines.push(`Safety Notes: ${seed.safetyNotes}`);
        lines.push('');
      }

      // Separator between seeds
      if (i < seeds.length - 1) {
        lines.push('---');
        lines.push('');
      }
    }

    lines.push('[/SEEDS]');

    return lines.join('\n');
  }

  /**
   * Fetch seeds from database by IDs
   */
  private async fetchSeeds(seedIds: string[]): Promise<Seed[]> {
    if (!db || seedIds.length === 0) {
      return [];
    }

    try {
      // Use ANY for array parameter
      const result = await db.query(
        `SELECT * FROM seeds WHERE id = ANY($1) ORDER BY created_at ASC`,
        [seedIds]
      );

      return result.rows.map((row: any) => this.mapRowToSeed(row));
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to fetch seeds:', error);
      return [];
    }
  }

  /**
   * Map database row to Seed type
   */
  private mapRowToSeed(row: any): Seed {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      yaml: row.yaml_content || '',
      farmType: row.farm_type || 'collaborative',
      category: row.category || 'custom',
      tags: row.tags || [],
      usageCount: row.usage_count || 0,
      successRate: row.success_rate || 100,
      agentCount: row.agent_count || 1,
      estimatedDuration: row.estimated_duration,
      requiredCapabilities: row.required_capabilities || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      userId: row.user_id,
      isPublic: row.is_public || false,
      isOfficial: row.is_official || false,
      seedPrompt: row.seed_prompt,
      modeCompatibility: row.mode_compatibility || 'all',
      engineCompatibility: row.engine_compatibility || 'all',
      version: row.version || 1,
      successChecklist: row.success_checklist || [],
      recommendedModes: row.recommended_modes || [],
      recommendedEngines: row.recommended_engines || [],
      safetyNotes: row.safety_notes,
      exampleOutputs: row.example_outputs || [],
      sources: row.sources || []
    };
  }

  /**
   * Validate seed compatibility with mode and provider
   */
  async validateCompatibility(
    seeds: Seed[],
    mode: FarmModeType,
    provider: AIEngineType
  ): Promise<SeedCompatibilityResult> {
    const incompatibleSeeds: SeedCompatibilityResult['incompatibleSeeds'] = [];
    const warnings: string[] = [];

    for (const seed of seeds) {
      const issues: string[] = [];

      // Check mode compatibility
      if (seed.modeCompatibility && seed.modeCompatibility !== 'all') {
        const compatibleModes = seed.modeCompatibility.split(',').map(m => m.trim());
        if (!compatibleModes.includes(mode)) {
          issues.push(`Mode '${mode}' not supported (compatible: ${seed.modeCompatibility})`);
        }
      }

      // Check engine compatibility
      if (seed.engineCompatibility && seed.engineCompatibility !== 'all') {
        const compatibleEngines = seed.engineCompatibility.split(',').map(e => e.trim());
        if (!compatibleEngines.includes(provider)) {
          issues.push(`Engine '${provider}' not supported (compatible: ${seed.engineCompatibility})`);
        }
      }

      // Check recommended vs compatible (warning only)
      if (seed.recommendedModes && seed.recommendedModes.length > 0) {
        if (!seed.recommendedModes.includes(mode)) {
          warnings.push(`Seed '${seed.name}' recommends modes: ${seed.recommendedModes.join(', ')} (using: ${mode})`);
        }
      }

      if (seed.recommendedEngines && seed.recommendedEngines.length > 0) {
        if (!seed.recommendedEngines.includes(provider) && !seed.recommendedEngines.includes('any' as AIEngineType)) {
          warnings.push(`Seed '${seed.name}' recommends engines: ${seed.recommendedEngines.join(', ')} (using: ${provider})`);
        }
      }

      if (issues.length > 0) {
        incompatibleSeeds.push({
          seedId: seed.id,
          reason: issues.join('; ')
        });
      }
    }

    return {
      compatible: incompatibleSeeds.length === 0,
      incompatibleSeeds,
      warnings
    };
  }

  /**
   * Record a seed application for tracking
   */
  private async recordSeedApplication(application: Omit<SeedApplication, 'id' | 'contextPosition' | 'injectionTimestamp' | 'createdAt'>): Promise<void> {
    if (!db) return;

    try {
      await db.query(
        `INSERT INTO seed_applications (id, farm_id, seed_id, seed_version, seed_prompt_snapshot, application_order, run_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (farm_id, seed_id, run_number) DO UPDATE SET
           seed_version = EXCLUDED.seed_version,
           seed_prompt_snapshot = EXCLUDED.seed_prompt_snapshot,
           application_order = EXCLUDED.application_order`,
        [
          randomUUID(),
          application.farmId,
          application.seedId,
          application.seedVersion,
          application.seedPromptSnapshot,
          application.applicationOrder,
          application.runNumber
        ]
      );
    } catch (error) {
      logger.warn(LogCategory.DATABASE, 'Failed to record seed application:', error);
    }
  }

  /**
   * Update farm with applied seed IDs and snapshot
   */
  async updateFarmWithSeeds(
    farmId: string,
    seedIds: string[],
    seedTextSnapshot: string
  ): Promise<void> {
    if (!db) return;

    try {
      await db.query(
        `UPDATE farms
         SET applied_seed_ids = $2,
             applied_seed_text_snapshot = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [farmId, JSON.stringify(seedIds), seedTextSnapshot]
      );

      logger.info(LogCategory.FARM, `Updated farm ${farmId} with ${seedIds.length} applied seeds`);
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to update farm with seeds:', error);
    }
  }

  /**
   * Get applied seeds for a farm
   */
  async getAppliedSeeds(farmId: string): Promise<Seed[]> {
    if (!db) return [];

    try {
      const result = await db.query(
        `SELECT s.* FROM seeds s
         INNER JOIN seed_applications sa ON s.id = sa.seed_id
         WHERE sa.farm_id = $1
         ORDER BY sa.application_order ASC`,
        [farmId]
      );

      return result.rows.map((row: any) => this.mapRowToSeed(row));
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to get applied seeds:', error);
      return [];
    }
  }

  /**
   * Normalize mode string to FarmModeType
   */
  private normalizeMode(mode: FarmMode | string): FarmModeType {
    const modeMap: Record<string, FarmModeType> = {
      'harvest': 'harvest',
      'quick_task': 'quick_task',
      'go_wild': 'go_wild',
      'collaborative': 'harvest',
      'sequential': 'harvest',
      'autonomous': 'go_wild'
    };

    const normalized = modeMap[mode.toLowerCase()];
    return normalized || 'harvest';
  }

  /**
   * Normalize provider string to AIEngineType
   */
  private normalizeProvider(provider: AIEngineType | string): AIEngineType {
    const providerMap: Record<string, AIEngineType> = {
      'claude': 'claude',
      'openai': 'openai',
      'grok': 'grok',
      'gpt-oss': 'gpt-oss',
      'ollama': 'ollama',
      'llama': 'ollama'
    };

    const normalized = providerMap[provider.toLowerCase()];
    return normalized || 'claude';
  }
}

export const seedContextAssembler = SeedContextAssembler.getInstance();
