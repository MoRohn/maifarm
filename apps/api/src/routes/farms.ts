import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { farmService as farmManager } from '../services/unified/farmService';
const farmLauncher: any = {}; // Stub for missing service
import { unifiedOrchestratorService as orchestratorService } from '../services/UnifiedOrchestratorService';
import { goWildManager } from '../services/goWildManager';
import { seedManager } from '../services/seedManager';
import { validateFarmInput } from '../middleware/validation';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { Farm, FarmCreateInput, FarmUpdateInput } from '../types/farm';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'farm-context');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
    files: 10 // Max 10 files
  }
});

// Apply authentication to all routes
router.use(authenticateToken);

// Create a new farm (with optional file attachments)
router.post('/', 
  upload.array('files'), // Add multer middleware to handle files if present
  async (req: AuthRequest, res: Response) => {
  try {
    // Handle both JSON and multipart/form-data
    let farmData: FarmCreateInput;
    let contextFiles: any[] = [];
    
    // Debug logging
    console.log('[DEBUG] Request body:', req.body);
    console.log('[DEBUG] Files:', req.files ? `Yes (${(req.files as any[]).length})` : 'No');
    console.log('[DEBUG] Request headers content-type:', req.headers['content-type']);
    
    // Check if this is a multipart request with files
    if (req.files && Array.isArray(req.files)) {
      // Parse farm data from the multipart request
      if (!req.body.farmData) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Farm data is required when uploading files'
          }
        });
      }
      
      try {
        farmData = JSON.parse(req.body.farmData);
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_JSON',
            message: 'Invalid JSON in farmData field'
          }
        });
      }
      
      const files = req.files as Express.Multer.File[];
      
      // Process uploaded files
      contextFiles = files.map(file => ({
        originalName: file.originalname,
        filename: file.filename,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype
      }));
      
      console.log(`[Farms] Processing ${contextFiles.length} uploaded files`);
    } else {
      // Regular JSON request
      farmData = req.body;
    }
    
    // Validate farm data
    if (!farmData.name || typeof farmData.name !== 'string' || farmData.name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Farm name is required and must be a non-empty string'
        }
      });
    }
    
    const userId = req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';
    
    // Add file context to farm configuration if files were uploaded
    const enhancedFarmData = contextFiles.length > 0 ? {
      ...farmData,
      userId,
      createdBy: userId,
      config: {
        ...farmData.config,
        contextFiles: contextFiles,
        contextFilePaths: contextFiles.map(f => f.path)
      }
    } : {
      ...farmData,
      userId,
      createdBy: userId
    };
    
    const farm = await farmManager.createFarm(enhancedFarmData);

    // Emit WebSocket event
    req.app.get('wsServer')?.broadcast('farm:created', farm);

    res.status(201).json({
      success: true,
      data: farm,
      files: contextFiles.length
    });
  } catch (error) {
    console.error('Error creating farm:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create farm'
    });
  }
});

// Get all farms for the authenticated user
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';
    const farms = await farmManager.getUserFarms(userId);

    res.json({
      success: true,
      data: farms,
      count: farms.length
    });
  } catch (error) {
    console.error('Error fetching farms:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch farms'
    });
  }
});

// Get a specific farm by ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';
    
    const farm = await farmManager.getFarm(id, userId);
    
    if (!farm) {
      return res.status(404).json({
        success: false,
        error: 'Farm not found'
      });
    }

    res.json({
      success: true,
      data: {
        farm: farm
      }
    });
  } catch (error) {
    console.error('Error fetching farm:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch farm'
    });
  }
});

// Update a farm
router.put('/:id', validateFarmInput, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';
    const updateData: FarmUpdateInput = req.body;

    const farm = await farmManager.updateFarm(id, userId, updateData);
    
    if (!farm) {
      return res.status(404).json({
        success: false,
        error: 'Farm not found'
      });
    }

    // Emit WebSocket event
    req.app.get('wsServer')?.broadcast('farm:updated', farm);

    res.json({
      success: true,
      data: farm
    });
  } catch (error) {
    console.error('Error updating farm:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update farm'
    });
  }
});

