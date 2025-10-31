import { jest } from '@jest/globals';
import { BarnItem, BarnFolder } from '../../../src/types/barn';
import { barnService } from '../services/unified/barnService';
import { harvestService } from '../services/unified/harvestService';

// Helper to setup barn service mocks
export const setupBarnServiceMocks = () => {
  const mockedBarnService = jest.mocked(barnService);
  
  // Reset all mocks
  jest.clearAllMocks();
  
  // Setup default implementations
  mockedBarnService.getStats.mockResolvedValue({
    totalItems: 0,
    itemsByType: {
      harvest: 0,
      template: 0,
      resource: 0,
      documentation: 0
    },
    totalSize: 0,
    lastUpdated: new Date().toISOString(),
    topCategories: []
  });
  
  mockedBarnService.findAll.mockResolvedValue([]);
  mockedBarnService.findById.mockResolvedValue(null);
  mockedBarnService.getFolders.mockResolvedValue([]);
  
  return mockedBarnService;
};

// Helper to setup harvest service mocks
export const setupHarvestServiceMocks = () => {
  const mockedHarvestService = jest.mocked(harvestService);
  
  jest.clearAllMocks();
  
  return mockedHarvestService;
};

// Helper to create test data
export const createTestBarnItem = (id: string, overrides: Partial<BarnItem> = {}): BarnItem => {
  return {
    id,
    name: `Test Item ${id}`,
    description: `Description for ${id}`,
    type: 'harvest',
    category: 'Test Category',
    tags: ['test'],
    folderId: null,
    harvestId: `harvest-${id}`,
    status: 'ready',
    size: 1024,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastUsed: null,
    useCount: 0,
    ...overrides
  };
};

export const createTestFolder = (id: string, overrides: Partial<BarnFolder> = {}): BarnFolder => {
  return {
    id,
    name: `Test Folder ${id}`,
    description: `Description for folder ${id}`,
    parentId: null,
    itemCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
};

// Helper to verify API response structure
export const expectBarnItemStructure = (item: any) => {
  expect(item).toHaveProperty('id');
  expect(item).toHaveProperty('name');
  expect(item).toHaveProperty('description');
  expect(item).toHaveProperty('type');
  expect(item).toHaveProperty('category');
  expect(item).toHaveProperty('tags');
  expect(item).toHaveProperty('status');
  expect(item).toHaveProperty('size');
  expect(item).toHaveProperty('createdAt');
  expect(item).toHaveProperty('updatedAt');
  expect(item).toHaveProperty('useCount');
};

export const expectFolderStructure = (folder: any) => {
  expect(folder).toHaveProperty('id');
  expect(folder).toHaveProperty('name');
  expect(folder).toHaveProperty('description');
  expect(folder).toHaveProperty('itemCount');
  expect(folder).toHaveProperty('createdAt');
  expect(folder).toHaveProperty('updatedAt');
};

export const expectStatsStructure = (stats: any) => {
  expect(stats).toHaveProperty('totalItems');
  expect(stats).toHaveProperty('itemsByType');
  expect(stats).toHaveProperty('totalSize');
  expect(stats).toHaveProperty('lastUpdated');
  expect(stats).toHaveProperty('topCategories');
  expect(stats.itemsByType).toHaveProperty('harvest');
  expect(stats.itemsByType).toHaveProperty('template');
  expect(stats.itemsByType).toHaveProperty('resource');
  expect(stats.itemsByType).toHaveProperty('documentation');
};

// Helper to generate test query parameters
export const createFilterQuery = (filters: {
  type?: string;
  category?: string;
  tags?: string[];
  folderId?: string;
  search?: string;
}) => {
  const params = new URLSearchParams();
  
  if (filters.type) params.append('type', filters.type);
  if (filters.category) params.append('category', filters.category);
  if (filters.tags && filters.tags.length > 0) params.append('tags', filters.tags.join(','));
  if (filters.folderId) params.append('folderId', filters.folderId);
  if (filters.search) params.append('search', filters.search);
  
  return params.toString();
};

// Helper to wait for async operations
export const waitForExpect = async (callback: () => void, timeout: number = 1000) => {
  const startTime = Date.now();
  let lastError: Error | undefined;
  
  while (Date.now() - startTime < timeout) {
    try {
      callback();
      return;
    } catch (error) {
      lastError = error as Error;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  
  if (lastError) {
    throw lastError;
  }
};

// Helper to create mock request/response for unit testing
export const createMockRequestResponse = () => {
  const req: any = {
    params: {},
    query: {},
    body: {},
    headers: {}
  };
  
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    sendStatus: jest.fn().mockReturnThis()
  };
  
  const next = jest.fn();
  
  return { req, res, next };
};