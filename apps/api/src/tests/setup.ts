// @ts-nocheck
import { jest } from '@jest/globals';
import * as dotenv from 'dotenv';
import { TextEncoder, TextDecoder } from 'util';

// Setup globals for Node test environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.BYPASS_AUTH = 'true';
process.env.DB_HOST = process.env.TEST_DB_HOST || 'localhost';
process.env.DB_PORT = process.env.TEST_DB_PORT || '5432';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'maifarm_test';
process.env.DB_USER = process.env.TEST_DB_USER || 'maifarm';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'maifarm123';
process.env.REDIS_HOST = process.env.TEST_REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.TEST_REDIS_PORT || '6379';
process.env.ANALYTICS_COST_CACHE_MS = '0';
process.env.ANALYTICS_STORAGE_CACHE_MS = '0';

// Only mock database for unit tests, not integration tests
// Integration tests will use real database connection to maifarm_test
const isIntegrationTest = process.env.RUN_INTEGRATION_TESTS === 'true' ||
                          process.env.INTEGRATION_TESTS === 'true' ||
                          process.argv.some(arg => arg.includes('integration')) ||
                          process.argv.some(arg => arg.includes('passwordless'));

// FIX: Create mock functions with 'mock' prefix to satisfy babel-jest requirements
// Jest hoists jest.mock() calls and requires mock variable names to start with 'mock'
const mockFn = jest.fn;

// Don't mock database for integration tests - they need real database
// Unit tests will use mocked database
if (!isIntegrationTest) {
  // Create comprehensive Redis mock
  const mockCreateRedisMock = () => ({
    connect: mockFn().mockResolvedValue(undefined),
    disconnect: mockFn().mockResolvedValue(undefined),
    quit: mockFn().mockResolvedValue(undefined),
    ping: mockFn().mockResolvedValue('PONG'),
    get: mockFn().mockResolvedValue(null),
    set: mockFn().mockResolvedValue('OK'),
    setEx: mockFn().mockResolvedValue('OK'),
    del: mockFn().mockResolvedValue(1),
    exists: mockFn().mockResolvedValue(1),
    mGet: mockFn().mockResolvedValue([]),
    mSet: mockFn().mockResolvedValue('OK'),
    keys: mockFn().mockResolvedValue([]),
    expire: mockFn().mockResolvedValue(1),
    ttl: mockFn().mockResolvedValue(-1),
    hGet: mockFn().mockResolvedValue(null),
    hSet: mockFn().mockResolvedValue(1),
    hGetAll: mockFn().mockResolvedValue({}),
    sAdd: mockFn().mockResolvedValue(1),
    sMembers: mockFn().mockResolvedValue([]),
    sRem: mockFn().mockResolvedValue(1),
    on: mockFn(),
    off: mockFn(),
    duplicate: mockFn().mockImplementation(() => mockCreateRedisMock()),
    isOpen: true,
    isReady: true,
  });

  // Mock database connections for unit tests only
  jest.mock('../database/connection', () => ({
    db: {
      query: mockFn().mockResolvedValue({ rows: [], rowCount: 0 }),
      connect: mockFn(),
      end: mockFn()
    },
    redis: mockCreateRedisMock(),
    checkDatabaseHealth: mockFn().mockResolvedValue({ postgres: true, redis: true })
  }));
}

// Mock external services
jest.mock('../services/agentCoordinatorV2');
jest.mock('../services/coordinationService');
jest.mock('../websocket/socketServer', () => {
  const mockSocketFn = jest.fn;
  return {
    getSocketServer: mockSocketFn(() => ({
      emit: mockSocketFn(),
      to: mockSocketFn(() => ({ emit: mockSocketFn() })),
      sockets: {
        sockets: new Map()
      }
    }))
  };
});

// Mock logger to reduce noise in tests
jest.mock('../utils/logger', () => {
  const mockLoggerFn = jest.fn;
  return {
    logger: {
      info: mockLoggerFn(),
      error: mockLoggerFn(),
      warn: mockLoggerFn(),
      debug: mockLoggerFn(),
      trace: mockLoggerFn(),
      fatal: mockLoggerFn()
    },
    LogCategory: {
      SYSTEM: 'SYSTEM',
      DATABASE: 'DATABASE',
      AUTH: 'AUTH',
      FARM: 'FARM',
      AGENT: 'AGENT',
      HARVEST: 'HARVEST',
      TERMINAL: 'TERMINAL',
      WEBSOCKET: 'WEBSOCKET',
      API: 'API',
      ORCHESTRATOR: 'ORCHESTRATOR',
      RECOVERY: 'RECOVERY',
      HEALTH: 'HEALTH',
      PERFORMANCE: 'PERFORMANCE',
      SECURITY: 'SECURITY',
      BARN: 'BARN',
      ERROR: 'ERROR',
      MONITORING: 'MONITORING',
      XENOSYNC: 'XENOSYNC',
      EMAIL: 'EMAIL'
    }
  };
});

// Global test utilities
global.beforeEach = global.beforeEach || (() => {});
global.afterEach = global.afterEach || (() => {});

// Increase timeout for integration tests
if (process.env.RUN_INTEGRATION_TESTS) {
  jest.setTimeout(60000);
}

// Clean up after all tests
afterAll(async () => {
  // Close any open handles
  await new Promise(resolve => setTimeout(resolve, 500));
});
