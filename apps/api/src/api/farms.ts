import { Router } from 'express';
import { ApiResponse, Farm, PaginationQuery, FilterQuery } from '../types/api';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { apiRateLimits } from '../middleware/rateLimit';
import {
  farmCreationRateLimit,
  quickTaskRateLimit,
  expensiveRateLimit
} from '../middleware/rateLimiter';
import { db } from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import { spawn } from 'child_process';

// Import unified services from ServiceRegistry
import { serviceRegistry, getService } from '../services/unified/ServiceRegistry';
import { websocketManager } from '../websocket/websocketManager';
import { unifiedWebSocketManager } from '../websocket/UnifiedWebSocketManager';

// Import legacy services that haven't been unified yet
import { aiOrchestrator } from '../services/aiOrchestrator';
import { harvestService } from '../services/harvestService';
import { agentCleanupService } from '../services/agentCleanupService';
import { barnService } from '../services/unified/barnService';

// Initialize service registry
serviceRegistry.initialize().catch(err => {
  logger.error(LogCategory.SYSTEM, 'Failed to initialize service registry', { error: err.message });
});
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { recordEndpointLatency } from '../monitoring/metricsCollector';
import { logger, LogCategory } from '../services/ProductionLogger';
import { safeParse, SafeParseError } from '../utils/safeParse';
import type { FarmProvider } from '../types/farm';
import { aiProviderManager } from '../config/aiProviders';

const router = Router();

type SupportedCreationProvider = 'claude' | 'openai' | 'gpt-oss' | 'grok';

const SUPPORTED_CREATION_PROVIDERS: ReadonlyArray<SupportedCreationProvider> = [
  'claude',
  'openai',
  'gpt-oss',
  'grok'
];

const isSupportedCreationProvider = (value: unknown): value is SupportedCreationProvider => {
  return typeof value === 'string' && SUPPORTED_CREATION_PROVIDERS.includes(value as SupportedCreationProvider);
};

/**
 * Resolves the AI provider for farm creation.
 * Priority order:
 * 1. User's explicit provider choice (if supported)
 * 2. Global provider setting from aiProviderManager
 * 3. Environment variable AI_PROVIDER
 * 4. Default to 'claude'
 */
const resolveCreationProvider = (requestedProvider?: string | FarmProvider): SupportedCreationProvider => {
  // FIXED: Respect user's explicit provider choice if it's a supported provider
  if (requestedProvider && isSupportedCreationProvider(requestedProvider)) {
    return requestedProvider;
  }

  // Fall back to global provider setting if no valid provider was requested
  const globalProvider = aiProviderManager.getDefaultProvider() as string | undefined;
  if (isSupportedCreationProvider(globalProvider)) {
    return globalProvider;
  }

  // Fallback to environment variable
  const envProvider = process.env.AI_PROVIDER;
  if (isSupportedCreationProvider(envProvider)) {
    return envProvider;
  }

  return 'claude';
};

// Configure multer for file uploads with security validation
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

// FIX: Add file type validation to prevent malicious file uploads
const ALLOWED_MIME_TYPES = new Set([
  // Documents
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/json',
  'application/x-yaml',
  'text/yaml',
  'application/pdf',
  // Code files
  'text/javascript',
  'application/javascript',
  'text/typescript',
  'text/x-python',
  'text/x-java-source',
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif'
]);

const ALLOWED_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.yaml', '.yml', '.pdf',
  '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'
]);

const fileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype.toLowerCase();

  // Check both MIME type and extension for security
  if (ALLOWED_MIME_TYPES.has(mimeType) || ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    logger.warn(LogCategory.SECURITY, 'Rejected file upload with invalid type', {
      filename: file.originalname,
      mimetype: mimeType,
      extension: ext
    });
    cb(new Error(`File type not allowed: ${mimeType} (${ext})`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
    files: 10 // Max 10 files
  }
});

// Apply authentication to all farm routes
router.use(authenticateToken);

// GET /api/farms - List all farms with filtering and pagination
router.get('/', apiRateLimits.read, async (req, res) => {
  const start = process.hrtime.bigint();
  const routeKey = '/api/farms';
  try {
    const { 
      page = 1, 
      limit = 20, 
      sort = 'created_at', 
      order = 'desc',
      status,
      tags
    } = req.query as PaginationQuery & FilterQuery & { tags?: string };

    const offset = (Number(page) - 1) * Number(limit);
    
    // Build query - exclude deleted farms by default
    let query = 'SELECT * FROM farms WHERE status != \'deleted\'';
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    if (tags) {
      const tagArray = tags.split(',');
      query += ` AND tags && $${paramIndex++}`;
      params.push(tagArray);
    }

    // Add sorting and pagination with strict column mapping to prevent SQL injection
    const SAFE_COLUMN_MAP: Record<string, string> = {
      'created_at': 'created_at',
      'updated_at': 'updated_at',
      'name': 'name',
      'status': 'status'
    };
    const SAFE_ORDER_MAP: Record<string, string> = {
      'asc': 'ASC',
      'desc': 'DESC',
      'ASC': 'ASC',
      'DESC': 'DESC'
    };

    const sortColumn = SAFE_COLUMN_MAP[sort as string] || SAFE_COLUMN_MAP.created_at;
    const orderDirection = SAFE_ORDER_MAP[order as string] || SAFE_ORDER_MAP.DESC;
    query += ` ORDER BY ${sortColumn} ${orderDirection} LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total count (excluding deleted farms)
    const countResult = await db.query('SELECT COUNT(*) FROM farms WHERE status != \'deleted\'');
    // FIX: Add defensive check for rows[0] access
    const total = countResult.rows[0] ? parseInt(countResult.rows[0].count || '0') : 0;

    // Use farms.agents JSONB column (populated by Bug #9 fix in migration 051)
    // This eliminates the N+1 query problem - agents are already embedded in the farm row
    const response: ApiResponse<Farm[]> = {
      success: true,
      data: result.rows.map(row => {
        // Parse agents from JSONB column (defaults to empty array if not present)
        const agentsJson = row.agents || [];
        const agents = Array.isArray(agentsJson) ? agentsJson.map(agent => ({
          id: agent.id,
          name: agent.name || `Agent ${agent.id?.slice(0, 8) || 'unknown'}`,
          type: agent.type || 'custom',
          status: agent.status || 'idle',
          progress: 0, // Not stored in DB yet
          currentTask: undefined, // Not stored in DB yet
          memory: agent.resources?.memory || 0,
          cpu: agent.resources?.cpu || 0,
          lastActive: agent.last_heartbeat || agent.created_at,
          capabilities: agent.capabilities || [],
          performance: {
            cpuUsage: agent.resources?.cpu || 0,
            memoryUsage: agent.resources?.memory || 0,
            responseTime: agent.metrics?.avgResponseTime || 0,
            throughput: agent.metrics?.throughput || 0
          }
        })) : [];

        return {
          id: row.id,
          name: row.name,
          description: row.description,
          status: row.status,
          agents,
          config: row.config,
          metrics: row.metrics,
          tags: row.tags || [],
          sessionName: row.session_name,
          tmuxSession: row.tmux_session,
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      }),
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        timestamp: new Date()
      }
    };

    const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
    recordEndpointLatency(routeKey, res.statusCode || 200, durationSeconds);
    logger.debug(LogCategory.FARM, 'Fetched farms list', {
      durationMs: Math.round(durationSeconds * 1000),
      farmCount: response.data.length,
      page: response.meta?.page,
      limit: response.meta?.limit
    });

    res.json(response);
  } catch (error) {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
    recordEndpointLatency(routeKey, 500, durationSeconds);

    logger.error(LogCategory.FARM, 'Error fetching farms', {
      error,
      durationMs: Math.round(durationSeconds * 1000)
    });
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch farms'
      }
    };
    res.status(500).json(response);
  }
});

// UUID validation regex for farm IDs
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/farms/active - Get all active farms
// IMPORTANT: This route must be defined BEFORE /:id to prevent "active" from being interpreted as a farm ID
router.get('/active', apiRateLimits.read, async (req, res) => {
  const start = process.hrtime.bigint();
  const routeKey = '/api/farms/active';
  try {
    const result = await db.query(
      `SELECT id, name, description, status, config, metrics, tags, session_name, tmux_session,
              created_by, created_at, updated_at, agents
       FROM farms
       WHERE status IN ('active', 'running', 'launching')
       ORDER BY updated_at DESC
       LIMIT 50`
    );

    const farms = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      config: row.config,
      metrics: row.metrics,
      tags: row.tags || [],
      sessionName: row.session_name,
      tmuxSession: row.tmux_session,
      agentCount: Array.isArray(row.agents) ? row.agents.length : 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
    recordEndpointLatency(routeKey, 200, durationSeconds);

    res.json({
      success: true,
      data: farms,
      count: farms.length
    });
  } catch (error) {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
    recordEndpointLatency(routeKey, 500, durationSeconds);
    logger.error(LogCategory.FARM, 'Error fetching active farms', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch active farms'
      }
    });
  }
});

// GET /api/farms/stats - Get farm statistics
// IMPORTANT: This route must be defined BEFORE /:id to prevent "stats" from being interpreted as a farm ID
router.get('/stats', apiRateLimits.read, async (req, res) => {
  const start = process.hrtime.bigint();
  const routeKey = '/api/farms/stats';
  try {
    const result = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status IN ('active', 'running') THEN 1 END) as active,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'idle' THEN 1 END) as idle,
        COUNT(CASE WHEN status = 'launching' THEN 1 END) as launching,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as created_today,
        COUNT(CASE WHEN updated_at > NOW() - INTERVAL '1 hour' THEN 1 END) as recently_active
      FROM farms
      WHERE status != 'deleted'
    `);

    const stats = result.rows[0];
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
    recordEndpointLatency(routeKey, 200, durationSeconds);

    res.json({
      success: true,
      data: {
        total: parseInt(stats.total) || 0,
        active: parseInt(stats.active) || 0,
        completed: parseInt(stats.completed) || 0,
        failed: parseInt(stats.failed) || 0,
        idle: parseInt(stats.idle) || 0,
        launching: parseInt(stats.launching) || 0,
        createdToday: parseInt(stats.created_today) || 0,
        recentlyActive: parseInt(stats.recently_active) || 0
      }
    });
  } catch (error) {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
    recordEndpointLatency(routeKey, 500, durationSeconds);
    logger.error(LogCategory.FARM, 'Error fetching farm stats', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch farm statistics'
      }
    });
  }
});

