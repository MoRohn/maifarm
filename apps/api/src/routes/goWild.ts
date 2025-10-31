import { Router, Request, Response } from 'express';
import { goWildManager } from '../services/goWildManager';
import { goWildManagerV2 } from '../services/goWildManagerV2';
import { enhancedIntegration } from '../services/enhancedIntegration';
// Create SafetyManager stub
class SafetyManager {
  checkSafety() { return true; }
  static getInstance() { return new SafetyManager(); }
}

import { WebSocketManager } from '../websocket/websocketManager';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';

// Use V2 if USE_V2_SERVICES env is set
const USE_V2 = process.env.USE_V2_SERVICES === 'true' || process.env.GO_WILD_V2 === 'true';

const router = Router();
const safetyManager = SafetyManager.getInstance();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 10 // Maximum 10 files for GoWild
  },
  fileFilter: (req, file, cb) => {
    // Accept common file types
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'text/plain', 'text/markdown', 'text/html', 'text/css',
      'application/json', 'application/pdf',
      'application/javascript', 'application/typescript',
      'text/javascript', 'text/x-python', 'text/x-java',
      'text/x-c', 'text/x-cpp', 'text/yaml'
    ];
    
    const allowedExtensions = [
      '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h',
      '.yaml', '.yml', '.json', '.md', '.txt', '.pdf'
    ];
    
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype || ext}`));
    }
  }
});

// Root POST endpoint for starting Go Wild exploration (for frontend compatibility)
router.post('/', upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    const { prompt, timeout, autoScale = true, maxAgents = 5 } = req.body;
    const uploadedFiles = req.files as Express.Multer.File[];

    if (!prompt) {
      return res.status(400).json({ 
        success: false, 
        error: 'Prompt is required' 
      });
    }

    // Process uploaded files if any
    let fileContext = '';
    const fileMetadata: any[] = [];
    
    if (uploadedFiles && uploadedFiles.length > 0) {
      console.log(`[GoWild] Processing ${uploadedFiles.length} uploaded files`);
      
      for (const file of uploadedFiles) {
        fileMetadata.push({
          name: file.originalname,
          size: file.size,
          type: file.mimetype
        });
        
        // For text-based files, extract content
        if (file.mimetype?.startsWith('text/') || 
            file.originalname.match(/\.(txt|md|js|ts|jsx|tsx|py|java|cpp|c|h|yaml|yml|json)$/i)) {
          try {
            const content = file.buffer.toString('utf-8');
            fileContext += `\n\nFile: ${file.originalname}\n${content.substring(0, 2000)}`; // Limit content to 2000 chars per file
          } catch (err) {
            console.warn(`[GoWild] Could not read file content for ${file.originalname}:`, err);
          }
        }
      }
      
      console.log('[GoWild] File metadata:', fileMetadata);
    }
    
    // Enhance prompt with file context
    const enhancedPrompt = fileContext 
      ? `${prompt}\n\nContext from uploaded files:${fileContext}`
      : prompt;

    // Generate a unique farm ID for Go Wild session
    const farmId = uuidv4(); // Use proper UUID for database compatibility
    
    // Calculate dynamic timeout if not provided
    let effectiveTimeout = timeout;
    if (!timeout) {
      // Use yamlGenerator's dynamic timeout calculation
      const { yamlGenerator } = await import('../services/yamlGenerator');
      const yamlRequest = {
        prompt: enhancedPrompt,
        agentCount: maxAgents,
        template: 'default'
      };
      const yamlResponse = await yamlGenerator.generateYaml(yamlRequest);
      
      // Go Wild mode gets 1.5x the normal timeout due to exploration nature
      effectiveTimeout = yamlResponse.timeout ? Math.floor(yamlResponse.timeout * 1.5) : 2700; // Default 45 min for Go Wild
      console.log(`[GoWild] Using dynamic timeout: ${effectiveTimeout} seconds`);
    } else {
      effectiveTimeout = timeout;
    }
    
    // Create Go Wild configuration
    const config = {
      prompt: enhancedPrompt,
      timeout: effectiveTimeout,
      maxDuration: Math.floor(effectiveTimeout / 60), // Convert seconds to minutes for GoWildConfig
      autoScale,
      maxAgents,
      creativityLevel: 80,
      explorationDepth: 5, // Add required field
      autonomousMode: true,
      boundaries: {
        scope: 'exploration',
        safety: 'enabled',
        maxIterations: 100,
        allowExternalAPIs: false,
        allowFileSystem: true,
        allowNetworkRequests: false,
        restrictedDomains: []
      },
      focusAreas: [] // Add default empty array
    };

    logger.info('[GoWild Route] Starting Go Wild session:', { farmId, prompt });

    // Create the farm in database first
    const { farmService } = await import('../services/unified/farmService');
    const farm = await farmService.createFarm({
      id: farmId,
      name: `GoWild: ${prompt.slice(0, 50)}`,
      description: enhancedPrompt,
      prompt: enhancedPrompt,
      numberOfAgents: maxAgents,
      provider: 'claude',
      mode: 'go-wild',
      timeout: effectiveTimeout * 1000, // Convert to milliseconds
      type: 'gowild',
      status: 'launching',
      config
    });

    // Start the Go Wild session
    let session;
    try {
      if (USE_V2 && enhancedIntegration.isInitialized()) {
        const result = await enhancedIntegration.startGoWildSession(farmId, config);
        session = result.session;
      } else {
        session = await goWildManager.startExploration(farmId, config);
      }
    } catch (sessionError) {
      logger.error('[GoWild Route] Failed to start session:', sessionError);
      // Update farm status to failed
      await farmService.updateFarmStatus(farmId, 'failed');
      throw sessionError;
    }

    // Farm status will be updated to 'running' by goWildManager after agents launch
    
    // Notify via WebSocket
    WebSocketManager.broadcast('goWild:started', {
      farmId,
      sessionId: session?.id || farmId,
      config
    });

    res.json({ 
      success: true,
      farmId,
      farm,
      session,
      message: 'Go Wild exploration started successfully'
    });
  } catch (error) {
    logger.error('[GoWild Route] Failed to start Go Wild exploration:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to start exploration' 
    });
  }
});

// Start Go Wild exploration (legacy endpoint)
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { farmId, config } = req.body;

    if (!farmId || !config) {
      return res.status(400).json({ 
        success: false, 
        error: 'Farm ID and configuration are required' 
      });
    }

    // Validate safety boundaries
    const safetyCheck = await safetyManager.validateBoundaries(config.boundaries);
    if (!safetyCheck.isValid) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid safety boundaries', 
        details: safetyCheck.violations 
      });
    }

    let session;
    let additionalData = {};
    
    if (USE_V2) {
      // Use enhanced V2 services
      logger.info('[GoWild Route] Using V2 enhanced services');
      
      // Ensure services are initialized
      if (!enhancedIntegration.isInitialized()) {
        await enhancedIntegration.initialize({
          enableMetrics: true,
          enableHealthChecks: true,
          priorityBroadcast: true
        });
      }
      
      // Start with enhanced integration
      const result = await enhancedIntegration.startGoWildSession(farmId, config);
      session = result.session;
      additionalData = {
        version: 'v2',
        metricsStreamId: result.metricsStreamId,
        apiProvider: result.apiProvider,
        systemHealth: result.health
      };
    } else {
      // Use original V1 manager
      session = await goWildManager.startExploration(farmId, config);
      additionalData = { version: 'v1' };
    }

    // Notify via WebSocket
    WebSocketManager.broadcast('goWild:started', {
      farmId,
      sessionId: session.id,
      config,
      ...additionalData
    });

    res.json({ 
      success: true, 
      data: session,
      ...additionalData
    });
  } catch (error) {
    logger.error('Failed to start Go Wild exploration:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to start exploration' 
    });
  }
});

// Get exploration session
router.get('/session/:farmId', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const session = await goWildManager.getSession(farmId);

    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: 'No active session found' 
      });
    }

    res.json({ 
      success: true, 
      data: session 
    });
  } catch (error) {
    logger.error('Failed to get session:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get session' 
    });
  }
});

// List all exploration sessions
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const sessions = await goWildManager.listSessions();
    res.json({ 
      success: true, 
      data: sessions 
    });
  } catch (error) {
    logger.error('Failed to list sessions:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to list sessions' 
    });
  }
});

// Get session details
router.get('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const session = await goWildManager.getSessionById(id);

    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: 'Session not found' 
      });
    }

    res.json({ 
      success: true, 
      data: session 
    });
  } catch (error) {
    logger.error('Failed to get session details:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get session details' 
    });
  }
});

// Pause exploration
router.put('/:sessionId/pause', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    await goWildManager.pauseExploration(sessionId);

    WebSocketManager.broadcast('goWild:paused', { sessionId });

    res.json({ 
      success: true, 
      message: 'Exploration paused' 
    });
  } catch (error) {
    logger.error('Failed to pause exploration:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to pause exploration' 
    });
  }
});

// Resume exploration
router.put('/:sessionId/resume', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    await goWildManager.resumeExploration(sessionId);

    WebSocketManager.broadcast('goWild:resumed', { sessionId });

    res.json({ 
      success: true, 
      message: 'Exploration resumed' 
    });
  } catch (error) {
    logger.error('Failed to resume exploration:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to resume exploration' 
    });
  }
});

// Stop exploration
router.put('/:sessionId/stop', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const summary = await goWildManager.stopExploration(sessionId);

    WebSocketManager.broadcast('goWild:stopped', { 
      sessionId, 
      summary 
    });

    res.json({ 
      success: true, 
      data: summary 
    });
  } catch (error) {
    logger.error('Failed to stop exploration:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to stop exploration' 
    });
  }
});

// Update configuration
router.put('/:sessionId/config', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const config = req.body;

    // Validate new boundaries
    const safetyCheck = await safetyManager.validateBoundaries(config.boundaries);
    if (!safetyCheck.isValid) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid safety boundaries', 
        details: safetyCheck.violations 
      });
    }

    await goWildManager.updateConfig(sessionId, config);

    WebSocketManager.broadcast('goWild:configUpdated', { 
      sessionId, 
      config 
    });

    res.json({ 
      success: true, 
      message: 'Configuration updated' 
    });
  } catch (error) {
    logger.error('Failed to update configuration:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update configuration' 
    });
  }
});

// Update boundaries
router.put('/sessions/:id/boundaries', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { boundaries } = req.body;

    const safetyCheck = await safetyManager.validateBoundaries(boundaries);
    if (!safetyCheck.isValid) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid safety boundaries', 
        details: safetyCheck.violations 
      });
    }

    await goWildManager.updateBoundaries(id, boundaries);

    WebSocketManager.broadcast('goWild:boundariesUpdated', { 
      sessionId: id, 
      boundaries 
    });

    res.json({ 
      success: true, 
      message: 'Boundaries updated' 
    });
  } catch (error) {
    logger.error('Failed to update boundaries:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update boundaries' 
    });
  }
});

// Get discoveries
router.get('/sessions/:id/discoveries', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const discoveries = await goWildManager.getDiscoveries(id);

    res.json({ 
      success: true, 
      data: discoveries 
    });
  } catch (error) {
    logger.error('Failed to get discoveries:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get discoveries' 
    });
  }
});

// Save discovery
router.post('/:sessionId/discovery/:discoveryId/save', async (req: Request, res: Response) => {
  try {
    const { sessionId, discoveryId } = req.params;
    await goWildManager.saveDiscovery(sessionId, discoveryId);

    WebSocketManager.broadcast('goWild:discoverySaved', { 
      sessionId, 
      discoveryId 
    });

    res.json({ 
      success: true, 
      message: 'Discovery saved' 
    });
  } catch (error) {
    logger.error('Failed to save discovery:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to save discovery' 
    });
  }
});

// Rollback to checkpoint
router.post('/sessions/:id/rollback/:checkpointId', async (req: Request, res: Response) => {
  try {
    const { id, checkpointId } = req.params;
    const result = await goWildManager.rollbackToCheckpoint(id, checkpointId);

    WebSocketManager.broadcast('goWild:rolledBack', { 
      sessionId: id, 
      checkpointId,
      result 
    });

    res.json({ 
      success: true, 
      data: result 
    });
  } catch (error) {
    logger.error('Failed to rollback:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to rollback' 
    });
  }
});

// Emergency stop all sessions
router.post('/emergency-stop', async (req: Request, res: Response) => {
  try {
    let results;
    
    if (USE_V2) {
      await goWildManagerV2.stopAll();
      results = goWildManagerV2.getActiveSessions().map(s => ({
        sessionId: s.id,
        status: 'stopped'
      }));
    } else {
      results = await goWildManager.emergencyStopAll();
    }

    WebSocketManager.broadcast('goWild:emergencyStop', { 
      timestamp: new Date(),
      results 
    });

    res.json({ 
      success: true, 
      message: 'Emergency stop executed',
      data: results 
    });
  } catch (error) {
    logger.error('Failed to execute emergency stop:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to execute emergency stop' 
    });
  }
});

// V2 Enhanced endpoints
router.get('/v2/metrics', async (req: Request, res: Response) => {
  try {
    if (!USE_V2) {
      return res.status(400).json({
        success: false,
        error: 'V2 services not enabled. Set GO_WILD_V2=true'
      });
    }
    
    const metrics = await enhancedIntegration.getDashboardMetrics();
    
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    logger.error('Failed to get V2 metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get metrics'
    });
  }
});

router.get('/v2/health', async (req: Request, res: Response) => {
  try {
    if (!USE_V2) {
      return res.status(400).json({
        success: false,
        error: 'V2 services not enabled'
      });
    }
    
    const health = enhancedIntegration.getSystemHealth();
    
    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error('Failed to get system health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get health status'
    });
  }
});

router.get('/v2/session/:sessionId', async (req: Request, res: Response) => {
  try {
    if (!USE_V2) {
      return res.status(400).json({
        success: false,
        error: 'V2 services not enabled'
      });
    }
    
    const { sessionId } = req.params;
    const sessionData = await enhancedIntegration.getGoWildSession(sessionId);
    
    res.json({
      success: true,
      data: sessionData
    });
  } catch (error) {
    logger.error('Failed to get V2 session:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get session'
    });
  }
});

router.put('/v2/session/:sessionId/stop', async (req: Request, res: Response) => {
  try {
    if (!USE_V2) {
      return res.status(400).json({
        success: false,
        error: 'V2 services not enabled'
      });
    }
    
    const { sessionId } = req.params;
    const result = await enhancedIntegration.stopGoWildSession(sessionId);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to stop V2 session:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to stop session'
    });
  }
});

export default router;