import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { MaiBarn } from '../services/maibarn';
import { harvestService } from '../services/harvestService';
// harvestFileCollector is part of harvestService now - create alias for compatibility
const harvestFileCollector = harvestService;
import { logger } from '../utils/logger';
import { HarvestFilter, HarvestExport } from '../../src/types/harvest';
import { coordinationService } from '../services/coordinationService';
// Create terminalOutputWatcher stub
const terminalOutputWatcher = {
  isWatching: () => false,
  startWatching: async () => {},
  watch: async (sessionName: string) => {},
  stopWatching: (sessionName: string) => {}
};
import { harvestSessionCache } from '../services/harvestSessionCache';
import { requestDeduplicator } from '../middleware/requestDeduplication';
import { db } from '../database/connection';

const router = Router();

// Get all harvests
router.get('/', async (req, res) => {
  try {
    const filter: HarvestFilter = {
      farmId: req.query.farmId as string,
      status: req.query.status ? (req.query.status as string).split(',') as any : undefined,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      qualityThreshold: req.query.qualityThreshold ? parseInt(req.query.qualityThreshold as string) : undefined,
      searchQuery: req.query.search as string
    };

    // Parse date range if provided
    if (req.query.startDate || req.query.endDate) {
      filter.dateRange = {
        start: req.query.startDate ? new Date(req.query.startDate as string) : new Date(0),
        end: req.query.endDate ? new Date(req.query.endDate as string) : new Date()
      };
    }

    const harvests = await harvestService.findAll(filter);
    res.json(harvests);
  } catch (error) {
    logger.error('Failed to get harvests:', error);
    res.status(500).json({ error: 'Failed to retrieve harvests' });
  }
});

// Get harvest summaries
router.get('/summaries', async (req, res) => {
  try {
    const summaries = await harvestService.getSummaries();
    res.json(summaries);
  } catch (error) {
    logger.error('Failed to get harvest summaries:', error);
    res.status(500).json({ error: 'Failed to retrieve harvest summaries' });
  }
});

// Manual trigger to create harvest from farm
router.post('/trigger/:farmId', async (req, res) => {
  try {
    const { farmId } = req.params;
    const userId = req.body.userId || 'system';
    
    logger.info(`Manual harvest trigger requested for farm ${farmId}`);
    
    // Import the integration service
    const { farmHarvestIntegration } = await import('../services/unified/farmService');
    
    // Manually trigger harvest creation
    const result = await farmHarvestIntegration.manualCreateHarvest(farmId, userId);
    
    res.json({
      success: true,
      message: `Harvest triggered for farm ${farmId}`,
      ...result
    });
  } catch (error) {
    logger.error('Failed to trigger harvest:', error);
    res.status(500).json({ 
      error: 'Failed to trigger harvest',
      message: error.message 
    });
  }
});

// Get harvests by farm ID with proper error handling
router.get('/farms/:farmId', requestDeduplicator.createMiddleware('harvest-farm'), async (req, res) => {
  try {
    const { farmId } = req.params;
    
    // Return empty array for invalid farm IDs
    if (!farmId || farmId === 'undefined' || farmId === 'null') {
      return res.json({ 
        success: true, 
        data: [],
        message: 'No farm ID provided'
      });
    }
    
    // Try to get harvests with timeout protection
    let harvests: any[] = [];
    const TIMEOUT_MS = 15000; // Increased from 5s to 15s to prevent premature timeouts

    try {
      // Create a timeout promise that resolves (not rejects) to avoid unhandled rejection
      const timeoutPromise = new Promise<any[]>((resolve) =>
        setTimeout(() => {
          logger.warn(`Harvest fetch timed out for farm ${farmId}`);
          resolve([]);  // Resolve with empty array instead of rejecting
        }, TIMEOUT_MS)
      );

      const harvestsPromise = harvestService.findByFarmId(farmId).catch(error => {
        logger.error(`Failed to fetch harvests for farm ${farmId}:`, error);
        return [];  // Return empty array on error
      });

      // Race between the actual fetch and timeout
      harvests = await Promise.race([harvestsPromise, timeoutPromise]);
    } catch (error) {
      logger.error(`Unexpected error fetching harvests for farm ${farmId}:`, error);
      harvests = [];
    }

    res.json({
      success: true,
      data: harvests
    });
  } catch (error) {
    logger.error('Failed to get harvests for farm:', error);
    // Return empty array instead of error to prevent UI breaking
    res.json({ 
      success: false,
      data: [],
      error: 'Failed to retrieve harvests for farm',
      message: error.message
    });
  }
});

