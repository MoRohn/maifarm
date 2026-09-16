import { Router, Response } from 'express';
import { harvestService } from '../services/unified/harvestService';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { HarvestCreateInput, HarvestFilter } from '../types/harvest';
import { farmService as farmManager } from '../services/unified/farmService';
import { barnService } from '../services/unified/barnService';
import { spawn } from 'child_process';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get all harvests for the user
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';
    const filter: HarvestFilter = {
      farmId: req.query.farmId as string,
      status: req.query.status as any,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      sortBy: req.query.sortBy as any,
      sortOrder: req.query.sortOrder as any
    };

    const harvests = await harvestService.getUserHarvests(userId, filter);

    res.json({
      success: true,
      data: harvests,
      count: harvests.length
    });
  } catch (error) {
    console.error('Error fetching harvests:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch harvests'
    });
  }
});

// Get a specific harvest
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId || req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';
    
    const harvest = await harvestService.getHarvest(id, userId);
    
    if (!harvest) {
      return res.status(404).json({
        success: false,
        error: 'Harvest not found'
      });
    }

    res.json({
      success: true,
      data: harvest
    });
  } catch (error) {
    console.error('Error fetching harvest:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch harvest'
    });
  }
});

// Create a new harvest (usually triggered automatically by farm completion)
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';
    const harvestData: Omit<HarvestCreateInput, 'userId'> = req.body;

    if (!harvestData.farmId || !harvestData.farmName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: farmId and farmName'
      });
    }

    const harvest = await harvestService.createHarvest({
      ...harvestData,
      userId
    });

    // Emit WebSocket event
    req.app.get('wsServer')?.broadcast('harvest:created', harvest);

    res.status(201).json({
      success: true,
      data: harvest
    });
  } catch (error) {
    console.error('Error creating harvest:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create harvest'
    });
  }
});

// Start collecting harvest data from a farm
router.post('/:farmId/collect', async (req: AuthRequest, res: Response) => {
  try {
    const { farmId } = req.params;
    const userId = req.user?.userId || req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';

    // Get farm details to create harvest
    // farmManager already imported at top
    const farm = await farmManager.getFarm(farmId, userId);

    if (!farm) {
      return res.status(404).json({
        success: false,
        error: 'Farm not found'
      });
    }

    const harvest = await harvestService.startHarvest(farmId, farm.name, userId);

    // Emit WebSocket event with guaranteed delivery
    const { unifiedWebSocketManager } = await import('../websocket/UnifiedWebSocketManager.js');
    await unifiedWebSocketManager.broadcastWithAck(
      'harvest:started',
      { harvest },
      { farmId: harvest.farmId, retryAttempts: 3, timeout: 5000 }
    );

    res.json({
      success: true,
      data: harvest,
      message: 'Harvest collection started'
    });
  } catch (error) {
    console.error('Error starting harvest:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start harvest'
    });
  }
});

// Complete a harvest and store in barn
router.post('/:id/complete', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId || req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';
    const { data, summary } = req.body;

    const harvest = await harvestService.completeHarvest(id, userId, { data, summary });

    if (!harvest) {
      return res.status(404).json({
        success: false,
        error: 'Harvest not found'
      });
    }

    // Store in barn
    // barnService already imported at top
    const barnEntry = await barnService.storeHarvest(harvest);

    // Emit WebSocket events with guaranteed delivery
    const { unifiedWebSocketManager } = await import('../websocket/UnifiedWebSocketManager.js');
    await unifiedWebSocketManager.broadcastWithAck(
      'harvest:completed',
      { harvest },
      { farmId: harvest.farmId, retryAttempts: 3, timeout: 5000 }
    );
    // barn:stored is not critical, can use regular broadcast
    req.app.get('wsServer')?.broadcast('barn:stored', barnEntry);

    res.json({
      success: true,
      data: harvest,
      barnEntry: barnEntry,
      message: 'Harvest completed and stored in barn'
    });
  } catch (error) {
    console.error('Error completing harvest:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to complete harvest'
    });
  }
});

// Delete a harvest
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId || req.user?.id || 'a913e59f-3971-5f06-be81-afa2ef2fa862';

    const deleted = await harvestService.deleteHarvest(id, userId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Harvest not found'
      });
    }

    // Emit WebSocket event
    req.app.get('wsServer')?.broadcast('harvest:deleted', { id });

    res.json({
      success: true,
      message: 'Harvest deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting harvest:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete harvest'
    });
  }
});