// Delete a farm
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';
    console.log(`[Delete] Starting deletion of farm ${id}`);

    // Get farm to check for multi-claude process
    const farm = await farmManager.getFarm(id, userId);
    console.log(`[Delete] Farm found:`, farm ? 'Yes' : 'No');
    if (farm && farm.config) {
      console.log(`[Delete] Farm config has contextFiles:`, farm.config.contextFiles ? 'Yes' : 'No');
    }
    
    // Clean up tmux session if it exists
    if (farm) {
      // Try multiple approaches to stop the farm
      
      // 1. Try using farmLauncher to stop the farm
      try {
        // farmLauncher already imported at top
        // farmLauncher expects the short version of the farmId
        const shortId = id.substring(0, 8);
        const stopResult = await farmLauncher.stopFarm(shortId);
        if (stopResult.success) {
          console.log(`[Delete] Stopped farm ${id} via farmLauncher`);
        } else {
          console.log(`[Delete] farmLauncher.stopFarm returned:`, stopResult.message);
        }
      } catch (launcherError) {
        console.error('[Delete] Error using farmLauncher:', launcherError);
      }
      
      // 2. Try to stop tmux session directly (with force option)
      const sessionName = `farm_${id.substring(0, 8)}`;
      try {
        // exec already imported at top
        
        // First try to kill the session normally
        await new Promise((resolve) => {
          exec(`tmux kill-session -t ${sessionName} 2>/dev/null`, (error) => {
            if (!error || error.code === 1) { // Code 1 means session not found, which is ok
              console.log(`[Delete] Killed tmux session ${sessionName} (or not found)`);
            } else {
              console.log(`[Delete] First attempt to kill tmux session failed, trying force kill`);
            }
            resolve(true);
          });
        });
        
        // Also try to kill any panes associated with the session
        await new Promise((resolve) => {
          exec(`tmux list-panes -t ${sessionName} 2>/dev/null | awk '{print $1}' | sed 's/://' | xargs -I {} tmux kill-pane -t ${sessionName}:{} 2>/dev/null`, () => {
            resolve(true);
          });
        });
        
        // Kill any lingering claude processes associated with this farm
        await new Promise((resolve) => {
          exec(`ps aux | grep "claude.*${sessionName}" | grep -v grep | awk '{print $2}' | xargs -r kill -9 2>/dev/null`, () => {
            resolve(true);
          });
        });
        
      } catch (tmuxError) {
        console.error('[Delete] Error killing tmux session:', tmuxError);
      }
      
      // 3. Try orchestratorService if processId exists
      if (farm.config?.processId) {
        try {
          // orchestratorService already imported at top
          await orchestratorService.stopFarm(farm.config.processId);
          console.log(`[Delete] Stopped multi-claude process ${farm.config.processId}`);
        } catch (stopError) {
          console.error('[Delete] Error stopping multi-claude process:', stopError);
        }
      }
      
      // 4. Clean up any uploaded files
      if (farm.config?.contextFiles && Array.isArray(farm.config.contextFiles)) {
        console.log(`[Delete] Found ${farm.config.contextFiles.length} context files to clean up`);
        // fs already imported at top as fs/promises
        for (const file of farm.config.contextFiles) {
          if (file.path) {
            try {
              console.log(`[Delete] Attempting to delete file: ${file.path}`);
              await fs.unlink(file.path);
              console.log(`[Delete] Successfully deleted uploaded file: ${file.path}`);
            } catch (fileError) {
              console.error(`[Delete] Error deleting file ${file.path}:`, fileError);
            }
          }
        }
      } else {
        console.log(`[Delete] No context files found for farm ${id}`);
      }
    }

    const deleted = await farmManager.deleteFarm(id, userId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Farm not found'
      });
    }

    // Emit WebSocket event
    req.app.get('wsServer')?.broadcast('farm:deleted', { id });

    res.json({
      success: true,
      message: 'Farm and all agents deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting farm:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete farm'
    });
  }
});

