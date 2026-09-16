/**
 * Enhanced Seed Service
 *
 * Extends the base SeedService with new capabilities:
 * - Apply Seeds to Farms
 * - Validate mode/engine compatibility
 * - Version pinning for reproducibility
 * - Integration with seedContextAssembler
 */

import { randomUUID } from 'crypto';
import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/client';
import {
  Seed,
  SeedCreateInput,
  SeedUpdateInput,
  SeedFilter,
  FarmModeType,
  AIEngineType,
  ApplySeedToFarmInput,
  SeedCompatibilityResult
} from '../types/seed';
import { seedContextAssembler } from './seedContextAssembler';
import { SEED_UUID } from '../utils/systemUuids';

export class EnhancedSeedService {
  private seeds: Map<string, Seed> = new Map();

  constructor() {
    this.initializeDefaultSeeds();
  }

  /**
   * Initialize default seeds with enhanced fields
   */
  private initializeDefaultSeeds() {
    const defaultSeeds: Seed[] = [
      {
        id: randomUUID(),
        name: 'Code Review Assistant',
        description: 'Multi-agent farm for comprehensive code review with style, security, and performance analysis',
        yaml: `agents:
  - name: style-checker
    type: code-style
    tasks:
      - check-formatting
      - lint-code
  - name: security-scanner
    type: security
    tasks:
      - scan-vulnerabilities
      - check-dependencies
  - name: performance-analyzer
    type: performance
    tasks:
      - analyze-complexity
      - check-bottlenecks`,
        farmType: 'collaborative',
        category: 'development',
        tags: ['code-review', 'quality', 'automation'],
        usageCount: 0,
        successRate: 100,
        agentCount: 3,
        estimatedDuration: 300,
        requiredCapabilities: ['code-analysis'],
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: SEED_UUID,
        isPublic: true,
        isOfficial: true,
        // Enhanced fields
        seedPrompt: `You are a Code Review Assistant. Your job is to analyze code for:
1. Style and formatting issues
2. Security vulnerabilities
3. Performance bottlenecks

Work systematically through the codebase, flagging issues with severity levels.
Provide actionable recommendations for each issue found.
Generate a summary report at the end with prioritized fixes.`,
        modeCompatibility: 'all',
        engineCompatibility: 'all',
        version: 1,
        successChecklist: [
          'All files reviewed for style compliance',
          'Security scan completed with no critical issues',
          'Performance hotspots identified and documented',
          'Summary report generated'
        ],
        recommendedModes: ['harvest', 'quick_task'],
        recommendedEngines: ['claude', 'openai']
      },
      {
        id: randomUUID(),
        name: 'Data Processing Pipeline',
        description: 'Sequential farm for ETL operations with validation and transformation',
        yaml: `agents:
  - name: data-extractor
    type: extractor
    tasks:
      - fetch-data
      - validate-schema
  - name: data-transformer
    type: transformer
    tasks:
      - clean-data
      - transform-format
  - name: data-loader
    type: loader
    tasks:
      - load-to-warehouse
      - verify-integrity`,
        farmType: 'sequential',
        category: 'data',
        tags: ['etl', 'data-pipeline', 'automation'],
        usageCount: 0,
        successRate: 100,
        agentCount: 3,
        estimatedDuration: 600,
        requiredCapabilities: ['data-processing'],
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: SEED_UUID,
        isPublic: true,
        isOfficial: true,
        // Enhanced fields
        seedPrompt: `You are a Data Processing Pipeline agent. Execute these phases in order:

PHASE 1 - EXTRACTION:
- Connect to data sources
- Validate schemas before extraction
- Handle connection failures gracefully

PHASE 2 - TRANSFORMATION:
- Clean and normalize data
- Apply business rules
- Document all transformations

PHASE 3 - LOADING:
- Load to target warehouse
- Verify data integrity
- Generate load statistics`,
        modeCompatibility: 'harvest,quick_task',
        engineCompatibility: 'all',
        version: 1,
        successChecklist: [
          'Data extracted from all sources',
          'Schema validation passed',
          'Transformations applied correctly',
          'Data loaded to warehouse',
          'Integrity verification passed'
        ],
        recommendedModes: ['harvest'],
        recommendedEngines: ['claude', 'gpt-oss']
      },
      {
        id: randomUUID(),
        name: 'AI Research Explorer',
        description: 'Autonomous farm for deep research, analysis, and discovery',
        yaml: `agents:
  - name: research-coordinator
    type: coordinator
    autonomy: high
    goals:
      - comprehensive-research
      - synthesis-insights
  - name: web-researcher
    type: researcher
    autonomy: medium
  - name: report-writer
    type: writer
    autonomy: medium`,
        farmType: 'autonomous',
        category: 'research',
        tags: ['research', 'ai', 'autonomous', 'exploration'],
        usageCount: 0,
        successRate: 100,
        agentCount: 3,
        estimatedDuration: 1200,
        requiredCapabilities: ['research', 'writing'],
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: SEED_UUID,
        isPublic: true,
        isOfficial: true,
        // Enhanced fields
        seedPrompt: `You are an AI Research Explorer. Operate with high autonomy to:

1. EXPLORE - Investigate the research topic from multiple angles
2. DISCOVER - Find novel insights and connections
3. SYNTHESIZE - Combine findings into coherent understanding
4. REPORT - Document discoveries with evidence and reasoning

You have permission to explore tangential topics if they promise valuable insights.
Track your exploration path for reproducibility.
Flag any uncertain conclusions for human review.`,
        modeCompatibility: 'go_wild',
        engineCompatibility: 'claude,openai,grok',
        version: 1,
        successChecklist: [
          'Research topic thoroughly explored',
          'Multiple perspectives considered',
          'Novel insights documented',
          'Final report with citations generated',
          'Confidence levels assigned to conclusions'
        ],
        recommendedModes: ['go_wild'],
        recommendedEngines: ['claude']
      }
    ];

    defaultSeeds.forEach(seed => {
      this.seeds.set(seed.id, seed);
    });

    logger.info(LogCategory.SEED, `Initialized ${defaultSeeds.length} enhanced default seeds`);
  }

