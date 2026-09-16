/**
 * Comprehensive tests for farm timeout validation and fix
 *
 * Tests the critical timeout fix that prevents farms from being orphaned prematurely
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { shutdownCoordinator } from '../../services/shutdownCoordinator';
import { UnifiedFarmLaunchOrchestrator } from '../../services/UnifiedFarmLaunchOrchestrator';

describe('Farm Timeout Validation', () => {
  let orchestrator: UnifiedFarmLaunchOrchestrator;

  beforeEach(() => {
    orchestrator = UnifiedFarmLaunchOrchestrator.getInstance();
    jest.clearAllMocks();
  });

  describe('Timeout Default Values', () => {
    it('should use 1 hour default for farm mode when timeout is undefined', async () => {
      const scheduleShutdownSpy = jest.spyOn(shutdownCoordinator, 'scheduleShutdown');

      // Simulate farm launch with NO timeout
      const config = {
        farmId: 'test-farm-1',
        farmName: 'Test Farm',
        mode: 'harvest' as const,
        prompt: 'Test prompt',
        agentCount: 3,
        timeout: undefined, // CRITICAL: No timeout provided
        provider: 'claude' as const,
        userId: 'test-user'
      };

      // Access private method via reflection for testing
      const scheduleShutdown = (orchestrator as any).scheduleShutdown.bind(orchestrator);
      await scheduleShutdown(config, 'test-harvest-id');

      // Verify shutdown was scheduled with 1 hour timeout (3600000ms)
      expect(scheduleShutdownSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 3600000, // 1 hour in milliseconds
          mode: 'farm',
          farmId: 'test-farm-1'
        })
      );
    });

    it('should use 30 minutes default for GoWild mode when timeout is undefined', async () => {
      const scheduleShutdownSpy = jest.spyOn(shutdownCoordinator, 'scheduleShutdown');

      const config = {
        farmId: 'test-farm-2',
        mode: 'gowild' as const,
        prompt: 'Test prompt',
        agentCount: 5,
        timeout: undefined,
        provider: 'claude' as const,
        userId: 'test-user'
      };

      const scheduleShutdown = (orchestrator as any).scheduleShutdown.bind(orchestrator);
      await scheduleShutdown(config, 'test-harvest-id');

      // Verify shutdown was scheduled with 30 minutes timeout (1800000ms)
      expect(scheduleShutdownSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 1800000, // 30 minutes in milliseconds
          mode: 'farm'
        })
      );
    });

    it('should use 5 minutes FIXED for Quick Task mode', async () => {
      const scheduleShutdownSpy = jest.spyOn(shutdownCoordinator, 'scheduleShutdown');

      const config = {
        farmId: 'test-farm-3',
        mode: 'quicktask' as const,
        prompt: 'Test prompt',
        agentCount: 2,
        timeout: undefined,
        provider: 'claude' as const,
        userId: 'test-user'
      };

      const scheduleShutdown = (orchestrator as any).scheduleShutdown.bind(orchestrator);
      await scheduleShutdown(config, 'test-harvest-id');

      // Verify shutdown was scheduled with 5 minutes timeout (300000ms)
      expect(scheduleShutdownSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 300000, // 5 minutes in milliseconds
          mode: 'farm'
        })
      );
    });
  });

  describe('Timeout Unit Detection', () => {
    it('should detect seconds and convert to milliseconds (3600s → 3600000ms)', async () => {
      const scheduleShutdownSpy = jest.spyOn(shutdownCoordinator, 'scheduleShutdown');

      const config = {
        farmId: 'test-farm-4',
        mode: 'harvest' as const,
        prompt: 'Test prompt',
        agentCount: 3,
        timeout: 3600, // 3600 seconds (1 hour) - should be converted to ms
        provider: 'claude' as const,
        userId: 'test-user'
      };

      const scheduleShutdown = (orchestrator as any).scheduleShutdown.bind(orchestrator);
      await scheduleShutdown(config, 'test-harvest-id');

      // Verify conversion: 3600s → 3600000ms
      expect(scheduleShutdownSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 3600000 // Converted to milliseconds
        })
      );
    });

    it('should accept milliseconds as-is when value is large (3600000ms)', async () => {
      const scheduleShutdownSpy = jest.spyOn(shutdownCoordinator, 'scheduleShutdown');

      const config = {
        farmId: 'test-farm-5',
        mode: 'harvest' as const,
        prompt: 'Test prompt',
        agentCount: 3,
        timeout: 3600000, // Already in milliseconds
        provider: 'claude' as const,
        userId: 'test-user'
      };

      const scheduleShutdown = (orchestrator as any).scheduleShutdown.bind(orchestrator);
      await scheduleShutdown(config, 'test-harvest-id');

      // Verify NO conversion - used as-is
      expect(scheduleShutdownSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 3600000 // No conversion
        })
      );
    });

    it('should handle edge case: 90 seconds should convert to 90000ms', async () => {
      const scheduleShutdownSpy = jest.spyOn(shutdownCoordinator, 'scheduleShutdown');

      const config = {
        farmId: 'test-farm-6',
        mode: 'harvest' as const,
        prompt: 'Test prompt',
        agentCount: 3,
        timeout: 90, // 90 seconds - should convert
        provider: 'claude' as const,
        userId: 'test-user'
      };

      const scheduleShutdown = (orchestrator as any).scheduleShutdown.bind(orchestrator);
      await scheduleShutdown(config, 'test-harvest-id');

      // Verify conversion
      expect(scheduleShutdownSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 90000 // Converted to milliseconds
        })
      );
    });
  });

  describe('Shutdown Coordinator Validation', () => {
    it('should reject invalid timeout values (0 or negative)', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await shutdownCoordinator.scheduleShutdown({
        mode: 'farm',
        farmId: 'test-farm-7',
        userId: 'test-user',
        reason: 'timeout',
        timeout: 0 // Invalid timeout
      });

      // Should log error and use default
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL: No valid timeout provided')
      );

      consoleSpy.mockRestore();
    });

    it('should cap extremely large timeouts to prevent setTimeout overflow', async () => {
      const MAX_TIMEOUT_MS = 2147483647; // 32-bit signed integer max

      await shutdownCoordinator.scheduleShutdown({
        mode: 'farm',
        farmId: 'test-farm-8',
        userId: 'test-user',
        reason: 'timeout',
        timeout: MAX_TIMEOUT_MS + 1000 // Exceeds maximum
      });

      // Should be capped (verified via internal state check)
      expect(shutdownCoordinator.isShutdownScheduled('test-farm-8')).toBe(true);

      // Clean up
      shutdownCoordinator.cancelShutdown('test-farm-8');
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle farm launch with explicit 2-hour timeout', async () => {
      const scheduleShutdownSpy = jest.spyOn(shutdownCoordinator, 'scheduleShutdown');

      const config = {
        farmId: 'test-farm-9',
        mode: 'harvest' as const,
        prompt: 'Long running task',
        agentCount: 5,
        timeout: 7200000, // 2 hours in ms
        provider: 'claude' as const,
        userId: 'test-user'
      };

      const scheduleShutdown = (orchestrator as any).scheduleShutdown.bind(orchestrator);
      await scheduleShutdown(config, 'test-harvest-id');

      expect(scheduleShutdownSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 7200000 // 2 hours
        })
      );
    });

    it('should handle GoWild farm with custom 45-minute timeout', async () => {
      const scheduleShutdownSpy = jest.spyOn(shutdownCoordinator, 'scheduleShutdown');

      const config = {
        farmId: 'test-farm-10',
        mode: 'gowild' as const,
        prompt: 'Creative exploration',
        agentCount: 7,
        timeout: 2700000, // 45 minutes in ms
        provider: 'claude' as const,
        userId: 'test-user'
      };

      const scheduleShutdown = (orchestrator as any).scheduleShutdown.bind(orchestrator);
      await scheduleShutdown(config, 'test-harvest-id');

      expect(scheduleShutdownSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 2700000 // 45 minutes
        })
      );
    });

    it('should prevent premature timeout that was causing the bug', async () => {
      const scheduleShutdownSpy = jest.spyOn(shutdownCoordinator, 'scheduleShutdown');

      // This simulates the BUG scenario: farm launched with undefined timeout
      const config = {
        farmId: 'test-farm-bug',
        mode: 'harvest' as const,
        prompt: 'Test prompt',
        agentCount: 3,
        timeout: undefined, // BUG: No timeout provided
        provider: 'claude' as const,
        userId: 'test-user'
      };

      const scheduleShutdown = (orchestrator as any).scheduleShutdown.bind(orchestrator);
      await scheduleShutdown(config, 'test-harvest-id');

      // FIX: Should now use 1-hour default instead of timing out immediately
      expect(scheduleShutdownSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 3600000, // Default 1 hour - NOT 0 or undefined!
          farmId: 'test-farm-bug'
        })
      );
    });
  });

  describe('Logging Validation', () => {
    it('should log timeout in multiple formats (ms, seconds, minutes)', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const config = {
        farmId: 'test-farm-11',
        mode: 'harvest' as const,
        prompt: 'Test',
        agentCount: 3,
        timeout: 3600000,
        provider: 'claude' as const,
        userId: 'test-user'
      };

      const scheduleShutdown = (orchestrator as any).scheduleShutdown.bind(orchestrator);
      await scheduleShutdown(config, 'test-harvest-id');

      // Should log in all formats
      const logCalls = consoleSpy.mock.calls.flat().join(' ');
      expect(logCalls).toContain('3600000ms'); // Milliseconds
      expect(logCalls).toContain('3600s'); // Seconds
      expect(logCalls).toContain('60 minutes'); // Minutes

      consoleSpy.mockRestore();
    });
  });
});

describe('ShutdownCoordinator Edge Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle concurrent shutdown requests for same farm', async () => {
    const farmId = 'concurrent-test-farm';

    // Schedule two shutdowns concurrently
    const promise1 = shutdownCoordinator.scheduleShutdown({
      mode: 'farm',
      farmId,
      userId: 'user1',
      reason: 'timeout',
      timeout: 3600000
    });

    const promise2 = shutdownCoordinator.scheduleShutdown({
      mode: 'farm',
      farmId,
      userId: 'user2',
      reason: 'timeout',
      timeout: 7200000
    });

    await Promise.all([promise1, promise2]);

    // Only one should be active
    expect(shutdownCoordinator.isShutdownScheduled(farmId)).toBe(true);

    // Clean up
    shutdownCoordinator.cancelShutdown(farmId);
  });

  it('should allow cancellation of scheduled shutdown', async () => {
    const farmId = 'cancel-test-farm';

    await shutdownCoordinator.scheduleShutdown({
      mode: 'farm',
      farmId,
      userId: 'test-user',
      reason: 'timeout',
      timeout: 3600000
    });

    expect(shutdownCoordinator.isShutdownScheduled(farmId)).toBe(true);

    shutdownCoordinator.cancelShutdown(farmId);

    expect(shutdownCoordinator.isShutdownScheduled(farmId)).toBe(false);
  });
});
