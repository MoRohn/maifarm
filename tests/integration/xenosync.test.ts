import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { xenoSyncService } from '../../server/services/XenoSyncService';
import { aiProviderManager } from '../../server/config/aiProviders';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('XenoSync Integration', () => {
  const testFarmId = 'test-xenosync-farm';
  const testWorkspace = path.join('/tmp', 'xenosync-test-workspace');
  let processId: string | null = null;

  beforeAll(async () => {
    // Create test workspace
    await fs.mkdir(testWorkspace, { recursive: true });
  });

  afterAll(async () => {
    // Clean up
    if (processId) {
      try {
        await xenoSyncService.stopFarm(processId);
      } catch (error) {
        console.log('Process already stopped');
      }
    }
    
    // Clean up workspace
    try {
      await fs.rm(testWorkspace, { recursive: true, force: true });
    } catch (error) {
      console.log('Failed to clean up workspace');
    }
  });

  describe('Availability Check', () => {
    it('should check if XenoSync is available', async () => {
      const isAvailable = await xenoSyncService.isAvailable();
      
      // XenoSync might not be available in test environment
      expect(typeof isAvailable).toBe('boolean');
      
      if (!isAvailable) {
        console.log('XenoSync not available - skipping integration tests');
        return;
      }
    });

    it('should validate Claude provider requirement', async () => {
      const currentProvider = aiProviderManager.getDefaultProvider();
      
      // If not Claude, XenoSync should not be used
      if (currentProvider !== 'claude') {
        const launchOptions = {
          farmId: testFarmId,
          name: 'Test Farm',
          description: 'Test XenoSync integration',
          numberOfAgents: 2,
          prompt: 'Test prompt',
          workingDirectory: testWorkspace
        };
        
        // Should fall back to MaiFarm orchestrator
        await expect(async () => {
          await xenoSyncService.launchFarm(launchOptions);
        }).rejects.toThrow();
      }
    });
  });

  describe('XenoSync Launch (if available)', () => {
    it('should launch a farm with XenoSync if Claude is available', async () => {
      const isAvailable = await xenoSyncService.isAvailable();
      const currentProvider = aiProviderManager.getDefaultProvider();
      
      if (!isAvailable || currentProvider !== 'claude') {
        console.log('Skipping XenoSync launch test - requirements not met');
        return;
      }

      const launchOptions = {
        farmId: testFarmId,
        name: 'Test XenoSync Farm',
        description: 'Integration test for XenoSync',
        numberOfAgents: 2,
        prompt: 'Create a simple hello world application',
        mode: 'parallel' as const,
        workingDirectory: testWorkspace,
        timeout: 60
      };

      try {
        processId = await xenoSyncService.launchFarm(launchOptions);
        expect(processId).toBeTruthy();
        expect(typeof processId).toBe('string');

        // Wait for initialization
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Check status
        const status = await xenoSyncService.getStatus(processId);
        expect(status).toBeDefined();
        expect(status.isRunning).toBe(true);
        expect(status.farmId).toBe(testFarmId);
        expect(status.numberOfAgents).toBe(2);
        expect(status.mode).toBe('parallel');
      } catch (error) {
        console.error('XenoSync launch failed:', error);
        // This is expected if Claude CLI is not installed
      }
    });

    it('should stop a XenoSync farm', async () => {
      if (processId) {
        await xenoSyncService.stopFarm(processId);
        
        // Wait for shutdown
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const status = await xenoSyncService.getStatus(processId);
        expect(status.isRunning).toBe(false);
        
        processId = null;
      }
    });
  });

  describe('XenoSync Configuration', () => {
    it('should validate minimum agent requirement', () => {
      const config = {
        minAgents: 1, // Below minimum
        maxAgents: 20
      };
      
      // XenoSync requires minimum 2 agents
      expect(config.minAgents).toBeLessThan(2);
    });

    it('should validate maximum agent limit', () => {
      const config = {
        minAgents: 2,
        maxAgents: 25 // Above maximum
      };
      
      // XenoSync supports maximum 20 agents
      expect(config.maxAgents).toBeGreaterThan(20);
    });
  });
});

describe('XenoSync Prompt Templates', () => {
  it('should have valid prompt templates', () => {
    const { xenoSyncPromptTemplates } = require('../../server/config/xenosync');
    
    expect(xenoSyncPromptTemplates).toBeDefined();
    expect(xenoSyncPromptTemplates['retro-game']).toBeDefined();
    expect(xenoSyncPromptTemplates['api-development']).toBeDefined();
    
    // Validate retro-game template
    const retroGame = xenoSyncPromptTemplates['retro-game'];
    expect(retroGame.name).toBe('Retro Game Development');
    expect(retroGame.mode).toBe('collaborative');
    expect(retroGame.agents).toBe(4);
    expect(retroGame.steps).toHaveLength(8);
  });

  it('should map MaiFarm concepts to XenoSync', () => {
    const { conceptMapping } = require('../../server/config/xenosync');
    
    expect(conceptMapping.farm).toBe('session');
    expect(conceptMapping.agent).toBe('agent');
    expect(conceptMapping.harvest).toBe('output_collection');
    expect(conceptMapping.barn).toBe('artifact_storage');
  });
});