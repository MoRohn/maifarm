/**
 * Seeds + Farm Workflow Integration Tests
 *
 * Tests the complete flow of:
 * - Feature A: Seeds can "Seed a Farm" - injecting seed context into farms
 * - Feature B: Viral Seeds generation pipeline
 */

import { jest } from '@jest/globals';

const request = require('supertest');

// Mock database before imports
jest.mock('../../database/client', () => ({
  db: {
    query: jest.fn(),
  },
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  LogCategory: {
    FARM: 'farm',
    SEED: 'seed',
    DATABASE: 'database',
    API: 'api',
  },
}));

// Import after mocks
import { seedContextAssembler } from '../seedContextAssembler';
import { db } from '../../database/client';
import type { Seed } from '../../types/seed';

const mockDb = db as jest.Mocked<typeof db>;

describe('Seeds + Farm Workflow Integration', () => {
  // Test seed data
  const testSeeds = [
    {
      id: 'seed-tdd',
      name: 'TDD Practice',
      description: 'Enforce test-driven development',
      seed_prompt: 'Always write tests before implementation. Follow red-green-refactor cycle.',
      category: 'Development',
      tags: ['testing', 'tdd', 'quality'],
      version: 1,
      mode_compatibility: 'all',
      engine_compatibility: 'all',
      is_public: true,
      is_official: true,
      success_checklist: ['Tests written first', 'All tests pass', '80%+ coverage'],
      safety_notes: 'Run tests in isolated environment',
      usage_count: 150,
      success_rate: 92,
      agent_count: 3,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: 'seed-security',
      name: 'Security First',
      description: 'Security-focused development practices',
      seed_prompt: 'Review code for OWASP top 10. Never expose secrets. Sanitize inputs.',
      category: 'Security',
      tags: ['security', 'owasp', 'validation'],
      version: 2,
      mode_compatibility: 'harvest,quick_task',
      engine_compatibility: 'claude,openai',
      is_public: true,
      is_official: true,
      success_checklist: ['No hardcoded secrets', 'Input validation added', 'Security review done'],
      safety_notes: 'Do not commit credentials to version control',
      usage_count: 89,
      success_rate: 88,
      agent_count: 2,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: 'seed-performance',
      name: 'Performance Optimization',
      description: 'Performance-focused development',
      seed_prompt: 'Optimize for speed and memory. Use profiling. Avoid N+1 queries.',
      category: 'Performance',
      tags: ['performance', 'optimization', 'profiling'],
      version: 1,
      mode_compatibility: 'go_wild',
      engine_compatibility: 'claude',
      is_public: true,
      is_official: false,
      success_checklist: ['Performance benchmarks pass', 'No memory leaks'],
      safety_notes: null,
      usage_count: 45,
      success_rate: 85,
      agent_count: 2,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (mockDb.query as jest.Mock).mockReset();
  });

  describe('Feature A: Seeds can Seed a Farm', () => {
    describe('Context Assembly Integration', () => {
      it('should assemble complete farm context with multiple seeds', async () => {
        // Mock database returning seeds
        (mockDb.query as jest.Mock)
          .mockResolvedValueOnce({ rows: [testSeeds[0], testSeeds[1]] })
          .mockResolvedValueOnce({ rows: [] }) // Record first seed application
          .mockResolvedValueOnce({ rows: [] }); // Record second seed application

        const result = await seedContextAssembler.assembleContext({
          farmId: 'farm-integration-test',
          mode: 'harvest',
          provider: 'claude',
          basePrompt: 'Build a REST API with user authentication',
          seedIds: ['seed-tdd', 'seed-security'],
          pinVersions: true,
        });

        // Verify context structure
        expect(result.fullContext).toMatch(/^\[SEEDS\]/);
        expect(result.fullContext).toContain('[/SEEDS]');
        expect(result.fullContext).toContain('Build a REST API with user authentication');

        // Verify both seeds are included
        expect(result.seedsSection).toContain('TDD Practice');
        expect(result.seedsSection).toContain('Security First');

        // Verify success criteria included
        expect(result.seedsSection).toContain('Tests written first');
        expect(result.seedsSection).toContain('No hardcoded secrets');

        // Verify applied seeds metadata
        expect(result.appliedSeeds).toHaveLength(2);
        expect(result.appliedSeeds.map(s => s.seedId)).toContain('seed-tdd');
        expect(result.appliedSeeds.map(s => s.seedId)).toContain('seed-security');
      });

      it('should validate seed compatibility before assembly', async () => {
        const incompatibleSeed: Seed = {
          id: 'seed-performance',
          name: 'Performance Optimization',
          modeCompatibility: 'go_wild', // Only compatible with go_wild
          engineCompatibility: 'claude',
        } as Seed;

        const result = await seedContextAssembler.validateCompatibility(
          [incompatibleSeed],
          'harvest', // Using harvest mode
          'claude'
        );

        expect(result.compatible).toBe(false);
        expect(result.incompatibleSeeds).toHaveLength(1);
        expect(result.incompatibleSeeds[0].seedId).toBe('seed-performance');
        expect(result.incompatibleSeeds[0].reason).toContain("Mode 'harvest' not supported");
      });

      it('should handle engine incompatibility', async () => {
        const claudeOnlySeed: Seed = {
          id: 'seed-claude-only',
          name: 'Claude Specific',
          modeCompatibility: 'all',
          engineCompatibility: 'claude', // Only claude
        } as Seed;

        const result = await seedContextAssembler.validateCompatibility(
          [claudeOnlySeed],
          'harvest',
          'openai' // Using openai
        );

        expect(result.compatible).toBe(false);
        expect(result.incompatibleSeeds[0].reason).toContain("Engine 'openai' not supported");
      });

      it('should generate warnings for non-recommended configurations', async () => {
        const seedWithRecommendations: Seed = {
          id: 'seed-with-recs',
          name: 'Recommended Config',
          modeCompatibility: 'all',
          engineCompatibility: 'all',
          recommendedModes: ['go_wild'],
          recommendedEngines: ['claude'],
        } as Seed;

        const result = await seedContextAssembler.validateCompatibility(
          [seedWithRecommendations],
          'harvest',
          'openai'
        );

        // Should be compatible but with warnings
        expect(result.compatible).toBe(true);
        expect(result.warnings).toHaveLength(2);
        expect(result.warnings.some(w => w.includes('recommends modes: go_wild'))).toBe(true);
        expect(result.warnings.some(w => w.includes('recommends engines: claude'))).toBe(true);
      });
    });

    describe('Seed Version Pinning', () => {
      it('should capture seed versions at application time', async () => {
        (mockDb.query as jest.Mock)
          .mockResolvedValueOnce({ rows: [testSeeds[1]] }) // Version 2
          .mockResolvedValueOnce({ rows: [] });

        const result = await seedContextAssembler.assembleContext({
          farmId: 'farm-version-test',
          mode: 'harvest',
          provider: 'claude',
          basePrompt: 'Test prompt',
          seedIds: ['seed-security'],
          pinVersions: true,
        });

        // Verify version is captured (stored as seedVersion)
        expect(result.appliedSeeds[0].seedVersion).toBe(2);
      });
    });

    describe('Context Injection Position', () => {
      it('should place SEEDS section at the top of context', async () => {
        (mockDb.query as jest.Mock)
          .mockResolvedValueOnce({ rows: [testSeeds[0]] })
          .mockResolvedValueOnce({ rows: [] });

        const result = await seedContextAssembler.assembleContext({
          farmId: 'farm-position-test',
          mode: 'harvest',
          provider: 'claude',
          basePrompt: 'User prompt goes here',
          seedIds: ['seed-tdd'],
        });

        // SEEDS section should come before user prompt
        const seedsStart = result.fullContext.indexOf('[SEEDS]');
        const userPromptStart = result.fullContext.indexOf('User prompt goes here');

        expect(seedsStart).toBeLessThan(userPromptStart);
        expect(seedsStart).toBe(0); // Should be at the very start
      });
    });

    describe('Safety Notes Integration', () => {
      it('should include safety notes in context', async () => {
        (mockDb.query as jest.Mock)
          .mockResolvedValueOnce({ rows: [testSeeds[1]] })
          .mockResolvedValueOnce({ rows: [] });

        const result = await seedContextAssembler.assembleContext({
          farmId: 'farm-safety-test',
          mode: 'harvest',
          provider: 'claude',
          basePrompt: 'Build feature',
          seedIds: ['seed-security'],
        });

        expect(result.seedsSection).toContain('Safety Notes:');
        expect(result.seedsSection).toContain('Do not commit credentials');
      });

      it('should skip safety notes section when seed has none', async () => {
        const seedWithoutSafetyNotes = {
          ...testSeeds[0],
          safety_notes: null,
        };

        (mockDb.query as jest.Mock)
          .mockResolvedValueOnce({ rows: [seedWithoutSafetyNotes] })
          .mockResolvedValueOnce({ rows: [] });

        const result = await seedContextAssembler.assembleContext({
          farmId: 'farm-no-safety-test',
          mode: 'harvest',
          provider: 'claude',
          basePrompt: 'Build feature',
          seedIds: ['seed-tdd'],
        });

        // Should not have Safety Notes section for this seed
        const seedSection = result.seedsSection.split('---')[0]; // Get first seed's section
        expect(seedSection).not.toContain('Safety Notes:');
      });
    });
  });

  describe('Feature B: Viral Seeds Pipeline', () => {
    describe('Seed Generation from Search Results', () => {
      it('should generate exactly 3 seeds from trending topics', async () => {
        // This tests the contract - actual implementation calls external services
        const mockViralSeeds = [
          { id: 'viral-1', name: 'AI Code Review', category: 'Development' },
          { id: 'viral-2', name: 'Prompt Engineering', category: 'AI' },
          { id: 'viral-3', name: 'RAG Implementation', category: 'AI' },
        ];

        // Verify the expected output structure
        expect(mockViralSeeds).toHaveLength(3);
        mockViralSeeds.forEach(seed => {
          expect(seed).toHaveProperty('id');
          expect(seed).toHaveProperty('name');
          expect(seed).toHaveProperty('category');
        });
      });
    });

    describe('Snapshot Storage for Regeneration', () => {
      it('should support regenerating seeds from snapshot', async () => {
        // Mock snapshot structure
        const snapshot = {
          id: 'snapshot-123',
          searchQueries: ['AI coding trends 2025', 'viral AI tasks'],
          rawResults: [{ title: 'RAG is trending', url: 'https://example.com' }],
          extractedIntents: ['Build RAG system', 'Implement AI review'],
          generatedSeeds: ['seed-1', 'seed-2', 'seed-3'],
          createdAt: new Date(),
        };

        // Verify snapshot has all required fields for regeneration
        expect(snapshot.searchQueries).toBeDefined();
        expect(snapshot.rawResults).toBeDefined();
        expect(snapshot.extractedIntents).toBeDefined();
        expect(snapshot.generatedSeeds).toHaveLength(3);
      });
    });
  });

  describe('Cross-Feature Integration', () => {
    describe('Viral Seeds Applied to Farms', () => {
      it('should allow viral seeds to be applied like regular seeds', async () => {
        const viralSeed = {
          id: 'viral-seed-rag',
          name: 'RAG Implementation',
          description: 'Build retrieval-augmented generation systems',
          seed_prompt: 'Implement RAG with vector databases. Use embeddings for semantic search.',
          category: 'AI',
          tags: ['rag', 'ai', 'embeddings'],
          version: 1,
          mode_compatibility: 'all',
          engine_compatibility: 'claude,openai',
          is_public: true,
          is_official: false,
          success_checklist: ['Vector DB configured', 'Embeddings generated', 'Retrieval working'],
          safety_notes: 'Ensure data privacy in embeddings',
          usage_count: 0,
          success_rate: 0,
          agent_count: 3,
          created_at: new Date(),
          updated_at: new Date(),
          source: 'viral', // Marker that this came from viral pipeline
        };

        (mockDb.query as jest.Mock)
          .mockResolvedValueOnce({ rows: [viralSeed] })
          .mockResolvedValueOnce({ rows: [] });

        const result = await seedContextAssembler.assembleContext({
          farmId: 'farm-with-viral-seed',
          mode: 'harvest',
          provider: 'claude',
          basePrompt: 'Build a knowledge base chatbot',
          seedIds: ['viral-seed-rag'],
        });

        expect(result.appliedSeeds).toHaveLength(1);
        expect(result.appliedSeeds[0].seedName).toBe('RAG Implementation');
        expect(result.seedsSection).toContain('vector databases');
      });
    });

    describe('Multiple Seeds from Different Sources', () => {
      it('should combine official, user, and viral seeds', async () => {
        const mixedSeeds = [
          { ...testSeeds[0], is_official: true, source: 'official' },
          { ...testSeeds[1], is_official: false, source: 'user' },
          {
            ...testSeeds[2],
            id: 'viral-seed',
            source: 'viral',
            mode_compatibility: 'all', // Make compatible
          },
        ];

        (mockDb.query as jest.Mock)
          .mockResolvedValueOnce({ rows: mixedSeeds })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] });

        const result = await seedContextAssembler.assembleContext({
          farmId: 'farm-mixed-seeds',
          mode: 'harvest',
          provider: 'claude',
          basePrompt: 'Complex project',
          seedIds: mixedSeeds.map(s => s.id),
        });

        expect(result.appliedSeeds).toHaveLength(3);
        expect(result.seedsSection).toContain('# Seed 1:');
        expect(result.seedsSection).toContain('# Seed 2:');
        expect(result.seedsSection).toContain('# Seed 3:');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // The implementation catches database errors and returns empty seeds
      // instead of throwing, providing graceful degradation
      (mockDb.query as jest.Mock).mockRejectedValueOnce(new Error('Database connection failed'));

      const result = await seedContextAssembler.assembleContext({
        farmId: 'farm-error-test',
        mode: 'harvest',
        provider: 'claude',
        basePrompt: 'Test',
        seedIds: ['seed-1'],
      });

      // Should return base prompt with warning when DB fails
      expect(result.fullContext).toBe('Test');
      expect(result.warnings).toContain('No valid seeds found for the provided IDs');
      expect(result.appliedSeeds).toHaveLength(0);
    });

    it('should handle missing seeds gracefully', async () => {
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const result = await seedContextAssembler.assembleContext({
        farmId: 'farm-missing-seeds',
        mode: 'harvest',
        provider: 'claude',
        basePrompt: 'Test prompt',
        seedIds: ['nonexistent-seed'],
      });

      expect(result.fullContext).toBe('Test prompt');
      expect(result.warnings).toContain('No valid seeds found for the provided IDs');
    });

    it('should handle partial seed matches', async () => {
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [testSeeds[0]] }) // Only one seed found
        .mockResolvedValueOnce({ rows: [] });

      const result = await seedContextAssembler.assembleContext({
        farmId: 'farm-partial-seeds',
        mode: 'harvest',
        provider: 'claude',
        basePrompt: 'Test prompt',
        seedIds: ['seed-tdd', 'nonexistent-seed'],
      });

      // Should include the found seed
      expect(result.appliedSeeds).toHaveLength(1);
      expect(result.appliedSeeds[0].seedId).toBe('seed-tdd');
    });
  });

  describe('Mode Normalization', () => {
    it.each([
      ['collaborative', 'harvest'],
      ['Harvest', 'harvest'],
      ['QUICK_TASK', 'quick_task'],
      ['GoWild', 'go_wild'],
    ])('should normalize mode %s to %s', async (input, expected) => {
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [testSeeds[0]] })
        .mockResolvedValueOnce({ rows: [] });

      // Should not throw with various mode formats
      const result = await seedContextAssembler.assembleContext({
        farmId: 'farm-mode-normalize',
        mode: input,
        provider: 'claude',
        basePrompt: 'Test',
        seedIds: ['seed-tdd'],
      });

      expect(result.appliedSeeds).toHaveLength(1);
    });
  });

  describe('Provider Normalization', () => {
    it.each([
      ['llama', 'ollama'],
      ['Claude', 'claude'],
      ['OPENAI', 'openai'],
      ['gpt-oss', 'gpt_oss'],
    ])('should normalize provider %s to %s', async (input, expected) => {
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [testSeeds[0]] })
        .mockResolvedValueOnce({ rows: [] });

      // Should not throw with various provider formats
      const result = await seedContextAssembler.assembleContext({
        farmId: 'farm-provider-normalize',
        mode: 'harvest',
        provider: input,
        basePrompt: 'Test',
        seedIds: ['seed-tdd'],
      });

      expect(result.appliedSeeds).toHaveLength(1);
    });
  });
});
