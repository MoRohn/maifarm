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
import { config, logConfiguration, validateConfiguration } from './config/index';
import { logger } from './config/logging';

// Skip validation for now - fixing import issues
// TODO: Re-enable validation after fixing all import issues
logger.info('SERVER', '🚀 Starting server in development mode...');

// Import API routes
import authRouter from './api/auth';
import usersRouter from './api/users';
import agentsRouter from './api/agents';
import farmsRouter from './api/farms';
import tasksRouter from './api/tasks';
import metricsRouter from './api/metrics';
import monitoringRouter from './api/monitoring';
import harvestsRouter from './api/harvests';
import goWildRouter from './routes/goWild';
import seedsRouter from './api/seeds';
import harvestRouter from './api/harvest';
import barnRouter from './api/barn';
import barnCollectionRouter from './api/barnCollection';
import maibarnRouter from './api/maibarn';
import workflowRouter from './api/workflow';
import testFarmsRouter from './api/test-farms';
import healthRouter from './api/health';
import yamlRouter from './api/yaml';
import { analyticsRouter } from './api/analytics';
import orchestratorRouter from './api/orchestrator';
import providersRouter from './api/providers';
import costTrackingRouter from './api/costTracking';
import ollamaRouter from './api/ollama';
import openaiRouter from './api/openai';
import farmersRouter from './api/farmers';
import coordinationRouter from './api/coordination';
import terminalRouter from './routes/terminal';
import terminalTestRouter from './api/terminalTest';
import websocketHealthRouter from './api/websocket-health';
import xenosyncRouter from './routes/xenosync';
import apiKeysRouter from './api/apikeys';
import clientRouter from './api/client';
import adminRouter from './api/admin';
import settingsRouter from './api/settings';
import chatRouter from './api/chat';
// import enhancementsRouter from './routes/enhancements'; // Disabled - enhancement service removed

// Import middleware
import { apiRateLimits } from './middleware/rateLimit';
import { monitoringMiddleware } from './middleware/monitoring';
import { corsMiddleware, corsErrorHandler } from './middleware/cors';
import { sanitizeAll } from './middleware/sanitizer';
import { aiProxyMiddleware, proxyLoggingMiddleware } from './middleware/aiProxy';

// Import database and WebSocket
import { initializeDatabase, checkDatabaseHealth, closeDatabaseConnections } from './database/connection';
import WebSocketServer from './websocket/socketServer';
import { websocketHub } from './services/unified/websocketHub';
import { orchestrator } from './orchestrator';
import { metricsCollector } from './monitoring/metricsCollector';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);

// Initialize WebSocket server
let wsServer: WebSocketServer;

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

// Replace morgan with our enhanced logger
app.use((req, res, next) => {
  const start = Date.now();
  
  // Capture the original end function
  const originalEnd = res.end;
  
  res.end = function(...args: any[]) {
    // Calculate duration
    const duration = Date.now() - start;
    
    // Log the request using our enhanced logger
    logger.httpRequest(req.method, req.path, res.statusCode, duration);
    
    // Call the original end function
    originalEnd.apply(res, args);
  };
  
  next();
});

// AI Provider proxy middleware
app.use(aiProxyMiddleware);
app.use(proxyLoggingMiddleware);

// Input sanitization middleware
app.use(sanitizeAll);

// Monitoring middleware
app.use(monitoringMiddleware.request);
app.use(monitoringMiddleware.performance(1000)); // 1 second threshold
app.use(monitoringMiddleware.resource);


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
    
    logger.info('COORD', `Watching coordination directory: ${COORDINATION_DIR}`);
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

// Import health check routers
import healthCheckRouter from './api/healthCheck';
import healthzRouter from './api/healthz';

// Health check endpoints - use only one health check router to avoid duplicates
app.use('/health', healthCheckRouter);
app.use('/healthz', healthzRouter);

// NEW: Unified Gateway API (v2) - DISABLED (incomplete implementation)
// import gatewayRouter from './gateway/index.js';
// app.use('/api/v2/gateway', gatewayRouter);

