import { jest } from '@jest/globals';
import { Socket } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { QueryResult } from 'pg';

/**
 * Test utility functions for MaiFarm testing
 */

// ============================================
// Mock Data Generators
// ============================================

export function createMockFarm(overrides = {}) {
  return {
    id: 'farm-' + Math.random().toString(36).substr(2, 9),
    name: 'Test Farm',
    status: 'active',
    agents: [],
    created_at: new Date(),
    updated_at: new Date(),
    metadata: {},
    ...overrides,
  };
}

export function createMockAgent(overrides = {}) {
  return {
    id: 'agent-' + Math.random().toString(36).substr(2, 9),
    name: 'Test Agent',
    status: 'idle',
    farmId: 'farm-123',
    capabilities: ['code', 'test', 'deploy'],
    metrics: {
      tasksCompleted: 0,
      successRate: 100,
      avgResponseTime: 0,
    },
    ...overrides,
  };
}

export function createMockHarvest(overrides = {}) {
  return {
    id: 'harvest-' + Math.random().toString(36).substr(2, 9),
    farmId: 'farm-123',
    farmName: 'Test Farm',
    status: 'completed',
    startedAt: new Date(),
    completedAt: new Date(),
    totalTasks: 10,
    completedTasks: 10,
    successRate: 100,
    overallQuality: 95,
    yieldCount: 5,
    yield: [],
    metadata: {},
    ...overrides,
  };
}

export function createMockTask(overrides = {}) {
  return {
    id: 'task-' + Math.random().toString(36).substr(2, 9),
    type: 'quick-task',
    status: 'pending',
    prompt: 'Test task prompt',
    createdAt: new Date(),
    metadata: {},
    ...overrides,
  };
}

// ============================================
// Database Mock Helpers
// ============================================

export function createMockQueryResult<T = any>(rows: T[]): QueryResult<T> {
  return {
    rows,
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    fields: [],
  };
}

export function createMockDbClient() {
  return {
    query: jest.fn(),
    connect: jest.fn(),
    release: jest.fn(),
    end: jest.fn(),
  };
}

export function mockDatabaseQuery(db: any, responses: Array<{ query?: string | RegExp; result: any }>) {
  const mockQuery = db.query as jest.MockedFunction<typeof db.query>;
  
  responses.forEach(({ query, result }) => {
    if (query) {
      mockQuery.mockImplementation((sql: string) => {
        if (typeof query === 'string' ? sql.includes(query) : query.test(sql)) {
          return Promise.resolve(createMockQueryResult(result));
        }
        return Promise.reject(new Error('Query not mocked: ' + sql));
      });
    } else {
      mockQuery.mockResolvedValueOnce(createMockQueryResult(result));
    }
  });
}

// ============================================
// WebSocket Mock Helpers
// ============================================

export function createMockSocket(): Socket {
  return {
    id: 'socket-' + Math.random().toString(36).substr(2, 9),
    emit: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    off: jest.fn(),
    disconnect: jest.fn(),
    broadcast: {
      emit: jest.fn(),
    },
    to: jest.fn(() => ({
      emit: jest.fn(),
    })),
    join: jest.fn(),
    leave: jest.fn(),
    handshake: {
      auth: {},
      headers: {},
      query: {},
    },
  } as unknown as Socket;
}

export function createMockClientSocket(): ClientSocket {
  return {
    id: 'client-' + Math.random().toString(36).substr(2, 9),
    connected: true,
    emit: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    off: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
  } as unknown as ClientSocket;
}

