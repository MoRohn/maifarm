import { Request, Response, Router } from 'express';
import { settingsService } from '../services/settingsService';
import { logger, LogCategory } from '../utils/logger';

const router = Router();

// Get XenoSync orchestrator preference - always enabled
router.get('/xenosync', async (req: Request, res: Response) => {
  // XenoSync is mandatory for all farm orchestration
  res.json({
    success: true,
    enabled: true
  });
});

// Get orchestrator preference - always returns xenosync
router.get('/orchestrator', async (req: Request, res: Response) => {
  // XenoSync is mandatory for all farm orchestration
  res.json({
    success: true,
    orchestrator: 'xenosync'
  });
});

// Set XenoSync orchestrator preference - no-op, always enabled
router.post('/xenosync', async (req: Request, res: Response) => {
  // XenoSync is mandatory - ignore any attempt to disable it
  const { enabled } = req.body;

  if (enabled === false) {
    logger.info(LogCategory.SYSTEM, 'Attempt to disable XenoSync ignored - XenoSync is mandatory');
  }

  res.json({
    success: true,
    enabled: true
  });
});

// Save orchestrator preference - no-op, always xenosync
router.post('/orchestrator', async (req: Request, res: Response) => {
  const { orchestrator } = req.body;

  if (orchestrator !== 'xenosync') {
    logger.info(LogCategory.SYSTEM, `Attempt to set orchestrator to '${orchestrator}' ignored - XenoSync is mandatory`);
  }

  res.json({
    success: true,
    orchestrator: 'xenosync'
  });
});

// Get all settings
router.get('/', async (req: Request, res: Response) => {
  try {
    const settings = await settingsService.getAllSystemSettings();
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    logger.error(LogCategory.SYSTEM, 'Error fetching settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch settings'
    });
  }
});

// Update a setting
router.post('/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    if (!key || value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Invalid setting key or value'
      });
    }
    
    // Upsert the setting
    const persisted = await settingsService.setSetting(key, value);
    if (!persisted) {
      throw new Error('Failed to persist setting');
    }

    logger.info(LogCategory.SYSTEM, `Setting '${key}' updated`);

    res.json({
      success: true,
      key,
      value
    });
  } catch (error) {
    logger.error(LogCategory.SYSTEM, 'Error updating setting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update setting'
    });
  }
});

// Get performance metrics
router.get('/metrics', (req: Request, res: Response) => {
  try {
    const metrics = settingsService.getMetrics();
    res.json({
      success: true,
      metrics
    });
  } catch (error) {
    logger.error(LogCategory.SYSTEM, 'Error fetching settings metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch metrics'
    });
  }
});

export default router;
