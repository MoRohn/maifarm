import { Router, Request, Response } from 'express';
import { DataCollector } from '../services/dataCollector.js';
import type { CollectorConfig } from '../../src/types/news.js';

const router = Router();

// Initialize data collector instance
let dataCollector: DataCollector | null = null;

// Initialize collector with config
const initializeCollector = (config?: Partial<CollectorConfig>) => {
  if (!dataCollector) {
    dataCollector = new DataCollector(config);
    
    // Set up event listeners for WebSocket broadcasting
    dataCollector.on('collection_event', (event) => {
      // This will be picked up by WebSocket server
      if ((global as any).io) {
        (global as any).io.emit('data_collection:event', event);
      }
    });
  }
  return dataCollector;
};

// Start data collection
router.post('/collect', async (req: Request, res: Response) => {
  try {
    const collector = initializeCollector(req.body.config);
    
    if (collector.isRunning()) {
      return res.status(409).json({
        success: false,
        message: 'Collection already in progress',
      });
    }

    // Start collection asynchronously
    collector.collectArticles()
      .then(result => {
        console.log(`Data collection completed: ${result.articles.length} articles collected`);
      })
      .catch(error => {
        console.error('Data collection error:', error);
      });

    res.json({
      success: true,
      message: 'Data collection started',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get collection status
router.get('/status', (req: Request, res: Response) => {
  const collector = initializeCollector();
  
  res.json({
    isRunning: collector.isRunning(),
    config: collector.getConfig(),
  });
});

// Get latest collection results
router.get('/results', async (req: Request, res: Response) => {
  try {
    const collector = initializeCollector();
    
    // Try to get from cache first
    const results = await collector.collectArticles();
    
    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get trending topics
router.get('/trending', async (req: Request, res: Response) => {
  try {
    const collector = initializeCollector();
    const limit = parseInt(req.query.limit as string) || 10;
    
    const topics = await collector.getTrendingTopics(limit);
    
    res.json({
      success: true,
      topics,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Update collector configuration
router.put('/config', (req: Request, res: Response) => {
  try {
    const collector = initializeCollector();
    collector.updateConfig(req.body);
    
    res.json({
      success: true,
      config: collector.getConfig(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Clear cache
router.delete('/cache', (req: Request, res: Response) => {
  try {
    const collector = initializeCollector();
    collector.clearCache();
    
    res.json({
      success: true,
      message: 'Cache cleared',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Test endpoint to verify service is working
router.get('/test', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Data collection API is operational',
    endpoints: [
      'POST /api/datacollection/collect',
      'GET /api/datacollection/status',
      'GET /api/datacollection/results',
      'GET /api/datacollection/trending',
      'PUT /api/datacollection/config',
      'DELETE /api/datacollection/cache',
    ],
  });
});

export default router;