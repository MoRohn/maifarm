/**
 * Enhanced Jest Setup Configuration
 * Provides comprehensive test environment setup with improved error handling,
 * performance monitoring, and test isolation
 */

import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';
import { performance } from 'perf_hooks';

// ============================================
// Global Polyfills
// ============================================

// Add TextEncoder/TextDecoder for Node environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Add performance API
global.performance = performance as any;

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// ============================================
// Environment Configuration
// ============================================

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.BYPASS_AUTH = 'true';
process.env.SILENT_WEBSOCKET = 'true';
process.env.DISABLE_TELEMETRY = 'true';

// ============================================
// Test Isolation and Cleanup
// ============================================

// Track test execution metrics
const testMetrics = new Map<string, {
  duration: number;
  memoryUsed: number;
  assertions: number;
}>();

// Before each test
beforeEach(() => {
  // Clear all mocks
  jest.clearAllMocks();
  
  // Clear storage
  localStorage.clear();
  sessionStorage.clear();
  
  // Reset fetch mock if exists
  if (global.fetch && jest.isMockFunction(global.fetch)) {
    (global.fetch as jest.Mock).mockClear();
  }
  
  // Clear all timers
  jest.clearAllTimers();
  
  // Track test start
  const currentTest = expect.getState().currentTestName;
  if (currentTest) {
    testMetrics.set(currentTest, {
      duration: performance.now(),
      memoryUsed: process.memoryUsage().heapUsed,
      assertions: 0
    });
  }
});

// After each test
afterEach(() => {
  // Check for unhandled promises
  const unhandledPromises = (global as any).__unhandledPromises;
  if (unhandledPromises && unhandledPromises.length > 0) {
    console.warn('Unhandled promises detected:', unhandledPromises);
    (global as any).__unhandledPromises = [];
  }
  
  // Track test completion
  const currentTest = expect.getState().currentTestName;
  const metrics = testMetrics.get(currentTest || '');
  if (metrics) {
    metrics.duration = performance.now() - metrics.duration;
    metrics.memoryUsed = process.memoryUsage().heapUsed - metrics.memoryUsed;
    metrics.assertions = expect.getState().assertionCalls;
    
    // Warn about slow tests
    if (metrics.duration > 1000) {
      console.warn(`Slow test detected: ${currentTest} took ${metrics.duration.toFixed(2)}ms`);
    }
    
    // Warn about memory intensive tests
    if (metrics.memoryUsed > 50 * 1024 * 1024) { // 50MB
      console.warn(`Memory intensive test: ${currentTest} used ${(metrics.memoryUsed / 1024 / 1024).toFixed(2)}MB`);
    }
  }
});

// ============================================
// Enhanced Error Handling
// ============================================

// Track unhandled rejections
const unhandledRejections = new Set<Promise<any>>();

process.on('unhandledRejection', (reason, promise) => {
  unhandledRejections.add(promise);
  console.error('Unhandled Promise Rejection:', reason);
});

process.on('rejectionHandled', (promise) => {
  unhandledRejections.delete(promise);
});

// Better error messages for async tests
const originalIt = global.it;
global.it = function(name: string, fn?: jest.ProvidesCallback, timeout?: number) {
  if (fn && fn.length === 0) {
    // Wrap async functions to provide better error context
    const wrappedFn = async function(this: any) {
      try {
        return await fn.call(this);
      } catch (error: any) {
        error.message = `Test "${name}" failed: ${error.message}`;
        throw error;
      }
    };
    return originalIt(name, wrappedFn, timeout);
  }
  return originalIt(name, fn!, timeout);
} as any;

// ============================================
// Custom Jest Matchers
// ============================================