// API Routes (Legacy - maintained for backward compatibility)
// Note: /api/health removed to avoid duplicate with /health endpoint
// app.use('/api/health', healthRouter); // Disabled - using healthCheckRouter at /health instead
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/farms', farmsRouter);
app.use('/api/tasks', tasksRouter);

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
    const { title, description, priority, timeout, metadata, mode, provider } = req.body;

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
    
    const userId = (req as any).user?.userId || 'default-user';
    const result = await quickTaskService.createQuickTask({
      title: taskTitle,
      description: taskDescription,
      priority: priority || (mode === 'fast' ? 'high' : 'medium'),
      timeout,
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
app.use('/api/coordination', coordinationRouter);
app.use('/api/workflow', workflowRouter);
app.use('/api/yaml', yamlRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/orchestrator', orchestratorRouter);
app.use('/api/providers', providersRouter);
app.use('/api/cost-tracking', costTrackingRouter);
app.use('/api/ollama', ollamaRouter);
app.use('/api/openai', openaiRouter);
app.use('/api/terminal', terminalRouter);
app.use('/api/terminal-test', terminalTestRouter);
app.use('/api/websocket', websocketHealthRouter);
app.use('/api/xenosync', xenosyncRouter);
app.use('/api', apiKeysRouter);
app.use('/api/client', clientRouter);
app.use('/api/admin', adminRouter);
// app.use('/api/enhancements', enhancementsRouter); // Disabled - enhancement service removed
app.use('/api/settings', settingsRouter);
app.use('/api/chat', chatRouter);



// Test routes for development
if (process.env.NODE_ENV === 'development') {
  app.use('/api/test-farms', testFarmsRouter);
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

// Error handling middleware (must be last)
app.use(corsErrorHandler);
app.use(notFoundHandler);
app.use(errorHandler);

// 404 handler for API routes - MUST come before static file handler
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found'
    }
  });
});

