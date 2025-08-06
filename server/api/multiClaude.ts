import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { coordinationService } from '../services/coordinationService';
import { apiRateLimits } from '../middleware/rateLimit';
import { multiClaudeService } from '../services/multiClaudeService';
import { websocketManager } from '../websocket/websocketManager';

const router = Router();

// Store active multi-claude processes
const activeProcesses = new Map<string, any>();

// Launch multi-claude orchestration with improved integration
router.post('/launch',
  apiRateLimits.write,
  async (req: Request, res: Response) => {
    try {
      const { 
        farmId,
        farmName = 'Multi-Claude Farm',
        agents = 3, 
        prompt, 
        steps = [],
        collaborative = false,
        session,
        stagger = 5,
        contextFiles = [],
        yamlContent,
        provider = 'claude'
      } = req.body;
      
      // Validate input
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PROMPT',
            message: 'Prompt is required'
          }
        });
      }
      
      if (agents < 1 || agents > 10) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_AGENT_COUNT',
            message: 'Agent count must be between 1 and 10'
          }
        });
      }
      
      // Generate session ID based on farmId if provided
      const sessionId = farmId ? `farm_${farmId.substring(0, 8)}` : `farm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Build command arguments
      const args = [
        'multi_claude.py',
        '-n', agents.toString(),
        '-p', prompt,
        '-s', session || sessionId
      ];
      
      if (stagger) {
        args.push('--stagger', stagger.toString());
      }
      
      if (collaborative) {
        args.push('--collaborative');
      }
      
      if (steps && steps.length > 0) {
        args.push('--steps', ...steps);
      }
      
      if (contextFiles && contextFiles.length > 0) {
        args.push('--context-files', ...contextFiles);
      }
      
      // Launch the Python script
      const multiClaudeProcess = spawn('python3', args, {
        cwd: process.cwd(),
        env: { ...process.env },
        detached: false
      });
      
      // Store process reference
      activeProcesses.set(sessionId, {
        process: multiClaudeProcess,
        startTime: new Date(),
        agents,
        prompt,
        status: 'running'
      });
      
      // Handle process output
      multiClaudeProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        console.log('[MultiClaude]', output);
        
        // Broadcast to WebSocket clients
        if (global.wsServer) {
          global.wsServer.broadcast('multiclaude:output', {
            sessionId,
            type: 'stdout',
            data: output
          });
        }
      });
      
      multiClaudeProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        console.error('[MultiClaude Error]', output);
        
        // Broadcast error to WebSocket clients
        if (global.wsServer) {
          global.wsServer.broadcast('multiclaude:output', {
            sessionId,
            type: 'stderr',
            data: output
          });
        }
      });
      
      multiClaudeProcess.on('exit', (code) => {
        console.log(`[MultiClaude] Process ${sessionId} exited with code ${code}`);
        
        // Update process status
        const processInfo = activeProcesses.get(sessionId);
        if (processInfo) {
          processInfo.status = code === 0 ? 'completed' : 'failed';
          processInfo.exitCode = code;
          processInfo.endTime = new Date();
        }
        
        // Broadcast completion
        if (global.wsServer) {
          global.wsServer.broadcast('multiclaude:exit', {
            sessionId,
            code,
            status: code === 0 ? 'completed' : 'failed'
          });
        }
      });
      
      // Broadcast farm launch event for HarvestTerminal
      websocketManager.broadcast('farm:launched', {
        farmId: farmId || sessionId,
        processId: sessionId,
        tmuxSession: session || sessionId,
        agentCount: agents,
        timestamp: new Date()
      });
      
      res.json({
        success: true,
        data: {
          farmId: farmId || sessionId,
          sessionId,
          tmuxSession: session || sessionId,
          agents,
          status: 'launched',
          coordinationDir: '/tmp/claude_coordination'
        }
      });
    } catch (error) {
      console.error('Failed to launch multi-claude:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'LAUNCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to launch multi-claude orchestration'
        }
      });
    }
  }
);

// Stop multi-claude orchestration
router.post('/stop/:sessionId',
  apiRateLimits.write,
  async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      
      const processInfo = activeProcesses.get(sessionId);
      if (!processInfo) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'Session not found'
          }
        });
      }
      
      // Send SIGINT to gracefully stop
      processInfo.process.kill('SIGINT');
      processInfo.status = 'stopping';
      
      res.json({
        success: true,
        data: {
          sessionId,
          status: 'stopping'
        }
      });
    } catch (error) {
      console.error('Failed to stop multi-claude:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STOP_FAILED',
          message: error instanceof Error ? error.message : 'Failed to stop orchestration'
        }
      });
    }
  }
);

// Get coordination state
router.get('/coordination/state',
  apiRateLimits.read,
  async (req: Request, res: Response) => {
    try {
      const state = coordinationService.getCoordinationState();
      
      res.json({
        success: true,
        data: state
      });
    } catch (error) {
      console.error('Failed to get coordination state:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STATE_FETCH_FAILED',
          message: 'Failed to fetch coordination state'
        }
      });
    }
  }
);

// Get active agents
router.get('/agents',
  apiRateLimits.read,
  async (req: Request, res: Response) => {
    try {
      const agents = coordinationService.getActiveAgents();
      
      res.json({
        success: true,
        data: {
          agents,
          count: agents.length
        }
      });
    } catch (error) {
      console.error('Failed to get agents:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'AGENTS_FETCH_FAILED',
          message: 'Failed to fetch active agents'
        }
      });
    }
  }
);

// Get work claims
router.get('/work-claims',
  apiRateLimits.read,
  async (req: Request, res: Response) => {
    try {
      const claims = coordinationService.getWorkClaims();
      
      res.json({
        success: true,
        data: {
          claims,
          count: claims.length
        }
      });
    } catch (error) {
      console.error('Failed to get work claims:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CLAIMS_FETCH_FAILED',
          message: 'Failed to fetch work claims'
        }
      });
    }
  }
);

// Get completed work
router.get('/completed-work',
  apiRateLimits.read,
  async (req: Request, res: Response) => {
    try {
      const completed = coordinationService.getCompletedWork();
      
      res.json({
        success: true,
        data: {
          completed,
          count: completed.length
        }
      });
    } catch (error) {
      console.error('Failed to get completed work:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'COMPLETED_FETCH_FAILED',
          message: 'Failed to fetch completed work'
        }
      });
    }
  }
);

// Launch farm using multiClaudeService
router.post('/launch-farm',
  apiRateLimits.write,
  async (req: Request, res: Response) => {
    try {
      const {
        farmId,
        name = 'Multi-Claude Farm',
        description = 'Multi-agent collaborative farm',
        numberOfAgents = 5,
        prompt,
        yamlContent,
        steps,
        collaborative = false,
        provider = 'claude'
      } = req.body;
      
      if (!farmId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FARM_ID',
            message: 'Farm ID is required'
          }
        });
      }
      
      if (!prompt && !yamlContent) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PROMPT',
            message: 'Either prompt or yamlContent is required'
          }
        });
      }
      
      // Launch farm using multiClaudeService
      const processId = await multiClaudeService.launchFarm({
        farmId,
        name,
        description,
        numberOfAgents,
        prompt: prompt || '',
        yamlContent,
        steps,
        collaborative,
        provider: provider as 'claude' | 'qwen'
      });
      
      res.json({
        success: true,
        data: {
          farmId,
          processId,
          status: 'launching',
          numberOfAgents,
          message: 'Farm launch initiated successfully'
        }
      });
    } catch (error: any) {
      console.error('Failed to launch farm:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'LAUNCH_FAILED',
          message: error.message || 'Failed to launch farm'
        }
      });
    }
  }
);

// Trigger harvest
router.post('/harvest',
  apiRateLimits.write,
  async (req: Request, res: Response) => {
    try {
      const { farmId, agentIds = [] } = req.body;
      
      if (!farmId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_FARM_ID',
            message: 'Farm ID is required'
          }
        });
      }
      
      await coordinationService.triggerHarvest(farmId, agentIds);
      
      res.json({
        success: true,
        data: {
          farmId,
          status: 'harvest_triggered',
          timestamp: new Date()
        }
      });
    } catch (error) {
      console.error('Failed to trigger harvest:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'HARVEST_TRIGGER_FAILED',
          message: 'Failed to trigger harvest'
        }
      });
    }
  }
);

// Get active sessions
router.get('/sessions',
  apiRateLimits.read,
  async (req: Request, res: Response) => {
    try {
      const sessions = Array.from(activeProcesses.entries()).map(([id, info]) => ({
        sessionId: id,
        agents: info.agents,
        prompt: info.prompt.substring(0, 100) + (info.prompt.length > 100 ? '...' : ''),
        status: info.status,
        startTime: info.startTime,
        endTime: info.endTime,
        exitCode: info.exitCode
      }));
      
      res.json({
        success: true,
        data: {
          sessions,
          count: sessions.length
        }
      });
    } catch (error) {
      console.error('Failed to get sessions:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SESSIONS_FETCH_FAILED',
          message: 'Failed to fetch active sessions'
        }
      });
    }
  }
);

// Clean up completed sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, info] of activeProcesses.entries()) {
    if (info.status === 'completed' || info.status === 'failed') {
      const endTime = info.endTime?.getTime() || now;
      // Remove sessions that ended more than 1 hour ago
      if (now - endTime > 3600000) {
        activeProcesses.delete(sessionId);
      }
    }
  }
}, 300000); // Every 5 minutes

// Make WebSocket server globally available
declare global {
  var wsServer: any;
}

export default router;