  /**
   * Apply seeds to a farm
   */
  async applyToFarm(input: ApplySeedToFarmInput): Promise<{
    success: boolean;
    appliedCount: number;
    warnings: string[];
    error?: string;
  }> {
    const { farmId, seedIds, pinVersions = true } = input;

    try {
      logger.info(LogCategory.SEED, `Applying ${seedIds.length} seeds to farm ${farmId}`);

      // Get farm details
      const farmResult = await db?.query('SELECT * FROM farms WHERE id = $1', [farmId]);
      if (!farmResult?.rows?.[0]) {
        return {
          success: false,
          appliedCount: 0,
          warnings: [],
          error: 'Farm not found'
        };
      }

      const farm = farmResult.rows[0];
      const mode = farm.config?.mode || 'harvest';
      const provider = farm.provider || 'claude';

      // Assemble context with seeds
      const assembledContext = await seedContextAssembler.assembleContext({
        farmId,
        mode,
        provider,
        basePrompt: farm.config?.prompt || '',
        seedIds,
        pinVersions
      });

      // Update farm with applied seeds
      await seedContextAssembler.updateFarmWithSeeds(
        farmId,
        seedIds,
        assembledContext.seedsSection
      );

      // Update seed usage counts
      for (const seedId of seedIds) {
        await this.incrementUsage(seedId);
      }

      return {
        success: true,
        appliedCount: assembledContext.appliedSeeds.length,
        warnings: assembledContext.warnings
      };
    } catch (error) {
      logger.error(LogCategory.SEED, 'Failed to apply seeds to farm:', error);
      return {
        success: false,
        appliedCount: 0,
        warnings: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Validate seed compatibility with a mode and engine
   */
  async validateCompatibility(
    seedIds: string[],
    mode: FarmModeType,
    engine: AIEngineType
  ): Promise<SeedCompatibilityResult> {
    const seeds: Seed[] = [];

    for (const id of seedIds) {
      const seed = await this.findById(id);
      if (seed) {
        seeds.push(seed);
      }
    }

    return seedContextAssembler.validateCompatibility(seeds, mode, engine);
  }

  /**
   * Create a new seed with enhanced fields
   */
  async create(input: SeedCreateInput, userId: string): Promise<Seed> {
    const seed: Seed = {
      id: randomUUID(),
      name: input.name,
      description: input.description,
      yaml: input.yaml,
      farmType: input.farmType,
      category: input.category || 'custom',
      tags: input.tags || [],
      usageCount: 0,
      successRate: 100,
      agentCount: this.extractAgentCount(input.yaml),
      requiredCapabilities: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      userId,
      isPublic: input.isPublic || false,
      isOfficial: false,
      // Enhanced fields
      seedPrompt: input.seedPrompt || input.description,
      modeCompatibility: input.modeCompatibility || 'all',
      engineCompatibility: input.engineCompatibility || 'all',
      version: 1,
      successChecklist: input.successChecklist || [],
      recommendedModes: input.recommendedModes || [],
      recommendedEngines: input.recommendedEngines || [],
      safetyNotes: input.safetyNotes,
      exampleOutputs: input.exampleOutputs || [],
      sources: input.sources || []
    };

    this.seeds.set(seed.id, seed);

    // Persist to database
    if (db) {
      try {
        await db.query(
          `INSERT INTO seeds (
            id, name, description, yaml_content, category, tags,
            usage_count, is_public, is_official, user_id,
            seed_prompt, mode_compatibility, engine_compatibility, version,
            success_checklist, recommended_modes, recommended_engines,
            safety_notes, example_outputs, sources,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
          [
            seed.id, seed.name, seed.description, seed.yaml, seed.category,
            seed.tags, seed.usageCount, seed.isPublic, seed.isOfficial, userId,
            seed.seedPrompt, seed.modeCompatibility, seed.engineCompatibility, seed.version,
            JSON.stringify(seed.successChecklist), JSON.stringify(seed.recommendedModes),
            JSON.stringify(seed.recommendedEngines), seed.safetyNotes,
            JSON.stringify(seed.exampleOutputs), JSON.stringify(seed.sources),
            seed.createdAt, seed.updatedAt
          ]
        );
      } catch (error) {
        logger.warn(LogCategory.DATABASE, 'Failed to persist seed:', error);
      }
    }

    logger.info(LogCategory.SEED, `Created seed: ${seed.id} - ${seed.name}`);
    return seed;
  }

  /**
   * Update a seed (with version increment for content changes)
   */
  async update(id: string, input: SeedUpdateInput, userId: string): Promise<Seed> {
    const seed = this.seeds.get(id);
    if (!seed) {
      throw new Error('Seed not found');
    }

    if (seed.userId !== userId && seed.isOfficial) {
      throw new Error('Cannot modify official seeds');
    }

    const contentChanged =
      (input.seedPrompt && input.seedPrompt !== seed.seedPrompt) ||
      (input.yaml && input.yaml !== seed.yaml) ||
      (input.description && input.description !== seed.description);

    const updatedSeed: Seed = {
      ...seed,
      ...input,
      version: contentChanged ? (seed.version || 1) + 1 : seed.version,
      updatedAt: new Date()
    };

    this.seeds.set(id, updatedSeed);

    // Update in database
    if (db) {
      try {
        await db.query(
          `UPDATE seeds SET
            name = COALESCE($2, name),
            description = COALESCE($3, description),
            yaml_content = COALESCE($4, yaml_content),
            category = COALESCE($5, category),
            tags = COALESCE($6, tags),
            is_public = COALESCE($7, is_public),
            seed_prompt = COALESCE($8, seed_prompt),
            mode_compatibility = COALESCE($9, mode_compatibility),
            engine_compatibility = COALESCE($10, engine_compatibility),
            success_checklist = COALESCE($11, success_checklist),
            recommended_modes = COALESCE($12, recommended_modes),
            recommended_engines = COALESCE($13, recommended_engines),
            safety_notes = COALESCE($14, safety_notes),
            updated_at = $15
          WHERE id = $1`,
          [
            id,
            input.name,
            input.description,
            input.yaml,
            input.category,
            input.tags,
            input.isPublic,
            input.seedPrompt,
            input.modeCompatibility,
            input.engineCompatibility,
            input.successChecklist ? JSON.stringify(input.successChecklist) : null,
            input.recommendedModes ? JSON.stringify(input.recommendedModes) : null,
            input.recommendedEngines ? JSON.stringify(input.recommendedEngines) : null,
            input.safetyNotes,
            updatedSeed.updatedAt
          ]
        );
      } catch (error) {
        logger.warn(LogCategory.DATABASE, 'Failed to update seed:', error);
      }
    }

    logger.info(LogCategory.SEED, `Updated seed: ${id} (version: ${updatedSeed.version})`);
    return updatedSeed;
  }

  /**
   * Find a seed by ID
   */
  async findById(id: string): Promise<Seed | null> {
    // Check memory cache first
    const cached = this.seeds.get(id);
    if (cached) return cached;

    // Try database
    if (db) {
      try {
        const result = await db.query('SELECT * FROM seeds WHERE id = $1', [id]);
        if (result.rows[0]) {
          const seed = this.mapRowToSeed(result.rows[0]);
          this.seeds.set(seed.id, seed);
          return seed;
        }
      } catch (error) {
        logger.warn(LogCategory.DATABASE, 'Failed to fetch seed from database:', error);
      }
    }

    return null;
  }

  /**
   * Find all seeds with filtering
   */
  async findAll(filter?: SeedFilter): Promise<Seed[]> {
    let seeds = Array.from(this.seeds.values());

    if (filter) {
      if (filter.category) {
        seeds = seeds.filter(s => s.category === filter.category);
      }
      if (filter.farmType) {
        seeds = seeds.filter(s => s.farmType === filter.farmType);
      }
      if (filter.tags && filter.tags.length > 0) {
        seeds = seeds.filter(s => filter.tags!.some(tag => s.tags.includes(tag)));
      }
      if (filter.isPublic !== undefined) {
        seeds = seeds.filter(s => s.isPublic === filter.isPublic);
      }
      if (filter.isOfficial !== undefined) {
        seeds = seeds.filter(s => s.isOfficial === filter.isOfficial);
      }
      if (filter.search) {
        const search = filter.search.toLowerCase();
        seeds = seeds.filter(s =>
          s.name.toLowerCase().includes(search) ||
          s.description.toLowerCase().includes(search)
        );
      }
      if (filter.modeCompatibility) {
        seeds = seeds.filter(s =>
          s.modeCompatibility === 'all' ||
          s.modeCompatibility?.includes(filter.modeCompatibility!)
        );
      }
      if (filter.engineCompatibility) {
        seeds = seeds.filter(s =>
          s.engineCompatibility === 'all' ||
          s.engineCompatibility?.includes(filter.engineCompatibility!)
        );
      }
    }

    // Sort
    if (filter?.sortBy) {
      seeds.sort((a, b) => {
        let compareValue = 0;
        switch (filter.sortBy) {
          case 'name':
            compareValue = a.name.localeCompare(b.name);
            break;
          case 'usage':
            compareValue = (a.usageCount || 0) - (b.usageCount || 0);
            break;
          case 'createdAt':
            compareValue = a.createdAt.getTime() - b.createdAt.getTime();
            break;
          case 'successRate':
            compareValue = (a.successRate || 0) - (b.successRate || 0);
            break;
          case 'version':
            compareValue = (a.version || 1) - (b.version || 1);
            break;
        }
        return filter.sortOrder === 'desc' ? -compareValue : compareValue;
      });
    }

    if (filter?.limit && filter.limit > 0) {
      seeds = seeds.slice(0, filter.limit);
    }

    return seeds;
  }

  /**
   * Increment seed usage count
   */
  async incrementUsage(seedId: string): Promise<void> {
    const seed = this.seeds.get(seedId);
    if (seed) {
      seed.usageCount = (seed.usageCount || 0) + 1;
      seed.lastUsedAt = new Date();
      this.seeds.set(seedId, seed);
    }

    if (db) {
      try {
        await db.query(
          'UPDATE seeds SET usage_count = usage_count + 1 WHERE id = $1',
          [seedId]
        );
      } catch (error) {
        logger.warn(LogCategory.DATABASE, 'Failed to increment seed usage:', error);
      }
    }
  }

  /**
   * Delete a seed
   */
  async delete(id: string, userId: string): Promise<void> {
    const seed = this.seeds.get(id);
    if (!seed) {
      throw new Error('Seed not found');
    }

    if (seed.isOfficial || seed.userId !== userId) {
      throw new Error('Cannot delete this seed');
    }

    this.seeds.delete(id);

    if (db) {
      try {
        await db.query('DELETE FROM seeds WHERE id = $1', [id]);
      } catch (error) {
        logger.warn(LogCategory.DATABASE, 'Failed to delete seed from database:', error);
      }
    }

    logger.info(LogCategory.SEED, `Deleted seed: ${id}`);
  }

  /**
   * Get available categories
   */
  async getCategories(): Promise<string[]> {
    const categories = new Set<string>();
    this.seeds.forEach(seed => categories.add(seed.category));
    return Array.from(categories);
  }

  /**
   * Extract agent count from YAML
   */
  private extractAgentCount(yaml: string): number {
    const matches = yaml.match(/- name:/g);
    return matches ? matches.length : 1;
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
      lastUsedAt: row.last_used,
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
}

export const enhancedSeedService = new EnhancedSeedService();
