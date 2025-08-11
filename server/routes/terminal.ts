import { Router, Response } from 'express';
import { spawn } from 'child_process';
import { MaiBarn } from '../services/maibarn';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * GET /api/terminal/sessions
 * List all active terminal sessions
 */
router.get('/sessions', async (req: AuthRequest, res: Response) => {
  try {
    const { farmId, showAll } = req.query;
    
    // First, clean up any stale sessions before listing
    await MaiBarn.cleanupStaleSessions(showAll === 'true');
    
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
      const [name, created] = line.split(':');
      return {
        name,
        sessionName: name,
        createdTime: parseInt(created) * 1000,
        age: Date.now() - (parseInt(created) * 1000),
        ageMinutes: (Date.now() - (parseInt(created) * 1000)) / (1000 * 60)
      };
    });
    
    // Filter sessions using MaiBarn
    const relevantSessions = MaiBarn.filterRelevantSessions(sessions, showAll === 'true');
    
    console.log(`[Terminal API] Found ${relevantSessions.length} relevant tmux sessions (filtered from ${sessions.length} total)`);
    
    // Get detailed information for each session
    let validSessions = await MaiBarn.getSessionDetails(relevantSessions);
    
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
 * POST /api/terminal/cleanup
 * Manually trigger cleanup of stale sessions
 */
router.post('/cleanup', async (req: AuthRequest, res: Response) => {
  try {
    const { includeAll } = req.body;
    const cleanedSessions = await MaiBarn.cleanupStaleSessions(includeAll);
    
    res.json({
      success: true,
      message: `Cleaned up ${cleanedSessions.length} stale sessions`,
      data: {
        cleanedSessions,
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
    const checkPane = spawn('tmux', ['display-message', '-t', `${sessionId}:0.${agentId}`, '-p', '#{pane_active}']);
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

export default router;