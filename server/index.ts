import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { watchFile } from 'fs';
import { spawn } from 'child_process';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

// Import centralized configuration
import { config, logConfiguration, validateConfiguration } from './config/index';

// Skip validation for now - fixing import issues
// TODO: Re-enable validation after fixing all import issues
console.log('[INFO] Starting server in development mode...');

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
import workflowRouter from './api/workflow';
import testFarmsRouter from './api/test-farms';
import healthRouter from './api/health';
import yamlRouter from './api/yaml';
import { analyticsRouter } from './api/analytics';
import multiClaudeRouter from './api/multiClaude';
import providersRouter from './api/providers';
import costTrackingRouter from './api/costTracking';
import ollamaRouter from './api/ollama';
import farmersRouter from './api/farmers';
import coordinationRouter from './api/coordination';
import terminalRouter from './routes/terminal';
import websocketHealthRouter from './api/websocket-health';
import apiKeysRouter from './api/apikeys';
import clientRouter from './api/client';

// Import middleware
import { apiRateLimits } from './middleware/rateLimit';
import { monitoringMiddleware } from './middleware/monitoring';
import { corsMiddleware, corsErrorHandler } from './middleware/cors';
import { sanitizeAll } from './middleware/sanitizer';
import { aiProxyMiddleware, proxyLoggingMiddleware } from './middleware/aiProxy';

// Import database and WebSocket
import { initializeDatabase, checkDatabaseHealth, closeDatabaseConnections } from './database/connection';
import WebSocketServer from './websocket/socketServer';
import { orchestrator } from './orchestrator';
import { metricsCollector } from './services/metricsCollector';

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
app.use(morgan('combined'));

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
      console.log('Coordination directory not found, creating it...');
      await fs.mkdir(COORDINATION_DIR, { recursive: true });
      await fs.writeFile(ACTIVE_AGENTS_FILE, '[]');
    }
    
    // Use watchFile instead of fs.watch to avoid hanging
    watchFile(ACTIVE_AGENTS_FILE, { interval: 1000 }, async (curr, prev) => {
      if (curr.mtime !== prev.mtime) {
        await updateActiveAgents();
      }
    });
    
    console.log('Watching coordination directory:', COORDINATION_DIR);
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
      console.log('Active agents file not found, using empty array');
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

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbHealth = await checkDatabaseHealth();
  const status = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      api: 'healthy',
      postgres: dbHealth.postgres ? 'healthy' : 'degraded',
      redis: dbHealth.redis ? 'healthy' : 'degraded',
      websocket: wsServer ? 'healthy' : 'not initialized'
    }
  };
  
  const httpStatus = dbHealth.postgres && dbHealth.redis ? 200 : 503;
  res.status(httpStatus).json(status);
});

