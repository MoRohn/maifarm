/**
 * Comprehensive Test Data Factory for MaiFarm
 * Generates realistic test data for all components and scenarios
 */

import { Farm, Agent, Harvest, Seed, User, WebSocketMessage } from '../../src/types';
import { faker } from '@faker-js/faker';

export class TestDataFactory {
  private static instance: TestDataFactory;
  private seedValue: number = 12345;

  private constructor() {
    // Set faker seed for reproducible data
    faker.seed(this.seedValue);
  }

  static getInstance(): TestDataFactory {
    if (!TestDataFactory.instance) {
      TestDataFactory.instance = new TestDataFactory();
    }
    return TestDataFactory.instance;
  }

  setSeed(seed: number): void {
    this.seedValue = seed;
    faker.seed(seed);
  }

  // User Data Factory
  createUser(overrides: Partial<User> = {}): User {
    return {
      id: faker.string.uuid(),
      username: faker.internet.userName(),
      email: faker.internet.email(),
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      avatar: faker.image.avatar(),
      role: faker.helpers.arrayElement(['admin', 'user', 'viewer']),
      preferences: this.createUserPreferences(),
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      lastLogin: faker.date.recent(),
      isActive: faker.datatype.boolean(0.9),
      ...overrides
    };
  }

  createUserPreferences() {
    return {
      theme: faker.helpers.arrayElement(['light', 'dark', 'system']),
      notifications: {
        enabled: faker.datatype.boolean(0.8),
        sound: faker.datatype.boolean(0.6),
        desktop: faker.datatype.boolean(0.7),
        email: faker.datatype.boolean(0.5),
        categories: {
          farmComplete: faker.datatype.boolean(0.9),
          agentError: faker.datatype.boolean(0.8),
          systemUpdate: faker.datatype.boolean(0.4),
          aiDiscovery: faker.datatype.boolean(0.6)
        },
        quietHours: {
          enabled: faker.datatype.boolean(0.3),
          start: '22:00',
          end: '08:00'
        }
      },
      dashboard: {
        layout: faker.helpers.arrayElement(['grid', 'list']),
        density: faker.helpers.arrayElement(['comfortable', 'compact']),
        autoRefresh: faker.datatype.boolean(0.7),
        refreshInterval: faker.helpers.arrayElement([5000, 10000, 30000])
      },
      goWild: {
        creativityLevel: faker.number.float({ min: 0, max: 1, precision: 0.1 }),
        explorationDepth: faker.number.int({ min: 1, max: 10 }),
        maxDuration: faker.number.int({ min: 30, max: 300 })
      }
    };
  }

  // Farm Data Factory
  createFarm(overrides: Partial<Farm> = {}): Farm {
    const agentCount = faker.number.int({ min: 1, max: 8 });
    
    return {
      id: faker.string.uuid(),
      name: `${faker.word.adjective()} ${faker.word.noun()} Farm`,
      description: faker.lorem.sentence(),
      type: faker.helpers.arrayElement(['sequential', 'collaborative', 'autonomous']),
      status: faker.helpers.arrayElement(['idle', 'launching', 'running', 'stopping', 'error']),
      config: {
        maxAgents: agentCount,
        autoScale: faker.datatype.boolean(0.4),
        timeout: faker.number.int({ min: 300, max: 3600 }),
        yaml: this.createYamlConfig(agentCount),
        parsedYaml: this.createParsedYaml(agentCount)
      },
      agents: Array.from({ length: agentCount }, () => this.createAgent()),
      metrics: this.createFarmMetrics(),
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      userId: faker.string.uuid(),
      createdBy: faker.internet.userName(),
      tags: faker.helpers.arrayElements(['test', 'production', 'experiment', 'demo'], { min: 0, max: 3 }),
      ...overrides
    };
  }

  createYamlConfig(agentCount: number): string {
    const agents = Array.from({ length: agentCount }, (_, i) => ({
      name: `Agent ${i + 1}`,
      type: faker.helpers.arrayElement(['developer', 'tester', 'reviewer', 'analyst']),
      tasks: faker.helpers.arrayElements(['analyze', 'implement', 'test', 'review', 'optimize'], { min: 1, max: 3 }),
      capabilities: faker.helpers.arrayElements(['coding', 'debugging', 'testing', 'documentation'], { min: 1, max: 2 })
    }));

    return `
agents:
${agents.map(agent => `  - name: "${agent.name}"
    type: "${agent.type}"
    tasks: [${agent.tasks.map(t => `"${t}"`).join(', ')}]
    capabilities: [${agent.capabilities.map(c => `"${c}"`).join(', ')}]`).join('\n')}

workflow:
  type: "${faker.helpers.arrayElement(['sequential', 'parallel', 'hybrid'])}"
  timeout: ${faker.number.int({ min: 300, max: 1800 })}
  retry_count: ${faker.number.int({ min: 1, max: 3 })}

settings:
  collaboration_enabled: ${faker.datatype.boolean()}
  output_format: "${faker.helpers.arrayElement(['json', 'yaml', 'text'])}"
  logging_level: "${faker.helpers.arrayElement(['info', 'debug', 'warn'])}"
`.trim();
  }

