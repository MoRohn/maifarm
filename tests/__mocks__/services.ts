// Mock Services for Testing

import { jest } from '@jest/globals';

// Mock WebSocket Service
export const mockWebSocketService = {
  connected: true,
  socket: {
    id: 'mock-socket-id',
    connected: true,
    disconnect: jest.fn(),
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  },
  connect: jest.fn().mockResolvedValue(true),
  disconnect: jest.fn(),
  emit: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  once: jest.fn(),
};

// Mock Farm Service
export const mockFarmService = {
  getAllFarms: jest.fn().mockResolvedValue([]),
  getFarmById: jest.fn().mockResolvedValue(null),
  createFarm: jest.fn().mockResolvedValue({
    id: 'mock-farm-id',
    name: 'Test Farm',
    status: 'idle',
    agents: [],
    createdAt: new Date(),
  }),
  updateFarm: jest.fn().mockResolvedValue(true),
  deleteFarm: jest.fn().mockResolvedValue(true),
  launchFarm: jest.fn().mockResolvedValue({
    id: 'mock-farm-id',
    status: 'launching',
  }),
  stopFarm: jest.fn().mockResolvedValue(true),
};

// Mock Agent Service
export const mockAgentService = {
  getAllAgents: jest.fn().mockResolvedValue([]),
  getAgentById: jest.fn().mockResolvedValue(null),
  createAgent: jest.fn().mockResolvedValue({
    id: 'mock-agent-id',
    name: 'Test Agent',
    status: 'idle',
    farmId: 'mock-farm-id',
  }),
  updateAgent: jest.fn().mockResolvedValue(true),
  deleteAgent: jest.fn().mockResolvedValue(true),
  getAgentHealth: jest.fn().mockResolvedValue({
    status: 'healthy',
    lastCheck: new Date(),
  }),
};

// Mock Harvest Service
export const mockHarvestService = {
  getAll: jest.fn().mockResolvedValue([]),
  getById: jest.fn().mockResolvedValue(null),
  startHarvest: jest.fn().mockResolvedValue({
    id: 'mock-harvest-id',
    farmId: 'mock-farm-id',
    status: 'collecting',
    createdAt: new Date(),
  }),
  completeHarvest: jest.fn().mockResolvedValue(true),
  exportHarvest: jest.fn().mockResolvedValue(new Blob(['test data'])),
  subscribeToHarvest: jest.fn().mockReturnValue(() => {}),
  getCoordinationAgents: jest.fn().mockResolvedValue([]),
  getWorkClaims: jest.fn().mockResolvedValue([]),
  getCompletedWork: jest.fn().mockResolvedValue([]),
  getHarvestReports: jest.fn().mockResolvedValue([]),
  getTerminalSessions: jest.fn().mockResolvedValue([]),
  getTerminalOutput: jest.fn().mockResolvedValue({ output: [] }),
  sendTerminalCommand: jest.fn().mockResolvedValue(true),
  onTerminalOutput: jest.fn().mockReturnValue(() => {}),
  onInitialData: jest.fn().mockReturnValue(() => {}),
  getSummaries: jest.fn().mockResolvedValue([]),
  downloadExport: jest.fn().mockResolvedValue(undefined),
  createHarvestReport: jest.fn().mockResolvedValue({}),
  joinHarvestRoom: jest.fn(),
  leaveHarvestRoom: jest.fn(),
  onHarvestUpdate: jest.fn().mockReturnValue(() => {}),
  onAgentsUpdate: jest.fn().mockReturnValue(() => {}),
  onWorkCompleted: jest.fn().mockReturnValue(() => {}),
};

// Mock Barn Service
export const mockBarnService = {
  getAll: jest.fn().mockResolvedValue([]),
  getById: jest.fn().mockResolvedValue(null),
  storeHarvest: jest.fn().mockResolvedValue({
    id: 'mock-barn-item-id',
    name: 'Test Barn Item',
    type: 'harvest',
    createdAt: new Date(),
  }),
  updateItem: jest.fn().mockResolvedValue(true),
  useItem: jest.fn().mockResolvedValue(true),
  deleteItem: jest.fn().mockResolvedValue(true),
  getFolders: jest.fn().mockResolvedValue([]),
  createFolder: jest.fn().mockResolvedValue({
    id: 'mock-folder-id',
    name: 'Test Folder',
    createdAt: new Date(),
  }),
  getStats: jest.fn().mockResolvedValue({
    totalItems: 0,
    totalSize: 0,
    recentItems: [],
  }),
  createSeedFromItem: jest.fn().mockResolvedValue('mock-yaml-content'),
  subscribeToItem: jest.fn().mockReturnValue(() => {}),
};

// Mock AI Provider Service
export const mockAIProviderService = {
  getCurrentProvider: jest.fn().mockReturnValue('mock'),
  setProvider: jest.fn().mockResolvedValue(true),
  validateProvider: jest.fn().mockResolvedValue(true),
  getProviderStatus: jest.fn().mockResolvedValue({
    claude: { configured: false, enabled: false },
    openai: { configured: false, enabled: false },
    mock: { configured: true, enabled: true },
  }),
  generateCompletion: jest.fn().mockResolvedValue({
    text: 'Mock AI response',
    tokens: 100,
  }),
};

// Mock Analytics Service
export const mockAnalyticsService = {
  trackEvent: jest.fn(),
  trackPageView: jest.fn(),
  getMetrics: jest.fn().mockResolvedValue({
    totalFarms: 0,
    totalAgents: 0,
    totalHarvests: 0,
    averageAgentEfficiency: 0,
  }),
  getTimeSeriesData: jest.fn().mockResolvedValue([]),
  getCostAnalysis: jest.fn().mockResolvedValue({
    total: 0,
    breakdown: {},
  }),
};

// Mock Auth Service
export const mockAuthService = {
  login: jest.fn().mockResolvedValue({
    token: 'mock-jwt-token',
    user: {
      id: 'mock-user-id',
      email: 'test@example.com',
      name: 'Test User',
    },
  }),
  logout: jest.fn().mockResolvedValue(true),
  refreshToken: jest.fn().mockResolvedValue({
    token: 'new-mock-jwt-token',
  }),
  validateToken: jest.fn().mockResolvedValue(true),
  getCurrentUser: jest.fn().mockResolvedValue({
    id: 'mock-user-id',
    email: 'test@example.com',
    name: 'Test User',
  }),
};

// Mock Database Service
export const mockDatabaseService = {
  query: jest.fn().mockResolvedValue({ rows: [] }),
  connect: jest.fn().mockResolvedValue(true),
  disconnect: jest.fn().mockResolvedValue(true),
  transaction: jest.fn().mockImplementation(async (callback) => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    try {
      return await callback(client);
    } finally {
      client.release();
    }
  }),
};

// Mock Redis Service
export const mockRedisService = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(0),
  expire: jest.fn().mockResolvedValue(1),
  ttl: jest.fn().mockResolvedValue(-1),
  keys: jest.fn().mockResolvedValue([]),
  flushdb: jest.fn().mockResolvedValue('OK'),
};

// Export all mocks
export const mockServices = {
  websocket: mockWebSocketService,
  farm: mockFarmService,
  agent: mockAgentService,
  harvest: mockHarvestService,
  barn: mockBarnService,
  ai: mockAIProviderService,
  analytics: mockAnalyticsService,
  auth: mockAuthService,
  db: mockDatabaseService,
  redis: mockRedisService,
};

export default mockServices;