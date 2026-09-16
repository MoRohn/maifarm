/**
 * Unit tests for ResourceManager
 */

import { ResourceManager, ResourceType } from '../../apps/api/src/utils/ResourceManager';

describe('ResourceManager', () => {
  let manager: ResourceManager;

  beforeEach(() => {
    manager = ResourceManager.getInstance();
  });

  afterEach(() => {
    // Force cleanup after each test
    manager.forceCleanup();
  });

  describe('Resource Allocation', () => {
    it('should allocate and retrieve resources', () => {
      const buffer = Buffer.alloc(1024);
      const success = manager.allocate(ResourceType.BUFFER, 'buffer1', buffer);

      expect(success).toBe(true);

      const retrieved = manager.get<Buffer>(ResourceType.BUFFER, 'buffer1');
      expect(retrieved).toBe(buffer);
    });

    it('should track resource metadata', () => {
      const resource = { id: 'test', data: 'value' };
      manager.allocate(ResourceType.CACHE, 'cache1', resource, {
        owner: 'test-suite'
      });

      const stats = manager.getStatistics();
      expect(stats.metrics.currentActive).toBeGreaterThan(0);
      expect(stats.pools.cache.count).toBeGreaterThan(0);
    });

    it('should enforce resource limits', async () => {
      // Use the singleton instance and temporarily modify its limits
      const testManager = ResourceManager.getInstance();
      const originalLimit = (testManager as any).resources.get(ResourceType.TIMER).limits.maxItems;

      // Set a low limit for testing
      (testManager as any).resources.get(ResourceType.TIMER).limits.maxItems = 2;

      // Clear any existing timers
      testManager.releaseAll(ResourceType.TIMER);

      const timer1 = setTimeout(() => {}, 1000);
      const timer2 = setTimeout(() => {}, 1000);
      const timer3 = setTimeout(() => {}, 1000);

      try {
        // First two allocations should succeed - add small delays to ensure different timestamps
        expect(testManager.allocate(ResourceType.TIMER, 'timer1', timer1)).toBe(true);

        // Small delay to ensure different timestamp
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(testManager.allocate(ResourceType.TIMER, 'timer2', timer2)).toBe(true);

        // Another small delay
        await new Promise(resolve => setTimeout(resolve, 10));

        // Third allocation should evict oldest and succeed
        expect(testManager.allocate(ResourceType.TIMER, 'timer3', timer3)).toBe(true);
        expect(testManager.get(ResourceType.TIMER, 'timer1')).toBeNull(); // Evicted
      } finally {
        // Clean up and restore original limit
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
        testManager.releaseAll(ResourceType.TIMER);
        (testManager as any).resources.get(ResourceType.TIMER).limits.maxItems = originalLimit;
      }
    });

    it('should reject oversized buffers', () => {
      const hugeBuffer = Buffer.alloc(100 * 1024 * 1024); // 100MB
      const success = manager.allocate(ResourceType.BUFFER, 'huge', hugeBuffer);

      expect(success).toBe(false);
    });
  });

  describe('Resource Release', () => {
    it('should release individual resources', () => {
      const resource = { data: 'test' };
      manager.allocate(ResourceType.CACHE, 'cache1', resource);

      const released = manager.release(ResourceType.CACHE, 'cache1');
      expect(released).toBe(true);

      const retrieved = manager.get(ResourceType.CACHE, 'cache1');
      expect(retrieved).toBeNull();
    });

    it('should release all resources of a type', () => {
      manager.allocate(ResourceType.CACHE, 'cache1', { data: 1 });
      manager.allocate(ResourceType.CACHE, 'cache2', { data: 2 });
      manager.allocate(ResourceType.CACHE, 'cache3', { data: 3 });

      const count = manager.releaseAll(ResourceType.CACHE);
      expect(count).toBe(3);

      expect(manager.get(ResourceType.CACHE, 'cache1')).toBeNull();
      expect(manager.get(ResourceType.CACHE, 'cache2')).toBeNull();
      expect(manager.get(ResourceType.CACHE, 'cache3')).toBeNull();
    });

    it('should cleanup resources properly', () => {
      const mockConnection = {
        close: jest.fn(),
        disconnect: jest.fn()
      };

      manager.allocate(ResourceType.CONNECTION, 'conn1', mockConnection);
      manager.release(ResourceType.CONNECTION, 'conn1');

      expect(mockConnection.close).toHaveBeenCalled();
      expect(mockConnection.disconnect).toHaveBeenCalled();
    });

    it('should clear timers on release', () => {
      jest.useFakeTimers();

      const callback = jest.fn();
      const timer = setInterval(callback, 100);

      manager.allocate(ResourceType.TIMER, 'timer1', timer);
      manager.release(ResourceType.TIMER, 'timer1');

      jest.advanceTimersByTime(500);
      expect(callback).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('Automatic Cleanup', () => {
    it('should cleanup expired resources', async () => {
      jest.useFakeTimers();

      // Allocate with short max age
      const testManager = new (ResourceManager as any)();
      testManager.resources.get(ResourceType.CACHE).limits.maxAge = 1000;

      testManager.allocate(ResourceType.CACHE, 'old', { data: 'old' });

      // Advance time past expiry
      jest.advanceTimersByTime(2000);

      // Trigger cleanup
      testManager.performCleanup();

      expect(testManager.get(ResourceType.CACHE, 'old')).toBeNull();

      jest.useRealTimers();
    });

    it('should cleanup idle resources', async () => {
      jest.useFakeTimers();

      const testManager = new (ResourceManager as any)();
      testManager.resources.get(ResourceType.CONNECTION).limits.maxIdleTime = 1000;

      const conn = { close: jest.fn() };
      testManager.allocate(ResourceType.CONNECTION, 'conn1', conn);

      // Access it once
      testManager.get(ResourceType.CONNECTION, 'conn1');

      // Wait for idle timeout
      jest.advanceTimersByTime(2000);

      testManager.performCleanup();

      expect(testManager.get(ResourceType.CONNECTION, 'conn1')).toBeNull();

      jest.useRealTimers();
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track allocation metrics', () => {
      manager.allocate(ResourceType.BUFFER, 'buf1', Buffer.alloc(100));
      manager.allocate(ResourceType.BUFFER, 'buf2', Buffer.alloc(200));
      manager.release(ResourceType.BUFFER, 'buf1');

      const stats = manager.getStatistics();
      expect(stats.metrics.totalAllocated).toBeGreaterThanOrEqual(2);
      expect(stats.metrics.totalReleased).toBeGreaterThanOrEqual(1);
      expect(stats.metrics.currentActive).toBeGreaterThanOrEqual(1);
    });

    it('should calculate pool sizes', () => {
      const buffer1 = Buffer.alloc(1000);
      const buffer2 = Buffer.alloc(2000);

      manager.allocate(ResourceType.BUFFER, 'buf1', buffer1);
      manager.allocate(ResourceType.BUFFER, 'buf2', buffer2);

      const stats = manager.getStatistics();
      expect(stats.pools.buffer.totalSize).toBe(3000);
    });

    it('should track memory usage', () => {
      const stats = manager.getStatistics();

      expect(stats.memory).toHaveProperty('heapUsed');
      expect(stats.memory).toHaveProperty('heapTotal');
      expect(stats.memory).toHaveProperty('external');
      expect(stats.memory).toHaveProperty('rss');

      expect(stats.memory.heapUsed).toBeGreaterThan(0);
    });
  });

  describe('Resource Types', () => {
    it('should handle buffer resources', () => {
      const buffer = Buffer.from('test data');
      manager.allocate(ResourceType.BUFFER, 'buf1', buffer);

      const retrieved = manager.get<Buffer>(ResourceType.BUFFER, 'buf1');
      expect(retrieved?.toString()).toBe('test data');
    });

    it('should handle connection resources', () => {
      const connection = {
        id: 'conn123',
        close: jest.fn()
      };

      manager.allocate(ResourceType.CONNECTION, 'conn1', connection);
      const retrieved = manager.get(ResourceType.CONNECTION, 'conn1');
      expect(retrieved).toBe(connection);
    });

    it('should handle process resources', () => {
      const mockProcess = {
        pid: 12345,
        kill: jest.fn()
      };

      manager.allocate(ResourceType.PROCESS, 'proc1', mockProcess);
      manager.release(ResourceType.PROCESS, 'proc1');

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should handle stream resources', () => {
      const stream = {
        destroy: jest.fn(),
        close: jest.fn()
      };

      manager.allocate(ResourceType.STREAM, 'stream1', stream);
      manager.release(ResourceType.STREAM, 'stream1');

      expect(stream.destroy).toHaveBeenCalled();
      expect(stream.close).toHaveBeenCalled();
    });

    it('should handle session resources', () => {
      const session = {
        id: 'sess123',
        cleanup: jest.fn()
      };

      manager.allocate(ResourceType.SESSION, 'sess1', session);
      manager.release(ResourceType.SESSION, 'sess1');

      expect(session.cleanup).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle release of non-existent resources', () => {
      const result = manager.release(ResourceType.CACHE, 'nonexistent');
      expect(result).toBe(false);
    });

    it('should handle get of non-existent resources', () => {
      const result = manager.get(ResourceType.CACHE, 'nonexistent');
      expect(result).toBeNull();
    });

    it('should handle forceCleanup', () => {
      manager.allocate(ResourceType.CACHE, 'cache1', { data: 1 });
      manager.allocate(ResourceType.BUFFER, 'buf1', Buffer.alloc(100));
      manager.allocate(ResourceType.CONNECTION, 'conn1', { close: jest.fn() });

      manager.forceCleanup();

      const stats = manager.getStatistics();
      expect(stats.metrics.currentActive).toBe(0);
      expect(stats.pools.cache.count).toBe(0);
      expect(stats.pools.buffer.count).toBe(0);
      expect(stats.pools.connection.count).toBe(0);
    });

    it('should handle concurrent allocations', () => {
      const promises = [];

      for (let i = 0; i < 100; i++) {
        promises.push(
          Promise.resolve().then(() =>
            manager.allocate(ResourceType.CACHE, `cache${i}`, { data: i })
          )
        );
      }

      return Promise.all(promises).then(results => {
        const successCount = results.filter(r => r === true).length;
        expect(successCount).toBeGreaterThan(0);
      });
    });

    it('should handle resource size calculations', () => {
      // String resource
      manager.allocate(ResourceType.CACHE, 'str1', 'Hello World');

      // Array resource
      manager.allocate(ResourceType.CACHE, 'arr1', [1, 2, 3, 4, 5]);

      // Buffer resource
      manager.allocate(ResourceType.BUFFER, 'buf1', Buffer.alloc(512));

      const stats = manager.getStatistics();
      expect(stats.pools.cache.totalSize).toBeGreaterThan(0);
      expect(stats.pools.buffer.totalSize).toBe(512);
    });
  });
});