// Start a farm
router.post('/:id/start', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';

    const farm = await farmManager.startFarm(id, userId);
    
    if (!farm) {
      return res.status(404).json({
        success: false,
        error: 'Farm not found'
      });
    }

    // Emit WebSocket event
    req.app.get('wsServer')?.broadcast('farm:started', farm);

    res.json({
      success: true,
      data: farm
    });
  } catch (error) {
    console.error('Error starting farm:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start farm'
    });
  }
});

// Launch a farm with multi-claude agents
router.post('/:id/launch', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { numberOfAgents = 3, collaborative = false, bundleSteps, goWildMode = false, prompt, provider } = req.body;
    const userId = req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';

    // Get farm details
    const farm = await farmManager.getFarm(id, userId);
    
    if (!farm) {
      return res.status(404).json({
        success: false,
        error: 'Farm not found'
      });
    }

    // Check if this is Go Wild mode
    if (goWildMode) {
      // Use goWildManager for Go Wild mode
      // goWildManager already imported at top
      
      try {
        // Start Go Wild exploration
        const goWildConfig = {
          creativityLevel: 80, // High creativity for Go Wild
          explorationDepth: numberOfAgents || 5,
          maxDuration: 30, // 30 minutes default
          boundaries: [],
          focusAreas: [],
          seedPrompt: prompt || farm.description || farm.name
        };
        
        const session = await goWildManager.startExploration(id, goWildConfig);
        
        // Update farm status
        await farmManager.updateFarm(id, userId, { 
          status: 'running',
          config: {
            ...farm.config,
            goWildMode: true,
            goWildSessionId: session.id
          }
        });
        
        res.json({
          success: true,
          message: 'Go Wild exploration started',
          farmId: id,
          sessionId: session.id,
          agents: numberOfAgents
        });
        
        return; // Exit early for Go Wild mode
      } catch (goWildError) {
        console.error('Failed to start Go Wild exploration:', goWildError);
        return res.status(500).json({
          success: false,
          error: 'Failed to start Go Wild exploration'
        });
      }
    }

    // Regular farm launch (non-Go Wild)
    // Import farmLauncher
    const { farmLauncher } = require('../services/unified/farmService');

    // Prepare launch options
    const launchOptions = {
      farmId: id,
      numberOfAgents,
      prompt: prompt || farm.description || farm.name,
      contextFiles: farm.config?.contextFilePaths || [],
      collaborative,
      bundleSteps,
      provider: provider || 'claude'
    };

    // Launch the farm
    const result = await farmLauncher.launchFarm(launchOptions);

    if (result.success) {
      // Update farm status
      await farmManager.updateFarm(id, userId, { status: 'running' });
      
      // Emit WebSocket event
      req.app.get('wsServer')?.broadcast('farm:launched', { id, agents: numberOfAgents });

      res.json({
        success: true,
        message: result.message,
        farmId: id,
        agents: numberOfAgents
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.message
      });
    }
  } catch (error) {
    console.error('Error launching farm:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to launch farm agents'
    });
  }
});

// Stop a farm
router.post('/:id/stop', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';

    const farm = await farmManager.stopFarm(id, userId);
    
    if (!farm) {
      return res.status(404).json({
        success: false,
        error: 'Farm not found'
      });
    }

    // Emit WebSocket event
    req.app.get('wsServer')?.broadcast('farm:stopped', farm);

    res.json({
      success: true,
      data: farm
    });
  } catch (error) {
    console.error('Error stopping farm:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop farm'
    });
  }
});

// Get multi-claude status for a farm
router.get('/:id/multi-claude/status', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';
    
    const farm = await farmManager.getFarm(id, userId);
    
    if (!farm) {
      return res.status(404).json({
        success: false,
        error: 'Farm not found'
      });
    }

    // Get actual status from orchestratorService
    const { orchestratorService } = require('../services/unified/farmService');
    const status = await orchestratorService.getStatus(id);
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Error fetching multi-claude status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch multi-claude status'
    });
  }
});

