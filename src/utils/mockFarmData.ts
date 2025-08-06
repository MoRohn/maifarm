import { Farm } from '../types';

export const createMockFarm = (status: 'active' | 'launching' | 'paused' | 'completed' | 'failed' = 'active'): Farm => ({
  id: `farm-${Date.now()}`,
  name: `Test Farm ${Math.floor(Math.random() * 1000)}`,
  description: 'A test farm for development',
  status,
  type: 'collaborative',
  agents: [
    {
      id: 'agent-1',
      name: 'Agent Alpha',
      status: 'working',
      currentTask: 'Processing data batch #42',
      capabilities: ['data-processing', 'analysis'],
      performance: {
        tasksCompleted: 10,
        avgCompletionTime: 45,
        successRate: 95
      }
    },
    {
      id: 'agent-2',
      name: 'Agent Beta',
      status: 'idle',
      currentTask: null,
      capabilities: ['monitoring', 'reporting'],
      performance: {
        tasksCompleted: 8,
        avgCompletionTime: 30,
        successRate: 100
      }
    }
  ],
  config: {
    maxAgents: 5,
    resourceLimits: {
      totalCpu: 8,
      totalMemory: 16384
    },
    orchestrationStrategy: 'round-robin',
    autoScale: false,
    timeout: 3600,
    retryPolicy: {
      enabled: true,
      maxRetries: 3,
      backoffMultiplier: 2
    },
    goWildMode: {
      enabled: false,
      creativityLevel: 3,
      boundaries: []
    },
    yaml: ''
  },
  metrics: {
    totalTasks: 100,
    completedTasks: status === 'completed' ? 100 : 45,
    failedTasks: status === 'failed' ? 10 : 2,
    efficiency: 88,
    avgResponseTime: 250,
    resourceUsage: {
      cpu: 45,
      memory: 62,
      network: 30
    }
  },
  tags: ['test', 'development'],
  createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 minutes ago
  updatedAt: new Date().toISOString()
});