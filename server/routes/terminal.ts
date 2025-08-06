import { Router, Response } from 'express';
import { spawn } from 'child_process';
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
    const { farmId } = req.query;
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
    
    // Get all non-empty sessions - be more flexible in what we accept
    const sessionLines = output.trim().split('\n').filter(line => line);
    
    // Log for debugging
    console.log('[Terminal API] Found tmux sessions:', sessionLines);
    
    // Get details for each session
    const sessionDetailsRaw = await Promise.all(sessionLines.map(async (sessionLine) => {
      const [sessionName, createdTime, windowCount] = sessionLine.split(':');
      
      try {
        // Get pane count for the session
        const paneCount = await new Promise<number>((resolve) => {
          const countPanes = spawn('tmux', ['list-panes', '-t', `${sessionName}:0`, '-F', '#{pane_index}']);
          let paneOutput = '';
          countPanes.stdout?.on('data', (data: Buffer) => { 
            paneOutput += data.toString(); 
          });
          countPanes.on('exit', () => {
            const count = paneOutput.trim().split('\n').filter(Boolean).length;
            resolve(count);
          });
          countPanes.on('error', () => resolve(0));
        });
        
        // Extract farm ID from session name if possible
        // Try different patterns: farm_xxx, farm-xxx, claude_agents_xxx, or farmId directly in name
        let extractedFarmId: string | undefined;
        
        // Pattern 1: farm_<id> or farm-<id>
        const farmIdMatch = sessionName.match(/farm[_-]([a-zA-Z0-9-]+)/);
        if (farmIdMatch) {
          extractedFarmId = farmIdMatch[1];
        } 
        // Pattern 2: claude_agents_<timestamp>_<farmId>
        else if (sessionName.includes('claude_agents')) {
          const claudeMatch = sessionName.match(/claude_agents_\d+_([a-zA-Z0-9-]+)/);
          if (claudeMatch) {
            extractedFarmId = claudeMatch[1];
          } else {
            // Legacy format: claude_agents or claude_agents_<number>
            extractedFarmId = undefined;
          }
        }
        // Pattern 3: Direct UUID in session name (check if session name is a UUID)
        else if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(sessionName)) {
          extractedFarmId = sessionName;
        }
        // Pattern 4: Contains a UUID anywhere in the name
        else {
          const uuidMatch = sessionName.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
          if (uuidMatch) {
            extractedFarmId = uuidMatch[1];
          }
        }
        
        return {
          id: sessionName,
          sessionName,
          farmId: extractedFarmId,
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
      } catch (error) {
        console.error(`Error getting details for session ${sessionName}:`, error);
        return null;
      }
    }));
    
    // Filter out null sessions and sort by creation time (most recent first)
    let validSessions = sessionDetailsRaw
      .filter(Boolean)
      .sort((a, b) => {
        // Sort by createdAt in descending order (most recent first)
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        return timeB - timeA;
      });
    
    console.log(`[Terminal API] Found ${validSessions.length} valid sessions, sorted by creation time`);
    
    // If farmId query parameter is provided, try to filter sessions
    if (farmId && typeof farmId === 'string') {
      // First try exact match on extracted farmId
      let filteredSessions = validSessions.filter(s => s.farmId === farmId);
      
      // If no exact matches, try more flexible matching
      if (filteredSessions.length === 0) {
        filteredSessions = validSessions.filter(s => {
          // Check if session name contains the farmId
          if (s.sessionName.includes(farmId)) return true;
          
          // Check common patterns
          if (s.sessionName === `farm_${farmId}`) return true;
          if (s.sessionName === `farm-${farmId}`) return true;
          if (s.sessionName === `claude_agents_${farmId}`) return true;
          
          // Check if farmId is a substring of a longer UUID in session name
          if (farmId.length >= 8) {
            const shortId = farmId.substring(0, 8);
            if (s.sessionName.includes(shortId)) return true;
          }
          
          return false;
        });
      }
      
      // If we found matches, use them; otherwise log for debugging
      if (filteredSessions.length > 0) {
        validSessions = filteredSessions;
        console.log(`Found ${filteredSessions.length} sessions for farmId ${farmId}`);
      } else {
        console.log(`No sessions matched farmId ${farmId}, returning all ${validSessions.length} sessions for manual selection`);
        // Return all sessions but mark that filtering failed (frontend can handle this)
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
    
    // Get pane count
    const paneCount = await new Promise<number>((resolve) => {
      const countPanes = spawn('tmux', ['list-panes', '-t', `${sessionName}:0`, '-F', '#{pane_index}']);
      let paneOutput = '';
      countPanes.stdout?.on('data', (data: Buffer) => { 
        paneOutput += data.toString(); 
      });
      countPanes.on('exit', () => {
        const count = paneOutput.trim().split('\n').filter(Boolean).length;
        resolve(count);
      });
    });
    
    // Extract farm ID from session name if possible
    const farmIdMatch = sessionName.match(/farm_([a-zA-Z0-9-]+)/);
    const farmId = farmIdMatch ? farmIdMatch[1] : undefined;
    
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
    
    // Capture terminal output from tmux pane
    const captureProcess = spawn('tmux', [
      'capture-pane',
      '-t', `${sessionId}:0.${agentId}`,
      '-p',
      '-S', `-${lines}` // Get last N lines
    ]);
    
    let output = '';
    let errorOutput = '';
    
    captureProcess.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });
    
    captureProcess.stderr?.on('data', (data: Buffer) => {
      errorOutput += data.toString();
    });
    
    const exitCode = await new Promise<number>(resolve => {
      captureProcess.on('exit', (code) => resolve(code || 0));
    });
    
    if (exitCode !== 0) {
      return res.status(404).json({
        success: false,
        error: 'Agent terminal not found',
        details: errorOutput
      });
    }
    
    // Parse terminal output
    const lines_array = output.split('\n');
    
    res.json({
      success: true,
      data: {
        sessionId,
        agentId,
        lines: lines_array,
        terminal: lines_array, // For backward compatibility
        timestamp: new Date(),
        type: 'stdout'
      }
    });
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
    
    // Send command to tmux pane
    const sendProcess = spawn('tmux', [
      'send-keys',
      '-t', `${sessionId}:0.${agentId}`,
      command.trim(),
      'C-m' // Enter key
    ]);
    
    const exitCode = await new Promise<number>(resolve => {
      sendProcess.on('exit', (code) => resolve(code || 0));
    });
    
    if (exitCode !== 0) {
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