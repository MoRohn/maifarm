import { Router, Response } from 'express';
import { spawn } from 'child_process';
import { MaiBarn } from '../services/maibarn';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { terminalService } from '../services/unified/terminalService';

// Create sessionCache facade
const sessionCache = {
  get: (key: string) => terminalService.getFromCache(key),
  set: (key: string, value: any) => terminalService.setInCache(key, value),
  clear: () => terminalService.clearCache()
};
import { backgroundCleanupService } from '../services/backgroundCleanupService';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * GET /api/terminal/sessions
 * List all active terminal sessions (with caching for performance)
 */
router.get('/sessions', async (req: AuthRequest, res: Response) => {
  try {
    const { farmId, showAll } = req.query;
    const cacheKey = `sessions:${farmId || 'all'}:${showAll || 'false'}`;
    
    // Try to get from cache first (5 second TTL for fast response)
    let validSessions = sessionCache.get(cacheKey);
    
    if (validSessions) {
      console.log(`[Terminal API] Returning cached sessions (${validSessions.length} sessions)`);
      return res.json({
        success: true,
        data: validSessions,
        count: validSessions.length,
        cached: true
      });
    }
    
    // PERFORMANCE FIX: Remove blocking cleanup call - background service handles this
    // Instead, trigger a non-blocking background cleanup if needed
    backgroundCleanupService.forceCleanup(showAll === 'true').catch(err => {
      console.warn('[Terminal API] Background cleanup failed:', err);
    });
    
    // List all tmux sessions that look like farm or claude_agents sessions
    const listSessions = spawn('tmux', ['list-sessions', '-F', '#{session_name}:#{session_created}:#{session_windows}']);
    let output = '';
    let errorOutput = '';
    
    listSessions.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });
    
    listSessions.stderr?.on('data', (data: Buffer) => {
      errorOutput += data.toString();
    });
    
    const exitCode = await new Promise<number>(resolve => {
      listSessions.on('exit', (code) => resolve(code || 0));
    });
    
    if (exitCode !== 0) {
      return res.json({
        success: true,
        data: [], // No sessions available
        message: 'No active tmux sessions found'
      });
    }
    
    // Parse sessions and get details using MaiBarn
    const sessionLines = output.trim().split('\n').filter(line => line);
    const sessions = sessionLines.map(line => {
      const [name, created, windowCount] = line.split(':');
      return {
        name,
        sessionName: name,
        createdTime: parseInt(created) * 1000,
        age: Date.now() - (parseInt(created) * 1000),
        ageMinutes: (Date.now() - (parseInt(created) * 1000)) / (1000 * 60)
      };
    });
    
    console.log(`[Terminal API] Raw sessions found:`, sessions.map(s => s.name));
    
    // Filter sessions using MaiBarn
    const relevantSessions = MaiBarn.filterRelevantSessions(sessions, showAll === 'true');
    
    console.log(`[Terminal API] Found ${relevantSessions.length} relevant tmux sessions (filtered from ${sessions.length} total):`, relevantSessions.map(s => s.name));
    
    // Get detailed information for each session
    validSessions = await MaiBarn.getSessionDetails(relevantSessions);
    
    // Sort by creation time (most recent first)
    validSessions.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return timeB - timeA;
    });
    
    console.log(`[Terminal API] Found ${validSessions.length} valid sessions, sorted by creation time`);
    
    // Filter by farmId if provided
    if (farmId && typeof farmId === 'string') {
      const filteredSessions = MaiBarn.filterSessionsByFarmId(validSessions, farmId);
      
      if (filteredSessions.length > 0) {
        validSessions = filteredSessions;
        console.log(`Found ${filteredSessions.length} sessions for farmId ${farmId}`);
      } else {
        console.log(`No sessions matched farmId ${farmId}, returning all ${validSessions.length} sessions for manual selection`);
      }
    }
    
    // Cache the results for 5 seconds to improve performance
    sessionCache.set(cacheKey, validSessions, 5000);
    
    res.json({
      success: true,
      data: validSessions,
      count: validSessions.length
    });
  } catch (error) {
    console.error('Error getting terminal sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get terminal sessions'
    });
  }
});

/**
 * GET /api/terminal/sessions/:id
 * Get details for a specific terminal session
 */
