import { Router } from 'express';
import { spawn } from 'child_process';
import { harvestService } from '../services/harvestService';
import { logger } from '../utils/logger';
import { HarvestFilter, HarvestExport } from '../../src/types/harvest';
import { coordinationService } from '../services/coordinationService';

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

// Get harvests by farm ID
router.get('/farms/:farmId', async (req, res) => {
  try {
    const { farmId } = req.params;
    const harvests = await harvestService.findByFarmId(farmId);
    res.json(harvests);
  } catch (error) {
    logger.error('Failed to get harvests for farm:', error);
    res.status(500).json({ error: 'Failed to retrieve harvests for farm' });
  }
});

// Get harvest by ID
router.get('/:id', async (req, res) => {
  try {
    const harvest = await harvestService.findById(req.params.id);
    if (!harvest) {
      return res.status(404).json({ error: 'Harvest not found' });
    }
    res.json(harvest);
  } catch (error) {
    logger.error('Failed to get harvest:', error);
    res.status(500).json({ error: 'Failed to retrieve harvest' });
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
      includeArtifacts: req.body.includeArtifacts !== false,
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

// Get terminal output for a harvest's Claude agents
router.get('/terminal/sessions', async (req, res) => {
  try {
    const { farmId } = req.query;
    console.log('[Harvest API] Getting terminal sessions for farmId:', farmId);
    
    // List all tmux sessions with more details
    const listSessions = spawn('tmux', ['list-sessions', '-F', '#{session_name}:#{session_created}']);
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
    
    // If no tmux server or no sessions
    if (exitCode !== 0 || !output.trim()) {
      console.log('[Harvest API] No tmux sessions found (exit code:', exitCode, ')');
      if (errorOutput) {
        console.log('[Harvest API] tmux error:', errorOutput);
      }
      return res.json({
        success: true,
        data: []
      });
    }
    
    const allSessions = output.trim().split('\n').filter(Boolean);
    console.log('[Harvest API] All tmux sessions:', allSessions);
    
    // Parse sessions with timestamps
    const parsedSessions = allSessions.map(line => {
      const [sessionName, created] = line.split(':');
      return { sessionName, created: parseInt(created) || 0 };
    });
    
    // Filter sessions based on farmId if provided
    let relevantSessions = parsedSessions;
    if (farmId) {
      const shortFarmId = (farmId as string).substring(0, 8);
      relevantSessions = parsedSessions.filter(({ sessionName }) => {
        // Check if session matches farm pattern
        return sessionName.includes(shortFarmId) || 
               sessionName === `farm_${shortFarmId}` ||
               sessionName.startsWith(`farm_${shortFarmId}`);
      });
      console.log(`[Harvest API] Filtered sessions for farm ${shortFarmId}:`, relevantSessions.map(s => s.sessionName));
    } else {
      // Include all farm and quick task sessions
      relevantSessions = parsedSessions.filter(({ sessionName }) => {
        return sessionName.startsWith('quick-') || 
               sessionName.startsWith('farm_') || 
               sessionName.includes('claude_agents');
      });
    }
    
    // Sort by creation time, most recent first
    relevantSessions.sort((a, b) => b.created - a.created);
    
    // Get details for each session
    const sessionDetails = await Promise.all(relevantSessions.map(async ({ sessionName, created }) => {
      const paneCount = await new Promise<number>((resolve) => {
        const countPanes = spawn('tmux', ['list-panes', '-t', `${sessionName}:0`, '-F', '#{pane_index}']);
        let paneOutput = '';
        countPanes.stdout?.on('data', (data: Buffer) => { paneOutput += data.toString(); });
        countPanes.on('exit', (code) => {
          if (code === 0) {
            const count = paneOutput.trim().split('\n').filter(Boolean).length;
            resolve(count);
          } else {
            resolve(0);
          }
        });
      });
      
      // Determine session type and metadata
      const isQuickTask = sessionName.startsWith('quick-');
      const isFarm = sessionName.startsWith('farm_');
      
      // Extract farmId from session name if it's a farm session
      let extractedFarmId = undefined;
      if (isFarm) {
        const match = sessionName.match(/farm_([a-f0-9]{8})/);
        if (match) {
          extractedFarmId = match[1];
        }
      }
      
      const metadata: any = {
        type: isQuickTask ? 'quicktask' : 'farm',
        isQuickTask,
        isFarm,
        created
      };
      
      // Extract task ID from quick task session name
      if (isQuickTask) {
        metadata.taskId = sessionName.replace('quick-', '');
      }
      
      return {
        sessionName,
        paneCount,
        windowName: isQuickTask ? 'quicktask' : 'agents',
        active: true,
        farmId: extractedFarmId,
        metadata
      };
    }));
    
    res.json({
      success: true,
      data: sessionDetails
    });
  } catch (error) {
    logger.error('Error getting terminal sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get terminal sessions'
    });
  }
});

// Get terminal output for a specific agent
router.get('/terminal/:sessionName/:agentId', async (req, res) => {
  try {
    const { sessionName, agentId } = req.params;
    const { lines = 500 } = req.query; // Increased default to capture more of the launch process
    
    console.log(`[Harvest API] Getting terminal output for ${sessionName} agent ${agentId}`);
    
    // Capture terminal output from tmux pane with full history
    const captureProcess = spawn('tmux', [
      'capture-pane',
      '-t', `${sessionName}:0.${agentId}`,
      '-p',
      '-S', `-${lines}`, // Get last N lines
      '-E', '-1' // Capture to the end
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
      console.log(`[Harvest API] Failed to capture pane for ${sessionName}:0.${agentId}`, errorOutput);
      return res.status(404).json({
        success: false,
        error: 'Terminal session not found',
        details: errorOutput
      });
    }
    
    // Parse terminal output to identify Claude agent and extract info
    const lines_array = output.split('\n');
    
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
    
    // Send command to tmux pane
    const sendProcess = spawn('tmux', [
      'send-keys',
      '-t', `${sessionName}:0.${agentId}`,
      command,
      'C-m' // Enter key
    ]);
    
    const exitCode = await new Promise<number>(resolve => {
      sendProcess.on('exit', (code) => resolve(code || 0));
    });
    
    if (exitCode !== 0) {
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
    const agents = coordinationService.getActiveAgents();
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

export default router;