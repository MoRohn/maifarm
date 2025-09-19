import { Router, Request, Response } from 'express';
import { maiBarnResetService } from '../services/maibarnResetService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Get MaiBarn storage info
router.get('/info', async (req: Request, res: Response) => {
  try {
    logger.info('Fetching MaiBarn storage info...');
    const info = await maiBarnResetService.getStorageInfo();
    logger.info('MaiBarn storage info:', info);
    res.json({
      success: true,
      data: info
    });
  } catch (error) {
    logger.error('Failed to get MaiBarn info:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: `Failed to retrieve MaiBarn information: ${errorMessage}`
    });
  }
});

// Perform complete MaiBarn reset
router.post('/reset', async (req: Request, res: Response) => {
  try {
    const { includeDatabase = false } = req.body;
    logger.warn(`MaiBarn reset requested via API (includeDatabase: ${includeDatabase})`);
    
    // Add a delay to allow any ongoing operations to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const result = await maiBarnResetService.performCompleteReset(includeDatabase);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        deletedItems: result.deletedItems,
        databaseCleanup: result.databaseCleanup
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message,
        errors: result.errors
      });
    }
  } catch (error) {
    logger.error('Failed to reset MaiBarn:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({
      success: false,
      error: `Failed to reset MaiBarn: ${errorMessage}`,
      details: error instanceof Error ? error.stack : undefined
    });
  }
});

export default router;