// Get harvest by ID with proper error handling
router.get('/:id', requestDeduplicator.createMiddleware('harvest-id'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Handle invalid IDs
    if (!id || id === 'undefined' || id === 'null') {
      return res.status(404).json({ 
        success: false,
        data: null,
        error: { message: 'Invalid harvest ID', code: 'INVALID_ID' }
      });
    }
    
    // Try to get harvest with timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout')), 5000)
    );
    
    const harvestPromise = harvestService.findById(id);
    
    try {
      const harvest = await Promise.race([harvestPromise, timeoutPromise]) as any;
      
      if (!harvest) {
        return res.status(404).json({ 
          success: false,
          data: null,
          error: { message: 'Harvest not found', code: 'NOT_FOUND' }
        });
      }
      
      res.json({ 
        success: true, 
        data: harvest 
      });
    } catch (timeoutError) {
      logger.warn(`Harvest fetch timed out for ID ${id}`);
      return res.status(408).json({ 
        success: false,
        data: null,
        error: { message: 'Request timeout', code: 'TIMEOUT' }
      });
    }
  } catch (error) {
    logger.error('Failed to get harvest:', error);
    // Return proper error response without crashing
    res.status(500).json({ 
      success: false,
      data: null,
      error: { 
        message: 'Failed to retrieve harvest', 
        code: 'INTERNAL_ERROR',
        details: error.message
      }
    });
  }
});

// Start harvest for a farm
router.post('/farms/:farmId/harvest', async (req, res) => {
  try {
    const { farmId } = req.params;
    const { farmName } = req.body;

    if (!farmName) {
      return res.status(400).json({ error: 'Farm name is required' });
    }

    const harvest = await harvestService.startHarvest(farmId, farmName);
    res.status(201).json(harvest);
  } catch (error) {
    logger.error('Failed to start harvest:', error);
    res.status(500).json({ error: 'Failed to start harvest' });
  }
});

