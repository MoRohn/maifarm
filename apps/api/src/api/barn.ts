import { Router } from 'express';
import { barnService } from '../services/unified/barnService';
import { barnService as barnCatalogService } from '../services/unified/barnService';
import { logger } from '../utils/logger';
import { BarnItem } from '../../src/types/barn';

const router = Router();

// GET /api/barn - Get all barn items (base endpoint)
router.get('/', async (req, res) => {
  try {
    const filter = {
      type: req.query.type as BarnItem['type'],
      category: req.query.category as string,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      folderId: req.query.folderId as string,
      searchQuery: req.query.search as string
    };

    const items = await barnService.findAll(filter);
    res.json({
      success: true,
      data: items,
      count: items.length
    });
  } catch (error) {
    logger.error('Failed to get barn items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve barn items'
    });
  }
});

// Get barn statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await barnService.getStats();
    res.json({ 
      success: true, 
      data: stats 
    });
  } catch (error) {
    logger.error('Failed to get barn stats:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to retrieve barn statistics' 
    });
  }
});

// Get all barn items
router.get('/items', async (req, res) => {
  try {
    const filter = {
      type: req.query.type as BarnItem['type'],
      category: req.query.category as string,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      folderId: req.query.folderId as string,
      searchQuery: req.query.search as string
    };

    const items = await barnService.findAll(filter);
    res.json(items);
  } catch (error) {
    logger.error('Failed to get barn items:', error);
    res.status(500).json({ error: 'Failed to retrieve barn items' });
  }
});

// Get barn item by ID
router.get('/items/:id', async (req, res) => {
  try {
    const item = await barnService.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Barn item not found' });
    }
    res.json(item);
  } catch (error) {
    logger.error('Failed to get barn item:', error);
    res.status(500).json({ error: 'Failed to retrieve barn item' });
  }
});

// Store harvest in barn (legacy endpoint for backward compatibility)
router.post('/store', async (req, res) => {
  try {
    const { harvestId, name, description, type, category, tags, folderId } = req.body;

    if (!harvestId) {
      return res.status(400).json({ 
        success: false,
        error: 'Harvest ID is required' 
      });
    }

    const item = await barnService.storeHarvest(harvestId, {
      name,
      description,
      type,
      category,
      tags,
      folderId
    });

    res.status(201).json({
      success: true,
      data: item
    });
  } catch (error) {
    logger.error('Failed to store harvest in barn:', error);
    if ((error as Error).message === 'Harvest not found') {
      res.status(404).json({ 
        success: false,
        error: 'Harvest not found' 
      });
    } else if ((error as Error).message === 'Harvest is not ready for storage') {
      res.status(400).json({ 
        success: false,
        error: 'Harvest is not ready for storage' 
      });
    } else {
      res.status(500).json({ 
        success: false,
        error: 'Failed to store harvest in barn' 
      });
    }
  }
});

// Update barn item
router.put('/items/:id', async (req, res) => {
  try {
    const updates: Partial<BarnItem> = {
      name: req.body.name,
      description: req.body.description,
      tags: req.body.tags,
      status: req.body.status
    };

    // Remove undefined values
    Object.keys(updates).forEach(key => 
      updates[key as keyof BarnItem] === undefined && delete updates[key as keyof BarnItem]
    );

    const item = await barnService.updateItem(req.params.id, updates);
    res.json(item);
  } catch (error) {
    logger.error('Failed to update barn item:', error);
    if ((error as Error).message === 'Barn item not found') {
      res.status(404).json({ error: 'Barn item not found' });
    } else {
      res.status(500).json({ error: 'Failed to update barn item' });
    }
  }
});

// Use barn item
router.post('/items/:id/use', async (req, res) => {
  try {
    const item = await barnService.useItem(req.params.id);
    res.json(item);
  } catch (error) {
    logger.error('Failed to use barn item:', error);
    if ((error as Error).message === 'Barn item not found') {
      res.status(404).json({ error: 'Barn item not found' });
    } else {
      res.status(500).json({ error: 'Failed to use barn item' });
    }
  }
});

