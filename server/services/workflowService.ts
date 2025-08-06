import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/connection';
import { orchestrator } from '../orchestrator';
import { harvestService } from './harvestService';
import { barnService } from './barnService';
import { WebSocketServer } from '../websocket/socketServer';

export interface WorkflowOptions {
  seedId: string;
  farmName: string;
  farmDescription?: string;
  config?: any;
  userId: string;
  autoHarvest?: boolean;
  autoStore?: boolean;
}

export interface WorkflowResult {
  workflowId: string;
  seed: {
    id: string;
    name: string;
    category: string;
  };
  farm: {
    id: string;
    name: string;
    status: string;
  };
  harvest?: {
    id: string;
    status: string;
  };
  barn?: {
    id: string;
    entryCount: number;
  };
}

export interface WorkflowStatus {
  workflowId: string;
  status: 'initializing' | 'planting' | 'growing' | 'harvesting' | 'storing' | 'completed' | 'failed';
  currentStep: string;
  progress: number;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

class WorkflowService extends EventEmitter {
  private activeWorkflows: Map<string, WorkflowStatus> = new Map();
  private wsServer?: WebSocketServer;

  setWebSocketServer(wsServer: WebSocketServer) {
    this.wsServer = wsServer;
  }

  async executeWorkflow(options: WorkflowOptions): Promise<WorkflowResult> {
    const workflowId = uuidv4();
    const startedAt = new Date();

    // Initialize workflow status
    const status: WorkflowStatus = {
      workflowId,
      status: 'initializing',
      currentStep: 'Validating seed',
      progress: 0,
      startedAt
    };
    this.activeWorkflows.set(workflowId, status);
    this.emitProgress(workflowId, status);

    try {
      // Step 1: Get seed details
      const seedResult = await db.query(
        'SELECT * FROM seeds WHERE id = $1 AND (user_id = $2 OR is_public = true)',
        [options.seedId, options.userId]
      );

      if (seedResult.rows.length === 0) {
        throw new Error('Seed not found or unauthorized');
      }

      const seed = seedResult.rows[0];
      this.updateWorkflowStatus(workflowId, {
        status: 'planting',
        currentStep: 'Creating farm from seed',
        progress: 20
      });

      // Step 2: Create farm from seed
      const farmId = uuidv4();
      const farmConfig = {
        maxAgents: options.config?.maxAgents || seed.config?.maxAgents || 5,
        resourceLimits: options.config?.resourceLimits || seed.config?.resourceLimits || {
          totalCpu: 8,
          totalMemory: 16384
        },
        orchestrationStrategy: options.config?.orchestrationStrategy || 'round-robin',
        yaml: seed.yaml,
        seedId: options.seedId,
        autoHarvest: options.autoHarvest !== false,
        ...options.config
      };

      const farmResult = await db.query(
        `INSERT INTO farms (id, name, description, status, config, metrics, tags, created_by, seed_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          farmId,
          options.farmName,
          options.farmDescription || `Farm created from seed: ${seed.name}`,
          'preparing',
          farmConfig,
          {
            totalTasks: 0,
            completedTasks: 0,
            failedTasks: 0,
            queuedTasks: 0,
            efficiency: 0,
            resourceUtilization: { cpu: 0, memory: 0 }
          },
          [...(seed.tags || []), 'from-seed', 'workflow'],
          options.userId,
          options.seedId
        ]
      );

      const farm = farmResult.rows[0];

      // Update seed usage
      await db.query(
        `UPDATE seeds 
         SET usage_count = usage_count + 1, 
             last_used = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [options.seedId]
      );

      this.updateWorkflowStatus(workflowId, {
        status: 'growing',
        currentStep: 'Starting farm operations',
        progress: 40
      });

      // Step 3: Start farm operations
      await db.query(
        'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
        ['running', new Date(), farmId]
      );

      // Initialize orchestrator for the farm
      await orchestrator.initializeFarm(farm);

      // If autoHarvest is enabled, set up harvest monitoring
      let harvestId: string | undefined;
      let barnEntries: any[] = [];

      if (options.autoHarvest !== false) {
        this.updateWorkflowStatus(workflowId, {
          status: 'harvesting',
          currentStep: 'Setting up automatic harvest',
          progress: 60
        });

        // Create harvest entry
        const harvest = await harvestService.startHarvest(farmId, farm.name, options.userId);
        harvestId = harvest.id;

        // Monitor farm for completion to trigger harvest
        this.monitorFarmForHarvest(farmId, harvestId, workflowId);

        if (options.autoStore !== false) {
          this.updateWorkflowStatus(workflowId, {
            status: 'storing',
            currentStep: 'Configuring barn storage',
            progress: 80
          });

          // Set up automatic barn storage when harvest completes
          this.on(`harvest:${harvestId}:completed`, async (harvestData) => {
            try {
              const entries = await barnService.storeHarvest(harvestData);
              barnEntries = entries;
              
              this.updateWorkflowStatus(workflowId, {
                status: 'completed',
                currentStep: 'Workflow completed successfully',
                progress: 100,
                completedAt: new Date()
              });
            } catch (error) {
              console.error('Error storing harvest in barn:', error);
            }
          });
        }
      }

      // Prepare result
      const result: WorkflowResult = {
        workflowId,
        seed: {
          id: seed.id,
          name: seed.name,
          category: seed.category
        },
        farm: {
          id: farm.id,
          name: farm.name,
          status: farm.status
        }
      };

      if (harvestId) {
        result.harvest = {
          id: harvestId,
          status: 'collecting'
        };
      }

      if (barnEntries.length > 0) {
        result.barn = {
          id: barnEntries[0].id,
          entryCount: barnEntries.length
        };
      }

      return result;
    } catch (error) {
      this.updateWorkflowStatus(workflowId, {
        status: 'failed',
        currentStep: 'Workflow failed',
        progress: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date()
      });
      throw error;
    }
  }

