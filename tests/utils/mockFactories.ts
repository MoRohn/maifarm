import { Farm, Agent, AgentStatus } from '../../src/types/farm';
import { Harvest, HarvestStatus, HarvestAgent } from '../../src/types/harvest';
import { Task, TaskStatus } from '../../src/types/task';
import { Analytics, PerformanceMetrics } from '../../src/types/analytics';

// Farm mock factories
export const createMockFarm = (overrides?: Partial<Farm>): Farm => ({
  id: `farm-${Date.now()}`,
  name: 'Test Farm',
  prompt: 'Test prompt for farm',
  agents: 3,
  status: 'active',
  provider: 'claude',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  progress: 0,
  activeAgents: [],
  completedTasks: [],
  ...overrides,
});

export const createMockAgent = (overrides?: Partial<Agent>): Agent => ({
  id: `agent-${Date.now()}`,
  name: `Agent ${Math.floor(Math.random() * 100)}`,
  status: 'active' as AgentStatus,
  farmId: 'farm-123',
  currentTask: null,
  completedTasks: 0,
  lastActivity: new Date().toISOString(),
  metrics: {
    tasksCompleted: 0,
    avgResponseTime: 0,
    successRate: 100,
    errors: 0,
  },
  ...overrides,
});

// Harvest mock factories
export const createMockHarvest = (overrides?: Partial<Harvest>): Harvest => ({
  id: `harvest-${Date.now()}`,
  farmId: 'farm-123',
  name: 'Test Harvest',
  description: 'Test harvest description',
  status: 'in_progress' as HarvestStatus,
  startTime: new Date().toISOString(),
  endTime: null,
  agentCount: 3,
  agents: [],
  summary: null,
  artifacts: [],
  metrics: {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    averageTimePerTask: 0,
  },
  ...overrides,
});

export const createMockHarvestAgent = (overrides?: Partial<HarvestAgent>): HarvestAgent => ({
  id: `agent-${Date.now()}`,
  name: `Agent ${Math.floor(Math.random() * 100)}`,
  status: 'active',
  role: 'worker',
  tasksCompleted: 0,
  currentTask: null,
  lastActivity: new Date().toISOString(),
  performance: {
    avgResponseTime: 0,
    successRate: 100,
    totalTokens: 0,
  },
  ...overrides,
});

// Task mock factories
export const createMockTask = (overrides?: Partial<Task>): Task => ({
  id: `task-${Date.now()}`,
  title: 'Test Task',
  description: 'Test task description',
  status: 'pending' as TaskStatus,
  assignedTo: null,
  priority: 'medium',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  completedAt: null,
  result: null,
  error: null,
  ...overrides,
});

export const createMockQuickTask = () => ({
  id: `quick-task-${Date.now()}`,
  prompt: 'Quick task prompt',
  status: 'pending',
  result: null,
  createdAt: new Date().toISOString(),
  estimatedTime: 180,
  actualTime: null,
});

// Analytics mock factories
export const createMockAnalytics = (overrides?: Partial<Analytics>): Analytics => ({
  totalFarms: 10,
  activeFarms: 5,
  totalAgents: 30,
  activeAgents: 15,
  totalTasks: 100,
  completedTasks: 75,
  averageCompletionTime: 45.5,
  successRate: 95.5,
  timeRange: '24h',
  ...overrides,
});

export const createMockPerformanceMetrics = (): PerformanceMetrics => ({
  cpu: {
    usage: 45.5,
    cores: 8,
  },
  memory: {
    used: 2048,
    total: 8192,
    percentage: 25,
  },
  network: {
    bytesIn: 1024000,
    bytesOut: 512000,
    connections: 10,
  },
  timestamp: new Date().toISOString(),
});

// WebSocket mock factories
export const createMockWebSocketMessage = (type: string, data: any) => ({
  type,
  data,
  timestamp: new Date().toISOString(),
  id: `msg-${Date.now()}`,
});

