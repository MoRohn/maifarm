import { jest } from '@jest/globals';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.BYPASS_AUTH = 'true';
process.env.DB_HOST = process.env.TEST_DB_HOST || 'localhost';
process.env.DB_PORT = process.env.TEST_DB_PORT || '5432';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'maifarm_test';
process.env.DB_USER = process.env.TEST_DB_USER || 'postgres';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'postgres';
process.env.REDIS_HOST = process.env.TEST_REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.TEST_REDIS_PORT || '6379';

// Mock database connections before they're imported
jest.mock('../database/connection', () => ({
  db: {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn()
  },
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn()
  },
  checkDatabaseHealth: jest.fn().mockResolvedValue({ postgres: true, redis: true })
}));

// Mock external services
jest.mock('../services/claudeCodeCoordinator');
jest.mock('../services/coordinationService');
jest.mock('../websocket/socketServer', () => ({
  getSocketServer: jest.fn(() => ({
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
    sockets: {
      sockets: new Map()
    }
  }))
}));

// Mock logger to reduce noise in tests
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

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