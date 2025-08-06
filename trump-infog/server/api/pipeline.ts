import { Router, Request, Response } from 'express';
import { pipelineOrchestrator } from '../services/pipelineOrchestrator.js';
import { sharedStateManager } from '../services/sharedStateManager.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Get pipeline status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const state = pipelineOrchestrator.getState();
    const sharedState = sharedStateManager.getProjectState();
    
    res.json({
      success: true,
      pipeline: state,
      shared: sharedState
    });
  } catch (error) {
    logger.error('Error getting pipeline status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get pipeline status'
    });
  }
});

// Start pipeline
router.post('/start', async (req: Request, res: Response) => {
  try {
    const state = pipelineOrchestrator.getState();
    
    if (state.status === 'running') {
      return res.status(400).json({
        success: false,
        error: 'Pipeline is already running'
      });
    }
    
    // Start pipeline asynchronously
    pipelineOrchestrator.startPipeline().catch(error => {
      logger.error('Pipeline execution error:', error);
    });
    
    res.json({
      success: true,
      message: 'Pipeline started',
      pipelineId: state.id
    });
  } catch (error) {
    logger.error('Error starting pipeline:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start pipeline'
    });
  }
});

// Stop pipeline
router.post('/stop', async (req: Request, res: Response) => {
  try {
    await pipelineOrchestrator.stopPipeline();
    
    res.json({
      success: true,
      message: 'Pipeline stopped'
    });
  } catch (error) {
    logger.error('Error stopping pipeline:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop pipeline'
    });
  }
});

// Get pipeline phases
router.get('/phases', async (req: Request, res: Response) => {
  try {
    const state = pipelineOrchestrator.getState();
    
    res.json({
      success: true,
      phases: state.phases,
      currentPhase: state.currentPhase,
      completedStages: sharedStateManager.getCompletedStages()
    });
  } catch (error) {
    logger.error('Error getting pipeline phases:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get pipeline phases'
    });
  }
});

// Get pipeline metrics
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = sharedStateManager.getMetrics();
    const state = pipelineOrchestrator.getState();
    
    res.json({
      success: true,
      metrics: {
        ...metrics,
        totalArticles: state.totalArticles,
        analyzedArticles: state.analyzedArticles,
        pipelineStatus: state.status,
        errors: state.errors
      }
    });
  } catch (error) {
    logger.error('Error getting pipeline metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get pipeline metrics'
    });
  }
});

// Trigger specific phase (for testing)
router.post('/phase/:phaseName', async (req: Request, res: Response) => {
  try {
    const { phaseName } = req.params;
    const validPhases = ['dataCollection', 'contentAnalysis', 'designGeneration', 'outputAssembly'];
    
    if (!validPhases.includes(phaseName)) {
      return res.status(400).json({
        success: false,
        error: `Invalid phase name. Valid phases: ${validPhases.join(', ')}`
      });
    }
    
    // This would trigger a specific phase for testing
    // Implementation depends on your testing needs
    
    res.json({
      success: true,
      message: `Phase ${phaseName} triggered for testing`
    });
  } catch (error) {
    logger.error('Error triggering phase:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger phase'
    });
  }
});

// WebSocket event hooks
pipelineOrchestrator.on('pipeline:started', (data) => {
  logger.info('Pipeline started event:', data);
  // This would be broadcast via WebSocket
});

pipelineOrchestrator.on('phase:completed', (data) => {
  logger.info('Phase completed event:', data);
  // This would be broadcast via WebSocket
});

pipelineOrchestrator.on('pipeline:completed', (data) => {
  logger.info('Pipeline completed event:', data);
  // This would be broadcast via WebSocket
});

pipelineOrchestrator.on('pipeline:failed', (data) => {
  logger.error('Pipeline failed event:', data);
  // This would be broadcast via WebSocket
});

export default router;