export const createMockSocketIOClient = () => {
  const listeners: { [key: string]: Function[] } = {};
  
  return {
    on: jest.fn((event: string, handler: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
    off: jest.fn((event: string, handler?: Function) => {
      if (handler && listeners[event]) {
        listeners[event] = listeners[event].filter(h => h !== handler);
      } else {
        delete listeners[event];
      }
    }),
    emit: jest.fn((event: string, ...args: any[]) => {
      // Simulate acknowledgment callback if provided
      const lastArg = args[args.length - 1];
      if (typeof lastArg === 'function') {
        lastArg({ success: true });
      }
    }),
    connect: jest.fn(),
    disconnect: jest.fn(),
    connected: true,
    id: 'mock-socket-id',
    // Helper to trigger events in tests
    triggerEvent: (event: string, data?: any) => {
      if (listeners[event]) {
        listeners[event].forEach(handler => handler(data));
      }
    },
  };
};

// File system mock factories
export const createMockFile = (name: string, content: string = '') => ({
  name,
  path: `/test/path/${name}`,
  content,
  size: content.length,
  type: name.split('.').pop() || 'txt',
  lastModified: new Date().toISOString(),
});

export const createMockWorkspace = () => ({
  id: `workspace-${Date.now()}`,
  path: '/tmp/maifarm/workspaces/test',
  files: [],
  createdAt: new Date().toISOString(),
  lastAccessed: new Date().toISOString(),
});

// Provider mock factories
export const createMockProvider = (type: 'claude' | 'qwen' = 'claude') => ({
  id: type,
  name: type === 'claude' ? 'Claude' : 'Qwen',
  available: true,
  models: type === 'claude' 
    ? ['claude-3-opus', 'claude-3-sonnet'] 
    : ['qwen-coder-480b', 'qwen-72b'],
  status: 'ready',
  limits: {
    maxTokens: type === 'claude' ? 100000 : 256000,
    maxAgents: 10,
    rateLimit: 100,
  },
});

// Error mock factories
export const createMockError = (message: string = 'Test error', code?: string) => ({
  message,
  code: code || 'TEST_ERROR',
  stack: new Error().stack,
  timestamp: new Date().toISOString(),
});

// Batch creators for multiple mocks
export const createMockFarms = (count: number): Farm[] => 
  Array.from({ length: count }, (_, i) => 
    createMockFarm({ 
      id: `farm-${i}`, 
      name: `Farm ${i}`,
      status: i % 2 === 0 ? 'active' : 'completed',
    })
  );

export const createMockAgents = (count: number, farmId: string): Agent[] =>
  Array.from({ length: count }, (_, i) =>
    createMockAgent({
      id: `agent-${i}`,
      name: `Agent ${i}`,
      farmId,
      status: i === 0 ? 'idle' : 'active',
    })
  );

export const createMockTasks = (count: number): Task[] =>
  Array.from({ length: count }, (_, i) =>
    createMockTask({
      id: `task-${i}`,
      title: `Task ${i}`,
      status: i < count / 2 ? 'completed' : 'pending',
    })
  );

// Utility to create a complete mock state
export const createMockAppState = () => ({
  farms: createMockFarms(3),
  agents: createMockAgents(9, 'farm-0'),
  harvests: [createMockHarvest()],
  tasks: createMockTasks(10),
  analytics: createMockAnalytics(),
  websocket: {
    connected: true,
    reconnecting: false,
    error: null,
  },
  user: {
    id: 'user-123',
    email: 'test@example.com',
    role: 'admin',
  },
});

// Helper to create mock API responses
export const createMockApiResponse = <T>(data: T, success: boolean = true) => ({
  success,
  data,
  error: success ? null : 'Mock error',
  timestamp: new Date().toISOString(),
});

// Helper to create paginated responses
export const createMockPaginatedResponse = <T>(
  items: T[],
  page: number = 1,
  pageSize: number = 10
) => ({
  items: items.slice((page - 1) * pageSize, page * pageSize),
  total: items.length,
  page,
  pageSize,
  totalPages: Math.ceil(items.length / pageSize),
  hasNext: page * pageSize < items.length,
  hasPrevious: page > 1,
});