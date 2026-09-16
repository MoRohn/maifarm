// Mock Logger for Testing
import { jest } from '@jest/globals';

// Export LogCategory enum
export enum LogCategory {
  SYSTEM = 'SYSTEM',
  DATABASE = 'DATABASE',
  AUTH = 'AUTH',
  FARM = 'FARM',
  AGENT = 'AGENT',
  HARVEST = 'HARVEST',
  TERMINAL = 'TERMINAL',
  WEBSOCKET = 'WEBSOCKET',
  API = 'API',
  ORCHESTRATOR = 'ORCHESTRATOR',
  RECOVERY = 'RECOVERY',
  HEALTH = 'HEALTH',
  PERFORMANCE = 'PERFORMANCE',
  SECURITY = 'SECURITY',
  BARN = 'BARN'
}

// Mock logger instance
export const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn()
};

// Export default
export default logger;
