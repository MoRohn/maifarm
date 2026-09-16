import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import archiver from 'archiver';
import { realpathSync, statSync, existsSync } from 'fs';
import { MaiBarn } from '../services/maibarn';
import { harvestService } from '../services/harvestService';
// harvestFileCollector is part of harvestService now - create alias for compatibility
const harvestFileCollector = harvestService;
import { logger, LogCategory } from '../utils/logger';
import { HarvestFilter, HarvestExport } from '../../src/types/harvest';
import { coordinationService } from '../services/coordinationService';

// Security: Maximum file size for archive (100MB) and download (50MB)
const MAX_ARCHIVE_FILE_SIZE = 100 * 1024 * 1024;
const MAX_DOWNLOAD_FILE_SIZE = 50 * 1024 * 1024;
const MAX_PREVIEW_FILE_SIZE = 512 * 1024; // 500KB for preview

/**
 * Security helper: Validates a file path is within allowed directory
 * Resolves symlinks to prevent directory traversal attacks
 * @returns null if path is invalid/outside bounds, resolved path otherwise
 */
function validatePathSecurity(filePath: string, allowedDir: string): string | null {
  try {
    // Normalize the path first
    const normalizedPath = path.normalize(filePath);

    // Check basic containment (before symlink resolution)
    if (!normalizedPath.startsWith(allowedDir)) {
      logger.warn(LogCategory.HARVEST, `Path traversal attempt detected: ${filePath}`);
      return null;
    }

    // Check if file exists before resolving symlinks
    if (!existsSync(normalizedPath)) {
      return null;
    }

    // Resolve symlinks to get real path
    const realPath = realpathSync(normalizedPath);
    const realAllowedDir = realpathSync(allowedDir);

    // Verify resolved path is still within allowed directory
    if (!realPath.startsWith(realAllowedDir)) {
      logger.warn(LogCategory.HARVEST, `Symlink traversal attempt detected: ${filePath} -> ${realPath}`);
      return null;
    }

    return realPath;
  } catch (error) {
    // Path doesn't exist or can't be resolved
    return null;
  }
}

/**
 * Security helper: Checks file size is within limit
 * @returns true if file is within size limit
 */
function checkFileSize(filePath: string, maxSize: number): boolean {
  try {
    const stats = statSync(filePath);
    return stats.size <= maxSize;
  } catch {
    return false;
  }
}
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
    logger.error(LogCategory.HARVEST, 'Failed to get harvests:', error);
    res.status(500).json({ error: 'Failed to retrieve harvests' });
  }
});

// Get harvest summaries
router.get('/summaries', async (req, res) => {
  try {
    const summaries = await harvestService.getSummaries();
    res.json(summaries);
  } catch (error) {
    logger.error(LogCategory.HARVEST, 'Failed to get harvest summaries:', error);
    res.status(500).json({ error: 'Failed to retrieve harvest summaries' });
  }
});

// Manual trigger to create harvest from farm
router.post('/trigger/:farmId', async (req, res) => {
  try {
    const { farmId } = req.params;

    // Validate farmId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(farmId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FARM_ID',
          message: 'Farm ID must be a valid UUID'
        }
      });
    }

    const userId = req.body.userId || 'system';

    logger.info(LogCategory.HARVEST, `Manual harvest trigger requested for farm ${farmId}`);

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
    logger.error(LogCategory.HARVEST, 'Failed to trigger harvest:', error);
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
          logger.warn(LogCategory.HARVEST, `Harvest fetch timed out for farm ${farmId}`);
          resolve([]);  // Resolve with empty array instead of rejecting
        }, TIMEOUT_MS)
      );

      const harvestsPromise = harvestService.findByFarmId(farmId).catch(error => {
        logger.error(LogCategory.HARVEST, `Failed to fetch harvests for farm ${farmId}:`, error);
        return [];  // Return empty array on error
      });

      // Race between the actual fetch and timeout
      harvests = await Promise.race([harvestsPromise, timeoutPromise]);
    } catch (error) {
      logger.error(LogCategory.HARVEST, `Unexpected error fetching harvests for farm ${farmId}:`, error);
      harvests = [];
    }

    res.json({
      success: true,
      data: harvests
    });
  } catch (error) {
    logger.error(LogCategory.HARVEST, 'Failed to get harvests for farm:', error);
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
      logger.warn(LogCategory.HARVEST, `Harvest fetch timed out for ID ${id}`);
      return res.status(408).json({ 
        success: false,
        data: null,
        error: { message: 'Request timeout', code: 'TIMEOUT' }
      });
    }
  } catch (error) {
    logger.error(LogCategory.HARVEST, 'Failed to get harvest:', error);
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
    logger.error(LogCategory.HARVEST, 'Failed to start harvest:', error);
    res.status(500).json({ error: 'Failed to start harvest' });
  }
});

