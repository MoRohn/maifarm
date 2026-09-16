import { Router, Response } from 'express';
import { seedManager } from '../services/seedManager';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { SeedCreateInput, SeedUpdateInput } from '../types/seed';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get all seeds available to the user
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';
    const includePublic = req.query.includePublic !== 'false';
    
    const seeds = await seedManager.getUserSeeds(userId, includePublic);

    res.json({
      success: true,
      data: seeds,
      count: seeds.length
    });
  } catch (error) {
    console.error('Error fetching seeds:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch seeds'
    });
  }
});

// Get seed categories
router.get('/categories', async (req: AuthRequest, res: Response) => {
  try {
    const categories = seedManager.getCategories();

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories'
    });
  }
});

// Get a specific seed by ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId || req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';
    
    const seed = await seedManager.getSeed(id, userId);
    
    if (!seed) {
      return res.status(404).json({
        success: false,
        error: 'Seed not found'
      });
    }

    res.json({
      success: true,
      data: seed
    });
  } catch (error) {
    console.error('Error fetching seed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch seed'
    });
  }
});

// Create a new seed
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';
    const seedData: Omit<SeedCreateInput, 'userId'> = req.body;

    if (!seedData.name || !seedData.yaml || !seedData.farmType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, yaml, farmType'
      });
    }

    const seed = await seedManager.createSeed({
      ...seedData,
      userId
    });

    res.status(201).json({
      success: true,
      data: seed
    });
  } catch (error) {
    console.error('Error creating seed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create seed'
    });
  }
});

// Update a seed
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId || req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';
    const updateData: SeedUpdateInput = req.body;

    const seed = await seedManager.updateSeed(id, userId, updateData);
    
    if (!seed) {
      return res.status(404).json({
        success: false,
        error: 'Seed not found or unauthorized'
      });
    }

    res.json({
      success: true,
      data: seed
    });
  } catch (error) {
    console.error('Error updating seed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update seed'
    });
  }
});

// Delete a seed
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId || req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';

    const deleted = await seedManager.deleteSeed(id, userId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Seed not found or unauthorized'
      });
    }

    res.json({
      success: true,
      message: 'Seed deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting seed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete seed'
    });
  }
});

// Record seed usage
router.post('/:id/use', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { success = true } = req.body;

    await seedManager.recordSeedUsage(id, success);

    res.json({
      success: true,
      message: 'Usage recorded'
    });
  } catch (error) {
    console.error('Error recording usage:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record usage'
    });
  }
});

export default router;