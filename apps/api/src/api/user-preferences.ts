/**
 * User Preferences API - Store and retrieve user-specific settings
 *
 * Manages user preferences including themes, UI settings, and CLI preferences
 */

import { Request, Response, Router } from 'express';
import { db } from '../database/connection';
import { logger, LogCategory } from '../services/ProductionLogger';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * Get user preferences
 * GET /api/user-preferences
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const result = await db.query(
      `SELECT preferences FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const preferences = result.rows[0].preferences || {};

    res.json({
      success: true,
      preferences
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Error fetching user preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch preferences'
    });
  }
});

/**
 * Update user preferences
 * PUT /api/user-preferences
 */
router.put('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { preferences } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid preferences object'
      });
    }

    // Update preferences (merge with existing)
    await db.query(
      `UPDATE users
       SET preferences = preferences || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(preferences), userId]
    );

    logger.info(LogCategory.API, `User ${userId} updated preferences`);

    res.json({
      success: true,
      preferences
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Error updating user preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update preferences'
    });
  }
});

/**
 * Get specific preference by key
 * GET /api/user-preferences/:key
 */
router.get('/:key', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { key } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const result = await db.query(
      `SELECT preferences->$1 as value FROM users WHERE id = $2`,
      [key, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      key,
      value: result.rows[0].value
    });
  } catch (error) {
    logger.error(LogCategory.API, `Error fetching preference '${req.params.key}':`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch preference'
    });
  }
});

/**
 * Set specific preference by key
 * POST /api/user-preferences/:key
 */
router.post('/:key', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { key } = req.params;
    const { value } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    if (value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Value is required'
      });
    }

    // Update specific key in preferences JSONB
    await db.query(
      `UPDATE users
       SET preferences = jsonb_set(
         COALESCE(preferences, '{}'::jsonb),
         $1::text[],
         $2::jsonb,
         true
       ),
       updated_at = NOW()
       WHERE id = $3`,
      [`{${key}}`, JSON.stringify(value), userId]
    );

    logger.info(LogCategory.API, `User ${userId} set preference '${key}'`);

    res.json({
      success: true,
      key,
      value
    });
  } catch (error) {
    logger.error(LogCategory.API, `Error setting preference '${req.params.key}':`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to set preference'
    });
  }
});

/**
 * Delete specific preference by key
 * DELETE /api/user-preferences/:key
 */
router.delete('/:key', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { key } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    // Remove key from preferences JSONB
    await db.query(
      `UPDATE users
       SET preferences = preferences - $1,
           updated_at = NOW()
       WHERE id = $2`,
      [key, userId]
    );

    logger.info(LogCategory.API, `User ${userId} deleted preference '${key}'`);

    res.json({
      success: true,
      key,
      deleted: true
    });
  } catch (error) {
    logger.error(LogCategory.API, `Error deleting preference '${req.params.key}':`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete preference'
    });
  }
});

/**
 * Reset all preferences to defaults
 * POST /api/user-preferences/reset
 */
router.post('/reset/all', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    // Reset to empty preferences
    await db.query(
      `UPDATE users
       SET preferences = '{}'::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );

    logger.info(LogCategory.API, `User ${userId} reset all preferences`);

    res.json({
      success: true,
      reset: true
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Error resetting preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset preferences'
    });
  }
});

export default router;
