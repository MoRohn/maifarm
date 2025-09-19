/**
 * Unit tests for ShutdownCoordinator timeout handling
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock the timing constants
jest.mock('../../server/constants/timing', () => ({
  GRACEFUL_SHUTDOWN_PERIOD: 30000,
  QUICK_TASK_TIMEOUT: 300000,
  calculateGracefulShutdownTime: jest.fn(),
  getGracePeriod: jest.fn(),
  FILE_COLLECTION_TIMEOUT: 30000,
  AGENT_CLOSING_PROMPT_TIMEOUT: 5000
}));

// Mock other dependencies
jest.mock('../../server/utils/logger');
jest.mock('../../server/websocket/websocketManager');
jest.mock('../../server/services/OrchestratorService');
jest.mock('../../server/services/harvestFileCollector');

describe('ShutdownCoordinator', () => {
  let shutdownCoordinator: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear module cache to get fresh instance
    jest.resetModules();
  });
  
  describe('Timeout Conversion', () => {
    it('should correctly convert seconds to milliseconds for values < 1000', async () => {
      const { shutdownCoordinator } = await import('../../server/services/shutdownCoordinator');
      
      const config = {
        mode: 'farm' as const,
        farmId: 'test-farm-123',
        userId: 'user-1',
        reason: 'timeout' as const,
        timeout: 300 // 5 minutes in seconds
      };
      
      const spy = jest.spyOn(console, 'log');
      shutdownCoordinator.scheduleShutdown(config);
      
      // Check that it detected seconds and converted to ms
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('300 seconds'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('300000ms'));
    });
    
    it('should correctly handle milliseconds for common values', async () => {
      const { shutdownCoordinator } = await import('../../server/services/shutdownCoordinator');
      
      const testCases = [
        { timeout: 300000, expected: '5 minutes' },  // 5 min
        { timeout: 600000, expected: '10 minutes' }, // 10 min
        { timeout: 1800000, expected: '30 minutes' }, // 30 min
        { timeout: 3600000, expected: '60 minutes' }  // 1 hour
      ];
      
      for (const testCase of testCases) {
        const config = {
          mode: 'farm' as const,
          farmId: `test-farm-${testCase.timeout}`,
          userId: 'user-1',
          reason: 'timeout' as const,
          timeout: testCase.timeout
        };
        
        const spy = jest.spyOn(console, 'log');
        shutdownCoordinator.scheduleShutdown(config);
        
        // Should recognize as milliseconds
        expect(spy).toHaveBeenCalledWith(
          expect.stringContaining(`${testCase.timeout}ms`)
        );
        
        spy.mockClear();
      }
    });
    
    it('should handle ambiguous values safely', async () => {
      const { shutdownCoordinator } = await import('../../server/services/shutdownCoordinator');
      
      const config = {
        mode: 'gowild' as const,
        farmId: 'test-farm-ambiguous',
        userId: 'user-1',
        reason: 'timeout' as const,
        timeout: 1500 // Ambiguous - could be 1.5 seconds or 1500ms
      };
      
      const spy = jest.spyOn(console, 'log');
      shutdownCoordinator.scheduleShutdown(config);
      
      // Should treat as milliseconds and log warning
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('1500000ms')
      );
    });
    
    it('should handle edge cases correctly', async () => {
      const { shutdownCoordinator } = await import('../../server/services/shutdownCoordinator');
      
      const edgeCases = [
        { timeout: 0, shouldConvert: true },      // 0 seconds -> 0ms
        { timeout: 999, shouldConvert: true },    // 999 seconds -> 999000ms
        { timeout: 1000, shouldConvert: false },  // 1000ms (1 second)
        { timeout: 60000, shouldConvert: false }, // 60000ms (1 minute)
        { timeout: 59999, shouldConvert: false }  // Just under 1 minute
      ];
      
      for (const testCase of edgeCases) {
        const config = {
          mode: 'farm' as const,
          farmId: `edge-case-${testCase.timeout}`,
          userId: 'user-1',
          reason: 'timeout' as const,
          timeout: testCase.timeout
        };
        
        const spy = jest.spyOn(console, 'log');
        shutdownCoordinator.scheduleShutdown(config);
        
        if (testCase.shouldConvert && testCase.timeout < 1000) {
          // Should convert seconds to ms
          expect(spy).toHaveBeenCalledWith(
            expect.stringContaining(`${testCase.timeout}s`)
          );
          expect(spy).toHaveBeenCalledWith(
            expect.stringContaining(`${testCase.timeout * 1000}ms`)
          );
        } else {
          // Should keep as ms
          expect(spy).toHaveBeenCalledWith(
            expect.stringContaining(`${testCase.timeout}ms`)
          );
        }
        
        spy.mockClear();
      }
    });
  });
  
  describe('Quick Task Mode', () => {
    it('should always use fixed 5-minute timeout for quick tasks', async () => {
      const { shutdownCoordinator } = await import('../../server/services/shutdownCoordinator');
      const { QUICK_TASK_TIMEOUT } = await import('../../server/constants/timing');
      
      const config = {
        mode: 'quick-task' as const,
        farmId: 'quick-task-123',
        userId: 'user-1',
        reason: 'timeout' as const
        // No timeout provided for quick-task
      };
      
      const spy = jest.spyOn(console, 'log');
      shutdownCoordinator.scheduleShutdown(config);
      
      // Should use QUICK_TASK_TIMEOUT (300000ms)
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('300000ms')
      );
    });
  });
  
  describe('Graceful Shutdown Timing', () => {
    it('should schedule graceful shutdown 30 seconds before timeout', async () => {
      const { shutdownCoordinator } = await import('../../server/services/shutdownCoordinator');
      const { GRACEFUL_SHUTDOWN_PERIOD } = await import('../../server/constants/timing');
      
      const config = {
        mode: 'farm' as const,
        farmId: 'test-grace-period',
        userId: 'user-1',
        reason: 'timeout' as const,
        timeout: 300 // 5 minutes in seconds
      };
      
      const spy = jest.spyOn(console, 'log');
      shutdownCoordinator.scheduleShutdown(config);
      
      // Total timeout: 300000ms (5 min)
      // Graceful shutdown at: 270000ms (4.5 min)
      // Grace period: 30000ms (30 sec)
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('270 seconds from now')
      );
    });
    
    it('should handle very short timeouts gracefully', async () => {
      const { shutdownCoordinator } = await import('../../server/services/shutdownCoordinator');
      
      const config = {
        mode: 'farm' as const,
        farmId: 'test-short-timeout',
        userId: 'user-1',
        reason: 'timeout' as const,
        timeout: 20 // 20 seconds - less than grace period
      };
      
      const spy = jest.spyOn(console, 'log');
      shutdownCoordinator.scheduleShutdown(config);
      
      // Should use minimum delay when grace period would be negative
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('using minimum delay')
      );
    });
  });
  
  describe('Shutdown Cancellation', () => {
    it('should be able to cancel scheduled shutdowns', async () => {
      const { shutdownCoordinator } = await import('../../server/services/shutdownCoordinator');
      
      const config = {
        mode: 'farm' as const,
        farmId: 'test-cancel',
        userId: 'user-1',
        reason: 'timeout' as const,
        timeout: 300
      };
      
      shutdownCoordinator.scheduleShutdown(config);
      expect(shutdownCoordinator.isShutdownScheduled('test-cancel')).toBe(true);
      
      shutdownCoordinator.cancelShutdown('test-cancel');
      expect(shutdownCoordinator.isShutdownScheduled('test-cancel')).toBe(false);
    });
    
    it('should prevent duplicate shutdowns for same farm', async () => {
      const { shutdownCoordinator } = await import('../../server/services/shutdownCoordinator');
      
      const config = {
        mode: 'farm' as const,
        farmId: 'test-duplicate',
        userId: 'user-1',
        reason: 'timeout' as const,
        timeout: 300
      };
      
      const spy = jest.spyOn(console, 'log');
      
      // Schedule first shutdown
      shutdownCoordinator.scheduleShutdown(config);
      
      // Try to schedule another
      shutdownCoordinator.scheduleShutdown(config);
      
      // Should cancel the first one
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('Cancelling existing shutdown')
      );
    });
  });
});

describe('Farm Type Guards', () => {
  let farmHelpers: any;
  
  beforeEach(async () => {
    farmHelpers = await import('../../shared/utils/farmHelpers');
  });
  
  describe('isAgentArray', () => {
    it('should correctly identify Agent[] arrays', () => {
      const agents = [
        { id: '1', name: 'Agent 1', status: 'active' },
        { id: '2', name: 'Agent 2', status: 'idle' }
      ];
      
      expect(farmHelpers.isAgentArray(agents)).toBe(true);
    });
    
    it('should correctly identify string[] arrays', () => {
      const agentIds = ['agent-1', 'agent-2', 'agent-3'];
      
      expect(farmHelpers.isAgentArray(agentIds)).toBe(false);
    });
    
    it('should handle empty arrays', () => {
      expect(farmHelpers.isAgentArray([])).toBe(true); // Default to Agent[]
    });
  });
  
  describe('getAgentCount', () => {
    it('should use explicit agentCount when available', () => {
      const farm = {
        id: 'farm-1',
        name: 'Test Farm',
        status: 'active',
        agents: ['1', '2', '3'],
        agentCount: 5 // Explicit count differs from array
      };
      
      expect(farmHelpers.getAgentCount(farm)).toBe(5);
    });
    
    it('should count agents array when agentCount not available', () => {
      const farm = {
        id: 'farm-1',
        name: 'Test Farm',
        status: 'active',
        agents: ['1', '2', '3']
      };
      
      expect(farmHelpers.getAgentCount(farm)).toBe(3);
    });
    
    it('should handle missing agents gracefully', () => {
      const farm = {
        id: 'farm-1',
        name: 'Test Farm',
        status: 'idle',
        agents: []
      };
      
      expect(farmHelpers.getAgentCount(farm)).toBe(0);
    });
  });
  
  describe('getAgentIds', () => {
    it('should extract IDs from Agent objects', () => {
      const farm = {
        id: 'farm-1',
        name: 'Test Farm',
        status: 'active',
        agents: [
          { id: 'agent-1', name: 'Agent 1', status: 'active' },
          { id: 'agent-2', name: 'Agent 2', status: 'idle' }
        ]
      };
      
      expect(farmHelpers.getAgentIds(farm)).toEqual(['agent-1', 'agent-2']);
    });
    
    it('should return string IDs as-is', () => {
      const farm = {
        id: 'farm-1',
        name: 'Test Farm',
        status: 'active',
        agents: ['id-1', 'id-2', 'id-3']
      };
      
      expect(farmHelpers.getAgentIds(farm)).toEqual(['id-1', 'id-2', 'id-3']);
    });
  });
  
  describe('normalizeFarmAgents', () => {
    it('should normalize to IDs when requested', () => {
      const farm = {
        id: 'farm-1',
        name: 'Test Farm',
        status: 'active',
        agents: [
          { id: 'agent-1', name: 'Agent 1', status: 'active' },
          { id: 'agent-2', name: 'Agent 2', status: 'idle' }
        ]
      };
      
      const ids = farmHelpers.normalizeFarmAgents(farm, 'ids');
      expect(ids).toEqual(['agent-1', 'agent-2']);
    });
    
    it('should return null when cannot convert IDs to objects', () => {
      const farm = {
        id: 'farm-1',
        name: 'Test Farm',
        status: 'active',
        agents: ['id-1', 'id-2']
      };
      
      const objects = farmHelpers.normalizeFarmAgents(farm, 'objects');
      expect(objects).toBeNull();
    });
  });
});