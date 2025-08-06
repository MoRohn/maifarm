import { Router } from 'express';
import { barnService } from '../services/barnService';
import { logger } from '../utils/logger';
import { BarnItem } from '../../src/types/barn';

const router = Router();

// Get barn statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await barnService.getStats();
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get barn stats:', error);
    res.status(500).json({ error: 'Failed to retrieve barn statistics' });
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

// Store harvest in barn
router.post('/store', async (req, res) => {
  try {
    const { harvestId, name, description, type, category, tags, folderId } = req.body;

    if (!harvestId) {
      return res.status(400).json({ error: 'Harvest ID is required' });
    }

    const item = await barnService.storeHarvest(harvestId, {
      name,
      description,
      type,
      category,
      tags,
      folderId
    });

    res.status(201).json(item);
  } catch (error) {
    logger.error('Failed to store harvest in barn:', error);
    if ((error as Error).message === 'Harvest not found') {
      res.status(404).json({ error: 'Harvest not found' });
    } else if ((error as Error).message === 'Harvest is not ready for storage') {
      res.status(400).json({ error: 'Harvest is not ready for storage' });
    } else {
      res.status(500).json({ error: 'Failed to store harvest in barn' });
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

// Delete barn item
router.delete('/items/:id', async (req, res) => {
  try {
    await barnService.deleteItem(req.params.id);
    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete barn item:', error);
    if ((error as Error).message === 'Barn item not found') {
      res.status(404).json({ error: 'Barn item not found' });
    } else {
      res.status(500).json({ error: 'Failed to delete barn item' });
    }
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

export default router;