router.get('/sessions/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id: sessionName } = req.params;
    
    // Check if session exists
    const checkSession = spawn('tmux', ['has-session', '-t', sessionName]);
    const sessionExists = await new Promise<boolean>(resolve => {
      checkSession.on('exit', (code) => resolve(code === 0));
    });
    
    if (!sessionExists) {
      return res.status(404).json({
        success: false,
        error: 'Terminal session not found'
      });
    }
    
    // Get session details
    const getSessionInfo = spawn('tmux', ['display-message', '-t', sessionName, '-p', '#{session_created}:#{session_windows}']);
    let sessionOutput = '';
    
    getSessionInfo.stdout?.on('data', (data: Buffer) => {
      sessionOutput += data.toString();
    });
    
    await new Promise(resolve => getSessionInfo.on('exit', resolve));
    
    const [createdTime, windowCount] = sessionOutput.trim().split(':');
    
    // Get pane count and extract farm ID using MaiBarn
    const paneCount = await MaiBarn.getPaneCount(sessionName);
    const farmId = MaiBarn.extractFarmId(sessionName);
    
    const sessionDetails = {
      id: sessionName,
      sessionName,
      farmId,
      paneCount,
      windowName: 'agents',
      active: true,
      status: 'running',
      createdAt: new Date(parseInt(createdTime) * 1000).toISOString(),
      agents: Array.from({ length: paneCount }, (_, i) => ({
        id: i,
        sessionId: sessionName,
        paneId: `${sessionName}:${i}`,
        status: 'ready',
        commandHistory: []
      }))
    };
    
    res.json({
      success: true,
      data: sessionDetails
    });
  } catch (error) {
    console.error('Error getting terminal session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get terminal session'
    });
  }
});

/**
 * POST /api/terminal/sessions
 * Create a new terminal session
 */
router.post('/sessions', async (req: AuthRequest, res: Response) => {
  try {
    const { farmId, agentCount = 3, sessionName } = req.body;
    
    if (!farmId) {
      return res.status(400).json({
        success: false,
        error: 'farmId is required'
      });
    }
    
    const effectiveSessionName = sessionName || `farm_${farmId}`;
    
    // Create new tmux session with multiple panes
    const createSession = spawn('tmux', ['new-session', '-d', '-s', effectiveSessionName, '-x', '120', '-y', '40']);
    
    const sessionCreated = await new Promise<boolean>(resolve => {
      createSession.on('exit', (code) => resolve(code === 0));
    });
    
    if (!sessionCreated) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create terminal session'
      });
    }
    
    // Create additional panes for agents
    for (let i = 1; i < agentCount; i++) {
      const splitPane = spawn('tmux', ['split-window', '-t', `${effectiveSessionName}:0`, '-h']);
      await new Promise(resolve => splitPane.on('exit', resolve));
      
      // Rebalance panes
      const rebalance = spawn('tmux', ['select-layout', '-t', `${effectiveSessionName}:0`, 'tiled']);
      await new Promise(resolve => rebalance.on('exit', resolve));
    }
    
    // Emit WebSocket event
    req.app.get('wsServer')?.broadcast('terminal:session', {
      type: 'session',
      action: 'created',
      sessionId: effectiveSessionName,
      farmId,
      agentCount,
      timestamp: new Date()
    });
    
    res.status(201).json({
      success: true,
      data: {
        id: effectiveSessionName,
        sessionName: effectiveSessionName,
        farmId,
        paneCount: agentCount,
        status: 'running'
      },
      message: 'Terminal session created successfully'
    });
  } catch (error) {
    console.error('Error creating terminal session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create terminal session'
    });
  }
});

/**
 * DELETE /api/terminal/sessions/:id
 * Delete a terminal session
 */
router.delete('/sessions/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id: sessionName } = req.params;
    
    // Kill the tmux session
    const killSession = spawn('tmux', ['kill-session', '-t', sessionName]);
    
    const sessionKilled = await new Promise<boolean>(resolve => {
      killSession.on('exit', (code) => resolve(code === 0));
    });
    
    if (!sessionKilled) {
      return res.status(404).json({
        success: false,
        error: 'Terminal session not found or could not be deleted'
      });
    }
    
    // Emit WebSocket event
    req.app.get('wsServer')?.broadcast('terminal:session', {
      type: 'session',
      action: 'deleted',
      sessionId: sessionName,
      timestamp: new Date()
    });
    
    res.json({
      success: true,
      message: 'Terminal session deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting terminal session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete terminal session'
    });
  }
});

/**
 * GET /api/terminal/output
 * Get terminal output for a specific session and pane
 */