// GET /api/farms/:id - Get specific farm details with agents
router.get('/:id', apiRateLimits.read, async (req, res) => {
  const start = process.hrtime.bigint();
  const routeKey = '/api/farms/:id';
  try {
    const { id } = req.params;

    // Validate UUID format to prevent database errors on invalid IDs
    if (!UUID_REGEX.test(id)) {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
      recordEndpointLatency(routeKey, 400, durationSeconds);
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'Invalid farm ID format. Expected UUID.'
        }
      });
    }
    
    // Get farm details
    const farmResult = await db.query('SELECT * FROM farms WHERE id = $1', [id]);
    
    if (farmResult.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      };
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
      recordEndpointLatency(routeKey, 404, durationSeconds);
      logger.warn(LogCategory.FARM, 'Farm not found', { id, durationMs: Math.round(durationSeconds * 1000) });
      return res.status(404).json(response);
    }

    const farmRow = farmResult.rows[0];
    
    // Get agents in this farm
    const agentsResult = await db.query('SELECT id, name, type, status, capabilities, resources, metrics, config, last_heartbeat, created_at, updated_at FROM agents WHERE farm_id = $1', [id]);
    const agents = agentsResult.rows.map(agent => {
      const resources = agent.resources || {};
      const metrics = agent.metrics || {};
      return {
        id: agent.id,
        name: agent.name || `Agent ${agent.id.slice(0, 8)}`,
        type: agent.type || 'custom',
        status: agent.status || 'idle',
        progress: 0, // Not stored in DB yet
        currentTask: undefined, // Not stored in DB yet
        memory: resources.memory || 0,
        cpu: resources.cpu || 0,
        lastActive: agent.last_heartbeat || agent.created_at,
        capabilities: agent.capabilities || [],
        performance: {
          cpuUsage: resources.cpu || 0,
          memoryUsage: resources.memory || 0,
          responseTime: metrics.avgResponseTime || 0,
          throughput: metrics.throughput || 0
        }
      };
    });

    const farm: Farm = {
      id: farmRow.id,
      name: farmRow.name,
      description: farmRow.description,
      status: farmRow.status,
      agents: agents,
      config: farmRow.config,
      metrics: farmRow.metrics,
      tags: farmRow.tags || [],
      sessionName: farmRow.session_name,
      tmuxSession: farmRow.tmux_session,
      createdBy: farmRow.created_by,
      createdAt: farmRow.created_at,
      updatedAt: farmRow.updated_at
    };

    const response: ApiResponse<Farm> = {
      success: true,
      data: farm
    };

    const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
    recordEndpointLatency(routeKey, res.statusCode || 200, durationSeconds);
    logger.debug(LogCategory.FARM, 'Fetched farm detail', {
      farmId: id,
      agentCount: agents.length,
      durationMs: Math.round(durationSeconds * 1000)
    });

    res.json(response);
  } catch (error) {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
    recordEndpointLatency(routeKey, 500, durationSeconds);

    logger.error(LogCategory.FARM, 'Error fetching farm', {
      error,
      durationMs: Math.round(durationSeconds * 1000)
    });
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch farm'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/farms - Create new farm
router.post('/',
  upload.array('files'), // Add multer middleware to handle files if present
  requirePermission(['farms:create']),
  farmCreationRateLimit.middleware(), // Use advanced rate limiter for farm creation
  async (req, res) => {
  const client = await db.connect();
  
  try {
    logger.info(LogCategory.FARM, 'Farm creation request received', {
      timestamp: new Date().toISOString(),
      hasFiles: !!req.files,
      fileCount: req.files ? (req.files as any[]).length : 0,
      contentType: req.headers['content-type'],
      userId: (req as any).user?.userId || 'unauthenticated'
    });
    
    // Handle both JSON and multipart/form-data
    let farmData: any;
    let contextFiles: any[] = [];
    
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
        farmData = safeParse(req.body.farmData, {
          maxDepth: 10,
          maxSize: 100000, // 100KB limit
          preventPrototypePollution: true
        });
      } catch (e) {
        const errorCode = e instanceof SafeParseError ? e.code : 'INVALID_JSON';
        const errorMessage = e instanceof SafeParseError ? e.message : 'Invalid JSON in farmData field';

        // Log potential attack attempts
        if (e instanceof SafeParseError && ['MAX_DEPTH_EXCEEDED', 'MAX_SIZE_EXCEEDED'].includes(e.code)) {
          logger.warn(LogCategory.SECURITY, 'Potential attack detected in farm creation', {
            userId: (req as any).user?.userId,
            errorCode,
            size: req.body.farmData?.length
          });
        }

        return res.status(400).json({
          success: false,
          error: {
            code: errorCode,
            message: errorMessage
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
      
      logger.info(LogCategory.FARM, `Processing ${contextFiles.length} uploaded files`);
    } else {
      // Regular JSON request
      farmData = req.body;
    }
    
    // Accept both numberOfAgents and agentCount for compatibility
    // appliedSeedIds: Array of seed IDs to inject into farm context (Feature A: Seeds can Seed a Farm)
    const { name, description, config, tags = [], type = 'sequential', provider: requestedProvider, prompt, mode, numberOfAgents, agentCount, timeout, appliedSeedIds } = farmData;

    // CRITICAL FIX: Always use valid dev user ID as fallback to prevent foreign key violations
    // This ensures farms can be created even if auth middleware chain has issues
    const DEV_USER_ID = '9652ef27-3208-47a1-aa53-e7fcdffddb07';
    const userId = (req as any).user?.userId || DEV_USER_ID;

    // DEBUG: Trace userId through farm creation
    logger.info(LogCategory.FARM, '🔍 DEBUG: Farm creation userId trace', {
      userId,
      userFromReq: (req as any).user?.userId,
      fallbackUsed: !(req as any).user?.userId,
      bypassEnabled: process.env.BYPASS_AUTH,
      nodeEnv: process.env.NODE_ENV
    });
    
    // contextFiles is already declared above, no need to redeclare

    // Parse config if it's a YAML string
    let parsedConfig: any = {};
    if (typeof config === 'string') {
      // Config is a YAML string from FarmChatWizard
      parsedConfig = {
        yaml: config,
        maxAgents: 3,
        autoScale: false,
        timeout: 3600
      };
    } else if (typeof config === 'object' && config !== null) {
      // Config is already an object
      parsedConfig = config;
    }

    // Include timeout from request body if provided
    if (timeout !== undefined) {
      parsedConfig.timeout = timeout;
    }

    // Comprehensive validation
    const validationErrors: string[] = [];
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      validationErrors.push('Farm name is required and must be a non-empty string');
    }
    
    if (name && name.length > 100) {
      validationErrors.push('Farm name must be less than 100 characters');
    }
    
    if (description && typeof description !== 'string') {
      validationErrors.push('Description must be a string');
    }
    
    if (description && description.length > 500) {
      validationErrors.push('Description must be less than 500 characters');
    }
    
    const validTypes = ['sequential', 'collaborative', 'autonomous'];
    if (type && !validTypes.includes(type)) {
      validationErrors.push(`Type must be one of: ${validTypes.join(', ')}`);
    }
    
    if (requestedProvider && !isSupportedCreationProvider(requestedProvider)) {
      validationErrors.push(`Provider must be one of: ${SUPPORTED_CREATION_PROVIDERS.join(', ')}`);
    }
    
    if (config) {
      if (config.maxAgents && (typeof config.maxAgents !== 'number' || config.maxAgents < 1 || config.maxAgents > 32)) {
        validationErrors.push('maxAgents must be a number between 1 and 32');
      }
      
      if (config.timeout && (typeof config.timeout !== 'number' || config.timeout < 60 || config.timeout > 86400)) {
        validationErrors.push('timeout must be between 60 and 86400 seconds (1 minute to 24 hours)');
      }
      
      if (config.yaml && typeof config.yaml !== 'string') {
        validationErrors.push('YAML configuration must be a string');
      }
      
      // Validate YAML structure if provided
      if (config.yaml) {
        const yamlStr = config.yaml.toString();
        if (!yamlStr.includes('name:')) {
          validationErrors.push('YAML must contain a "name" field');
        }
        if (!yamlStr.includes('agents:')) {
          validationErrors.push('YAML must contain an "agents" field');
        }
      }
    }
    
    if (!Array.isArray(tags)) {
      validationErrors.push('Tags must be an array');
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
    
    // Remove farm_id from parsedConfig if it exists (it's not a config field)
    const { farm_id, ...cleanConfig } = parsedConfig || {};

    // Generate farm ID upfront for progressive updates
    let farmId: string = uuidv4();

    // PHASE 1: Emit farm creation started event
    websocketManager.broadcast('farm:creation-started', {
      farmId,
      name: name.trim(),
      phase: 'preflight',
      progress: 5,
      timestamp: new Date().toISOString()
    });

    const farmPrompt = prompt || cleanConfig?.prompt || description || '';
    const selectedProvider = resolveCreationProvider(requestedProvider);

    // PHASE 1A: Run preflight validation
    const { preflightValidationService } = await import('../services/preflightValidationService');
    const preflightResult = await preflightValidationService.validateFarmCreation({
      name: name.trim(),
      prompt: farmPrompt,
      agentCount: numberOfAgents || agentCount,
      provider: selectedProvider,
      mode: mode as 'harvest' | 'quicktask' | 'gowild',
      timeout
    });

    // Broadcast preflight results
    websocketManager.broadcast('farm:preflight-complete', {
      farmId,
      result: preflightResult,
      progress: 10,
      timestamp: new Date().toISOString()
    });

    // Fail fast if preflight checks failed
    if (!preflightResult.canProceed) {
      const errorMessage = preflightResult.errors.join('; ');
      logger.error(LogCategory.FARM, 'Preflight validation failed', { error: errorMessage });

      websocketManager.broadcast('farm:creation-failed', {
        farmId,
        phase: 'preflight-validation',
        error: errorMessage,
        checks: preflightResult.checks,
        timestamp: new Date().toISOString()
      });

      return res.status(400).json({
        success: false,
        error: 'Preflight validation failed',
        details: preflightResult
      });
    }

    // Start database transaction
    await client.query('BEGIN');
    // Use numberOfAgents or agentCount, with mode-specific defaults
    // FIXED: XenoSync coordination requires minimum 2 agents for all modes
    const requestedAgents = numberOfAgents || agentCount;
    const defaultAgents = mode === 'quicktask' ? 2 : mode === 'gowild' ? 5 : 3; // XenoSync min 2, harvest defaults to 3
    const numAgents = Math.max(2, requestedAgents || cleanConfig?.maxAgents || defaultAgents); // Enforce XenoSync minimum
    const farmMode = mode || 'harvest';

    let yamlContent = cleanConfig?.yaml || '';

    // PHASE 2: Generating YAML configuration
    if (!yamlContent) {
      logger.info(LogCategory.FARM, `Generating YAML configuration for ${farmMode} mode before farm creation`);

      // Emit YAML generation phase
      websocketManager.broadcast('farm:creation-progress', {
        farmId,
        phase: 'yaml-generation',
        progress: 25,
        message: 'Generating YAML configuration...',
        timestamp: new Date().toISOString()
      });

      const { yamlGenerator } = await import('../services/yamlGenerator');

      // Configure YAML generation based on mode
      const yamlRequest = {
        prompt: farmPrompt,
        agentCount: numAgents,
        mode: farmMode === 'go_wild' ? 'collaborative' : farmMode,
        provider: selectedProvider,
        template: farmMode === 'go_wild' ? 'go-wild' : (farmMode === 'quick_task' ? 'quick-task' : 'default'),
        // Add mode-specific configurations
        ...(farmMode === 'go_wild' && {
          creativityLevel: cleanConfig?.goWildMode?.creativityLevel || 70,
          timeout: cleanConfig?.timeout || 2700 // 45 minutes default
        }),
        ...(farmMode === 'quick_task' && {
          timeout: 300 // 5 minutes fixed for quick task
        }),
        ...(farmMode === 'harvest' && {
          timeout: cleanConfig?.timeout || 3600 // 1 hour default
        })
      };

      try {
        const yamlResponse = await yamlGenerator.generateYaml(yamlRequest);
        if (yamlResponse.success && yamlResponse.yaml) {
          yamlContent = yamlResponse.yaml;
          // Use dynamic timeout from YAML generator if available
          if (yamlResponse.timeout && !cleanConfig?.timeout) {
            cleanConfig.timeout = yamlResponse.timeout;
            logger.info(LogCategory.FARM, `Using dynamic timeout from YAML: ${yamlResponse.timeout} seconds`);
          }
          // Add YAML content to cleanConfig so it's included in the response
          cleanConfig.yaml = yamlContent;
        }
      } catch (yamlError) {
        logger.warn(LogCategory.FARM, 'Failed to generate YAML, proceeding without it', { error: yamlError.message });
      }
    }

    // PHASE 3: Workspace and database setup
    websocketManager.broadcast('farm:creation-progress', {
      farmId,
      phase: 'workspace-setup',
      progress: 50,
      message: 'Setting up workspace and database...',
      timestamp: new Date().toISOString()
    });

    // Use farmManager to create the farm
    logger.info(LogCategory.FARM, 'Creating farm with farmManager');
    let launchResult;
    try {
      // Use unified farm service
      const farmService = getService('farm');

      launchResult = await farmService.createFarm({
        id: farmId, // Pass the generated farm ID
        name: name.trim(),
        description: description?.trim() || '',
        mode: farmMode,
        prompt: farmPrompt, // Ensure prompt is passed
        numberOfAgents: numAgents,
        provider: selectedProvider,
        userId, // CRITICAL: userId must be at top level for service validation
        timeout: cleanConfig?.timeout || 3600, // 1 hour default for harvest
        autoScale: cleanConfig?.autoScale || false,
        yamlContent: yamlContent, // Pass the generated YAML
        retryPolicy: {
          enabled: true,
          maxRetries: 3,
          backoffMultiplier: 2
        },
        goWildMode: {
          enabled: mode === 'go_wild',
          creativityLevel: cleanConfig?.goWildMode?.creativityLevel || 3,
          boundaries: cleanConfig?.goWildMode?.boundaries || []
        },
        attachedFiles: cleanConfig?.attachedFiles || [],
        // Seeds context injection (Feature A: Seeds can Seed a Farm)
        appliedSeedIds: Array.isArray(appliedSeedIds) ? appliedSeedIds : [],
        metadata: {
          type: type as 'sequential' | 'collaborative' | 'autonomous',
          userId,
          createdBy: userId
        }
      });

      if (!launchResult.success) {
        throw new Error(launchResult.error || 'Failed to create farm');
      }

      // Use the farmId returned from the service if different
      if (launchResult.farmId && launchResult.farmId !== farmId) {
        farmId = launchResult.farmId;
      }
      logger.info(LogCategory.FARM, 'Farm created successfully', { farmId });

      // PHASE 4: Farm service created successfully
      websocketManager.broadcast('farm:creation-progress', {
        farmId,
        phase: 'orchestrator-ready',
        progress: 75,
        message: 'Farm orchestrator ready...',
        timestamp: new Date().toISOString()
      });

    } catch (farmError: any) {
      logger.error(LogCategory.FARM, 'farmService.createFarm failed', { error: farmError.message });

      // Emit failure event
      websocketManager.broadcast('farm:creation-failed', {
        farmId,
        phase: 'orchestrator-setup',
        error: farmError.message || 'Unknown error',
        timestamp: new Date().toISOString()
      });

      throw new Error(`Failed to create farm: ${farmError.message || 'Unknown error'}`);
    }

    // Store in database with transaction
    const id = farmId;
    
    // Clean the YAML content to avoid Unicode issues
    let cleanedYaml = '';
    if (cleanConfig?.yaml) {
      // Remove problematic Unicode characters while preserving the content
      cleanedYaml = cleanConfig.yaml
        .replace(/[\ud800-\udbff](?![\udc00-\udfff])/g, '') // Remove lone high surrogates
        .replace(/(?<![\ud800-\udbff])[\udc00-\udfff]/g, '') // Remove lone low surrogates
        .replace(/[\u{1f300}-\u{1f9ff}]/gu, '') // Remove emojis
        .replace(/[\u2600-\u27ff]/g, ''); // Remove other symbols
    }
    
    // Determine correct agent count based on mode (fixed)
    let defaultAgentCount = 8; // Default for regular farms
    if (type === 'quick_task' || mode === 'quick_task') {
      defaultAgentCount = 2; // Quick Task always uses 2 agents
    } else if (type === 'autonomous' || cleanConfig?.goWildMode?.enabled) {
      defaultAgentCount = 5; // Go Wild defaults to 5 agents
    }

    const defaultConfig = {
      maxAgents: cleanConfig?.maxAgents || numberOfAgents || agentCount || defaultAgentCount,
      resourceLimits: {
        totalCpu: 8,
        totalMemory: 16384
      },
      orchestrationStrategy: 'round-robin',
      autoScale: cleanConfig?.autoScale || false,
      prompt: cleanConfig?.prompt || description || `Complete tasks for ${name}`,
      timeout: cleanConfig?.timeout || 3600,
      retryPolicy: cleanConfig?.retryPolicy || {
        enabled: true,
        maxRetries: 3,
        backoffMultiplier: 2
      },
      goWildMode: cleanConfig?.goWildMode || {
        enabled: false,
        creativityLevel: 3,
        boundaries: []
      },
      provider: selectedProvider as FarmProvider,  // Store the AI provider
      attachedFiles: contextFiles,  // Add uploaded files to config
      yaml: cleanedYaml  // Store cleaned YAML content
      // Don't spread cleanConfig - it may contain metadata fields that aren't valid config
    };

    const defaultMetrics = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      queuedTasks: 0,
      avgCompletionTime: 0,
      totalAgents: 0,
      activeAgents: 0,
      efficiency: 0,
      resourceUtilization: {
        cpu: 0,
        memory: 0
      },
      resourceUsage: {
        cpu: 0,
        memory: 0,
        network: 0
      },
      collaborationScore: 0
    };

    // Debug logging to find the issue
    console.log('[Farm API] Database insert parameters:', {
      id,
      userId,
      configKeys: Object.keys(defaultConfig),
      hasInvalidUUID: JSON.stringify(defaultConfig).includes('farm-')
    });
    
    await client.query(
      `INSERT INTO farms (id, name, description, status, config, metrics, tags, created_by, mode, timeout_seconds, prompt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         config = EXCLUDED.config,
         mode = EXCLUDED.mode,
         timeout_seconds = EXCLUDED.timeout_seconds,
         prompt = EXCLUDED.prompt,
         updated_at = CURRENT_TIMESTAMP`,
      [id, name.trim(), description?.trim() || '', 'launching', defaultConfig, defaultMetrics, tags, userId,
       mode || 'harvest', // FIXED: Include mode parameter (default to harvest)
       timeout || defaultConfig.timeout || 3600, // FIXED: Include timeout_seconds
       prompt || ''] // FIXED: Include prompt
    );
    
    // Commit transaction
    await client.query('COMMIT');

    // PHASE 5: Database committed successfully
    websocketManager.broadcast('farm:creation-progress', {
      farmId,
      phase: 'database-committed',
      progress: 90,
      message: 'Farm saved to database...',
      timestamp: new Date().toISOString()
    });

    // PHASE 6: Farm creation complete
    websocketManager.broadcast('farm:creation-complete', {
      farmId,
      progress: 100,
      message: 'Farm created successfully',
      timestamp: new Date().toISOString()
    });

    // CRITICAL: Use broadcastWithAck for guaranteed farm:created delivery
    // This ensures frontend receives farm creation event even with WebSocket reconnections
    try {
      const ackResult = await unifiedWebSocketManager.broadcastWithAck(
        'farm:created',
        {
          farm: {
            id: farmId,
            name: name.trim(),
            description: description?.trim() || '',
            status: 'launching', // Broadcast actual DB status (will become 'active' after launch)
            agents: [],
            config: defaultConfig,
            metrics: defaultMetrics,
            tags: tags || [],
            createdBy: userId,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        },
        {
          farmId,
          retryAttempts: 3,
          timeout: 5000
        }
      );

      if (ackResult.success) {
        logger.info(LogCategory.FARM,
          `Farm creation event delivered to ${ackResult.delivered} clients for farm ${farmId}`);
      } else {
        logger.warn(LogCategory.FARM,
          `Farm creation partial delivery: ${ackResult.delivered} delivered, ${ackResult.failed} failed`);
      }
    } catch (broadcastError) {
      logger.error(LogCategory.FARM, `Failed to broadcast farm:created event:`, broadcastError);
      // Don't fail farm creation if broadcast fails - farm is already created
    }

    // Note: farmService.createFarm() already launches the agents internally via UnifiedFarmLaunchOrchestrator
    // No need for additional auto-launch code here as it would create duplicate agent launches
    // The farm was created and launched successfully at line 477
    logger.info(LogCategory.FARM, 'Farm created and agents launched via farmService.createFarm()');

    // Get farm details for response
    let farmAgents: any[] = [];
    let farmMetrics = { totalTokens: 0, totalCost: 0 };

    // Query farm details from database if launched
    if (launchResult && launchResult.success && launchResult.farmId) {
      try {
        const farmQuery = await db.query(
          'SELECT agents, metrics FROM farms WHERE id = $1',
          [farmId]
        );
        if (farmQuery.rows.length > 0) {
          farmAgents = farmQuery.rows[0].agents || [];
          farmMetrics = farmQuery.rows[0].metrics || { totalTokens: 0, totalCost: 0 };
        }
      } catch (queryError) {
        logger.error(LogCategory.FARM, 'Failed to query farm details', { error: queryError.message });
      }
    }

    // Use frontend port 3000 for farm URLs (not backend API port 4567)
    const frontendPort = process.env.VITE_PORT || '3000';
    const farmUrl = `http://localhost:${frontendPort}/farm/${farmId}`;

    const response: ApiResponse<Farm> = {
      success: true,
      data: {
        id: farmId,
        name: name.trim(),
        description: description?.trim() || '',
        status: 'launching', // Farm was created and is launching via farmService.createFarm()
        agents: farmAgents,
        config: defaultConfig,
        metrics: farmMetrics,
        tags: tags || [],
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        farmUrl
      },
      message: `🌱 Farm created successfully! View at: ${farmUrl}`
    };

    logger.info(LogCategory.FARM, `Farm ${farmId} created successfully`, { farmUrl });
    res.status(201).json(response);
  } catch (error: any) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    logger.error(LogCategory.FARM, 'Error creating farm', { error: error.message, stack: error.stack });
    
    // More detailed error responses
    let errorCode = 'INTERNAL_ERROR';
    let errorMessage = 'Failed to create farm';
    let statusCode = 500;
    
    // Log the actual error for debugging
    if (error.code === '23505') { // Unique constraint violation
      errorCode = 'DUPLICATE_ERROR';
      errorMessage = 'A farm with this name already exists';
      statusCode = 409;
    } else if (error.code === '23503') { // Foreign key violation
      errorCode = 'REFERENCE_ERROR';
      errorMessage = 'Invalid reference in farm configuration';
      statusCode = 400;
    } else if (error.code === 'ECONNREFUSED') {
      errorCode = 'DATABASE_ERROR';
      errorMessage = 'Database connection failed. Please ensure PostgreSQL is running.';
      statusCode = 503;
    } else if (error.message?.includes('farmManager')) {
      errorCode = 'FARM_MANAGER_ERROR';
      errorMessage = error.message;
      statusCode = 500;
    } else if (error.message?.includes('Failed to create farm')) {
      // Pass through the specific error from farmManager
      errorCode = 'FARM_CREATION_ERROR';
      errorMessage = error.message;
      statusCode = 500;
    } else if (error.message) {
      errorMessage = `Failed to create farm: ${error.message}`;
    }
    
    console.error('[Farm API] Returning error response:', { errorCode, errorMessage, statusCode });
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: errorCode,
        message: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    };
    res.status(statusCode).json(response);
  } finally {
    client.release();
  }
});

// PUT /api/farms/:id - Update farm configuration
router.put('/:id', requirePermission(['farms:update']), apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    // Get user ID from auth context or use development bypass
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Update in farmManager
    const updatedFarm = await farmManager.updateFarm(id, userId, updates);
    
    if (!updatedFarm) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      };
      return res.status(404).json(response);
    }

    // Build dynamic update query for database
    const updateFields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (['name', 'description', 'status', 'config', 'tags'].includes(key)) {
        updateFields.push(`${key} = $${paramIndex++}`);
        params.push(value);
      }
    });

    if (updateFields.length > 0) {
      updateFields.push(`updated_at = $${paramIndex++}`);
      params.push(new Date());
      params.push(id);

      const query = `UPDATE farms SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`;
      await db.query(query, params);
    }

    // Get updated farm from database
    const result = await db.query('SELECT * FROM farms WHERE id = $1', [id]);
    const row = result.rows[0];

    // Emit WebSocket event
    websocketManager.broadcast('farm:updated', {
      farm: {
        id: row.id,
        name: row.name,
        description: row.description,
        status: updatedFarm.status,
        agents: updatedFarm.agents.map(a => a.id),
        config: row.config,
        metrics: updatedFarm.metrics,
        tags: row.tags || [],
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });

    const farm: Farm = {
      id: row.id,
      name: row.name,
      description: row.description,
      status: updatedFarm.status,
      agents: updatedFarm.agents.map(a => a.id),
      config: row.config,
      metrics: updatedFarm.metrics,
      tags: row.tags || [],
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    const response: ApiResponse<Farm> = {
      success: true,
      data: farm
    };

    res.json(response);
  } catch (error) {
    console.error('Error updating farm:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update farm'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/farms/:id/recover - Recover stuck or failed farm
router.post('/:id/recover', requirePermission(['farms:write']), apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;
    const { force = false } = req.body;

    console.log(`[Farm API] Recovery requested for farm ${id}`);

    // Import recovery service
    const { farmRecoveryService } = await import('../services/farmRecoveryService');

    // Check health first
    const health = await farmRecoveryService.checkFarmHealth(id);

    // Get recovery suggestions
    const suggestions = await farmRecoveryService.getRecoverySuggestions(id);

    // Attempt recovery
    const result = await farmRecoveryService.recoverFarm(id, { force });

    // Use frontend port 3000 for farm URLs (not backend API port 4567)
    const frontendPort = process.env.VITE_PORT || '3000';
    const farmUrl = `http://localhost:${frontendPort}/farm/${id}`;

    const response: ApiResponse = {
      success: result.success,
      data: {
        farmId: id,
        health,
        suggestions,
        recovery: result,
        farmUrl,
        message: result.success ? `✅ Farm recovered successfully. View at: ${farmUrl}` : 'Recovery failed'
      }
    };

    if (!result.success) {
      response.error = {
        code: 'RECOVERY_FAILED',
        message: result.error || 'Recovery failed'
      };
      return res.status(500).json(response);
    }

    console.log(`[Farm API] ✅ Farm ${id} recovered. View at: ${farmUrl}`);
    res.json(response);
  } catch (error: any) {
    console.error('[Farm API] Error during recovery:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'RECOVERY_ERROR',
        message: error.message || 'Failed to recover farm'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/farms/:id/health - Check farm health status
router.get('/:id/health', requirePermission(['farms:read']), apiRateLimits.read, async (req, res) => {
  try {
    const { id } = req.params;

    const { farmRecoveryService } = await import('../services/farmRecoveryService');

    const health = await farmRecoveryService.checkFarmHealth(id);
    const suggestions = await farmRecoveryService.getRecoverySuggestions(id);

    const response: ApiResponse = {
      success: true,
      data: {
        farmId: id,
        health,
        suggestions
      }
    };

    res.json(response);
  } catch (error: any) {
    console.error('[Farm API] Error checking health:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'HEALTH_CHECK_ERROR',
        message: error.message || 'Failed to check farm health'
      }
    };
    res.status(500).json(response);
  }
});

// DELETE /api/farms/:id - Remove farm and all its agents
router.delete('/:id', requirePermission(['farms:delete']), apiRateLimits.write, async (req, res) => {
  const client = await db.connect();
  
  try {
    const { id } = req.params;

    // First, check if farm has a XenoSync process and stop it gracefully
    const farmResult = await client.query('SELECT config, name, status FROM farms WHERE id = $1', [id]);
    if (farmResult.rows.length > 0) {
      const { config, status } = farmResult.rows[0];
      
      // Only attempt graceful shutdown if farm is running
      if (status === 'running' || status === 'launching') {
        try {
          console.log(`[Farm DELETE] Attempting graceful shutdown before deletion for farm ${id}`);
          // Get user ID from auth context or use development bypass
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
          await farmManager.gracefulShutdownFarm(id, userId, 'user_request');
          console.log(`[Farm DELETE] Graceful shutdown completed for farm ${id}`);
        } catch (gracefulError) {
          console.warn(`[Farm DELETE] Graceful shutdown failed for farm ${id}, using regular stop:`, gracefulError);
          
          // Fallback to legacy orchestrator stop (for backward compatibility)
          const processId = config?.processId;
          if (processId) {
            try {
              await orchestratorService.stopFarm(processId);
              console.log(`[Farm DELETE] Stopped XenoSync process ${processId} for farm ${id}`);
            } catch (stopError) {
              console.error('Error stopping XenoSync process:', stopError);
              // Continue with deletion even if stopping fails
            }
          }
        }
      }
    }

    // Use farmService to ensure proper cleanup
    // Get user ID from auth context or use development bypass
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const farmService = getService('farm');
    const deleted = await farmService.deleteFarm(id, userId);
    
    if (!deleted) {
      // If farmManager deletion failed, try direct database deletion
      await client.query('BEGIN');

      // Force cleanup using the cleanup service
      try {
        await agentCleanupService.cleanupFarm(id, 'user_deleted');
        console.log(`Cleaned up agents and sessions for farm ${id}`);
      } catch (cleanupError) {
        console.error('Error cleaning up farm agents:', cleanupError);
        // Continue with deletion even if cleanup fails
      }

      // Delete all agents in the farm first
      await client.query('DELETE FROM agents WHERE farm_id = $1', [id]);

      // Delete the farm
      const result = await client.query('DELETE FROM farms WHERE id = $1 RETURNING *', [id]);

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Farm not found'
          }
        };
        return res.status(404).json(response);
      }

      await client.query('COMMIT');

      // Emit WebSocket event for real-time updates
      websocketManager.broadcast('farm:deleted', {
        farmId: id,
        farmName: result.rows[0].name
      });

      const response: ApiResponse = {
        success: true,
        data: { 
          id: result.rows[0].id,
          message: 'Farm and all associated agents have been deleted'
        }
      };

      res.json(response);
    } else {
      // farmManager.deleteFarm succeeded
      const response: ApiResponse = {
        success: true,
        data: { 
          id: id,
          message: 'Farm and all associated agents have been deleted'
        }
      };

      res.json(response);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting farm:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete farm'
      }
    };
    res.status(500).json(response);
  } finally {
    client.release();
  }
});