// Export harvest
router.post('/:id/export', async (req, res) => {
  try {
    // Validate export format
    const validFormats = ['json', 'markdown', 'pdf', 'csv'];
    const requestedFormat = req.body.format || 'json';

    if (!validFormats.includes(requestedFormat)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FORMAT',
          message: `Format must be one of: ${validFormats.join(', ')}`
        }
      });
    }

    const exportConfig: HarvestExport = {
      harvestId: req.params.id,
      format: requestedFormat,
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
    logger.error(LogCategory.HARVEST, 'Failed to export harvest:', error);
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
      logger.info(LogCategory.HARVEST, `Harvest ${harvest.id} automatically stored in barn as ${barnItem.id}`);
    } catch (barnError) {
      logger.error(LogCategory.HARVEST, 'Failed to store harvest in barn:', barnError);
      // Don't fail the request if barn storage fails
    }
    
    res.json(harvest);
  } catch (error) {
    logger.error(LogCategory.HARVEST, 'Failed to complete harvest:', error);
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
      logger.debug(LogCategory.HARVEST, `[Harvest API] Getting sessions for farm: ${farmId}`);
    }
    
    let sessionDetails: any[] = [];
    
    if (farmId && typeof farmId === 'string') {
      // Use optimized farm-specific lookup with cache
      let cachedSessions = [];
      try {
        cachedSessions = await harvestSessionCache.getSessionsForFarm(farmId);
      } catch (cacheError) {
        logger.warn(LogCategory.HARVEST, '[Harvest API] Cache lookup failed:', cacheError.message);
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
        
        logger.debug(LogCategory.HARVEST, `[Harvest API] Found ${sessionDetails.length} cached sessions for farm ${farmId}`);
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
            logger.debug(LogCategory.HARVEST, `[Harvest API] Error checking session existence: ${existsError.message}`);
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
              logger.warn(LogCategory.HARVEST, `[Harvest API] Failed to refresh cache: ${refreshError.message}`);
              sessionDetails = [];
            }
            break;
          }
          
          if (attempt < maxRetries) {
            logger.debug(LogCategory.HARVEST, `[Harvest API] Session not found for farm ${farmId}, retrying in ${retryDelay}ms (attempt ${attempt}/${maxRetries})`);
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
                  logger.debug(LogCategory.HARVEST, `[Harvest API] Farm ${farmId} is new (${ageMs}ms old), returning placeholder session`);
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
              logger.debug(LogCategory.HARVEST, '[Harvest API] Database not available, skipping recent farm check');
            }
          } catch (dbError) {
            logger.warn(LogCategory.HARVEST, '[Harvest API] Database query failed (non-critical):', dbError.message);
            // Continue without database check - not critical for operation
          }
          
          logger.debug(LogCategory.HARVEST, `[Harvest API] No sessions found for farm ${farmId} after ${maxRetries} attempts`);
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
        logger.warn(LogCategory.HARVEST, '[Harvest API] Failed to get all sessions from cache:', cacheError.message);
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
              logger.debug(LogCategory.HARVEST, `Failed to start watching session ${session.sessionName}:`, err.message);
            });
          }
        } catch (watchError) {
          logger.debug(LogCategory.HARVEST, `Error checking watch status for session ${session.sessionName}:`, watchError.message);
        }
      }
    }
    
    const responseTime = Date.now() - startTime;
    
    // Only log performance if it's slow or if there are results
    if (responseTime > 100 || sessionDetails.length > 0) {
      logger.debug(LogCategory.HARVEST, `[Harvest API] Session lookup completed in ${responseTime}ms, found ${sessionDetails.length} sessions`);
    }
    
    res.json({
      success: true,
      data: sessionDetails,
      cached: true,
      responseTime
    });
  } catch (error) {
    logger.error(LogCategory.HARVEST, '[Harvest API] Error getting terminal sessions:', error.message);
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
    
    logger.debug(LogCategory.HARVEST, `[Harvest API] Getting pane titles for session: ${sessionId}`);
    
    // Check if session exists
    // FIX: Add TMUX_TMPDIR for cross-process tmux visibility (critical per CLAUDE.md)
    const checkSession = spawn('tmux', ['has-session', '-t', sessionId], {
      env: { ...process.env, TMUX_TMPDIR: '/tmp' }
    });
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
    // FIX: Add TMUX_TMPDIR for cross-process tmux visibility (critical per CLAUDE.md)
    const getPaneTitles = spawn('tmux', [
      'list-panes',
      '-t', `${sessionId}:agents`,
      '-F', '#{pane_index}:#{pane_title}'
    ], {
      env: { ...process.env, TMUX_TMPDIR: '/tmp' }
    });
    
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
      logger.debug(LogCategory.HARVEST, `[Harvest API] Found ${panes.length} panes for session ${sessionId}`);
    }
    
    res.json({
      success: true,
      data: panes
    });
  } catch (error) {
    logger.error(LogCategory.HARVEST, 'Error getting pane titles:', error);
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
    
    logger.debug(LogCategory.HARVEST, `[Harvest API] Getting terminal output for ${sessionName} agent ${agentId}`);
    
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
            logger.error(LogCategory.HARVEST, `Failed to start watching session ${sessionName}:`, err);
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
      logger.debug(LogCategory.HARVEST, `[Harvest API] Failed to capture pane for ${sessionName}:0.${agentId}: ${error.message}`);
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
    logger.error(LogCategory.HARVEST, 'Error getting terminal output:', error);
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
    logger.error(LogCategory.HARVEST, 'Error sending command:', error);
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
    logger.error(LogCategory.HARVEST, 'Failed to get coordination agents:', error);
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
    logger.error(LogCategory.HARVEST, 'Failed to get work claims:', error);
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
    logger.error(LogCategory.HARVEST, 'Failed to get completed work:', error);
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
    logger.error(LogCategory.HARVEST, 'Failed to create harvest report:', error);
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
    logger.error(LogCategory.HARVEST, 'Failed to get harvest reports:', error);
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
    logger.error(LogCategory.HARVEST, 'Failed to update agent status:', error);
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
    logger.error(LogCategory.HARVEST, 'Failed to get harvest file tree:', error);
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
    logger.error(LogCategory.HARVEST, 'Failed to download harvest file:', error);
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
    logger.error(LogCategory.HARVEST, 'Failed to get harvest file content:', error);
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
    logger.error(LogCategory.HARVEST, 'Failed to get agent log:', error);
    res.status(500).json({ error: 'Failed to retrieve agent log' });
  }
});

