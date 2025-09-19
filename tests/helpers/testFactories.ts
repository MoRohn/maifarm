/**
 * Test Data Factories for MaiFarm Testing
 * Provides consistent test data generation for all test suites
 */

import { v4 as uuidv4 } from 'uuid';

// Farm Factory
export function createTestFarm(overrides: Partial<any> = {}) {
  const farmId = uuidv4();
  return {
    id: farmId,
    name: `Test Farm ${farmId.substring(0, 8)}`,
    status: 'idle',
    config: {
      maxAgents: 3,
      timeout: 300000, // 5 minutes
      provider: 'claude',
      orchestrationStrategy: 'collaborative',
      resourceLimits: {
        totalCpu: 4,
        totalMemory: 8192
      },
      ...overrides.config
    },
    agents: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

// Agent Factory
export function createTestAgent(overrides: Partial<any> = {}) {
  const agentId = uuidv4();
  return {
    id: agentId,
    name: `Agent ${agentId.substring(0, 8)}`,
    type: 'worker',
    status: 'idle',
    capabilities: ['general'],
    farmId: null,
    sessionName: null,
    paneId: 0,
    metrics: {
      tasksCompleted: 0,
      errors: 0,
      uptime: 0
    },
    createdAt: new Date(),
    ...overrides
  };
}

// Harvest Factory
export function createTestHarvest(farmId: string, overrides: Partial<any> = {}) {
  const harvestId = uuidv4();
  return {
    id: harvestId,
    farmId,
    farmName: `Test Farm ${farmId.substring(0, 8)}`,
    status: 'pending',
    results: [],
    insights: [],
    yield: {
      files: [],
      outputs: [],
      artifacts: []
    },
    summary: {
      totalAgents: 3,
      duration: 0,
      tasksCompleted: 0,
      successRate: 0
    },
    quality: {
      score: 0,
      metrics: {}
    },
    startedAt: new Date(),
    completedAt: null,
    ...overrides
  };
}

// Barn Item Factory
export function createTestBarnItem(harvestId: string, overrides: Partial<any> = {}) {
  const itemId = uuidv4();
  return {
    id: itemId,
    harvestId,
    name: `Barn Item ${itemId.substring(0, 8)}`,
    type: 'artifact',
    category: 'general',
    content: {
      data: 'Test content',
      metadata: {}
    },
    tags: [],
    quality: {
      score: 85,
      verified: false
    },
    storedAt: new Date(),
    ...overrides
  };
}

// WebSocket Event Factory
export function createTestWebSocketEvent(type: string, payload: any = {}) {
  return {
    type,
    payload,
    timestamp: new Date(),
    id: uuidv4()
  };
}

// YAML Config Factory
export function createTestYamlConfig(overrides: Partial<any> = {}) {
  return {
    name: 'test-farm',
    description: 'Test farm configuration',
    agents: [
      {
        name: 'Agent 1',
        role: 'Developer',
        capabilities: ['coding', 'debugging']
      },
      {
        name: 'Agent 2',
        role: 'Tester',
        capabilities: ['testing', 'validation']
      }
    ],
    initial_prompt: 'Test prompt for agents',
    steps: [
      'Initialize project',
      'Implement features',
      'Test and validate'
    ],
    config: {
      timeout: 3600,
      maxAgents: 5,
      coordination: 'collaborative'
    },
    ...overrides
  };
}

// Tmux Session Factory
export function createTestTmuxSession(farmId: string, agentCount: number = 3) {
  return {
    sessionName: `farm-${farmId.substring(0, 8)}`,
    windowName: 'agents',
    panes: Array.from({ length: agentCount }, (_, i) => ({
      paneId: i,
      agentId: `agent-${i}`,
      status: 'active',
      output: []
    }))
  };
}

// Task Factory
export function createTestTask(overrides: Partial<any> = {}) {
  const taskId = uuidv4();
  return {
    id: taskId,
    title: `Task ${taskId.substring(0, 8)}`,
    description: 'Test task description',
    status: 'pending',
    assignedTo: null,
    priority: 'medium',
    dependencies: [],
    result: null,
    createdAt: new Date(),
    ...overrides
  };
}

// Farmer Template Factory
export function createTestFarmerTemplate(overrides: Partial<any> = {}) {
  return {
    id: 'test-farmer',
    name: 'Test Farmer',
    title: 'The Test Farmer',
    description: 'A farmer template for testing',
    category: 'technical',
    agents: createTestYamlConfig().agents,
    stats: {
      successRate: 95,
      farmsCreated: 10,
      averageDuration: 300000
    },
    ...overrides
  };
}

// Error Factory
export function createTestError(message: string, code: string = 'TEST_ERROR') {
  return {
    message,
    code,
    timestamp: new Date(),
    stack: new Error().stack
  };
}

// Performance Metric Factory
export function createTestPerformanceMetric(overrides: Partial<any> = {}) {
  return {
    metric: 'response_time',
    value: Math.random() * 100,
    unit: 'ms',
    timestamp: new Date(),
    ...overrides
  };
}

// Batch Data Factory - Creates multiple related test entities
export function createTestEcosystem() {
  const farm = createTestFarm();
  const agents = Array.from({ length: 3 }, (_, i) => 
    createTestAgent({ 
      farmId: farm.id,
      paneId: i,
      status: 'active'
    })
  );
  const harvest = createTestHarvest(farm.id, {
    status: 'active',
    summary: {
      totalAgents: agents.length,
      duration: 60000,
      tasksCompleted: 5,
      successRate: 100
    }
  });
  const barnItems = Array.from({ length: 5 }, () => 
    createTestBarnItem(harvest.id)
  );

  return {
    farm,
    agents,
    harvest,
    barnItems
  };
}

// Mock Response Factory
export function createMockApiResponse(success: boolean = true, data: any = null, error: any = null) {
  return {
    success,
    data,
    error,
    timestamp: new Date()
  };
}

// Session State Factory
export function createTestSessionState(overrides: Partial<any> = {}) {
  return {
    isConnected: true,
    reconnectAttempts: 0,
    lastHeartbeat: new Date(),
    messageQueue: [],
    activeSubscriptions: [],
    ...overrides
  };
}