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
      type: 'builder' as const,
      status: 'working',
      progress: 60,
      currentTask: 'Processing data batch #42',
      memory: 1024,
      cpu: 2,
      lastActive: new Date(),
      capabilities: ['data-processing', 'analysis'],
      performance: {
        cpuUsage: 45,
        memoryUsage: 60,
        responseTime: 45,
        throughput: 95
      }
    },
    {
      id: 'agent-2',
      name: 'Agent Beta',
      type: 'reviewer' as const,
      status: 'idle',
      progress: 0,
      currentTask: undefined,
      memory: 512,
      cpu: 1,
      lastActive: new Date(),
      capabilities: ['monitoring', 'reporting'],
      performance: {
        cpuUsage: 30,
        memoryUsage: 40,
        responseTime: 30,
        throughput: 100
      }
    }
  ],
  config: {
    maxAgents: 5,
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
    avgCompletionTime: 250,
    resourceUsage: {
      cpu: 45,
      memory: 62,
      network: 30
    },
    collaborationScore: 85
  },
  tags: ['test', 'development'],
  createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
  updatedAt: new Date()
});