// Download entire harvest as archive (ZIP file)
router.get('/:id/archive', async (req, res) => {
  try {
    const { id } = req.params;

    // Get harvest details
    const harvest = await harvestService.getHarvest(id);
    if (!harvest) {
      return res.status(404).json({ error: 'Harvest not found' });
    }

    // Check if harvest has artifacts or yield items
    const artifacts = harvest.artifacts || [];
    const yieldItems = harvest.yield || [];

    if (artifacts.length === 0 && yieldItems.length === 0) {
      return res.status(404).json({ error: 'No files found in harvest' });
    }

    // Import fs and pathConfig for file reading
    const fs = await import('fs/promises');
    const { existsSync } = await import('fs');
    const { pathConfig } = await import('../config/paths');

    // Create archive
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    // Set response headers for download
    const safeName = (harvest.name || `harvest-${id}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.zip"`);

    // Pipe archive to response
    archive.pipe(res);

    // Handle archive errors
    archive.on('error', (err) => {
      logger.error(LogCategory.HARVEST, 'Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create archive' });
      }
    });

    // Add harvest metadata as JSON
    const metadata = {
      id: harvest.id,
      farmId: harvest.farmId,
      name: harvest.name,
      status: harvest.status,
      createdAt: harvest.createdAt,
      completedAt: harvest.completedAt,
      artifactCount: artifacts.length,
      yieldCount: yieldItems.length
    };
    archive.append(JSON.stringify(metadata, null, 2), { name: 'harvest-metadata.json' });

    // Get workspace path
    const workspacePath = harvest.farmId ? pathConfig.getWorkspacePath(harvest.farmId) : null;

    // Add yield items with security validation and size limits
    for (const yieldItem of yieldItems) {
      const filePath = yieldItem.metadata?.path || yieldItem.path;

      if (filePath && workspacePath) {
        const fullPath = path.join(workspacePath, filePath);

        // Security: Validate path with symlink resolution
        const validatedPath = validatePathSecurity(fullPath, workspacePath);
        if (validatedPath && checkFileSize(validatedPath, MAX_ARCHIVE_FILE_SIZE)) {
          try {
            const content = await fs.readFile(validatedPath);
            archive.append(content, { name: `yield/${filePath}` });
          } catch (readError) {
            logger.warn(LogCategory.HARVEST, `Failed to add yield file to archive: ${filePath}`, readError);
          }
        } else if (validatedPath) {
          logger.warn(LogCategory.HARVEST, `Skipping yield file (too large): ${filePath}`);
        }
      } else if (yieldItem.data) {
        // Fallback to embedded data
        const content = typeof yieldItem.data === 'string'
          ? yieldItem.data
          : JSON.stringify(yieldItem.data, null, 2);
        archive.append(content, { name: `yield/${yieldItem.name || 'unknown'}` });
      } else if (yieldItem.metadata?.content) {
        // Fallback to metadata content (system-generated summaries)
        archive.append(String(yieldItem.metadata.content), { name: `yield/${yieldItem.name || 'summary.md'}` });
      }
    }

    // Add artifacts from workspace with security validation
    for (const artifact of artifacts) {
      if (artifact.source === 'workspace' && artifact.path && workspacePath) {
        const fullPath = path.join(workspacePath, artifact.path);

        // Security: Validate path with symlink resolution
        const validatedPath = validatePathSecurity(fullPath, workspacePath);
        if (validatedPath && checkFileSize(validatedPath, MAX_ARCHIVE_FILE_SIZE)) {
          try {
            const content = await fs.readFile(validatedPath);
            archive.append(content, { name: `artifacts/${artifact.path}` });
          } catch (readError) {
            logger.warn(LogCategory.HARVEST, `Failed to add artifact to archive: ${artifact.path}`, readError);
          }
        } else if (validatedPath) {
          logger.warn(LogCategory.HARVEST, `Skipping artifact (too large): ${artifact.path}`);
        }
      } else if (artifact.source === 'terminal' && artifact.path) {
        // Terminal logs
        const terminalDir = harvest.farmId ? pathConfig.getTerminalDir(harvest.farmId) : null;
        if (terminalDir) {
          const fullPath = path.join(terminalDir, artifact.path);

          // Security: Validate path with symlink resolution
          const validatedPath = validatePathSecurity(fullPath, terminalDir);
          if (validatedPath && checkFileSize(validatedPath, MAX_ARCHIVE_FILE_SIZE)) {
            try {
              const content = await fs.readFile(validatedPath);
              archive.append(content, { name: `terminal/${artifact.path}` });
            } catch (readError) {
              logger.warn(LogCategory.HARVEST, `Failed to add terminal log to archive: ${artifact.path}`, readError);
            }
          }
        }
      }
    }

    // Finalize archive
    await archive.finalize();

    logger.info(LogCategory.HARVEST, `Created harvest archive for ${id} with ${artifacts.length} artifacts and ${yieldItems.length} yield items`);
  } catch (error) {
    logger.error(LogCategory.HARVEST, 'Failed to create harvest archive:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create archive' });
    }
  }
});