router.get('/output', async (req: AuthRequest, res: Response) => {
  try {
    const { session, pane } = req.query;
    
    if (!session || typeof session !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Session name is required'
      });
    }
    
    const paneIndex = parseInt(pane as string) || 0;
    
    // Check if session exists
    const checkSession = spawn('tmux', ['has-session', '-t', session]);
    const sessionExists = await new Promise<boolean>(resolve => {
      checkSession.on('exit', (code) => resolve(code === 0));
    });
    
    if (!sessionExists) {
      return res.status(404).json({
        success: false,
        error: 'Terminal session not found'
      });
    }
    
    // Capture pane output
    const capturePane = spawn('tmux', ['capture-pane', '-t', `${session}:0.${paneIndex}`, '-p', '-S', '-1000']);
    let output = '';
    
    capturePane.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });
    
    capturePane.stderr?.on('data', (data: Buffer) => {
      console.error(`Error capturing pane: ${data.toString()}`);
    });
    
    await new Promise((resolve, reject) => {
      capturePane.on('exit', (code) => {
        if (code === 0) {
          resolve(null);
        } else {
          reject(new Error(`Failed to capture pane output (exit code: ${code})`));
        }
      });
    });
    
    // Split into lines and filter empty lines at the end
    const lines = output.split('\n');
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }
    
    res.json({
      success: true,
      data: lines
    });
  } catch (error) {
    console.error('Error getting terminal output:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get terminal output'
    });
  }
});

/**
 * POST /api/terminal/command
 * Send command to a specific session and pane
 */
router.post('/command', async (req: AuthRequest, res: Response) => {
  try {
    const { session, pane, command } = req.body;
    
    if (!session || typeof session !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Session name is required'
      });
    }
    
    if (!command || typeof command !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Command is required'
      });
    }
    
    const paneIndex = parseInt(pane) || 0;
    
    // Check if session exists
    const checkSession = spawn('tmux', ['has-session', '-t', session]);
    const sessionExists = await new Promise<boolean>(resolve => {
      checkSession.on('exit', (code) => resolve(code === 0));
    });
    
    if (!sessionExists) {
      return res.status(404).json({
        success: false,
        error: 'Terminal session not found'
      });
    }
    
    // Send command to pane
    const sendKeys = spawn('tmux', ['send-keys', '-t', `${session}:0.${paneIndex}`, command, 'Enter']);
    
    const commandSent = await new Promise<boolean>(resolve => {
      sendKeys.on('exit', (code) => resolve(code === 0));
    });
    
    if (!commandSent) {
      return res.status(500).json({
        success: false,
        error: 'Failed to send command to terminal'
      });
    }
    
    // Emit WebSocket event for real-time updates
    req.app.get('wsServer')?.broadcast('terminal:command', {
      sessionId: session,
      paneIndex,
      command,
      timestamp: new Date()
    });
    
    res.json({
      success: true,
      message: 'Command sent successfully'
    });
  } catch (error) {
    console.error('Error sending terminal command:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send command'
    });
  }
});

/**
 * GET /api/terminal/agents/:sessionId-:agentId/output
 * Get terminal output for a specific agent
 */
router.get('/agents/:agentKey/output', async (req: AuthRequest, res: Response) => {
  try {
    const { agentKey } = req.params;
    const { lines = 100 } = req.query;
    
    // Parse agent key (format: sessionId-agentId)
    const [sessionId, agentIdStr] = agentKey.split('-');
    const agentId = parseInt(agentIdStr);
    
    if (!sessionId || isNaN(agentId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid agent key format. Expected: sessionId-agentId'
      });
    }
    
    // Get terminal output using MaiBarn
    try {
      const outputData = await MaiBarn.getAgentOutput(sessionId, agentId, Number(lines) || 100);
      
      res.json({
        success: true,
        data: outputData
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: 'Agent terminal not found',
        details: error.message
      });
    }
  } catch (error) {
    console.error('Error getting agent terminal output:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get terminal output'
    });
  }
});

/**
 * POST /api/terminal/agents/:sessionId-:agentId/command
 * Send command to a specific agent terminal
 */
router.post('/agents/:agentKey/command', async (req: AuthRequest, res: Response) => {
  try {
    const { agentKey } = req.params;
    const { command } = req.body;
    
    // Parse agent key (format: sessionId-agentId)
    const [sessionId, agentIdStr] = agentKey.split('-');
    const agentId = parseInt(agentIdStr);
    
    if (!sessionId || isNaN(agentId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid agent key format. Expected: sessionId-agentId'
      });
    }
    
    if (!command || !command.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Command is required'
      });
    }
    
    // Send command using MaiBarn
    const success = await MaiBarn.sendCommand(sessionId, agentId, command);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Failed to send command to agent terminal'
      });
    }
    
    // Emit WebSocket event
    req.app.get('wsServer')?.broadcast('terminal:command', {
      type: 'command',
      sessionId,
      agentId,
      command: command.trim(),
      timestamp: new Date()
    });
    
    res.json({
      success: true,
      message: 'Command sent successfully',
      data: {
        sessionId,
        agentId,
        command: command.trim(),
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Error sending command to agent:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send command'
    });
  }
});