// Bulk delete items - MUST come BEFORE single delete route
router.delete('/items/bulk', async (req, res) => {
  try {
    const { itemIds } = req.body;

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Item IDs array is required'
      });
    }

    const result = await barnService.bulkDelete(itemIds);
    res.json({
      success: result.success,
      data: result
    });
  } catch (error) {
    logger.error('Failed to bulk delete barn items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk delete barn items'
    });
  }
});

// Delete barn item - MUST come AFTER bulk delete route
router.delete('/items/:id', async (req, res) => {
  try {
    await barnService.deleteItem(req.params.id);
    res.json({
      success: true,
      message: 'Barn item deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete barn item:', error);
    if ((error as Error).message === 'Barn item not found') {
      res.status(404).json({
        success: false,
        error: 'Barn item not found'
      });
    } else if ((error as Error).message === 'Barn item already deleted') {
      res.status(410).json({
        success: false,
        error: 'Barn item already deleted'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to delete barn item',
        details: (error as Error).message
      });
    }
  }
});

// Sync with filesystem
router.post('/sync', async (req, res) => {
  try {
    const result = await barnService.syncWithFileSystem();
    res.json({ 
      success: true, 
      data: result 
    });
  } catch (error) {
    logger.error('Failed to sync barn with filesystem:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to sync barn with filesystem' 
    });
  }
});

// Get storage statistics
router.get('/storage-stats', async (req, res) => {
  try {
    const stats = await barnService.getStorageStats();
    res.json({ 
      success: true, 
      data: stats 
    });
  } catch (error) {
    logger.error('Failed to get storage stats:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get storage statistics' 
    });
  }
});

// Cleanup barn storage
router.post('/cleanup', async (req, res) => {
  try {
    const options = {
      removeOrphaned: req.body.removeOrphaned || false,
      archiveOldItems: req.body.archiveOldItems || false,
      archiveDays: req.body.archiveDays || 30,
      compressArchived: req.body.compressArchived || false,
      removeTempFiles: req.body.removeTempFiles || false,
      removeEmptyDirectories: req.body.removeEmptyDirectories || false
    };
    
    const result = await barnService.cleanup(options);
    res.json({ 
      success: true, 
      data: result 
    });
  } catch (error) {
    logger.error('Failed to cleanup barn:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to cleanup barn storage' 
    });
  }
});

// Bulk archive items
router.post('/items/bulk-archive', async (req, res) => {
  try {
    const { itemIds } = req.body;
    
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Item IDs array is required' 
      });
    }
    
    const result = await barnService.bulkArchive(itemIds);
    res.json({ 
      success: result.success, 
      data: result 
    });
  } catch (error) {
    logger.error('Failed to bulk archive barn items:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to bulk archive barn items' 
    });
  }
});

// Get archived items
router.get('/archived', async (req, res) => {
  try {
    const filter = {
      type: req.query.type as string,
      searchQuery: req.query.search as string
    };
    
    const items = await barnService.getArchivedItems(filter);
    res.json({ 
      success: true, 
      data: items 
    });
  } catch (error) {
    logger.error('Failed to get archived items:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get archived items' 
    });
  }
});

// Restore items from archive
router.post('/restore', async (req, res) => {
  try {
    const { itemIds } = req.body;
    
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Item IDs array is required' 
      });
    }
    
    const result = await barnService.restoreFromArchive(itemIds);
    res.json({ 
      success: result.success, 
      data: result 
    });
  } catch (error) {
    logger.error('Failed to restore barn items:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to restore barn items from archive' 
    });
  }
});

// Get sync status
router.get('/sync-status', async (req, res) => {
  try {
    const status = await barnService.getLastSyncStatus();
    const inProgress = barnService.isSyncInProgress();
    
    res.json({ 
      success: true, 
      data: {
        lastSync: status,
        inProgress
      }
    });
  } catch (error) {
    logger.error('Failed to get sync status:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get sync status' 
    });
  }
});

// Get all folders
router.get('/folders', async (req, res) => {
  try {
    const folders = await barnService.getFolders();
    res.json(folders);
  } catch (error) {
    logger.error('Failed to get barn folders:', error);
    res.status(500).json({ error: 'Failed to retrieve barn folders' });
  }
});

