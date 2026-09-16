import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { Seed, SeedCreateInput, SeedUpdateInput } from '../types/seed';
import { yamlParser } from './yamlParser';

class SeedManager extends EventEmitter {
  private seeds: Map<string, Seed> = new Map();
  private userSeeds: Map<string, Set<string>> = new Map();
  private publicSeeds: Set<string> = new Set();
  private officialSeeds: Map<string, Seed> = new Map();

  constructor() {
    super();
    this.initializeOfficialSeeds();
  }

  private initializeOfficialSeeds() {
    // Add official seed templates
    const officialSeeds = [
      {
        name: 'Web Development Farm',
        description: 'Full-stack web application development with testing',
        yaml: `name: Web Development Farm
type: collaborative
agents:
  - name: Frontend Developer
    type: builder
    capabilities: [React, TypeScript, Tailwind CSS]
    tasks:
      - Setup React project structure
      - Implement UI components
      - Add routing and state management
  - name: Backend Developer
    type: builder
    capabilities: [Node.js, Express, PostgreSQL]
    tasks:
      - Create API endpoints
      - Setup database schema
      - Implement authentication
  - name: QA Engineer
    type: tester
    capabilities: [Jest, Cypress, Testing]
    tasks:
      - Write unit tests
      - Create E2E tests
      - Performance testing`,
        farmType: 'collaborative' as const,
        category: 'Development'
      },
      {
        name: 'Code Review Pipeline',
        description: 'Automated code review and quality checks',
        yaml: `name: Code Review Pipeline
type: sequential
agents:
  - name: Linter
    type: analyzer
    capabilities: [ESLint, Prettier, Code Quality]
    tasks:
      - Run code linting
      - Check formatting
      - Identify code smells
  - name: Security Scanner
    type: analyzer
    capabilities: [Security, Vulnerability Detection]
    tasks:
      - Scan for vulnerabilities
      - Check dependencies
      - Security best practices
  - name: Performance Analyzer
    type: analyzer
    capabilities: [Performance, Optimization]
    tasks:
      - Analyze bundle size
      - Check render performance
      - Identify bottlenecks`,
        farmType: 'sequential' as const,
        category: 'Quality'
      },
      {
        name: 'AI Research Farm',
        description: 'Autonomous research and experimentation',
        yaml: `name: AI Research Farm
type: autonomous
agents:
  - name: Research Explorer
    type: researcher
    capabilities: [Research, Analysis, Discovery]
    autonomy:
      creativityLevel: 8
      explorationDepth: deep
    boundaries:
      - Stay within research topic
      - Document all findings
      - Validate sources
  - name: Experiment Designer
    type: builder
    capabilities: [Experimentation, Testing, Validation]
    autonomy:
      creativityLevel: 7
      experimentLimit: 10
  - name: Results Analyzer
    type: analyzer
    capabilities: [Data Analysis, Reporting]
    tasks:
      - Analyze experiment results
      - Generate insights
      - Create summary report`,
        farmType: 'autonomous' as const,
        category: 'Research'
      }
    ];

    officialSeeds.forEach(seedData => {
      const id = uuidv4();
      const seed: Seed = {
        id,
        name: seedData.name,
        description: seedData.description,
        yaml: seedData.yaml,
        farmType: seedData.farmType,
        category: seedData.category,
        tags: [seedData.category.toLowerCase(), 'official', seedData.farmType],
        usageCount: 0,
        successRate: 100,
        agentCount: this.extractAgentCount(seedData.yaml),
        requiredCapabilities: this.extractCapabilities(seedData.yaml),
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'system',
        isPublic: true,
        isOfficial: true
      };
      
      this.officialSeeds.set(id, seed);
      this.publicSeeds.add(id);
    });
  }

  async createSeed(input: SeedCreateInput): Promise<Seed> {
    const seedId = uuidv4();
    
    // Validate YAML
    try {
      await yamlParser.parse(input.yaml);
    } catch (error) {
      throw new Error(`Invalid YAML: ${error.message}`);
    }

    const seed: Seed = {
      id: seedId,
      name: input.name,
      description: input.description,
      yaml: input.yaml,
      farmType: input.farmType,
      category: input.category || 'Custom',
      tags: input.tags || [],
      usageCount: 0,
      successRate: 100,
      agentCount: this.extractAgentCount(input.yaml),
      requiredCapabilities: this.extractCapabilities(input.yaml),
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: input.userId,
      isPublic: input.isPublic || false,
      isOfficial: false
    };

    // Store the seed
    this.seeds.set(seedId, seed);
    
    // Add to user's seeds
    if (!this.userSeeds.has(input.userId)) {
      this.userSeeds.set(input.userId, new Set());
    }
    this.userSeeds.get(input.userId)!.add(seedId);

    // Add to public seeds if applicable
    if (seed.isPublic) {
      this.publicSeeds.add(seedId);
    }

    this.emit('seed:created', seed);

    return seed;
  }