// Start multi-claude process for a farm
router.post('/:id/multi-claude/start', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';
    
    const farm = await farmManager.startFarm(id, userId);
    
    if (!farm) {
      return res.status(404).json({
        success: false,
        error: 'Farm not found'
      });
    }

    res.json({
      success: true,
      data: {
        farmId: id,
        status: 'starting',
        message: 'Multi-claude process starting'
      }
    });
  } catch (error) {
    console.error('Error starting multi-claude:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start multi-claude process'
    });
  }
});

// Stop multi-claude process for a farm
router.post('/:id/multi-claude/stop', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';
    
    const farm = await farmManager.stopFarm(id, userId);
    
    if (!farm) {
      return res.status(404).json({
        success: false,
        error: 'Farm not found'
      });
    }

    res.json({
      success: true,
      data: {
        farmId: id,
        status: 'stopped',
        message: 'Multi-claude process stopped'
      }
    });
  } catch (error) {
    console.error('Error stopping multi-claude:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop multi-claude process'
    });
  }
});

// Create a farm from a seed
router.post('/from-seed', async (req: AuthRequest, res: Response) => {
  try {
    const { seedId, farmName, description, config } = req.body;
    const userId = req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';

    if (!seedId || !farmName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: seedId and farmName'
      });
    }

    // Get the seed
    // seedManager already imported at top
    const seed = await seedManager.getSeed(seedId, userId);
    
    if (!seed) {
      return res.status(404).json({
        success: false,
        error: 'Seed not found or unauthorized'
      });
    }

    // Create farm from seed
    const farmData: FarmCreateInput = {
      name: farmName,
      description: description || `Farm created from seed: ${seed.name}`,
      type: seed.farmType,
      config: {
        yaml: seed.yaml,
        ...config // Allow overriding default config
      },
      seedId: seedId,
      tags: [...(seed.tags || []), 'from-seed']
    };

    const farm = await farmManager.createFarm({
      ...farmData,
      userId,
      createdBy: userId
    });

    // Record seed usage
    await seedManager.recordSeedUsage(seedId, true);

    // Emit WebSocket event
    req.app.get('wsServer')?.broadcast('farm:created-from-seed', { farm, seed });

    res.status(201).json({
      success: true,
      data: farm,
      seed: {
        id: seed.id,
        name: seed.name,
        category: seed.category
      }
    });
  } catch (error) {
    console.error('Error creating farm from seed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create farm from seed'
    });
  }
});

// Archive a farm
router.post('/:id/archive', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason, notes, category, tags, isPublic } = req.body;
    const userId = req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';

    // Import archive service
    const { farmArchiveService } = await import('../services/farmArchiveService');

    const archiveId = await farmArchiveService.archiveFarm({
      farmId: id,
      userId,
      reason,
      notes,
      category,
      tags,
      isPublic
    });

    // Emit WebSocket event
    req.app.get('wsServer')?.broadcast('farm:archived', {
      farmId: id,
      archiveId,
      archivedAt: new Date()
    });

    res.json({
      success: true,
      data: {
        archiveId,
        farmId: id,
        message: 'Farm archived successfully'
      }
    });
  } catch (error: any) {
    console.error('Error archiving farm:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to archive farm'
    });
  }
});

// Get archived farms
router.get('/archived', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const {
      search,
      category,
      tags,
      archivedBy,
      dateFrom,
      dateTo,
      isPublic,
      isPinned,
      minQualityScore,
      sortBy = 'archived_at',
      sortOrder = 'desc',
      limit = 20,
      offset = 0
    } = req.query;

    // Import archive service
    const { farmArchiveService } = await import('../services/farmArchiveService');

    const filter = {
      userId: isPublic === 'true' ? undefined : userId,
      search: search as string,
      category: category as string,
      tags: tags ? (tags as string).split(',') : undefined,
      archivedBy: archivedBy as string,
      dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
      dateTo: dateTo ? new Date(dateTo as string) : undefined,
      isPublic: isPublic === 'true',
      isPinned: isPinned === 'true',
      minQualityScore: minQualityScore ? parseFloat(minQualityScore as string) : undefined,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc',
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    };

    const result = await farmArchiveService.getArchivedFarms(filter);

    res.json({
      success: true,
      data: result.archives,
      total: result.total,
      page: Math.floor((offset as any) / (limit as any)) + 1,
      pageSize: limit
    });
  } catch (error) {
    console.error('Error fetching archived farms:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch archived farms'
    });
  }
});

