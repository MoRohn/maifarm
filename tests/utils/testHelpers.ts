import { render, RenderOptions } from '@testing-library/react';
import { ReactElement, ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { act } from '@testing-library/react';

/**
 * Comprehensive Test Utility Library for MaiFarm
 * Provides common testing patterns and utilities
 */

// ============================================
// React Testing Utilities
// ============================================

interface AllTheProvidersProps {
  children: ReactNode;
}

/**
 * Wraps components with all necessary providers for testing
 */
export function AllTheProviders({ children }: AllTheProvidersProps) {
  return (
    <BrowserRouter>
      {children}
    </BrowserRouter>
  );
}

/**
 * Custom render function that includes all providers
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllTheProviders, ...options });
}

// ============================================
// Mock Data Factories
// ============================================

/**
 * Creates a mock farm object for testing
 */
export function createMockFarm(overrides?: Partial<any>) {
  return {
    id: `farm-${Date.now()}`,
    name: 'Test Farm',
    status: 'preparing',
    createdAt: new Date().toISOString(),
    type: 'standard',
    description: 'Test farm for unit tests',
    agents: [],
    metrics: {
      totalTasks: 0,
      completedTasks: 0,
      activeAgents: 0,
      successRate: 0
    },
    ...overrides
  };
}

/**
 * Creates a mock harvest object for testing
 */
export function createMockHarvest(overrides?: Partial<any>) {
  return {
    id: `harvest-${Date.now()}`,
    farmId: 'farm-123',
    farmName: 'Test Farm',
    status: 'in_progress',
    startedAt: new Date(),
    completedAt: null,
    yield: {
      artifacts: [],
      insights: [],
      metrics: {
        totalArtifacts: 0,
        totalInsights: 0,
        qualityScore: 0,
        processingTime: 0
      }
    },
    quality: 85,
    tags: ['test'],
    metadata: {
      agentCount: 3,
      taskCount: 10,
      duration: 0
    },
    ...overrides
  };
}

/**
 * Creates a mock agent object for testing
 */
export function createMockAgent(overrides?: Partial<any>) {
  return {
    id: `agent-${Date.now()}`,
    name: 'Test Agent',
    status: 'idle',
    type: 'claude',
    currentTask: null,
    completedTasks: 0,
    errorCount: 0,
    lastActive: new Date().toISOString(),
    capabilities: ['code', 'analysis'],
    ...overrides
  };
}

/**
 * Creates a mock WebSocket event
 */
export function createMockWebSocketEvent(event: string, data: any) {
  return {
    type: event,
    data,
    timestamp: Date.now()
  };
}

// ============================================
// Async Testing Utilities
// ============================================

/**
 * Waits for a condition to be true
 */
export async function waitForCondition(
  condition: () => boolean,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Condition not met within timeout');
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

/**
 * Flushes all promises in the event loop
 */
export async function flushPromises(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

/**
 * Advances timers and flushes promises
 */
export async function advanceTimersAndFlush(ms: number): Promise<void> {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
  await flushPromises();
}

// ============================================
// Mock Service Utilities
// ============================================

/**
 * Creates a mock API client with common methods
 */
export function createMockApiClient() {
  return {
    get: jest.fn().mockResolvedValue({ data: [] }),
    post: jest.fn().mockResolvedValue({ data: {} }),
    put: jest.fn().mockResolvedValue({ data: {} }),
    patch: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} })
  };
}

/**
 * Creates a mock WebSocket connection
 */
export function createMockWebSocket() {
  const listeners = new Map<string, Set<Function>>();
  
  return {
    connected: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    emit: jest.fn(),
    on: jest.fn((event: string, handler: Function) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)?.add(handler);
      return () => listeners.get(event)?.delete(handler);
    }),
    off: jest.fn((event: string, handler: Function) => {
      listeners.get(event)?.delete(handler);
    }),
    removeAllListeners: jest.fn(() => listeners.clear()),
    // Helper to trigger events in tests
    __trigger: (event: string, data: any) => {
      listeners.get(event)?.forEach(handler => handler(data));
    }
  };
}

// ============================================
// Performance Testing Utilities
// ============================================

/**
 * Measures the execution time of a function
 */
export async function measureExecutionTime<T>(
  fn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const startTime = performance.now();
  const result = await fn();
  const duration = performance.now() - startTime;
  return { result, duration };
}

/**
 * Runs a function multiple times and collects performance metrics
 */