  createParsedYaml(agentCount: number) {
    return {
      agents: Array.from({ length: agentCount }, (_, i) => ({
        name: `Agent ${i + 1}`,
        type: faker.helpers.arrayElement(['developer', 'tester', 'reviewer']),
        tasks: faker.helpers.arrayElements(['analyze', 'implement', 'test'], { min: 1, max: 2 })
      })),
      workflow: {
        type: faker.helpers.arrayElement(['sequential', 'parallel']),
        timeout: faker.number.int({ min: 300, max: 1800 })
      }
    };
  }

  createFarmMetrics() {
    const total = faker.number.int({ min: 0, max: 100 });
    const completed = faker.number.int({ min: 0, max: total });
    const failed = faker.number.int({ min: 0, max: total - completed });
    
    return {
      tasksCompleted: completed,
      tasksRunning: total - completed - failed,
      tasksFailed: failed,
      averageTaskTime: faker.number.float({ min: 1, max: 300, precision: 0.1 }),
      successRate: total > 0 ? (completed / total) * 100 : 100,
      resourceUtilization: faker.number.float({ min: 0, max: 100, precision: 0.1 })
    };
  }

  // Agent Data Factory
  createAgent(overrides: Partial<Agent> = {}): Agent {
    const taskCount = faker.number.int({ min: 0, max: 10 });
    
    return {
      id: faker.string.uuid(),
      name: `${faker.word.adjective()} ${faker.helpers.arrayElement(['Agent', 'Bot', 'Assistant'])}`,
      status: faker.helpers.arrayElement(['idle', 'starting', 'running', 'working', 'error']),
      type: faker.helpers.arrayElement(['general', 'specialized', 'coordinator']),
      capabilities: faker.helpers.arrayElements(['coding', 'testing', 'analysis', 'documentation'], { min: 1, max: 3 }),
      tasks: Array.from({ length: taskCount }, () => this.createTask()),
      metrics: {
        tasksCompleted: faker.number.int({ min: 0, max: 50 }),
        tasksFailed: faker.number.int({ min: 0, max: 5 }),
        averageResponseTime: faker.number.float({ min: 0.5, max: 10, precision: 0.1 }),
        uptime: faker.number.float({ min: 0, max: 100, precision: 0.1 })
      },
      config: {
        maxConcurrentTasks: faker.number.int({ min: 1, max: 5 }),
        timeout: faker.number.int({ min: 30, max: 300 }),
        retryAttempts: faker.number.int({ min: 1, max: 3 })
      },
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      ...overrides
    };
  }

  createTask() {
    return {
      id: faker.string.uuid(),
      title: faker.hacker.phrase(),
      description: faker.lorem.sentence(),
      status: faker.helpers.arrayElement(['pending', 'running', 'completed', 'failed']),
      priority: faker.helpers.arrayElement(['low', 'normal', 'high', 'critical']),
      estimatedDuration: faker.number.int({ min: 1, max: 120 }),
      actualDuration: faker.number.int({ min: 1, max: 150 }),
      createdAt: faker.date.past(),
      completedAt: faker.date.recent()
    };
  }

  // Harvest Data Factory
  createHarvest(overrides: Partial<Harvest> = {}): Harvest {
    const artifactCount = faker.number.int({ min: 1, max: 20 });
    
    return {
      id: faker.string.uuid(),
      farmId: faker.string.uuid(),
      name: `Harvest ${faker.date.recent().toLocaleDateString()}`,
      description: faker.lorem.paragraph(),
      status: faker.helpers.arrayElement(['collecting', 'processing', 'completed', 'failed']),
      artifacts: Array.from({ length: artifactCount }, () => this.createArtifact()),
      metrics: {
        totalArtifacts: artifactCount,
        successfulExtractions: faker.number.int({ min: 0, max: artifactCount }),
        processingTime: faker.number.float({ min: 1, max: 60, precision: 0.1 }),
        dataSize: faker.number.int({ min: 1024, max: 1024 * 1024 * 10 }) // 1KB to 10MB
      },
      insights: this.createInsights(),
      createdAt: faker.date.past(),
      completedAt: faker.date.recent(),
      userId: faker.string.uuid(),
      ...overrides
    };
  }

