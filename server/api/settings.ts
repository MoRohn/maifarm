import { Request, Response, Router } from 'express';
import { db } from '../database/connection';

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
    console.log('[Settings] Attempt to disable XenoSync ignored - XenoSync is mandatory');
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
    console.log(`[Settings] Attempt to set orchestrator to '${orchestrator}' ignored - XenoSync is mandatory`);
  }
  
  res.json({
    success: true,
    orchestrator: 'xenosync'
  });
});

// Get all settings
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT key, value, updated_at FROM settings ORDER BY key`
    );
    
    const settings = result.rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {} as Record<string, any>);
    
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
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
    await db.query(
      `INSERT INTO settings (key, value, updated_at) 
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) 
       DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, value]
    );
    
    console.log(`[Settings] Setting '${key}' updated`);
    
    res.json({
      success: true,
      key,
      value
    });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update setting'
    });
  }
});

export default router;