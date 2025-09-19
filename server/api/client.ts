import { Router } from 'express';
import { ApiResponse } from '../types/api';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { apiRateLimits } from '../middleware/rateLimit';
import { db } from '../database/connection';
import { farmService as farmManager } from '../services/unified/farmService';
import { harvestService } from '../services/unified/harvestService';
import { quickTaskService } from '../services/unified/quickTaskService';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';

const router = Router();

// Configure multer for client uploads with macOS/iOS format support
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'client');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // Preserve original extension for processing
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for desktop client uploads
    files: 10 // Max 10 files per request for desktop clients
  },
  fileFilter: (req, file, cb) => {
    // Accept common macOS/iOS formats including HEIC
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/heic',
      'image/heif',
      'video/mp4',
      'video/quicktime',
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/json',
      'application/yaml',
      'text/yaml',
      'application/x-yaml',
      'text/x-yaml'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Apply authentication to all client routes
router.use(authenticateToken);

/**
 * GET /api/client/farms
 * Optimized farm list for desktop/tablet clients with pagination
 */
router.get('/farms', apiRateLimits.read, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const userId = req.user?.userId || 'maifarm-user';
    
    const offset = (Number(page) - 1) * Number(limit);
    
    // Get farms with minimal data for mobile
    const result = await db.query(
      `SELECT 
        id, 
        name, 
        description, 
        status, 
        (config->>'provider')::text as provider,
        (config->>'maxAgents')::int as max_agents,
        created_at,
        updated_at
      FROM farms 
      WHERE created_by = $1
      ORDER BY updated_at DESC
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    
    // Get total count
    const countResult = await db.query(
      'SELECT COUNT(*) FROM farms WHERE created_by = $1',
      [userId]
    );
    
    const response: ApiResponse = {
      success: true,
      data: {
        farms: result.rows.map(row => ({
          id: row.id,
          name: row.name,
          description: row.description,
          status: row.status,
          provider: row.provider || 'claude',
          maxAgents: row.max_agents || 3,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        })),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: parseInt(countResult.rows[0].count),
          hasMore: offset + Number(limit) < parseInt(countResult.rows[0].count)
        }
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching mobile farms:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch farms'
      }
    });
  }
});

/**
 * POST /api/client/quick-task
 * Quick task creation for desktop/tablet clients
 */
router.post('/quick-task', 
  upload.array('attachments'), 
  apiRateLimits.write, 
  async (req: AuthRequest, res) => {
  try {
    const { prompt, type = 'general' } = req.body;
    const userId = req.user?.userId || 'maifarm-user';
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Prompt is required'
        }
      });
    }
    
    // Process uploaded files
    let attachments = [];
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        let processedPath = file.path;
        
        // Convert HEIC to JPEG if needed
        if (file.mimetype === 'image/heic' || file.mimetype === 'image/heif') {
          const jpegPath = file.path.replace(/\.(heic|heif)$/i, '.jpg');
          try {
            await sharp(file.path)
              .jpeg({ quality: 90 })
              .toFile(jpegPath);
            processedPath = jpegPath;
            // Delete original HEIC file
            await fs.unlink(file.path);
          } catch (error) {
            console.error('Failed to convert HEIC:', error);
          }
        }
        
        // Generate thumbnail for images
        let thumbnailPath = null;
        if (file.mimetype.startsWith('image/')) {
          const thumbPath = processedPath.replace(/(\.[^.]+)$/, '_thumb$1');
          try {
            await sharp(processedPath)
              .resize(200, 200, { fit: 'cover' })
              .toFile(thumbPath);
            thumbnailPath = thumbPath;
          } catch (error) {
            console.error('Failed to create thumbnail:', error);
          }
        }
        
        attachments.push({
          originalName: file.originalname,
          path: processedPath,
          thumbnailPath,
          mimeType: file.mimetype === 'image/heic' ? 'image/jpeg' : file.mimetype,
          size: file.size
        });
      }
    }
    
    // Create quick task
    const task = await quickTaskService.createQuickTask({
      prompt,
      type,
      attachments,
      userId,
      source: 'mobile',
      config: {
        timeout: 300000, // 5 minutes
        maxAgents: 1,
        provider: 'claude'
      }
    });
    
    const response: ApiResponse = {
      success: true,
      data: {
        taskId: task.id,
        status: task.status,
        estimatedTime: 300,
        message: 'Task created successfully'
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error creating mobile quick task:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create task'
      }
    });
  }
});

/**
 * POST /api/client/upload
 * Streamlined file upload with progress tracking
 */
router.post('/upload', 
  upload.single('file'), 
  apiRateLimits.write, 
  async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_FILE',
          message: 'No file uploaded'
        }
      });
    }
    
    let processedFile = {
      id: uuidv4(),
      originalName: req.file.originalname,
      path: req.file.path,
      mimeType: req.file.mimetype,
      size: req.file.size,
      thumbnailUrl: null as string | null
    };
    
    // Process HEIC images
    if (req.file.mimetype === 'image/heic' || req.file.mimetype === 'image/heif') {
      const jpegPath = req.file.path.replace(/\.(heic|heif)$/i, '.jpg');
      await sharp(req.file.path)
        .jpeg({ quality: 90 })
        .toFile(jpegPath);
      
      processedFile.path = jpegPath;
      processedFile.mimeType = 'image/jpeg';
      
      // Clean up original
      await fs.unlink(req.file.path);
    }
    
    // Generate thumbnail for images
    if (processedFile.mimeType.startsWith('image/')) {
      const thumbPath = processedFile.path.replace(/(\.[^.]+)$/, '_thumb$1');
      await sharp(processedFile.path)
        .resize(200, 200, { fit: 'cover' })
        .toFile(thumbPath);
      
      // Convert to URL path
      processedFile.thumbnailUrl = `/uploads/client/${path.basename(thumbPath)}`;
    }
    
    const response: ApiResponse = {
      success: true,
      data: {
        file: {
          id: processedFile.id,
          name: processedFile.originalName,
          url: `/uploads/client/${path.basename(processedFile.path)}`,
          thumbnailUrl: processedFile.thumbnailUrl,
          mimeType: processedFile.mimeType,
          size: processedFile.size
        }
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error handling mobile upload:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message: 'Failed to process upload'
      }
    });
  }
});

/**
 * GET /api/client/harvests
 * Get recent harvests with minimal data
 */
router.get('/harvests', apiRateLimits.read, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const userId = req.user?.userId || 'maifarm-user';
    
    const harvests = await harvestService.getUserHarvests(userId, {
      page: Number(page),
      limit: Number(limit),
      fields: ['id', 'farmName', 'status', 'completedAt', 'summary']
    });
    
    const response: ApiResponse = {
      success: true,
      data: harvests
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching mobile harvests:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch harvests'
      }
    });
  }
});

/**
 * GET /api/client/status
 * Get overall system status for client dashboard
 */
router.get('/status', apiRateLimits.read, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.userId || 'maifarm-user';
    
    // Get counts
    const [farmsResult, harvestsResult, tasksResult] = await Promise.all([
      db.query('SELECT COUNT(*) as total, COUNT(CASE WHEN status = $1 THEN 1 END) as active FROM farms WHERE created_by = $2', ['active', userId]),
      db.query('SELECT COUNT(*) as total, COUNT(CASE WHEN status = $1 THEN 1 END) as completed FROM harvests WHERE user_id = $2', ['completed', userId]),
      db.query('SELECT COUNT(*) as total FROM tasks WHERE user_id = $1 AND created_at > NOW() - INTERVAL \'24 hours\'', [userId])
    ]);
    
    const response: ApiResponse = {
      success: true,
      data: {
        farms: {
          total: parseInt(farmsResult.rows[0].total),
          active: parseInt(farmsResult.rows[0].active)
        },
        harvests: {
          total: parseInt(harvestsResult.rows[0].total),
          completed: parseInt(harvestsResult.rows[0].completed)
        },
        recentTasks: parseInt(tasksResult.rows[0].total),
        timestamp: new Date()
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching mobile status:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch status'
      }
    });
  }
});

/**
 * POST /api/client/device
 * Register client device for push notifications (macOS/iOS)
 */
router.post('/device', apiRateLimits.write, async (req: AuthRequest, res) => {
  try {
    const { deviceToken, platform, deviceId } = req.body;
    const userId = req.user?.userId || 'maifarm-user';
    
    if (!deviceToken || !platform || !deviceId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Device token, platform, and device ID are required'
        }
      });
    }
    
    // Store device information
    await db.query(
      `INSERT INTO user_devices (user_id, device_id, device_token, platform, last_seen)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, device_id) 
       DO UPDATE SET 
         device_token = EXCLUDED.device_token,
         platform = EXCLUDED.platform,
         last_seen = NOW()`,
      [userId, deviceId, deviceToken, platform]
    );
    
    const response: ApiResponse = {
      success: true,
      data: {
        message: 'Device registered successfully',
        deviceId
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error registering device:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to register device'
      }
    });
  }
});

/**
 * POST /api/client/farm/launch
 * Launch a farm with multiple agents - desktop specific with more options
 */
router.post('/farm/launch', 
  upload.array('contextFiles'), 
  apiRateLimits.write, 
  async (req: AuthRequest, res) => {
  try {
    const { 
      name,
      prompt, 
      agentCount = 3,
      provider = 'claude',
      collaborative = true,
      timeout = 3600,
      yamlConfig
    } = req.body;
    
    const userId = req.user?.userId || 'maifarm-user';
    
    if (!name || !prompt) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Name and prompt are required'
        }
      });
    }
    
    // Process context files
    let contextFiles = [];
    if (req.files && Array.isArray(req.files)) {
      contextFiles = req.files.map(file => ({
        originalName: file.originalname,
        path: file.path,
        mimeType: file.mimetype,
        size: file.size
      }));
    }
    
    // Create farm
    const farm = await farmManager.createFarm({
      name,
      description: prompt,
      type: collaborative ? 'collaborative' : 'sequential',
      config: {
        maxAgents: agentCount,
        timeout,
        provider,
        yaml: yamlConfig,
        contextFiles
      },
      userId
    });
    
    // Launch the farm using XenoSync (legacy multiClaudeService wrapper maintained for compatibility)
    const { multiClaudeService } = await import('../services/multiClaudeService');
    const processId = await multiClaudeService.launchFarm({
      farmId: farm.id,
      name: farm.name,
      description: prompt,
      numberOfAgents: agentCount,
      prompt,
      yamlContent: yamlConfig,
      collaborative,
      provider,
      contextFiles: contextFiles.map(f => f.path),
      timeout: timeout * 1000 // Convert to milliseconds
    });
    
    const response: ApiResponse = {
      success: true,
      data: {
        farmId: farm.id,
        processId,
        status: 'launching',
        message: `Farm "${name}" is being launched with ${agentCount} agents`
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error launching farm:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'LAUNCH_ERROR',
        message: 'Failed to launch farm'
      }
    });
  }
});

/**
 * GET /api/client/farm/:id/terminal
 * Get terminal output for a specific farm agent - desktop feature
 */
router.get('/farm/:farmId/terminal/:agentId', 
  apiRateLimits.read, 
  async (req: AuthRequest, res) => {
  try {
    const { farmId, agentId } = req.params;
    const { lines = 100 } = req.query;
    
    // Get terminal output from tmux
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const sessionName = `farm-${farmId.substring(0, 8)}`;
    const paneId = `${sessionName}:0.${agentId}`;
    
    try {
      const { stdout } = await execAsync(
        `tmux capture-pane -t ${paneId} -p -S -${lines}`
      );
      
      const response: ApiResponse = {
        success: true,
        data: {
          farmId,
          agentId,
          output: stdout,
          lines: stdout.split('\n').length
        }
      };
      
      res.json(response);
    } catch (error) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Terminal session not found'
        }
      });
    }
  } catch (error) {
    console.error('Error fetching terminal output:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch terminal output'
      }
    });
  }
});

/**
 * POST /api/client/workspace/sync
 * Sync workspace files between client and server - desktop feature
 */
router.post('/workspace/sync', 
  upload.array('files'), 
  apiRateLimits.write, 
  async (req: AuthRequest, res) => {
  try {
    const { farmId, syncDirection = 'upload' } = req.body;
    const userId = req.user?.userId || 'maifarm-user';
    
    if (!farmId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Farm ID is required'
        }
      });
    }
    
    if (syncDirection === 'upload') {
      // Upload files to server workspace
      const files = req.files as Express.Multer.File[];
      const workspacePath = path.join(process.cwd(), 'maibarn', 'workspaces', 'active', farmId);
      
      await fs.mkdir(workspacePath, { recursive: true });
      
      for (const file of files) {
        const destPath = path.join(workspacePath, file.originalname);
        await fs.rename(file.path, destPath);
      }
      
      res.json({
        success: true,
        data: {
          filesUploaded: files.length,
          workspacePath
        }
      });
    } else {
      // Download workspace files to client
      const workspacePath = path.join(process.cwd(), 'maibarn', 'workspaces', 'active', farmId);
      
      try {
        const files = await fs.readdir(workspacePath);
        const fileList = [];
        
        for (const file of files) {
          const filePath = path.join(workspacePath, file);
          const stats = await fs.stat(filePath);
          
          if (stats.isFile()) {
            fileList.push({
              name: file,
              size: stats.size,
              modified: stats.mtime,
              url: `/api/client/workspace/${farmId}/download/${file}`
            });
          }
        }
        
        res.json({
          success: true,
          data: {
            files: fileList,
            totalFiles: fileList.length
          }
        });
      } catch (error) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Workspace not found'
          }
        });
      }
    }
  } catch (error) {
    console.error('Error syncing workspace:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SYNC_ERROR',
        message: 'Failed to sync workspace'
      }
    });
  }
});

/**
 * GET /api/client/workspace/:farmId/download/:filename
 * Download a specific file from workspace
 */
router.get('/workspace/:farmId/download/:filename', 
  apiRateLimits.read, 
  async (req: AuthRequest, res) => {
  try {
    const { farmId, filename } = req.params;
    const filePath = path.join(process.cwd(), 'maibarn', 'workspaces', 'active', farmId, filename);
    
    // Check if file exists
    await fs.access(filePath);
    
    res.download(filePath);
  } catch (error) {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'File not found'
      }
    });
  }
});

export default router;