import { WebSocketMessage, FarmStatus, AgentStatus } from '@/services/websocket';
import { Farm, Agent } from '@/types';

// Add interface for Farm with additional properties
interface MockFarm extends Farm {
  agentIds?: string[];
}

export interface MockDataConfig {
  updateInterval?: number;
  generateMetrics?: boolean;
  generateFarms?: boolean;
  generateAgents?: boolean;
}

export class MockDataProvider {
  private intervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private mockFarms: Map<string, MockFarm> = new Map();
  private mockAgents: Map<string, Agent> = new Map();
  private messageHandler?: (message: WebSocketMessage) => void;

  constructor(private config: MockDataConfig = {}) {
    this.config = {
      updateInterval: 5000,
      generateMetrics: true,
      generateFarms: true,
      generateAgents: true,
      ...config
    };
  }

  start(messageHandler: (message: WebSocketMessage) => void) {
    this.messageHandler = messageHandler;
    this.initializeMockData();
    
    if (this.config.generateMetrics) {
      this.startMetricsGeneration();
    }
    
    if (this.config.generateFarms) {
      this.startFarmGeneration();
    }
    
    if (this.config.generateAgents) {
      this.startAgentGeneration();
    }
  }

  stop() {
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals.clear();
    this.mockFarms.clear();
    this.mockAgents.clear();
  }

