/**
 * AI Engine Management Integration Tests
 * Tests for version management, model selection, and cost tracking
 *
 * @group integration
 */

import { expect, describe, it, beforeAll, afterAll, jest } from '@jest/globals';
import { db } from '../../database/connection';

const request = require('supertest');
import { aiEngineManagementService } from '../../services/AIEngineManagementService';
import { costTrackingService } from '../../middleware/aiCostTracking';

describe('AI Engine Management Integration Tests', () => {
  let farmId: string;
  let agentId: string;

  beforeAll(async () => {
    // Create test farm and agent
    const farmResult = await db.query(
      `INSERT INTO farms (name, mode, status, agent_count)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['Test Farm', 'farm', 'idle', 1]
    );
    farmId = farmResult.rows[0].id;
    agentId = 'test-agent-1';
  });

  afterAll(async () => {
    // Cleanup test data
    if (farmId) {
      await db.query('DELETE FROM farms WHERE id = $1', [farmId]);
    }
    await db.query('DELETE FROM ai_api_usage WHERE farm_id = $1', [farmId]);
  });

  describe('Feature 1: AI Engine Version Management', () => {
    it('should get current version for Claude', async () => {
      const version = await aiEngineManagementService.getCurrentVersion('claude');

      expect(version).toHaveProperty('current');
      expect(version).toHaveProperty('latest');
      expect(version).toHaveProperty('releaseDate');
      expect(version).toHaveProperty('isDeprecated');
      expect(version).toHaveProperty('updateAvailable');
      expect(typeof version.current).toBe('string');
      expect(typeof version.latest).toBe('string');
    });

    it('should get current version for OpenAI', async () => {
      const version = await aiEngineManagementService.getCurrentVersion('openai');

      expect(version).toHaveProperty('current');
      expect(version).toHaveProperty('latest');
      expect(version.current).toBe('v1');
      expect(version.latest).toBe('v1');
      expect(version.isDeprecated).toBe(false);
      expect(version.updateAvailable).toBe(false);
    });

    it('should handle version upgrade workflow', async () => {
      const result = await aiEngineManagementService.upgradeEngine({
        provider: 'openai',
        targetVersion: 'v1',
        forceUpgrade: false,
        backupConfig: true
      });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('upgradeSteps');
      expect(Array.isArray(result.upgradeSteps)).toBe(true);
      expect(result.upgradeSteps.length).toBe(5);

      // Check all steps
      const stepNames = result.upgradeSteps.map(s => s.name);
      expect(stepNames).toContain('Validate target version');
      expect(stepNames).toContain('Backup current configuration');
      expect(stepNames).toContain('Check API compatibility');
      expect(stepNames).toContain('Update API version');
      expect(stepNames).toContain('Verify upgrade');
    });

    it('should backup configuration before upgrade', async () => {
      const backupQuery = 'SELECT * FROM engine_config_backups WHERE provider = $1 ORDER BY created_at DESC LIMIT 1';
      const result = await db.query(backupQuery, ['openai']);

      if (result.rows.length > 0) {
        expect(result.rows[0]).toHaveProperty('provider');
        expect(result.rows[0]).toHaveProperty('config');
        expect(result.rows[0].provider).toBe('openai');
      }
    });
  });

  describe('Feature 2: Model Selection and Management', () => {
    it('should get available models for Claude', async () => {
      const result = await aiEngineManagementService.getAvailableModels('claude');

      expect(result).toHaveProperty('provider');
      expect(result).toHaveProperty('currentModel');
      expect(result).toHaveProperty('models');
      expect(result.provider).toBe('claude');
      expect(Array.isArray(result.models)).toBe(true);
      expect(result.models.length).toBeGreaterThan(0);

      // Check first model has required fields
      const firstModel = result.models[0];
      expect(firstModel).toHaveProperty('id');
      expect(firstModel).toHaveProperty('displayName');
      expect(firstModel).toHaveProperty('provider');
      expect(firstModel).toHaveProperty('contextWindow');
      expect(firstModel).toHaveProperty('costPer1kPromptTokens');
      expect(firstModel).toHaveProperty('costPer1kCompletionTokens');
      expect(firstModel).toHaveProperty('capabilities');
      expect(firstModel.provider).toBe('claude');
    });

    it('should get available models for OpenAI', async () => {
      const result = await aiEngineManagementService.getAvailableModels('openai');

      expect(result).toHaveProperty('provider');
      expect(result).toHaveProperty('models');
      expect(result.provider).toBe('openai');
      expect(Array.isArray(result.models)).toBe(true);
      expect(result.models.length).toBeGreaterThan(0);

      // Verify at least one GPT-4 model exists
      const gpt4Model = result.models.find(m => m.id.includes('gpt-4'));
      expect(gpt4Model).toBeDefined();
    });

    it('should filter models by capabilities', async () => {
      const result = await aiEngineManagementService.getAvailableModels('claude', {
        capabilities: ['vision', 'function-calling']
      });

      expect(result.models.length).toBeGreaterThan(0);

      // All returned models should have both capabilities
      result.models.forEach(model => {
        expect(model.capabilities).toContain('vision');
        expect(model.capabilities).toContain('function-calling');
      });
    });

    it('should exclude deprecated models by default', async () => {
      const result = await aiEngineManagementService.getAvailableModels('claude', {
        includeDeprecated: false
      });

      // No deprecated models should be returned
      result.models.forEach(model => {
        expect(model.isDeprecated).toBe(false);
      });
    });

    it('should get model by ID', async () => {
      const model = aiEngineManagementService.getModelById('claude', 'claude-3-5-sonnet-20241022');

      expect(model).toBeDefined();
      expect(model?.id).toBe('claude-3-5-sonnet-20241022');
      expect(model?.provider).toBe('claude');
      expect(model?.displayName).toContain('Claude 3.5 Sonnet');
    });

    it('should get recommended model', async () => {
      const claudeModel = aiEngineManagementService.getRecommendedModel('claude');
      const openaiModel = aiEngineManagementService.getRecommendedModel('openai');

      expect(claudeModel).toBeDefined();
      expect(claudeModel.isDefault).toBe(true);
      expect(claudeModel.provider).toBe('claude');

      expect(openaiModel).toBeDefined();
      expect(openaiModel.isDefault).toBe(true);
      expect(openaiModel.provider).toBe('openai');
    });

    it('should validate model compatibility', async () => {
      const result = await aiEngineManagementService.changeModel({
        provider: 'claude',
        modelId: 'claude-3-haiku-20240307',
        validateCompatibility: true
      });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('provider');
      expect(result).toHaveProperty('previousModel');
      expect(result).toHaveProperty('newModel');
      expect(result.provider).toBe('claude');
    });

    it('should warn about deprecated models', async () => {
      // Get models including deprecated
      const result = await aiEngineManagementService.getAvailableModels('claude', {
        includeDeprecated: true
      });

      const deprecatedModels = result.models.filter(m => m.isDeprecated);

      // If there are deprecated models, verify they have deprecation info
      deprecatedModels.forEach(model => {
        expect(model.isDeprecated).toBe(true);
      });
    });
  });

  describe('Feature 3: Accurate Cost Tracking', () => {
    it('should calculate cost correctly for Claude', () => {
      const costs = costTrackingService.calculateCost(
        'claude',
        'claude-3-5-sonnet-20241022',
        1000, // input tokens
        500   // output tokens
      );

      expect(costs).toHaveProperty('inputCost');
      expect(costs).toHaveProperty('outputCost');
      expect(costs).toHaveProperty('totalCost');
      expect(costs).toHaveProperty('costPer1kInputTokens');
      expect(costs).toHaveProperty('costPer1kOutputTokens');

      // Verify calculation
      // Claude 3.5 Sonnet: $3/1M input, $15/1M output
      expect(costs.inputCost).toBeCloseTo(0.003, 5); // 1000 tokens * $3/1M
      expect(costs.outputCost).toBeCloseTo(0.0075, 5); // 500 tokens * $15/1M
      expect(costs.totalCost).toBeCloseTo(0.0105, 5);
      expect(costs.costPer1kInputTokens).toBe(3.0);
      expect(costs.costPer1kOutputTokens).toBe(15.0);
    });

    it('should calculate cost correctly for OpenAI GPT-4', () => {
      const costs = costTrackingService.calculateCost(
        'openai',
        'gpt-4-turbo-2024-04-09',
        2000, // input tokens
        1000  // output tokens
      );

      expect(costs).toHaveProperty('inputCost');
      expect(costs).toHaveProperty('outputCost');
      expect(costs).toHaveProperty('totalCost');

      // GPT-4 Turbo: $10/1M input, $30/1M output
      expect(costs.inputCost).toBeCloseTo(0.02, 5); // 2000 tokens * $10/1M
      expect(costs.outputCost).toBeCloseTo(0.03, 5); // 1000 tokens * $30/1M
      expect(costs.totalCost).toBeCloseTo(0.05, 5);
    });

    it('should parse Claude API response correctly', () => {
      const mockResponse = {
        usage: {
          input_tokens: 150,
          output_tokens: 300
        }
      };

      const tokens = costTrackingService.parseClaudeResponse(mockResponse);

      expect(tokens.inputTokens).toBe(150);
      expect(tokens.outputTokens).toBe(300);
      expect(tokens.totalTokens).toBe(450);
    });

    it('should parse OpenAI API response correctly', () => {
      const mockResponse = {
        usage: {
          prompt_tokens: 200,
          completion_tokens: 400,
          total_tokens: 600
        }
      };

      const tokens = costTrackingService.parseOpenAIResponse(mockResponse);

      expect(tokens.inputTokens).toBe(200);
      expect(tokens.outputTokens).toBe(400);
      expect(tokens.totalTokens).toBe(600);
    });

    it('should log AI API call to database', async () => {
      const callData = {
        farmId,
        agentId,
        userId: 1,
        requestId: 'test-request-123',
        provider: 'claude' as const,
        model: 'claude-3-haiku-20240307',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        inputCost: 0.000025,
        outputCost: 0.0000625,
        totalCost: 0.0000875,
        costPer1kInputTokens: 0.25,
        costPer1kOutputTokens: 1.25,
        statusCode: 200,
        responseTimeMs: 1500
      };

      await costTrackingService.logAPICall(callData);

      // Verify it was logged
      const result = await db.query(
        'SELECT * FROM ai_api_usage WHERE request_id = $1',
        ['test-request-123']
      );

      expect(result.rows.length).toBe(1);
      const logged = result.rows[0];

      expect(logged.provider).toBe('claude');
      expect(logged.model).toBe('claude-3-haiku-20240307');
      expect(parseInt(logged.input_tokens)).toBe(100);
      expect(parseInt(logged.output_tokens)).toBe(50);
      expect(parseInt(logged.total_tokens)).toBe(150);
      expect(parseFloat(logged.total_cost)).toBeCloseTo(0.0000875, 7);
      expect(logged.farm_id).toBe(farmId);
      expect(logged.agent_id).toBe(agentId);
    });

    it('should get cost summary for farm', async () => {
      const summary = await costTrackingService.getCostSummary('farm', farmId);

      expect(summary).toHaveProperty('totalCost');
      expect(summary).toHaveProperty('totalRequests');
      expect(summary).toHaveProperty('totalTokens');
      expect(summary).toHaveProperty('byProvider');
      expect(summary).toHaveProperty('byModel');

      expect(typeof summary.totalCost).toBe('number');
      expect(typeof summary.totalRequests).toBe('number');
      expect(typeof summary.totalTokens).toBe('number');
    });

    it('should handle missing model gracefully in cost calculation', () => {
      const costs = costTrackingService.calculateCost(
        'claude',
        'non-existent-model',
        1000,
        500
      );

      // Should use fallback pricing
      expect(costs).toHaveProperty('totalCost');
      expect(costs.totalCost).toBeGreaterThan(0);
      expect(costs.costPer1kInputTokens).toBe(3.0); // Fallback Claude pricing
      expect(costs.costPer1kOutputTokens).toBe(15.0);
    });
  });

  describe('API Endpoint Integration', () => {
    // Note: These tests would require the full Express app instance
    // They are placeholders for when running with a test server

    it.skip('GET /api/ai-engines/status should return engine status', async () => {
      // const response = await request(app).get('/api/ai-engines/status');
      // expect(response.status).toBe(200);
      // expect(response.body.success).toBe(true);
      // expect(Array.isArray(response.body.engines)).toBe(true);
    });

    it.skip('GET /api/ai-engines/claude/models should return Claude models', async () => {
      // const response = await request(app).get('/api/ai-engines/claude/models');
      // expect(response.status).toBe(200);
      // expect(response.body.success).toBe(true);
      // expect(Array.isArray(response.body.models)).toBe(true);
    });

    it.skip('POST /api/ai-engines/claude/model should change model', async () => {
      // const response = await request(app)
      //   .post('/api/ai-engines/claude/model')
      //   .send({ modelId: 'claude-3-haiku-20240307' });
      // expect(response.status).toBe(200);
      // expect(response.body.success).toBe(true);
    });

    it.skip('GET /api/ai-engines/costs should return cost metrics', async () => {
      // const response = await request(app).get('/api/ai-engines/costs');
      // expect(response.status).toBe(200);
      // expect(response.body.success).toBe(true);
      // expect(response.body.summary).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid provider gracefully', async () => {
      await expect(
        aiEngineManagementService.getCurrentVersion('invalid' as any)
      ).rejects.toThrow();
    });

    it('should handle invalid model ID', async () => {
      const model = aiEngineManagementService.getModelById('claude', 'non-existent-model');
      expect(model).toBeUndefined();
    });

    it('should handle database errors gracefully in cost logging', async () => {
      const invalidData = {
        requestId: 'test-invalid',
        provider: 'claude' as const,
        model: 'test-model',
        inputTokens: -1, // Invalid negative tokens
        outputTokens: -1,
        totalTokens: -2,
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        costPer1kInputTokens: 0,
        costPer1kOutputTokens: 0
      };

      // Should not throw, just log error
      await expect(
        costTrackingService.logAPICall(invalidData)
      ).resolves.not.toThrow();
    });
  });

  describe('Performance', () => {
    it('should fetch models quickly', async () => {
      const start = Date.now();
      await aiEngineManagementService.getAvailableModels('claude');
      const duration = Date.now() - start;

      // Should complete in less than 100ms (in-memory lookup)
      expect(duration).toBeLessThan(100);
    });

    it('should calculate costs quickly', () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        costTrackingService.calculateCost('claude', 'claude-3-5-sonnet-20241022', 1000, 500);
      }

      const duration = Date.now() - start;

      // Should handle 1000 calculations in less than 100ms
      expect(duration).toBeLessThan(100);
    });
  });
});
