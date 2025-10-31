/**
 * Unit tests for AsyncLock manager
 */

import { AsyncLock } from '../../apps/api/src/utils/AsyncLock';

describe('AsyncLock', () => {
  let lock: AsyncLock;

  beforeEach(() => {
    lock = new AsyncLock({
      defaultTimeout: 1000,
      maxQueueSize: 10
    });
  });

  afterEach(() => {
    lock.clear();
  });

  describe('Basic Lock Operations', () => {
    it('should acquire and release a lock', async () => {
      const release = await lock.acquire('resource1', 'holder1');
      expect(lock.isLocked('resource1')).toBe(true);
      expect(lock.getHolder('resource1')).toBe('holder1');

      release();
      expect(lock.isLocked('resource1')).toBe(false);
      expect(lock.getHolder('resource1')).toBeNull();
    });

    it('should handle multiple resources independently', async () => {
      const release1 = await lock.acquire('resource1', 'holder1');
      const release2 = await lock.acquire('resource2', 'holder2');

      expect(lock.isLocked('resource1')).toBe(true);
      expect(lock.isLocked('resource2')).toBe(true);

      release1();
      expect(lock.isLocked('resource1')).toBe(false);
      expect(lock.isLocked('resource2')).toBe(true);

      release2();
      expect(lock.isLocked('resource2')).toBe(false);
    });

    it('should support reentrant locks', async () => {
      const release1 = await lock.acquire('resource1', 'holder1');
      const release2 = await lock.acquire('resource1', 'holder1'); // Same holder

      expect(lock.isLocked('resource1')).toBe(true);

      release1();
      expect(lock.isLocked('resource1')).toBe(false); // Released after first release
    });
  });

  describe('Queueing Behavior', () => {
    it('should queue requests when lock is held', async () => {
      const release1 = await lock.acquire('resource1', 'holder1');

      let acquired2 = false;
      const promise2 = lock.acquire('resource1', 'holder2').then(release => {
        acquired2 = true;
        return release;
      });

      // Give time for the promise to be queued
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(acquired2).toBe(false);
      expect(lock.getQueueSize('resource1')).toBe(1);

      release1();

      // Wait for queued request to acquire
      const release2 = await promise2;
      expect(acquired2).toBe(true);
      expect(lock.getHolder('resource1')).toBe('holder2');

      release2();
    });

    it('should process queue in FIFO order', async () => {
      const order: string[] = [];
      const release1 = await lock.acquire('resource1', 'holder1');

      const promise2 = lock.acquire('resource1', 'holder2').then(release => {
        order.push('holder2');
        release();
      });

      const promise3 = lock.acquire('resource1', 'holder3').then(release => {
        order.push('holder3');
        release();
      });

      const promise4 = lock.acquire('resource1', 'holder4').then(release => {
        order.push('holder4');
        release();
      });

      release1();
      await Promise.all([promise2, promise3, promise4]);

      expect(order).toEqual(['holder2', 'holder3', 'holder4']);
    });

    it('should reject when queue is full', async () => {
      const smallLock = new AsyncLock({ maxQueueSize: 2 });

      const release1 = await smallLock.acquire('resource1', 'holder1');

      // Fill the queue
      smallLock.acquire('resource1', 'holder2');
      smallLock.acquire('resource1', 'holder3');

      // This should reject
      await expect(
        smallLock.acquire('resource1', 'holder4')
      ).rejects.toThrow('Lock queue full');

      release1();
      smallLock.clear();
    });
  });

  describe('Timeout Behavior', () => {
    it('should timeout if lock not acquired within timeout', async () => {
      const release1 = await lock.acquire('resource1', 'holder1');

      await expect(
        lock.acquire('resource1', 'holder2', 100)
      ).rejects.toThrow('Lock timeout');

      release1();
    });

    it('should remove timed out requests from queue', async () => {
      const release1 = await lock.acquire('resource1', 'holder1');

      const promise2 = lock.acquire('resource1', 'holder2', 100).catch(err => err.message);

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(await promise2).toBe('Lock timeout for resource: resource1');
      expect(lock.getQueueSize('resource1')).toBe(0);

      release1();
    });
  });

  describe('tryAcquire', () => {
    it('should acquire lock if available', () => {
      const release = lock.tryAcquire('resource1', 'holder1');
      expect(release).not.toBeNull();
      expect(lock.isLocked('resource1')).toBe(true);
      release!();
    });

    it('should return null if lock is held', async () => {
      const release1 = await lock.acquire('resource1', 'holder1');
      const release2 = lock.tryAcquire('resource1', 'holder2');

      expect(release2).toBeNull();

      release1();
    });

    it('should allow reentrant tryAcquire', async () => {
      const release1 = await lock.acquire('resource1', 'holder1');
      const release2 = lock.tryAcquire('resource1', 'holder1');

      expect(release2).not.toBeNull();

      release1();
    });
  });

  describe('Release Operations', () => {
    it('should releaseAll locks for a holder', async () => {
      await lock.acquire('resource1', 'holder1');
      await lock.acquire('resource2', 'holder1');
      await lock.acquire('resource3', 'holder2');

      expect(lock.isLocked('resource1')).toBe(true);
      expect(lock.isLocked('resource2')).toBe(true);
      expect(lock.isLocked('resource3')).toBe(true);

      lock.releaseAll('holder1');

      expect(lock.isLocked('resource1')).toBe(false);
      expect(lock.isLocked('resource2')).toBe(false);
      expect(lock.isLocked('resource3')).toBe(true); // Still held by holder2
    });

    it('should handle release of non-existent lock gracefully', () => {
      expect(() => lock.release('nonexistent', 'holder1')).not.toThrow();
    });

    it('should prevent release by wrong holder', async () => {
      await lock.acquire('resource1', 'holder1');
      lock.release('resource1', 'holder2'); // Wrong holder

      expect(lock.isLocked('resource1')).toBe(true); // Still locked
      expect(lock.getHolder('resource1')).toBe('holder1');
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track active locks', async () => {
      const release1 = await lock.acquire('resource1', 'holder1');
      const release2 = await lock.acquire('resource2', 'holder2');

      const activeLocks = lock.getActiveLocks();
      expect(activeLocks.size).toBe(2);
      expect(activeLocks.has('resource1')).toBe(true);
      expect(activeLocks.has('resource2')).toBe(true);

      release1();
      release2();

      expect(lock.getActiveLocks().size).toBe(0);
    });

    it('should track queue sizes', async () => {
      const release1 = await lock.acquire('resource1', 'holder1');

      lock.acquire('resource1', 'holder2');
      lock.acquire('resource1', 'holder3');

      expect(lock.getQueueSize('resource1')).toBe(2);

      release1();
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid acquire/release cycles', async () => {
      const iterations = 100;
      const results: boolean[] = [];

      for (let i = 0; i < iterations; i++) {
        const release = await lock.acquire('resource1', `holder${i}`);
        results.push(lock.isLocked('resource1'));
        release();
      }

      expect(results.every(r => r === true)).toBe(true);
      expect(lock.isLocked('resource1')).toBe(false);
    });

    it('should handle concurrent acquire attempts', async () => {
      const promises = [];
      const holders: string[] = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          lock.acquire('resource1', `holder${i}`).then(release => {
            holders.push(`holder${i}`);
            setTimeout(() => release(), Math.random() * 10);
          })
        );
      }

      await Promise.all(promises);
      expect(holders).toHaveLength(10);
      expect(lock.isLocked('resource1')).toBe(false);
    });

    it('should clear all locks and queues', async () => {
      await lock.acquire('resource1', 'holder1');
      await lock.acquire('resource2', 'holder2');

      lock.acquire('resource1', 'holder3').catch(() => {}); // Queue this

      lock.clear();

      expect(lock.isLocked('resource1')).toBe(false);
      expect(lock.isLocked('resource2')).toBe(false);
      expect(lock.getQueueSize('resource1')).toBe(0);
    });
  });
});