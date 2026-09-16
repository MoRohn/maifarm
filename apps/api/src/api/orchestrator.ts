import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { coordinationService } from '../services/coordinationService';
import { apiRateLimits } from '../middleware/rateLimit';
import { orchestratorService } from '../services/unified/orchestratorService';
import { websocketManager } from '../websocket/websocketManager';
import { orchestratorHealthMonitor } from '../services/OrchestratorHealthMonitor';
import { logger, LogCategory } from '../utils/logger';
import { pathConfig } from '../config/paths';
import { getPool } from '../database/connection';

const router = Router();

// Store active orchestrator processes
const activeProcesses = new Map<string, any>();

// Launch orchestration with improved integration
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
        provider = 'claude',
        timeout // timeout in seconds from the request
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
        'scripts/python/orchestrator.py',
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
      
      // Add timeout if specified (convert to seconds for Python script)
      if (timeout && timeout > 0) {
        args.push('--max-runtime', timeout.toString());
        console.log(`[Orchestrator API] Setting max runtime to ${timeout} seconds`);
      } else {
        console.log(`[Orchestrator API] No timeout specified - farm will run indefinitely`);
      }
      
      // Launch the Python script
      const orchestratorProcess = spawn('python3', args, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          TMUX_TMPDIR: '/tmp'  // CRITICAL: Required for cross-process tmux visibility
        },
        detached: false
      });

      // CRITICAL: Add error handler for spawn failures (e.g., Python not found)
      orchestratorProcess.on('error', async (error) => {
        logger.error(LogCategory.FARM, `Orchestrator process spawn error for ${sessionId}:`, error);

        // Update process status
        const processInfo = activeProcesses.get(sessionId);
        if (processInfo) {
          processInfo.status = 'failed';
          processInfo.error = error.message;
          processInfo.endTime = new Date();
        }

        // CRITICAL FIX: Update farm status in database to 'failed'
        if (farmId) {
          try {
            const pool = getPool();
            await pool.query(
              `UPDATE farms SET status = 'failed', updated_at = NOW() WHERE id = $1`,
              [farmId]
            );
            logger.info(LogCategory.FARM, `Updated farm ${farmId} status to 'failed' after spawn error`);
          } catch (dbError) {
            logger.error(LogCategory.DATABASE, `Failed to update farm status after spawn error:`, dbError);
          }
        }

        // Broadcast error to WebSocket clients
        if (global.wsServer) {
          global.wsServer.broadcast('orchestrator:error', {
            sessionId,
            error: error.message,
            type: 'spawn_error'
          });
        }

        // Also broadcast farm status change
        websocketManager.broadcast('farm:status', {
          farmId,
          status: 'failed',
          error: `Orchestrator spawn failed: ${error.message}`
        });
      });

      // Store process reference
      activeProcesses.set(sessionId, {
        process: orchestratorProcess,
        startTime: new Date(),
        agents,
        prompt,
        status: 'running'
      });

      // ROBUSTNESS FIX: Add Node.js-level safety timeout to kill hung processes
      // This is a safety net in case the Python script's internal timeout fails
      const safetyTimeoutMs = (timeout || 7200) * 1000 + 120000; // timeout + 2 min buffer, default 2hr + 2min
      const safetyTimeout = setTimeout(() => {
        const processInfo = activeProcesses.get(sessionId);
        if (processInfo && processInfo.status === 'running') {
          logger.warn(LogCategory.FARM, `Safety timeout reached for ${sessionId}, killing process`);
          try {
            orchestratorProcess.kill('SIGTERM');
            // Give it 10 seconds to gracefully exit, then force kill
            setTimeout(() => {
              if (!orchestratorProcess.killed) {
                orchestratorProcess.kill('SIGKILL');
              }
            }, 10000);
          } catch (killError) {
            logger.error(LogCategory.FARM, `Failed to kill hung process ${sessionId}:`, killError);
          }
        }
      }, safetyTimeoutMs);

      // Clear safety timeout when process exits normally
      orchestratorProcess.on('exit', () => {
        clearTimeout(safetyTimeout);
      });
      
      // Handle process output
      orchestratorProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        console.log('[Orchestrator]', output);
        
        // Broadcast to WebSocket clients
        if (global.wsServer) {
          global.wsServer.broadcast('orchestrator:output', {
            sessionId,
            type: 'stdout',
            data: output
          });
        }
      });
      
      orchestratorProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        console.error('[Orchestrator Error]', output);
        
        // Broadcast error to WebSocket clients
        if (global.wsServer) {
          global.wsServer.broadcast('orchestrator:output', {
            sessionId,
            type: 'stderr',
            data: output
          });
        }
      });
      
      orchestratorProcess.on('exit', (code) => {
        console.log(`[Orchestrator] Process ${sessionId} exited with code ${code}`);
        
        // Update process status
        const processInfo = activeProcesses.get(sessionId);
        if (processInfo) {
          processInfo.status = code === 0 ? 'completed' : 'failed';
          processInfo.exitCode = code;
          processInfo.endTime = new Date();
        }
        
        // Broadcast completion
        if (global.wsServer) {
          global.wsServer.broadcast('orchestrator:exit', {
            sessionId,
            code,
            status: code === 0 ? 'completed' : 'failed'
          });
        }
      });
      
      // CRITICAL: Use broadcastWithAck for guaranteed farm:launched delivery
      // This ensures frontend receives farm launch event even with WebSocket reconnections
      try {
        const ackResult = await websocketManager.broadcastWithAck(
          'farm:launched',
          {
            farmId: farmId || sessionId,
            processId: sessionId,
            tmuxSession: session || sessionId,
            agentCount: agents,
            timestamp: new Date()
          },
          {
            farmId: farmId || sessionId,
            retryAttempts: 3,
            timeout: 5000
          }
        );

        if (ackResult.success) {
          logger.info(LogCategory.FARM,
            `Farm launch (orchestrator) event delivered to ${ackResult.delivered} clients for farm ${farmId || sessionId}`);
        } else {
          logger.warn(LogCategory.FARM,
            `Farm launch (orchestrator) partial delivery: ${ackResult.delivered} delivered, ${ackResult.failed} failed`);
        }
      } catch (broadcastError) {
        logger.error(LogCategory.FARM, `Failed to broadcast farm:launched (orchestrator) event:`, broadcastError);
        // Don't fail farm launch if broadcast fails - farm is already launched
      }
      
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
      console.error('Failed to launch XenoSync orchestration:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'LAUNCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to launch XenoSync orchestration'
        }
      });
    }
  }
);

