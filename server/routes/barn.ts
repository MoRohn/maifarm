import { Router, Response } from 'express';
import { barnService } from '../services/barnService';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { BarnFilter, BarnExportOptions } from '../types/barn';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get all barn entries for the user
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || 'default-user';
    const filter: BarnFilter = {
      harvestId: req.query.harvestId as string,
      farmId: req.query.farmId as string,
      category: req.query.category as string,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      search: req.query.search as string,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      sortBy: req.query.sortBy as any,
      sortOrder: req.query.sortOrder as any,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
    };

    const entries = await barnService.getUserBarnEntries(userId, filter);

    res.json({
      success: true,
      data: entries,
      count: entries.length
    });
  } catch (error) {
    console.error('Error fetching barn entries:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch barn entries'
    });
  }
});

// Get barn statistics
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || 'default-user';
    const stats = await barnService.getBarnStats(userId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching barn stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch barn statistics'
    });
  }
});

// Get a specific barn entry
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 'default-user';
    
    const entry = await barnService.getBarnEntry(id, userId);
    
    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Barn entry not found'
      });
    }

    res.json({
      success: true,
      data: entry
    });
  } catch (error) {
    console.error('Error fetching barn entry:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch barn entry'
    });
  }
});

// Get barn entry versions
router.get('/:id/versions', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 'default-user';
    
    const versions = await barnService.getEntryVersions(id, userId);

    res.json({
      success: true,
      data: versions,
      count: versions.length
    });
  } catch (error) {
    console.error('Error fetching versions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch versions'
    });
  }
});

// Update barn entry metadata
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 'default-user';
    const { category, tags, metadata } = req.body;

    const entry = await barnService.updateBarnEntry(id, userId, {
      category,
      tags,
      metadata
    });

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Barn entry not found'
      });
    }

    // Emit WebSocket event
    req.app.get('wsServer')?.broadcast('barn:updated', entry);

    res.json({
      success: true,
      data: entry
    });
  } catch (error) {
    console.error('Error updating barn entry:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update barn entry'
    });
  }
});

// Export barn entries
router.post('/export', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || 'default-user';
    const options: BarnExportOptions = req.body;

    const exportData = await barnService.exportBarnData(userId, options);

    // Set appropriate headers based on format
    if (options.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="barn-export.csv"');
    } else if (options.format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="barn-export.json"');
    }

    res.send(exportData);
  } catch (error) {
    console.error('Error exporting barn data:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export barn data'
    });
  }
});

// Delete a barn entry
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 'default-user';

    const deleted = await barnService.deleteBarnEntry(id, userId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Barn entry not found'
      });
    }

    // Emit WebSocket event
    req.app.get('wsServer')?.broadcast('barn:deleted', { id });

    res.json({
      success: true,
      message: 'Barn entry deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting barn entry:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete barn entry'
    });
  }
});

// Search barn entries with advanced query
router.post('/search', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || 'default-user';
    const { query, filters, pagination } = req.body;

    const results = await barnService.searchBarn(userId, query, filters, pagination);

    res.json({
      success: true,
      data: results.entries,
      total: results.total,
      facets: results.facets
    });
  } catch (error) {
    console.error('Error searching barn:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search barn'
    });
  }
});

export default router;