/**
 * POST /api/terminal/recover/:farmId
 * Attempt to recover a terminal session for a farm
 */
router.post('/recover/:farmId', async (req: AuthRequest, res: Response) => {
  try {
    const { farmId } = req.params;
    
    console.log(`[Terminal API] Attempting to recover session for farm ${farmId}`);
    
    // Try to find an existing session for this farm
    const sessions = await MaiBarn.getAllSessions();
    const relevantSessions = MaiBarn.filterRelevantSessions(sessions);
    const sessionDetails = await MaiBarn.getSessionDetails(relevantSessions);
    const matchingSessions = MaiBarn.filterSessionsByFarmId(sessionDetails, farmId);
    
    if (matchingSessions.length > 0) {
      const session = matchingSessions[0];
      console.log(`[Terminal API] Found existing session ${session.sessionName} for farm ${farmId}`);
      
      // Check if terminal streaming is active
      const { terminalStreamService } = await import('../services/unified/terminalService');
      if (!terminalStreamService.isStreaming(session.sessionName)) {
        // Restart streaming
        await terminalStreamService.startStreaming(session.sessionName, farmId, session.paneCount);
        console.log(`[Terminal API] Restarted streaming for session ${session.sessionName}`);
      }
      
      return res.json({
        success: true,
        message: 'Session recovered successfully',
        sessionName: session.sessionName,
        paneCount: session.paneCount
      });
    }
    
    // No existing session found - check if farm is active
    res.json({
      success: false,
      message: 'No active session found for this farm'
    });
    
  } catch (error) {
    console.error('Error recovering terminal session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to recover terminal session'
    });
  }
});

/**
 * POST /api/terminal/cleanup
 * Manually trigger cleanup of stale sessions (optimized with background service)
 */
router.post('/cleanup', async (req: AuthRequest, res: Response) => {
  try {
    const { includeAll, force } = req.body;
    
    let cleanedSessions: string[] = [];
    
    if (force) {
      // Force immediate cleanup (bypass throttling)
      cleanedSessions = await MaiBarn.cleanupStaleSessions(includeAll);
      console.log(`[Terminal API] Force cleanup completed: ${cleanedSessions.length} sessions cleaned`);
    } else {
      // Use optimized background service for cleanup
      cleanedSessions = await backgroundCleanupService.forceCleanup(includeAll);
      console.log(`[Terminal API] Background cleanup triggered: ${cleanedSessions.length} sessions cleaned`);
    }
    
    // Invalidate session cache after cleanup
    sessionCache.invalidatePattern(/^sessions:/);
    
    res.json({
      success: true,
      message: `Cleaned up ${cleanedSessions.length} stale sessions`,
      data: {
        cleanedSessions,
        forced: !!force,
        backgroundService: !force,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Error cleaning up sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup sessions'
    });
  }
});

/**
 * GET /api/terminal/:sessionName/:agentId
 * Get terminal output for a specific agent in a session
 */
router.get('/:sessionName/:agentId', async (req: AuthRequest, res: Response) => {
  try {
    const { sessionName, agentId: agentIdStr } = req.params;
    const { lines = '100' } = req.query;
    const agentId = parseInt(agentIdStr);
    const lineCount = parseInt(lines as string);
    
    if (isNaN(agentId) || isNaN(lineCount)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid agent ID or line count'
      });
    }
    
    // Get terminal output using MaiBarn
    const result = await MaiBarn.getAgentOutput(sessionName, agentId, lineCount);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting terminal output:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get terminal output'
    });
  }
});

/**
 * POST /api/terminal/:sessionName/:agentId/command
 * Send a command to a specific agent
 */
router.post('/:sessionName/:agentId/command', async (req: AuthRequest, res: Response) => {
  try {
    const { sessionName, agentId: agentIdStr } = req.params;
    const { command } = req.body;
    const agentId = parseInt(agentIdStr);
    
    if (!command || isNaN(agentId)) {
      return res.status(400).json({
        success: false,
        error: 'Command and valid agent ID are required'
      });
    }
    
    // Send command using MaiBarn
    await MaiBarn.sendAgentCommand(sessionName, agentId, command);
    
    res.json({
      success: true,
      message: 'Command sent successfully'
    });
  } catch (error) {
    console.error('Error sending command:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send command'
    });
  }
});

