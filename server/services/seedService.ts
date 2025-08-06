import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import { db } from '../database/client';
import { Seed, SeedCreateInput, SeedUpdateInput, SeedFilter } from '../../src/types/seed';

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
}

export const seedService = new SeedService();