// Serve static files - MUST come after API routes
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
} else {
  // In development, Vite serves the frontend on port 3000
  // The backend only handles API and WebSocket requests
  // If someone accesses the backend directly, redirect to Vite dev server
  app.get('/', (req, res) => {
    res.redirect('http://localhost:3000');
  });
  
  // Serve static files from public directory for any assets
  app.use('/public', express.static(path.join(__dirname, '../public')));
}

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
    // TEMPORARILY SIMPLIFIED STARTUP - bypassing complex initialization that's hanging
    logger.info('SERVER', '⚡ Using simplified startup to bypass initialization issues');

    // Skip ServiceRegistry and initializationManager for now
    // TODO: Fix initialization hang and re-enable full startup sequence

    // // Initialize Service Registry for dependency injection
    // const { serviceRegistry } = await import('./services/ServiceRegistry');
    // await serviceRegistry.configure({
    //   redis: {
    //     host: process.env.REDIS_HOST || 'localhost',
    //     port: parseInt(process.env.REDIS_PORT || '6379'),
    //     password: process.env.REDIS_PASSWORD
    //   },
    //   database: {
    //     connectionString: process.env.DATABASE_URL
    //   },
    //   ai: {
    //     defaultProvider: process.env.AI_PROVIDER || 'claude',
    //     apiKeys: {
    //       claude: process.env.CLAUDE_API_KEY || '',
    //       openai: process.env.OPENAI_API_KEY || ''
    //     }
    //   },
    //   monitoring: {
    //     enabled: process.env.MONITORING_ENABLED === 'true',
    //     interval: 30000
    //   }
    // });

    // await serviceRegistry.initialize();
    // logger.info('SERVICE_REGISTRY', '✅ Service Registry initialized with dependency injection');

    // // Initialize all services in proper order
    // const { initializationManager } = await import('./services/initializationManager');
    // const initResults = await initializationManager.initializeServices();

    // // Log initialization summary
    // const failed = initResults.filter(r => !r.success);
    // if (failed.length > 0) {
    //   logger.warn('INIT', `⚠️  Some services failed to initialize: ${failed.map(f => f.service).join(', ')}`);
    // }
    
    // Initialize database with graceful fallback (kept for compatibility)
    const dbStatus = await initializeDatabase();
    logger.info('DATABASE', `Initialization complete: ${dbStatus}`);
    
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
    
    // Initialize WebSocket server
    wsServer = new WebSocketServer(httpServer);
    (global as any).wsServer = wsServer; // Make available globally for health checks
    app.locals.wsServer = wsServer; // Also make available via app.locals
    logger.info('WEBSOCKET', '✅ WebSocket server initialized');

    // Initialize websocketHub without creating a new server - it will use the existing one
    await websocketHub.initialize({ httpServer });
    // Pass the existing Socket.io server to websocketHub for broadcasting
    websocketHub.setSocketServer(wsServer.io);
    logger.info('WEBSOCKET', '✅ Unified WebSocket hub configured');

    // Initialize terminal output watcher with WebSocket server
    try {
      const { terminalOutputWatcher } = await import('./services/unified/terminalService');
      if (terminalOutputWatcher && typeof terminalOutputWatcher.setWebSocketServer === 'function') {
        terminalOutputWatcher.setWebSocketServer(wsServer.io);
        logger.info('SERVICES', '✅ Terminal output watcher initialized');
      } else {
        logger.warn('SERVICES', 'Terminal output watcher not available or not properly initialized');
      }
    } catch (error) {
      logger.error('SERVICES', 'Failed to initialize terminal output watcher:', error);
    }
    
    // Initialize terminal stream coordinator for robust streaming
    try {
      // Terminal stream service handles socket server directly
      const { terminalStreamService } = await import('./services/terminalStreamService.js');
      if (terminalStreamService && typeof terminalStreamService.setSocketServer === 'function') {
        terminalStreamService.setSocketServer(wsServer.io);
        logger.info('SERVICES', '✅ Terminal stream coordinator initialized');
      } else {
        logger.warn('SERVICES', 'Terminal stream coordinator not available or not properly initialized');
      }
    } catch (error) {
      logger.error('SERVICES', 'Failed to initialize terminal stream coordinator:', error);
    }
    
    // Temporarily disabling services to debug startup issue
    // TODO: Re-enable after fixing startup hang

    // // Initialize terminal streaming fix service for better output capture
    // const { terminalStreamingFix } = await import('./services/terminalStreamingFix');
    // logger.info('SERVICES', '✅ Terminal streaming fix service initialized');

    // // Initialize harvest recovery service for automatic recovery
    // const { harvestRecoveryService } = await import('./services/harvestRecoveryService');
    // const { zombieFarmCleanupService } = await import('./services/zombieFarmCleanup');
    // logger.info('SERVICES', '✅ Harvest recovery service initialized');

    // Initialize memory manager for production stability
    const { memoryManager } = await import('./services/memoryManager');
    memoryManager.startMonitoring(30000); // Monitor every 30 seconds
    logger.info('SERVICES', '✅ Memory management service started');

    // Initialize session cleanup service for orphaned tmux sessions
    const { sessionCleanupService } = await import('./services/sessionCleanupService');
    sessionCleanupService.startMonitoring(30 * 60 * 1000); // Cleanup every 30 minutes
    logger.info('SERVICES', '✅ Session cleanup service initialized');

    // // Initialize background cleanup service for performance optimization
    // const { backgroundCleanupService } = await import('./services/backgroundCleanupService');
    // backgroundCleanupService.start();
    // logger.info('SERVICES', '✅ Background cleanup service started (5min intervals)');

    // // Initialize XenoSync performance optimizer
    // const { xenoSyncPerformanceOptimizer } = await import('./services/xenosyncPerformanceOptimizer');
    // xenoSyncPerformanceOptimizer.startMonitoring();
    // logger.info('SERVICES', '✅ XenoSync performance optimizer started');

    // // Initialize tmux connection pool for efficient command execution
    // const { tmuxConnectionPool } = await import('./services/tmuxConnectionPool');
    // logger.info('SERVICES', '✅ Tmux connection pool initialized');
    
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
    // metricsCollector doesn't have a 'start' method
    if (typeof metricsCollector?.start === 'function') {
      metricsCollector.start(5000); // Update every 5 seconds
      logger.info('METRICS', '✅ Metrics collector started');
    } else {
      logger.warn('METRICS', 'Skipping metrics collector - start method not available');
    }
    
    
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
    
    // Forward metrics updates to WebSocket clients
    // TEMPORARILY BYPASS metricsCollector.on during simplified startup
    if (typeof metricsCollector?.on === 'function') {
      metricsCollector.on('metrics:update', (data) => {
        if (wsServer && data.type === 'dashboard') {
          wsServer.broadcast('metrics:update', {
            dashboard: data.data
          });
        }
      });
    } else {
      logger.warn('METRICS', 'Skipping metrics collector event listener - on method not available');
    }
    
    // Start HTTP server with error handling
    httpServer.on('error', (error: any) => {
      console.error('HTTP Server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please stop other processes or use a different port.`);
      }
    });
    
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
      // Disabled due to missing coordinationService.getActiveAgents() method
      // watchCoordinationDirectory();
      // updateActiveAgents();
      
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
