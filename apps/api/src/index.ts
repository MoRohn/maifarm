import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { watchFile } from 'fs';
import { spawn } from 'child_process';
import helmet from 'helmet';
import compression from 'compression';
import { v4 as uuidv4 } from 'uuid';
// Import centralized configuration
import { config, logConfiguration, validateConfiguration } from './config/index.js';
// Import production-grade logger
import { logger, LogCategory, LogLevel } from './services/ProductionLogger.js';

// Configure logger based on environment
if (process.env.NODE_ENV === 'production') {
  logger.info(LogCategory.SYSTEM, 'Starting MaiFarm in production mode');
} else {
  logger.info(LogCategory.SYSTEM, 'Starting MaiFarm in development mode');
}

// Global error handlers for production stability
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.fatal(LogCategory.SYSTEM, 'Unhandled Promise Rejection', {
    reason: reason?.message || String(reason),
    stack: reason?.stack,
    promise: promise.toString()
  });

  // In production, attempt graceful shutdown
  if (process.env.NODE_ENV === 'production') {
    logger.error(LogCategory.SYSTEM, 'Initiating graceful shutdown due to unhandled rejection');
    setTimeout(() => {
      process.exit(1);
    }, 5000);
  }
});

process.on('uncaughtException', (error: Error) => {
  logger.fatal(LogCategory.SYSTEM, 'Uncaught Exception', {
    message: error.message,
    stack: error.stack,
    name: error.name
  });

  // Uncaught exceptions are more severe - exit immediately
  logger.error(LogCategory.SYSTEM, 'Process terminating due to uncaught exception');
  process.exit(1);
});

const validationResult = validateConfiguration();

if (!validationResult.success) {
  const issueCount = validationResult.errors.length;
  const summary = `Configuration validation failed with ${issueCount} issue${issueCount === 1 ? '' : 's'}.`;

  const exitMessage = process.env.NODE_ENV === 'test'
    ? `${summary} Halting startup in test environment.`
    : `${summary} Exiting startup.`;

  logger.fatal(LogCategory.CONFIG, exitMessage, {
    errors: validationResult.errors,
    issueCount
  });

  if (process.env.NODE_ENV === 'test') {
    throw new Error([summary, ...validationResult.errors.map(err => `- ${err}`)].join('\n'));
  }

  process.exit(1);
}

logConfiguration();

// Import API routes
// Apple Sign-In authentication (simplified, iOS-first)
import authRouter from './api/auth';
import userManagementRouter from './api/user-management'; // Enhanced multi-user admin system
import agentsRouter from './api/agents';
import farmsRouter from './api/farms';
import tasksRouter from './api/tasks';
import quickActionsRouter from './api/quickActions';
import metricsRouter from './api/metrics';
import monitoringRouter from './api/monitoring';
import harvestsRouter from './api/harvests';
import goWildRouter from './routes/goWild';
import seedsRouter from './api/seeds';
import harvestRouter from './api/harvest';
import incubationRouter from './api/incubation';
import barnRouter from './api/barn';
import barnCollectionRouter from './api/barnCollection';
import maibarnRouter from './api/maibarn';
import workflowRouter from './api/workflow';
import testFarmsRouter from './api/test-farms';
// health.ts was removed, using healthz.ts instead
import yamlRouter from './api/yaml';
import { analyticsRouter } from './api/analytics';
import orchestratorRouter from './api/orchestrator';
import orchestratorProxyRouter from './routes/orchestratorProxy';
import providersRouter from './api/providers';
import costTrackingRouter from './api/costTracking';
import ollamaRouter from './api/ollama';
import openaiRouter from './api/openai';
import farmersRouter from './api/farmers';
import farmerGroupsRouter from './api/farmer-groups';
import coordinationRouter from './api/coordination';
import terminalRouter from './routes/terminal';
import terminalTestRouter from './api/terminalTest';
import terminalRefreshRouter from './api/terminal-refresh';
import terminalHealthRouter from './api/terminal-health';
import advancedTerminalRouter from './api/advanced-terminal';
import terminalFixRouter from './api/terminal-fix';
import universalTerminalFixRouter from './api/universal-terminal-fix';
import websocketHealthRouter from './api/websocket-health';
import xenosyncRouter from './api/xenosync';
import apiKeysRouter from './api/apikeys';
import clientRouter from './api/client';
import adminRouter from './api/admin';
import settingsRouter from './api/settings';
import chatRouter from './api/chat';
import farmLifecycleMonitorRouter from './api/farm-lifecycle-monitor';
import recoveryRouter from './api/recovery';
import systemHealthRouter from './api/system-health';
import aiEngineManagementRouter from './api/ai-engines';
import enginesRouter from './api/engines';
import enginesConfigRouter from './api/engines-config';
import aiEnginesDeviceRouter from './api/ai-engines-device'; // Device-optimized AI engine endpoints for iOS
import yieldRouter from './api/yield';
import autoModelSetupRouter from './api/auto-model-setup';
import auditRouter from './api/audit';
import modelingRouter from './api/modeling'; // Model-First Reasoning + DEMOCRITUS Causal Models
import thermalRouter from './api/thermal'; // Thermal monitoring and auto-adjustment
import deviceHardwareRouter from './api/device-hardware'; // Device hardware detection and AI engine limits
import assistantRouter from './api/assistant'; // Assistant agent nudge and session management
import crossDeviceRouter from './api/cross-device'; // Cross-device sync and farm handoff for iOS/iMac ecosystem
import contextMonitoringRouter from './api/context-monitoring'; // Context window monitoring and automated management
import confidenzRouter from './api/confidenz'; // Confidence scoring for farm monitoring
import pluginsRouter from './api/plugins'; // Blerbz plugins coordination (confidenz, continuez, planz)
// import enhancementsRouter from './routes/enhancements'; // Disabled - enhancement service removed

// Import middleware
import { apiRateLimits } from './middleware/rateLimit';
import { monitoringMiddleware } from './middleware/monitoring';
import { corsMiddleware, corsErrorHandler } from './middleware/cors';
import { sanitizeAll } from './middleware/sanitizer';
import { aiProxyMiddleware, proxyLoggingMiddleware } from './middleware/aiProxy';
import { trackAICost } from './middleware/aiCostTracking';