export async function benchmarkFunction<T>(
  fn: () => Promise<T>,
  iterations = 100
): Promise<{
  average: number;
  min: number;
  max: number;
  median: number;
  stdDev: number;
}> {
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const { duration } = await measureExecutionTime(fn);
    times.push(duration);
  }
  
  times.sort((a, b) => a - b);
  
  const sum = times.reduce((a, b) => a + b, 0);
  const average = sum / times.length;
  const min = times[0];
  const max = times[times.length - 1];
  const median = times[Math.floor(times.length / 2)];
  
  const squaredDiffs = times.map(time => Math.pow(time - average, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / times.length;
  const stdDev = Math.sqrt(avgSquaredDiff);
  
  return { average, min, max, median, stdDev };
}

// ============================================
// Assertion Helpers
// ============================================

/**
 * Asserts that a promise rejects with a specific error
 */
export async function expectToRejectWith(
  promise: Promise<any>,
  expectedError: string | RegExp
): Promise<void> {
  try {
    await promise;
    throw new Error('Expected promise to reject but it resolved');
  } catch (error: any) {
    if (typeof expectedError === 'string') {
      expect(error.message).toBe(expectedError);
    } else {
      expect(error.message).toMatch(expectedError);
    }
  }
}

/**
 * Asserts that a function throws with specific error
 */
export function expectToThrowWith(
  fn: () => void,
  expectedError: string | RegExp
): void {
  try {
    fn();
    throw new Error('Expected function to throw but it did not');
  } catch (error: any) {
    if (typeof expectedError === 'string') {
      expect(error.message).toBe(expectedError);
    } else {
      expect(error.message).toMatch(expectedError);
    }
  }
}

// ============================================
// Snapshot Testing Utilities
// ============================================

/**
 * Creates a deterministic snapshot by removing dynamic values
 */
export function createDeterministicSnapshot(obj: any): any {
  const cleaned = JSON.parse(JSON.stringify(obj));
  
  function clean(item: any): any {
    if (Array.isArray(item)) {
      return item.map(clean);
    }
    
    if (item && typeof item === 'object') {
      const result: any = {};
      for (const key in item) {
        if (key === 'id' || key.endsWith('Id')) {
          result[key] = '[ID]';
        } else if (key === 'timestamp' || key.endsWith('At')) {
          result[key] = '[TIMESTAMP]';
        } else if (key === 'token' || key === 'secret') {
          result[key] = '[REDACTED]';
        } else {
          result[key] = clean(item[key]);
        }
      }
      return result;
    }
    
    return item;
  }
  
  return clean(cleaned);
}

// ============================================
// Test Environment Utilities
// ============================================

/**
 * Sets up common test environment variables
 */
export function setupTestEnvironment() {
  process.env.NODE_ENV = 'test';
  process.env.BYPASS_AUTH = 'true';
  process.env.PORT = '4567';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
}

/**
 * Cleans up test environment
 */
export function cleanupTestEnvironment() {
  jest.clearAllMocks();
  jest.clearAllTimers();
  localStorage.clear();
  sessionStorage.clear();
}

// ============================================
// Database Testing Utilities
// ============================================

/**
 * Creates a test database transaction that rolls back after test
 */
export async function withTransaction<T>(
  fn: () => Promise<T>
): Promise<T> {
  // This is a placeholder - actual implementation would depend on your DB setup
  try {
    // BEGIN TRANSACTION
    const result = await fn();
    // ROLLBACK TRANSACTION
    return result;
  } catch (error) {
    // ROLLBACK TRANSACTION
    throw error;
  }
}

// ============================================
// Event Testing Utilities
// ============================================

/**
 * Creates an event spy that tracks all events
 */
export function createEventSpy() {
  const events: Array<{ type: string; data: any; timestamp: number }> = [];
  
  return {
    record: (type: string, data: any) => {
      events.push({ type, data, timestamp: Date.now() });
    },
    getEvents: () => [...events],
    getEventsByType: (type: string) => events.filter(e => e.type === type),
    clear: () => events.length = 0,
    hasEvent: (type: string) => events.some(e => e.type === type),
    getLastEvent: () => events[events.length - 1]
  };
}

// ============================================
// Console Mocking Utilities
// ============================================

/**
 * Mocks console methods and tracks calls
 */
export function mockConsole() {
  const originalConsole = { ...console };
  const calls = {
    log: [] as any[][],
    warn: [] as any[][],
    error: [] as any[][],
    info: [] as any[][]
  };
  
  console.log = jest.fn((...args) => calls.log.push(args));
  console.warn = jest.fn((...args) => calls.warn.push(args));
  console.error = jest.fn((...args) => calls.error.push(args));
  console.info = jest.fn((...args) => calls.info.push(args));
  
  return {
    calls,
    restore: () => Object.assign(console, originalConsole),
    expectNoErrors: () => expect(calls.error).toHaveLength(0),
    expectNoWarnings: () => expect(calls.warn).toHaveLength(0)
  };
}

// ============================================
// Export all utilities
// ============================================

export const TestHelpers = {
  // React
  renderWithProviders,
  
  // Mock Data
  createMockFarm,
  createMockHarvest,
  createMockAgent,
  createMockWebSocketEvent,
  
  // Async
  waitForCondition,
  flushPromises,
  advanceTimersAndFlush,
  
  // Services
  createMockApiClient,
  createMockWebSocket,
  
  // Performance
  measureExecutionTime,
  benchmarkFunction,
  
  // Assertions
  expectToRejectWith,
  expectToThrowWith,
  
  // Snapshots
  createDeterministicSnapshot,
  
  // Environment
  setupTestEnvironment,
  cleanupTestEnvironment,
  
  // Database
  withTransaction,
  
  // Events
  createEventSpy,
  
  // Console
  mockConsole
};