// Get specific archived farm details
router.get('/archived/:archiveId', async (req: AuthRequest, res: Response) => {
  try {
    const { archiveId } = req.params;

    // Import archive service
    const { farmArchiveService } = await import('../services/farmArchiveService');

    const archive = await farmArchiveService.getArchivedFarm(archiveId);

    if (!archive) {
      return res.status(404).json({
        success: false,
        error: 'Archived farm not found'
      });
    }

    res.json({
      success: true,
      data: archive
    });
  } catch (error) {
    console.error('Error fetching archived farm:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch archived farm'
    });
  }
});

// Restore archived farm
router.post('/:id/restore', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';

    // Import archive service
    const { farmArchiveService } = await import('../services/farmArchiveService');

    const success = await farmArchiveService.restoreFarm(id, userId);

    if (!success) {
      return res.status(400).json({
        success: false,
        error: 'Failed to restore farm'
      });
    }

    // Emit WebSocket event
    req.app.get('wsServer')?.broadcast('farm:restored', {
      farmId: id,
      restoredAt: new Date()
    });

    res.json({
      success: true,
      message: 'Farm restored successfully'
    });
  } catch (error: any) {
    console.error('Error restoring farm:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to restore farm'
    });
  }
});

// Get archive statistics
router.get('/archived/stats', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    // Import archive service
    const { farmArchiveService } = await import('../services/farmArchiveService');

    const stats = await farmArchiveService.getArchiveStats(userId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching archive stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch archive statistics'
    });
  }
});

// Update archived farm metadata
router.patch('/archived/:archiveId', async (req: AuthRequest, res: Response) => {
  try {
    const { archiveId } = req.params;
    const updates = req.body;

    // Import archive service
    const { farmArchiveService } = await import('../services/farmArchiveService');

    const success = await farmArchiveService.updateArchive(archiveId, updates);

    if (!success) {
      return res.status(400).json({
        success: false,
        error: 'Failed to update archive'
      });
    }

    res.json({
      success: true,
      message: 'Archive updated successfully'
    });
  } catch (error) {
    console.error('Error updating archive:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update archive'
    });
  }
});

// Delete archived farm permanently
router.delete('/archived/:archiveId', async (req: AuthRequest, res: Response) => {
  try {
    const { archiveId } = req.params;

    // Import archive service
    const { farmArchiveService } = await import('../services/farmArchiveService');

    const success = await farmArchiveService.deleteArchivedFarm(archiveId);

    if (!success) {
      return res.status(400).json({
        success: false,
        error: 'Failed to delete archive'
      });
    }

    res.json({
      success: true,
      message: 'Archive deleted permanently'
    });
  } catch (error) {
    console.error('Error deleting archive:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete archive'
    });
  }
});

// Get orchestrator health status for a farm
router.get('/:id/health', async (req: AuthRequest, res: Response) => {
  try {
    const farmId = req.params.id;

    // Import orchestratorHealthMonitor
    const { orchestratorHealthMonitor } = await import('../services/OrchestratorHealthMonitor');

    // Get current health status
    const healthStatus = await orchestratorHealthMonitor.getHealthStatus(farmId);

    if (!healthStatus) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'HEALTH_STATUS_NOT_FOUND',
          message: 'No health status available for this farm. Farm may not be running or health monitoring not started.'
        }
      });
    }

    res.json({
      success: true,
      data: healthStatus
    });

  } catch (error) {
    console.error('Error fetching farm health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch farm health status'
    });
  }
});

export default router;