// API Routes
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/farms', farmsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/monitoring', monitoringRouter);
app.use('/api/harvests', harvestsRouter);
app.use('/api/go-wild', goWildRouter);
app.use('/api/seeds', seedsRouter);
app.use('/api/harvest', harvestRouter);
app.use('/api/barn', barnRouter);
app.use('/api/farmers', farmersRouter);
app.use('/api/coordination', coordinationRouter);
app.use('/api/workflow', workflowRouter);
app.use('/api/yaml', yamlRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/multi-claude', multiClaudeRouter);
app.use('/api/providers', providersRouter);
app.use('/api/cost-tracking', costTrackingRouter);
app.use('/api/ollama', ollamaRouter);
app.use('/api/terminal', terminalRouter);
app.use('/api/websocket', websocketHealthRouter);
app.use('/api', apiKeysRouter);
app.use('/api/client', clientRouter);

// Qwen setup and configuration
import qwenSetupRouter from './api/qwenSetup';
app.use('/api/qwen', qwenSetupRouter);

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

// Error handling middleware
app.use(corsErrorHandler);
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred'
    }
  });
});

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
    // Initialize database with graceful fallback
    const dbStatus = await initializeDatabase();
    console.log('Database initialization complete:', dbStatus);
    
    // Initialize mock farms after database is ready
    // Commented out - no longer needed, farms should be created by users
    // const { farmManager } = await import('./services/farmManager');
    // await farmManager.initializeMockFarms();
    
    // Initialize agent cleanup service before WebSocket server
    const { agentCleanupService } = await import('./services/agentCleanupService');
    await agentCleanupService.initialize();
    console.log('Agent cleanup service initialized');
    
    // Initialize WebSocket server
    wsServer = new WebSocketServer(httpServer);
    (global as any).wsServer = wsServer; // Make available globally for health checks
    app.locals.wsServer = wsServer; // Also make available via app.locals
    console.log('WebSocket server initialized');
    
    // Initialize terminal output watcher with WebSocket server
    const { terminalOutputWatcher } = await import('./services/terminalOutputWatcher');
    terminalOutputWatcher.setWebSocketServer(wsServer.io);
    console.log('Terminal output watcher initialized');
    
    // Set up WebSocketManager
    const { WebSocketManager } = await import('./websocket/websocketManager');
    WebSocketManager.setServer(wsServer);
    
    
    // Start orchestrator
    await orchestrator.start();
    console.log('Task orchestrator started');
    
    // Start metrics collector
    metricsCollector.start(5000); // Update every 5 seconds
    console.log('Metrics collector started');
    
    
    
    // Initialize Farm-Harvest integration
    const { farmHarvestIntegration } = await import('./services/farmHarvestIntegration');
    farmHarvestIntegration.initialize();
    console.log('Farm-Harvest integration initialized');
    
    
    
    // Initialize Analytics WebSocket handler
    const { AnalyticsWebSocketHandler } = await import('./websocket/analyticsHandler');
    const analyticsHandler = new AnalyticsWebSocketHandler(wsServer.io);
    console.log('Analytics WebSocket handler initialized');
    
    // Forward metrics updates to WebSocket clients
    metricsCollector.on('metrics:update', (data) => {
      if (wsServer && data.type === 'dashboard') {
        wsServer.broadcast('metrics:update', {
          dashboard: data.data
        });
      }
    });
    
    // Start HTTP server with error handling
    httpServer.on('error', (error: any) => {
      console.error('HTTP Server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please stop other processes or use a different port.`);
      }
    });
    
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`MaiFarm server running on http://0.0.0.0:${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Server should be accessible at: http://localhost:${PORT}`);
      
      // Test the server is actually listening
      import('http').then(({ default: http }) => {
        const testReq = http.get(`http://localhost:${PORT}/health`, (res: any) => {
          console.log(`✓ Server health check successful: ${res.statusCode}`);
        });
        testReq.on('error', (err: any) => {
          console.error('✗ Server health check failed:', err.message);
        });
      });
      
      // Start background tasks
      watchCoordinationDirectory();
      updateActiveAgents();
      
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down gracefully...`);
  
  // Stop accepting new connections
  httpServer.close(() => {
    console.log('HTTP server closed');
  });
  
  // Clean up all active agents and sessions
  try {
    const { agentCleanupService } = await import('./services/agentCleanupService');
    console.log('Performing agent cleanup...');
    const result = await agentCleanupService.cleanupOrphanedSessions({
      force: true,
      keepActiveFarms: false,
      dryRun: false
    });
    console.log(`Cleaned up ${result.sessionsKilled.length} sessions during shutdown`);
  } catch (error) {
    console.error('Error during shutdown cleanup:', error);
  }
  
  // Stop orchestrator
  await orchestrator.stop();
  console.log('Orchestrator stopped');
  
  // Stop metrics collector
  metricsCollector.stop();
  console.log('Metrics collector stopped');
  
  // Close database connections
  await closeDatabaseConnections();
  
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the server
startServer();

export default app;