// Create new folder
router.post('/folders', async (req, res) => {
  try {
    const { name, description, parentId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const folder = await barnService.createFolder(name, description, parentId);
    res.status(201).json(folder);
  } catch (error) {
    logger.error('Failed to create barn folder:', error);
    res.status(500).json({ error: 'Failed to create barn folder' });
  }
});

// Create seed from barn item
router.post('/items/:id/to-seed', async (req, res) => {
  try {
    const yaml = await barnService.createSeedFromItem(req.params.id);
    res.json({ yaml });
  } catch (error) {
    logger.error('Failed to create seed from barn item:', error);
    if ((error as Error).message === 'Barn item not found') {
      res.status(404).json({ error: 'Barn item not found' });
    } else if ((error as Error).message === 'Barn item does not have YAML configuration') {
      res.status(400).json({ error: 'Barn item does not have YAML configuration' });
    } else {
      res.status(500).json({ error: 'Failed to create seed from barn item' });
    }
  }
});

// Get yield items for a barn item
router.get('/items/:id/yield', async (req, res) => {
  try {
    const item = await barnService.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Barn item not found' });
    }
    
    // Get yield with file info
    const yieldWithInfo = await barnService.getYieldWithFileInfo(req.params.id);
    res.json(yieldWithInfo);
  } catch (error) {
    logger.error('Failed to get yield items:', error);
    res.status(500).json({ error: 'Failed to retrieve yield items' });
  }
});

// Download a specific yield item
router.get('/items/:id/yield/:yieldId/download', async (req, res) => {
  try {
    const { id, yieldId } = req.params;
    const fileData = await barnService.downloadYieldItem(id, yieldId);
    
    if (!fileData) {
      return res.status(404).json({ error: 'Yield item not found' });
    }
    
    res.setHeader('Content-Type', fileData.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileData.name}"`);
    res.send(fileData.content);
  } catch (error) {
    logger.error('Failed to download yield item:', error);
    res.status(500).json({ error: 'Failed to download yield item' });
  }
});