expect.extend({
  /**
   * Check if a value is within a range
   */
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
  
  /**
   * Check if an async function completes within a time limit
   */
  async toCompleteWithin(received: Promise<any>, milliseconds: number) {
    const start = performance.now();
    try {
      await received;
      const duration = performance.now() - start;
      const pass = duration <= milliseconds;
      
      if (pass) {
        return {
          message: () => `expected promise not to complete within ${milliseconds}ms, but it completed in ${duration.toFixed(2)}ms`,
          pass: true,
        };
      } else {
        return {
          message: () => `expected promise to complete within ${milliseconds}ms, but it took ${duration.toFixed(2)}ms`,
          pass: false,
        };
      }
    } catch (error) {
      return {
        message: () => `expected promise to complete, but it rejected with: ${error}`,
        pass: false,
      };
    }
  },
  
  /**
   * Check if an object matches a partial structure
   */
  toMatchStructure(received: any, structure: any) {
    function checkStructure(obj: any, struct: any, path = ''): { pass: boolean; message: string } {
      for (const key in struct) {
        const currentPath = path ? `${path}.${key}` : key;
        
        if (!(key in obj)) {
          return {
            pass: false,
            message: `Missing property at path: ${currentPath}`
          };
        }
        
        if (typeof struct[key] === 'object' && struct[key] !== null) {
          const result = checkStructure(obj[key], struct[key], currentPath);
          if (!result.pass) return result;
        } else if (typeof struct[key] === 'string' && struct[key].startsWith('typeof:')) {
          const expectedType = struct[key].substring(7);
          const actualType = typeof obj[key];
          if (actualType !== expectedType) {
            return {
              pass: false,
              message: `Type mismatch at ${currentPath}: expected ${expectedType}, got ${actualType}`
            };
          }
        }
      }
      
      return { pass: true, message: '' };
    }
    
    const result = checkStructure(received, structure);
    
    if (result.pass) {
      return {
        message: () => `expected object not to match structure`,
        pass: true,
      };
    } else {
      return {
        message: () => result.message,
        pass: false,
      };
    }
  }
});

// ============================================
// Mock Implementations
// ============================================

// Mock fetch globally
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    blob: () => Promise.resolve(new Blob()),
    headers: new Headers(),
  } as Response)
);

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  
  readyState = MockWebSocket.CONNECTING;
  url: string;
  
  constructor(url: string) {
    this.url = url;
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.({} as Event);
    }, 0);
  }
  
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  
  send = jest.fn();
  close = jest.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({} as CloseEvent);
  });
  
  addEventListener = jest.fn();
  removeEventListener = jest.fn();
  dispatchEvent = jest.fn();
}

global.WebSocket = MockWebSocket as any;

// ============================================
// Console Enhancements
// ============================================

// Suppress specific console messages in tests
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = (...args: any[]) => {
  // Suppress React act() warnings
  if (args[0]?.includes?.('Warning: An update to') && args[0]?.includes?.('was not wrapped in act')) {
    return;
  }
  // Suppress expected error messages
  if (args[0]?.includes?.('[Expected Error]')) {
    return;
  }
  originalConsoleError(...args);
};

console.warn = (...args: any[]) => {
  // Suppress specific warnings
  if (args[0]?.includes?.('[Expected Warning]')) {
    return;
  }
  originalConsoleWarn(...args);
};

// ============================================
// Test Utilities
// ============================================

// Helper to wait for next tick
global.nextTick = () => new Promise(resolve => setImmediate(resolve));

// Helper to wait for specific time
global.wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to create a deferred promise
global.createDeferred = <T>() => {
  let resolve: (value: T) => void;
  let reject: (reason?: any) => void;
  
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  
  return { promise, resolve: resolve!, reject: reject! };
};

// ============================================
// TypeScript Declarations
// ============================================

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
      toCompleteWithin(milliseconds: number): Promise<R>;
      toMatchStructure(structure: any): R;
    }
  }
  
  function nextTick(): Promise<void>;
  function wait(ms: number): Promise<void>;
  function createDeferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: any) => void;
  };
}

// ============================================
// Performance Monitoring
// ============================================

// Report test suite performance at the end
afterAll(() => {
  if (process.env.SHOW_TEST_METRICS === 'true') {
    console.log('\n=== Test Performance Metrics ===');
    
    let totalDuration = 0;
    let totalMemory = 0;
    let totalAssertions = 0;
    
    testMetrics.forEach((metrics, testName) => {
      totalDuration += metrics.duration;
      totalMemory += metrics.memoryUsed;
      totalAssertions += metrics.assertions;
    });
    
    console.log(`Total Tests: ${testMetrics.size}`);
    console.log(`Total Duration: ${totalDuration.toFixed(2)}ms`);
    console.log(`Average Duration: ${(totalDuration / testMetrics.size).toFixed(2)}ms`);
    console.log(`Total Memory Used: ${(totalMemory / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Total Assertions: ${totalAssertions}`);
    
    // Find slowest tests
    const sortedTests = Array.from(testMetrics.entries())
      .sort((a, b) => b[1].duration - a[1].duration)
      .slice(0, 5);
    
    if (sortedTests.length > 0) {
      console.log('\nSlowest Tests:');
      sortedTests.forEach(([name, metrics]) => {
        console.log(`  ${name}: ${metrics.duration.toFixed(2)}ms`);
      });
    }
  }
});

export {};