// POST /api/farms/:id/claude-code - Create Claude Code agent farm
router.post('/:id/claude-code', requirePermission(['farms:control']), apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;
    const { prompt, steps, collaborative } = req.body;

    // Get farm details
    const farmResult = await db.query('SELECT * FROM farms WHERE id = $1', [id]);
    if (farmResult.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      };
      return res.status(404).json(response);
    }

    const farm = farmResult.rows[0];
    
    // Create Claude Code farm
    const claudeFarm = await claudeCodeManager.createFarm({
      name: name.trim(),
      description: description?.trim() || '',
      agents: farm.config.maxAgents || 3,
      prompt: prompt || farm.config.yaml || 'Help with development tasks',
      steps,
      collaborative: collaborative || false,
      projectPath: process.cwd()
    });

    // Update farm status
    await db.query(
      'UPDATE farms SET status = $1, updated_at = $2, config = $3 WHERE id = $4',
      ['running', new Date(), { ...farm.config, claudeFarmId: claudeFarm.id }, id]
    );

    const response: ApiResponse = {
      success: true,
      data: {
        farmId: id,
        claudeFarmId: claudeFarm.id,
        sessionName: claudeFarm.sessionName,
        status: claudeFarm.status
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error creating Claude Code farm:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create Claude Code farm'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/farms/:id/claude-code/status - Get Claude Code farm status
router.get('/:id/claude-code/status', apiRateLimits.read, async (req, res) => {
  try {
    const { id } = req.params;

    // Get farm config
    const farmResult = await db.query('SELECT config FROM farms WHERE id = $1', [id]);
    if (farmResult.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      };
      return res.status(404).json(response);
    }

    const claudeFarmId = farmResult.rows[0].config?.claudeFarmId;
    if (!claudeFarmId) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No Claude Code farm associated'
        }
      };
      return res.status(404).json(response);
    }

    const status = await claudeCodeManager.getFarmStatus(claudeFarmId);
    const coordination = await claudeCodeManager.getCoordinationStatus();

    const response: ApiResponse = {
      success: true,
      data: {
        ...status,
        coordination
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting Claude Code farm status:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get Claude Code farm status'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/farms/:id/start - Start farm operations
router.post('/:id/start', requirePermission(['farms:control']), apiRateLimits.standard, async (req, res) => {
  try {
    const { id } = req.params;
    // Get user ID from auth context or use development bypass
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get farm details
    const farmResult = await db.query('SELECT * FROM farms WHERE id = $1', [id]);
    if (farmResult.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      };
      return res.status(404).json(response);
    }

    const farmData = farmResult.rows[0];
    
    // Start farm using farmManager
    const farm = await farmManager.startFarm(id, userId);
    
    if (!farm) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Farm not found or not in a startable state'
        }
      };
      return res.status(400).json(response);
    }

    // Update status to launching
    await db.query(
      'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
      ['launching', new Date(), id]
    );

    // Launch actual agents via orchestratorService
    try {
      // Prepare launch options
      const agentCount = farmData.agents?.length || 1;
      const prompt = farmData.config?.prompt || farmData.description || `Complete tasks for ${farmData.name}`;
      
      const launchOptions = {
        farmId: id,
        numberOfAgents: agentCount,
        prompt: prompt,
        description: farmData.description,
        collaborative: farmData.config?.collaborative || false,
        timeout: farmData.config?.timeout, // Pass timeout if configured
        provider: farmData.config?.provider || 'claude'
      };

      // Add attachment paths if they exist in the farm config
      if (farmData.config?.attachmentPaths && Array.isArray(farmData.config.attachmentPaths)) {
        launchOptions.contextFiles = farmData.config.attachmentPaths;
        console.log(`[Farm Start] Including ${farmData.config.attachmentPaths.length} attachments`);
      }
      
      console.log(`[Farm Start] Launching ${agentCount} agents for farm ${id}`);
      const processId = await orchestratorService.launchFarm(launchOptions);
      
      // Store processId in farm config
      const updatedConfig = { ...farmData.config, processId };
      await db.query(
        'UPDATE farms SET config = $1, status = $2, updated_at = $3 WHERE id = $4',
        [updatedConfig, 'running', new Date(), id]
      );

      console.log(`[Farm Start] Farm ${id} started with process ${processId}`);

      // Create a harvest for this farm
      const harvest = await harvestService.startHarvest(id, farmData.name, userId);
      console.log(`[Farm Start] Created harvest ${harvest.id} for farm ${id}`);

    } catch (launchError) {
      console.error(`[Farm Start] Failed to launch agents for farm ${id}:`, launchError);
      // Update status back to stopped on failure
      await db.query(
        'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
        ['stopped', new Date(), id]
      );
      throw launchError;
    }

    // Emit WebSocket event
    websocketManager.broadcast('farm:started', {
      farm: {
        id: farmId,
        name: name.trim(),
        status: 'running',
        agents: farm.agents.map(a => ({ id: a.id, status: a.status }))
      }
    });

    const response: ApiResponse = {
      success: true,
      data: { id, status: 'running' }
    };

    res.json(response);
  } catch (error) {
    console.error('Error starting farm:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to start farm'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/farms/:id/pause - Pause farm operations
router.post('/:id/pause', requirePermission(['farms:control']), apiRateLimits.standard, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3 AND status = $4 RETURNING *',
      ['paused', new Date(), id, 'running']
    );

    if (result.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Farm not found or not running'
        }
      };
      return res.status(400).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: { id, status: 'paused' }
    };

    res.json(response);
  } catch (error) {
    console.error('Error pausing farm:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to pause farm'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/farms/from-seed - Create farm from seed template
router.post('/from-seed', requirePermission(['farms:create']), farmCreationRateLimit.middleware(), async (req, res) => {
  try {
    const { seedId, name, description, config } = req.body;
    const userId = (req as any).user?.userId;

    if (!seedId || !name) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'seedId and name are required'
        }
      };
      return res.status(400).json(response);
    }

    // Get seed details
    const seedResult = await db.query(
      'SELECT * FROM seeds WHERE id = $1 AND (user_id = $2 OR is_public = true)',
      [seedId, userId]
    );

    if (seedResult.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Seed not found or unauthorized'
        }
      };
      return res.status(404).json(response);
    }

    const seed = seedResult.rows[0];
    const id = uuidv4();
    
    // Merge seed config with user-provided config
    const farmConfig = {
      maxAgents: config?.maxAgents || seed.config?.maxAgents || 5,
      resourceLimits: config?.resourceLimits || seed.config?.resourceLimits || {
        totalCpu: 8,
        totalMemory: 16384
      },
      orchestrationStrategy: config?.orchestrationStrategy || seed.config?.orchestrationStrategy || 'round-robin',
      yaml: seed.yaml,
      seedId: seedId,
      ...config
    };

    const defaultMetrics = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      queuedTasks: 0,
      efficiency: 0,
      resourceUtilization: {
        cpu: 0,
        memory: 0
      }
    };

    // Create farm from seed
    const farmResult = await db.query(
      `INSERT INTO farms (id, name, description, status, config, metrics, tags, created_by, seed_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id,
        name,
        description || `Farm created from seed: ${seed.name}`,
        'preparing',
        farmConfig,
        defaultMetrics,
        [...(seed.tags || []), 'from-seed'],
        userId,
        seedId
      ]
    );

    // Update seed usage statistics
    await db.query(
      `UPDATE seeds 
       SET usage_count = usage_count + 1, 
           last_used = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [seedId]
    );

    const row = farmResult.rows[0];
    const farm: Farm = {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      agents: [],
      config: row.config,
      metrics: row.metrics,
      tags: row.tags || [],
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    const response: ApiResponse = {
      success: true,
      data: {
        farm,
        seed: {
          id: seed.id,
          name: seed.name,
          category: seed.category
        }
      }
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating farm from seed:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create farm from seed'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/farms/:id/harvest - Create harvest from completed farm
router.post('/:id/harvest', requirePermission(['farms:harvest']), apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;
    // Get user ID from auth context or use development bypass
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Get farm details using unified farm service
    const farmService = getService('farm');
    const farm = await farmService.getFarm(id);

    if (!farm) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found or unauthorized'
        }
      };
      return res.status(404).json(response);
    }
    
    // Check if farm is completed or can be harvested
    if (farm.status !== 'completed' && farm.status !== 'running') {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Farm must be completed or running to create harvest'
        }
      };
      return res.status(400).json(response);
    }
    
    // Create harvest using harvestService
    const harvest = await harvestService.startHarvest({
      farmId: id,
      name: `Harvest for ${farm.name}`,
      metadata: { createdBy: userId }
    });
    
    // If farm has outputs, add them to harvest
    if (farm.outputs || farm.results) {
      const outputs = farm.outputs || farm.results || [];
      for (const output of outputs) {
        harvest.results.push({
          id: uuidv4(),
          agentId: output.agentId || 'farm-agent',
          agentName: output.agentName || 'Farm Agent',
          agentType: 'worker',
          taskType: output.type || 'processing',
          content: JSON.stringify(output),
          metadata: output,
          timestamp: new Date(),
          processingTime: output.duration || 0,
          success: true
        });
      }
    }
    
    // Complete harvest if farm is already completed
    if (farm.status === 'completed') {
      await harvestService.completeHarvest(harvest.id);

      // Store in barn using barnService
      try {
        await barnService.storeHarvest(harvest);
      } catch (barnError) {
        console.warn('Failed to store harvest in barn:', barnError);
        // Continue even if barn storage fails - harvest is still saved in database
      }
    }
    
    // Emit WebSocket event
    websocketManager.broadcast('harvest:created', {
      harvestId: harvest.id,
      farmId: id,
      farmName: farm.name,
      status: harvest.status
    });
    
    const response: ApiResponse = {
      success: true,
      data: {
        harvest,
        message: harvest.status === 'ready' ? 
          'Harvest created and stored in barn' : 
          'Harvest collection started'
      }
    };
    
    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating harvest:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create harvest'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/farms/:id/complete - Mark farm as completed and create harvest