  async getUserSeeds(userId: string, includePublic: boolean = true): Promise<Seed[]> {
    const seeds: Seed[] = [];
    
    // Get user's private seeds
    const userSeedIds = this.userSeeds.get(userId) || new Set();
    for (const seedId of userSeedIds) {
      const seed = this.seeds.get(seedId);
      if (seed) {
        seeds.push(seed);
      }
    }

    // Add public and official seeds if requested
    if (includePublic) {
      // Add official seeds
      for (const seed of this.officialSeeds.values()) {
        seeds.push(seed);
      }

      // Add other public seeds
      for (const seedId of this.publicSeeds) {
        if (!userSeedIds.has(seedId) && !this.officialSeeds.has(seedId)) {
          const seed = this.seeds.get(seedId);
          if (seed) {
            seeds.push(seed);
          }
        }
      }
    }

    return seeds.sort((a, b) => {
      // Sort by official first, then usage count, then name
      if (a.isOfficial && !b.isOfficial) return -1;
      if (!a.isOfficial && b.isOfficial) return 1;
      if (a.usageCount !== b.usageCount) return b.usageCount - a.usageCount;
      return a.name.localeCompare(b.name);
    });
  }

  async getSeed(seedId: string, userId: string): Promise<Seed | null> {
    // Check official seeds first
    const officialSeed = this.officialSeeds.get(seedId);
    if (officialSeed) {
      return officialSeed;
    }

    const seed = this.seeds.get(seedId);
    
    if (!seed) {
      return null;
    }

    // Check if user has access
    if (seed.userId !== userId && !seed.isPublic) {
      return null;
    }

    return seed;
  }

  async updateSeed(
    seedId: string, 
    userId: string, 
    updates: SeedUpdateInput
  ): Promise<Seed | null> {
    const seed = this.seeds.get(seedId);
    
    if (!seed || seed.userId !== userId) {
      return null;
    }

    // Don't allow updating official seeds
    if (seed.isOfficial) {
      throw new Error('Cannot update official seeds');
    }

    // Validate YAML if provided
    if (updates.yaml) {
      try {
        await yamlParser.parse(updates.yaml);
      } catch (error) {
        throw new Error(`Invalid YAML: ${error.message}`);
      }
    }

    // Update seed properties
    if (updates.name !== undefined) seed.name = updates.name;
    if (updates.description !== undefined) seed.description = updates.description;
    if (updates.yaml !== undefined) {
      seed.yaml = updates.yaml;
      seed.agentCount = this.extractAgentCount(updates.yaml);
      seed.requiredCapabilities = this.extractCapabilities(updates.yaml);
    }
    if (updates.category !== undefined) seed.category = updates.category;
    if (updates.tags !== undefined) seed.tags = updates.tags;
    if (updates.isPublic !== undefined) {
      seed.isPublic = updates.isPublic;
      if (updates.isPublic) {
        this.publicSeeds.add(seedId);
      } else {
        this.publicSeeds.delete(seedId);
      }
    }

    seed.updatedAt = new Date();

    this.emit('seed:updated', seed);

    return seed;
  }

  async deleteSeed(seedId: string, userId: string): Promise<boolean> {
    const seed = this.seeds.get(seedId);
    
    if (!seed || seed.userId !== userId) {
      return false;
    }

    // Don't allow deleting official seeds
    if (seed.isOfficial) {
      return false;
    }

    // Remove seed
    this.seeds.delete(seedId);
    this.userSeeds.get(userId)?.delete(seedId);
    this.publicSeeds.delete(seedId);

    this.emit('seed:deleted', { id: seedId, userId });

    return true;
  }

  async recordSeedUsage(seedId: string, success: boolean): Promise<void> {
    const seed = this.seeds.get(seedId) || this.officialSeeds.get(seedId);
    
    if (!seed) {
      return;
    }

    seed.usageCount++;
    seed.lastUsedAt = new Date();
    
    // Update success rate
    const totalUsage = seed.usageCount;
    const previousSuccessCount = Math.round((seed.successRate / 100) * (totalUsage - 1));
    const newSuccessCount = previousSuccessCount + (success ? 1 : 0);
    seed.successRate = Math.round((newSuccessCount / totalUsage) * 100);

    this.emit('seed:used', { seedId, success });
  }

  getCategories(): string[] {
    const categories = new Set<string>();
    
    // Add categories from all seeds
    for (const seed of this.seeds.values()) {
      categories.add(seed.category);
    }
    for (const seed of this.officialSeeds.values()) {
      categories.add(seed.category);
    }

    return Array.from(categories).sort();
  }

  private extractAgentCount(yaml: string): number {
    const matches = yaml.match(/^\s*-\s+name:/gm);
    return matches ? matches.length : 0;
  }

  private extractCapabilities(yaml: string): string[] {
    const capabilities = new Set<string>();
    const matches = yaml.match(/capabilities:\s*\[(.*?)\]/g);
    
    if (matches) {
      matches.forEach(match => {
        const caps = match.replace(/capabilities:\s*\[/, '').replace(']', '');
        caps.split(',').forEach(cap => {
          capabilities.add(cap.trim().replace(/['"]/g, ''));
        });
      });
    }

    return Array.from(capabilities);
  }

  // Utility method for testing
  async clearAllSeeds(): Promise<void> {
    this.seeds.clear();
    this.userSeeds.clear();
    this.publicSeeds.clear();
    // Re-initialize official seeds
    this.officialSeeds.clear();
    this.initializeOfficialSeeds();
  }
}

export const seedManager = new SeedManager();