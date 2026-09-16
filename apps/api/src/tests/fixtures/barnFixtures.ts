import { BarnItem, BarnFolder, BarnStats } from '../../../src/types/barn';
import { Harvest, HarvestStatus } from '../../../src/types/harvest';

export const mockBarnStats: BarnStats = {
  totalItems: 42,
  itemsByType: {
    harvest: 20,
    template: 10,
    resource: 8,
    documentation: 4
  },
  totalSize: 1024 * 1024 * 50, // 50MB
  lastUpdated: new Date('2025-01-15T10:00:00Z').toISOString(),
  topCategories: ['AI Prompts', 'Templates', 'Documentation']
};

export const mockBarnItems: BarnItem[] = [
  {
    id: 'barn-item-1',
    name: 'AI Assistant Template',
    description: 'Template for creating AI assistants',
    type: 'template',
    category: 'AI Templates',
    tags: ['ai', 'template', 'assistant'],
    folderId: 'folder-1',
    harvestId: 'harvest-1',
    status: 'ready',
    size: 4096,
    createdAt: new Date('2025-01-10T08:00:00Z').toISOString(),
    updatedAt: new Date('2025-01-14T15:30:00Z').toISOString(),
    lastUsed: new Date('2025-01-14T16:00:00Z').toISOString(),
    useCount: 12,
    metadata: {
      farmId: 'farm-1',
      agentCount: 3,
      version: '1.2.0'
    }
  },
  {
    id: 'barn-item-2',
    name: 'Code Review Workflow',
    description: 'Automated code review workflow configuration',
    type: 'harvest',
    category: 'Workflows',
    tags: ['workflow', 'code-review', 'automation'],
    folderId: 'folder-2',
    harvestId: 'harvest-2',
    status: 'ready',
    size: 8192,
    createdAt: new Date('2025-01-12T10:00:00Z').toISOString(),
    updatedAt: new Date('2025-01-15T09:00:00Z').toISOString(),
    lastUsed: null,
    useCount: 0,
    metadata: {
      farmId: 'farm-2',
      agentCount: 5,
      taskCount: 15
    }
  },
  {
    id: 'barn-item-3',
    name: 'API Documentation',
    description: 'Comprehensive API documentation',
    type: 'documentation',
    category: 'Documentation',
    tags: ['docs', 'api', 'reference'],
    folderId: null,
    harvestId: 'harvest-3',
    status: 'archived',
    size: 16384,
    createdAt: new Date('2025-01-05T12:00:00Z').toISOString(),
    updatedAt: new Date('2025-01-08T14:00:00Z').toISOString(),
    lastUsed: new Date('2025-01-13T10:00:00Z').toISOString(),
    useCount: 25,
    metadata: {
      format: 'markdown',
      version: '2.0.0'
    }
  },
  {
    id: 'barn-item-4',
    name: 'Resource Bundle',
    description: 'Collection of useful development resources',
    type: 'resource',
    category: 'Resources',
    tags: ['resources', 'bundle', 'development'],
    folderId: 'folder-1',
    harvestId: 'harvest-4',
    status: 'ready',
    size: 32768,
    createdAt: new Date('2025-01-01T00:00:00Z').toISOString(),
    updatedAt: new Date('2025-01-01T00:00:00Z').toISOString(),
    lastUsed: new Date('2025-01-15T08:00:00Z').toISOString(),
    useCount: 50
  }
];

export const mockBarnFolders: BarnFolder[] = [
  {
    id: 'folder-1',
    name: 'Templates',
    description: 'All template files',
    parentId: null,
    itemCount: 15,
    createdAt: new Date('2025-01-01T00:00:00Z').toISOString(),
    updatedAt: new Date('2025-01-15T10:00:00Z').toISOString()
  },
  {
    id: 'folder-2',
    name: 'Workflows',
    description: 'Workflow configurations',
    parentId: null,
    itemCount: 8,
    createdAt: new Date('2025-01-02T00:00:00Z').toISOString(),
    updatedAt: new Date('2025-01-14T12:00:00Z').toISOString()
  },
  {
    id: 'folder-3',
    name: 'AI Templates',
    description: 'AI-specific templates',
    parentId: 'folder-1',
    itemCount: 5,
    createdAt: new Date('2025-01-03T00:00:00Z').toISOString(),
    updatedAt: new Date('2025-01-10T08:00:00Z').toISOString()
  }
];

export const mockHarvests: Partial<Harvest>[] = [
  {
    id: 'harvest-1',
    farmId: 'farm-1',
    status: 'ready' as HarvestStatus,
    completedAt: new Date('2025-01-10T08:00:00Z').toISOString(),
    outputs: {
      'agent-1': { content: 'AI template implementation' },
      'agent-2': { content: 'Template documentation' }
    }
  },
  {
    id: 'harvest-2',
    farmId: 'farm-2',
    status: 'ready' as HarvestStatus,
    completedAt: new Date('2025-01-12T10:00:00Z').toISOString(),
    outputs: {
      'agent-1': { content: 'Code review setup' },
      'agent-2': { content: 'Workflow configuration' }
    }
  },
  {
    id: 'harvest-3',
    farmId: 'farm-3',
    status: 'processing' as HarvestStatus,
    completedAt: null,
    outputs: {}
  },
  {
    id: 'harvest-4',
    farmId: 'farm-4',
    status: 'ready' as HarvestStatus,
    completedAt: new Date('2025-01-01T00:00:00Z').toISOString(),
    outputs: {
      'agent-1': { content: 'Resource collection complete' }
    }
  }
];

export const createMockBarnItem = (overrides: Partial<BarnItem> = {}): BarnItem => {
  return {
    id: `barn-item-${Date.now()}`,
    name: 'Mock Barn Item',
    description: 'A mock barn item for testing',
    type: 'harvest',
    category: 'Test',
    tags: ['test', 'mock'],
    folderId: null,
    harvestId: `harvest-${Date.now()}`,
    status: 'ready',
    size: 1024,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastUsed: null,
    useCount: 0,
    ...overrides
  };
};

export const createMockFolder = (overrides: Partial<BarnFolder> = {}): BarnFolder => {
  return {
    id: `folder-${Date.now()}`,
    name: 'Mock Folder',
    description: 'A mock folder for testing',
    parentId: null,
    itemCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
};

export const mockYamlTemplate = `name: Test Template
description: A test template from barn
agents:
  - role: developer
    tasks:
      - implement feature
      - write tests
    tools:
      - code editor
      - testing framework
  - role: reviewer
    tasks:
      - review code
      - suggest improvements
`;

export const mockSearchResults = {
  items: mockBarnItems.slice(0, 2),
  totalCount: 2,
  page: 1,
  pageSize: 10
};

export const mockErrorResponses = {
  notFound: { error: 'Barn item not found' },
  harvestNotFound: { error: 'Harvest not found' },
  harvestNotReady: { error: 'Harvest is not ready for storage' },
  missingHarvestId: { error: 'Harvest ID is required' },
  missingFolderName: { error: 'Folder name is required' },
  noYamlConfig: { error: 'Barn item does not have YAML configuration' },
  serverError: { error: 'Internal server error' }
};