// Import database and WebSocket
import { initializeDatabase, checkDatabaseHealth, closeDatabaseConnections } from './database/connection';
import WebSocketServer from './websocket/socketServer';
import { websocketHub } from './services/unified/websocketHub';
import { orchestrator } from './orchestrator';
import { metricsCollector } from './monitoring/metricsCollector';
import { startLatencyReporter } from './monitoring/latencyReporter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create app function for testing
export function createApp() {
  const app = express();
  return app;
}

const app = createApp();
const httpServer = createServer(app);

// Initialize WebSocket server
let wsServer: WebSocketServer;

// Start background latency reporter for key endpoints
startLatencyReporter();

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "ws://localhost:*", "wss://localhost:*", "http://localhost:*", "https://localhost:*"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: process.env.NODE_ENV === 'production',
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
app.use(corsMiddleware);
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// REMOVED: Auth bypass mode - all users must authenticate properly

// HTTP request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const correlationId = (req.headers['x-correlation-id'] as string) || `req-${uuidv4().substring(0, 8)}`;

  // Set correlation ID for this request
  logger.setCorrelationId(correlationId);
  res.setHeader('x-correlation-id', correlationId);

  // Capture the original end function
  const originalEnd = res.end;

  res.end = function(...args: any[]) {
    // Calculate duration
    const duration = Date.now() - start;

    // Log the request using production logger
    logger.httpRequest(req.method, req.path, res.statusCode, duration);

    // Clear correlation ID after response
    logger.clearCorrelationId();

    // Call the original end function
    originalEnd.apply(res, args);
  };

  next();
});

// Apply rate limiting to all routes (DISABLED FOR DEVELOPMENT)
// if (process.env.NODE_ENV === 'production') {
//   app.use(apiRateLimits.global);
// }

// AI Provider proxy middleware
app.use(aiProxyMiddleware);
app.use(proxyLoggingMiddleware);

// Input sanitization middleware
app.use(sanitizeAll);

// Monitoring middleware
app.use(monitoringMiddleware.request);
app.use(monitoringMiddleware.performance(1000)); // 1 second threshold
app.use(monitoringMiddleware.resource);

// AI Cost tracking middleware
app.use(trackAICost);


// Integration with Builder coordination directory
const COORDINATION_DIR = '/tmp/claude_coordination';
const ACTIVE_AGENTS_FILE = path.join(COORDINATION_DIR, 'active_agents.json');

// In-memory store for farms and agents
const farms = new Map();
const agents = new Map();

// Watch coordination directory for changes
async function watchCoordinationDirectory() {
  try {
    // Check if directory exists first
    try {
      await fs.access(COORDINATION_DIR);
    } catch (error) {
      logger.info('COORD', 'Coordination directory not found, creating it...');
      await fs.mkdir(COORDINATION_DIR, { recursive: true });
      await fs.writeFile(ACTIVE_AGENTS_FILE, '[]');
    }
    
    // Use watchFile instead of fs.watch to avoid hanging
    watchFile(ACTIVE_AGENTS_FILE, { interval: 1000 }, async (curr, prev) => {
      if (curr.mtime !== prev.mtime) {
        await updateActiveAgents();
      }
    });

    logger.info(LogCategory.COORD, 'Watching coordination directory', { path: COORDINATION_DIR });
  } catch (error) {
    console.error('Error setting up coordination directory watch:', error);
  }
}

// Update active agents from coordination file
async function updateActiveAgents() {
  try {
    let data = '[]';
    try {
      data = await fs.readFile(ACTIVE_AGENTS_FILE, 'utf-8');
    } catch (error) {
      logger.debug('COORD', 'Active agents file not found, using empty array');
    }
    const activeAgents = JSON.parse(data);
    
    // Update our in-memory store and notify clients
    for (const [agentId, agentData] of Object.entries(activeAgents)) {
      const existingAgent = agents.get(agentId);
      if (!existingAgent || existingAgent.status !== agentData.status) {
        agents.set(agentId, {
          id: agentId,
          ...agentData,
          lastUpdate: new Date()
        });
        
        if (wsServer) {
          wsServer.broadcast('agent:updated', {
            id: agentId,
            ...agentData
          });
        }
      }
    }
  } catch (error) {
    console.error('Error reading active agents:', error);
  }
}

// Health check endpoints are now in the health router

// Import health check router
import healthzRouter from './api/healthz';

// Swagger/OpenAPI Documentation
import { setupSwagger } from './config/swagger.js';

// Setup Swagger UI at /api-docs
setupSwagger(app);

// Health check endpoints - consolidated to single endpoint
app.use('/health', healthzRouter);
app.use('/healthz', healthzRouter);

// NEW: Unified Gateway API (v2) - DISABLED (incomplete implementation)
// import gatewayRouter from './gateway/index.js';
// app.use('/api/v2/gateway', gatewayRouter);

// API Routes (Legacy - maintained for backward compatibility)
// Health endpoint - using healthz router for all health checks
app.use('/api/health', healthzRouter);
app.use('/api/auth', authRouter);
app.use('/api/audit', auditRouter);
/**
 * User management API
 * - Handles admin-facing user administration
 * - Self-service registration routes live under /api/auth (see auth router)
 * - Legacy /api/users endpoints are deprecated in favour of this router
 */
app.use('/api/users', userManagementRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/farms', farmsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/quick-actions', quickActionsRouter);

// Simple test endpoint to verify server is working
app.post('/api/quicktest', (req, res) => {
  const { description } = req.body;
  if (!description) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Description is required' }
    });
  }
  const farmId = uuidv4();
  const taskId = uuidv4();
  console.log('[QuickTest] Success:', { farmId, taskId });
  res.status(201).json({
    success: true,
    data: { taskId, farmId, status: 'active' },
    farmId
  });
});

