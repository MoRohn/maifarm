/**
 * Unit Tests for SeedContextAssembler
 *
 * Tests the canonical service for assembling Seeds into farm context.
 * Feature A: Seeds can "Seed a Farm"
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { Seed, FarmModeType, AIEngineType, SeedCompatibilityResult } from '../../types/seed';

// Mock the database
jest.mock('../../database/client', () => ({
  db: {
    query: jest.fn(),
  },
}));

// Mock the logger
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
  },
}));

// Import after mocks
import { seedContextAssembler, AssembledContext, ContextAssemblyOptions } from '../seedContextAssembler';
import { db } from '../../database/client';

const mockDb = db as jest.Mocked<typeof db>;

describe('SeedContextAssembler', () => {
  const mockSeed: Partial<Seed> = {
    id: 'seed-1',
    name: 'Test Seed',
    description: 'A test seed for unit testing',
    seedPrompt: 'Follow test-driven development practices.',
    category: 'Development',
    tags: ['test', 'tdd'],
    version: 1,
    modeCompatibility: 'all',
    engineCompatibility: 'all',
    isPublic: true,
    isOfficial: false,
    successChecklist: ['Write tests first', 'Ensure coverage'],
    safetyNotes: 'Always run tests before committing',
  };

  const mockDbRow = {
    id: 'seed-1',
    name: 'Test Seed',
    description: 'A test seed for unit testing',
    seed_prompt: 'Follow test-driven development practices.',
    category: 'Development',
    tags: ['test', 'tdd'],
    version: 1,
    mode_compatibility: 'all',
    engine_compatibility: 'all',
    is_public: true,
    is_official: false,
    success_checklist: ['Write tests first', 'Ensure coverage'],
    safety_notes: 'Always run tests before committing',
    usage_count: 10,
    success_rate: 95,
    agent_count: 2,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (mockDb.query as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('assembleContext', () => {
    it('should return base prompt when no seeds provided', async () => {
      const options: ContextAssemblyOptions = {
        farmId: 'farm-1',
        mode: 'harvest',
        provider: 'claude',
        basePrompt: 'Build a todo app',
        seedIds: [],
      };

      const result = await seedContextAssembler.assembleContext(options);

      expect(result.fullContext).toBe('Build a todo app');
      expect(result.seedsSection).toBe('');
      expect(result.appliedSeeds).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should return base prompt when seedIds is undefined', async () => {
      const options: ContextAssemblyOptions = {
        farmId: 'farm-1',
        mode: 'harvest',
        provider: 'claude',
        basePrompt: 'Build a todo app',
      };

      const result = await seedContextAssembler.assembleContext(options);

      expect(result.fullContext).toBe('Build a todo app');
      expect(result.seedsSection).toBe('');
      expect(result.appliedSeeds).toHaveLength(0);
    });

    it('should assemble context with seeds section at top', async () => {
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockDbRow] }) // fetchSeeds
        .mockResolvedValueOnce({ rows: [] }); // recordSeedApplication

      const options: ContextAssemblyOptions = {
        farmId: 'farm-1',
        mode: 'harvest',
        provider: 'claude',
        basePrompt: 'Build a todo app',
        seedIds: ['seed-1'],
      };

      const result = await seedContextAssembler.assembleContext(options);

      expect(result.fullContext).toContain('[SEEDS]');
      expect(result.fullContext).toContain('[/SEEDS]');
      expect(result.fullContext).toContain('Test Seed');
      expect(result.fullContext).toContain('Build a todo app');
      expect(result.seedsSection).toContain('[SEEDS]');
      expect(result.appliedSeeds).toHaveLength(1);
      expect(result.appliedSeeds[0].seedName).toBe('Test Seed');
    });

    it('should include success checklist in seeds section', async () => {
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockDbRow] })
        .mockResolvedValueOnce({ rows: [] });

      const options: ContextAssemblyOptions = {
        farmId: 'farm-1',
        mode: 'harvest',
        provider: 'claude',
        basePrompt: 'Build a todo app',
        seedIds: ['seed-1'],
      };

      const result = await seedContextAssembler.assembleContext(options);

      expect(result.seedsSection).toContain('Success Criteria:');
      expect(result.seedsSection).toContain('Write tests first');
      expect(result.seedsSection).toContain('Ensure coverage');
    });

    it('should include safety notes in seeds section', async () => {
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockDbRow] })
        .mockResolvedValueOnce({ rows: [] });

      const options: ContextAssemblyOptions = {
        farmId: 'farm-1',
        mode: 'harvest',
        provider: 'claude',
        basePrompt: 'Build a todo app',
        seedIds: ['seed-1'],
      };

      const result = await seedContextAssembler.assembleContext(options);

      expect(result.seedsSection).toContain('Safety Notes:');
      expect(result.seedsSection).toContain('Always run tests before committing');
    });

    it('should warn when no valid seeds found', async () => {
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const options: ContextAssemblyOptions = {
        farmId: 'farm-1',
        mode: 'harvest',
        provider: 'claude',
        basePrompt: 'Build a todo app',
        seedIds: ['nonexistent-seed'],
      };

      const result = await seedContextAssembler.assembleContext(options);

      expect(result.fullContext).toBe('Build a todo app');
      expect(result.warnings).toContain('No valid seeds found for the provided IDs');
    });
  });

  describe('validateCompatibility', () => {
    const testSeeds: Seed[] = [
      {
        ...mockSeed,
        id: 'seed-1',
        modeCompatibility: 'harvest,quick_task',
        engineCompatibility: 'claude,openai',
      } as Seed,
      {
        ...mockSeed,
        id: 'seed-2',
        modeCompatibility: 'go_wild',
        engineCompatibility: 'claude',
      } as Seed,
    ];

    it('should return compatible for all-compatible seeds', async () => {
      const seeds: Seed[] = [{
        ...mockSeed,
        id: 'seed-1',
        modeCompatibility: 'all',
        engineCompatibility: 'all',
      } as Seed];

      const result = await seedContextAssembler.validateCompatibility(
        seeds,
        'harvest' as FarmModeType,
        'claude' as AIEngineType
      );

      expect(result.compatible).toBe(true);
      expect(result.incompatibleSeeds).toHaveLength(0);
    });

    it('should detect mode incompatibility', async () => {
      const seeds: Seed[] = [{
        ...mockSeed,
        id: 'seed-1',
        modeCompatibility: 'go_wild',
        engineCompatibility: 'all',
      } as Seed];

      const result = await seedContextAssembler.validateCompatibility(
        seeds,
        'harvest' as FarmModeType,
        'claude' as AIEngineType
      );

      expect(result.compatible).toBe(false);
      expect(result.incompatibleSeeds).toHaveLength(1);
      expect(result.incompatibleSeeds[0].seedId).toBe('seed-1');
      expect(result.incompatibleSeeds[0].reason).toContain("Mode 'harvest' not supported");
    });

    it('should detect engine incompatibility', async () => {
      const seeds: Seed[] = [{
        ...mockSeed,
        id: 'seed-1',
        modeCompatibility: 'all',
        engineCompatibility: 'openai',
      } as Seed];

      const result = await seedContextAssembler.validateCompatibility(
        seeds,
        'harvest' as FarmModeType,
        'claude' as AIEngineType
      );

      expect(result.compatible).toBe(false);
      expect(result.incompatibleSeeds).toHaveLength(1);
      expect(result.incompatibleSeeds[0].reason).toContain("Engine 'claude' not supported");
    });

    it('should generate warnings for non-recommended modes', async () => {
      const seeds: Seed[] = [{
        ...mockSeed,
        id: 'seed-1',
        modeCompatibility: 'all',
        engineCompatibility: 'all',
        recommendedModes: ['go_wild' as FarmModeType],
      } as Seed];

      const result = await seedContextAssembler.validateCompatibility(
        seeds,
        'harvest' as FarmModeType,
        'claude' as AIEngineType
      );

      expect(result.compatible).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('recommends modes: go_wild');
    });

    it('should generate warnings for non-recommended engines', async () => {
      const seeds: Seed[] = [{
        ...mockSeed,
        id: 'seed-1',
        modeCompatibility: 'all',
        engineCompatibility: 'all',
        recommendedEngines: ['openai' as AIEngineType],
      } as Seed];

      const result = await seedContextAssembler.validateCompatibility(
        seeds,
        'harvest' as FarmModeType,
        'claude' as AIEngineType
      );

      expect(result.compatible).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('recommends engines: openai');
    });
  });

  describe('buildSeedsSection', () => {
    it('should build properly formatted seeds section', async () => {
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockDbRow] })
        .mockResolvedValueOnce({ rows: [] });

      const options: ContextAssemblyOptions = {
        farmId: 'farm-1',
        mode: 'harvest',
        provider: 'claude',
        basePrompt: 'Build a todo app',
        seedIds: ['seed-1'],
      };

      const result = await seedContextAssembler.assembleContext(options);

      // Check structure
      expect(result.seedsSection).toMatch(/^\[SEEDS\]/);
      expect(result.seedsSection).toMatch(/\[\/SEEDS\]$/);
      expect(result.seedsSection).toContain('# Seed 1: Test Seed');
      expect(result.seedsSection).toContain('# Category: Development');
    });

    it('should separate multiple seeds with dividers', async () => {
      const secondSeed = {
        ...mockDbRow,
        id: 'seed-2',
        name: 'Second Seed',
        seed_prompt: 'Another test prompt',
      };

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockDbRow, secondSeed] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const options: ContextAssemblyOptions = {
        farmId: 'farm-1',
        mode: 'harvest',
        provider: 'claude',
        basePrompt: 'Build a todo app',
        seedIds: ['seed-1', 'seed-2'],
      };

      const result = await seedContextAssembler.assembleContext(options);

      expect(result.seedsSection).toContain('# Seed 1: Test Seed');
      expect(result.seedsSection).toContain('# Seed 2: Second Seed');
      expect(result.seedsSection).toContain('---');
      expect(result.appliedSeeds).toHaveLength(2);
    });
  });

  describe('mode and provider normalization', () => {
    it('should normalize collaborative mode to harvest', async () => {
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockDbRow] })
        .mockResolvedValueOnce({ rows: [] });

      const options: ContextAssemblyOptions = {
        farmId: 'farm-1',
        mode: 'collaborative',
        provider: 'claude',
        basePrompt: 'Build a todo app',
        seedIds: ['seed-1'],
      };

      // Should not throw
      const result = await seedContextAssembler.assembleContext(options);
      expect(result.appliedSeeds).toHaveLength(1);
    });

    it('should normalize llama provider to ollama', async () => {
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockDbRow] })
        .mockResolvedValueOnce({ rows: [] });

      const options: ContextAssemblyOptions = {
        farmId: 'farm-1',
        mode: 'harvest',
        provider: 'llama',
        basePrompt: 'Build a todo app',
        seedIds: ['seed-1'],
      };

      // Should not throw
      const result = await seedContextAssembler.assembleContext(options);
      expect(result.appliedSeeds).toHaveLength(1);
    });
  });
});
