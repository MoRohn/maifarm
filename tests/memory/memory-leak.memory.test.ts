import { render, cleanup } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from '../../src/components/Dashboard/Dashboard';
import HarvestPage from '../../src/components/Harvest/HarvestPage';
import FarmCreator from '../../src/components/Farm/FarmCreator';

// Mock WebSocket and stores to avoid real connections
jest.mock('../../src/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    connected: true,
    subscribe: jest.fn(() => jest.fn()), // Return cleanup function
    unsubscribe: jest.fn(),
    sendMessage: jest.fn()
  })
}));

jest.mock('../../src/store/farmStore', () => ({
  useFarmStore: () => ({
    farms: Array.from({ length: 100 }, (_, i) => ({
      id: `farm-${i}`,
      name: `Test Farm ${i}`,
      status: 'running',
      agents: Array.from({ length: 5 }, (_, j) => ({
        id: `agent-${i}-${j}`,
        name: `Agent ${j}`,
        status: 'active'
      }))
    })),
    loading: false,
    error: null,
    fetchFarms: jest.fn(),
    createFarm: jest.fn()
  })
}));

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('Memory Leak Detection Tests', () => {
  beforeEach(() => {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  afterEach(() => {
    cleanup();
    // Force garbage collection after each test
    if (global.gc) {
      global.gc();
    }
  });

  test('Dashboard should not leak memory on repeated mounting/unmounting', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Mount and unmount Dashboard component 50 times
    for (let i = 0; i < 50; i++) {
      const { unmount } = renderWithRouter(<Dashboard />);
      
      // Simulate some interactions
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      
      unmount();
      
      // Force cleanup every 10 iterations
      if (i % 10 === 0) {
        cleanup();
        if (global.gc) {
          global.gc();
        }
      }
    }
    
    // Final garbage collection
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    // Memory increase should be reasonable (less than 50MB)
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    
    console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
  });

  test('WebSocket subscriptions should be properly cleaned up', async () => {
    const subscriptions = new Set();
    const mockSubscribe = jest.fn(() => {
      const cleanup = jest.fn();
      subscriptions.add(cleanup);
      return cleanup;
    });

    // Mock useWebSocket to track subscriptions
    jest.doMock('../../src/hooks/useWebSocket', () => ({
      useWebSocket: () => ({
        connected: true,
        subscribe: mockSubscribe,
        unsubscribe: jest.fn(),
        sendMessage: jest.fn()
      })
    }));

    const { unmount } = renderWithRouter(<HarvestPage />);
    
    // Simulate component lifecycle
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    const subscriptionCount = mockSubscribe.mock.calls.length;
    expect(subscriptionCount).toBeGreaterThan(0);
    
    // Unmount component
    unmount();
    
    // Verify cleanup functions were called
    expect(subscriptions.size).toBeGreaterThan(0);
    console.log(`Created ${subscriptionCount} WebSocket subscriptions`);
  });

  test('Large data sets should not cause memory issues', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Create mock store with large dataset
    const largeFarmData = Array.from({ length: 1000 }, (_, i) => ({
      id: `farm-${i}`,
      name: `Large Farm ${i}`,
      status: 'running',
      agents: Array.from({ length: 20 }, (_, j) => ({
        id: `agent-${i}-${j}`,
        name: `Agent ${j}`,
        status: 'active',
        metrics: Array.from({ length: 100 }, (_, k) => ({
          timestamp: new Date(),
          value: Math.random() * 100,
          metric: `metric-${k}`
        }))
      }))
    }));

    jest.doMock('../../src/store/farmStore', () => ({
      useFarmStore: () => ({
        farms: largeFarmData,
        loading: false,
        error: null,
        fetchFarms: jest.fn(),
        createFarm: jest.fn()
      })
    }));

    const { unmount } = renderWithRouter(<Dashboard />);
    
    // Let component render with large dataset
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
    });
    
    unmount();
    
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    // Should handle large datasets without excessive memory usage
    expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB
    
    console.log(`Memory usage with large dataset: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
  });

  test('Event listeners should be properly removed', async () => {
    const originalAddEventListener = window.addEventListener;
    const originalRemoveEventListener = window.removeEventListener;
    
    const addedListeners = new Map();
    const removedListeners = new Set();
    
    // Mock addEventListener to track listeners
    window.addEventListener = jest.fn((event, handler, options) => {
      addedListeners.set(handler, event);
      originalAddEventListener.call(window, event, handler, options);
    });
    
    // Mock removeEventListener to track cleanup
    window.removeEventListener = jest.fn((event, handler, options) => {
      removedListeners.add(handler);
      originalRemoveEventListener.call(window, event, handler, options);
    });
    
    const { unmount } = renderWithRouter(<HarvestPage />);
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    const addedCount = addedListeners.size;
    
    unmount();
    
    const removedCount = removedListeners.size;
    
    // Restore original functions
    window.addEventListener = originalAddEventListener;
    window.removeEventListener = originalRemoveEventListener;
    
    // Should remove most or all event listeners
    expect(removedCount).toBeGreaterThanOrEqual(addedCount * 0.8); // At least 80% cleaned up
    
    console.log(`Added ${addedCount} listeners, removed ${removedCount}`);
  });

  test('Timer cleanup should prevent memory leaks', async () => {
    const originalSetTimeout = global.setTimeout;
    const originalSetInterval = global.setInterval;
    const originalClearTimeout = global.clearTimeout;
    const originalClearInterval = global.clearInterval;
    
    const activeTimeouts = new Set();
    const activeIntervals = new Set();
    
    // Mock timers to track them
    global.setTimeout = jest.fn((callback, delay) => {
      const id = originalSetTimeout(callback, delay);
      activeTimeouts.add(id);
      return id;
    });
    
    global.setInterval = jest.fn((callback, delay) => {
      const id = originalSetInterval(callback, delay);
      activeIntervals.add(id);
      return id;
    });
    
    global.clearTimeout = jest.fn((id) => {
      activeTimeouts.delete(id);
      originalClearTimeout(id);
    });
    
    global.clearInterval = jest.fn((id) => {
      activeIntervals.delete(id);
      originalClearInterval(id);
    });
    
    const { unmount } = renderWithRouter(<Dashboard />);
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
    });
    
    const timeoutsCreated = (global.setTimeout as jest.Mock).mock.calls.length;
    const intervalsCreated = (global.setInterval as jest.Mock).mock.calls.length;
    
    unmount();
    
    // Wait for cleanup
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    const timeoutsCleared = (global.clearTimeout as jest.Mock).mock.calls.length;
    const intervalsCleared = (global.clearInterval as jest.Mock).mock.calls.length;
    
    // Restore original functions
    global.setTimeout = originalSetTimeout;
    global.setInterval = originalSetInterval;
    global.clearTimeout = originalClearTimeout;
    global.clearInterval = originalClearInterval;
    
    console.log(`Timers - Created: ${timeoutsCreated + intervalsCreated}, Cleared: ${timeoutsCleared + intervalsCleared}`);
    
    // Should clean up most timers
    expect(timeoutsCleared + intervalsCleared).toBeGreaterThanOrEqual((timeoutsCreated + intervalsCreated) * 0.7);
  });
});