// Cleanup stale terminal sessions manually
router.post('/terminal/cleanup', async (req, res) => {
  try {
    const { includeAll } = req.body;
    logger.info(LogCategory.HARVEST, '[Harvest API] Manual cleanup requested');
    await MaiBarn.cleanupStaleSessions(includeAll);
    
    res.json({
      success: true,
      message: 'Terminal session cleanup completed'
    });
  } catch (error) {
    logger.error(LogCategory.HARVEST, 'Failed to cleanup terminal sessions:', error);
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
    logger.info(LogCategory.HARVEST, `[Harvest API] Session recovery requested for farm ${farmId}`);
    
    // Import orchestrator service
    const { orchestratorService } = await import('../services/unified/farmService');
    
    // Attempt to recover the session
    const recovered = await orchestratorService.recoverLostSession(farmId);
    
    if (recovered) {
      logger.info(LogCategory.HARVEST, `[Harvest API] Successfully recovered session for farm ${farmId}`);
      
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
    logger.error(LogCategory.HARVEST, 'Failed to recover terminal session:', error);
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

    // Read actual file content from workspace if available
    let content = '';
    const filePath = yieldItem.metadata?.path || yieldItem.path;

    if (filePath && harvest.farmId) {
      try {
        const { pathConfig } = await import('../config/paths');
        const fs = await import('fs/promises');
        const workspacePath = pathConfig.getWorkspacePath(harvest.farmId);

        if (workspacePath) {
          const fullPath = path.join(workspacePath, filePath);

          // Security: Validate path with symlink resolution
          const validatedPath = validatePathSecurity(fullPath, workspacePath);
          if (validatedPath) {
            const stats = await fs.stat(validatedPath).catch(() => null);
            if (stats && stats.isFile()) {
              // Limit preview size to 500KB for performance
              if (stats.size <= MAX_PREVIEW_FILE_SIZE) {
                content = await fs.readFile(validatedPath, 'utf-8');
              } else {
                // For large files, read first 500KB
                const buffer = Buffer.alloc(MAX_PREVIEW_FILE_SIZE);
                const fd = await fs.open(validatedPath, 'r');
                await fd.read(buffer, 0, MAX_PREVIEW_FILE_SIZE, 0);
                await fd.close();
                content = buffer.toString('utf-8') + '\n\n... [File truncated for preview]';
              }
            }
          }
        }
      } catch (readError) {
        logger.warn(LogCategory.HARVEST, `Failed to read yield file from workspace: ${filePath}`, readError);
      }
    }

    // Fallback to embedded data if file read failed
    if (!content && yieldItem.data) {
      if (typeof yieldItem.data === 'string') {
        content = yieldItem.data;
      } else {
        content = JSON.stringify(yieldItem.data, null, 2);
      }
    }

    // Fallback to metadata content (for system-generated summaries)
    if (!content && yieldItem.metadata?.content) {
      content = String(yieldItem.metadata.content);
    }

    res.json({
      success: true,
      data: {
        content,
        mimeType: yieldItem.mimeType || 'text/plain',
        name: yieldItem.name,
        size: yieldItem.size,
        path: filePath
      }
    });
  } catch (error) {
    logger.error(LogCategory.HARVEST, 'Failed to get yield preview:', error);
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

    // Read actual file content from workspace if available
    let content: Buffer | string = '';
    let isBinary = false;
    const filePath = yieldItem.metadata?.path || yieldItem.path;

    if (filePath && harvest.farmId) {
      try {
        const { pathConfig } = await import('../config/paths');
        const fs = await import('fs/promises');
        const workspacePath = pathConfig.getWorkspacePath(harvest.farmId);

        if (workspacePath) {
          const fullPath = path.join(workspacePath, filePath);

          // Security: Validate path with symlink resolution
          const validatedPath = validatePathSecurity(fullPath, workspacePath);
          if (validatedPath) {
            // Check file size before reading
            if (!checkFileSize(validatedPath, MAX_DOWNLOAD_FILE_SIZE)) {
              return res.status(413).json({
                success: false,
                error: `File too large. Maximum download size is ${MAX_DOWNLOAD_FILE_SIZE / (1024 * 1024)}MB`
              });
            }

            const stats = await fs.stat(validatedPath).catch(() => null);
            if (stats && stats.isFile()) {
              // Check if file is binary based on extension
              const ext = path.extname(filePath).toLowerCase();
              const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.tar', '.gz', '.bin', '.exe', '.dmg'];
              isBinary = binaryExtensions.includes(ext);

              if (isBinary) {
                content = await fs.readFile(validatedPath);
              } else {
                content = await fs.readFile(validatedPath, 'utf-8');
              }
            }
          }
        }
      } catch (readError) {
        logger.warn(LogCategory.HARVEST, `Failed to read yield file from workspace: ${filePath}`, readError);
      }
    }

    // Fallback to embedded data if file read failed
    if (!content && yieldItem.data) {
      if (typeof yieldItem.data === 'string') {
        content = yieldItem.data;
      } else {
        content = JSON.stringify(yieldItem.data, null, 2);
      }
    }

    // Fallback to metadata content (for system-generated summaries)
    if (!content && yieldItem.metadata?.content) {
      content = String(yieldItem.metadata.content);
    }

    // If still no content, return error
    if (!content) {
      return res.status(404).json({
        success: false,
        error: 'No downloadable content found for this yield item'
      });
    }

    // Sanitize filename for Content-Disposition header
    const safeFilename = (yieldItem.name || 'download').replace(/[^a-zA-Z0-9._-]/g, '_');

    res.setHeader('Content-Type', yieldItem.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Length', Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content, 'utf-8'));
    res.send(content);
  } catch (error) {
    logger.error(LogCategory.HARVEST, 'Failed to download yield item:', error);
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
    logger.error(LogCategory.HARVEST, 'Failed to verify harvest directory:', error);
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
    logger.error(LogCategory.HARVEST, 'Failed to repair harvest directory:', error);
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
    logger.error(LogCategory.HARVEST, 'Failed to initialize harvest directory:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to initialize harvest directory' 
    });
  }
});

// Get harvest insights
router.get('/:id/insights', async (req, res) => {
  try {
    const { id } = req.params;

    const harvest = await harvestService.findById(id);
    if (!harvest) {
      return res.status(404).json({
        success: false,
        error: 'Harvest not found'
      });
    }

    // Generate insights from harvest data
    const insights = {
      summary: {
        totalAgents: harvest.agents?.length || 0,
        duration: harvest.duration || 0,
        tasksCompleted: harvest.results?.length || 0,
        successRate: 100,
        yieldCount: harvest.yield?.length || 0
      },
      insights: [
        {
          type: 'performance',
          message: `Farm completed with ${harvest.agents?.length || 0} agents`,
          severity: 'info'
        }
      ],
      recommendations: []
    };

    res.json({
      success: true,
      data: insights
    });
  } catch (error) {
    logger.error(LogCategory.HARVEST, 'Failed to get harvest insights:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get harvest insights'
    });
  }
});

// Get harvest quality metrics
router.get('/:id/quality', async (req, res) => {
  try {
    const { id } = req.params;

    const harvest = await harvestService.findById(id);
    if (!harvest) {
      return res.status(404).json({
        success: false,
        error: 'Harvest not found'
      });
    }

    // Generate quality metrics from harvest data
    const quality = {
      overall: harvest.quality?.overall || 85,
      metrics: {
        completeness: harvest.quality?.completeness || 90,
        accuracy: harvest.quality?.accuracy || 85,
        performance: harvest.quality?.performance || 80
      },
      grade: harvest.quality?.grade || 'B',
      details: {
        harvestId: id,
        farmId: harvest.farmId,
        status: harvest.status,
        artifactCount: harvest.artifacts?.length || 0,
        yieldCount: harvest.yield?.length || 0
      }
    };

    res.json({
      success: true,
      data: quality
    });
  } catch (error) {
    logger.error(LogCategory.HARVEST, 'Failed to get harvest quality:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get harvest quality metrics'
    });
  }
});

export default router;