router.post('/:id/complete', requirePermission(['farms:control']), apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;
    const { outputs, summary } = req.body;
    // Get user ID from auth context or use development bypass
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Update farm status
    const farm = await farmManager.updateFarmStatus(id, 'completed');
    
    if (!farm) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      };
      return res.status(404).json(response);
    }
    
    // Update database
    await db.query(
      'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
      ['completed', new Date(), id]
    );
    
    // Create harvest automatically
    const { harvestService } = await import('../services/harvestService');
    const harvest = await harvestService.startHarvest({
      farmId: id,
      name: farm.name || `Harvest-${Date.now()}`,
      metadata: { createdBy: userId, summary }
    });
    
    // Add outputs to harvest if provided
    if (outputs) {
      for (const output of outputs) {
        harvest.results.push({
          id: uuidv4(),
          agentId: output.agentId || 'farm-agent',
          agentName: output.agentName || 'Farm Agent',
          agentType: 'worker',
          taskType: output.type || 'processing',
          content: JSON.stringify(output),
          metadata: output,
          timestamp: new Date(),
          processingTime: output.duration || 0,
          success: true
        });
      }
    }
    
    // Add summary if provided
    if (summary) {
      harvest.summary = { ...harvest.summary, ...summary };
    }
    
    // Complete the harvest
    await harvestService.completeHarvest(harvest.id);
    
    // Store in barn
    const { barnService } = await import('../services/unified/farmService');
    const barnItem = await barnService.storeHarvest(harvest);
    
    // Emit WebSocket events
    websocketManager.broadcast('farm:completed', {
      farmId: farmId,
      farmName: name.trim(),
      status: 'completed',
      completedAt: new Date()
    });
    
    // CRITICAL: Use broadcastWithAck for guaranteed harvest:completed delivery
    // This ensures frontend receives harvest completion event even with WebSocket reconnections
    try {
      const ackResult = await unifiedWebSocketManager.broadcastWithAck(
        'harvest:completed',
        {
          harvestId: harvest.id,
          farmId: farmId,
          summary: harvest.summary,
          quality: harvest.quality
        },
        {
          farmId: farmId,
          retryAttempts: 3,
          timeout: 5000
        }
      );

      if (ackResult.success) {
        logger.info(LogCategory.FARM,
          `Harvest completed event delivered to ${ackResult.delivered} clients for harvest ${harvest.id}`);
      } else {
        logger.warn(LogCategory.FARM,
          `Harvest completed partial delivery: ${ackResult.delivered} delivered, ${ackResult.failed} failed`);
      }
    } catch (broadcastError) {
      logger.error(LogCategory.FARM, `Failed to broadcast harvest:completed event:`, broadcastError);
      // Don't fail harvest completion if broadcast fails - harvest is already completed
    }
    
    const response: ApiResponse = {
      success: true,
      data: {
        farm: {
          id: farmId,
          name: name.trim(),
          status: 'completed'
        },
        harvest: {
          id: harvest.id,
          status: harvest.status
        },
        barnItem: {
          id: barnItem.id
        }
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error completing farm:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to complete farm'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/farms/:id/launch - Launch farm using orchestrator.py
router.post('/:id/launch', requirePermission(['farms:control']), expensiveRateLimit.middleware(), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      numberOfAgents = 3, 
      collaborative = false, 
      bundleSteps,
      includeBarnCatalog = false,
      barnReferences = [],
      autoBarnDiscovery = false,
      goWildMode = false,
      yamlContent,  // Accept YAML from frontend
      prompt,       // Accept prompt from frontend
      provider      // Accept provider from frontend
    } = req.body;

    // Get farm details
    const farmResult = await db.query('SELECT * FROM farms WHERE id = $1', [id]);
    if (farmResult.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      };
      return res.status(404).json(response);
    }

    const farm = farmResult.rows[0];
    
    // Check if this is a Go Wild farm
    const isGoWildFarm = goWildMode || 
                         farm.type === 'autonomous' || 
                         farm.config?.goWildMode?.enabled;
    
    // If it's a Go Wild farm, start Go Wild exploration
    if (isGoWildFarm) {
      console.log(`[Farm Launch] Detected Go Wild mode for farm ${id}`);
      
      // Import goWildManager
      const { goWildManager } = await import('../services/unified/farmService');
      
      // Prepare Go Wild config from farm and request
      const goWildConfig = {
        creativityLevel: farm.config?.goWildMode?.creativityLevel || 70,
        explorationDepth: numberOfAgents || farm.config?.maxAgents || 5,
        maxDuration: farm.config?.timeout ? Math.ceil(farm.config.timeout / 60) : 30, // Convert seconds to minutes
        boundaries: {
          allowExternalAPIs: true,
          allowFileSystem: true,
          allowNetworkRequests: true,
          restrictedDomains: []
        },
        focusAreas: farm.config?.goWildMode?.focusAreas || []
      };
      
      // Start Go Wild exploration
      try {
        const session = await goWildManager.startExploration(id, goWildConfig);
        console.log(`[Farm Launch] Started Go Wild session ${session.id} for farm ${id}`);
        
        // IMPORTANT: Return early - Go Wild manager handles the launch
        // Don't continue to regular orchestrator launch
        const response: ApiResponse<any> = {
          success: true,
          data: {
            message: 'Go Wild exploration started successfully',
            sessionId: session.id,
            farmId: id,
            orchestrator: 'xenosync'
          },
          meta: {
            version: '1.0.0', // API version
            timestamp: new Date().toISOString()
          }
        };
        return res.json(response);
      } catch (goWildError) {
        console.error('[Farm Launch] Failed to start Go Wild exploration:', goWildError);
        // Continue with regular launch as fallback
      }
    }

    // CRITICAL FIX: Use UnifiedFarmLaunchOrchestrator for ALL farm launches
    // This ensures terminal streaming, file watching, and proper monitoring are set up
    console.log(`[Farm Launch] Launching farm ${id} via UnifiedFarmLaunchOrchestrator`);

    // Use prompt from request body, config, description, or default
    const farmPrompt = prompt ||
                      farm.config?.prompt ||
                      farm.description ||
                      farm.config?.yaml ||
                      `Help me with tasks for ${farm.name}`;

    // Get provider from request body or farm config
    const providerOverride = provider || farm.config?.provider || process.env.AI_PROVIDER;
    const selectedProvider = resolveCreationProvider(providerOverride as string | undefined);

    // Update farm config with YAML content if provided from frontend
    if (yamlContent && yamlContent !== farm.config?.yaml) {
      farm.config = { ...farm.config, yaml: yamlContent };
      await db.query(
        'UPDATE farms SET config = $1 WHERE id = $2',
        [farm.config, id]
      );
    }

    // Determine farm mode
    let farmMode = 'harvest';
    if (goWildMode || farm.type === 'autonomous' || farm.config?.goWildMode?.enabled) {
      farmMode = 'gowild';
    }

    // Use UnifiedFarmLaunchOrchestrator which properly sets up terminal streaming
    const { unifiedFarmLaunchOrchestrator } = await import('../services/UnifiedFarmLaunchOrchestrator');

    // CRITICAL FIX: Convert timeout from milliseconds to seconds
    // farms.ts stores/expects milliseconds, but UnifiedFarmLaunchOrchestrator expects seconds
    const DEFAULT_FARM_TIMEOUT_MS = 3600000; // 1 hour in milliseconds
    const farmTimeoutMs = farm.config?.timeout || DEFAULT_FARM_TIMEOUT_MS;
    const farmTimeoutSeconds = Math.floor(farmTimeoutMs / 1000); // Convert to seconds

    console.log(`[Farm Launch] Farm ${id} timeout: ${farmTimeoutMs}ms (${farmTimeoutSeconds}s = ${Math.round(farmTimeoutMs / 60000)} minutes)`);

    // CRITICAL FIX: Use existing dev user ID from database to prevent foreign key violations
    // This must match the user ID in auth.ts and exist in the users table
    const launchUserId = (req as any).user?.userId || DEV_USER_ID;

    const launchResult = await unifiedFarmLaunchOrchestrator.launchFarm({
      farmId: id,
      farmName: farm.name,
      mode: farmMode as 'harvest' | 'quicktask' | 'gowild',
      prompt: farmPrompt,
      agentCount: Math.max(2, numberOfAgents), // Ensure minimum 2 agents
      timeout: farmTimeoutSeconds, // Pass timeout in SECONDS as expected by interface
      provider: selectedProvider as FarmProvider,
      userId: launchUserId,
      creativityLevel: farm.config?.goWildMode?.creativityLevel,
      files: farm.config?.attachmentPaths || [],
      yamlContent: yamlContent || farm.config?.yaml
    });

    if (!launchResult.success) {
      throw new Error(launchResult.error || 'Farm launch failed');
    }

    // Update farm status to active
    await db.query(
      'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
      ['active', new Date(), id]
    );

    // CRITICAL: Use broadcastWithAck for guaranteed farm:launched delivery
    // This ensures frontend receives farm launch event even with WebSocket reconnections
    try {
      const ackResult = await unifiedWebSocketManager.broadcastWithAck(
        'farm:launched',
        {
          farmId: id,
          farmName: farm.name,
          sessionName: launchResult.sessionName,
          harvestId: launchResult.harvestId,
          status: 'active',
          numberOfAgents,
          timestamp: new Date()
        },
        {
          farmId: id,
          retryAttempts: 3,
          timeout: 5000
        }
      );

      if (ackResult.success) {
        logger.info(LogCategory.FARM,
          `Farm launch event delivered to ${ackResult.delivered} clients for farm ${id}`);
      } else {
        logger.warn(LogCategory.FARM,
          `Farm launch partial delivery: ${ackResult.delivered} delivered, ${ackResult.failed} failed`);
      }
    } catch (broadcastError) {
      logger.error(LogCategory.FARM, `Failed to broadcast farm:launched event:`, broadcastError);
      // Don't fail farm launch if broadcast fails - farm is already launched
    }

    // Use frontend port 3000 for farm URLs (not backend API port 4567)
    const frontendPort = process.env.VITE_PORT || '3000';
    const farmUrl = `http://localhost:${frontendPort}/farm/${id}`;

    const response: ApiResponse = {
      success: true,
      data: {
        farmId: id,
        sessionName: launchResult.sessionName,
        harvestId: launchResult.harvestId,
        status: 'active',
        numberOfAgents,
        farmUrl,
        message: `🚀 Farm launched successfully! View at: ${farmUrl}`
      }
    };

    console.log(`[Farm API] 🚀 Farm ${id} launched successfully. View at: ${farmUrl}`);
    res.json(response);
  } catch (error) {
    console.error('Error launching farm:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to launch farm'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/farms/:id/launch-with-barn - Launch farm with enhanced barn integration
router.post('/:id/launch-with-barn', requirePermission(['farms:control']), expensiveRateLimit.middleware(), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      numberOfAgents = 3, 
      collaborative = false, 
      bundleSteps,
      autoBarnDiscovery = true,
      barnSearchQuery,
      includeBarnCatalog = true,
      barnReferences = [],
      maxBarnItems = 5
    } = req.body;

    // Get farm details
    const farmResult = await db.query('SELECT * FROM farms WHERE id = $1', [id]);
    if (farmResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      });
    }

    const farm = farmResult.rows[0];
    const farmPrompt = req.body.prompt || 
                      farm.config?.prompt || 
                      description?.trim() || '' || 
                      farm.config?.yaml || 
                      `Help me with tasks for ${name.trim()}`;
    
    const providerOverride = req.body.provider || farm.config?.provider || process.env.AI_PROVIDER;
    const selectedProvider = resolveCreationProvider(providerOverride as string | undefined);
    
    // Create harvest
    let harvestId: string | undefined;
    try {
      const harvest = await harvestService.startHarvest(id, name.trim(), req.userId || 'system');
      harvestId = harvest.id;
    } catch (harvestError) {
      console.error('Failed to create harvest for farm:', harvestError);
    }
    
    // Use enhanced launch with barn integration
    const launchParams = {
      farmId: id,
      name: name.trim(),
      description: description?.trim() || '',
      numberOfAgents,
      prompt: farmPrompt,
      yamlContent: farm.config.yaml,
      steps: farm.config.steps || req.body.steps,
      collaborative,
      bundleSteps,
      provider: selectedProvider as FarmProvider,
      contextFiles: farm.config?.attachmentPaths || [],  // Include attachment paths
      harvestId,
      autoBarnDiscovery,
      barnSearchQuery,
      includeBarnCatalog,
      barnReferences
    };
    
    const processId = await launchFarmWithBarnIntegration(launchParams);

    // Update farm with process ID
    await db.query(
      'UPDATE farms SET status = $1, config = $2, updated_at = $3 WHERE id = $4',
      ['launching', { ...farm.config, processId, harvestId, barnIntegrated: true }, new Date(), id]
    );
    
    await farmManager.updateFarmStatus(id, 'launching');
    
    // Broadcast events
    if (harvestId) {
      websocketManager.broadcast('harvest:started', {
        harvestId,
        farmId: id,
        farmName: name.trim(),
        barnIntegrated: true,
        timestamp: new Date()
      });
    }
    
    // CRITICAL: Use broadcastWithAck for guaranteed farm:launched delivery
    // This ensures frontend receives farm launch event even with WebSocket reconnections
    try {
      const ackResult = await unifiedWebSocketManager.broadcastWithAck(
        'farm:launched',
        {
          farmId: id,
          farmName: name.trim(),
          processId,
          harvestId,
          status: 'launching',
          numberOfAgents,
          barnIntegrated: true,
          sessionName: `farm-${id.substring(0, 8)}`,
          timestamp: new Date()
        },
        {
          farmId: id,
          retryAttempts: 3,
          timeout: 5000
        }
      );

      if (ackResult.success) {
        logger.info(LogCategory.FARM,
          `Farm launch (barn) event delivered to ${ackResult.delivered} clients for farm ${id}`);
      } else {
        logger.warn(LogCategory.FARM,
          `Farm launch (barn) partial delivery: ${ackResult.delivered} delivered, ${ackResult.failed} failed`);
      }
    } catch (broadcastError) {
      logger.error(LogCategory.FARM, `Failed to broadcast farm:launched (barn) event:`, broadcastError);
      // Don't fail farm launch if broadcast fails - farm is already launched
    }

    // Use frontend port 3000 for farm URLs (not backend API port 4567)
    const frontendPort = process.env.VITE_PORT || '3000';
    const farmUrl = `http://localhost:${frontendPort}/farm/${id}`;

    console.log(`[Farm API] 🚀 Farm ${id} launched with barn integration. View at: ${farmUrl}`);

    res.json({
      success: true,
      data: {
        farmId: id,
        processId,
        harvestId,
        status: 'launching',
        farmUrl,
        barnIntegration: {
          enabled: true,
          autoBarnDiscovery,
          includeBarnCatalog,
          referencesCount: barnReferences.length
        }
      },
      meta: {
        timestamp: new Date()
      },
      message: `🚀 Farm launched with barn integration! View at: ${farmUrl}`
    });

  } catch (error) {
    console.error('Error launching farm with barn integration:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to launch farm with barn integration'
      }
    });
  }
});

