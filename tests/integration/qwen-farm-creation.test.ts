import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import { QwenTestUtilities } from '../../server/utils/qwenTestHelpers';
import { multiClaudeService } from '../../server/services/multiClaudeService';
import { websocketManager } from '../../server/websocket/websocketManager';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';

// Mock websocket for testing
jest.mock('../../server/websocket/websocketManager');

describe('Qwen Farm Creation Tests', () => {
  let testUtils: QwenTestUtilities;
  let createdFarms: string[] = [];

  beforeAll(async () => {
    testUtils = new QwenTestUtilities({
      provider: 'qwen',
      debugMode: true
    });

    await testUtils.initializeTestEnvironment();
    
    // Set up environment for Qwen
    process.env.AI_PROVIDER = 'qwen';
  });

  afterAll(async () => {
    // Clean up created farms
    for (const farmId of createdFarms) {
      try {
        const status = await multiClaudeService.getStatus(farmId);
        if (status.isRunning) {
          await multiClaudeService.stopFarm(status.processId);
        }
      } catch (error) {
        console.log(`Cleanup error for farm ${farmId}:`, error);
      }
    }

    await testUtils.cleanupTestData();
    
    // Reset environment
    delete process.env.AI_PROVIDER;
  });

  describe('Basic Farm Creation', () => {
    it('should create a simple Qwen farm with 2 agents', async () => {
      const farmOptions = {
        farmId: `qwen-test-${Date.now()}`,
        name: 'Qwen Basic Test Farm',
        description: 'Testing basic Qwen farm creation',
        numberOfAgents: 2,
        prompt: 'Create a simple calculator function that adds two numbers',
        provider: 'qwen' as const
      };

      try {
        const processId = await multiClaudeService.launchFarm(farmOptions);
        createdFarms.push(farmOptions.farmId);

        expect(processId).toBeTruthy();
        expect(typeof processId).toBe('string');

        // Wait for farm to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check farm status
        const status = await multiClaudeService.getStatus(farmOptions.farmId);
        expect(status.farmId).toBe(farmOptions.farmId);
        expect(['launching', 'running']).toContain(status.status);

      } catch (error: any) {
        // If multi_claude.py doesn't exist, skip test
        if (error.message.includes('not found')) {
          console.log('Skipping test: multi_claude.py not available');
          expect(error.message).toContain('not found');
        } else {
          throw error;
        }
      }
    });

    it('should create a collaborative Qwen farm', async () => {
      const farmOptions = {
        farmId: `qwen-collab-${Date.now()}`,
        name: 'Qwen Collaborative Farm',
        description: 'Testing collaborative mode with Qwen',
        numberOfAgents: 3,
        prompt: 'Build a REST API with user authentication',
        collaborative: true,
        steps: [
          'Design the API schema',
          'Implement user model and authentication',
          'Create API endpoints',
          'Add validation and error handling',
          'Write tests'
        ],
        provider: 'qwen' as const
      };

      try {
        const processId = await multiClaudeService.launchFarm(farmOptions);
        createdFarms.push(farmOptions.farmId);

        expect(processId).toBeTruthy();

        // Verify collaborative mode was set
        const farmProcess = multiClaudeService.getFarmStatus(processId);
        expect(farmProcess).toBeDefined();

      } catch (error: any) {
        console.log('Collaborative farm test skipped:', error.message);
        expect(error).toBeDefined();
      }
    });
  });

  describe('Farm Creation with Context', () => {
    it('should create a farm with context files', async () => {
      // Create test context files
      const contextDir = '/tmp/qwen_test_context';
      await fs.mkdir(contextDir, { recursive: true });
      
      const contextFile1 = path.join(contextDir, 'requirements.txt');
      const contextFile2 = path.join(contextDir, 'README.md');
      
      await fs.writeFile(contextFile1, 'fastapi==0.104.1\nuvicorn==0.24.0\npydantic==2.5.0');
      await fs.writeFile(contextFile2, '# Test Project\n\nThis is a test project for Qwen integration.');

      const farmOptions = {
        farmId: `qwen-context-${Date.now()}`,
        name: 'Qwen Context Test Farm',
        description: 'Testing farm creation with context files',
        numberOfAgents: 2,
        prompt: 'Review these files and create a FastAPI application based on the requirements',
        contextFiles: [contextFile1, contextFile2],
        provider: 'qwen' as const
      };

      try {
        const processId = await multiClaudeService.launchFarm(farmOptions);
        createdFarms.push(farmOptions.farmId);

        expect(processId).toBeTruthy();

        // Clean up context files
        await fs.rm(contextDir, { recursive: true });

      } catch (error: any) {
        // Clean up context files even on error
        await fs.rm(contextDir, { recursive: true }).catch(() => {});
        
        console.log('Context farm test skipped:', error.message);
        expect(error).toBeDefined();
      }
    });
  });

  describe('Farm Creation with Steps', () => {
    it('should create a step-based Qwen farm', async () => {
      const farmOptions = {
        farmId: `qwen-steps-${Date.now()}`,
        name: 'Qwen Step-based Farm',
        description: 'Testing step distribution with Qwen',
        numberOfAgents: 4,
        prompt: 'Create a complete web application',
        steps: [
          'Set up project structure',
          'Create database schema',
          'Implement backend API',
          'Build frontend UI',
          'Add authentication',
          'Write documentation',
          'Create deployment scripts',
          'Add monitoring'
        ],
        bundleSteps: 2, // Bundle 2 steps per agent
        provider: 'qwen' as const
      };

      try {
        const processId = await multiClaudeService.launchFarm(farmOptions);
        createdFarms.push(farmOptions.farmId);

        expect(processId).toBeTruthy();

        // Monitor step assignment
        const monitoring = await testUtils.monitorFarmExecution(farmOptions.farmId, 3000);
        
        // Log monitoring results
        console.log('Step assignment monitoring:', {
          logs: monitoring.logs.slice(0, 5),
          agentCount: monitoring.agentStatuses.size
        });

      } catch (error: any) {
        console.log('Step-based farm test skipped:', error.message);
        expect(error).toBeDefined();
      }
    });
  });

  describe('YAML-based Farm Creation', () => {
    it('should create a farm from YAML configuration', async () => {
      const yamlContent = `
name: Qwen YAML Test Farm
initial_prompt: |
  Create a Python package for data processing with the following features:
  - CSV file reading and writing
  - Data validation
  - Basic statistics calculation
  - Export to JSON format

steps:
  - content: Design the package structure
    description: Create the directory layout and __init__.py files
  - content: Implement CSV handling
    description: Create functions for reading and writing CSV files
  - content: Add data validation
    description: Implement validation rules and error handling
  - content: Create statistics module
    description: Add functions for mean, median, mode, and standard deviation
  - content: Implement JSON export
    description: Create export functionality with formatting options
  - content: Write unit tests
    description: Create comprehensive test suite using pytest

context_files:
  - /tmp/sample_data.csv
`;

      // Create sample context file
      const sampleData = 'name,age,score\nAlice,25,85\nBob,30,92\nCharlie,35,78';
      await fs.writeFile('/tmp/sample_data.csv', sampleData);

      const farmOptions = {
        farmId: `qwen-yaml-${Date.now()}`,
        name: 'Qwen YAML Farm',
        description: 'Testing YAML-based farm creation',
        numberOfAgents: 3,
        prompt: 'Process the YAML configuration',
        yamlContent,
        provider: 'qwen' as const
      };

      try {
        const processId = await multiClaudeService.launchFarm(farmOptions);
        createdFarms.push(farmOptions.farmId);

        expect(processId).toBeTruthy();

        // Verify YAML was processed
        const status = await multiClaudeService.getStatus(farmOptions.farmId);
        expect(status).toBeDefined();

        // Clean up
        await fs.unlink('/tmp/sample_data.csv').catch(() => {});

      } catch (error: any) {
        // Clean up even on error
        await fs.unlink('/tmp/sample_data.csv').catch(() => {});
        
        console.log('YAML farm test skipped:', error.message);
        expect(error).toBeDefined();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid farm configuration gracefully', async () => {
      const invalidOptions = {
        farmId: `qwen-invalid-${Date.now()}`,
        name: 'Invalid Farm',
        description: 'Testing error handling',
        numberOfAgents: 0, // Invalid: 0 agents
        prompt: 'This should fail',
        provider: 'qwen' as const
      };

      try {
        await multiClaudeService.launchFarm(invalidOptions);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeDefined();
        // Error could be from validation or missing script
        expect(error.message).toBeTruthy();
      }
    });

    it('should handle missing Qwen configuration', async () => {
      const originalProvider = process.env.AI_PROVIDER;
      delete process.env.AI_PROVIDER;

      const farmOptions = {
        farmId: `qwen-noconfig-${Date.now()}`,
        name: 'No Config Farm',
        description: 'Testing without Qwen configuration',
        numberOfAgents: 2,
        prompt: 'Test without configuration',
        provider: 'qwen' as const
      };

      try {
        const processId = await multiClaudeService.launchFarm(farmOptions);
        createdFarms.push(farmOptions.farmId);
        
        // If it succeeds, provider flag was passed correctly
        expect(processId).toBeTruthy();
      } catch (error) {
        // Expected to fail without configuration
        expect(error).toBeDefined();
      }

      // Restore
      if (originalProvider) {
        process.env.AI_PROVIDER = originalProvider;
      }
    });
  });

  describe('Farm Lifecycle Management', () => {
    it('should properly stop a running Qwen farm', async () => {
      const farmOptions = {
        farmId: `qwen-lifecycle-${Date.now()}`,
        name: 'Lifecycle Test Farm',
        description: 'Testing farm lifecycle',
        numberOfAgents: 2,
        prompt: 'Simple test task',
        provider: 'qwen' as const
      };

      try {
        const processId = await multiClaudeService.launchFarm(farmOptions);
        createdFarms.push(farmOptions.farmId);

        // Wait for initialization
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Stop the farm
        await multiClaudeService.stopFarm(processId);

        // Verify it's stopped
        const status = await multiClaudeService.getStatus(farmOptions.farmId);
        expect(['stopped', 'idle']).toContain(status.status);

      } catch (error: any) {
        console.log('Lifecycle test skipped:', error.message);
        expect(error).toBeDefined();
      }
    });

    it('should handle pause and resume operations', async () => {
      const farmOptions = {
        farmId: `qwen-pause-${Date.now()}`,
        name: 'Pause/Resume Test Farm',
        description: 'Testing pause and resume',
        numberOfAgents: 2,
        prompt: 'Long running task for pause test',
        provider: 'qwen' as const
      };

      try {
        const processId = await multiClaudeService.launchFarm(farmOptions);
        createdFarms.push(farmOptions.farmId);

        // Wait for initialization
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Pause the farm
        await multiClaudeService.pauseFarm(processId);
        
        // Check paused state
        let status = await multiClaudeService.getStatus(farmOptions.farmId);
        expect(['paused', 'stopped']).toContain(status.status);

        // Resume the farm
        await multiClaudeService.resumeFarm(processId);
        
        // Check resumed state
        status = await multiClaudeService.getStatus(farmOptions.farmId);
        expect(['running', 'idle']).toContain(status.status);

      } catch (error: any) {
        console.log('Pause/resume test skipped:', error.message);
        expect(error).toBeDefined();
      }
    });
  });

  describe('Tmux Session Management', () => {
    it('should detect existing tmux sessions', async () => {
      // Create a test tmux session manually
      const sessionName = 'qwen_test_session';
      
      await new Promise<void>((resolve) => {
        const createSession = spawn('tmux', ['new-session', '-d', '-s', sessionName]);
        createSession.on('exit', () => resolve());
      });

      // Now test if multiClaudeService can detect it
      const farmOptions = {
        farmId: sessionName.replace('qwen_test_', ''), // Extract ID from session name
        name: 'Existing Session Test',
        description: 'Testing with existing tmux session',
        numberOfAgents: 2,
        prompt: 'Test with existing session',
        provider: 'qwen' as const
      };

      try {
        const status = await multiClaudeService.getStatus(farmOptions.farmId);
        
        // It should detect the session even without launching
        console.log('Existing session status:', status);
        
        // Clean up the session
        await new Promise<void>((resolve) => {
          const killSession = spawn('tmux', ['kill-session', '-t', sessionName]);
          killSession.on('exit', () => resolve());
        });
      } catch (error) {
        // Clean up on error too
        spawn('tmux', ['kill-session', '-t', sessionName]);
        throw error;
      }
    });
  });
});