// Stop XenoSync orchestration (legacy endpoint maintained for compatibility)
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
      console.error('Failed to stop XenoSync orchestration:', error);
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

// Launch farm using XenoSync (through legacy multiClaudeService wrapper)
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
      
      // Launch farm using orchestratorService
      const processId = await orchestratorService.launchFarm({
        farmId,
        name,
        description,
        numberOfAgents,
        prompt: prompt || '',
        yamlContent,
        steps,
        collaborative,
        provider: provider as 'claude' | 'llama'
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
        // FIX: Handle undefined prompt to prevent crash
        prompt: info.prompt ? (info.prompt.substring(0, 100) + (info.prompt.length > 100 ? '...' : '')) : '',
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

// ============================================================================
// ORCHESTRATOR HEALTH & MONITORING ENDPOINTS
// ============================================================================

/**
 * Get comprehensive health status for a specific farm's orchestrator
 * Includes orchestrator status, agent health, and process information
 */
router.get('/health/:farmId',
  apiRateLimits.read,
  async (req: Request, res: Response) => {
    try {
      const { farmId } = req.params;

      // Get health summary from orchestrator monitor
      const healthSummary = await orchestratorHealthMonitor.getHealthStatus(farmId);

      if (!healthSummary) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'HEALTH_NOT_FOUND',
            message: `No health data available for farm ${farmId}. Orchestrator may not be running or monitoring not started.`
          }
        });
      }

      // Get orchestrator status files
      const coordinationDir = path.join(pathConfig.getPath('MAIBARN_ROOT'), 'coordination');

      // Read orchestrator status
      let orchestratorStatus = null;
      try {
        const statusPath = path.join(coordinationDir, `orchestrator_status_${farmId}.json`);
        const statusContent = await fs.readFile(statusPath, 'utf-8');
        orchestratorStatus = JSON.parse(statusContent);
      } catch (error: any) {
        logger.debug(LogCategory.FARM, 'Could not read orchestrator status', { farmId, error: error.message });
      }

      // Read orchestrator heartbeat
      let orchestratorHeartbeat = null;
      try {
        const heartbeatPath = path.join(coordinationDir, 'orchestrator_heartbeat.json');
        const heartbeatContent = await fs.readFile(heartbeatPath, 'utf-8');
        const heartbeat = JSON.parse(heartbeatContent);
        if (heartbeat.farm_id === farmId) {
          orchestratorHeartbeat = heartbeat;
        }
      } catch (error: any) {
        logger.debug(LogCategory.FARM, 'Could not read orchestrator heartbeat', { farmId, error: error.message });
      }

      // Calculate health metrics
      const healthyAgents = healthSummary.agents.filter(a => a.status === 'healthy').length;
      const degradedAgents = healthSummary.agents.filter(a => ['warning', 'stuck'].includes(a.status)).length;
      const failedAgents = healthSummary.agents.filter(a => ['error', 'dead'].includes(a.status)).length;
      const completedAgents = healthSummary.agents.filter(a => a.status === 'completed').length;

      // Check orchestrator responsiveness
      let orchestratorResponsive = false;
      let lastHeartbeatAge = null;
      if (orchestratorHeartbeat) {
        lastHeartbeatAge = Date.now() - new Date(orchestratorHeartbeat.last_heartbeat).getTime();
        orchestratorResponsive = lastHeartbeatAge < 60000; // 1 minute threshold
      }

      res.json({
        success: true,
        data: {
          farmId,
          timestamp: new Date().toISOString(),
          orchestrator: {
            status: orchestratorStatus?.status || 'unknown',
            responsive: orchestratorResponsive,
            pid: orchestratorHeartbeat?.pid || orchestratorStatus?.orchestratorPid,
            lastHeartbeat: orchestratorHeartbeat?.last_heartbeat,
            lastHeartbeatAge,
            sessionName: healthSummary.session_name,
            panesCreated: orchestratorStatus?.panesCreated,
            panesReady: orchestratorStatus?.panesReady
          },
          health: {
            overall: healthSummary.overall_status,
            totalAgents: healthSummary.total_agents,
            healthy: healthyAgents,
            degraded: degradedAgents,
            failed: failedAgents,
            completed: completedAgents
          },
          agents: healthSummary.agents
        }
      });

    } catch (error: any) {
      logger.error(LogCategory.FARM, 'Failed to get orchestrator health', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: error.message || 'Failed to retrieve orchestrator health'
        }
      });
    }
  }
);

