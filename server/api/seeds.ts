import { Router } from 'express';
import { seedService } from '../services/seedService';
import { logger } from '../utils/logger';
import { SeedCreateInput, SeedUpdateInput, SeedFilter } from '../../src/types/seed';
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

    // Get user ID from auth context
    const userId = req.user?.userId || 'dev-user';
    
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
    
    // Get user ID from auth context
    const userId = req.user?.userId || 'dev-user';
    
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
    // Get user ID from auth context
    const userId = req.user?.userId || 'dev-user';
    
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

    // Get user ID from auth context
    const userId = req.user?.userId || 'dev-user';
    
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

    // Get user ID from auth context
    const userId = req.user?.userId || 'dev-user';
    
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
    const { additionalPrompt } = req.body;

    if (!additionalPrompt || !additionalPrompt.trim()) {
      return res.status(400).json({ 
        error: 'Additional prompt is required' 
      });
    }

    // TODO: Get user ID from auth context
    const userId = 'user-123'; // Placeholder
    
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
    // TODO: Get user ID from auth context for filtering user-specific seeds
    const userId = req.query.userOnly === 'true' ? 'user-123' : undefined;
    
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

export default router;