// Download all yield items as a zip
router.get('/items/:id/download-all', async (req, res) => {
  try {
    const zipData = await barnService.downloadAllYieldItems(req.params.id);
    
    if (!zipData) {
      return res.status(404).json({ error: 'No yield items found' });
    }
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="barn-item-${req.params.id}.zip"`);
    res.send(zipData);
  } catch (error) {
    logger.error('Failed to download all yield items:', error);
    res.status(500).json({ error: 'Failed to download yield items' });
  }
});

// ============ HARVEST-SPECIFIC ENDPOINTS ============

// Get harvest by ID from barn (harvest lookup endpoint)
router.get('/harvests/:harvestId', async (req, res) => {
  try {
    const { harvestId } = req.params;
    
    // Find barn item that contains this harvest
    const items = await barnService.findAll({ harvestId });
    
    if (items.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Harvest not found in barn' 
      });
    }
    
    // Return the first matching item (should be unique)
    const barnItem = items[0];
    res.json({
      success: true,
      data: {
        barnItem,
        harvestId,
        storedAt: barnItem.createdAt,
        category: barnItem.category,
        tags: barnItem.tags
      }
    });
  } catch (error) {
    logger.error('Failed to get harvest from barn:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to retrieve harvest from barn' 
    });
  }
});

// Store harvest in barn (POST /api/barn/harvests)
router.post('/harvests', async (req, res) => {
  try {
    const { harvestId, name, description, type, category, tags, folderId } = req.body;

    if (!harvestId) {
      return res.status(400).json({ 
        success: false,
        error: 'Harvest ID is required' 
      });
    }

    const item = await barnService.storeHarvest(harvestId, {
      name,
      description,
      type,
      category,
      tags,
      folderId
    });

    res.status(201).json({
      success: true,
      data: item
    });
  } catch (error) {
    logger.error('Failed to store harvest in barn:', error);
    if ((error as Error).message === 'Harvest not found') {
      res.status(404).json({ 
        success: false,
        error: 'Harvest not found' 
      });
    } else if ((error as Error).message === 'Harvest is not ready for storage') {
      res.status(400).json({ 
        success: false,
        error: 'Harvest is not ready for storage' 
      });
    } else {
      res.status(500).json({ 
        success: false,
        error: 'Failed to store harvest in barn' 
      });
    }
  }
});

// Search barn with query parameters (GET /api/barn/search)
router.get('/search', async (req, res) => {
  try {
    const {
      q: searchQuery,
      type,
      category,
      tags,
      farmId,
      harvestId,
      folderId,
      limit = 20,
      offset = 0
    } = req.query;

    const filter = {
      type: type as BarnItem['type'],
      category: category as string,
      tags: tags ? (tags as string).split(',') : undefined,
      farmId: farmId as string,
      harvestId: harvestId as string,
      folderId: folderId as string,
      searchQuery: searchQuery as string
    };

    const items = await barnService.findAll(filter);
    
    // Apply pagination
    const startIndex = Number(offset);
    const endIndex = startIndex + Number(limit);
    const paginatedItems = items.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      data: paginatedItems,
      meta: {
        total: items.length,
        offset: Number(offset),
        limit: Number(limit),
        hasMore: endIndex < items.length
      }
    });
  } catch (error) {
    logger.error('Failed to search barn:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to search barn' 
    });
  }
});

// ============ BARN CATALOG ENDPOINTS ============

// Get complete barn catalog for multi-Claude service
router.get('/catalog', async (req, res) => {
  try {
    const catalog = await barnCatalogService.getCatalog();
    res.json(catalog);
  } catch (error) {
    logger.error('Failed to get barn catalog:', error);
    res.status(500).json({ error: 'Failed to retrieve barn catalog' });
  }
});

// Search barn catalog
router.get('/catalog/search', async (req, res) => {
  try {
    const query = {
      type: req.query.type as string,
      category: req.query.category as string,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      farmId: req.query.farmId as string,
      searchText: req.query.q as string
    };

    const items = await barnCatalogService.searchCatalog(query);
    res.json(items);
  } catch (error) {
    logger.error('Failed to search barn catalog:', error);
    res.status(500).json({ error: 'Failed to search barn catalog' });
  }
});

// Get barn catalog summary
router.get('/catalog/summary', async (req, res) => {
  try {
    const summary = await barnCatalogService.getCatalogSummary();
    res.json(summary);
  } catch (error) {
    logger.error('Failed to get catalog summary:', error);
    res.status(500).json({ error: 'Failed to retrieve catalog summary' });
  }
});

// Get references for a specific barn item
router.get('/catalog/references/:itemId', async (req, res) => {
  try {
    const reference = await barnCatalogService.getItemReference(req.params.itemId);
    if (!reference) {
      return res.status(404).json({ error: 'Barn item not found' });
    }
    res.json(reference);
  } catch (error) {
    logger.error('Failed to get item reference:', error);
    res.status(500).json({ error: 'Failed to retrieve item reference' });
  }
});

// Get item content for reference
router.get('/catalog/content/:itemId', async (req, res) => {
  try {
    const { artifactName } = req.query;
    const content = await barnCatalogService.getItemContent(
      req.params.itemId,
      artifactName as string
    );
    
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }
    
    res.type('text/plain').send(content);
  } catch (error) {
    logger.error('Failed to get item content:', error);
    res.status(500).json({ error: 'Failed to retrieve item content' });
  }
});

// Generate catalog for a specific farm
router.get('/catalog/for-farm/:farmId', async (req, res) => {
  try {
    const options = {
      includeYaml: req.query.includeYaml === 'true',
      maxItems: req.query.maxItems ? parseInt(req.query.maxItems as string) : undefined,
      types: req.query.types ? (req.query.types as string).split(',') : undefined
    };

    const catalogText = await barnCatalogService.generateCatalogForFarm(
      req.params.farmId,
      options
    );
    
    res.type('text/plain').send(catalogText);
  } catch (error) {
    logger.error('Failed to generate farm catalog:', error);
    res.status(500).json({ error: 'Failed to generate farm catalog' });
  }
});

// Export catalog for multi-Claude integration
router.get('/catalog/export', async (req, res) => {
  try {
    const exportData = await barnCatalogService.exportCatalogForMultiClaude();
    res.json(exportData);
  } catch (error) {
    logger.error('Failed to export catalog:', error);
    res.status(500).json({ error: 'Failed to export catalog' });
  }
});

// Track barn item usage by a farm
router.post('/catalog/track-usage', async (req, res) => {
  try {
    const { itemId, farmId } = req.body;
    
    if (!itemId || !farmId) {
      return res.status(400).json({ error: 'Item ID and Farm ID are required' });
    }
    
    await barnCatalogService.trackItemUsage(itemId, farmId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to track usage:', error);
    res.status(500).json({ error: 'Failed to track item usage' });
  }
});

// Resolve a barn reference (e.g., @barn:item-id)
router.post('/catalog/resolve', async (req, res) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({ error: 'Reference is required' });
    }

    const item = await barnCatalogService.resolveReference(reference);

    if (!item) {
      return res.status(404).json({ error: 'Reference could not be resolved' });
    }

    res.json(item);
  } catch (error) {
    logger.error('Failed to resolve reference:', error);
    res.status(500).json({ error: 'Failed to resolve reference' });
  }
});

// Search barn items
router.get('/search', async (req, res) => {
  try {
    const { query, type, category, tags, limit = 50 } = req.query;

    const filter = {
      searchQuery: query as string,
      type: type as BarnItem['type'],
      category: category as string,
      tags: tags ? (tags as string).split(',') : undefined
    };

    const items = await barnService.findAll(filter);
    const limitedItems = items.slice(0, Number(limit));

    res.json({
      success: true,
      data: limitedItems,
      total: items.length,
      query: query || ''
    });
  } catch (error) {
    logger.error('Failed to search barn items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search barn items'
    });
  }
});

// Export barn data
router.get('/export', async (req, res) => {
  try {
    const { format = 'json', type, category } = req.query;

    const filter = {
      type: type as BarnItem['type'],
      category: category as string
    };

    const items = await barnService.findAll(filter);

    let exportData: string;
    let contentType: string;
    let filename: string;

    switch (format) {
      case 'csv':
        contentType = 'text/csv';
        filename = 'barn-export.csv';
        // Simple CSV export
        const headers = 'id,name,type,category,createdAt\n';
        const rows = items.map(item =>
          `"${item.id}","${item.name}","${item.type}","${item.category || ''}","${item.createdAt}"`
        ).join('\n');
        exportData = headers + rows;
        break;
      case 'md':
        contentType = 'text/markdown';
        filename = 'barn-export.md';
        exportData = `# Barn Export\n\n` +
          items.map(item =>
            `## ${item.name}\n- Type: ${item.type}\n- Category: ${item.category || 'N/A'}\n- Created: ${item.createdAt}\n`
          ).join('\n');
        break;
      default:
        contentType = 'application/json';
        filename = 'barn-export.json';
        exportData = JSON.stringify({ items, exportedAt: new Date().toISOString() }, null, 2);
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(exportData);
  } catch (error) {
    logger.error('Failed to export barn data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export barn data'
    });
  }
});

// Generate seed from barn item
router.post('/items/:id/seed', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const item = await barnService.findById(id);
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Barn item not found'
      });
    }

    // Create a seed configuration from the barn item
    const seed = {
      id: `seed-${Date.now()}`,
      name: name || `Seed from ${item.name}`,
      description: description || `Generated from barn item: ${item.name}`,
      sourceItemId: id,
      sourceType: item.type,
      config: {
        template: item.metadata?.template || 'default',
        parameters: item.metadata?.parameters || {}
      },
      createdAt: new Date().toISOString()
    };

    res.status(201).json({
      success: true,
      data: seed
    });
  } catch (error) {
    logger.error('Failed to create seed from barn item:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create seed from barn item'
    });
  }
});

// Get barn items by harvest ID
router.get('/harvests/:harvestId', async (req, res) => {
  try {
    const { harvestId } = req.params;

    const filter = {
      harvestId: harvestId
    };

    const items = await barnService.findAll(filter);

    res.json({
      success: true,
      data: items,
      harvestId
    });
  } catch (error) {
    logger.error('Failed to get barn items by harvest:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve barn items for harvest'
    });
  }
});

export default router;