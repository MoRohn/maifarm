import { Router } from 'express';
import { seedService } from '../services/seedService';
import { enhancedSeedService } from '../services/enhancedSeedService';
import { viralSeedsService } from '../services/viralSeedsService';
import { seedContextAssembler } from '../services/seedContextAssembler';
import { logger, LogCategory } from '../utils/logger';
import {
  SeedCreateInput,
  SeedUpdateInput,
  SeedFilter,
  FarmModeType,
  AIEngineType,
  ViralSeedGenerationConfig
} from '../../src/types/seed';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all seeds
router.get('/', async (req, res) => {
  try {
    const filter: SeedFilter = {
      category: req.query.category as string,
      farmType: req.query.farmType as string,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      search: req.query.search as string,
      isPublic: req.query.isPublic === 'true' ? true : req.query.isPublic === 'false' ? false : undefined,
      isOfficial: req.query.isOfficial === 'true' ? true : req.query.isOfficial === 'false' ? false : undefined,
      sortBy: req.query.sortBy as SeedFilter['sortBy'],
      sortOrder: req.query.sortOrder as SeedFilter['sortOrder'],
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined
    };

    const seeds = await seedService.findAll(filter);
    res.json(seeds);
  } catch (error) {
    logger.error('Failed to get seeds:', error);
    res.status(500).json({ error: 'Failed to retrieve seeds' });
  }
});

// Get seed by ID
router.get('/:id', async (req, res) => {
  try {
    const seed = await seedService.findById(req.params.id);
    if (!seed) {
      return res.status(404).json({ error: 'Seed not found' });
    }
    res.json(seed);
  } catch (error) {
    logger.error('Failed to get seed:', error);
    res.status(500).json({ error: 'Failed to retrieve seed' });
  }
});

// Create new seed
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const input: SeedCreateInput = req.body;
    
    // Validate required fields
    if (!input.name || !input.description || !input.yaml || !input.farmType) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, description, yaml, farmType' 
      });
    }

    // Get user ID from auth context or use development bypass
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const seed = await seedService.create(input, userId);
    res.status(201).json(seed);
  } catch (error) {
    logger.error('Failed to create seed:', error);
    res.status(500).json({ error: 'Failed to create seed' });
  }
});

// Update seed
router.put('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const input: SeedUpdateInput = req.body;
    
    // Get user ID from auth context or use development bypass
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const seed = await seedService.update(req.params.id, input, userId);
    res.json(seed);
  } catch (error) {
    logger.error('Failed to update seed:', error);
    if ((error as Error).message === 'Seed not found') {
      res.status(404).json({ error: 'Seed not found' });
    } else if ((error as Error).message === 'Cannot modify official seeds') {
      res.status(403).json({ error: 'Cannot modify official seeds' });
    } else {
      res.status(500).json({ error: 'Failed to update seed' });
    }
  }
});

// Delete seed
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    // Get user ID from auth context or use development bypass
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    await seedService.delete(req.params.id, userId);
    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete seed:', error);
    if ((error as Error).message === 'Seed not found') {
      res.status(404).json({ error: 'Seed not found' });
    } else if ((error as Error).message === 'Cannot delete this seed') {
      res.status(403).json({ error: 'Cannot delete this seed' });
    } else {
      res.status(500).json({ error: 'Failed to delete seed' });
    }
  }
});

// Use seed (increment usage count)
router.post('/:id/use', async (req, res) => {
  try {
    const seed = await seedService.use(req.params.id);
    res.json(seed);
  } catch (error) {
    logger.error('Failed to use seed:', error);
    if ((error as Error).message === 'Seed not found') {
      res.status(404).json({ error: 'Seed not found' });
    } else {
      res.status(500).json({ error: 'Failed to use seed' });
    }
  }
});

