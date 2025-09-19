import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { shutdownCoordinator } from '../../server/services/shutdownCoordinator';
import { quickTaskService } from '../../server/services/unified/quickTaskService';
import { farmManager } from '../../server/services/unified/farmService';
import { goWildManager } from '../../server/services/unified/farmService';
import { harvestFileCollector } from '../../server/services/unified/farmService';
import { barnService } from '../../server/services/unified/farmService';
import { 
  QUICK_TASK_TIMEOUT, 
  GRACEFUL_SHUTDOWN_PERIOD,
  calculateGracefulShutdownTime 
} from '../../server/constants/timing';

// Mock dependencies
jest.mock('../../server/database/connection');
jest.mock('../../server/websocket/websocketManager');
jest.mock('../../server/services/multiClaudeService');
jest.mock('../../server/services/tmuxHelper');

describe('Graceful Shutdown Integration Tests', () => {
  const TEST_USER_ID = 'test-user';
  const TEST_FARM_ID = 'test-farm-123';
  const TEST_HARVEST_ID = 'test-harvest-456';
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Quick Task Mode', () => {
    it('should schedule graceful shutdown 30s before 5-minute timeout', async () => {
      const scheduleSpy = jest.spyOn(shutdownCoordinator, 'scheduleShutdown');
      
      // Create a quick task
      const result = await quickTaskService.createQuickTask({
        title: 'Test Task',
        description: 'Test Description',
        priority: 'high'
      }, TEST_USER_ID);
      
      // Verify shutdown was scheduled
      expect(scheduleSpy).toHaveBeenCalledWith({
        mode: 'quick-task',
        farmId: expect.stringContaining('quick-task-'),
        userId: TEST_USER_ID,
        reason: 'timeout',
        harvestId: expect.any(String),
        agentIds: []
      });
      
      // Verify timing is correct (5 minutes - 30 seconds)
      const expectedShutdownTime = QUICK_TASK_TIMEOUT - GRACEFUL_SHUTDOWN_PERIOD;
      expect(expectedShutdownTime).toBe(270000); // 4.5 minutes in ms
    });
    
    it('should execute graceful shutdown on completion', async () => {
      const executeSpy = jest.spyOn(shutdownCoordinator, 'executeGracefulShutdown');
      
      // Simulate task completion
      await quickTaskService.handleTaskCompletion(TEST_FARM_ID, {
        success: true,
        data: { result: 'completed' }
      });
      
      expect(executeSpy).toHaveBeenCalledWith({
        mode: 'quick-task',
        farmId: TEST_FARM_ID,
        userId: 'maifarm-user',
        reason: 'completion'
      });
    });
    
    it('should collect files and store in barn during shutdown', async () => {
      const collectSpy = jest.spyOn(harvestFileCollector, 'collectHarvestFiles');
      const barnSpy = jest.spyOn(barnService, 'storeHarvest');
      
      // Execute shutdown
      const result = await shutdownCoordinator.executeGracefulShutdown({
        mode: 'quick-task',
        farmId: TEST_FARM_ID,
        userId: TEST_USER_ID,
        reason: 'completion',
        harvestId: TEST_HARVEST_ID
      });
      
      expect(collectSpy).toHaveBeenCalledWith(
        TEST_HARVEST_ID,
        TEST_FARM_ID,
        expect.any(String),
        expect.any(Array)
      );
      
      expect(barnSpy).toHaveBeenCalledWith(TEST_HARVEST_ID, expect.any(Object));
      expect(result.filesCollected).toBe(true);
      expect(result.barnStored).toBe(true);
    });
  });

  describe('Farm Mode', () => {
    it('should use settings-based timeout and schedule shutdown 30s before', async () => {
      const scheduleSpy = jest.spyOn(shutdownCoordinator, 'scheduleShutdown');
      const customTimeout = 7200; // 2 hours in seconds
      
      // Create a farm with custom timeout
      const farm = await farmManager.createFarm({
        name: 'Test Farm',
        description: 'Test Description',
        type: 'collaborative',
        config: {
          maxAgents: 5,
          autoScale: true,
          timeout: customTimeout
        },
        userId: TEST_USER_ID
      });
      
      // Start the farm
      await farmManager.startFarm(farm.id, TEST_USER_ID);
      
      expect(scheduleSpy).toHaveBeenCalledWith({
        mode: 'farm',
        farmId: farm.id,
        userId: TEST_USER_ID,
        reason: 'timeout',
        timeout: customTimeout * 1000, // Convert to ms
        harvestId: expect.any(String)
      });
      
      // Verify shutdown is scheduled 30s before timeout
      const expectedShutdownTime = calculateGracefulShutdownTime(customTimeout * 1000);
      expect(expectedShutdownTime).toBe((customTimeout * 1000) - GRACEFUL_SHUTDOWN_PERIOD);
    });
    
    it('should handle user-requested shutdown gracefully', async () => {
      const executeSpy = jest.spyOn(shutdownCoordinator, 'executeGracefulShutdown');
      
      // Request shutdown
      await farmManager.gracefulShutdownFarm(TEST_FARM_ID, TEST_USER_ID, 'user_request');
      
      expect(executeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'farm',
          reason: 'user_request'
        })
      );
    });
  });

  describe('GoWild Mode', () => {
    it('should use exploration duration and schedule shutdown appropriately', async () => {
      const scheduleSpy = jest.spyOn(shutdownCoordinator, 'scheduleShutdown');
      const explorationDuration = 30; // 30 minutes
      
      // Start GoWild session
      const session = await goWildManager.startExploration(TEST_FARM_ID, {
        creativityLevel: 80,
        maxDuration: explorationDuration,
        boundaries: [],
        focusAreas: ['optimization']
      });
      
      expect(scheduleSpy).toHaveBeenCalledWith({
        mode: 'gowild',
        farmId: TEST_FARM_ID,
        userId: 'gowild-user',
        reason: 'timeout',
        timeout: explorationDuration * 60 * 1000, // Convert to ms
        harvestId: session.harvestId
      });
    });
    
    it('should collect discoveries and store in barn on shutdown', async () => {
      const result = await shutdownCoordinator.executeGracefulShutdown({
        mode: 'gowild',
        farmId: TEST_FARM_ID,
        userId: TEST_USER_ID,
        reason: 'completion',
        harvestId: TEST_HARVEST_ID
      });
      
      expect(result.success).toBe(true);
      expect(result.filesCollected).toBe(true);
      expect(result.barnStored).toBe(true);
    });
  });

  describe('Timing Validation', () => {
    it('should trigger shutdown exactly 30s before timeout', () => {
      jest.useFakeTimers();
      const executeSpy = jest.spyOn(shutdownCoordinator, 'executeGracefulShutdown');
      
      // Schedule shutdown for Quick Task
      shutdownCoordinator.scheduleShutdown({
        mode: 'quick-task',
        farmId: TEST_FARM_ID,
        userId: TEST_USER_ID,
        reason: 'timeout'
      });
      
      // Fast-forward to just before shutdown time
      jest.advanceTimersByTime(QUICK_TASK_TIMEOUT - GRACEFUL_SHUTDOWN_PERIOD - 1000);
      expect(executeSpy).not.toHaveBeenCalled();
      
      // Fast-forward to shutdown time
      jest.advanceTimersByTime(1000);
      expect(executeSpy).toHaveBeenCalled();
    });
    
    it('should handle very short timeouts gracefully', () => {
      const shortTimeout = 20000; // 20 seconds
      const gracePeriod = calculateGracefulShutdownTime(shortTimeout);
      
      // Should use minimum grace period for short timeouts
      expect(gracePeriod).toBeLessThan(shortTimeout);
      expect(gracePeriod).toBeGreaterThanOrEqual(0);
    });
  });

  describe('File Collection Validation', () => {
    it('should retry file collection on failure', async () => {
      const collectSpy = jest.spyOn(harvestFileCollector, 'collectHarvestFiles');
      
      // Mock first attempt to fail
      collectSpy.mockRejectedValueOnce(new Error('Collection failed'));
      collectSpy.mockResolvedValueOnce({
        harvestId: TEST_HARVEST_ID,
        rootPath: '/test/path',
        fileTree: { id: 'root', name: 'root', path: '/', type: 'directory', children: [], createdAt: new Date() },
        totalFiles: 10,
        totalSize: 1024,
        collectedAt: new Date()
      });
      
      const result = await shutdownCoordinator.executeGracefulShutdown({
        mode: 'quick-task',
        farmId: TEST_FARM_ID,
        userId: TEST_USER_ID,
        reason: 'completion',
        harvestId: TEST_HARVEST_ID
      });
      
      expect(collectSpy).toHaveBeenCalledTimes(2); // Initial + 1 retry
      expect(result.filesCollected).toBe(true);
    });
    
    it('should validate collected files for completeness', async () => {
      const validateSpy = jest.spyOn(harvestFileCollector as any, 'validateCollection');
      
      await shutdownCoordinator.executeGracefulShutdown({
        mode: 'farm',
        farmId: TEST_FARM_ID,
        userId: TEST_USER_ID,
        reason: 'completion',
        harvestId: TEST_HARVEST_ID
      });
      
      expect(validateSpy).toHaveBeenCalled();
    });
  });

  describe('Barn Storage Integration', () => {
    it('should make files accessible in barn after shutdown', async () => {
      const barnStoreSpy = jest.spyOn(barnService, 'storeHarvest');
      const barnGetSpy = jest.spyOn(barnService, 'findById');
      
      // Execute shutdown
      await shutdownCoordinator.executeGracefulShutdown({
        mode: 'quick-task',
        farmId: TEST_FARM_ID,
        userId: TEST_USER_ID,
        reason: 'completion',
        harvestId: TEST_HARVEST_ID
      });
      
      expect(barnStoreSpy).toHaveBeenCalledWith(TEST_HARVEST_ID, expect.any(Object));
      
      // Verify files are accessible
      const barnData = await barnService.findById(TEST_HARVEST_ID);
      expect(barnData).toBeDefined();
      expect(barnData.id).toBe(TEST_HARVEST_ID);
    });
    
    it('should handle barn storage failures gracefully', async () => {
      const barnSpy = jest.spyOn(barnService, 'storeHarvest');
      barnSpy.mockRejectedValueOnce(new Error('Barn storage failed'));
      
      const result = await shutdownCoordinator.executeGracefulShutdown({
        mode: 'farm',
        farmId: TEST_FARM_ID,
        userId: TEST_USER_ID,
        reason: 'timeout',
        harvestId: TEST_HARVEST_ID
      });
      
      expect(result.barnStored).toBe(false);
      expect(result.errors).toContain('Barn storage error: Error: Barn storage failed');
    });
  });

  describe('Error Handling', () => {
    it('should continue shutdown even if file collection partially fails', async () => {
      const collectSpy = jest.spyOn(harvestFileCollector, 'collectHarvestFiles');
      collectSpy.mockRejectedValueOnce(new Error('Partial collection failure'));
      
      const result = await shutdownCoordinator.executeGracefulShutdown({
        mode: 'gowild',
        farmId: TEST_FARM_ID,
        userId: TEST_USER_ID,
        reason: 'completion',
        harvestId: TEST_HARVEST_ID
      });
      
      expect(result.success).toBe(false);
      expect(result.filesCollected).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });
    
    it('should clean up resources even on shutdown failure', async () => {
      const cleanupSpy = jest.spyOn(shutdownCoordinator as any, 'cleanupResources');
      
      // Force an error during shutdown
      jest.spyOn(harvestFileCollector, 'collectHarvestFiles').mockRejectedValueOnce(new Error('Fatal error'));
      
      await shutdownCoordinator.executeGracefulShutdown({
        mode: 'quick-task',
        farmId: TEST_FARM_ID,
        userId: TEST_USER_ID,
        reason: 'timeout',
        harvestId: TEST_HARVEST_ID
      });
      
      expect(cleanupSpy).toHaveBeenCalledWith(TEST_FARM_ID, 'quick-task');
    });
  });
});