  private initializeMockData() {
    // Create initial mock farms
    for (let i = 0; i < 3; i++) {
      const farmId = `mock-farm-${i}`;
      const farm: MockFarm = {
        id: farmId,
        name: `Mock Farm ${i + 1}`,
        status: 'active',
        config: {
          name: `Mock Farm ${i + 1}`,
          description: 'Auto-generated mock farm for testing',
          agents: [],
          seed: {
            id: `seed-${i}`,
            name: `Mock Seed ${i + 1}`,
            config: {},
            metadata: {
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          }
        },
        createdAt: new Date(Date.now() - Math.random() * 86400000),
        updatedAt: new Date(),
        owner: 'system',
        agentIds: [`mock-agent-${i * 2}`, `mock-agent-${i * 2 + 1}`]
      };
      this.mockFarms.set(farmId, farm);
    }

    // Create initial mock agents
    for (let i = 0; i < 6; i++) {
      const agentId = `mock-agent-${i}`;
      const agent: Agent = {
        id: agentId,
        name: `Mock Agent ${i + 1}`,
        status: ['idle', 'active', 'completed'][Math.floor(Math.random() * 3)] as any,
        farmId: `mock-farm-${Math.floor(i / 2)}`,
        type: ['explorer', 'builder', 'tester', 'analyzer'][Math.floor(Math.random() * 4)] as any,
        progress: Math.floor(Math.random() * 100),
        memory: Math.floor(Math.random() * 8) + 1,
        cpu: Math.floor(Math.random() * 4) + 1,
        lastActive: new Date(Date.now() - Math.random() * 3600000),
        capabilities: ['analysis', 'generation', 'testing'],
        createdAt: new Date(Date.now() - Math.random() * 86400000),
        updatedAt: new Date()
      };
      this.mockAgents.set(agentId, agent);
    }
  }

  private startMetricsGeneration() {
    // Generate initial metrics
    this.generateMetrics();

    // Set up periodic updates
    const interval = setInterval(() => {
      this.generateMetrics();
    }, this.config.updateInterval);
    
    this.intervals.set('metrics', interval);
  }

  private startFarmGeneration() {
    const interval = setInterval(() => {
      this.updateFarms();
    }, this.config.updateInterval! + 1000);
    
    this.intervals.set('farms', interval);
  }

  private startAgentGeneration() {
    const interval = setInterval(() => {
      this.updateAgents();
    }, this.config.updateInterval! + 500);
    
    this.intervals.set('agents', interval);
  }

  private generateMetrics() {
    const metrics: WebSocketMessage = {
      type: 'metrics:update',
      event: 'metrics:update',
      data: {
        dashboard: {
          activeFarms: this.mockFarms.size,
          totalAgents: this.mockAgents.size,
          tasksCompleted: Math.floor(Math.random() * 200) + 100,
          successRate: Math.floor(Math.random() * 15) + 85,
          avgTaskTime: Math.floor(Math.random() * 300) + 120,
          resourceUtilization: {
            cpu: Math.floor(Math.random() * 40) + 30,
            memory: Math.floor(Math.random() * 50) + 40,
            network: Math.floor(Math.random() * 30) + 20
          }
        },
        timestamp: new Date().toISOString()
      },
      timestamp: new Date()
    };

    this.messageHandler?.(metrics);
  }

  private updateFarms() {
    this.mockFarms.forEach((farm, farmId) => {
      // Randomly update farm status
      if (Math.random() > 0.7) {
        const statuses = ['active', 'paused', 'completed', 'failed'];
        const newStatus = statuses[Math.floor(Math.random() * statuses.length)];
        
        if (newStatus !== farm.status) {
          farm.status = newStatus as any;
          farm.updatedAt = new Date();

          const farmUpdate: WebSocketMessage = {
            type: 'farm:updated',
            payload: {
              event: 'updated',
              farm: farm
            },
            timestamp: new Date()
          };

          this.messageHandler?.(farmUpdate);
        }
      }

      // Generate farm metrics
      if (Math.random() > 0.5) {
        const farmStatus: FarmStatus = {
          id: farmId,
          name: farm.name,
          status: farm.status as any,
          agents: Array.from(this.mockAgents.values())
            .filter(agent => agent.farmId === farmId)
            .map(agent => ({
              id: agent.id,
              name: agent.name,
              status: agent.status as any,
              lastUpdate: new Date(),
              resources: {
                cpu: Math.floor(Math.random() * 100),
                memory: Math.floor(Math.random() * 100),
                network: Math.floor(Math.random() * 100)
              }
            })),
          startTime: new Date(farm.createdAt),
          metrics: {
            totalTasks: Math.floor(Math.random() * 100) + 50,
            completedTasks: Math.floor(Math.random() * 80) + 20,
            failedTasks: Math.floor(Math.random() * 10),
            efficiency: Math.floor(Math.random() * 20) + 80
          }
        };

        const farmMetrics: WebSocketMessage = {
          type: 'farm_update',
          payload: farmStatus,
          timestamp: new Date()
        };

        this.messageHandler?.(farmMetrics);
      }
    });
  }

  private updateAgents() {
    this.mockAgents.forEach((agent, agentId) => {
      // Randomly update agent status
      if (Math.random() > 0.6) {
        const statuses = ['idle', 'active', 'completed', 'error'];
        const newStatus = statuses[Math.floor(Math.random() * statuses.length)];
        
        agent.status = newStatus as any;
        agent.updatedAt = new Date();

        const agentStatus: AgentStatus = {
          id: agentId,
          name: agent.name,
          status: agent.status as any,
          currentTask: agent.status === 'working' ? `Task ${Math.floor(Math.random() * 100)}` : undefined,
          progress: agent.status === 'working' ? Math.floor(Math.random() * 100) : undefined,
          lastUpdate: new Date(),
          resources: {
            cpu: Math.floor(Math.random() * 100),
            memory: Math.floor(Math.random() * 100),
            network: Math.floor(Math.random() * 100)
          }
        };

        const agentUpdate: WebSocketMessage = {
          type: 'agent_update',
          payload: agentStatus,
          timestamp: new Date()
        };

        this.messageHandler?.(agentUpdate);
      }
    });
  }

  // Utility methods for testing specific scenarios
  simulateConnectionLoss() {
    this.stop();
  }

  simulateReconnection() {
    if (this.messageHandler) {
      this.start(this.messageHandler);
    }
  }

  simulateFarmCreation(name: string) {
    const farmId = `mock-farm-${Date.now()}`;
    const farm: MockFarm = {
      id: farmId,
      name,
      status: 'active' as const,
      config: {
        name,
        description: 'User-created mock farm',
        agents: [],
        seed: {
          id: `seed-${Date.now()}`,
          name: `${name} Seed`,
          config: {},
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      owner: 'user',
      agentIds: []
    };

    this.mockFarms.set(farmId, farm);

    const createMessage: WebSocketMessage = {
      type: 'farm:created',
      payload: {
        event: 'created',
        farm
      },
      timestamp: new Date()
    };

    this.messageHandler?.(createMessage);

    // Simulate farm becoming active after a delay
    setTimeout(() => {
      farm.status = 'active';
      const updateMessage: WebSocketMessage = {
        type: 'farm:started',
        payload: {
          event: 'started',
          farm
        },
        timestamp: new Date()
      };
      this.messageHandler?.(updateMessage);
    }, 2000);
  }

  simulateError(message: string) {
    const errorMessage: WebSocketMessage = {
      type: 'error',
      payload: {
        message,
        code: 'MOCK_ERROR',
        timestamp: new Date()
      },
      timestamp: new Date()
    };

    this.messageHandler?.(errorMessage);
  }
}

// Export singleton instance for convenience
export const mockDataProvider = new MockDataProvider();