  createArtifact() {
    return {
      id: faker.string.uuid(),
      type: faker.helpers.arrayElement(['code', 'documentation', 'test', 'configuration', 'log']),
      name: faker.system.fileName(),
      content: faker.lorem.paragraphs(3),
      size: faker.number.int({ min: 100, max: 10000 }),
      language: faker.helpers.arrayElement(['typescript', 'javascript', 'python', 'markdown', 'yaml']),
      metadata: {
        author: faker.internet.userName(),
        createdAt: faker.date.past(),
        lastModified: faker.date.recent(),
        version: faker.system.semver()
      },
      quality: {
        score: faker.number.float({ min: 0, max: 100, precision: 0.1 }),
        issues: faker.number.int({ min: 0, max: 5 }),
        suggestions: faker.number.int({ min: 0, max: 3 })
      }
    };
  }

  createInsights() {
    return {
      summary: faker.lorem.paragraph(),
      keyFindings: faker.helpers.arrayElements([
        'Improved performance by 25%',
        'Reduced code duplication',
        'Enhanced error handling',
        'Better test coverage',
        'Optimized database queries'
      ], { min: 1, max: 3 }),
      recommendations: faker.helpers.arrayElements([
        'Add more unit tests',
        'Implement caching layer',
        'Refactor legacy code',
        'Update dependencies',
        'Improve documentation'
      ], { min: 1, max: 3 }),
      metrics: {
        codeQuality: faker.number.float({ min: 60, max: 100, precision: 0.1 }),
        testCoverage: faker.number.float({ min: 40, max: 95, precision: 0.1 }),
        performance: faker.number.float({ min: 70, max: 100, precision: 0.1 })
      }
    };
  }

  // Seed Data Factory
  createSeed(overrides: Partial<Seed> = {}): Seed {
    return {
      id: faker.string.uuid(),
      name: `${faker.word.adjective()} ${faker.word.noun()} Seed`,
      description: faker.lorem.sentence(),
      category: faker.helpers.arrayElement(['development', 'testing', 'analysis', 'automation']),
      template: this.createSeedTemplate(),
      metadata: {
        author: faker.internet.userName(),
        version: faker.system.semver(),
        tags: faker.helpers.arrayElements(['javascript', 'react', 'testing', 'ci/cd'], { min: 1, max: 3 }),
        difficulty: faker.helpers.arrayElement(['beginner', 'intermediate', 'advanced']),
        estimatedTime: faker.number.int({ min: 5, max: 120 })
      },
      config: {
        requiredCapabilities: faker.helpers.arrayElements(['coding', 'testing', 'analysis'], { min: 1, max: 2 }),
        maxAgents: faker.number.int({ min: 1, max: 5 }),
        timeout: faker.number.int({ min: 300, max: 1800 })
      },
      usage: {
        timesUsed: faker.number.int({ min: 0, max: 100 }),
        averageRating: faker.number.float({ min: 1, max: 5, precision: 0.1 }),
        lastUsed: faker.date.recent()
      },
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      userId: faker.string.uuid(),
      isPublic: faker.datatype.boolean(0.7),
      ...overrides
    };
  }

  createSeedTemplate() {
    return {
      yaml: this.createYamlConfig(faker.number.int({ min: 2, max: 4 })),
      variables: [
        { name: 'projectName', type: 'string', default: 'MyProject' },
        { name: 'language', type: 'select', options: ['typescript', 'javascript', 'python'] },
        { name: 'includeTests', type: 'boolean', default: true }
      ],
      steps: [
        { id: '1', name: 'Setup', description: 'Initialize project structure' },
        { id: '2', name: 'Implement', description: 'Build core functionality' },
        { id: '3', name: 'Test', description: 'Add comprehensive tests' },
        { id: '4', name: 'Review', description: 'Code review and optimization' }
      ]
    };
  }

  // WebSocket Message Factory
  createWebSocketMessage(overrides: Partial<WebSocketMessage> = {}): WebSocketMessage {
    const messageTypes = [
      'farm:status', 'farm:created', 'farm:updated', 'farm:deleted',
      'agent:status', 'agent:updated', 'agent:output',
      'harvest:ready', 'harvest:completed',
      'task:progress', 'task:completed',
      'metrics:update', 'system:notification'
    ];

    return {
      type: faker.helpers.arrayElement(messageTypes),
      payload: this.createWebSocketPayload(),
      timestamp: new Date(),
      id: faker.string.uuid(),
      userId: faker.string.uuid(),
      ...overrides
    };
  }