// Backward compatibility route for quicktask - import quickTaskService directly
app.post('/api/quicktask', async (req, res) => {
  try {
    const { quickTaskService } = await import('./services/unified/quickTaskService');
    const { title, description, priority, timeout, metadata, mode, provider, maxAgents } = req.body;

    // Support both title/description and just description with mode
    const taskTitle = title || (description ? `Quick Task: ${description.substring(0, 50)}` : null);
    const taskDescription = description;

    if (!taskDescription) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Description is required'
        }
      });
    }

    // Default to Claude if no provider specified
    const selectedProvider = provider || process.env.AI_PROVIDER || 'claude';

    // Use a proper UUID for anonymous users instead of 'a913e59f-3971-5f06-be81-afa2ef2fa862'
    const userId = (req as any).user?.userId || 'a913e59f-3971-5f06-be81-afa2ef2fa862'; // Anonymous user UUID
    const result = await quickTaskService.createQuickTask({
      title: taskTitle,
      description: taskDescription,
      priority: priority || (mode === 'fast' ? 'high' : 'medium'),
      timeout,
      maxAgents: maxAgents, // Pass maxAgents to support multiple agents
      metadata: {
        ...metadata,
        mode,
        provider: selectedProvider
      }
    }, userId);

    res.status(201).json({
      success: true,
      data: result,
      farmId: result.farmId,
      harvestId: result.harvestId
    });
  } catch (error) {
    console.error('Error creating quick task:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create quick task'
      }
    });
  }
});
app.use('/api/metrics', metricsRouter);
app.use('/api/monitoring', monitoringRouter);
app.use('/api/harvests', harvestsRouter);
app.use('/api/go-wild', goWildRouter);
app.use('/api/seeds', seedsRouter);
app.use('/api/harvest', harvestRouter);
app.use('/api/yield', yieldRouter);
app.use('/api/modeling', modelingRouter); // Model-First Reasoning + DEMOCRITUS Causal Models
app.use('/api/incubations', incubationRouter);
app.use('/api/barn', barnRouter);
app.use('/api/barn-collection', barnCollectionRouter);
app.use('/api/maibarn', maibarnRouter);

// Debug endpoints (development only)
if (process.env.NODE_ENV === 'development') {
  import('./api/debug-terminal').then(({ getTerminalDebugInfo, testTerminalBroadcast }) => {
    app.get('/api/debug/terminal', getTerminalDebugInfo);
    app.post('/api/debug/terminal/broadcast', testTerminalBroadcast);
  }).catch(err => {
    logger.error('DEBUG', 'Failed to load terminal debug endpoints:', err);
  });
}
app.use('/api/farmers', farmersRouter);
app.use('/api/farmer-groups', farmerGroupsRouter);
app.use('/api/coordination', coordinationRouter);
app.use('/api/workflow', workflowRouter);
app.use('/api/yaml', yamlRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/orchestrator', orchestratorRouter);
app.use('/api/python-orchestrator', orchestratorProxyRouter);
app.use('/api/providers', providersRouter);
app.use('/api/cost-tracking', costTrackingRouter);
app.use('/api/ai-engines', aiEngineManagementRouter);
app.use('/api', aiEnginesDeviceRouter); // Device-optimized AI engine endpoints for iOS
app.use('/api', enginesConfigRouter); // NEW: Unified engines configuration (/api/engines/:provider/configure and /api/engines/current)
app.use('/api/engines', enginesRouter); // Existing engines endpoint (fallback)
app.use('/api/ollama', ollamaRouter);
app.use('/api/openai', openaiRouter);
app.use('/api/terminal', terminalRouter);
app.use('/api/terminal-test', terminalTestRouter);
app.use('/api/terminal-refresh', terminalRefreshRouter);
app.use('/api/terminal-health', terminalHealthRouter);
app.use('/api/terminal-fix', terminalFixRouter);
app.use('/api/universal-terminal-fix', universalTerminalFixRouter);
app.use('/api/advanced-terminal', advancedTerminalRouter);
app.use('/api/websocket-health', websocketHealthRouter);
app.use('/api/xenosync', xenosyncRouter);
app.use('/api', apiKeysRouter);
app.use('/api/client', clientRouter);
app.use('/api/admin', adminRouter);
// app.use('/api/enhancements', enhancementsRouter); // Disabled - enhancement service removed
app.use('/api/settings', settingsRouter);
app.use('/api/user-preferences', (await import('./api/user-preferences.js')).default);
app.use('/api/chat', chatRouter);
app.use('/api/farm-lifecycle', farmLifecycleMonitorRouter);
app.use('/api/recovery', recoveryRouter);
app.use('/api/system-health', systemHealthRouter);
app.use('/api/auto-model-setup', autoModelSetupRouter);
app.use('/api/thermal', thermalRouter); // Thermal monitoring and auto-adjustment
app.use('/api/device-hardware', deviceHardwareRouter); // Device hardware detection and AI engine limits
app.use('/api/assistant', assistantRouter); // Assistant agent nudge and session management for iOS
app.use('/api/cross-device', crossDeviceRouter); // Cross-device sync and farm handoff for iOS/iMac ecosystem
app.use('/api/context', contextMonitoringRouter); // Context window monitoring and automated management
app.use('/api/confidenz', confidenzRouter); // Confidence scoring API (inference-confidenz)
app.use('/api/plugins', pluginsRouter); // Blerbz plugins coordination (confidenz, continuez, planz)


// Test routes for development
if (process.env.NODE_ENV === 'development') {
  app.use('/api/test-farms', testFarmsRouter);

  // Test Python orchestrator integration
  import('./routes/testPythonOrchestrator').then(({ default: testPythonRouter }) => {
    app.use('/api/test', testPythonRouter);
    logger.info('ROUTES', '✅ Python orchestrator test routes loaded');
  }).catch(err => {
    logger.error('ROUTES', 'Failed to load Python orchestrator test routes:', err);
  });
}

// Legacy endpoints for backward compatibility
app.get('/api/config', apiRateLimits.read, (req, res) => {
  res.json({
    maxAgents: parseInt(process.env.MAX_AGENTS || '10'),
    maxFarms: parseInt(process.env.MAX_FARMS || '5'),
    features: {
      goWildMode: true,
      yamlGeneration: true,
      analytics: true,
      monitoring: true
    },
    version: process.env.APP_VERSION || '2.0.0'
  });
});

// Import error handling middleware
import { errorHandler, notFoundHandler, timeoutHandler, gracefulShutdown } from './middleware/errorHandler';

// Add timeout handler to all requests
app.use(timeoutHandler);

// Serve static files - Routes must come before error handlers
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
} else {
  // In development, Vite serves the frontend on port 3000
  // The backend only handles API and WebSocket requests
  // If someone accesses the backend directly, return a simple JSON response
  app.get('/', (req, res) => {
    res.json({
      name: 'MaiFarm API Server',
      version: '2.0.0',
      status: 'ok', // Changed from 'running' to 'ok' for standard health check
      message: 'API server is running. Visit http://localhost:3000 for the web interface.',
      endpoints: {
        health: '/health',
        api: '/api/*',
        websocket: 'ws://localhost:4567'
      }
    });
  });
  
  // Serve static files from public directory for any assets
  app.use('/public', express.static(path.join(__dirname, '../public')));
}