/**
 * Get orchestrator status file for a farm
 * Returns raw orchestrator status from Python orchestrator
 */
router.get('/status/:farmId',
  apiRateLimits.read,
  async (req: Request, res: Response) => {
    try {
      const { farmId } = req.params;
      const coordinationDir = path.join(pathConfig.getPath('MAIBARN_ROOT'), 'coordination');
      const statusPath = path.join(coordinationDir, `orchestrator_status_${farmId}.json`);

      try {
        const content = await fs.readFile(statusPath, 'utf-8');
        const status = JSON.parse(content);

        res.json({
          success: true,
          data: status
        });
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          return res.status(404).json({
            success: false,
            error: {
              code: 'STATUS_NOT_FOUND',
              message: `No status file found for farm ${farmId}`
            }
          });
        }
        throw error;
      }
    } catch (error: any) {
      logger.error(LogCategory.FARM, 'Failed to get orchestrator status', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'STATUS_FETCH_FAILED',
          message: error.message || 'Failed to retrieve orchestrator status'
        }
      });
    }
  }
);

/**
 * Get individual agent health for a specific agent
 */
router.get('/health/:farmId/agent/:agentId',
  apiRateLimits.read,
  async (req: Request, res: Response) => {
    try {
      const { farmId, agentId } = req.params;
      const coordinationDir = path.join(pathConfig.getPath('MAIBARN_ROOT'), 'coordination');
      const healthPath = path.join(coordinationDir, `agent_${agentId}_health.json`);

      try {
        const content = await fs.readFile(healthPath, 'utf-8');
        const health = JSON.parse(content);

        if (health.farm_id !== farmId) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'AGENT_NOT_FOUND',
              message: `Agent ${agentId} not found in farm ${farmId}`
            }
          });
        }

        res.json({
          success: true,
          data: health
        });
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          return res.status(404).json({
            success: false,
            error: {
              code: 'AGENT_HEALTH_NOT_FOUND',
              message: `No health data found for agent ${agentId} in farm ${farmId}`
            }
          });
        }
        throw error;
      }
    } catch (error: any) {
      logger.error(LogCategory.FARM, 'Failed to get agent health', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'AGENT_HEALTH_FETCH_FAILED',
          message: error.message || 'Failed to retrieve agent health'
        }
      });
    }
  }
);

/**
 * Get all monitored farms and their basic health status
 */