// Create seed from harvest (Harvest Completion Dashboard)
router.post('/from-harvest/:harvestId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { harvestId } = req.params;
    const input = req.body as {
      name: string;
      description?: string;
      additionalPrompt?: string;
      category?: string;
      tags?: string[];
      isPublic?: boolean;
    };

    // Validate required fields
    if (!input.name || !input.name.trim()) {
      return res.status(400).json({ 
        error: 'Name is required' 
      });
    }

    // Get user ID from auth context or use development bypass
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const seed = await seedService.createFromHarvest(harvestId, input, userId);
    res.status(201).json({ success: true, data: seed });
  } catch (error) {
    logger.error('Failed to create seed from harvest:', error);
    if ((error as Error).message === 'Harvest not found') {
      res.status(404).json({ error: 'Harvest not found' });
    } else {
      res.status(500).json({ error: 'Failed to create seed from harvest' });
    }
  }
});

// Create seed from barn harvest
router.post('/from-barn-harvest/:harvestId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { harvestId } = req.params;
    const input = req.body as {
      name: string;
      description?: string;
      additionalPrompt?: string;
      category?: string;
      tags?: string[];
      isPublic?: boolean;
    };

    // Validate required fields
    if (!input.name || !input.name.trim()) {
      return res.status(400).json({ 
        error: 'Name is required' 
      });
    }

    // Get user ID from auth context or use development bypass
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const seed = await seedService.createFromBarnHarvest(harvestId, input, userId);
    res.status(201).json({ success: true, data: seed });
  } catch (error) {
    logger.error('Failed to create seed from barn harvest:', error);
    if ((error as Error).message === 'Harvest not found') {
      res.status(404).json({ error: 'Harvest not found' });
    } else {
      res.status(500).json({ error: 'Failed to create seed from barn harvest' });
    }
  }
});

// Enhance seed with additional prompt
router.put('/:id/enhance-prompt', async (req, res) => {
  try {
    const { id } = req.params;
    const authReq = req as AuthRequest;
    const { additionalPrompt } = req.body;

    if (!additionalPrompt || !additionalPrompt.trim()) {
      return res.status(400).json({
        error: 'Additional prompt is required'
      });
    }

    // Get user ID from auth context (use guest ID if not authenticated)
    const userId = authReq.user?.userId || authReq.user?.id || 'guest';

    const seed = await seedService.enhancePrompt(id, additionalPrompt, userId);
    res.json({ success: true, data: seed });
  } catch (error) {
    logger.error('Failed to enhance seed prompt:', error);
    if ((error as Error).message === 'Seed not found') {
      res.status(404).json({ error: 'Seed not found' });
    } else if ((error as Error).message === 'Cannot modify this seed') {
      res.status(403).json({ error: 'Cannot modify this seed' });
    } else {
      res.status(500).json({ error: 'Failed to enhance seed prompt' });
    }
  }
});

// Get harvest-derived seeds
router.get('/harvest-derived', async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    // Get user ID from auth context for filtering user-specific seeds
    const userId = req.query.userOnly === 'true'
      ? (authReq.user?.userId || authReq.user?.id || 'guest')
      : undefined;

    const seeds = await seedService.findHarvestDerivedSeeds(userId);
    res.json({ success: true, data: seeds });
  } catch (error) {
    logger.error('Failed to get harvest-derived seeds:', error);
    res.status(500).json({ error: 'Failed to retrieve harvest-derived seeds' });
  }
});

// Get seed categories
router.get('/meta/categories', async (req, res) => {
  try {
    const categories = await seedService.getCategories();
    res.json(categories);
  } catch (error) {
    logger.error('Failed to get categories:', error);
    res.status(500).json({ error: 'Failed to retrieve categories' });
  }
});

// ============================================
// SEEDS ENHANCEMENT ENDPOINTS (Feature A)
// ============================================

// Apply seeds to a farm
router.post('/apply-to-farm', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { farmId, seedIds, pinVersions } = req.body;

    if (!farmId) {
      return res.status(400).json({ error: 'farmId is required' });
    }
    if (!seedIds || !Array.isArray(seedIds) || seedIds.length === 0) {
      return res.status(400).json({ error: 'seedIds array is required' });
    }

    const result = await enhancedSeedService.applyToFarm({
      farmId,
      seedIds,
      pinVersions: pinVersions ?? true
    });

    if (!result.success) {
      return res.status(400).json({
        error: result.error,
        warnings: result.warnings
      });
    }

    res.json({
      success: true,
      appliedCount: result.appliedCount,
      warnings: result.warnings
    });
  } catch (error) {
    logger.error(LogCategory.SEED, 'Failed to apply seeds to farm:', error);
    res.status(500).json({ error: 'Failed to apply seeds to farm' });
  }
});

