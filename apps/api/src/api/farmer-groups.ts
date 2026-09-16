/**
 * Farmer Groups API
 *
 * Endpoints for managing farmer groups, retrieving stats, and handling ratings.
 */

import { Router, Request, Response } from 'express';
import { farmerGroupService } from '../services/FarmerGroupService';
import { farmersService } from '../services/farmersService';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { logger, LogCategory } from '../utils/logger';

const router = Router();

// ============================================================================
// GROUP MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/farmer-groups
 * Get all farmer groups with farmer counts
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const groups = await farmerGroupService.getAllGroups();

    res.json({
      success: true,
      data: groups,
      count: groups.length
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to fetch farmer groups', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch farmer groups'
    });
  }
});

/**
 * GET /api/farmer-groups/:id
 * Get a single group by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Try to get by ID first, then by slug
    let group = await farmerGroupService.getGroupById(id);
    if (!group) {
      group = await farmerGroupService.getGroupBySlug(id);
    }

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Farmer group not found'
      });
    }

    res.json({
      success: true,
      data: group
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to fetch farmer group', { id: req.params.id, error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch farmer group'
    });
  }
});

/**
 * GET /api/farmer-groups/:id/farmers
 * Get all farmers in a specific group with full template data
 */
router.get('/:id/farmers', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get group (by ID or slug)
    let group = await farmerGroupService.getGroupById(id);
    if (!group) {
      group = await farmerGroupService.getGroupBySlug(id);
    }

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Farmer group not found'
      });
    }

    const farmers = await farmerGroupService.getFarmersInGroup(group.id);

    res.json({
      success: true,
      data: {
        group,
        farmers,
        count: farmers.length
      }
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to fetch farmers in group', { id: req.params.id, error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch farmers in group'
    });
  }
});

/**
 * POST /api/farmer-groups
 * Create a new farmer group (requires auth)
 */
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, icon, color, displayOrder } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Group name is required'
      });
    }

    const group = await farmerGroupService.createGroup({
      name: name.trim(),
      description,
      icon,
      color,
      displayOrder,
      createdBy: req.user?.userId
    });

    if (!group) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create farmer group'
      });
    }

    res.status(201).json({
      success: true,
      data: group
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to create farmer group', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to create farmer group'
    });
  }
});

/**
 * PUT /api/farmer-groups/:id
 * Update a farmer group (requires auth)
 */
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, icon, color, displayOrder, isActive } = req.body;

    const group = await farmerGroupService.updateGroup(id, {
      name,
      description,
      icon,
      color,
      displayOrder,
      isActive
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Farmer group not found'
      });
    }

    res.json({
      success: true,
      data: group
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to update farmer group', { id: req.params.id, error });
    res.status(500).json({
      success: false,
      error: 'Failed to update farmer group'
    });
  }
});

/**
 * DELETE /api/farmer-groups/:id
 * Delete a farmer group (requires auth, cannot delete system groups)
 */
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const success = await farmerGroupService.deleteGroup(id);

    if (!success) {
      return res.status(400).json({
        success: false,
        error: 'Failed to delete farmer group (may be a system group)'
      });
    }

    res.json({
      success: true,
      message: 'Farmer group deleted'
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to delete farmer group', { id: req.params.id, error });
    res.status(500).json({
      success: false,
      error: 'Failed to delete farmer group'
    });
  }
});

/**
 * POST /api/farmer-groups/:id/farmers
 * Add a farmer to a group (requires auth)
 */
router.post('/:id/farmers', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { farmerId, displayOrder } = req.body;

    if (!farmerId) {
      return res.status(400).json({
        success: false,
        error: 'Farmer ID is required'
      });
    }

    // Verify farmer exists
    const farmer = await farmersService.getFarmerById(farmerId);
    if (!farmer) {
      return res.status(404).json({
        success: false,
        error: 'Farmer not found'
      });
    }

    const success = await farmerGroupService.addFarmerToGroup(id, farmerId, displayOrder);

    if (!success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to add farmer to group'
      });
    }

    res.json({
      success: true,
      message: 'Farmer added to group'
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to add farmer to group', {
      groupId: req.params.id,
      farmerId: req.body.farmerId,
      error
    });
    res.status(500).json({
      success: false,
      error: 'Failed to add farmer to group'
    });
  }
});

/**
 * DELETE /api/farmer-groups/:id/farmers/:farmerId
 * Remove a farmer from a group (requires auth)
 */
router.delete('/:id/farmers/:farmerId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id, farmerId } = req.params;

    const success = await farmerGroupService.removeFarmerFromGroup(id, farmerId);

    if (!success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to remove farmer from group'
      });
    }

    res.json({
      success: true,
      message: 'Farmer removed from group'
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to remove farmer from group', {
      groupId: req.params.id,
      farmerId: req.params.farmerId,
      error
    });
    res.status(500).json({
      success: false,
      error: 'Failed to remove farmer from group'
    });
  }
});

