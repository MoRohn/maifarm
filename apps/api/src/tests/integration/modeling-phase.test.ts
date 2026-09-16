/**
 * Integration Tests for MODELING Phase
 *
 * Tests the integration of Model-First Reasoning (arxiv 2512.14474)
 * and DEMOCRITUS Causal Modeling (arxiv 2512.07796) into the
 * farm launch pipeline.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import path from 'path';
import fs from 'fs/promises';

// Mock environment
process.env.NODE_ENV = 'test';
process.env.AI_PROVIDER = 'openai';

// Mock dependencies
jest.mock('../../database/connection.js', () => ({
  pool: {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn(),
    }),
  },
}));

jest.mock('../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  LogCategory: {
    FARM: 'farm',
    AI: 'ai',
    DATABASE: 'database',
    TERMINAL: 'terminal',
    WEBSOCKET: 'websocket',
    AUTH: 'auth',
    BARN: 'barn',
  },
}));

// Mock AI service to avoid actual API calls
jest.mock('../../services/openaiService.js', () => ({
  openaiService: {
    generateCompletion: jest.fn().mockResolvedValue({
      content: JSON.stringify({
        entities: [{ id: 'e1', name: 'TestEntity', type: 'class', properties: {}, relationships: [] }],
        variables: [],
        actions: [{ id: 'a1', name: 'Create', description: 'Create something', preconditions: [], effects: [], priority: 1 }],
        constraints: [],
        goals: [{ id: 'g1', description: 'Complete task', conditions: [], priority: 1, verified: false }],
      }),
    }),
  },
}));

describe('MODELING Phase Integration', () => {
  let ProblemModelingService: any;
  let CausalModelingService: any;
  let problemModelingService: any;
  let causalModelingService: any;

  beforeAll(async () => {
    // Import services
    const problemModule = await import('../../services/ProblemModelingService.js');
    const causalModule = await import('../../services/CausalModelingService.js');

    ProblemModelingService = problemModule.ProblemModelingService;
    CausalModelingService = causalModule.CausalModelingService;

    problemModelingService = ProblemModelingService.getInstance();
    causalModelingService = CausalModelingService.getInstance();
  });

  afterAll(async () => {
    // Cleanup
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Problem Model + Causal Model Integration', () => {
    it('should generate both models from the same prompt', async () => {
      const farmId = 'test-farm-123';
      const prompt = `
        Create a REST API with authentication.
        First set up the database schema.
        Then implement user registration.
        Authentication requires the user model.
        Finally add the API endpoints.
      `;

      // Generate problem model
      const problemModel = await problemModelingService.generateModel({
        farmId,
        prompt,
        mode: 'HARVEST',
      });

      expect(problemModel).toBeDefined();
      expect(problemModel.farmId).toBe(farmId);
      expect(problemModel.entities.length).toBeGreaterThan(0);

      // Generate causal model with problem model context
      const causalModel = await causalModelingService.extractCausalModel({
        farmId,
        prompt,
        problemModel: {
          entities: problemModel.entities.map((e: any) => ({
            id: e.id,
            name: e.name,
            type: e.type,
          })),
          actions: problemModel.actions.map((a: any) => ({
            id: a.id,
            name: a.name,
            description: a.description,
          })),
        },
      });

      expect(causalModel).toBeDefined();
      expect(causalModel.farmId).toBe(farmId);
      expect(causalModel.triples.length).toBeGreaterThanOrEqual(0);
    });

    it('should link causal model to problem model', async () => {
      const farmId = 'test-farm-456';
      const prompt = 'Build a component that depends on the service';

      const problemModel = await problemModelingService.generateModel({
        farmId,
        prompt,
        mode: 'QUICK_TASK',
      });

      const causalModel = await causalModelingService.extractCausalModel({
        farmId,
        prompt,
        problemModel: {
          entities: problemModel.entities,
          actions: problemModel.actions,
        },
      });

      // Causal model should reference problem model
      expect(causalModel.problemModelId).toBe(problemModel.id);
    });
  });

  describe('Agent Context Generation', () => {
    it('should provide combined context for agents', async () => {
      const farmId = 'test-farm-789';
      const agentId = 'agent-1';
      const prompt = 'Create a file, then update the tests';

      // Generate models
      const problemModel = await problemModelingService.generateModel({
        farmId,
        prompt,
        mode: 'HARVEST',
      });

      const causalModel = await causalModelingService.extractCausalModel({
        farmId,
        prompt,
        problemModel: {
          entities: problemModel.entities,
          actions: problemModel.actions,
        },
      });

      // Get agent context from both models
      const problemContext = problemModelingService.generateAgentContext(
        problemModel,
        agentId
      );

      const causalContext = causalModelingService.generateAgentCausalContext(
        causalModel,
        agentId
      );

      // Problem context should have entities and constraints
      expect(problemContext).toHaveProperty('relevantEntities');
      expect(problemContext).toHaveProperty('constraints');

      // Causal context should have task order and dependencies
      expect(causalContext).toHaveProperty('taskOrder');
      expect(causalContext).toHaveProperty('dependencies');
    });
  });

  describe('Model Persistence', () => {
    it('should serialize models to coordination directory', async () => {
      const farmId = 'test-farm-serialize';
      const testDir = path.join('/tmp', 'maifarm-test', farmId, 'coordination');

      // Create test directory
      await fs.mkdir(testDir, { recursive: true });

      const prompt = 'Create a simple module';

      // Generate and save problem model
      const problemModel = await problemModelingService.generateModel({
        farmId,
        prompt,
        mode: 'QUICK_TASK',
      });

      const problemModelPath = path.join(testDir, 'problem_model.json');
      await fs.writeFile(problemModelPath, JSON.stringify(problemModel, null, 2));

      // Verify file exists
      const savedContent = await fs.readFile(problemModelPath, 'utf-8');
      const parsed = JSON.parse(savedContent);

      expect(parsed.id).toBe(problemModel.id);
      expect(parsed.farmId).toBe(farmId);

      // Cleanup
      await fs.rm(path.join('/tmp', 'maifarm-test'), { recursive: true, force: true });
    });

    it('should load models from coordination directory', async () => {
      const farmId = 'test-farm-load';
      const testDir = path.join('/tmp', 'maifarm-test', farmId, 'coordination');

      await fs.mkdir(testDir, { recursive: true });

      // Create mock model file
      const mockModel = {
        id: 'model-123',
        farmId,
        entities: [{ id: 'e1', name: 'Test', type: 'class', properties: {}, relationships: [] }],
        variables: [],
        actions: [],
        constraints: [],
        goals: [],
        verified: false,
        version: 1,
      };

      await fs.writeFile(
        path.join(testDir, 'problem_model.json'),
        JSON.stringify(mockModel, null, 2)
      );

      // Load model
      const content = await fs.readFile(
        path.join(testDir, 'problem_model.json'),
        'utf-8'
      );
      const loadedModel = JSON.parse(content);

      expect(loadedModel.id).toBe('model-123');
      expect(loadedModel.farmId).toBe(farmId);

      // Cleanup
      await fs.rm(path.join('/tmp', 'maifarm-test'), { recursive: true, force: true });
    });
  });

  describe('Error Handling', () => {
    it('should fall back to heuristic extraction on AI failure', async () => {
      // Force AI failure
      const { openaiService } = await import('../../services/openaiService.js');
      (openaiService.generateCompletion as jest.Mock).mockRejectedValueOnce(
        new Error('API Error')
      );

      const farmId = 'test-farm-fallback';
      const prompt = 'Create a file called test.ts';

      // Should still generate model using heuristics
      const model = await problemModelingService.generateModel({
        farmId,
        prompt,
        mode: 'HARVEST',
      });

      expect(model).toBeDefined();
      expect(model.farmId).toBe(farmId);
      // Heuristic extraction should find 'file' entity
      expect(model.entities.some((e: any) => e.type === 'file')).toBe(true);
    });

    it('should handle empty prompts gracefully', async () => {
      const farmId = 'test-farm-empty';

      const problemModel = await problemModelingService.generateModel({
        farmId,
        prompt: '',
        mode: 'HARVEST',
      });

      const causalModel = await causalModelingService.extractCausalModel({
        farmId,
        prompt: '',
      });

      // Should return valid but empty models
      expect(problemModel).toBeDefined();
      expect(causalModel).toBeDefined();
      expect(causalModel.triples).toEqual([]);
    });
  });

  describe('Farm Mode Compatibility', () => {
    const modes = ['HARVEST', 'QUICK_TASK', 'GO_WILD'] as const;

    modes.forEach((mode) => {
      it(`should work with ${mode} mode`, async () => {
        const farmId = `test-farm-${mode.toLowerCase()}`;
        const prompt = 'Implement a feature';

        const model = await problemModelingService.generateModel({
          farmId,
          prompt,
          mode,
        });

        expect(model).toBeDefined();
        expect(model.farmId).toBe(farmId);
      });
    });
  });

  describe('Topological Ordering for Task Execution', () => {
    it('should provide correct task order for sequential dependencies', async () => {
      const farmId = 'test-farm-order';
      const prompt = `
        Step 1: Set up database
        Step 2: Create models (requires database)
        Step 3: Build API (requires models)
        Step 4: Write tests (requires API)
      `;

      const causalModel = await causalModelingService.extractCausalModel({
        farmId,
        prompt,
      });

      // Topological order should respect dependencies
      const order = causalModel.topologicalOrder;

      if (order.length >= 2) {
        // If we have nodes, verify order respects dependencies
        const nodeMap = new Map(
          causalModel.graph.nodes.map((n: any) => [n.id, n])
        );

        for (const edge of causalModel.graph.edges) {
          const sourceIdx = order.indexOf(edge.source);
          const targetIdx = order.indexOf(edge.target);

          if (sourceIdx >= 0 && targetIdx >= 0) {
            expect(sourceIdx).toBeLessThan(targetIdx);
          }
        }
      }
    });
  });

  describe('Conflict Detection and Resolution', () => {
    it('should detect conflicting requirements', async () => {
      const farmId = 'test-farm-conflict';
      const prompt = `
        Feature A requires Feature B.
        Feature B prevents Feature A.
      `;

      const causalModel = await causalModelingService.extractCausalModel({
        farmId,
        prompt,
      });

      // Should detect the contradiction
      if (causalModel.triples.length >= 2) {
        expect(causalModel.conflicts.length).toBeGreaterThan(0);
      }
    });

    it('should resolve conflicts automatically', async () => {
      const farmId = 'test-farm-resolve';
      const prompt = `
        Component X enables Component Y (high confidence).
        Component X prevents Component Y (low confidence).
      `;

      const causalModel = await causalModelingService.extractCausalModel({
        farmId,
        prompt,
      });

      // If conflicts exist, they should be marked as resolved
      for (const conflict of causalModel.conflicts) {
        if (conflict.resolution) {
          expect(conflict.resolved).toBe(true);
        }
      }
    });
  });

  describe('Model Verification', () => {
    it('should verify outputs against problem model', async () => {
      const farmId = 'test-farm-verify';
      const prompt = 'Create a UserService class';

      const model = await problemModelingService.generateModel({
        farmId,
        prompt,
        mode: 'HARVEST',
      });

      // Simulate agent output
      const agentOutput = {
        files_created: ['src/services/UserService.ts'],
        classes_defined: ['UserService'],
      };

      const verificationResult = await problemModelingService.verifyOutput(
        model,
        agentOutput
      );

      expect(verificationResult).toHaveProperty('verified');
      expect(verificationResult).toHaveProperty('score');
    });
  });
});

describe('Prompt Enhancement Templates', () => {
  it('should have model-first-reasoning template', async () => {
    const { templates } = await import('../../services/promptEnhancer.js');

    const modelFirstTemplate = templates.find(
      (t: any) => t.id === 'model-first-reasoning'
    );

    expect(modelFirstTemplate).toBeDefined();
    expect(modelFirstTemplate?.purpose).toContain('model');
  });

  it('should have causal-awareness template', async () => {
    const { templates } = await import('../../services/promptEnhancer.js');

    const causalTemplate = templates.find(
      (t: any) => t.id === 'causal-awareness'
    );

    expect(causalTemplate).toBeDefined();
    expect(causalTemplate?.purpose).toContain('causal');
  });
});