// Validate seed compatibility with mode and engine
router.post('/validate-compatibility', async (req, res) => {
  try {
    const { seedIds, mode, engine } = req.body;

    if (!seedIds || !Array.isArray(seedIds)) {
      return res.status(400).json({ error: 'seedIds array is required' });
    }
    if (!mode) {
      return res.status(400).json({ error: 'mode is required' });
    }
    if (!engine) {
      return res.status(400).json({ error: 'engine is required' });
    }

    const result = await enhancedSeedService.validateCompatibility(
      seedIds,
      mode as FarmModeType,
      engine as AIEngineType
    );

    res.json(result);
  } catch (error) {
    logger.error(LogCategory.SEED, 'Failed to validate compatibility:', error);
    res.status(500).json({ error: 'Failed to validate compatibility' });
  }
});

// Get applied seeds for a farm
router.get('/farm/:farmId/applied', async (req, res) => {
  try {
    const { farmId } = req.params;
    const seeds = await seedContextAssembler.getAppliedSeeds(farmId);
    res.json({ success: true, seeds });
  } catch (error) {
    logger.error(LogCategory.SEED, 'Failed to get applied seeds:', error);
    res.status(500).json({ error: 'Failed to get applied seeds' });
  }
});

// ============================================
// VIRAL SEEDS ENDPOINTS (Feature B)
// ============================================

// Generate viral seeds
router.post('/viral/generate', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if pipeline is already running
    if (viralSeedsService.isPipelineRunning()) {
      return res.status(409).json({
        error: 'Viral seeds pipeline is already running',
        message: 'Please wait for the current generation to complete'
      });
    }

    const config: ViralSeedGenerationConfig = {
      searchQueries: req.body.searchQueries,
      searchProvider: req.body.searchProvider || 'websearch',
      maxResultsPerQuery: req.body.maxResultsPerQuery || 5,
      includeCategories: req.body.includeCategories,
      excludeCategories: req.body.excludeCategories,
      creativityLevel: req.body.creativityLevel || 0.7,
      snapshotId: req.body.snapshotId  // For regeneration from snapshot
    };

    logger.info(LogCategory.SEED, `Starting viral seeds generation for user ${userId}`);

    const result = await viralSeedsService.runPipeline(config, userId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        snapshotId: result.snapshotId,
        snapshotMeta: result.snapshotMeta
      });
    }

    res.json({
      success: true,
      seeds: result.seeds,
      snapshotId: result.snapshotId,
      snapshotMeta: result.snapshotMeta
    });
  } catch (error) {
    logger.error(LogCategory.SEED, 'Viral seeds generation failed:', error);
    res.status(500).json({ error: 'Failed to generate viral seeds' });
  }
});

// Regenerate viral seeds from snapshot
router.post('/viral/regenerate/:snapshotId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { snapshotId } = req.params;

    if (viralSeedsService.isPipelineRunning()) {
      return res.status(409).json({
        error: 'Viral seeds pipeline is already running'
      });
    }

    logger.info(LogCategory.SEED, `Regenerating seeds from snapshot ${snapshotId}`);

    const result = await viralSeedsService.regenerateFromSnapshot(snapshotId, userId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      seeds: result.seeds,
      snapshotId: result.snapshotId,
      snapshotMeta: result.snapshotMeta
    });
  } catch (error) {
    logger.error(LogCategory.SEED, 'Viral seeds regeneration failed:', error);
    res.status(500).json({ error: 'Failed to regenerate viral seeds' });
  }
});

// Get viral seeds snapshots
router.get('/viral/snapshots', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const limit = parseInt(req.query.limit as string, 10) || 10;
    const snapshots = await viralSeedsService.getRecentSnapshots(userId, limit);

    res.json({ success: true, snapshots });
  } catch (error) {
    logger.error(LogCategory.SEED, 'Failed to get snapshots:', error);
    res.status(500).json({ error: 'Failed to get snapshots' });
  }
});

// Check viral seeds pipeline status
router.get('/viral/status', (req, res) => {
  res.json({
    isRunning: viralSeedsService.isPipelineRunning()
  });
});

export default router;