export async function waitForSocketEvent(
  socket: Socket | ClientSocket,
  event: string,
  timeout = 1000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${event}`));
    }, timeout);

    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

// ============================================
// Async Test Helpers
// ============================================

export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  
  throw new Error('Timeout waiting for condition');
}

export async function expectEventually(
  assertion: () => void | Promise<void>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();
  let lastError: Error | undefined;

  while (Date.now() - startTime < timeout) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error as Error;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }

  throw lastError || new Error('Assertion failed');
}

// ============================================
// Performance Test Helpers
// ============================================

export class PerformanceTimer {
  private startTime: number;
  private marks: Map<string, number> = new Map();

  constructor() {
    this.startTime = performance.now();
  }

  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  measure(name: string, startMark?: string): number {
    const endTime = performance.now();
    const startTime = startMark ? this.marks.get(startMark) : this.startTime;
    
    if (!startTime) {
      throw new Error(`Mark '${startMark}' not found`);
    }
    
    return endTime - startTime;
  }

  getMarks(): Record<string, number> {
    const result: Record<string, number> = {};
    this.marks.forEach((time, name) => {
      result[name] = time - this.startTime;
    });
    return result;
  }
}

export async function measureAsyncOperation<T>(
  operation: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const startTime = performance.now();
  const result = await operation();
  const duration = performance.now() - startTime;
  
  return { result, duration };
}

// ============================================
// Test Data Fixtures
// ============================================

export const fixtures = {
  farms: [
    createMockFarm({ id: 'farm-1', name: 'Development Farm' }),
    createMockFarm({ id: 'farm-2', name: 'Testing Farm' }),
    createMockFarm({ id: 'farm-3', name: 'Production Farm' }),
  ],
  
  agents: [
    createMockAgent({ id: 'agent-1', name: 'Code Agent' }),
    createMockAgent({ id: 'agent-2', name: 'Test Agent' }),
    createMockAgent({ id: 'agent-3', name: 'Deploy Agent' }),
  ],
  
  harvests: [
    createMockHarvest({ id: 'harvest-1', successRate: 100 }),
    createMockHarvest({ id: 'harvest-2', successRate: 85 }),
    createMockHarvest({ id: 'harvest-3', successRate: 70 }),
  ],
  
  tasks: [
    createMockTask({ id: 'task-1', type: 'build' }),
    createMockTask({ id: 'task-2', type: 'test' }),
    createMockTask({ id: 'task-3', type: 'deploy' }),
  ],
};

// ============================================
// Assertion Helpers
// ============================================

export function expectToBeWithinRange(value: number, min: number, max: number): void {
  expect(value).toBeGreaterThanOrEqual(min);
  expect(value).toBeLessThanOrEqual(max);
}

export function expectArrayToContainObject(array: any[], partial: object): void {
  expect(array).toContainEqual(expect.objectContaining(partial));
}

export function expectToHaveBeenCalledWithPartial(
  mockFn: jest.Mock,
  partial: object,
  callIndex = 0
): void {
  expect(mockFn).toHaveBeenCalled();
  const calls = mockFn.mock.calls;
  expect(calls[callIndex][0]).toMatchObject(partial);
}

// ============================================
// Error Testing Helpers
// ============================================

export async function expectToThrowAsync(
  fn: () => Promise<any>,
  errorMatcher?: string | RegExp | Error
): Promise<void> {
  let error: Error | undefined;
  
  try {
    await fn();
  } catch (e) {
    error = e as Error;
  }
  
  expect(error).toBeDefined();
  
  if (errorMatcher) {
    if (typeof errorMatcher === 'string') {
      expect(error?.message).toContain(errorMatcher);
    } else if (errorMatcher instanceof RegExp) {
      expect(error?.message).toMatch(errorMatcher);
    } else {
      expect(error).toEqual(errorMatcher);
    }
  }
}

// ============================================
// Environment Setup Helpers
// ============================================

export function setupTestEnvironment(overrides: Record<string, string> = {}): void {
  const originalEnv = { ...process.env };
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  process.env.DB_HOST = 'localhost';
  process.env.DB_PORT = '5432';
  process.env.DB_NAME = 'maifarm_test';
  process.env.BYPASS_AUTH = 'true';
  
  // Apply overrides
  Object.assign(process.env, overrides);
  
  // Return cleanup function
  return () => {
    process.env = originalEnv;
  };
}

// ============================================
// Memory Leak Detection
// ============================================

export class MemoryLeakDetector {
  private initialMemory: number;
  private samples: number[] = [];

  start(): void {
    if (global.gc) {
      global.gc();
    }
    this.initialMemory = process.memoryUsage().heapUsed;
  }

  sample(): void {
    if (global.gc) {
      global.gc();
    }
    this.samples.push(process.memoryUsage().heapUsed);
  }

  analyze(threshold = 10 * 1024 * 1024): { leaked: boolean; delta: number } {
    if (this.samples.length === 0) {
      throw new Error('No samples collected');
    }

    const finalMemory = this.samples[this.samples.length - 1];
    const delta = finalMemory - this.initialMemory;
    
    return {
      leaked: delta > threshold,
      delta,
    };
  }
}

// ============================================
// Snapshot Testing Helpers
// ============================================

export function sanitizeSnapshot(obj: any): any {
  const sanitized = JSON.parse(JSON.stringify(obj));
  
  const sanitizeRecursive = (item: any): any => {
    if (item && typeof item === 'object') {
      // Remove dynamic values
      delete item.id;
      delete item.createdAt;
      delete item.updatedAt;
      delete item.timestamp;
      
      // Sanitize nested objects
      Object.keys(item).forEach((key) => {
        item[key] = sanitizeRecursive(item[key]);
      });
    }
    
    return item;
  };
  
  return sanitizeRecursive(sanitized);
}

// ============================================
// React Testing Helpers
// ============================================

export function createMockStore(initialState = {}) {
  return {
    getState: jest.fn(() => initialState),
    setState: jest.fn(),
    subscribe: jest.fn(),
    destroy: jest.fn(),
  };
}

export function createMockRouter() {
  return {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
    pathname: '/',
    query: {},
    asPath: '/',
  };
}

// ============================================
// API Testing Helpers
// ============================================

export function createMockRequest(overrides = {}): any {
  return {
    method: 'GET',
    url: '/',
    headers: {},
    body: {},
    query: {},
    params: {},
    ...overrides,
  };
}

export function createMockResponse(): any {
  const res: any = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
    send: jest.fn(() => res),
    end: jest.fn(() => res),
    setHeader: jest.fn(() => res),
  };
  return res;
}

export function createMockNext(): jest.Mock {
  return jest.fn();
}