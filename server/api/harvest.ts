import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { MaiBarn } from '../services/maibarn';
import { harvestService } from '../services/harvestService';
import { harvestFileCollector } from '../services/harvestFileCollector';
import { logger } from '../utils/logger';
import { HarvestFilter, HarvestExport } from '../../src/types/harvest';
import { coordinationService } from '../services/coordinationService';
import { terminalOutputWatcher } from '../services/terminalOutputWatcher';

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
    const { farmHarvestIntegration } = await import('../services/farmHarvestIntegration');
    
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
      return res.status(404).json({ 
        success: false,
        error: { message: 'Harvest not found', code: 'NOT_FOUND' }
      });
    }
    res.json({ 
      success: true, 
      data: harvest 
    });
  } catch (error) {
    logger.error('Failed to get harvest:', error);
    res.status(500).json({ 
      success: false,
      error: { message: 'Failed to retrieve harvest', code: 'INTERNAL_ERROR' }
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
      const { barnService } = await import('../services/barnService');
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

// Get terminal output for a harvest's Claude agents
router.get('/terminal/sessions', async (req, res) => {
  try {
    const { farmId, showAll } = req.query;
    console.log('[Harvest API] Getting terminal sessions for farmId:', farmId);
    
    // First, clean up stale sessions using MaiBarn
    await MaiBarn.cleanupStaleSessions(showAll === 'true');
    
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
    
    // Parse all sessions
    const sessionLines = output.trim().split('\n').filter(Boolean);
    console.log('[Harvest API] All tmux sessions:', sessionLines);
    
    const sessions = sessionLines.map(line => {
      const [name, created] = line.split(':');
      return {
        name,
        sessionName: name,
        createdTime: parseInt(created) * 1000 || Date.now(),
        age: Date.now() - (parseInt(created) * 1000 || Date.now()),
        ageMinutes: (Date.now() - (parseInt(created) * 1000 || Date.now())) / (1000 * 60)
      };
    });
    
    // Filter sessions using MaiBarn
    const relevantSessions = MaiBarn.filterRelevantSessions(sessions, showAll === 'true');
    
    // Get detailed session information
    let sessionDetails = await MaiBarn.getSessionDetails(relevantSessions);
    
    // Sort by creation time, most recent first
    sessionDetails.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return timeB - timeA;
    });
    
    // Filter by farmId if provided
    if (farmId && typeof farmId === 'string') {
      const filtered = MaiBarn.filterSessionsByFarmId(sessionDetails, farmId as string);
      if (filtered.length > 0) {
        sessionDetails = filtered;
        console.log(`[Harvest API] Filtered to ${filtered.length} sessions for farmId ${farmId}`);
      } else {
        console.log(`[Harvest API] No sessions matched farmId ${farmId}, returning all ${sessionDetails.length} sessions`);
      }
    }
    
    // Start watching sessions for live updates
    for (const session of sessionDetails) {
      if (!terminalOutputWatcher.isWatching(session.sessionName)) {
        terminalOutputWatcher.startWatching(
          session.sessionName, 
          session.farmId,
          session.paneCount
        ).catch(err => {
          logger.error(`Failed to start watching session ${session.sessionName}:`, err);
        });
      }
    }
    
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
      console.log(`[Harvest API] Failed to capture pane for ${sessionName}:0.${agentId}`, error.message);
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
    console.log('[Harvest API] Manual cleanup requested');
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

export default router;