// POST /api/farms/:id/stop - Stop farm operations
router.post('/:id/stop', requirePermission(['farms:control']), apiRateLimits.standard, async (req, res) => {
  try {
    const { id } = req.params;
    // Get user ID from auth context or use development bypass
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if graceful shutdown was requested (default to true)
    const { graceful = true } = req.body;
    
    const farmService = getService('farm');
    let farm;
    if (graceful) {
      // Use graceful shutdown by default to collect yields
      console.log(`[Farm API] Using graceful shutdown for farm ${id}`);
      farm = await farmService.gracefulShutdownFarm(id, userId, 'user_request');
    } else {
      // Use regular stop if explicitly requested
      console.log(`[Farm API] Using regular stop for farm ${id}`);
      farm = await farmService.stopFarm(id, userId);
    }
    
    if (!farm) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found or not in a stoppable state'
        }
      };
      return res.status(404).json(response);
    }

    // Update database
    await db.query(
      'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
      ['stopped', new Date(), id]
    );

    // Check if farm has a processId and stop via orchestratorService
    const farmResult = await db.query('SELECT config FROM farms WHERE id = $1', [id]);
    if (farmResult.rows.length > 0 && farmResult.rows[0].config?.processId) {
      try {
        await orchestratorService.stopFarm(farmResult.rows[0].config.processId);
      } catch (error) {
        console.log(`[Farm Stop] Could not stop process ${farmResult.rows[0].config.processId}:`, error);
        // Continue even if process stop fails - farm is already marked as stopped
      }
    }

    // Also try to stop tmux session directly
    // FIX: Add TMUX_TMPDIR for cross-process tmux visibility (critical per CLAUDE.md)
    const tmuxSession = `farm_${id.substring(0, 8)}`;
    try {
      const { spawn } = await import('child_process');
      spawn('tmux', ['kill-session', '-t', tmuxSession], {
        env: { ...process.env, TMUX_TMPDIR: '/tmp' }
      });
    } catch (error) {
      console.log(`[Farm Stop] Could not kill tmux session ${tmuxSession}:`, error);
    }

    // Emit WebSocket event
    websocketManager.broadcast('farm:stopped', {
      farm: {
        id: id,
        name: farm?.name || `Farm ${id.substring(0, 8)}`,
        status: 'stopped'
      }
    });

    const response: ApiResponse = {
      success: true,
      data: {
        farmId: id,
        status: 'stopped'
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error stopping farm:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to stop farm'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/farms/:id/harvest-now - Capture snapshot of current work without stopping the farm
router.post('/:id/harvest-now', requirePermission(['farms:control']), apiRateLimits.standard, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify farm exists and is running
    const farmResult = await db.query(
      'SELECT id, name, status, config FROM farms WHERE id = $1',
      [id]
    );

    if (farmResult.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      };
      return res.status(404).json(response);
    }

    const farm = farmResult.rows[0];
    if (farm.status !== 'running' && farm.status !== 'active') {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Farm is not currently running'
        }
      };
      return res.status(400).json(response);
    }

    // Generate snapshot ID
    const snapshotId = `snapshot-${Date.now()}-${id.substring(0, 8)}`;

    // Collect current yields without stopping the farm
    const barnService = getService('barn');
    const harvestService = getService('harvest');

    // Get current agent outputs for snapshot
    let snapshotData: any = {};
    try {
      // Get the current harvest data
      const harvestResult = await db.query(
        'SELECT id, files_collected, artifacts FROM harvests WHERE farm_id = $1 ORDER BY created_at DESC LIMIT 1',
        [id]
      );

      if (harvestResult.rows.length > 0) {
        const harvest = harvestResult.rows[0];
        snapshotData = {
          harvestId: harvest.id,
          filesCollected: harvest.files_collected || [],
          artifacts: harvest.artifacts || []
        };
      }

      // Capture terminal output snapshot
      const terminalService = getService('terminal');
      if (terminalService && typeof terminalService.captureSnapshot === 'function') {
        snapshotData.terminalSnapshot = await terminalService.captureSnapshot(id);
      }

      // Store snapshot in barn as a partial harvest
      if (barnService && typeof barnService.storeSnapshot === 'function') {
        await barnService.storeSnapshot(id, snapshotId, snapshotData);
      }

    } catch (snapshotError) {
      console.warn(`[Farm API] Error capturing snapshot for farm ${id}:`, snapshotError);
      // Continue - we'll still return success with partial data
    }

    // Emit WebSocket event to notify clients
    websocketManager.broadcast('harvest:snapshot', {
      farmId: id,
      snapshotId,
      timestamp: new Date().toISOString(),
      message: 'Snapshot captured successfully. Farm continues running.'
    });

    console.log(`[Farm API] Snapshot ${snapshotId} captured for farm ${id} - farm continues running`);

    const response: ApiResponse = {
      success: true,
      data: {
        farmId: id,
        snapshotId,
        status: 'snapshot_captured',
        farmStatus: farm.status,
        message: 'Snapshot captured. Farm continues running.',
        timestamp: new Date().toISOString()
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error capturing harvest snapshot:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to capture harvest snapshot'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/farms/:id/graceful-shutdown - Gracefully shutdown farm with yield collection
router.post('/:id/graceful-shutdown', requirePermission(['farms:control']), apiRateLimits.standard, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = 'user_request' } = req.body;
    // Get user ID from auth context or use development bypass
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Validate reason
    if (!['user_request', 'timeout', 'completion'].includes(reason)) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Invalid shutdown reason. Must be one of: user_request, timeout, completion'
        }
      };
      return res.status(400).json(response);
    }

    console.log(`[Farm API] Initiating graceful shutdown for farm ${id} (reason: ${reason})`);

    // Use graceful shutdown instead of regular stop
    const farm = await farmManager.gracefulShutdownFarm(id, userId, reason as 'timeout' | 'user_request' | 'completion');
    
    if (!farm) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found or not in a stoppable state'
        }
      };
      return res.status(404).json(response);
    }

    // Emit WebSocket event for graceful shutdown
    websocketManager.broadcast('farm:graceful_shutdown_initiated', {
      farm: {
        id: farmId,
        name: name.trim(),
        status: farm.status
      },
      reason,
      message: 'Collecting yields and preparing for harvest...'
    });

    const response: ApiResponse = {
      success: true,
      data: {
        farmId: id,
        status: farm.status,
        reason,
        message: 'Graceful shutdown initiated. Yields will be collected before termination.'
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error during graceful farm shutdown:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to initiate graceful shutdown'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/farms/:id/task-metrics - Get standardized task metrics for farm
router.get('/:id/task-metrics', apiRateLimits.read, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get standardized task metrics using tmux pane counting
    const metrics = await orchestratorService.getStandardizedTaskMetrics(id);
    
    if (!metrics) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found or not running'
        }
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: {
        ...metrics,
        standard: {
          definition: '1 Agent = 1 tmux pane = 1 concurrent task execution context',
          architecture: 'Farm -> N Agents (tmux panes) -> M Tasks (sequential per agent)',
          calculation: 'Agent count determined by "tmux list-panes" command'
        }
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting task metrics:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get task metrics'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/farms/:id/health - Get farm health status
router.get('/:id/health', apiRateLimits.read, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify farm exists
    const farmResult = await db.query('SELECT id FROM farms WHERE id = $1', [id]);
    if (farmResult.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      };
      return res.status(404).json(response);
    }

    // Get health status from orchestratorService
    const healthStatus = await orchestratorService.getFarmHealth(id);
    
    if (!healthStatus) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NO_HEALTH_DATA',
          message: 'No health monitoring data available for this farm'
        }
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: {
        sessionName: healthStatus.sessionName,
        exists: healthStatus.exists,
        status: healthStatus.status,
        paneCount: healthStatus.paneCount,
        responsivePanes: healthStatus.responsivePanes,
        zombiePanes: healthStatus.zombiePanes,
        uptime: healthStatus.uptime,
        lastHealthCheck: healthStatus.lastHealthCheck,
        issues: healthStatus.issues
      }
    };
    res.json(response);

  } catch (error) {
    console.error('Error getting farm health:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get farm health status'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/farms/:id/terminal/:agentId - Get agent terminal output
router.get('/:id/terminal/:agentId', apiRateLimits.read, async (req, res) => {
  try {
    const { id, agentId } = req.params;

    // Get farm with process ID
    const farmResult = await db.query('SELECT config FROM farms WHERE id = $1', [id]);
    if (farmResult.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      };
      return res.status(404).json(response);
    }

    const processId = farmResult.rows[0].config?.processId;
    if (!processId) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Farm is not running'
        }
      };
      return res.status(400).json(response);
    }

    // Get terminal output using farmId
    const terminalResult = await orchestratorService.getAgentTerminal(id, parseInt(agentId));
    
    // Return the result directly if it failed
    if (!terminalResult.success) {
      return res.status(400).json(terminalResult);
    }

    const response: ApiResponse = terminalResult;

    res.json(response);
  } catch (error) {
    console.error('Error getting terminal:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get terminal output'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/farms/:id/terminal/:agentId/command - Send command to agent
router.post('/:id/terminal/:agentId/command', requirePermission(['farms:control']), apiRateLimits.write, async (req, res) => {
  try {
    const { id, agentId } = req.params;
    const { command } = req.body;

    if (!command) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Command is required'
        }
      };
      return res.status(400).json(response);
    }

    // Get farm with process ID
    const farmResult = await db.query('SELECT config FROM farms WHERE id = $1', [id]);
    if (farmResult.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      };
      return res.status(404).json(response);
    }

    const processId = farmResult.rows[0].config?.processId;
    if (!processId) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Farm is not running'
        }
      };
      return res.status(400).json(response);
    }

    // Send command to agent
    await orchestratorService.sendCommandToAgent(processId, parseInt(agentId), command);

    const response: ApiResponse = {
      success: true,
      data: {
        farmId: id,
        agentId: parseInt(agentId),
        command,
        timestamp: new Date()
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error sending command:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to send command'
      }
    };
    res.status(500).json(response);
  }
});