// Export harvest
router.post('/:id/export', async (req, res) => {
  try {
    const exportConfig: HarvestExport = {
      harvestId: req.params.id,
      format: req.body.format || 'json',
      includeResults: req.body.includeResults !== false,
      includeInsights: req.body.includeInsights !== false,
      includeYield: req.body.includeYield !== false,
      customTemplate: req.body.customTemplate
    };

    const exportData = await harvestService.exportHarvest(exportConfig);
    
    // Set appropriate content type
    let contentType = 'application/json';
    let filename = `harvest-${req.params.id}`;
    
    switch (exportConfig.format) {
      case 'markdown':
        contentType = 'text/markdown';
        filename += '.md';
        break;
      case 'pdf':
        contentType = 'application/pdf';
        filename += '.pdf';
        break;
      case 'csv':
        contentType = 'text/csv';
        filename += '.csv';
        break;
      default:
        filename += '.json';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(exportData);
  } catch (error) {
    logger.error('Failed to export harvest:', error);
    if ((error as Error).message === 'Harvest not found') {
      res.status(404).json({ error: 'Harvest not found' });
    } else if ((error as Error).message === 'Unsupported export format') {
      res.status(400).json({ error: 'Unsupported export format' });
    } else {
      res.status(500).json({ error: 'Failed to export harvest' });
    }
  }
});

// Complete harvest manually (for testing)
router.post('/:id/complete', async (req, res) => {
  try {
    const harvest = await harvestService.completeHarvest(req.params.id);
    
    // Automatically store completed harvest in barn
    try {
      const { barnService } = await import('../services/unified/farmService');
      const barnItem = await barnService.storeHarvest(harvest.id, {
        name: `${harvest.farmName} - ${new Date().toLocaleDateString()}`,
        description: harvest.summary.description || 'Completed harvest',
        type: 'harvest',
        category: 'completed',
        tags: [...(harvest.tags || []), 'auto-stored']
      });
      logger.info(`Harvest ${harvest.id} automatically stored in barn as ${barnItem.id}`);
    } catch (barnError) {
      logger.error('Failed to store harvest in barn:', barnError);
      // Don't fail the request if barn storage fails
    }
    
    res.json(harvest);
  } catch (error) {
    logger.error('Failed to complete harvest:', error);
    if ((error as Error).message === 'Harvest not found') {
      res.status(404).json({ error: 'Harvest not found' });
    } else {
      res.status(500).json({ error: 'Failed to complete harvest' });
    }
  }
});

// Get terminal output for a harvest's Claude agents (Optimized with Caching)
router.get('/terminal/sessions', 
  requestDeduplicator.createMiddleware('harvest:sessions', { 
    ttl: 2000, // 2 second cache for high-frequency polling
    skipCache: (req) => req.query.showAll === 'true' // Don't cache admin requests
  }),
  requestDeduplicator.createEarlyReturnMiddleware('harvest:sessions:not-found'),
  async (req, res) => {
  try {
    const { farmId, showAll } = req.query;
    const startTime = Date.now();
    
    // Reduce logging verbosity - only log when necessary
    if (farmId) {
      logger.debug(`[Harvest API] Getting sessions for farm: ${farmId}`);
    }
    
    let sessionDetails: any[] = [];
    
    if (farmId && typeof farmId === 'string') {
      // Use optimized farm-specific lookup with cache
      let cachedSessions = [];
      try {
        cachedSessions = await harvestSessionCache.getSessionsForFarm(farmId);
      } catch (cacheError) {
        logger.warn('[Harvest API] Cache lookup failed:', cacheError.message);
        cachedSessions = [];
      }
      
      if (cachedSessions.length > 0) {
        // Convert cached sessions to expected format
        sessionDetails = cachedSessions.map(session => ({
          sessionName: session.sessionName,
          farmId: session.farmId || farmId,
          paneCount: session.paneCount,
          createdAt: session.createdAt,
          windowName: 'agents',
          active: session.status === 'active',
          age: Date.now() - session.createdAt.getTime(),
          ageMinutes: (Date.now() - session.createdAt.getTime()) / (1000 * 60)
        }));
        
        logger.debug(`[Harvest API] Found ${sessionDetails.length} cached sessions for farm ${farmId}`);
      } else {
        // No cached sessions found, implement retry logic with grace period
        const possibleSessionName = `farm-${farmId.substring(0, 8)}`;
        const maxRetries = 3;
        const retryDelay = 2000; // 2 seconds between retries
        let sessionFound = false;
        
        // Try multiple times to find the session (it might be launching)
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          let exists = false;
          try {
            exists = await harvestSessionCache.sessionExists(possibleSessionName);
          } catch (existsError) {
            logger.debug(`[Harvest API] Error checking session existence: ${existsError.message}`);
            exists = false;
          }
          
          if (exists) {
            sessionFound = true;
            // Refresh cache if session exists but wasn't cached
            try {
              const refreshedSessions = await harvestSessionCache.getAllSessions(true);
              const farmSessions = refreshedSessions.filter(s => 
                s.farmId === farmId || s.sessionName.includes(farmId.substring(0, 8))
              );
            
              sessionDetails = farmSessions.map(session => ({
                sessionName: session.sessionName,
                farmId: session.farmId || farmId,
                paneCount: session.paneCount,
                createdAt: session.createdAt,
                windowName: 'agents',
                active: session.status === 'active',
                age: Date.now() - session.createdAt.getTime(),
                ageMinutes: (Date.now() - session.createdAt.getTime()) / (1000 * 60)
              }));
            } catch (refreshError) {
              logger.warn(`[Harvest API] Failed to refresh cache: ${refreshError.message}`);
              sessionDetails = [];
            }
            break;
          }
          
          if (attempt < maxRetries) {
            logger.debug(`[Harvest API] Session not found for farm ${farmId}, retrying in ${retryDelay}ms (attempt ${attempt}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
        
        if (!sessionFound) {
          // Check if farm was recently created (within 10 seconds) - if so, return placeholder
          try {
            // Check if database is connected before querying
            if (db && db.query && typeof db.query === 'function') {
              const farmResult = await db.query(
                'SELECT created_at FROM farms WHERE id = $1',
                [farmId]
              );
              
              if (farmResult && farmResult.rows && farmResult.rows.length > 0) {
                const createdAt = new Date(farmResult.rows[0].created_at);
                const ageMs = Date.now() - createdAt.getTime();
                
                if (ageMs < 10000) { // Less than 10 seconds old
                  logger.debug(`[Harvest API] Farm ${farmId} is new (${ageMs}ms old), returning placeholder session`);
                  return res.json({
                    success: true,
                    data: [{
                      sessionName: possibleSessionName,
                      farmId: farmId,
                      paneCount: 0,
                      createdAt: createdAt,
                      windowName: 'agents',
                      active: false,
                      age: ageMs,
                      ageMinutes: ageMs / (1000 * 60),
                      status: 'launching'
                    }],
                    message: 'Session is launching, please wait...'
                  });
                }
              }
            } else {
              logger.debug('[Harvest API] Database not available, skipping recent farm check');
            }
          } catch (dbError) {
            logger.warn('[Harvest API] Database query failed (non-critical):', dbError.message);
            // Continue without database check - not critical for operation
          }
          
          logger.debug(`[Harvest API] No sessions found for farm ${farmId} after ${maxRetries} attempts`);
          return res.json({
            success: true,
            data: [],
            message: 'No active sessions found for this farm'
          });
        }
      }
    } else {
      // Get all sessions using cache
      let allSessions = [];
      try {
        allSessions = await harvestSessionCache.getAllSessions();
      } catch (cacheError) {
        logger.warn('[Harvest API] Failed to get all sessions from cache:', cacheError.message);
        allSessions = [];
      }
      
      // Filter relevant sessions if not showing all
      const relevantSessions = showAll === 'true' ? allSessions : 
        allSessions.filter(session => 
          session.sessionName.startsWith('farm-') || 
          session.sessionName.startsWith('quick-') || 
          session.sessionName.startsWith('gowild-')
        );
      
      sessionDetails = relevantSessions.map(session => ({
        sessionName: session.sessionName,
        farmId: session.farmId,
        paneCount: session.paneCount,
        createdAt: session.createdAt,
        windowName: 'agents',
        active: session.status === 'active',
        age: Date.now() - session.createdAt.getTime(),
        ageMinutes: (Date.now() - session.createdAt.getTime()) / (1000 * 60)
      }));
    }
    
    // Sort by creation time, most recent first
    sessionDetails.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return timeB - timeA;
    });
    
    // Start watching sessions for live updates (only if not already watching)
    for (const session of sessionDetails) {
      // Add null/undefined checks for session properties
      if (session && session.sessionName && terminalOutputWatcher) {
        try {
          if (!terminalOutputWatcher.isWatching(session.sessionName)) {
            terminalOutputWatcher.startWatching(
              session.sessionName,
              session.farmId || '',
              session.paneCount || 0
            ).catch(err => {
              logger.debug(`Failed to start watching session ${session.sessionName}:`, err.message);
            });
          }
        } catch (watchError) {
          logger.debug(`Error checking watch status for session ${session.sessionName}:`, watchError.message);
        }
      }
    }
    
    const responseTime = Date.now() - startTime;
    
    // Only log performance if it's slow or if there are results
    if (responseTime > 100 || sessionDetails.length > 0) {
      logger.debug(`[Harvest API] Session lookup completed in ${responseTime}ms, found ${sessionDetails.length} sessions`);
    }
    
    res.json({
      success: true,
      data: sessionDetails,
      cached: true,
      responseTime
    });
  } catch (error) {
    logger.error('[Harvest API] Error getting terminal sessions:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get terminal sessions',
      details: error.message
    });
  }
});

// Get pane titles for a terminal session
router.get('/terminal/panes',
  requestDeduplicator.createMiddleware('harvest:panes', { ttl: 5000 }),
  async (req, res) => {
  try {
    const { sessionId } = req.query;
    
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'sessionId query parameter is required'
      });
    }
    
    logger.debug(`[Harvest API] Getting pane titles for session: ${sessionId}`);
    
    // Check if session exists
    const checkSession = spawn('tmux', ['has-session', '-t', sessionId]);
    const sessionExists = await new Promise<boolean>(resolve => {
      checkSession.on('exit', (code) => resolve(code === 0));
    });
    
    if (!sessionExists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    // Get pane titles using tmux display-message
    const getPaneTitles = spawn('tmux', [
      'list-panes',
      '-t', `${sessionId}:agents`,
      '-F', '#{pane_index}:#{pane_title}'
    ]);
    
    let output = '';
    let errorOutput = '';
    
    getPaneTitles.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });
    
    getPaneTitles.stderr?.on('data', (data: Buffer) => {
      errorOutput += data.toString();
    });
    
    const exitCode = await new Promise<number>(resolve => {
      getPaneTitles.on('exit', (code) => resolve(code || 0));
    });
    
    if (exitCode !== 0) {
      console.error(`[Harvest API] Failed to get pane titles: ${errorOutput}`);
      return res.json({
        success: true,
        data: [] // Return empty array if we can't get pane titles
      });
    }
    
    // Parse pane titles
    const panes = output.trim().split('\n').filter(Boolean).map(line => {
      const [index, title] = line.split(':', 2);
      const paneTitle = title && title.trim() ? title : `Agent ${parseInt(index, 10)}`;
      return {
        id: parseInt(index, 10),
        title: paneTitle
      };
    });
    
    if (panes.length > 0) {
      logger.debug(`[Harvest API] Found ${panes.length} panes for session ${sessionId}`);
    }
    
    res.json({
      success: true,
      data: panes
    });
  } catch (error) {
    logger.error('Error getting pane titles:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get pane titles'
    });
  }
});

// Get terminal output for a specific agent
router.get('/terminal/:sessionName/:agentId',
  requestDeduplicator.createMiddleware('harvest:terminal', { ttl: 1000 }), // 1 second cache
  async (req, res) => {
  try {
    const { sessionName, agentId } = req.params;
    const { lines = 500 } = req.query; // Increased default to capture more of the launch process
    
    logger.debug(`[Harvest API] Getting terminal output for ${sessionName} agent ${agentId}`);
    
    // Start watching this session if not already watching
    if (!terminalOutputWatcher.isWatching(sessionName)) {
      // Try to determine pane count
      const countProcess = spawn('tmux', ['list-panes', '-t', sessionName, '-F', '#{pane_index}']);
      let paneOutput = '';
      countProcess.stdout?.on('data', (data) => { paneOutput += data.toString(); });
      
      await new Promise(resolve => {
        countProcess.on('exit', () => {
          const paneCount = paneOutput.trim().split('\n').filter(Boolean).length || 5;
          terminalOutputWatcher.startWatching(
            sessionName,
            undefined, // farmId not available here
            paneCount
          ).catch(err => {
            logger.error(`Failed to start watching session ${sessionName}:`, err);
          });
          resolve(null);
        });
        
        // Timeout fallback
        setTimeout(() => resolve(null), 1000);
      });
    }
    
    // Get terminal output using MaiBarn
    let lines_array: string[];
    
    try {
      const outputData = await MaiBarn.getAgentOutput(
        sessionName, 
        parseInt(agentId), 
        Number(lines) || 500
      );
      lines_array = outputData.lines;
    } catch (error) {
      logger.debug(`[Harvest API] Failed to capture pane for ${sessionName}:0.${agentId}: ${error.message}`);
      return res.status(404).json({
        success: false,
        error: 'Terminal session not found',
        details: error.message
      });
    }
    
    // Look for Claude welcome message or agent role
    let agentRole = null;
    let agentStatus = 'active';
    
    for (const line of lines_array) {
      if (line.includes('Agent Role:')) {
        agentRole = line.split('Agent Role:')[1]?.trim();
      }
      if (line.includes('Welcome to Claude Code')) {
        agentStatus = 'ready';
      }
    }
    
    const agentInfo = {
      id: agentId,
      sessionName,
      status: agentStatus,
      role: agentRole
    };
    
    res.json({
      success: true,
      data: {
        agent: agentInfo,
        terminal: lines_array,
        timestamp: new Date()
      }
    });
  } catch (error) {
    logger.error('Error getting terminal output:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get terminal output'
    });
  }
});

// Send command to a specific agent terminal
router.post('/terminal/:sessionName/:agentId/command', async (req, res) => {
  try {
    const { sessionName, agentId } = req.params;
    const { command } = req.body;
    
    if (!command) {
      return res.status(400).json({
        success: false,
        error: 'Command is required'
      });
    }
    
    // Send command using MaiBarn
    const success = await MaiBarn.sendCommand(
      sessionName, 
      parseInt(agentId), 
      command
    );
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Failed to send command to terminal'
      });
    }
    
    // Get WebSocket server and broadcast if available
    const wsServer = req.app.get('wsServer');
    if (wsServer) {
      wsServer.broadcast('harvest:terminal:command', {
        sessionName,
        agentId,
        command,
        timestamp: new Date()
      });
    }
    
    res.json({
      success: true,
      message: 'Command sent successfully',
      data: {
        sessionName,
        agentId,
        command
      }
    });
  } catch (error) {
    logger.error('Error sending command:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send command'
    });
  }
});

// ===== Coordination API Endpoints =====

// Get active agents from coordination service
router.get('/coordination/agents', async (req, res) => {
  try {
    const { farmId } = req.query;
    const agents = await coordinationService.getActiveAgents(
      typeof farmId === 'string' ? farmId : undefined
    );
    res.json({
      success: true,
      data: agents,
      count: agents.length
    });
  } catch (error) {
    logger.error('Failed to get coordination agents:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to retrieve coordination agents' 
    });
  }
});

// Get work claims from coordination service
router.get('/coordination/claims', async (req, res) => {
  try {
    const claims = coordinationService.getWorkClaims();
    res.json({
      success: true,
      data: claims,
      count: claims.length
    });
  } catch (error) {
    logger.error('Failed to get work claims:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to retrieve work claims' 
    });
  }
});

// Get completed work from coordination
router.get('/coordination/completed', async (req, res) => {
  try {
    const completed = await coordinationService.collectCompletedWork();
    res.json({
      success: true,
      data: completed,
      count: completed.length
    });
  } catch (error) {
    logger.error('Failed to get completed work:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to retrieve completed work' 
    });
  }
});

// Create harvest report from coordination data
router.post('/coordination/harvest', async (req, res) => {
  try {
    const { farmId, results } = req.body;
    
    if (!farmId) {
      return res.status(400).json({ 
        success: false,
        error: 'Farm ID is required' 
      });
    }
    
    const report = await coordinationService.createHarvestReport(
      farmId,
      results || []
    );
    
    res.status(201).json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Failed to create harvest report:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create harvest report' 
    });
  }
});

// Get harvest reports from coordination
router.get('/coordination/reports', async (req, res) => {
  try {
    const { farmId } = req.query;
    const reports = await coordinationService.getHarvestReports(farmId as string);
    
    res.json({
      success: true,
      data: reports,
      count: reports.length
    });
  } catch (error) {
    logger.error('Failed to get harvest reports:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to retrieve harvest reports' 
    });
  }
});

// Update agent status
router.put('/coordination/agents/:agentId/status', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { status, metrics } = req.body;
    
    if (!status) {
      return res.status(400).json({ 
        success: false,
        error: 'Status is required' 
      });
    }
    
    await coordinationService.updateAgentStatus(agentId, status, metrics);
    
    res.json({
      success: true,
      message: 'Agent status updated'
    });
  } catch (error) {
    logger.error('Failed to update agent status:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update agent status' 
    });
  }
});

// Get file tree for a harvest
router.get('/:id/files', async (req, res) => {
  try {
    const { id } = req.params;
    const fileTree = await harvestService.getHarvestFileTree(id);
    
    if (!fileTree) {
      return res.status(404).json({ error: 'File tree not found for this harvest' });
    }
    
    res.json(fileTree);
  } catch (error) {
    logger.error('Failed to get harvest file tree:', error);
    res.status(500).json({ error: 'Failed to retrieve file tree' });
  }
});

// Download a specific file from harvest
router.get('/:id/files/download', async (req, res) => {
  try {
    const { id } = req.params;
    const { path: filePath } = req.query;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    const fileContent = await harvestService.getHarvestFileContent(id, filePath as string);
    
    if (!fileContent) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Get filename from path
    const filename = path.basename(filePath as string);
    
    // Set appropriate headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(fileContent);
  } catch (error) {
    logger.error('Failed to download harvest file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Get specific file content (for preview)
router.get('/:id/files/content', async (req, res) => {
  try {
    const { id } = req.params;
    const { path: filePath } = req.query;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    const fileContent = await harvestService.getHarvestFileContent(id, filePath as string);
    
    if (!fileContent) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Determine content type based on file extension
    const ext = path.extname(filePath as string).toLowerCase();
    let contentType = 'text/plain';
    
    if (['.json'].includes(ext)) contentType = 'application/json';
    else if (['.js', '.jsx'].includes(ext)) contentType = 'application/javascript';
    else if (['.ts', '.tsx'].includes(ext)) contentType = 'application/typescript';
    else if (['.html'].includes(ext)) contentType = 'text/html';
    else if (['.css'].includes(ext)) contentType = 'text/css';
    else if (['.md'].includes(ext)) contentType = 'text/markdown';
    else if (['.yaml', '.yml'].includes(ext)) contentType = 'text/yaml';
    else if (['.png'].includes(ext)) contentType = 'image/png';
    else if (['.jpg', '.jpeg'].includes(ext)) contentType = 'image/jpeg';
    else if (['.gif'].includes(ext)) contentType = 'image/gif';
    else if (['.svg'].includes(ext)) contentType = 'image/svg+xml';
    
    res.setHeader('Content-Type', contentType);
    res.send(fileContent);
  } catch (error) {
    logger.error('Failed to get harvest file content:', error);
    res.status(500).json({ error: 'Failed to retrieve file content' });
  }
});

// Get logs for specific agent
router.get('/:id/logs/:agentId', async (req, res) => {
  try {
    const { id, agentId } = req.params;
    const logPath = path.join(process.cwd(), 'harvests', id, 'logs', `${agentId}.log`);
    
    const fileContent = await harvestFileCollector.getFileContent(logPath);
    
    if (!fileContent) {
      return res.status(404).json({ error: 'Log file not found' });
    }
    
    res.setHeader('Content-Type', 'text/plain');
    res.send(fileContent);
  } catch (error) {
    logger.error('Failed to get agent log:', error);
    res.status(500).json({ error: 'Failed to retrieve agent log' });
  }
});

// Download entire harvest as archive (placeholder for now)
router.get('/:id/archive', async (req, res) => {
  try {
    const { id } = req.params;
    
    // TODO: Implement archive creation (zip file)
    // For now, return a message
    res.status(501).json({ 
      error: 'Archive download not yet implemented',
      message: 'This feature will be available soon'
    });
  } catch (error) {
    logger.error('Failed to create harvest archive:', error);
    res.status(500).json({ error: 'Failed to create archive' });
  }
});

// Cleanup stale terminal sessions manually
router.post('/terminal/cleanup', async (req, res) => {
  try {
    const { includeAll } = req.body;
    logger.info('[Harvest API] Manual cleanup requested');
    await MaiBarn.cleanupStaleSessions(includeAll);
    
    res.json({
      success: true,
      message: 'Terminal session cleanup completed'
    });
  } catch (error) {
    logger.error('Failed to cleanup terminal sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup terminal sessions'
    });
  }
});

// Recover lost terminal session for a farm
router.post('/terminal/recover/:farmId', async (req, res) => {
  try {
    const { farmId } = req.params;
    logger.info(`[Harvest API] Session recovery requested for farm ${farmId}`);
    
    // Import orchestrator service
    const { orchestratorService } = await import('../services/unified/farmService');
    
    // Attempt to recover the session
    const recovered = await orchestratorService.recoverLostSession(farmId);
    
    if (recovered) {
      logger.info(`[Harvest API] Successfully recovered session for farm ${farmId}`);
      
      // Get the new session details
      const sessionName = `farm-${farmId.substring(0, 8)}`;
      const sessionDetails = await MaiBarn.getSessionDetails([{ 
        sessionName, 
        name: sessionName,
        createdTime: Date.now(),
        age: 0,
        ageMinutes: 0
      }]);
      
      res.json({
        success: true,
        message: 'Session recovered successfully',
        data: sessionDetails[0] || { sessionName, farmId }
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Failed to recover session - farm may not be active'
      });
    }
  } catch (error) {
    logger.error('Failed to recover terminal session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to recover terminal session'
    });
  }
});

// Get yield item preview
router.get('/:harvestId/yield/:yieldId/preview', async (req, res) => {
  try {
    const { harvestId, yieldId } = req.params;
    
    const harvest = await harvestService.findById(harvestId);
    if (!harvest) {
      return res.status(404).json({ 
        success: false,
        error: 'Harvest not found' 
      });
    }
    
    const yieldItem = harvest.yield.find(y => y.id === yieldId);
    if (!yieldItem) {
      return res.status(404).json({ 
        success: false,
        error: 'Yield item not found' 
      });
    }
    
    // For now, return the yield item data directly
    // TODO: Read actual file content from workspace if available
    let content = '';
    if (yieldItem.data) {
      if (typeof yieldItem.data === 'string') {
        content = yieldItem.data;
      } else {
        content = JSON.stringify(yieldItem.data, null, 2);
      }
    }
    
    res.json({
      success: true,
      data: {
        content,
        mimeType: yieldItem.mimeType || 'text/plain',
        name: yieldItem.name,
        size: yieldItem.size
      }
    });
  } catch (error) {
    logger.error('Failed to get yield preview:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get yield preview' 
    });
  }
});

// Download yield item
router.get('/:harvestId/yield/:yieldId/download', async (req, res) => {
  try {
    const { harvestId, yieldId } = req.params;
    
    const harvest = await harvestService.findById(harvestId);
    if (!harvest) {
      return res.status(404).json({ 
        success: false,
        error: 'Harvest not found' 
      });
    }
    
    const yieldItem = harvest.yield.find(y => y.id === yieldId);
    if (!yieldItem) {
      return res.status(404).json({ 
        success: false,
        error: 'Yield item not found' 
      });
    }
    
    // For now, serve the data directly
    // TODO: Read actual file content from workspace if available
    let content = '';
    if (yieldItem.data) {
      if (typeof yieldItem.data === 'string') {
        content = yieldItem.data;
      } else {
        content = JSON.stringify(yieldItem.data, null, 2);
      }
    }
    
    res.setHeader('Content-Type', yieldItem.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${yieldItem.name}"`);
    res.send(content);
  } catch (error) {
    logger.error('Failed to download yield item:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to download yield item' 
    });
  }
});

// Verify harvest directory integrity
router.get('/:id/verify-directory', async (req, res) => {
  try {
    const { id } = req.params;
    
    const harvest = await harvestService.findById(id);
    if (!harvest) {
      return res.status(404).json({ 
        success: false,
        error: 'Harvest not found' 
      });
    }
    
    const integrity = await harvestFileCollector.verifyHarvestDirectoryIntegrity(id);
    
    res.json({
      success: true,
      harvestId: id,
      integrity: {
        isValid: integrity.isValid,
        missingDirectories: integrity.missingDirs,
        errors: integrity.errors,
        path: integrity.path
      },
      metadata: harvest.metadata
    });
  } catch (error) {
    logger.error('Failed to verify harvest directory:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to verify harvest directory structure' 
    });
  }
});

// Repair harvest directory structure
router.post('/:id/repair-directory', async (req, res) => {
  try {
    const { id } = req.params;
    
    const harvest = await harvestService.findById(id);
    if (!harvest) {
      return res.status(404).json({ 
        success: false,
        error: 'Harvest not found' 
      });
    }
    
    const repair = await harvestFileCollector.repairHarvestDirectory(id);
    
    res.json({
      success: true,
      harvestId: id,
      repair: {
        repaired: repair.repaired,
        actions: repair.actions,
        errors: repair.errors
      }
    });
  } catch (error) {
    logger.error('Failed to repair harvest directory:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to repair harvest directory structure' 
    });
  }
});

// Initialize harvest directory (manual trigger for testing)
router.post('/:id/initialize-directory', async (req, res) => {
  try {
    const { id } = req.params;
    
    const harvest = await harvestService.findById(id);
    if (!harvest) {
      return res.status(404).json({ 
        success: false,
        error: 'Harvest not found' 
      });
    }
    
    const harvestPath = await harvestFileCollector.initializeHarvestDirectory(id);
    const integrity = await harvestFileCollector.verifyHarvestDirectoryIntegrity(id);
    
    res.json({
      success: true,
      harvestId: id,
      path: harvestPath,
      integrity: {
        isValid: integrity.isValid,
        missingDirectories: integrity.missingDirs,
        errors: integrity.errors
      }
    });
  } catch (error) {
    logger.error('Failed to initialize harvest directory:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to initialize harvest directory' 
    });
  }
});

export default router;