// ============================================================================
// STATISTICS ENDPOINTS
// ============================================================================

/**
 * GET /api/farmer-groups/stats/all
 * Get statistics for all farmers
 */
router.get('/stats/all', async (req: Request, res: Response) => {
  try {
    const stats = await farmerGroupService.getAllFarmerStats();

    res.json({
      success: true,
      data: stats,
      count: stats.length
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to fetch all farmer stats', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch farmer statistics'
    });
  }
});

/**
 * GET /api/farmer-groups/stats/:farmerId
 * Get statistics for a specific farmer
 */
router.get('/stats/:farmerId', async (req: Request, res: Response) => {
  try {
    const { farmerId } = req.params;
    const stats = await farmerGroupService.getFarmerStats(farmerId);

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: 'Farmer stats not found'
      });
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to fetch farmer stats', { farmerId: req.params.farmerId, error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch farmer statistics'
    });
  }
});

// ============================================================================
// RATINGS ENDPOINTS
// ============================================================================

/**
 * GET /api/farmer-groups/ratings/:farmerId
 * Get public ratings for a farmer
 */
router.get('/ratings/:farmerId', async (req: Request, res: Response) => {
  try {
    const { farmerId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    const ratings = await farmerGroupService.getFarmerRatings(farmerId, limit);

    res.json({
      success: true,
      data: ratings,
      count: ratings.length
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to fetch farmer ratings', { farmerId: req.params.farmerId, error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch farmer ratings'
    });
  }
});

/**
 * POST /api/farmer-groups/ratings
 * Add or update a rating for a farmer (requires auth)
 */
router.post('/ratings', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { farmerId, rating, farmId, review } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!farmerId || typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: 'Valid farmerId and rating (1-5) are required'
      });
    }

    const ratingId = await farmerGroupService.addRating(
      farmerId,
      userId,
      rating,
      farmId,
      review
    );

    if (!ratingId) {
      return res.status(500).json({
        success: false,
        error: 'Failed to add rating'
      });
    }

    res.status(201).json({
      success: true,
      data: { id: ratingId }
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to add farmer rating', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to add rating'
    });
  }
});

/**
 * GET /api/farmer-groups/ratings/user/:farmerId
 * Get the current user's rating for a farmer (requires auth)
 */
router.get('/ratings/user/:farmerId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { farmerId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const rating = await farmerGroupService.getUserRating(userId, farmerId);

    res.json({
      success: true,
      data: rating
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to fetch user rating', {
      farmerId: req.params.farmerId,
      error
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user rating'
    });
  }
});

// ============================================================================
// USER PREFERENCES ENDPOINTS
// ============================================================================

/**
 * POST /api/farmer-groups/favorites/:farmerId
 * Toggle favorite status for a farmer (requires auth)
 */
router.post('/favorites/:farmerId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { farmerId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const isFavorite = await farmerGroupService.toggleFavorite(userId, farmerId);

    res.json({
      success: true,
      data: { isFavorite }
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to toggle favorite', {
      farmerId: req.params.farmerId,
      error
    });
    res.status(500).json({
      success: false,
      error: 'Failed to toggle favorite'
    });
  }
});

/**
 * GET /api/farmer-groups/favorites
 * Get user's favorite farmers (requires auth)
 */
router.get('/favorites', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const favorites = await farmerGroupService.getUserFavorites(userId);

    // Get full farmer templates for favorites
    const allFarmers = await farmersService.getAllFarmers();
    const favoriteFarmers = allFarmers.filter(f => favorites.includes(f.id));

    res.json({
      success: true,
      data: favoriteFarmers,
      farmerIds: favorites
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to fetch favorites', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch favorites'
    });
  }
});

/**
 * GET /api/farmer-groups/recent
 * Get user's recently used farmers (requires auth)
 */
router.get('/recent', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const limit = parseInt(req.query.limit as string) || 5;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const recentIds = await farmerGroupService.getUserRecentFarmers(userId, limit);

    // Get full farmer templates for recents
    const allFarmers = await farmersService.getAllFarmers();
    const recentFarmers = recentIds
      .map(id => allFarmers.find(f => f.id === id))
      .filter(Boolean);

    res.json({
      success: true,
      data: recentFarmers,
      farmerIds: recentIds
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to fetch recent farmers', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent farmers'
    });
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * GET /api/farmer-groups/health
 * Get farmer groups service health status
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await farmerGroupService.getHealthStatus();

    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to get farmer groups health', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get health status'
    });
  }
});

export default router;
