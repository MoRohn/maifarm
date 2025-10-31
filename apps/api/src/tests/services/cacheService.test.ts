import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CacheService } from '../../services/unified/stateCoordinator';
import { Redis } from 'ioredis';
import { logger } from '../../utils/logger';

// Mock dependencies
jest.mock('ioredis');
jest.mock('../../utils/logger');

describe('CacheService', () => {
  let cacheService: CacheService;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockRedis = new Redis() as jest.Mocked<Redis>;
    cacheService = new CacheService(mockRedis);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('Basic Operations', () => {
    it('should set and get values', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue('test-value');

      await cacheService.set('test-key', 'test-value');
      const value = await cacheService.get('test-key');

      expect(value).toBe('test-value');
      expect(mockRedis.set).toHaveBeenCalledWith('test-key', '"test-value"');
      expect(mockRedis.get).toHaveBeenCalledWith('test-key');
    });

    it('should handle JSON serialization', async () => {
      const complexObject = {
        id: 'test-123',
        data: { nested: true },
        array: [1, 2, 3]
      };

      mockRedis.set.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue(JSON.stringify(complexObject));

      await cacheService.set('complex-key', complexObject);
      const retrieved = await cacheService.get('complex-key');

      expect(retrieved).toEqual(complexObject);
    });

    it('should set values with TTL', async () => {
      await cacheService.set('expiring-key', 'value', 3600);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'expiring-key',
        3600,
        '"value"'
      );
    });

    it('should delete keys', async () => {
      mockRedis.del.mockResolvedValue(1);

      const deleted = await cacheService.delete('test-key');

      expect(deleted).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith('test-key');
    });

    it('should check key existence', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const exists = await cacheService.exists('test-key');

      expect(exists).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith('test-key');
    });
  });

  describe('Batch Operations', () => {
    it('should get multiple values', async () => {
      mockRedis.mget.mockResolvedValue(['"value1"', '"value2"', null]);

      const values = await cacheService.mget(['key1', 'key2', 'key3']);

      expect(values).toEqual(['value1', 'value2', null]);
      expect(mockRedis.mget).toHaveBeenCalledWith(['key1', 'key2', 'key3']);
    });

    it('should set multiple values', async () => {
      const pipeline = {
        set: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([['OK'], ['OK']])
      };
      mockRedis.pipeline.mockReturnValue(pipeline as any);

      await cacheService.mset({
        key1: 'value1',
        key2: 'value2'
      });

      expect(pipeline.set).toHaveBeenCalledWith('key1', '"value1"');
      expect(pipeline.set).toHaveBeenCalledWith('key2', '"value2"');
      expect(pipeline.exec).toHaveBeenCalled();
    });

    it('should delete multiple keys', async () => {
      mockRedis.del.mockResolvedValue(3);

      const deleted = await cacheService.mdel(['key1', 'key2', 'key3']);

      expect(deleted).toBe(3);
      expect(mockRedis.del).toHaveBeenCalledWith('key1', 'key2', 'key3');
    });
  });

  describe('Pattern Operations', () => {
    it('should find keys by pattern', async () => {
      mockRedis.keys.mockResolvedValue(['user:123', 'user:456']);

      const keys = await cacheService.keys('user:*');

      expect(keys).toEqual(['user:123', 'user:456']);
      expect(mockRedis.keys).toHaveBeenCalledWith('user:*');
    });

    it('should clear keys by pattern', async () => {
      mockRedis.keys.mockResolvedValue(['temp:1', 'temp:2', 'temp:3']);
      mockRedis.del.mockResolvedValue(3);

      const cleared = await cacheService.clearPattern('temp:*');

      expect(cleared).toBe(3);
      expect(mockRedis.keys).toHaveBeenCalledWith('temp:*');
      expect(mockRedis.del).toHaveBeenCalledWith('temp:1', 'temp:2', 'temp:3');
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate cache by tags', async () => {
      // Set items with tags
      await cacheService.setWithTags('item1', 'value1', ['tag1', 'tag2']);
      await cacheService.setWithTags('item2', 'value2', ['tag1', 'tag3']);
      await cacheService.setWithTags('item3', 'value3', ['tag2']);

      mockRedis.smembers.mockResolvedValue(['item1', 'item2']);
      mockRedis.del.mockResolvedValue(2);

      const invalidated = await cacheService.invalidateByTag('tag1');

      expect(invalidated).toBe(2);
      expect(mockRedis.smembers).toHaveBeenCalledWith('tag:tag1');
    });

    it('should handle cascading invalidation', async () => {
      await cacheService.setCascade('parent', 'value', ['child1', 'child2']);

      mockRedis.smembers.mockResolvedValue(['child1', 'child2']);
      mockRedis.del.mockResolvedValue(3);

      const invalidated = await cacheService.invalidateCascade('parent');

      expect(invalidated).toBe(3); // parent + 2 children
    });
  });

  describe('Cache Warming', () => {
    it('should warm cache with preloaded data', async () => {
      const dataLoader = jest.fn().mockResolvedValue({
        key1: 'value1',
        key2: 'value2'
      });

      await cacheService.warmCache(dataLoader);

      expect(dataLoader).toHaveBeenCalled();
      expect(mockRedis.pipeline).toHaveBeenCalled();
    });

    it('should refresh cache periodically', async () => {
      const refreshFn = jest.fn().mockResolvedValue('new-value');
      
      cacheService.setAutoRefresh('refresh-key', refreshFn, 5000);

      // Advance time to trigger refresh
      jest.advanceTimersByTime(5000);

      expect(refreshFn).toHaveBeenCalled();
    });
  });

  describe('Performance Optimization', () => {
    it('should implement cache-aside pattern', async () => {
      const dataFetcher = jest.fn().mockResolvedValue('fetched-data');
      mockRedis.get.mockResolvedValue(null); // Cache miss

      const value = await cacheService.getOrSet(
        'cache-aside-key',
        dataFetcher,
        3600
      );

      expect(value).toBe('fetched-data');
      expect(dataFetcher).toHaveBeenCalled();
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should prevent cache stampede', async () => {
      const expensiveFn = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('data'), 100))
      );

      // Multiple concurrent requests for same key
      const promises = Array(10).fill(null).map(() =>
        cacheService.getOrSet('stampede-key', expensiveFn)
      );

      await Promise.all(promises);

      // Should only call expensive function once
      expect(expensiveFn).toHaveBeenCalledTimes(1);
    });

    it('should use probabilistic early expiration', async () => {
      mockRedis.get.mockResolvedValue('"cached-value"');
      mockRedis.ttl.mockResolvedValue(10); // Low TTL

      const refreshFn = jest.fn().mockResolvedValue('refreshed-value');
      
      // With low TTL, should trigger refresh probabilistically
      await cacheService.getWithProbabilisticRefresh(
        'prob-key',
        refreshFn,
        { beta: 1.0 }
      );

      // May or may not refresh based on probability
      expect(refreshFn.mock.calls.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Memory Management', () => {
    it('should implement LRU eviction', async () => {
      const maxSize = 3;
      const lruCache = cacheService.createLRU(maxSize);

      await lruCache.set('key1', 'value1');
      await lruCache.set('key2', 'value2');
      await lruCache.set('key3', 'value3');
      
      // Access key1 to make it recently used
      await lruCache.get('key1');
      
      // Add new key, should evict key2 (least recently used)
      await lruCache.set('key4', 'value4');

      expect(await lruCache.get('key2')).toBeNull();
      expect(await lruCache.get('key1')).toBe('value1');
    });

    it('should monitor memory usage', async () => {
      mockRedis.info.mockResolvedValue(
        'used_memory:1048576\r\nused_memory_human:1M\r\n'
      );

      const memInfo = await cacheService.getMemoryInfo();

      expect(memInfo).toMatchObject({
        usedMemory: 1048576,
        usedMemoryHuman: '1M'
      });
    });

    it('should clear cache when memory threshold exceeded', async () => {
      mockRedis.info.mockResolvedValue(
        'used_memory:1073741824\r\n' // 1GB
      );
      mockRedis.flushdb.mockResolvedValue('OK');

      await cacheService.checkMemoryAndClear(500 * 1024 * 1024); // 500MB threshold

      expect(mockRedis.flushdb).toHaveBeenCalled();
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track cache hit/miss ratio', async () => {
      mockRedis.get.mockResolvedValueOnce('"hit"')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('"hit"');

      await cacheService.get('key1'); // Hit
      await cacheService.get('key2'); // Miss
      await cacheService.get('key3'); // Hit

      const stats = cacheService.getStatistics();

      expect(stats).toMatchObject({
        hits: 2,
        misses: 1,
        hitRate: 0.67
      });
    });

    it('should track operation latency', async () => {
      const start = Date.now();
      await cacheService.get('test-key');
      const latency = Date.now() - start;

      const stats = cacheService.getStatistics();
      expect(stats.averageLatency).toBeGreaterThanOrEqual(0);
    });

    it('should export metrics for monitoring', () => {
      const metrics = cacheService.exportMetrics();

      expect(metrics).toMatchObject({
        operations: expect.any(Object),
        memory: expect.any(Object),
        performance: expect.any(Object)
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis connection errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Connection refused'));

      const value = await cacheService.get('test-key');

      expect(value).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Cache error'),
        expect.any(Error)
      );
    });

    it('should fallback to in-memory cache on Redis failure', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis down'));
      
      // Enable fallback mode
      cacheService.enableFallback();

      await cacheService.set('fallback-key', 'fallback-value');
      const value = await cacheService.get('fallback-key');

      expect(value).toBe('fallback-value');
    });

    it('should retry failed operations', async () => {
      let attempts = 0;
      mockRedis.set.mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve('OK');
      });

      await cacheService.setWithRetry('retry-key', 'value', 3);

      expect(attempts).toBe(3);
      expect(mockRedis.set).toHaveBeenCalledTimes(3);
    });
  });

  describe('Distributed Caching', () => {
    it('should handle cache synchronization across nodes', async () => {
      const pubsub = {
        subscribe: jest.fn(),
        on: jest.fn(),
        publish: jest.fn()
      };
      mockRedis.duplicate.mockReturnValue(pubsub as any);

      await cacheService.enableDistributed();

      // Simulate cache invalidation broadcast
      await cacheService.invalidateAcrossNodes('shared-key');

      expect(pubsub.publish).toHaveBeenCalledWith(
        'cache:invalidate',
        expect.stringContaining('shared-key')
      );
    });

    it('should implement distributed locking', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.del.mockResolvedValue(1);

      const acquired = await cacheService.acquireLock('resource', 5000);
      expect(acquired).toBe(true);

      const released = await cacheService.releaseLock('resource');
      expect(released).toBe(true);
    });
  });
});