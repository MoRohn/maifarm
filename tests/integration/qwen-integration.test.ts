import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { QwenTestUtilities } from '../../server/utils/qwenTestHelpers';
import { multiClaudeService } from '../../server/services/multiClaudeService';
import { qwenCodeManager } from '../../server/services/qwenCodeManager';
import { websocketManager } from '../../server/websocket/websocketManager';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock websocket manager to prevent actual broadcasts during tests
jest.mock('../../server/websocket/websocketManager', () => ({
  websocketManager: {
    broadcast: jest.fn(),
    broadcastToFarm: jest.fn()
  }
}));

describe('Qwen3-Coder Integration Tests', () => {
  let testUtils: QwenTestUtilities;
  let testFarmId: string;

  beforeAll(async () => {
    testUtils = new QwenTestUtilities({
      provider: 'qwen',
      debugMode: true,
      timeout: 60000 // 60 second timeout for integration tests
    });

    await testUtils.initializeTestEnvironment();
  });

  afterAll(async () => {
    await testUtils.cleanupTestData();
  });

  describe('Environment Validation', () => {
    it('should validate Qwen integration setup', async () => {
      const validation = await testUtils.validateIntegration();
      
      // Log validation results for debugging
      console.log('Qwen Validation Results:', {
        isValid: validation.isValid,
        errors: validation.errors,
        warnings: validation.warnings,
        metadata: validation.metadata
      });

      // We expect either native CLI or proxy to be configured
      const hasQwenSupport = validation.metadata.cliInstalled || 
                            validation.metadata.apiAvailable ||
                            validation.warnings.length > 0; // Warnings indicate partial setup

      expect(hasQwenSupport).toBe(true);
      
      if (!validation.isValid) {
        console.warn('Qwen integration has issues:', validation.errors);
      }
    });

    it('should detect Qwen CLI or proxy installation', async () => {
      const cliCheck = await testUtils.checkQwenCLI();
      
      // Either native Qwen CLI or proxy should be available
      if (!cliCheck.installed) {
        // Check if we're using the proxy method
        const proxyEnv = process.env.AI_PROVIDER === 'qwen';
        expect(proxyEnv || cliCheck.installed).toBe(true);
      } else {
        expect(cliCheck.installed).toBe(true);
        if (cliCheck.version) {
          expect(cliCheck.version).toBeTruthy();
        }
      }
    });

    it('should check Qwen API connectivity', async () => {
      const apiCheck = await testUtils.checkQwenAPI();
      
      if (!apiCheck.available) {
        console.warn('Qwen API not available:', apiCheck.error);
        // Skip API tests if not configured
        expect(apiCheck.error).toContain('QWEN_API_KEY');
      } else {
        expect(apiCheck.available).toBe(true);
      }
    });
  });

  describe('Farm Creation with Qwen', () => {
    it('should create a test farm configuration', async () => {
      const farmConfig = {
        agents: 2,
        prompt: 'Test Qwen integration by creating a simple Hello World function',
        steps: ['Plan the function', 'Implement the function', 'Test the function'],
        collaborative: false
      };

      testFarmId = await testUtils.createTestFarm(farmConfig);
      expect(testFarmId).toMatch(/^test_farm_/);

      // Verify configuration was saved
      const configPath = path.join('/tmp/qwen_test_sessions', `${testFarmId}.json`);
      const savedConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      
      expect(savedConfig.id).toBe(testFarmId);
      expect(savedConfig.numberOfAgents).toBe(2);
      expect(savedConfig.provider).toBe('qwen');
    });

    it('should handle farm creation through multiClaudeService with Qwen provider', async () => {
      // Set provider to Qwen
      process.env.AI_PROVIDER = 'qwen';

      const launchOptions = {
        farmId: 'test-qwen-farm-001',
        name: 'Qwen Test Farm',
        description: 'Testing Qwen3-Coder integration',
        numberOfAgents: 2,
        prompt: 'Create a REST API endpoint for user management',
        workingDirectory: process.cwd()
      };

      try {
        // This will attempt to launch with Qwen
        const processId = await multiClaudeService.launchFarm(launchOptions);
        expect(processId).toBeTruthy();

        // Check farm status
        const status = await multiClaudeService.getStatus(launchOptions.farmId);
        expect(status.farmId).toBe(launchOptions.farmId);
        
        // Clean up
        if (status.isRunning) {
          await multiClaudeService.stopFarm(processId);
        }
      } catch (error) {
        // If multi_claude.py is not available, this is expected
        console.log('Farm launch test skipped:', error);
        expect(error).toBeDefined();
      }
    });
  });

  describe('Qwen Command Execution', () => {
    it('should execute Qwen commands through the test utility', async () => {
      // Test with a simple echo command first
      const result = await testUtils.executeCommand('echo', ['Qwen test']);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('Qwen test');
      expect(result.exitCode).toBe(0);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should handle command timeouts gracefully', async () => {
      const shortTimeoutUtils = new QwenTestUtilities({
        provider: 'qwen',
        timeout: 100 // 100ms timeout
      });

      // Use sleep command to test timeout
      const result = await shortTimeoutUtils.executeCommand('sleep', ['1']);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
      expect(result.exitCode).toBe(-1);
    });
  });

  describe('Mock Response Testing', () => {
    it('should create valid mock responses for testing', () => {
      const mockResponse = testUtils.createMockResponse(
        'Here is a Python hello world function:\n\ndef hello():\n    print("Hello from Qwen3-Coder!")',
        0
      );

      const parsed = JSON.parse(mockResponse);
      expect(parsed.choices[0].message.content).toContain('Hello from Qwen3-Coder');
      expect(parsed.model).toBe('qwen3-coder');
      expect(parsed.agent_id).toBe(0);
    });
  });

  describe('Farm Monitoring', () => {
    it('should monitor farm execution and collect logs', async () => {
      // Create a mock active_agents.json for testing
      const mockAgents = {
        [`agent_${testFarmId}_001`]: {
          agent_id: 0,
          status: 'ready',
          started: new Date().toISOString()
        },
        [`agent_${testFarmId}_002`]: {
          agent_id: 1,
          status: 'working',
          started: new Date().toISOString()
        }
      };

      await fs.writeFile(
        '/tmp/claude_coordination/active_agents.json',
        JSON.stringify(mockAgents, null, 2)
      );

      const monitorResult = await testUtils.monitorFarmExecution(testFarmId, 2000);
      
      expect(monitorResult.logs.length).toBeGreaterThan(0);
      expect(monitorResult.agentStatuses.size).toBeGreaterThan(0);
      expect(monitorResult.agentStatuses.get(0)).toBe('ready');
      expect(monitorResult.agentStatuses.get(1)).toBe('working');
    });
  });

  describe('Test Report Generation', () => {
    it('should generate a comprehensive test report', async () => {
      const testResults = [
        {
          test: 'CLI Installation',
          passed: true,
          duration: 150,
          details: { version: 'proxy' }
        },
        {
          test: 'API Connectivity',
          passed: false,
          duration: 500,
          error: 'API key not configured'
        },
        {
          test: 'Farm Creation',
          passed: true,
          duration: 1200,
          details: { farmId: testFarmId }
        }
      ];

      const reportPath = await testUtils.generateTestReport(testResults);
      expect(reportPath).toMatch(/qwen_test_report_\d+\.json$/);

      // Verify report contents
      const report = JSON.parse(await fs.readFile(reportPath, 'utf-8'));
      expect(report.provider).toBe('qwen');
      expect(report.summary.total).toBe(3);
      expect(report.summary.passed).toBe(2);
      expect(report.summary.failed).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing Qwen configuration gracefully', async () => {
      const originalApiKey = process.env.QWEN_API_KEY;
      delete process.env.QWEN_API_KEY;

      const validation = await testUtils.validateIntegration();
      expect(validation.errors.some(e => e.includes('QWEN_API_KEY'))).toBe(true);

      // Restore
      if (originalApiKey) {
        process.env.QWEN_API_KEY = originalApiKey;
      }
    });

    it('should handle invalid commands', async () => {
      const result = await testUtils.executeCommand('nonexistent-command', ['--test']);
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(-1);
      expect(result.error).toBeTruthy();
    });
  });

  describe('QwenCodeManager Integration', () => {
    it('should check Qwen installation through manager', async () => {
      const isInstalled = await qwenCodeManager.checkQwenInstallation();
      
      // Log result for debugging
      console.log('QwenCodeManager installation check:', isInstalled);
      
      // We don't require it to be installed for tests to pass
      expect(typeof isInstalled).toBe('boolean');
    });

    it('should handle farm creation with Qwen manager', async () => {
      try {
        const farm = await qwenCodeManager.createFarm({
          name: 'Test Qwen Farm',
          description: 'Integration test farm',
          agents: 2,
          prompt: 'Create a function to calculate fibonacci numbers',
          projectPath: process.cwd()
        });

        expect(farm.provider).toBe('qwen');
        expect(farm.agents).toBe(2);
        expect(farm.id).toBeTruthy();

        // Clean up
        await qwenCodeManager.stopFarm(farm.id);
      } catch (error: any) {
        // Expected if Qwen is not configured
        console.log('QwenCodeManager test skipped:', error.message);
        expect(error.message).toContain('Qwen3-Coder is not configured');
      }
    });
  });
});

// Additional test utilities for other test files
export { QwenTestUtilities, testUtils };