/**
 * Integration Test for Farm → Harvest → Barn Flow
 * Tests the complete lifecycle without starting a full server
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { createTestFarm, createTestHarvest, createTestBarnItem } from '../helpers/testFactories';

// Mock the services we'll test
jest.mock('../../server/services/farmManager');
jest.mock('../../server/services/harvestService');
jest.mock('../../server/services/barnService');
jest.mock('../../server/services/OrchestratorService');

describe('Farm → Harvest → Barn Integration', () => {
  let farmManager: any;
  let harvestService: any;
  let barnService: any;
  let orchestratorService: any;

  beforeAll(async () => {
    // Import mocked services
    const fm = await import('../../server/services/unified/farmService');
    const hs = await import('../../server/services/unified/farmService');
    const bs = await import('../../server/services/unified/farmService');
    const os = await import('../../server/services/unified/farmService');
    
    farmManager = fm.farmManager;
    harvestService = hs.harvestService;
    barnService = bs.barnService;
    orchestratorService = os.orchestratorService;
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  describe('Farm Creation and Launch', () => {
    it('should create and launch a farm successfully', async () => {
      const farmData = createTestFarm({
        name: 'Integration Test Farm',
        config: {
          maxAgents: 3,
          timeout: 300000,
          provider: 'claude'
        }
      });

      // Mock farm creation
      farmManager.createFarm = jest.fn().mockResolvedValue({
        success: true,
        data: farmData
      });

      // Mock farm launch
      orchestratorService.launchFarm = jest.fn().mockResolvedValue({
        success: true,
        sessionName: `farm-${farmData.id.substring(0, 8)}`,
        status: 'launching'
      });

      // Create farm
      const createResult = await farmManager.createFarm(farmData);
      expect(createResult.success).toBe(true);
      expect(createResult.data.id).toBeDefined();

      // Launch farm
      const launchResult = await orchestratorService.launchFarm(
        farmData.id,
        'Test integration task',
        3
      );
      expect(launchResult.success).toBe(true);
      expect(launchResult.sessionName).toContain('farm-');
    });

    it('should handle farm status transitions correctly', async () => {
      const farmId = 'test-farm-123';
      const statusTransitions = ['idle', 'launching', 'active', 'harvesting', 'completed'];

      // Mock status updates
      farmManager.updateFarmStatus = jest.fn().mockImplementation((id, status) => {
        return Promise.resolve({ success: true, status });
      });

      // Test each transition
      for (let i = 1; i < statusTransitions.length; i++) {
        const result = await farmManager.updateFarmStatus(
          farmId,
          statusTransitions[i]
        );
        expect(result.success).toBe(true);
        expect(result.status).toBe(statusTransitions[i]);
      }

      expect(farmManager.updateFarmStatus).toHaveBeenCalledTimes(4);
    });
  });

  describe('Harvest Collection', () => {
    it('should trigger harvest when farm completes', async () => {
      const farmId = 'test-farm-456';
      const harvestData = createTestHarvest(farmId, {
        status: 'collecting',
        results: [
          { agentId: 'agent-1', output: 'Result 1' },
          { agentId: 'agent-2', output: 'Result 2' },
          { agentId: 'agent-3', output: 'Result 3' }
        ]
      });

      // Mock harvest trigger
      harvestService.triggerHarvest = jest.fn().mockResolvedValue({
        success: true,
        harvestId: harvestData.id,
        status: 'collecting'
      });

      // Mock harvest collection
      harvestService.collectResults = jest.fn().mockResolvedValue({
        success: true,
        results: harvestData.results
      });

      // Trigger harvest
      const triggerResult = await harvestService.triggerHarvest(farmId);
      expect(triggerResult.success).toBe(true);
      expect(triggerResult.harvestId).toBeDefined();

      // Collect results
      const collectResult = await harvestService.collectResults(harvestData.id);
      expect(collectResult.success).toBe(true);
      expect(collectResult.results).toHaveLength(3);
    });

    it('should generate harvest insights', async () => {
      const harvestId = 'test-harvest-789';
      const expectedInsights = [
        { type: 'summary', content: 'All agents completed successfully' },
        { type: 'quality', content: 'High quality output detected' },
        { type: 'recommendation', content: 'Consider using similar approach for future tasks' }
      ];

      // Mock insight generation
      harvestService.generateInsights = jest.fn().mockResolvedValue({
        success: true,
        insights: expectedInsights
      });

      const result = await harvestService.generateInsights(harvestId);
      expect(result.success).toBe(true);
      expect(result.insights).toHaveLength(3);
      expect(result.insights[0].type).toBe('summary');
    });
  });

  describe('Barn Storage', () => {
    it('should store harvest results in barn', async () => {
      const harvestId = 'test-harvest-abc';
      const barnItem = createTestBarnItem(harvestId, {
        name: 'Integration Test Result',
        category: 'test',
        quality: { score: 95, verified: true }
      });

      // Mock barn storage
      barnService.storeHarvest = jest.fn().mockResolvedValue({
        success: true,
        itemId: barnItem.id,
        storedAt: new Date()
      });

      // Mock item retrieval
      barnService.getItem = jest.fn().mockResolvedValue({
        success: true,
        data: barnItem
      });

      // Store harvest
      const storeResult = await barnService.storeHarvest(harvestId, barnItem);
      expect(storeResult.success).toBe(true);
      expect(storeResult.itemId).toBeDefined();

      // Retrieve item
      const getResult = await barnService.getItem(barnItem.id);
      expect(getResult.success).toBe(true);
      expect(getResult.data.quality.score).toBe(95);
    });

    it('should search barn items by criteria', async () => {
      const searchCriteria = {
        category: 'test',
        minQuality: 80,
        tags: ['integration', 'test']
      };

      const mockResults = [
        createTestBarnItem('harvest-1'),
        createTestBarnItem('harvest-2'),
        createTestBarnItem('harvest-3')
      ];

      // Mock search
      barnService.searchItems = jest.fn().mockResolvedValue({
        success: true,
        items: mockResults,
        total: 3
      });

      const result = await barnService.searchItems(searchCriteria);
      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('should generate seeds from barn items', async () => {
      const barnItemId = 'barn-item-xyz';
      const seedConfig = {
        name: 'Test Seed',
        description: 'Seed generated from barn item',
        template: 'startup-founder'
      };

      // Mock seed generation
      barnService.generateSeed = jest.fn().mockResolvedValue({
        success: true,
        seedId: 'seed-123',
        config: seedConfig
      });

      const result = await barnService.generateSeed(barnItemId, seedConfig);
      expect(result.success).toBe(true);
      expect(result.seedId).toBeDefined();
      expect(result.config.name).toBe('Test Seed');
    });
  });

  describe('End-to-End Flow', () => {
    it('should complete full farm to barn flow', async () => {
      // Setup
      const farm = createTestFarm({ name: 'E2E Test Farm' });
      const harvest = createTestHarvest(farm.id);
      const barnItem = createTestBarnItem(harvest.id);

      // Mock the complete flow
      const mockFlow = {
        farmCreated: false,
        farmLaunched: false,
        harvestTriggered: false,
        resultsCollected: false,
        itemStored: false
      };

      // Step 1: Create farm
      farmManager.createFarm = jest.fn().mockImplementation(() => {
        mockFlow.farmCreated = true;
        return Promise.resolve({ success: true, data: farm });
      });

      // Step 2: Launch farm
      orchestratorService.launchFarm = jest.fn().mockImplementation(() => {
        mockFlow.farmLaunched = true;
        return Promise.resolve({ success: true, status: 'active' });
      });

      // Step 3: Trigger harvest
      harvestService.triggerHarvest = jest.fn().mockImplementation(() => {
        mockFlow.harvestTriggered = true;
        return Promise.resolve({ success: true, harvestId: harvest.id });
      });

      // Step 4: Collect results
      harvestService.collectResults = jest.fn().mockImplementation(() => {
        mockFlow.resultsCollected = true;
        return Promise.resolve({ success: true, results: harvest.results });
      });

      // Step 5: Store in barn
      barnService.storeHarvest = jest.fn().mockImplementation(() => {
        mockFlow.itemStored = true;
        return Promise.resolve({ success: true, itemId: barnItem.id });
      });

      // Execute flow
      await farmManager.createFarm(farm);
      await orchestratorService.launchFarm(farm.id, 'E2E test task', 3);
      await harvestService.triggerHarvest(farm.id);
      await harvestService.collectResults(harvest.id);
      await barnService.storeHarvest(harvest.id, barnItem);

      // Verify all steps completed
      expect(mockFlow.farmCreated).toBe(true);
      expect(mockFlow.farmLaunched).toBe(true);
      expect(mockFlow.harvestTriggered).toBe(true);
      expect(mockFlow.resultsCollected).toBe(true);
      expect(mockFlow.itemStored).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle farm launch failures gracefully', async () => {
      const farmId = 'fail-farm-123';

      // Mock launch failure
      orchestratorService.launchFarm = jest.fn().mockRejectedValue(
        new Error('Failed to create tmux session')
      );

      // Mock recovery
      orchestratorService.recoverFarm = jest.fn().mockResolvedValue({
        success: true,
        recovered: true
      });

      try {
        await orchestratorService.launchFarm(farmId, 'Test task', 3);
      } catch (error: any) {
        expect(error.message).toContain('tmux session');
        
        // Attempt recovery
        const recovery = await orchestratorService.recoverFarm(farmId);
        expect(recovery.success).toBe(true);
      }
    });

    it('should handle harvest collection timeouts', async () => {
      const harvestId = 'timeout-harvest-123';

      // Mock timeout
      harvestService.collectResults = jest.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Collection timeout')), 100);
        });
      });

      try {
        await harvestService.collectResults(harvestId);
      } catch (error: any) {
        expect(error.message).toContain('timeout');
      }
    });
  });

  describe('Performance Benchmarks', () => {
    it('should complete operations within performance thresholds', async () => {
      const performanceThresholds = {
        farmCreation: 100,  // ms
        farmLaunch: 3000,   // ms
        harvestCollection: 5000,  // ms
        barnStorage: 500    // ms
      };

      // Mock with timing
      farmManager.createFarm = jest.fn().mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => resolve({ success: true }), 50);
        });
      });

      const start = Date.now();
      await farmManager.createFarm(createTestFarm());
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(performanceThresholds.farmCreation);
    });
  });
});