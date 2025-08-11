import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import { db } from '../database/client';
import { Seed, SeedCreateInput, SeedUpdateInput, SeedFilter } from '../../src/types/seed';
import { harvestService } from './harvestService';
import { yamlGenerator } from './yamlGenerator';
import * as yaml from 'js-yaml';

export class SeedService {
  private seeds: Map<string, Seed> = new Map();

  constructor() {
    this.initializeDefaultSeeds();
  }

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
        usage: { count: 0, successRate: 100 },
        metadata: { agentCount: 3, estimatedDuration: 300, requiredCapabilities: ['code-analysis'] },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
        isPublic: true,
        isOfficial: true
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
        usage: { count: 0, successRate: 100 },
        metadata: { agentCount: 3, estimatedDuration: 600, requiredCapabilities: ['data-processing'] },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
        isPublic: true,
        isOfficial: true
      },
      {
        id: randomUUID(),
        name: 'AI Research Assistant',
        description: 'Autonomous farm for research, analysis, and report generation',
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
        tags: ['research', 'ai', 'autonomous'],
        usage: { count: 0, successRate: 100 },
        metadata: { agentCount: 3, estimatedDuration: 1200, requiredCapabilities: ['research', 'writing'] },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
        isPublic: true,
        isOfficial: true
      }
    ];

    defaultSeeds.forEach(seed => {
      this.seeds.set(seed.id, seed);
    });

    logger.info(`Initialized ${defaultSeeds.length} default seeds`);
  }

  async create(input: SeedCreateInput, userId: string): Promise<Seed> {
    try {
      const seed: Seed = {
        id: randomUUID(),
        ...input,
        category: input.category || 'custom',
        tags: input.tags || [],
        usage: { count: 0, successRate: 100 },
        metadata: this.extractMetadataFromYaml(input.yaml),
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: userId,
        isPublic: input.isPublic || false,
        isOfficial: false
      };

      // Store in memory
      this.seeds.set(seed.id, seed);

      // Try to store in database if available
      if (db) {
        try {
          await db.query(
            `INSERT INTO seeds (id, name, description, yaml, farm_type, category, tags, 
             usage_count, success_rate, agent_count, estimated_duration, required_capabilities,
             created_by, is_public, is_official, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
            [
              seed.id, seed.name, seed.description, seed.yaml, seed.farmType,
              seed.category, seed.tags, seed.usage.count, seed.usage.successRate,
              seed.metadata.agentCount, seed.metadata.estimatedDuration,
              seed.metadata.requiredCapabilities, seed.createdBy, seed.isPublic,
              seed.isOfficial, seed.createdAt, seed.updatedAt
            ]
          );
        } catch (dbError) {
          logger.warn('Failed to persist seed to database:', dbError);
        }
      }

      logger.info(`Created new seed: ${seed.id} - ${seed.name}`);
      return seed;
    } catch (error) {
      logger.error('Failed to create seed:', error);
      throw new Error('Failed to create seed');
    }
  }

  async update(id: string, input: SeedUpdateInput, userId: string): Promise<Seed> {
    const seed = this.seeds.get(id);
    if (!seed) {
      throw new Error('Seed not found');
    }

    if (seed.createdBy !== userId && seed.isOfficial) {
      throw new Error('Cannot modify official seeds');
    }

    const updatedSeed: Seed = {
      ...seed,
      ...input,
      updatedAt: new Date()
    };

    if (input.yaml) {
      updatedSeed.metadata = this.extractMetadataFromYaml(input.yaml);
    }

    this.seeds.set(id, updatedSeed);

    // Update in database if available
    if (db) {
      try {
        await db.query(
          `UPDATE seeds SET name = $2, description = $3, yaml = $4, category = $5, 
           tags = $6, is_public = $7, updated_at = $8 WHERE id = $1`,
          [
            id, updatedSeed.name, updatedSeed.description, updatedSeed.yaml,
            updatedSeed.category, updatedSeed.tags, updatedSeed.isPublic,
            updatedSeed.updatedAt
          ]
        );
      } catch (dbError) {
        logger.warn('Failed to update seed in database:', dbError);
      }
    }

    logger.info(`Updated seed: ${id}`);
    return updatedSeed;
  }

  async findById(id: string): Promise<Seed | null> {
    return this.seeds.get(id) || null;
  }

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
            compareValue = a.usage.count - b.usage.count;
            break;
          case 'createdAt':
            compareValue = a.createdAt.getTime() - b.createdAt.getTime();
            break;
          case 'successRate':
            compareValue = a.usage.successRate - b.usage.successRate;
            break;
        }
        return filter.sortOrder === 'desc' ? -compareValue : compareValue;
      });
    }

    // Apply limit if specified
    if (filter?.limit && filter.limit > 0) {
      seeds = seeds.slice(0, filter.limit);
    }

    return seeds;
  }

  async use(id: string): Promise<Seed> {
    const seed = this.seeds.get(id);
    if (!seed) {
      throw new Error('Seed not found');
    }

    seed.usage.count++;
    seed.usage.lastUsed = new Date();
    this.seeds.set(id, seed);

    // Update usage in database if available
    if (db) {
      try {
        await db.query(
          `UPDATE seeds SET usage_count = usage_count + 1, last_used = $2 WHERE id = $1`,
          [id, new Date()]
        );
      } catch (dbError) {
        logger.warn('Failed to update seed usage in database:', dbError);
      }
    }

    return seed;
  }

  async delete(id: string, userId: string): Promise<void> {
    const seed = this.seeds.get(id);
    if (!seed) {
      throw new Error('Seed not found');
    }

    if (seed.isOfficial || seed.createdBy !== userId) {
      throw new Error('Cannot delete this seed');
    }

    this.seeds.delete(id);

    // Delete from database if available
    if (db) {
      try {
        await db.query('DELETE FROM seeds WHERE id = $1', [id]);
      } catch (dbError) {
        logger.warn('Failed to delete seed from database:', dbError);
      }
    }

    logger.info(`Deleted seed: ${id}`);
  }

  private extractMetadataFromYaml(yaml: string): Seed['metadata'] {
    try {
      // Simple extraction - count agents
      const agentMatches = yaml.match(/- name:/g);
      const agentCount = agentMatches ? agentMatches.length : 1;

      // Extract capabilities from agent types
      const capabilities: string[] = [];
      const typeMatches = yaml.match(/type:\s*(\w+)/g);
      if (typeMatches) {
        typeMatches.forEach(match => {
          const capability = match.replace('type:', '').trim();
          if (!capabilities.includes(capability)) {
            capabilities.push(capability);
          }
        });
      }

      return {
        agentCount,
        estimatedDuration: agentCount * 300, // 5 minutes per agent estimate
        requiredCapabilities: capabilities
      };
    } catch (error) {
      logger.warn('Failed to extract metadata from YAML:', error);
      return {
        agentCount: 1,
        requiredCapabilities: []
      };
    }
  }

  async getCategories(): Promise<string[]> {
    const categories = new Set<string>();
    this.seeds.forEach(seed => categories.add(seed.category));
    return Array.from(categories);
  }

  /**
   * Create a seed from a harvest (from Harvest Completion Dashboard)
   */
  async createFromHarvest(
    harvestId: string,
    input: {
      name: string;
      description?: string;
      additionalPrompt?: string;
      category?: string;
      tags?: string[];
      isPublic?: boolean;
    },
    userId: string
  ): Promise<Seed> {
    try {
      // Get the harvest data
      const harvest = await harvestService.getById(harvestId);
      if (!harvest) {
        throw new Error('Harvest not found');
      }

      // Extract or generate YAML from harvest
      let seedYaml = '';
      if (harvest.farmConfig && harvest.farmConfig.yaml) {
        seedYaml = harvest.farmConfig.yaml;
      } else {
        // Generate YAML from harvest data
        const yamlRequest = {
          prompt: harvest.description || `Create a farm based on ${harvest.name}`,
          mode: 'farm' as const,
          constraints: {
            maxAgents: harvest.summary?.agents?.length || 3
          }
        };
        const yamlResponse = await yamlGenerator.generateYaml(yamlRequest);
        seedYaml = yamlResponse.yaml;
      }

      // Add additional prompt if provided
      if (input.additionalPrompt && input.additionalPrompt.trim()) {
        seedYaml = this.insertAdditionalPrompt(seedYaml, input.additionalPrompt);
      }

      // Prepare barn data from harvest
      const barnData = {
        harvestId,
        farmName: harvest.farmName,
        yield: harvest.yield || [],
        results: harvest.results || [],
        insights: harvest.insights || [],
        quality: harvest.quality || {},
        summary: harvest.summary || {},
        originalDescription: harvest.description
      };

      // Create the seed
      const seed: Seed = {
        id: randomUUID(),
        name: input.name,
        description: input.description || `Seed created from ${harvest.name} harvest`,
        yaml: seedYaml,
        farmType: this.detectFarmType(seedYaml),
        category: input.category || harvest.category || 'harvest-derived',
        tags: [...(input.tags || []), 'harvest-derived', harvest.farmName || 'unknown-farm'],
        usage: { count: 0, successRate: 100 },
        metadata: this.extractMetadataFromYaml(seedYaml),
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: userId,
        isPublic: input.isPublic || false,
        isOfficial: false
      };

      // Store in memory
      this.seeds.set(seed.id, seed);

      // Store in database with harvest linking
      if (db) {
        try {
          await db.query(
            `INSERT INTO seeds (id, name, description, yaml, farm_type, category, tags, 
             usage_count, success_rate, agent_count, estimated_duration, required_capabilities,
             created_by, is_public, is_official, harvest_id, barn_data, additional_prompt,
             source_type, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
            [
              seed.id, seed.name, seed.description, seed.yaml, seed.farmType,
              seed.category, seed.tags, seed.usage.count, seed.usage.successRate,
              seed.metadata.agentCount, seed.metadata.estimatedDuration,
              seed.metadata.requiredCapabilities, seed.createdBy, seed.isPublic,
              seed.isOfficial, harvestId, JSON.stringify(barnData), 
              input.additionalPrompt, 'harvest_completion', seed.createdAt, seed.updatedAt
            ]
          );
        } catch (dbError) {
          logger.warn('Failed to persist harvest-derived seed to database:', dbError);
        }
      }

      logger.info(`Created seed from harvest: ${seed.id} - ${seed.name} (from harvest ${harvestId})`);
      return seed;
    } catch (error) {
      logger.error('Failed to create seed from harvest:', error);
      throw new Error(`Failed to create seed from harvest: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a seed from a harvest stored in the barn
   */
  async createFromBarnHarvest(
    harvestId: string,
    input: {
      name: string;
      description?: string;
      additionalPrompt?: string;
      category?: string;
      tags?: string[];
      isPublic?: boolean;
    },
    userId: string
  ): Promise<Seed> {
    try {
      // This is similar to createFromHarvest but from barn context
      // We'll reuse the same logic but mark it as barn_harvest source
      const seed = await this.createFromHarvest(harvestId, input, userId);
      
      // Update the source type in database
      if (db) {
        try {
          await db.query(
            'UPDATE seeds SET source_type = $1 WHERE id = $2',
            ['barn_harvest', seed.id]
          );
        } catch (dbError) {
          logger.warn('Failed to update seed source type in database:', dbError);
        }
      }

      logger.info(`Created seed from barn harvest: ${seed.id} - ${seed.name} (from harvest ${harvestId})`);
      return seed;
    } catch (error) {
      logger.error('Failed to create seed from barn harvest:', error);
      throw new Error(`Failed to create seed from barn harvest: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add or update additional prompt in an existing seed
   */
  async enhancePrompt(
    seedId: string,
    additionalPrompt: string,
    userId: string
  ): Promise<Seed> {
    try {
      const seed = this.seeds.get(seedId);
      if (!seed) {
        throw new Error('Seed not found');
      }

      if (seed.createdBy !== userId && !seed.isPublic) {
        throw new Error('Cannot modify this seed');
      }

      // Insert additional prompt into YAML
      const enhancedYaml = this.insertAdditionalPrompt(seed.yaml, additionalPrompt);

      const updatedSeed: Seed = {
        ...seed,
        yaml: enhancedYaml,
        updatedAt: new Date()
      };

      this.seeds.set(seedId, updatedSeed);

      // Update in database
      if (db) {
        try {
          await db.query(
            'UPDATE seeds SET yaml = $1, additional_prompt = $2, updated_at = $3 WHERE id = $4',
            [enhancedYaml, additionalPrompt, updatedSeed.updatedAt, seedId]
          );
        } catch (dbError) {
          logger.warn('Failed to update seed prompt in database:', dbError);
        }
      }

      logger.info(`Enhanced seed prompt: ${seedId}`);
      return updatedSeed;
    } catch (error) {
      logger.error('Failed to enhance seed prompt:', error);
      throw new Error(`Failed to enhance seed prompt: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Insert additional prompt into YAML after the original prompt
   */
  private insertAdditionalPrompt(yamlContent: string, additionalPrompt: string): string {
    try {
      // Parse the YAML to find the initial_prompt field
      const yamlObj = yaml.load(yamlContent) as any;
      
      if (yamlObj && yamlObj.initial_prompt) {
        // Append additional prompt to the existing initial_prompt
        yamlObj.initial_prompt = `${yamlObj.initial_prompt}\n\n📝 **Additional Instructions:**\n${additionalPrompt}`;
      } else {
        // If no initial_prompt field, add one with the additional prompt
        yamlObj.initial_prompt = `📝 **Additional Instructions:**\n${additionalPrompt}`;
      }

      // Convert back to YAML
      return yaml.dump(yamlObj, {
        indent: 2,
        lineWidth: 80,
        noRefs: true
      });
    } catch (error) {
      logger.warn('Failed to parse YAML for prompt insertion, appending as comment:', error);
      // Fallback: append as a comment at the end
      return `${yamlContent}\n\n# Additional Instructions:\n# ${additionalPrompt.split('\n').join('\n# ')}`;
    }
  }

  /**
   * Detect farm type from YAML content
   */
  private detectFarmType(yamlContent: string): 'sequential' | 'collaborative' | 'autonomous' {
    const yamlLower = yamlContent.toLowerCase();
    
    if (yamlLower.includes('autonomous') || yamlLower.includes('autonomy')) {
      return 'autonomous';
    }
    if (yamlLower.includes('collaborative') || yamlLower.includes('coordination')) {
      return 'collaborative';
    }
    return 'sequential'; // Default
  }

  /**
   * Get seeds created from harvests with harvest information
   */
  async findHarvestDerivedSeeds(userId?: string): Promise<Array<Seed & { harvestInfo?: any }>> {
    try {
      if (!db) {
        // Fallback to in-memory seeds
        return Array.from(this.seeds.values()).filter(seed => 
          seed.tags.includes('harvest-derived')
        );
      }

      const query = `
        SELECT s.*, h.name as harvest_name, h.farm_name, h.type as harvest_type,
               h.created_at as harvest_created_at, s.barn_data
        FROM seeds s
        LEFT JOIN harvests h ON s.harvest_id = h.id
        WHERE s.source_type IN ('harvest_completion', 'barn_harvest')
        ${userId ? 'AND s.created_by = $1' : ''}
        ORDER BY s.created_at DESC
      `;
      
      const result = await db.query(query, userId ? [userId] : []);
      
      return result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        yaml: row.yaml,
        farmType: row.farm_type,
        category: row.category,
        tags: row.tags || [],
        usage: {
          count: row.usage_count || 0,
          successRate: row.success_rate || 100,
          lastUsed: row.last_used
        },
        metadata: {
          agentCount: row.agent_count || 1,
          estimatedDuration: row.estimated_duration,
          requiredCapabilities: row.required_capabilities || []
        },
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        createdBy: row.created_by,
        isPublic: row.is_public,
        isOfficial: row.is_official,
        harvestInfo: {
          harvestId: row.harvest_id,
          harvestName: row.harvest_name,
          farmName: row.farm_name,
          harvestType: row.harvest_type,
          harvestCreatedAt: row.harvest_created_at,
          barnData: row.barn_data
        }
      }));
    } catch (error) {
      logger.error('Failed to get harvest-derived seeds:', error);
      return [];
    }
  }
}

export const seedService = new SeedService();