// 404 handler for API routes - MUST come after all routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found'
    }
  });
});

// Error handling middleware (must be last)
app.use(corsErrorHandler);
app.use(notFoundHandler);
app.use(errorHandler);

// Helper functions
async function startAgentsForFarm(farmId: string, yamlConfig: string) {
  try {
    // Save YAML config to temporary file
    const configFile = path.join('/tmp', `${farmId}_config.yaml`);
    await fs.writeFile(configFile, yamlConfig);
    
    // Start Builder with the config
    const builderProcess = spawn('builder', ['start', configFile], {
      detached: true,
      stdio: 'ignore'
    });
    
    builderProcess.unref();
    
    // Update farm status
    const farm = farms.get(farmId);
    if (farm) {
      farm.status = 'running';
      farms.set(farmId, farm);
      if (wsServer) {
        wsServer.broadcast('farm:status', { farmId, status: 'running' });
      }
    }
  } catch (error) {
    console.error('Error starting agents:', error);
    const farm = farms.get(farmId);
    if (farm) {
      farm.status = 'failed';
      farms.set(farmId, farm);
      if (wsServer) {
        wsServer.broadcast('farm:status', { farmId, status: 'failed' });
      }
    }
  }
}

function stopAgent(agentId: string) {
  // Implementation to stop a specific agent
  const agent = agents.get(agentId);
  if (agent) {
    agent.status = 'terminated';
    agents.set(agentId, agent);
    if (wsServer) {
      wsServer.broadcast('agent:status', { agentId, status: 'terminated' });
    }
  }
}

// Start server
const PORT = config.server?.port || config.port || 4567;