// Get terminal output for a harvest's Claude agents
router.get('/terminal/sessions', async (req: AuthRequest, res: Response) => {
  try {
    const { farmId } = req.query;
    // spawn already imported at top
    
    // List all tmux sessions that look like farm or claude_agents sessions
    // FIX: Add TMUX_TMPDIR for cross-process tmux visibility (critical per CLAUDE.md)
    const listSessions = spawn('tmux', ['list-sessions', '-F', '#{session_name}'], {
      env: { ...process.env, TMUX_TMPDIR: '/tmp' }
    });
    let output = '';

    listSessions.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    // FIX: Add error handler to prevent unhandled rejection if spawn fails
    listSessions.on('error', (err) => {
      console.error('Error spawning tmux list-sessions:', err);
    });

    await new Promise(resolve => listSessions.on('exit', resolve));
    
    let sessions = output.trim().split('\n').filter(line => 
      line.includes('farm_') || line.includes('farm-') || line.includes('quick_') || line.includes('claude_agents')
    );
    
    // Filter by farmId if provided
    if (farmId && typeof farmId === 'string') {
      sessions = sessions.filter(sessionName => {
        // Exact match for different session naming patterns
        // Quick Task pattern: quick_{shortId}
        if (sessionName === `quick_${farmId.substring(0, 8)}`) return true;
        
        // Regular farm patterns: farm-{farmId} or farm_{farmId}
        if (sessionName === `farm-${farmId}`) return true;
        if (sessionName === `farm_${farmId}`) return true;
        
        // Legacy pattern: claude_agents
        if (sessionName === 'claude_agents' && farmId === 'default') return true;
        
        // For backward compatibility, also check if session contains the full farmId
        // but only if it's a proper prefix match to avoid false positives
        if (sessionName.startsWith(`farm-${farmId}`) || sessionName.startsWith(`farm_${farmId}`)) return true;
        if (sessionName.startsWith(`quick_${farmId.substring(0, 8)}`)) return true;
        
        return false;
      });
    }
    
    // Get details for each session
    const sessionDetails = await Promise.all(sessions.map(async (sessionName) => {
      const paneCount = await new Promise<number>((resolve) => {
        // FIX: Add TMUX_TMPDIR for cross-process tmux visibility (critical per CLAUDE.md)
        const countPanes = spawn('tmux', ['list-panes', '-t', `${sessionName}:0`, '-F', '#{pane_index}'], {
          env: { ...process.env, TMUX_TMPDIR: '/tmp' }
        });
        let paneOutput = '';
        countPanes.stdout?.on('data', (data: Buffer) => { paneOutput += data.toString(); });
        // FIX: Add error handler to prevent unhandled rejection
        countPanes.on('error', (err) => {
          console.error(`Error spawning tmux list-panes for ${sessionName}:`, err);
          resolve(0);
        });
        countPanes.on('exit', () => {
          const count = paneOutput.trim().split('\n').filter(Boolean).length;
          resolve(count);
        });
      });
      
      // Extract farmId from session name
      let extractedFarmId: string | undefined;
      const farmIdMatch = sessionName.match(/farm[_-]([a-zA-Z0-9-]+)/);
      if (farmIdMatch) {
        extractedFarmId = farmIdMatch[1];
      } else if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(sessionName)) {
        extractedFarmId = sessionName;
      }
      
      return {
        sessionName,
        farmId: extractedFarmId,
        paneCount,
        windowName: 'agents',
        active: true
      };
    }));
    
    res.json({
      success: true,
      data: sessionDetails
    });
  } catch (error) {
    console.error('Error getting terminal sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get terminal sessions'
    });
  }
});

// Get terminal output for a specific agent
router.get('/terminal/:sessionName/:agentId', async (req: AuthRequest, res: Response) => {
  try {
    const { sessionName, agentId } = req.params;
    const { lines = 100 } = req.query;
    // spawn already imported at top
    
    // Capture terminal output from tmux pane
    // FIX: Add TMUX_TMPDIR for cross-process tmux visibility (critical per CLAUDE.md)
    const captureProcess = spawn('tmux', [
      'capture-pane',
      '-t', `${sessionName}:0.${agentId}`,
      '-p',
      '-S', `-${lines}` // Get last N lines
    ], {
      env: { ...process.env, TMUX_TMPDIR: '/tmp' }
    });

    let output = '';
    let errorOutput = '';

    captureProcess.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    captureProcess.stderr?.on('data', (data: Buffer) => {
      errorOutput += data.toString();
    });

    // FIX: Add error handler to prevent unhandled rejection if spawn fails
    captureProcess.on('error', (err) => {
      console.error('Error spawning tmux capture-pane:', err);
      errorOutput += err.message;
    });

    const exitCode = await new Promise<number>(resolve => {
      captureProcess.on('exit', (code) => resolve(code || 0));
    });
    
    if (exitCode !== 0) {
      return res.status(404).json({
        success: false,
        error: 'Terminal session not found',
        details: errorOutput
      });
    }
    
    // Parse terminal output to identify Claude agent
    const lines_array = output.split('\n');
    const agentInfo = {
      id: agentId,
      sessionName,
      status: 'active'
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
    console.error('Error getting terminal output:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get terminal output'
    });
  }
});

// Send command to a specific agent terminal
router.post('/terminal/:sessionName/:agentId/command', async (req: AuthRequest, res: Response) => {
  try {
    const { sessionName, agentId } = req.params;
    const { command } = req.body;
    // spawn already imported at top
    
    if (!command) {
      return res.status(400).json({
        success: false,
        error: 'Command is required'
      });
    }
    
    // Send command to tmux pane
    // FIX: Add TMUX_TMPDIR for cross-process tmux visibility (critical per CLAUDE.md)
    const sendProcess = spawn('tmux', [
      'send-keys',
      '-t', `${sessionName}:0.${agentId}`,
      command,
      'C-m' // Enter key
    ], {
      env: { ...process.env, TMUX_TMPDIR: '/tmp' }
    });

    // FIX: Add error handler to prevent unhandled rejection if spawn fails
    let spawnError: Error | null = null;
    sendProcess.on('error', (err) => {
      console.error('Error spawning tmux send-keys:', err);
      spawnError = err;
    });

    const exitCode = await new Promise<number>(resolve => {
      sendProcess.on('exit', (code) => resolve(spawnError ? 1 : (code || 0)));
    });
    
    if (exitCode !== 0) {
      return res.status(404).json({
        success: false,
        error: 'Failed to send command to terminal'
      });
    }
    
    // Emit WebSocket event
    req.app.get('wsServer')?.broadcast('harvest:terminal:command', {
      sessionName,
      agentId,
      command,
      timestamp: new Date()
    });
    
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
    console.error('Error sending command:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send command'
    });
  }
});

export default router;