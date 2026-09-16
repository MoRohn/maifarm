import { Router } from 'express';
import { ApiResponse } from '../types/api';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { apiRateLimits } from '../middleware/rateLimit';
import { expensiveRateLimit } from '../middleware/rateLimiter';
import { v4 as uuidv4 } from 'uuid';
import { goWildManager } from '../services/goWildManager';
import { farmService as farmManager } from '../services/unified/farmService';
import { unifiedOrchestratorService as orchestratorService } from '../services/unified/orchestratorService';
import { structuredLogger as logger, LogCategory } from '../utils/structuredLogger';
import { validateAgentCount, FarmMode } from '../utils/agentCountValidator';
import multer from 'multer';
import path from 'path';
import { fileManager } from '../services/fileManagerService';

const router = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 5 // Maximum 5 files
  },
  fileFilter: (req, file, cb) => {
    // Accept common file types
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'text/plain', 'text/markdown', 'text/html', 'text/css',
      'application/json', 'application/pdf',
      'application/javascript', 'application/typescript',
      'text/javascript', 'text/x-python', 'text/x-java'
    ];
    
    const allowedExtensions = [
      '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c',
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

// Apply authentication to all routes
router.use(authenticateToken);

// POST /api/go-wild - Launch GoWild exploration
router.post('/', upload.array('files', 5), requirePermission(['farms:create']), expensiveRateLimit.middleware(), async (req, res) => {
  try {
    const { prompt, timeout = 1800, autoScale = true, maxAgents = 5, creativityLevel = 7, boundaries = [] } = req.body;
    const uploadedFiles = req.files as Express.Multer.File[];
    const userId = (req as any).user?.id || 'system';

    // FIX: Comprehensive input validation for GoWild parameters
    const validationErrors: string[] = [];

    // Prompt validation
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      validationErrors.push('Exploration prompt is required and must be a non-empty string');
    } else if (prompt.length > 10000) {
      validationErrors.push('Prompt must be less than 10000 characters');
    }

    // Timeout validation (30 seconds to 6 hours)
    const parsedTimeout = Number(timeout);
    if (isNaN(parsedTimeout) || parsedTimeout < 30 || parsedTimeout > 21600) {
      validationErrors.push('Timeout must be a number between 30 and 21600 seconds (30 seconds to 6 hours)');
    }

    // MaxAgents validation (1-20 for GoWild)
    const parsedMaxAgents = Number(maxAgents);
    if (isNaN(parsedMaxAgents) || parsedMaxAgents < 1 || parsedMaxAgents > 20) {
      validationErrors.push('maxAgents must be a number between 1 and 20');
    }

    // Creativity level validation (1-10)
    const parsedCreativity = Number(creativityLevel);
    if (isNaN(parsedCreativity) || parsedCreativity < 1 || parsedCreativity > 10) {
      validationErrors.push('creativityLevel must be a number between 1 and 10');
    }

    // Boundaries validation
    if (!Array.isArray(boundaries)) {
      validationErrors.push('Boundaries must be an array');
    } else if (boundaries.length > 50) {
      validationErrors.push('Maximum 50 boundaries allowed');
    } else if (boundaries.some(b => typeof b !== 'string' || b.length > 500)) {
      validationErrors.push('Each boundary must be a string of max 500 characters');
    }

    // AutoScale validation
    if (typeof autoScale !== 'boolean' && autoScale !== 'true' && autoScale !== 'false') {
      validationErrors.push('autoScale must be a boolean');
    }

    if (validationErrors.length > 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validationErrors.join('; ')
        }
      };
      return res.status(400).json(response);
    }

    logger.info(LogCategory.FARM, '[GoWild API] Starting GoWild exploration', {
      prompt: prompt.substring(0, 100),
      timeout,
      autoScale,
      maxAgents,
      creativityLevel,
      filesCount: uploadedFiles?.length || 0
    });

    // Validate agent count for GoWild mode
    const validatedAgentCount = validateAgentCount(FarmMode.GO_WILD, maxAgents);

    // Create a farm for the GoWild session
    const farmId = uuidv4();
    const farmName = `GoWild: ${prompt.substring(0, 50)}...`;
    
    // Handle file uploads if present
    let contextFiles: string[] = [];
    if (uploadedFiles && uploadedFiles.length > 0) {
      const workspacePath = await fileManager.createFarmWorkspace(farmId);
      
      for (const file of uploadedFiles) {
        const filePath = path.join(workspacePath, file.originalname);
        await fileManager.saveFile(filePath, file.buffer);
        contextFiles.push(filePath);
      }
      
      logger.info(LogCategory.FARM, `[GoWild API] Saved ${uploadedFiles.length} context files`);
    }

    // Create the farm in database
    const farm = await farmManager.createFarm({
      id: farmId,
      name: farmName,
      description: prompt,
      type: 'autonomous',
      mode: 'go_wild', // CRITICAL: Set mode to go_wild, not harvest
      provider: 'claude', // GoWild primarily uses Claude
      config: {
        maxAgents: validatedAgentCount,
        autoScale,
        timeout,
        goWildMode: {
          enabled: true,
          creativityLevel,
          boundaries
        }
      },
      metadata: {
        isGoWild: true,
        creativityLevel,
        boundaries,
        contextFiles
      },
      userId,
      createdBy: userId
    });

    logger.info(LogCategory.FARM, '[GoWild API] Farm created', { farmId });

    // Start GoWild exploration
    const goWildConfig = {
      prompt,
      creativityLevel,
      boundaries,
      maxIterations: Math.floor(timeout / 60), // Roughly 1 iteration per minute
      autoBacktrack: true,
      contextFiles
    };

    // Launch the farm with GoWild configuration
    const launchResult = await orchestratorService.launchFarm({
      farmId,
      name: farmName,
      description: prompt,
      numberOfAgents: validatedAgentCount,
      prompt,
      mode: 'go-wild',
      timeout: timeout * 1000, // Convert to milliseconds
      provider: 'claude',
      collaborative: true,
      contextFiles
    });

    logger.info(LogCategory.FARM, '[GoWild API] Farm launched', {
      farmId,
      sessionName: launchResult
    });

    // Start GoWild exploration session
    const session = await goWildManager.startExploration(farmId, goWildConfig);

    logger.info(LogCategory.FARM, '[GoWild API] GoWild session started', {
      farmId,
      sessionId: session.id
    });

    const response: ApiResponse = {
      success: true,
      data: {
        farmId,
        sessionId: session.id,
        farm,
        session,
        launchResult
      },
      farmId // Top-level for compatibility
    };

    res.status(201).json(response);
  } catch (error: any) {
    logger.error(LogCategory.FARM, '[GoWild API] Failed to start exploration', { error });
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error?.message || 'Failed to start GoWild exploration'
      }
    };
    
    res.status(500).json(response);
  }
});

// GET /api/go-wild/:farmId/status - Get GoWild session status
router.get('/:farmId/status', apiRateLimits.read, async (req, res) => {
  try {
    const { farmId } = req.params;
    
    const session = await goWildManager.getSession(farmId);
    
    if (!session) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'GoWild session not found'
        }
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: session
    };

    res.json(response);
  } catch (error: any) {
    logger.error(LogCategory.FARM, '[GoWild API] Failed to get session status', { error });
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error?.message || 'Failed to get session status'
      }
    };
    
    res.status(500).json(response);
  }
});

// POST /api/go-wild/:farmId/stop - Stop GoWild exploration
router.post('/:farmId/stop', requirePermission(['farms:update']), apiRateLimits.update, async (req, res) => {
  try {
    const { farmId } = req.params;
    
    await goWildManager.stopExploration(farmId);
    
    const response: ApiResponse = {
      success: true,
      data: { message: 'GoWild exploration stopped' }
    };

    res.json(response);
  } catch (error: any) {
    logger.error(LogCategory.FARM, '[GoWild API] Failed to stop exploration', { error });
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error?.message || 'Failed to stop exploration'
      }
    };
    
    res.status(500).json(response);
  }
});

export { router as goWildRouter };