  private updateWorkflowStatus(workflowId: string, updates: Partial<WorkflowStatus>) {
    const status = this.activeWorkflows.get(workflowId);
    if (status) {
      Object.assign(status, updates);
      this.emitProgress(workflowId, status);
    }
  }

  private emitProgress(workflowId: string, status: WorkflowStatus) {
    this.emit('workflow:progress', { workflowId, ...status });
    this.wsServer?.broadcast('workflow:progress', { workflowId, ...status });
  }

  private async monitorFarmForHarvest(farmId: string, harvestId: string, workflowId: string) {
    // Set up monitoring for farm completion
    const checkInterval = setInterval(async () => {
      try {
        const farmResult = await db.query('SELECT status, metrics FROM farms WHERE id = $1', [farmId]);
        if (farmResult.rows.length > 0) {
          const farm = farmResult.rows[0];
          
          // Check if farm has completed its tasks
          if (farm.status === 'completed' || 
              (farm.metrics.totalTasks > 0 && 
               farm.metrics.completedTasks + farm.metrics.failedTasks >= farm.metrics.totalTasks)) {
            
            // Complete the harvest
            const harvestData = {
              farmId,
              farmName: farm.name,
              metrics: farm.metrics,
              completedAt: new Date()
            };

            await harvestService.completeHarvest(harvestId, farm.created_by, {
              data: harvestData,
              summary: `Harvested ${farm.metrics.completedTasks} completed tasks from farm`
            });

            this.emit(`harvest:${harvestId}:completed`, harvestData);
            clearInterval(checkInterval);
          }
        }
      } catch (error) {
        console.error('Error monitoring farm for harvest:', error);
      }
    }, 5000); // Check every 5 seconds

    // Clean up after 1 hour
    setTimeout(() => {
      clearInterval(checkInterval);
    }, 3600000);
  }

  getWorkflowStatus(workflowId: string): WorkflowStatus | undefined {
    return this.activeWorkflows.get(workflowId);
  }

  getAllActiveWorkflows(): WorkflowStatus[] {
    return Array.from(this.activeWorkflows.values());
  }

  async cancelWorkflow(workflowId: string): Promise<boolean> {
    const status = this.activeWorkflows.get(workflowId);
    if (!status || status.status === 'completed' || status.status === 'failed') {
      return false;
    }

    this.updateWorkflowStatus(workflowId, {
      status: 'failed',
      currentStep: 'Workflow cancelled by user',
      error: 'Cancelled by user',
      completedAt: new Date()
    });

    return true;
  }

  // Create demo seed templates
  async createDemoSeeds(userId: string) {
    const demoSeeds = [
      {
        name: 'Code Review Assistant',
        description: 'AI agents that perform comprehensive code reviews',
        category: 'development',
        farmType: 'collaborative' as const,
        yaml: `
name: Code Review Assistant
type: collaborative
agents:
  - name: syntax-checker
    role: Check code syntax and formatting
    skills: [typescript, javascript, python]
  - name: security-scanner
    role: Scan for security vulnerabilities
    skills: [security, owasp]
  - name: performance-analyzer
    role: Analyze performance implications
    skills: [performance, optimization]
workflow:
  - step: syntax-check
    agent: syntax-checker
  - step: security-scan
    agent: security-scanner
  - step: performance-analysis
    agent: performance-analyzer
`,
        tags: ['code-review', 'quality', 'demo']
      },
      {
        name: 'Documentation Generator',
        description: 'Automatically generate comprehensive documentation',
        category: 'documentation',
        farmType: 'sequential' as const,
        yaml: `
name: Documentation Generator
type: sequential
agents:
  - name: code-analyzer
    role: Analyze code structure and APIs
  - name: doc-writer
    role: Write clear documentation
  - name: example-creator
    role: Create usage examples
workflow:
  - analyze-code
  - generate-docs
  - create-examples
`,
        tags: ['documentation', 'automation', 'demo']
      },
      {
        name: 'Test Suite Builder',
        description: 'Build comprehensive test suites for your code',
        category: 'testing',
        farmType: 'autonomous' as const,
        yaml: `
name: Test Suite Builder
type: autonomous
agents:
  - name: test-planner
    role: Plan test strategy
  - name: unit-test-writer
    role: Write unit tests
  - name: integration-test-writer
    role: Write integration tests
configuration:
  coverage_target: 80
  test_framework: jest
`,
        tags: ['testing', 'quality', 'demo']
      }
    ];

    const createdSeeds = [];
    for (const seedData of demoSeeds) {
      try {
        const id = uuidv4();
        const result = await db.query(
          `INSERT INTO seeds (id, name, description, category, farm_type, yaml, tags, user_id, is_public, is_official)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (name, user_id) DO NOTHING
           RETURNING *`,
          [
            id,
            seedData.name,
            seedData.description,
            seedData.category,
            seedData.farmType,
            seedData.yaml,
            seedData.tags,
            userId,
            true,
            true
          ]
        );
        if (result.rows.length > 0) {
          createdSeeds.push(result.rows[0]);
        }
      } catch (error) {
        console.error(`Error creating demo seed ${seedData.name}:`, error);
      }
    }
    return createdSeeds;
  }
}

export const workflowService = new WorkflowService();