/**
 * GET /api/terminal/agents/:sessionId-:agentId/status
 * Get status of a specific agent
 */
router.get('/agents/:agentKey/status', async (req: AuthRequest, res: Response) => {
  try {
    const { agentKey } = req.params;
    
    // Parse agent key (format: sessionId-agentId)
    const [sessionId, agentIdStr] = agentKey.split('-');
    const agentId = parseInt(agentIdStr);
    
    if (!sessionId || isNaN(agentId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid agent key format. Expected: sessionId-agentId'
      });
    }
    
    // Check if pane exists
    const checkPane = spawn('tmux', ['display-message', '-t', `${sessionId}:agents.${agentId}`, '-p', '#{pane_active}']);
    let paneOutput = '';
    
    checkPane.stdout?.on('data', (data: Buffer) => {
      paneOutput += data.toString();
    });
    
    const exitCode = await new Promise<number>(resolve => {
      checkPane.on('exit', (code) => resolve(code || 0));
    });
    
    if (exitCode !== 0) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }
    
    const isActive = paneOutput.trim() === '1';
    
    res.json({
      success: true,
      data: {
        sessionId,
        agentId,
        status: isActive ? 'ready' : 'idle',
        active: isActive,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Error getting agent status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get agent status'
    });
  }
});

/**
 * POST /api/terminal/verify
 * Verify and fix terminal streaming for a session
 */
router.post('/verify', async (req: AuthRequest, res: Response) => {
  try {
    const { sessionName, farmId, agentCount } = req.body;
    
    if (!sessionName || !farmId) {
      return res.status(400).json({
        success: false,
        error: 'Session name and farm ID are required'
      });
    }
    
    console.log(`[Terminal API] Verifying terminal stream for ${sessionName} with ${agentCount} agents`);
    
    // Import terminal stream service
    const { terminalStreamService } = await import('../services/unified/terminalService');
    
    // Verify and fix streaming
    const verified = await terminalStreamService.verifyAndFixStreaming(
      sessionName,
      farmId,
      agentCount || 1
    );
    
    res.json({
      success: verified,
      message: verified ? 'Terminal streaming verified and active' : 'Terminal streaming verification failed',
      sessionName,
      farmId,
      agentCount
    });
  } catch (error) {
    console.error('Error verifying terminal:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify terminal streaming'
    });
  }
});

/**
 * Debug routes for terminal streaming
 */

// Import debug functions
import { 
  getTerminalDebugInfo, 
  testTerminalStreaming, 
  restartTerminalStreaming,
  getTerminalSample 
} from '../api/terminalDebug';

/**
 * GET /api/terminal/debug
 * Get comprehensive debug information
 */
router.get('/debug', getTerminalDebugInfo);

/**
 * POST /api/terminal/debug/test
 * Test terminal streaming for a specific session
 */
router.post('/debug/test', testTerminalStreaming);

/**
 * POST /api/terminal/debug/restart
 * Force restart terminal streaming
 */
router.post('/debug/restart', restartTerminalStreaming);

/**
 * GET /api/terminal/debug/sample
 * Get live terminal output sample
 */
router.get('/debug/sample', getTerminalSample);

/**
 * GET /api/terminal/performance
 * Get performance statistics for terminal services
 */
router.get('/performance', async (req: AuthRequest, res: Response) => {
  try {
    // Get session cache stats
    const cacheStats = sessionCache.getStats();
    
    // Get background cleanup status
    const cleanupStatus = backgroundCleanupService.getStatus();
    
    // Get terminal watcher stats
    const { terminalOutputWatcher } = await import('../services/unified/terminalService');
    const watcherInstance = terminalOutputWatcher as any;
    const watchedSessions = watcherInstance.watchedSessions ? watcherInstance.watchedSessions.size : 0;
    
    res.json({
      success: true,
      data: {
        sessionCache: {
          ...cacheStats,
          enabled: true
        },
        backgroundCleanup: {
          ...cleanupStatus,
          intervalMs: 5 * 60 * 1000, // 5 minutes
          throttleMs: 60 * 1000 // 1 minute
        },
        terminalWatcher: {
          watchedSessions,
          checkIntervalMs: 250,
          batchFlushDelay: 100
        },
        optimizations: [
          'Session caching (5s TTL)',
          'Background cleanup (5min intervals)',
          'Throttled cleanup (1min minimum)',
          'Race condition protection (2s delay)',
          'Exponential backoff for session checks',
          'TMUX_TMPDIR consistency',
          'Cached farmManager imports'
        ]
      }
    });
  } catch (error) {
    console.error('Error getting performance stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get performance statistics'
    });
  }
});

export default router;