async function startServer() {
  try {
    // Mark services as initialized for health checks
    // Using simplified startup to avoid initialization hangs
    const { initializationManager } = await import('./services/initializationManager');
    initializationManager.markAsInitialized();

    // Initialize database with graceful fallback (kept for compatibility)
    const dbStatus = await initializeDatabase();
    logger.info('DATABASE', `Initialization complete: ${dbStatus}`);

    // Initialize service manager for proper dependency injection
    try {
      const { serviceManager } = await import('./services/serviceManager');
      await serviceManager.initializeAll();
      logger.info('SERVICE_MANAGER', '✅ All services initialized successfully');
    } catch (error) {
      logger.error('SERVICE_MANAGER', 'Failed to initialize services:', error);
      // Continue anyway - services will be initialized on demand
    }

    // Ensure all required directories exist (kept for compatibility)
    const { pathConfig } = await import('./config/paths');
    await pathConfig.ensureDirectoriesExist();
    logger.info('FILESYSTEM', '✅ All required directories initialized');
    
    // Initialize mock farms after database is ready
    // Commented out - no longer needed, farms should be created by users
    // const { farmManager } = await import('./services/unified/farmService');
    // await farmManager.initializeMockFarms();
    
    // Initialize API key sync service
    try {
      const { apiKeySyncService } = await import('./services/apiKeySync');
      await apiKeySyncService.initialize();
      logger.info('SERVICES', '✅ API key sync service initialized');
    } catch (error) {
      logger.warn('SERVICES', 'API key sync service failed to initialize (non-critical):', error);
    }
    
    // Initialize agent cleanup service before WebSocket server
    // Skip cleanup service - it can cause hangs with orphaned sessions
    logger.info('SERVICES', 'Agent cleanup service skipped (can cause startup hangs)');
    
    // Initialize farm lifecycle manager for comprehensive session tracking
    try {
      const { farmLifecycleManager } = await import('./services/farmLifecycleManager.js');
      // The manager is already initialized as a singleton, just start cleanup task
      await farmLifecycleManager.cleanupOrphanedFarms();
      logger.info('SERVICES', '✅ Farm lifecycle manager initialized');
    } catch (error) {
      logger.warn('SERVICES', 'Farm lifecycle manager failed to initialize (non-critical):', error);
    }
    
    // Initialize Tmux Health Monitor for session crash detection
    try {
      const { tmuxHealthMonitor } = await import('./services/tmuxHealthMonitor');
      await tmuxHealthMonitor.startMonitoring();
      logger.info('SERVICES', '✅ Tmux health monitor started - monitoring active farms every 30s');
    } catch (error) {
      logger.warn('SERVICES', 'Tmux health monitor failed to start (non-critical):', error);
    }

    // Initialize Farm Recovery Service for automatic orphaned farm recovery
    try {
      const { farmRecoveryService } = await import('./services/farmRecoveryService');
      // Service auto-starts background monitoring on getInstance()
      logger.info('SERVICES', '✅ Farm recovery service started - monitoring for stuck/orphaned farms every 2 minutes');
    } catch (error) {
      logger.warn('SERVICES', 'Farm recovery service failed to start (non-critical):', error);
    }

    // Initialize Automated Farm Recovery System (integrates with state machine)
    try {
      const { automatedFarmRecovery } = await import('./services/AutomatedFarmRecovery');
      automatedFarmRecovery.startMonitoring();
      logger.info('SERVICES', '✅ Automated farm recovery started - state-machine-integrated recovery every 2 minutes');
    } catch (error) {
      logger.warn('SERVICES', 'Automated farm recovery failed to start (non-critical):', error);
    }

    // Initialize Orphaned Session Recovery Service for tmux/DB desync fixes
    try {
      const { orphanedSessionRecoveryService } = await import('./services/OrphanedSessionRecoveryService');
      // Service auto-starts scanning on getInstance(), scans every 2 minutes
      logger.info('SERVICES', '✅ Orphaned session recovery service started - detecting orphaned tmux sessions every 2 minutes');
    } catch (error) {
      logger.warn('SERVICES', 'Orphaned session recovery service failed to start (non-critical):', error);
    }
    
    // Initialize WebSocket server
    wsServer = new WebSocketServer(httpServer);
    (global as any).wsServer = wsServer; // Make available globally for health checks
    app.locals.wsServer = wsServer; // Also make available via app.locals
    logger.info('WEBSOCKET', '✅ WebSocket server initialized');

    // Initialize UnifiedWebSocketManager with the existing Socket.io server
    const { unifiedWebSocketManager } = await import('./websocket/UnifiedWebSocketManager');
    unifiedWebSocketManager.initializeServer(wsServer.io);
    logger.info('WEBSOCKET', '✅ UnifiedWebSocketManager initialized with Socket.io server');

    // Initialize websocketHub without creating a new server - it will use the existing one
    await websocketHub.initialize({ httpServer });
    // Pass the existing Socket.io server to websocketHub for broadcasting
    websocketHub.setSocketServer(wsServer.io);
    logger.info('WEBSOCKET', '✅ Unified WebSocket hub configured');

    // Connect to Python orchestrator WebSocket for real-time agent updates
    try {
      const { pythonWebSocketBridge } = await import('./services/pythonWebSocketBridge');
      pythonWebSocketBridge.connect();
      logger.info('WEBSOCKET', '✅ Python WebSocket bridge connecting to orchestrator');
    } catch (error) {
      logger.warn('WEBSOCKET', 'Python WebSocket bridge failed to connect (non-critical):', error);
    }

    // Initialize terminal output watcher with WebSocket server
    try {
      const { terminalService } = await import('./services/unified/terminalService');
      if (terminalService) {
        // Terminal service is a singleton that's already initialized
        // It will use the WebSocket server from the websocketHub when emitting events
        logger.info('SERVICES', '✅ Terminal output watcher initialized');
      } else {
        logger.warn('SERVICES', 'Terminal output watcher not available or not properly initialized');
      }
    } catch (error) {
      logger.error('SERVICES', 'Failed to initialize terminal output watcher:', error);
    }

    // Initialize terminal stream coordinator for robust streaming
    try {
      // Unified terminal stream service is a singleton that's already initialized
      const { unifiedTerminalStreamService } = await import('./services/UnifiedTerminalStreamService.js');
      if (unifiedTerminalStreamService) {
        logger.info('SERVICES', '✅ Unified terminal stream coordinator initialized');
        // The service will use websocket for broadcasting via the websocketHub
      } else {
        logger.warn('SERVICES', 'Unified terminal stream coordinator not available or not properly initialized');
      }
    } catch (error) {
      logger.error('SERVICES', 'Failed to initialize terminal stream coordinator:', error);
    }

    // Initialize DirectTerminalBroadcaster for immediate output streaming
    try {
      const { directTerminalBroadcaster } = await import('./services/DirectTerminalBroadcaster');
      logger.info('SERVICES', '🚀 DirectTerminalBroadcaster initialized - IMMEDIATE streaming ready');
    } catch (error) {
      logger.error('SERVICES', 'Failed to initialize DirectTerminalBroadcaster:', error);
    }

    // Initialize DirectTerminalStreamer for simple, working terminal streaming
    try {
      const { directTerminalStreamer } = await import('./services/DirectTerminalStreamer');
      logger.info('SERVICES', '🚀 DirectTerminalStreamer initialized - DIRECT terminal streaming');

      // Manually trigger auto-discovery after a delay
      setTimeout(async () => {
        try {
          await directTerminalStreamer.autoDiscoverSessions();
          logger.info('SERVICES', '✅ DirectTerminalStreamer auto-discovery completed');
        } catch (err) {
          logger.error('SERVICES', 'Failed to auto-discover sessions:', err);
        }
      }, 5000); // Wait 5 seconds for server to fully initialize
    } catch (error) {
      logger.error('SERVICES', 'Failed to initialize DirectTerminalStreamer:', error);
    }
    
    // Initialize harvest recovery and zombie cleanup services for automatic recovery
    const { harvestRecoveryService } = await import('./services/harvestRecoveryService');
    const { zombieFarmCleanupService } = await import('./services/zombieFarmCleanup');
    logger.info('SERVICES', '✅ Harvest recovery and zombie cleanup services initialized');

    // Initialize memory manager for production stability
    const { memoryManager } = await import('./services/memoryManager');
    memoryManager.startMonitoring(30000); // Monitor every 30 seconds
    logger.info('SERVICES', '✅ Memory management service started');

    // Initialize session cleanup service for orphaned tmux sessions
    const { sessionCleanupService } = await import('./services/sessionCleanupService');
    sessionCleanupService.startMonitoring(30 * 60 * 1000); // Cleanup every 30 minutes
    logger.info('SERVICES', '✅ Session cleanup service initialized');

    // Initialize background cleanup service for performance optimization
    const { backgroundCleanupService } = await import('./services/backgroundCleanupService');
    backgroundCleanupService.start();
    logger.info('SERVICES', '✅ Background cleanup service started (5min intervals)');

    // Initialize XenoSync performance optimizer
    const { xenoSyncPerformanceOptimizer } = await import('./services/xenosyncPerformanceOptimizer');
    xenoSyncPerformanceOptimizer.startMonitoring();
    logger.info('SERVICES', '✅ XenoSync performance optimizer started');

    // Initialize Automated Context Management Service
    try {
      const { automatedContextManagementService } = await import('./services/AutomatedContextManagementService');
      await automatedContextManagementService.start();
      logger.info('SERVICES', '✅ Automated context management service started - monitoring context windows');
    } catch (error) {
      logger.warn('SERVICES', 'Automated context management service failed to start (non-critical):', error);
    }

    // Initialize tmux connection pool for efficient command execution
    const { tmuxConnectionPool } = await import('./services/tmuxConnectionPool');
    logger.info('SERVICES', '✅ Tmux connection pool initialized');
    
    // Enhancement services disabled - was causing excessive provider degradation warnings
    // const { enhancementIntegration } = await import('./services/enhancementIntegration');
    // await enhancementIntegration.initialize();
    // logger.info('SERVICES', '✅ Enhancement services initialized');
    
    // Set up WebSocketManager
    const { WebSocketManager } = await import('./websocket/websocketManager');
    WebSocketManager.setServer(wsServer);
    
    
    // Start orchestrator
    await orchestrator.start();
    logger.info('ORCHESTRATOR', '✅ Task orchestrator started');
    
    // Start metrics collector
    // TEMPORARILY BYPASS metrics collector during simplified startup
    // Note: metricsCollector is a simple object without start method
    // It collects metrics passively through its exported functions
    
    
    // Initialize Farm-Harvest integration
    try {
      const { farmHarvestIntegration } = await import('./services/unified/farmService');
      if (farmHarvestIntegration && typeof farmHarvestIntegration.initialize === 'function') {
        farmHarvestIntegration.initialize();
        logger.info('SERVICES', '✅ Farm-Harvest integration initialized');
      } else {
        logger.warn('SERVICES', 'Farm-Harvest integration not available or no initialize method');
      }
    } catch (error) {
      logger.error('SERVICES', 'Failed to initialize Farm-Harvest integration:', error);
    }
    
    
    
    // Initialize Analytics WebSocket handler
    const { AnalyticsWebSocketHandler } = await import('./websocket/analyticsHandler');
    const analyticsHandler = new AnalyticsWebSocketHandler(wsServer.io);
    logger.info('WEBSOCKET', '✅ Analytics handler initialized');

    // Initialize Thermal Monitoring Service and WebSocket handlers
    try {
      const { thermalMonitoringService } = await import('./services/ThermalMonitoringService');
      await thermalMonitoringService.initialize();
      logger.info('SERVICES', '✅ Thermal monitoring service initialized');

      // Initialize thermal WebSocket handlers
      const { initializeThermalHandlers } = await import('./websocket/thermalHandlers');
      initializeThermalHandlers(wsServer.io);
      logger.info('WEBSOCKET', '✅ Thermal WebSocket handlers initialized');
    } catch (error) {
      logger.warn('SERVICES', 'Thermal monitoring service failed to start (non-critical):', error);
    }
    
    // Note: metricsCollector doesn't emit events
    // Metrics are pulled via getCurrentMetrics() when needed
    
    // Start HTTP server with error handling
    httpServer.on('error', (error: any) => {
      console.error('HTTP Server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please stop other processes or use a different port.`);
      }
    });
    
    // Display enhanced startup logo and instructions
    const displayStartupBanner = () => {
      const green = '\x1b[32m';
      const yellow = '\x1b[33m';
      const cyan = '\x1b[36m';
      const bold = '\x1b[1m';
      const reset = '\x1b[0m';
      const frontendPort = process.env.VITE_PORT || '3000';

      console.log('\n');
      console.log(green + bold + '╔═══════════════════════════════════════════════════════════════════════════╗' + reset);
      console.log(green + bold + '║                                                                           ' + reset + yellow + '░' + reset);
      console.log(green + bold + '║  ' + reset + cyan + '███╗   ███╗ █████╗ ██╗███████╗ █████╗ ██████╗ ███╗   ███╗' + reset + '                ' + yellow + '░░' + reset);
      console.log(green + bold + '║  ' + reset + cyan + '████╗ ████║██╔══██╗██║██╔════╝██╔══██╗██╔══██╗████╗ ████║' + reset + '                ' + yellow + '░░░' + reset);
      console.log(green + bold + '║  ' + reset + cyan + '██╔████╔██║███████║██║█████╗  ███████║██████╔╝██╔████╔██║' + reset + '                ' + yellow + '░░░░' + reset);
      console.log(green + bold + '║  ' + reset + cyan + '██║╚██╔╝██║██╔══██║██║██╔══╝  ██╔══██║██╔══██╗██║╚██╔╝██║' + reset + '                ' + green + '▓▓▓▓▓🚜' + reset);
      console.log(green + bold + '║  ' + reset + cyan + '██║ ╚═╝ ██║██║  ██║██║██║     ██║  ██║██║  ██║██║ ╚═╝ ██║' + reset + '                ' + green + '▓▓▓▓' + reset);
      console.log(green + bold + '║  ' + reset + cyan + '╚═╝     ╚═╝╚═╝  ╚═╝╚═╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝' + reset + '                ' + green + '▓▓▓' + reset);
      console.log(green + bold + '║                                                                           ' + reset + green + '▓▓' + reset);
      console.log(green + bold + '║  ' + reset + yellow + '🌾  Multi-Agent Intelligence Farm - AI Orchestration Platform' + reset + '            ' + green + '▓' + reset);
      console.log(green + bold + '║                                                                           ║' + reset);
      console.log(green + bold + '╚═══════════════════════════════════════════════════════════════════════════╝' + reset);
      console.log('');
      console.log(bold + '  🚀  Quick Start Commands:' + reset);
      console.log('');
      console.log(cyan + '     Dashboard:' + reset + '         http://localhost:' + frontendPort);
      console.log(cyan + '     API Health:' + reset + '        curl http://localhost:' + PORT + '/api/health');
      console.log(cyan + '     List Farms:' + reset + '        curl http://localhost:' + PORT + '/api/farms');
      console.log('');
      console.log(bold + '  📖  API Endpoints:' + reset);
      console.log('');
      console.log(green + '     POST' + reset + '   /api/farms' + yellow + '                    ' + reset + '→ Create new farm');
      console.log(green + '     POST' + reset + '   /api/farms/:id/launch' + yellow + '         ' + reset + '→ Launch farm agents');
      console.log(green + '     POST' + reset + '   /api/farms/:id/recover' + yellow + '        ' + reset + '→ Recover stuck farm');
      console.log(green + '     GET' + reset + '    /api/farms/:id/health' + yellow + '         ' + reset + '→ Check farm health');
      console.log(green + '     GET' + reset + '    /api/harvests' + yellow + '                 ' + reset + '→ View farm outputs');
      console.log('');
      console.log(bold + '  🌱  Farm URLs:' + reset);
      console.log('');
      console.log('     All farm operations now return a ' + green + 'farmUrl' + reset + ' for easy access!');
      console.log('     Example: ' + cyan + 'http://localhost:' + frontendPort + '/farm/{farmId}' + reset);
      console.log('');
      console.log(bold + '  🖥️   MaiFarm CLI:' + reset);
      console.log('');
      console.log(cyan + '     farm' + reset + '              → Open web dashboard');
      console.log(cyan + '     farm cli' + reset + '          → Command-line interface');
      console.log('');
      console.log(bold + '  📋  Common CLI Commands:' + reset);
      console.log('');
      console.log(green + '     farm create' + reset + ' <name>     → Create new farm');
      console.log(green + '     farm list' + reset + '              → List all farms');
      console.log(green + '     farm watch' + reset + ' <id>        → Watch farm progress');
      console.log(green + '     farm harvest' + reset + ' <id>      → Harvest results');
      console.log(green + '     farm quick' + reset + ' "task"      → 5-minute sprint');
      console.log(green + '     farm wild' + reset + ' "goal"       → Autonomous mode');
      console.log('');
      console.log('     For complete CLI help: ' + cyan + 'farm help' + reset);
      console.log('');
      console.log(bold + '  📚  Documentation:' + reset + '    See CLAUDE.md for complete guide');
      console.log('');
      console.log(green + '═══════════════════════════════════════════════════════════════════════════' + reset);
      console.log('');
    };

    // Banner will be displayed after all initialization completes
    logger.info('SERVER', `About to call httpServer.listen on port ${PORT}...`);
    httpServer.listen(PORT, '0.0.0.0', async () => {
      logger.info('SERVER', `🌱 MaiFarm server running at http://localhost:${PORT}`);
      logger.info('SERVER', `Environment: ${process.env.NODE_ENV || 'development'}`);
      
      // Test the server is actually listening with a slight delay to ensure services are ready
      setTimeout(() => {
        import('http').then(({ default: http }) => {
          const options = {
            hostname: 'localhost',
            port: PORT,
            path: '/health',
            headers: {
              'x-startup-check': 'true'
            }
          };
          const testReq = http.get(options, (res: any) => {
            let data = '';
            res.on('data', (chunk: any) => {
              data += chunk;
            });
            res.on('end', () => {
              try {
                const healthData = JSON.parse(data);
                const status = healthData.data?.status || healthData.status || 'unknown';
                const services = healthData.data?.services || [];

                // Log startup health check result (different from the endpoint's own log)
                logger.info('SERVER', 'Startup health check completed', {
                  status,
                  services: services.map((s: any) => ({
                    name: s.name,
                    status: s.status
                  }))
                });

                // Log any specific issues
                const unhealthyServices = services.filter((s: any) => s.status === 'unhealthy' || s.status === 'degraded');
                if (unhealthyServices.length > 0) {
                  logger.warn('HEALTH', `Some services are not fully healthy: ${unhealthyServices.map((s: any) => `${s.name}(${s.status})`).join(', ')}`);
                }
              } catch (error) {
                logger.info('HEALTH', `✅ Server health check successful: ${res.statusCode}`);
              }
            });
          });
          testReq.on('error', (err: any) => {
            console.error('✗ Server health check failed:', err.message);
          });
        });
      }, 1000); // Wait 1 second for services to initialize
      
      // Start background tasks
      try {
        watchCoordinationDirectory();
        await updateActiveAgents();
        logger.info(LogCategory.COORD, '✅ Coordination directory monitoring enabled');
      } catch (error) {
        logger.warn(LogCategory.COORD, 'Failed to initialize coordination monitoring:', error);
      }
      
      // Initialize harvest session broadcaster for real-time updates
      const { harvestSessionBroadcaster } = await import('./services/harvestSessionBroadcaster');
      if (harvestSessionBroadcaster && typeof harvestSessionBroadcaster.initialize === 'function') {
        harvestSessionBroadcaster.initialize();
        logger.info('SERVICES', '✅ Harvest session broadcaster initialized');
      } else {
        logger.warn('SERVICES', 'Harvest session broadcaster not available or no initialize method');
      }
      
      // Initialize memory manager for production stability
      const { memoryManager } = await import('./utils/memoryManager');
      memoryManager.startMonitoring(60000); // Monitor every minute
      
      // Register cleanup handlers for terminal services
      memoryManager.registerCleanupHandler('terminal_stream_cleanup', async () => {
        const { terminalStreamService } = await import('./services/unified/terminalService');
        // Clear old broadcast hashes
        const sessions = (terminalStreamService as any).sessions;
        if (sessions && sessions.size > 20) {
          logger.info('MEMORY', 'Cleaning up old terminal sessions');
          const sessionArray = Array.from(sessions.entries());
          const oldSessions = sessionArray.slice(0, sessionArray.length - 20);
          for (const [sessionName] of oldSessions) {
            await terminalStreamService.stopStreaming(sessionName);
          }
        }
      }, 30);
      
      logger.info('SERVICES', '✅ Memory manager initialized and monitoring');

      // Display startup banner AFTER all initialization is complete
      // Delay to ensure all async log messages have been written
      // DirectTerminalStreamer auto-discovery completes at 5s, so wait 6s
      setTimeout(() => {
        displayStartupBanner();
      }, 6000); // 6 second delay after all services initialized

    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Use the centralized graceful shutdown handler
gracefulShutdown(httpServer);

// Additional cleanup for our specific services
const serviceShutdown = async (signal: string) => {
  logger.warn('SERVER', `⚠️ ${signal} received, shutting down services...`);
  
  // Clean up all active agents and sessions
  try {
    const { agentCleanupService } = await import('./services/agentCleanupService');
    logger.info('CLEANUP', 'Performing agent cleanup...');
    // Check if the method exists before calling it
    if (typeof agentCleanupService.cleanupOrphanedSessions === 'function') {
      const result = await agentCleanupService.cleanupOrphanedSessions({
        force: true,
        keepActiveFarms: false,
        dryRun: false
      });
      logger.info('CLEANUP', `Cleaned up ${result.sessionsKilled.length} sessions during shutdown`);
    } else if (typeof agentCleanupService.cleanup === 'function') {
      // Try alternative cleanup method
      await agentCleanupService.cleanup();
      logger.info('CLEANUP', 'Agent cleanup completed');
    } else {
      logger.debug('CLEANUP', 'No cleanup method available');
    }
  } catch (error) {
    logger.error('CLEANUP', 'Error during shutdown cleanup:', error);
  }
  
  // Stop orchestrator
  try {
    await orchestrator.stop();
    logger.info('ORCHESTRATOR', 'Orchestrator stopped');
  } catch (error) {
    logger.error('ORCHESTRATOR', 'Error stopping orchestrator:', error);
  }
  
  // Stop harvest session broadcaster
  try {
    const { harvestSessionBroadcaster } = await import('./services/harvestSessionBroadcaster');
    harvestSessionBroadcaster.shutdown();
    logger.info('SERVICES', 'Harvest session broadcaster stopped');
  } catch (error) {
    logger.error('SERVICES', 'Error stopping harvest session broadcaster:', error);
  }
  
  // Stop metrics collector
  try {
    if (typeof metricsCollector?.stop === 'function') {
      metricsCollector.stop();
      logger.info('METRICS', 'Metrics collector stopped');
    } else if (typeof metricsCollector?.shutdown === 'function') {
      await metricsCollector.shutdown();
      logger.info('METRICS', 'Metrics collector shutdown');
    } else {
      logger.debug('METRICS', 'Metrics collector has no stop/shutdown method');
    }
  } catch (error) {
    logger.error('METRICS', 'Error stopping metrics collector:', error);
  }
  
  // Stop background cleanup service
  try {
    const { backgroundCleanupService } = await import('./services/backgroundCleanupService');
    backgroundCleanupService.stop();
    logger.info('CLEANUP', 'Background cleanup service stopped');
  } catch (error) {
    logger.error('CLEANUP', 'Error stopping background cleanup service:', error);
  }
  
  // Stop session cache
  try {
    const { sessionCache } = await import('./services/unified/terminalService');
    if (sessionCache && typeof sessionCache.stop === 'function') {
      sessionCache.stop();
      logger.info('CACHE', 'Session cache stopped');
    } else if (sessionCache && typeof sessionCache.shutdown === 'function') {
      await sessionCache.shutdown();
      logger.info('CACHE', 'Session cache shutdown');
    } else {
      logger.debug('CACHE', 'Session cache has no stop/shutdown method');
    }
  } catch (error) {
    logger.error('CACHE', 'Error stopping session cache:', error);
  }
  
  // Stop agent health monitor
  try {
    const { agentHealthMonitor } = await import('./services/unified/farmService');
    if (agentHealthMonitor && typeof agentHealthMonitor.shutdown === 'function') {
      agentHealthMonitor.shutdown();
      logger.info('HEALTH', 'Agent health monitor stopped');
    } else if (agentHealthMonitor && typeof agentHealthMonitor.stop === 'function') {
      await agentHealthMonitor.stop();
      logger.info('HEALTH', 'Agent health monitor stopped');
    } else {
      logger.debug('HEALTH', 'Agent health monitor has no shutdown/stop method');
    }
  } catch (error) {
    logger.error('HEALTH', 'Error stopping agent health monitor:', error);
  }
  
  // Stop terminal stream service
  try {
    const { terminalStreamService } = await import('./services/unified/terminalService');
    if (terminalStreamService) {
      // Check if sessions property exists
      if (terminalStreamService['sessions'] instanceof Map) {
        const sessions = Array.from(terminalStreamService['sessions'].keys());
        for (const session of sessions) {
          if (typeof terminalStreamService.stopStreaming === 'function') {
            await terminalStreamService.stopStreaming(session);
          }
        }
      } else if (typeof terminalStreamService.shutdown === 'function') {
        await terminalStreamService.shutdown();
      } else if (typeof terminalStreamService.stop === 'function') {
        await terminalStreamService.stop();
      }
      logger.info('TERMINAL', 'Terminal stream service stopped');
    } else {
      logger.debug('TERMINAL', 'Terminal stream service not available');
    }
  } catch (error) {
    logger.error('TERMINAL', 'Error stopping terminal stream service:', error);
  }
  
  // Stop thermal monitoring service
  try {
    const { thermalMonitoringService } = await import('./services/ThermalMonitoringService');
    await thermalMonitoringService.shutdown();
    logger.info('THERMAL', 'Thermal monitoring service stopped');
  } catch (error) {
    logger.error('THERMAL', 'Error stopping thermal monitoring service:', error);
  }

  // FIX: Stop analytics interval to prevent zombie intervals
  try {
    const { stopAnalyticsInterval } = await import('./websocket/analyticsHandlers');
    stopAnalyticsInterval();
    logger.info('ANALYTICS', 'Analytics interval stopped');
  } catch (error) {
    logger.error('ANALYTICS', 'Error stopping analytics interval:', error);
  }

  // Stop automated context management service
  try {
    const { automatedContextManagementService } = await import('./services/AutomatedContextManagementService');
    automatedContextManagementService.stop();
    logger.info('CONTEXT', 'Automated context management service stopped');
  } catch (error) {
    logger.error('CONTEXT', 'Error stopping automated context management service:', error);
  }

  // Close database connections
  try {
    await closeDatabaseConnections();
    logger.info('DATABASE', 'Database connections closed');
  } catch (error) {
    logger.error('DATABASE', 'Error closing database connections:', error);
  }
};

// Override process handlers to include our cleanup
process.removeAllListeners('SIGTERM');
process.removeAllListeners('SIGINT');

process.on('SIGTERM', async () => {
  await serviceShutdown('SIGTERM');
  process.exit(0);
});

process.on('SIGINT', async () => {
  await serviceShutdown('SIGINT');
  process.exit(0);
});

// Start the server
startServer();

export default app;
export { app };// Trigger restart