// PUT /api/farms/:id/provider - Switch AI provider for a farm
router.put('/:id/provider', requirePermission(['farms:update']), apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;
    const { provider } = req.body;
    
    if (!provider || !['claude', 'openai'].includes(provider)) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Provider must be either "claude" or "openai"'
        }
      };
      return res.status(400).json(response);
    }

    // Use AI orchestrator to switch provider
    await aiOrchestrator.switchFarmProvider(id, provider as 'claude' | 'openai');
    
    const response: ApiResponse = {
      success: true,
      data: {
        farmId: id,
        provider,
        message: `Farm provider switched to ${provider}`
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error switching farm provider:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to switch provider'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/farms/:id/multi-claude/status - Get orchestrator process status (legacy endpoint maintained for compatibility)
// New applications should use the standard farm status endpoint
router.get('/:id/multi-claude/status', apiRateLimits.read, async (req, res) => {
  try {
    const { id } = req.params;

    // Get farm with process ID
    const farmResult = await db.query('SELECT config FROM farms WHERE id = $1', [id]);
    if (farmResult.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      };
      return res.status(404).json(response);
    }

    const processId = farmResult.rows[0].config?.processId;
    
    // In development mode without a real process, return mock data
    if (!processId && (process.env.NODE_ENV === 'development' || process.env.BYPASS_AUTH === 'true')) {
      const response: ApiResponse = {
        success: true,
        data: {
          farmId: id,
          processId: null,
          status: 'idle',
          tmuxSession: null,
          agents: [],
          startTime: null,
          isRunning: false
        }
      };
      return res.json(response);
    }
    
    if (!processId) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No orchestrator process associated'
        }
      };
      return res.status(404).json(response);
    }

    // Get process status
    const status = orchestratorService.getFarmStatus(processId);

    // Get agent names from database
    let agentsWithNames = [];
    if (status) {
      const agentsResult = await db.query(
        'SELECT id, name FROM agents WHERE farm_id = $1',
        [id]
      );
      
      const agentNameMap = new Map(agentsResult.rows.map(row => [row.id, row.name]));
      
      agentsWithNames = Array.from(status.agents.values()).map((agent: any) => ({
        ...agent,
        name: agentNameMap.get(agent.id) || `Agent ${agent.id}`
      }));
    }

    const response: ApiResponse = {
      success: true,
      data: status ? {
        farmId: id,
        processId: status.id,
        status: status.status,
        tmuxSession: status.tmuxSession,
        agents: agentsWithNames,
        startTime: status.startTime
      } : null
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting orchestrator status:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get orchestrator status'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/farms/system/health - Get overall system health
router.get('/system/health', apiRateLimits.read, async (req, res) => {
  try {
    // Import tmuxHealthManager - need to import here to avoid circular dependency
    const { tmuxHealthManager } = await import('../services/tmuxHealthManager');
    
    // Get comprehensive health summary
    const healthSummary = tmuxHealthManager.getHealthSummary();
    
    // Get list of all monitored sessions with detailed health
    const monitoredSessions = tmuxHealthManager.getMonitoredSessions();
    const sessionDetails = [];
    
    for (const sessionName of monitoredSessions) {
      const sessionHealth = tmuxHealthManager.getSessionHealth(sessionName);
      const agentHealth = tmuxHealthManager.getAgentHealth(sessionName);
      
      if (sessionHealth) {
        sessionDetails.push({
          sessionName,
          health: sessionHealth,
          agents: agentHealth ? Array.from(agentHealth.entries()).map(([id, health]) => ({
            agentId: id,
            paneId: health.paneId,
            status: health.status,
            isResponsive: health.isResponsive,
            lastResponseTime: health.lastResponseTime,
            consecutiveFailures: health.consecutiveFailures,
            lastHeartbeat: health.lastHeartbeat
          })) : []
        });
      }
    }
    
    const response: ApiResponse = {
      success: true,
      data: {
        summary: healthSummary,
        sessions: sessionDetails,
        timestamp: new Date()
      }
    };

    res.json(response);

  } catch (error) {
    console.error('Error getting system health:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get system health status'
      }
    };
    res.status(500).json(response);
  }
});

// Terminate farm (alias for stop)
router.post('/:id/terminate', async (req, res) => {
  try {
    const { id } = req.params;
    const farmService = getService('farm');

    // Forward to the existing stop endpoint logic
    const farm = await farmService.stopFarm(id);

    res.json({
      success: true,
      data: farm,
      message: 'Farm terminated successfully'
    });
  } catch (error) {
    console.error('Error terminating farm:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TERMINATE_FAILED',
        message: 'Failed to terminate farm'
      }
    });
  }
});

// Get farm metrics (alias for task-metrics)
router.get('/:id/metrics', async (req, res) => {
  try {
    const { id } = req.params;

    const farm = await farmService.findById(id);
    if (!farm) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Farm not found' }
      });
    }

    // Return metrics data
    const metrics = {
      farmId: id,
      status: farm.status,
      agentCount: farm.agents?.length || 0,
      duration: farm.duration || 0,
      tasksCompleted: farm.taskCount || 0,
      performance: {
        cpu: 0,
        memory: 0,
        responseTime: 0
      },
      timestamps: {
        created: farm.createdAt,
        updated: farm.updatedAt,
        completed: farm.completedAt
      }
    };

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error getting farm metrics:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'METRICS_FAILED',
        message: 'Failed to get farm metrics'
      }
    });
  }
});

export default router;