  createWebSocketPayload() {
    return {
      id: faker.string.uuid(),
      status: faker.helpers.arrayElement(['success', 'error', 'warning', 'info']),
      message: faker.lorem.sentence(),
      data: {
        progress: faker.number.float({ min: 0, max: 100, precision: 0.1 }),
        details: faker.lorem.words(5),
        timestamp: new Date()
      }
    };
  }

  // Analytics Data Factory
  createAnalyticsData() {
    const dates = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date;
    }).reverse();

    return {
      farmMetrics: dates.map(date => ({
        date,
        farmsCreated: faker.number.int({ min: 0, max: 20 }),
        farmsCompleted: faker.number.int({ min: 0, max: 15 }),
        avgDuration: faker.number.float({ min: 30, max: 300, precision: 0.1 }),
        successRate: faker.number.float({ min: 80, max: 100, precision: 0.1 })
      })),
      agentMetrics: dates.map(date => ({
        date,
        totalAgents: faker.number.int({ min: 10, max: 100 }),
        activeAgents: faker.number.int({ min: 5, max: 80 }),
        avgResponseTime: faker.number.float({ min: 0.5, max: 5, precision: 0.1 }),
        errorRate: faker.number.float({ min: 0, max: 10, precision: 0.1 })
      })),
      harvestMetrics: dates.map(date => ({
        date,
        harvestsCollected: faker.number.int({ min: 0, max: 50 }),
        artifactsProcessed: faker.number.int({ min: 0, max: 500 }),
        avgProcessingTime: faker.number.float({ min: 1, max: 60, precision: 0.1 }),
        storageUsed: faker.number.int({ min: 1024, max: 1024 * 1024 * 100 })
      }))
    };
  }

  // Batch Data Creation Methods
  createFarms(count: number, overrides: Partial<Farm> = {}): Farm[] {
    return Array.from({ length: count }, () => this.createFarm(overrides));
  }

  createAgents(count: number, overrides: Partial<Agent> = {}): Agent[] {
    return Array.from({ length: count }, () => this.createAgent(overrides));
  }

  createHarvests(count: number, overrides: Partial<Harvest> = {}): Harvest[] {
    return Array.from({ length: count }, () => this.createHarvest(overrides));
  }

  createSeeds(count: number, overrides: Partial<Seed> = {}): Seed[] {
    return Array.from({ length: count }, () => this.createSeed(overrides));
  }

  createUsers(count: number, overrides: Partial<User> = {}): User[] {
    return Array.from({ length: count }, () => this.createUser(overrides));
  }

  // Scenario-specific Data
  createLoadTestScenario() {
    return {
      users: this.createUsers(10),
      farms: this.createFarms(50, { status: 'running' }),
      agents: this.createAgents(200, { status: 'working' }),
      harvests: this.createHarvests(100, { status: 'completed' }),
      seeds: this.createSeeds(25)
    };
  }

  createErrorScenario() {
    return {
      farms: this.createFarms(5, { status: 'error' }),
      agents: this.createAgents(20, { status: 'error' }),
      harvests: this.createHarvests(3, { status: 'failed' })
    };
  }

  createEmptyStateScenario() {
    return {
      farms: [],
      agents: [],
      harvests: [],
      seeds: []
    };
  }

  // Reset and utility methods
  reset(): void {
    faker.seed(this.seedValue);
  }

  generateTestDatabase() {
    return {
      users: this.createUsers(20),
      farms: this.createFarms(100),
      agents: this.createAgents(500),
      harvests: this.createHarvests(200),
      seeds: this.createSeeds(50),
      analytics: this.createAnalyticsData()
    };
  }
}

// Export singleton instance
export const testDataFactory = TestDataFactory.getInstance();

// Export commonly used factory functions
export const createTestFarm = (overrides?: Partial<Farm>) => testDataFactory.createFarm(overrides);
export const createTestAgent = (overrides?: Partial<Agent>) => testDataFactory.createAgent(overrides);
export const createTestHarvest = (overrides?: Partial<Harvest>) => testDataFactory.createHarvest(overrides);
export const createTestSeed = (overrides?: Partial<Seed>) => testDataFactory.createSeed(overrides);
export const createTestUser = (overrides?: Partial<User>) => testDataFactory.createUser(overrides);