router.get('/health',
  apiRateLimits.read,
  async (req: Request, res: Response) => {
    try {
      const monitoredFarms = orchestratorHealthMonitor.getMonitoredFarms();

      const farmsHealth = await Promise.all(
        monitoredFarms.map(async (farmId) => {
          const health = await orchestratorHealthMonitor.getHealthStatus(farmId);
          if (!health) {
            return {
              farmId,
              status: 'unknown',
              monitored: true,
              dataAvailable: false
            };
          }

          const healthyAgents = health.agents.filter(a => a.status === 'healthy').length;
          const failedAgents = health.agents.filter(a => ['error', 'dead'].includes(a.status)).length;

          return {
            farmId,
            sessionName: health.session_name,
            status: health.overall_status,
            totalAgents: health.total_agents,
            healthyAgents,
            failedAgents,
            lastUpdate: health.timestamp,
            monitored: true,
            dataAvailable: true
          };
        })
      );

      res.json({
        success: true,
        data: {
          monitoredFarms: farmsHealth.length,
          farms: farmsHealth,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error: any) {
      logger.error(LogCategory.FARM, 'Failed to get monitored farms health', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'HEALTH_SUMMARY_FAILED',
          message: error.message || 'Failed to retrieve health summary'
        }
      });
    }
  }
);

/**
 * Request recovery for a farm's orchestrator
 * Useful when orchestrator is stuck or unresponsive
 */
router.post('/recover/:farmId',
  apiRateLimits.write,
  async (req: Request, res: Response) => {
    try {
      const { farmId } = req.params;
      const { reason = 'Manual recovery requested' } = req.body;

      logger.warn(LogCategory.FARM, `Orchestrator recovery requested for farm ${farmId}`, { reason });

      // Check current health
      const health = await orchestratorHealthMonitor.getHealthStatus(farmId);

      if (!health) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'FARM_NOT_MONITORED',
            message: `Farm ${farmId} is not currently monitored`
          }
        });
      }

      // Write recovery request file
      const coordinationDir = path.join(pathConfig.getPath('MAIBARN_ROOT'), 'coordination');
      const recoveryPath = path.join(coordinationDir, `recovery_request_${farmId}.json`);

      await fs.writeFile(recoveryPath, JSON.stringify({
        farmId,
        reason,
        requestedAt: new Date().toISOString(),
        currentHealth: health.overall_status,
        failedAgents: health.agents.filter(a => ['error', 'dead'].includes(a.status)).length
      }, null, 2));

      // Emit recovery event
      websocketManager.broadcastToFarm(farmId, 'orchestrator:recovery:requested', {
        farmId,
        reason,
        timestamp: new Date()
      });

      res.json({
        success: true,
        data: {
          farmId,
          reason,
          status: 'recovery_requested',
          timestamp: new Date().toISOString()
        }
      });

    } catch (error: any) {
      logger.error(LogCategory.FARM, 'Failed to request orchestrator recovery', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'RECOVERY_REQUEST_FAILED',
          message: error.message || 'Failed to request orchestrator recovery'
        }
      });
    }
  }
);

/**
 * Get orchestrator heartbeat for a farm
 * Shows last heartbeat time and orchestrator process status
 */
router.get('/heartbeat/:farmId',
  apiRateLimits.read,
  async (req: Request, res: Response) => {
    try {
      const { farmId } = req.params;
      const coordinationDir = path.join(pathConfig.getPath('MAIBARN_ROOT'), 'coordination');
      const heartbeatPath = path.join(coordinationDir, 'orchestrator_heartbeat.json');

      try {
        const content = await fs.readFile(heartbeatPath, 'utf-8');
        const heartbeat = JSON.parse(content);

        if (heartbeat.farm_id !== farmId) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'HEARTBEAT_NOT_FOUND',
              message: `No heartbeat found for farm ${farmId}`
            }
          });
        }

        const age = Date.now() - new Date(heartbeat.last_heartbeat).getTime();
        const isAlive = age < 60000; // 1 minute threshold

        res.json({
          success: true,
          data: {
            ...heartbeat,
            age,
            isAlive,
            ageSeconds: Math.floor(age / 1000)
          }
        });
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          return res.status(404).json({
            success: false,
            error: {
              code: 'HEARTBEAT_NOT_FOUND',
              message: `No heartbeat file found`
            }
          });
        }
        throw error;
      }
    } catch (error: any) {
      logger.error(LogCategory.FARM, 'Failed to get orchestrator heartbeat', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'HEARTBEAT_FETCH_FAILED',
          message: error.message || 'Failed to retrieve orchestrator heartbeat'
        }
      });
    }
  }
);

// Make WebSocket server globally available
declare global {
  var wsServer: any;
}

export default router;