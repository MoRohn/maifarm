import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as yaml from 'js-yaml';
import { websocketManager } from '../websocket/websocketManager';
import { aiProviderManager, AIProvider } from '../config/aiProviders';
import { pathConfig } from '../config/paths';
import { fileManager } from './fileManagerService';
import { workspaceManager } from './workspaceManager';
import { taskCountService } from './taskCountService';
import { tmuxHealthManager, TmuxSessionHealth } from './tmuxHealthManager';
import { MAIFARM_SESSION_PATTERNS } from './maibarn';
// Disabled advanced AI features for testing - these can be re-enabled later
// import { neuralMeshNetwork } from './neuralMeshNetwork';
// import { collectiveMemory } from './collectiveMemory';
// import { strategyEvolution } from './strategyEvolution';
import { agentCleanupService } from './agentCleanupService';
import { barnCatalogService } from './barnCatalogService';
import { db } from '../database/connection';
import { getFarmAgentName, formatFarmAgentNameNoEmoji } from '../utils/farmAgentNames';
import { harvestSessionCache } from './harvestSessionCache';
import { harvestSessionBroadcaster } from './harvestSessionBroadcaster';

interface AgentTerminalData {
  agentId: number;
  content: string;
  timestamp: Date;
  type: 'stdout' | 'stderr' | 'command';
}

interface FarmProcess {
  id: string;
  farmId: string;
  process: ChildProcess;
  agents: Map<number, AgentInfo>;
  tmuxSession: string;
  status: 'launching' | 'active' | 'stopping' | 'stopped' | 'error';
  startTime: Date;
  terminalBuffers: Map<number, string[]>;
}

interface AgentInfo {
  id: number;
  paneId: string;
  status: 'starting' | 'ready' | 'working' | 'idle' | 'error';
  uid?: string;
}

interface LaunchOptions {
  farmId: string;
  name: string;
  description: string;
  numberOfAgents: number;
  prompt: string;
  yamlContent?: string;
  steps?: string[];
  collaborative?: boolean;
  bundleSteps?: number;
  attachments?: Array<{
    path: string;
    type: 'image' | 'file';
    mimeType?: string;
  }>;
  workingDirectory?: string;
  workspaceTemplate?: string; // Template for isolated workspace
  contextFiles?: string[];  // Add context files support
  staggerDelay?: number;    // Delay between agent launches
  debug?: boolean;          // Enable debug mode
  provider?: 'claude' | 'qwen' | 'openai';  // AI provider selection
  farmerTemplateId?: string;     // Farmer template identifier
  farmerTemplateName?: string;   // Farmer template name for tracking
  barnReferences?: string[]; // References to barn items (@barn:item-id)
  includeBarnCatalog?: boolean; // Include barn catalog in agent context
  timeout?: number;              // Execution timeout in milliseconds (default 300000 - 5 minutes)
}

class OrchestratorService extends EventEmitter {
  private farmProcesses: Map<string, FarmProcess> = new Map();
  private readonly ORCHESTRATOR_PATH = path.join(process.cwd(), 'orchestrator.py');
  private readonly COORDINATION_PATH: string;
  private readonly BUFFER_LIMIT = 1000; // Lines per agent
  private sessionCheckInterval: ReturnType<typeof setInterval> | null = null;
  private executionTimeouts: Map<string, NodeJS.Timeout> = new Map(); // Track execution timeouts
  private lastHealthBroadcast: Map<string, number> = new Map(); // Track last health broadcast times
  private sessionRecoveryAttempts: Map<string, number> = new Map(); // Track recovery attempts
  private sessionLastSeen: Map<string, number> = new Map(); // Track when sessions were last seen
  private readonly SESSION_GRACE_PERIOD = 15000; // 15 seconds grace before marking as stopped
  private readonly MAX_RECOVERY_ATTEMPTS = 3;
  private paths = pathConfig.getPaths();

  constructor() {
    super();
    // Use centralized coordination path from config
    this.COORDINATION_PATH = this.paths.COORDINATION_DIR;
    this.setupCoordinationWatcher();
    this.startSessionMonitoring();
    this.startConsciousnessMonitoring();
    
    // Start periodic reconciliation for stability
    this.startPeriodicReconciliation();
    
    // Setup health monitoring event handlers
    this.setupHealthMonitoringHandlers();
    
    // Set WebSocket manager for neural mesh network
    // neuralMeshNetwork.setWebSocketManager(websocketManager as any);
  }

  /**
   * Start periodic reconciliation of farm states
   */
  private startPeriodicReconciliation(): void {
    // Run reconciliation every 2 minutes
    setInterval(async () => {
      try {
        const results = await this.reconcileFarmStates();
        
        if (results.recovered > 0 || results.cleaned > 0 || results.issues.length > 0) {
          console.log(`[Orchestrator] Reconciliation results:`, results);
          
          // Broadcast reconciliation results
          websocketManager.broadcast('system:reconciliation', {
            timestamp: new Date(),
            results
          });
        }
        
      } catch (error) {
        console.error('[Orchestrator] Periodic reconciliation failed:', error);
      }
    }, 120000); // 2 minutes
    
    console.log('[Orchestrator] Started periodic reconciliation (every 2 minutes)');
  }

  /**
   * Setup health monitoring event handlers
   */
  private setupHealthMonitoringHandlers(): void {
    // Listen for session health status changes
    tmuxHealthManager.on('session:status_changed', (event) => {
      const { sessionName, previousStatus, currentStatus, health } = event;
      
      console.log(`[Orchestrator] Health status changed for session ${sessionName}: ${previousStatus} → ${currentStatus}`);
      
      // Find the farm associated with this session
      const farmProcess = Array.from(this.farmProcesses.values())
        .find(fp => fp.tmuxSession === sessionName);
      
      if (farmProcess) {
        // Update farm status based on health
        if (currentStatus === 'dead' || currentStatus === 'critical') {
          // Mark farm as disconnected but don't stop it yet - let reconciliation handle recovery
          websocketManager.broadcast('farm:health', {
            farmId: farmProcess.farmId,
            processId: farmProcess.id,
            sessionName,
            healthStatus: currentStatus,
            responsiveAgents: health.responsivePanes,
            totalAgents: health.paneCount,
            issues: health.issues,
            timestamp: new Date()
          });
          
          // If session is completely dead, try recovery
          if (currentStatus === 'dead') {
            this.attemptSessionRecovery(farmProcess, sessionName);
          }
        } else if (currentStatus === 'degraded') {
          // Some agents are unresponsive - attempt agent revival
          this.attemptAgentRevival(farmProcess, sessionName, health);
        }
      }
    });
    
    // Listen for health updates to broadcast real-time metrics
    tmuxHealthManager.on('session:health_update', (event) => {
      const { sessionName, health } = event;
      
      const farmProcess = Array.from(this.farmProcesses.values())
        .find(fp => fp.tmuxSession === sessionName);
      
      if (farmProcess && health.status === 'healthy') {
        // Update agent status in farm process
        for (let i = 0; i < health.paneCount; i++) {
          const agent = farmProcess.agents.get(i);
          if (agent) {
            agent.status = 'ready';
          }
        }
        
        // Broadcast healthy status less frequently to avoid spam
        const now = Date.now();
        const lastBroadcast = this.lastHealthBroadcast.get(sessionName) || 0;
        
        if (now - lastBroadcast > 30000) { // Only every 30 seconds for healthy status
          websocketManager.broadcast({
            type: 'farm:health',
            payload: {
              farmId: farmProcess.farmId,
              processId: farmProcess.processId,
              sessionName,
              healthStatus: health.status,
              responsiveAgents: health.responsivePanes,
              totalAgents: health.paneCount,
              uptime: health.uptime,
              timestamp: new Date()
            }
          });
          
          this.lastHealthBroadcast.set(sessionName, now);
        }
      }
    });
    
    console.log('[Orchestrator] Health monitoring handlers configured');
  }

  private async registerAgentsWithFarmManager(farmId: string, agentCount: number): Promise<void> {
    try {
      const { farmManager } = await import('./farmManager');
      const farm = await farmManager.getFarm(farmId, 'system');
      
      if (farm) {
        // Clear existing agents array and add new ones
        farm.agents = [];
        for (let i = 0; i < agentCount; i++) {
          const agentId = `agent-${farmId.substring(0, 8)}-${i}`;
          // Use farm animal names for GoWild agents
          const farmAgent = getFarmAgentName('explorer', i);
          const agentName = formatFarmAgentNameNoEmoji(farmAgent);
          
          farm.agents.push({
            id: agentId,
            name: agentName,
            status: 'active',
            role: 'explorer',
            capabilities: ['general'],
            currentTask: null,
            performance: {
              tasksCompleted: 0,  // Will be updated based on file count
              successRate: 100,
              avgResponseTime: 0
            }
          });
        }
        
        // Update farm metrics
        await farmManager.updateFarm(farmId, 'system', {
          agents: farm.agents,
          metrics: {
            ...farm.metrics,
            totalAgents: agentCount,
            activeAgents: agentCount
          }
        });
        
        // Broadcast agent count update
        const { websocketManager } = await import('../websocket/websocketManager');
        websocketManager.broadcast('farm:agents:registered', {
          farmId,
          agentCount,
          agents: farm.agents.map(a => ({ id: a.id, name: a.name, status: a.status })),
          timestamp: new Date()
        });
        
        console.log(`[Orchestrator] Registered ${agentCount} agents with farmManager for farm ${farmId}`);
      }
    } catch (error) {
      console.error(`[Orchestrator] Failed to register agents with farmManager:`, error);
    }
  }

  private async checkTmuxSession(sessionName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const checkProcess = spawn('tmux', ['has-session', '-t', sessionName]);
      checkProcess.on('exit', (code) => resolve(code === 0));
      // Add timeout to prevent hanging
      setTimeout(() => {
        checkProcess.kill();
        resolve(false);
      }, 5000);
    });
  }

  /**
   * Properly escape shell arguments for display/logging purposes
   * Note: This is for logging only - spawn() handles arguments correctly without escaping
   */
  private escapeShellArg(arg: string): string {
    // If argument contains spaces, quotes, or special characters, wrap in single quotes
    if (/[^\w\-./=]/.test(arg)) {
      return `'${arg.replace(/'/g, "'\"'\"'")}'`;
    }
    return arg;
  }
  
  /**
   * Verify tmux session exists and has the expected number of panes with retry logic
   */
  private async verifySessionWithRetry(sessionName: string, expectedPanes: number, maxRetries: number = 5): Promise<boolean> {
    console.log(`[Orchestrator] Verifying session ${sessionName} with ${expectedPanes} expected panes`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // First check if session exists
        const sessionExists = await this.checkTmuxSession(sessionName);
        if (!sessionExists) {
          console.log(`[Orchestrator] Session ${sessionName} not found on attempt ${attempt}`);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
            continue;
          }
          return false;
        }
        
        // Check pane count
        const paneCount = await this.getTmuxPaneCount(sessionName);
        console.log(`[Orchestrator] Session ${sessionName} has ${paneCount} panes (expected ${expectedPanes})`);
        
        if (paneCount >= expectedPanes) {
          console.log(`[Orchestrator] Session ${sessionName} verified successfully`);
          return true;
        }
        
        if (attempt < maxRetries) {
          console.log(`[Orchestrator] Pane count mismatch, retrying in ${attempt} seconds...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      } catch (error) {
        console.error(`[Orchestrator] Error verifying session on attempt ${attempt}:`, error);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    console.error(`[Orchestrator] Session verification failed after ${maxRetries} attempts`);
    return false;
  }

  private async setPaneTitles(sessionName: string, agentNames: string[], numberOfAgents: number): Promise<void> {
    try {
      // First, enable pane border status for the window
      await new Promise<void>((resolve) => {
        const setBorderStatus = spawn('tmux', [
          'set-option', '-w', '-t', `${sessionName}:agents`,
          'pane-border-status', 'top'
        ]);
        setBorderStatus.on('exit', () => resolve());
      });

      // Set the pane border format to show pane titles
      await new Promise<void>((resolve) => {
        const setBorderFormat = spawn('tmux', [
          'set-option', '-w', '-t', `${sessionName}:agents`,
          'pane-border-format', '#P #{pane_title}'
        ]);
        setBorderFormat.on('exit', () => resolve());
      });

      // Set individual pane titles
      for (let i = 0; i < numberOfAgents; i++) {
        const agentName = agentNames.length > i 
          ? agentNames[i] 
          : `Agent ${i + 1}`;
        
        await new Promise<void>((resolve) => {
          const setPaneTitle = spawn('tmux', [
            'select-pane', '-t', `${sessionName}:agents.${i}`,
            '-T', agentName
          ]);
          setPaneTitle.on('exit', () => resolve());
        });
      }

      console.log(`[Orchestrator] Set pane titles for ${numberOfAgents} agents in session ${sessionName}`);
    } catch (error) {
      console.error(`[Orchestrator] Failed to set pane titles:`, error);
      // Non-critical error, continue execution
    }
  }

  private async checkClaudeCLI(): Promise<boolean> {
    // In development mode or when BYPASS_AUTH is true, assume Claude is not available
    // This will use the Python orchestrator which actually works
    if (process.env.NODE_ENV === 'development' || process.env.BYPASS_AUTH === 'true') {
      console.log('[Orchestrator] Development mode - skipping Claude CLI check, will use Python orchestrator');
      return true; // Return true to use the Python orchestrator instead of mock
    }
    
    return new Promise((resolve) => {
      const checkProcess = spawn('which', ['claude']);
      checkProcess.on('exit', (code) => resolve(code === 0));
      // Timeout after 1 second
      setTimeout(() => {
        checkProcess.kill();
        resolve(false);
      }, 1000);
    });
  }

  private async getTmuxPaneCount(sessionName: string): Promise<number> {
    // Use standardized task counting from taskStandardService
    const { taskStandardService } = await import('./taskStandardService');
    return await taskStandardService.getAgentCount(sessionName);
  }

  /**
   * Reconcile farm processes with actual tmux session state
   * This method syncs the internal state with what's actually running
   */
  async reconcileFarmStates(): Promise<{
    reconciled: number;
    recovered: number;
    cleaned: number;
    issues: string[];
  }> {
    console.log('[Orchestrator] Starting farm state reconciliation');
    
    const results = {
      reconciled: 0,
      recovered: 0,
      cleaned: 0,
      issues: [] as string[]
    };
    
    try {
      // Step 1: Check all tracked farm processes against tmux sessions
      for (const [processId, farmProcess] of this.farmProcesses) {
        try {
          const sessionExists = await this.checkTmuxSession(farmProcess.tmuxSession);
          
          if (!sessionExists && farmProcess.status === 'active') {
            // Check if we should wait before marking as stopped
            const lastSeen = this.sessionLastSeen.get(farmProcess.tmuxSession) || Date.now();
            const timeSinceLastSeen = Date.now() - lastSeen;
            
            if (timeSinceLastSeen < this.SESSION_GRACE_PERIOD) {
              // Still within grace period, attempt recovery
              console.log(`[Orchestrator] Session ${farmProcess.tmuxSession} temporarily unavailable, waiting ${(this.SESSION_GRACE_PERIOD - timeSinceLastSeen) / 1000}s before marking as stopped`);
              
              // Attempt to recover the session
              const recoveryAttempts = this.sessionRecoveryAttempts.get(farmProcess.tmuxSession) || 0;
              if (recoveryAttempts < this.MAX_RECOVERY_ATTEMPTS) {
                this.sessionRecoveryAttempts.set(farmProcess.tmuxSession, recoveryAttempts + 1);
                console.log(`[Orchestrator] Attempting recovery ${recoveryAttempts + 1}/${this.MAX_RECOVERY_ATTEMPTS} for session ${farmProcess.tmuxSession}`);
                // Skip further processing for this session
                continue;
              }
            }
            
            // Grace period expired or max recovery attempts reached
            console.log(`[Orchestrator] Session ${farmProcess.tmuxSession} confirmed as dead after grace period, marking farm as completed`);
            
            farmProcess.status = 'completed';
            this.sessionRecoveryAttempts.delete(farmProcess.tmuxSession);
            this.sessionLastSeen.delete(farmProcess.tmuxSession);
            
            // Update database
            try {
              await db.query(
                'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
                ['completed', new Date(), farmProcess.farmId]
              );
            } catch (dbError) {
              results.issues.push(`Failed to update farm ${farmProcess.farmId} status in database: ${dbError}`);
            }
            
            // Broadcast status change
            websocketManager.broadcast({
              type: 'farm:status',
              payload: {
                farmId: farmProcess.farmId,
                status: 'stopped',
                reason: 'session_died'
              }
            });
            
            results.cleaned++;
          } else if (sessionExists) {
            // Session exists, update last seen time
            this.sessionLastSeen.set(farmProcess.tmuxSession, Date.now());
            this.sessionRecoveryAttempts.delete(farmProcess.tmuxSession); // Reset recovery attempts
            
            if (farmProcess.status === 'stopped') {
              // Session exists but we think it's stopped - attempt recovery
              console.log(`[Orchestrator] Session ${farmProcess.tmuxSession} exists but marked as stopped, attempting recovery`);
              
              const paneCount = await this.getTmuxPaneCount(farmProcess.tmuxSession);
              if (paneCount > 0) {
                // Start monitoring with health manager
                await tmuxHealthManager.startMonitoring(farmProcess.tmuxSession, paneCount);
                
                farmProcess.status = 'active';
                
                // Update database
                try {
                  await db.query(
                    'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
                    ['active', new Date(), farmProcess.farmId]
                  );
                } catch (dbError) {
                  results.issues.push(`Failed to update farm ${farmProcess.farmId} status in database: ${dbError}`);
                }
                
                // Broadcast recovery
                websocketManager.broadcast({
                  type: 'farm:recovered',
                  payload: {
                    farmId: farmProcess.farmId,
                    status: 'active',
                    paneCount,
                    sessionName: farmProcess.tmuxSession
                  }
                });
                
                results.recovered++;
              }
            }
          }
          
          results.reconciled++;
          
        } catch (error) {
          results.issues.push(`Error reconciling farm ${farmProcess.farmId}: ${error}`);
        }
      }
      
      // Step 2: Look for orphaned tmux sessions that we should be tracking
      await this.discoverOrphanedSessions(results);
      
    } catch (error) {
      console.error('[Orchestrator] Error during farm state reconciliation:', error);
      results.issues.push(`Reconciliation error: ${error}`);
    }
    
    console.log(`[Orchestrator] Reconciliation complete: ${results.reconciled} checked, ${results.recovered} recovered, ${results.cleaned} cleaned`);
    
    return results;
  }

  /**
   * Discover and potentially adopt orphaned tmux sessions
   */
  private async discoverOrphanedSessions(results: any): Promise<void> {
    try {
      // Get list of all tmux sessions
      const listProcess = spawn('tmux', ['list-sessions', '-F', '#{session_name}']);
      let output = '';
      
      listProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      listProcess.on('exit', async (code) => {
        if (code === 0) {
          const sessions = output.trim().split('\n').filter(line => line.trim());
          
          for (const sessionName of sessions) {
            // Check if this looks like a MaiFarm session using standard patterns
            const isMaiFarmSession = MAIFARM_SESSION_PATTERNS
              .some(pattern => sessionName.startsWith(pattern));
            
            if (isMaiFarmSession) {
              // See if we're already tracking it
              const isTracked = Array.from(this.farmProcesses.values())
                .some(fp => fp.tmuxSession === sessionName);
              
              if (!isTracked) {
                console.log(`[Orchestrator] Found orphaned session: ${sessionName}`);
                
                // Check if session is healthy
                const paneCount = await this.getTmuxPaneCount(sessionName);
                if (paneCount > 0) {
                  // This could be adopted, but for now just log it
                  console.log(`[Orchestrator] Orphaned session ${sessionName} has ${paneCount} panes - could be recovered`);
                  
                  // Start health monitoring for visibility
                  await tmuxHealthManager.startMonitoring(sessionName, paneCount);
                  
                  results.issues.push(`Orphaned session found: ${sessionName} (${paneCount} panes)`);
                }
              }
            }
          }
        }
      });
      
    } catch (error) {
      console.warn('[Orchestrator] Could not discover orphaned sessions:', error);
    }
  }

  /**
   * Get farm health status from tmux health manager
   */
  async getFarmHealth(farmId: string): Promise<TmuxSessionHealth | null> {
    const farmProcess = Array.from(this.farmProcesses.values())
      .find(fp => fp.farmId === farmId);
    
    if (!farmProcess) {
      return null;
    }
    
    return tmuxHealthManager.getSessionHealth(farmProcess.tmuxSession);
  }

  /**
   * Get standardized task metrics for a farm using tmux pane counting
   */
  async getStandardizedTaskMetrics(farmId: string): Promise<any> {
    const farmProcess = Array.from(this.farmProcesses.values())
      .find(fp => fp.farmId === farmId);
    
    if (!farmProcess) {
      return null;
    }

    try {
      const { taskStandardService } = await import('./taskStandardService');
      
      // Get real-time agent count from tmux
      const agentCount = await taskStandardService.getAgentCount(farmProcess.tmuxSession);
      
      // Get detailed agent info
      const agentDetails = await taskStandardService.getAgentDetails(farmProcess.tmuxSession);
      
      // Calculate standardized metrics
      const taskStandard = await taskStandardService.calculateTaskStandard({
        tmuxSession: farmProcess.tmuxSession,
        totalTasksAssigned: farmProcess.agents.size,
        completedTasks: Array.from(farmProcess.agents.values()).filter(a => a.status === 'completed').length,
        failedTasks: Array.from(farmProcess.agents.values()).filter(a => a.status === 'failed').length
      });

      return {
        farmId,
        processId: farmProcess.processId,
        tmuxSession: farmProcess.tmuxSession,
        realTimeAgentCount: agentCount,
        configuredAgentCount: farmProcess.numberOfAgents,
        agentDetails,
        taskStandard,
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error(`[Orchestrator] Error getting task metrics for farm ${farmId}:`, error);
      return null;
    }
  }

  private async getClaudeAgentId(sessionName: string, paneIndex: number): Promise<string | null> {
    return new Promise((resolve) => {
      // Capture first few lines to look for Claude agent ID
      const captureProcess = spawn('tmux', [
        'capture-pane',
        '-t', `${sessionName}:agents.${paneIndex}`,
        '-p',
        '-S', '0',
        '-E', '10'
      ]);
      
      let output = '';
      captureProcess.stdout?.on('data', (data) => { output += data.toString(); });
      captureProcess.on('exit', () => {
        // Look for Claude agent identifier in the output
        const match = output.match(/agent[_-]?\w+/i) || output.match(/claude.*agent/i);
        resolve(match ? match[0] : null);
      });
    });
  }

  private async createTrackingForExistingSession(
    processId: string,
    farmId: string,
    tmuxSession: string,
    expectedAgents: number
  ): Promise<FarmProcess> {
    const paneCount = await this.getTmuxPaneCount(tmuxSession);
    const agentCount = paneCount || expectedAgents;
    
    const farmProcess: FarmProcess = {
      id: processId,
      farmId,
      process: null as any, // No actual process for existing session
      agents: new Map(),
      tmuxSession,
      status: 'active',
      startTime: new Date(),
      terminalBuffers: new Map()
    };
    
    // Initialize agents based on panes
    for (let i = 0; i < agentCount; i++) {
      farmProcess.agents.set(i, {
        id: i,
        paneId: `${tmuxSession}:agents.${i}`,
        status: 'ready'
      });
      farmProcess.terminalBuffers.set(i, []);
    }
    
    // Register agents with farmManager
    await this.registerAgentsWithFarmManager(farmId, agentCount);
    
    return farmProcess;
  }

  private startSessionMonitoring() {
    // Periodically check for orphaned tmux sessions
    this.sessionCheckInterval = setInterval(async () => {
      for (const [processId, farmProcess] of this.farmProcesses.entries()) {
        if (farmProcess.tmuxSession) {
          const exists = await this.checkTmuxSession(farmProcess.tmuxSession);
          
          // Check if session exists and update status accordingly
          if (!exists && farmProcess.status === 'active') {
            // Session disappeared
            farmProcess.status = 'stopped';
            websocketManager.broadcast('farm:status', {
              farmId: farmProcess.farmId,
              processId,
              status: 'stopped'
            });
          } else if (exists && (farmProcess.status === 'launching' || farmProcess.status === 'stopped')) {
            // No delay needed - check immediately for faster response
            
            // Session exists but farm is still launching or was stopped
            const paneCount = await this.getTmuxPaneCount(farmProcess.tmuxSession);
            
            if (paneCount > 0) {
              // Update to running status
              farmProcess.status = 'active';
              
              // CRITICAL FIX: Update database status immediately
              try {
                await db.query(
                  'UPDATE farms SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                  ['active', farmProcess.farmId]
                );
                console.log(`[Orchestrator] FIXED: Updated database status to active for farm ${farmProcess.farmId}`);
              } catch (dbError) {
                console.error(`[Orchestrator] Failed to update database status for farm ${farmProcess.farmId}:`, dbError);
              }
              
              // Update agent tracking with actual panes
              farmProcess.agents.clear();
              for (let i = 0; i < paneCount; i++) {
                farmProcess.agents.set(i, {
                  id: i,
                  paneId: `${farmProcess.tmuxSession}:agents.${i}`,
                  status: 'ready'
                });
              }
              
              // Broadcast status update
              websocketManager.broadcast('farm:status', {
                farmId: farmProcess.farmId,
                processId,
                status: 'active',
                agentCount: paneCount
              });
              
              // Broadcast tmux ready event
              websocketManager.broadcast('farm:tmux:ready', {
                farmId: farmProcess.farmId,
                processId,
                sessionName: farmProcess.tmuxSession,
                paneCount,
                timestamp: new Date()
              });
              
              // Emit terminal session ready event
              websocketManager.broadcast('terminal:session', {
                type: 'session',
                action: 'ready',
                sessionId: farmProcess.tmuxSession,
                farmId: farmProcess.farmId,
                agentCount: paneCount,
                timestamp: new Date()
              });
              
              // Also emit orchestrator status
              websocketManager.broadcast('orchestrator:status', {
                farmId: farmProcess.farmId,
                processId,
                status: 'active',
                sessionName: farmProcess.tmuxSession,
                agents: paneCount
              });
              
              // Start health monitoring for this session
              await tmuxHealthManager.startMonitoring(farmProcess.tmuxSession, paneCount);
            }
          }
        }
      }
    }, 100); // Check every 100ms for ultra-fast detection
  }

  private async setupCoordinationWatcher() {
    // Watch the coordination directory for agent updates
    try {
      await fileManager.ensureDirectory(this.COORDINATION_PATH);
    } catch (error) {
      console.error('[Orchestrator] Failed to setup coordination directory:', error);
    }

    // Watch for changes in active_agents.json
    const activeAgentsPath = path.join(this.COORDINATION_PATH, 'active_agents.json');
    
    // Poll the file every 1 second for updates (faster response)
    setInterval(async () => {
      try {
        const content = await fs.readFile(activeAgentsPath, 'utf-8');
        const agents = JSON.parse(content);
        
        // Broadcast agent updates
        for (const [uid, agentData] of Object.entries(agents as any)) {
          const farmProcess = this.findFarmByAgentUid(uid);
          if (farmProcess) {
            websocketManager.broadcast('agent:updated', {
              farmId: farmProcess.farmId,
              agentUid: uid,
              ...agentData
            });
          }
        }
      } catch (error) {
        // File might not exist yet, ignore
      }
    }, 500); // Check every 500ms for faster agent updates
  }

  private findFarmByAgentUid(uid: string): FarmProcess | undefined {
    for (const farm of this.farmProcesses.values()) {
      for (const agent of farm.agents.values()) {
        if (agent.uid === uid) {
          return farm;
        }
      }
    }
    return undefined;
  }

  async launchFarm(options: LaunchOptions): Promise<string> {
    console.log(`[Orchestrator] Starting farm launch for ${options.farmId}`);
    console.log(`[Orchestrator] Launch options:`, {
      numberOfAgents: options.numberOfAgents,
      provider: options.provider || 'claude',
      collaborative: options.collaborative,
      timeout: options.timeout
    });
    
    // Validate that orchestrator.py exists
    try {
      await fs.access(this.ORCHESTRATOR_PATH);
      console.log(`[Orchestrator] Found orchestrator.py at ${this.ORCHESTRATOR_PATH}`);
    } catch (error) {
      console.error(`[Orchestrator] Script not found at ${this.ORCHESTRATOR_PATH}`);
      throw new Error(`Orchestrator script not found at ${this.ORCHESTRATOR_PATH}`);
    }
    
    const processId = uuidv4();
    // Use consistent naming: farm-<first-8-chars> or quick-<task-id> for quick tasks
    let tmuxSession: string;
    if (options.farmId.startsWith('quick-task-')) {
      // For quick tasks, use the task ID portion after 'quick-task-'
      const taskId = options.farmId.replace('quick-task-', '').substring(0, 8);
      tmuxSession = `quick_${taskId}`;
    } else {
      tmuxSession = `farm-${options.farmId.substring(0, 8)}`;
    }
    console.log(`[Orchestrator] Using tmux session name: ${tmuxSession}`);
    
    // CRITICAL: Register farm with cleanup service to prevent premature cleanup
    agentCleanupService.registerActiveFarm(options.farmId);
    console.log(`[Orchestrator] CRITICAL: Farm ${options.farmId} registered as active - protected from cleanup`);

    // Check if session already exists and is running
    const sessionExists = await this.checkTmuxSession(tmuxSession);
    if (sessionExists) {
      console.log(`[Orchestrator] WARNING: Session ${tmuxSession} already exists - this could indicate a bug or race condition!`);
      console.log(`[Orchestrator] Proceeding to reuse existing session ${tmuxSession} for farm ${options.farmId}`);
      // Create tracking for existing session
      const farmProcess = await this.createTrackingForExistingSession(
        processId,
        options.farmId,
        tmuxSession,
        options.numberOfAgents
      );
      this.farmProcesses.set(processId, farmProcess);
      
      // Get actual pane count
      const paneCount = await this.getTmuxPaneCount(tmuxSession);
      
      // Broadcast that we're using an existing session
      websocketManager.broadcast('farm:launched', {
        farmId: options.farmId,
        processId,
        tmuxSession,
        agentCount: paneCount || options.numberOfAgents,
        timestamp: new Date(),
        existingSession: true
      });
      
      // Start health monitoring for existing session
      console.log(`[Orchestrator] Starting health monitoring for existing session: ${tmuxSession}`);
      await tmuxHealthManager.startMonitoring(tmuxSession, paneCount || options.numberOfAgents);
      
      // Also broadcast tmux ready immediately since session exists
      websocketManager.broadcast('farm:tmux:ready', {
        farmId: options.farmId,
        processId,
        sessionName: tmuxSession,
        agentCount: paneCount || options.numberOfAgents,
        healthMonitoring: true,
        existingSession: true
      });
      
      // Import and start terminal output monitoring
      const { terminalOutputWatcher } = await import('./terminalOutputWatcher');
      await terminalOutputWatcher.startWatching(tmuxSession, options.farmId, paneCount || options.numberOfAgents);
      console.log(`[Orchestrator] Started terminal output watcher for existing session: ${tmuxSession}`);
      
      // Start monitoring immediately
      this.startTerminalMonitoring(processId);
      
      return processId;
    }

    // First, clean up any existing session with the same name
    try {
      await new Promise((resolve) => {
        const killProcess = spawn('tmux', ['kill-session', '-t', tmuxSession]);
        killProcess.on('exit', () => resolve(null));
        setTimeout(() => resolve(null), 1000); // Timeout after 1 second
      });
    } catch (error) {
      // Ignore errors - session might not exist
    }

    // Parse agent names from YAML if provided
    let agentNames: string[] = [];
    
    // Start parallel operations for faster launch
    const parallelOps: Promise<any>[] = [];
    
    // Operation 1: Create workspace (in parallel)
    const workspacePromise = workspaceManager.createFarmWorkspace(options.farmId, {
      template: options.workspaceTemplate || 'default',
      metadata: {
        name: options.name,
        description: options.description,
        agentCount: options.numberOfAgents
      }
    });
    parallelOps.push(workspacePromise);
    
    // Operation 2: Process YAML and create prompt file (in parallel)
    let promptFilePath: string | undefined;
    let yamlProcessPromise: Promise<void> | undefined;
    
    if (options.yamlContent) {
      promptFilePath = pathConfig.getFarmCoordinationPath(options.farmId);
      
      yamlProcessPromise = (async () => {
        let yamlContent = options.yamlContent!;
        
        // Parse YAML to extract agent names
        try {
          const yamlParsed = yaml.load(yamlContent) as any;
          if (yamlParsed && yamlParsed.agents && Array.isArray(yamlParsed.agents)) {
            agentNames = yamlParsed.agents.map((agent: any) => agent.name || `Agent ${yamlParsed.agents.indexOf(agent) + 1}`);
            console.log(`[Orchestrator] Extracted agent names from YAML:`, agentNames);
          }
        } catch (yamlError) {
          console.warn(`[Orchestrator] Failed to parse YAML for agent names:`, yamlError);
        }
        
        // Process barn references in YAML
        if (options.barnReferences && options.barnReferences.length > 0) {
          yamlContent = await this.processBarnReferences(yamlContent, options.barnReferences, options.farmId);
        }
        
        // Add barn catalog to YAML if requested
        if (options.includeBarnCatalog) {
          const catalogText = await barnCatalogService.generateCatalogForFarm(options.farmId, {
            includeYaml: false,
            maxItems: 10,
            types: ['app', 'tool', 'script', 'workflow']
          });
          yamlContent += '\n\n# Available Barn Items\n' + catalogText;
        }
        
        await fs.writeFile(promptFilePath, yamlContent);
      })();
      
      parallelOps.push(yamlProcessPromise);
    }
    
    // Wait for all parallel operations to complete
    const [workspace] = await Promise.all([workspacePromise, ...(yamlProcessPromise ? [yamlProcessPromise] : [])]);
    
    console.log(`[Orchestrator] Created isolated workspace at ${workspace.path}`);
    
    // Build command arguments with workspace isolation
    const args: string[] = [
      this.ORCHESTRATOR_PATH,
      '--num-agents', options.numberOfAgents.toString(),
      '--session', tmuxSession,
      '--farm-id', options.farmId,  // Pass farm ID to Python script
      '--workspace-dir', workspace.path  // Pass isolated workspace path
    ];
    
    // Add harvest ID if provided
    if ((options as any).harvestId) {
      args.push('--harvest-id', (options as any).harvestId);
    }

    if (promptFilePath) {
      args.push('--prompt-file', promptFilePath);
    } else {
      args.push('--prompt', options.prompt);
    }
    
    // Add barn catalog to prompt if no YAML but catalog requested
    if (!options.yamlContent && options.includeBarnCatalog) {
      const catalogText = await barnCatalogService.generateCatalogForFarm(options.farmId, {
        includeYaml: false,
        maxItems: 10
      });
      // Append catalog to prompt - find the prompt argument and replace it
      const promptIndex = args.findIndex((arg, index) => 
        index > 0 && args[index - 1] === '--prompt'
      );
      if (promptIndex !== -1) {
        const enhancedPrompt = `${args[promptIndex]}\n\n${catalogText}`;
        args[promptIndex] = enhancedPrompt;
      }
    }
    
    // Create properly escaped command for logging
    const escapedArgs = args.map(arg => this.escapeShellArg(arg));
    console.log(`[Orchestrator] Launch command: python3 ${escapedArgs.join(' ')}`);
    console.log(`[Orchestrator] Number of agents: ${options.numberOfAgents}`);

    if (options.steps && options.steps.length > 0) {
      // Convert step objects to strings if necessary
      const stepStrings = options.steps.map(step => 
        typeof step === 'string' ? step : (step.content || step.toString())
      );
      args.push('--steps', ...stepStrings);
    }

    if (options.collaborative) {
      args.push('--collaborative');
    }

    if (options.bundleSteps) {
      args.push('--bundle-steps', options.bundleSteps.toString());
    }

    if (options.contextFiles && options.contextFiles.length > 0) {
      args.push('--context-files', ...options.contextFiles);
    }

    if (options.staggerDelay) {
      args.push('--stagger', options.staggerDelay.toString());
    }

    // Keep tmux session alive for monitoring
    args.push('--no-kill-on-exit');
    
    // Only set max runtime if timeout is explicitly specified
    if (options.timeout && options.timeout > 0) {
      const maxRuntime = Math.floor(options.timeout / 1000);
      args.push('--max-runtime', maxRuntime.toString());
      console.log(`[Orchestrator] Setting max runtime to ${maxRuntime} seconds`);
    } else {
      console.log(`[Orchestrator] No max runtime set - farm will run indefinitely`);
    }
    
    // Enable debug mode for better error tracking
    if (options.debug || process.env.NODE_ENV === 'development') {
      args.push('--debug');
    }
    
    // Add fast-launch flag for optimized startup
    args.push('--fast-launch');

    // Get provider configuration
    const selectedProvider = options.provider || aiProviderManager.getDefaultProvider();
    const providerConfig = aiProviderManager.getProvider(selectedProvider as AIProvider);
    
    // Check if provider is enabled
    if (!aiProviderManager.isProviderEnabled(selectedProvider as AIProvider)) {
      throw new Error(`AI provider ${selectedProvider} is not enabled or configured`);
    }
    
    // Add provider flag if specified
    if (options.provider) {
      args.push('--provider', options.provider);
    }

    // Create properly escaped command for logging
    const escapedArgs = args.map(arg => this.escapeShellArg(arg));
    console.log(`[Orchestrator] Launching with command: python3 ${escapedArgs.join(' ')} [Provider: ${selectedProvider}]`);
    
    // Get provider-specific environment variables
    const providerEnv = aiProviderManager.getProviderEnvironment(selectedProvider as AIProvider);
    
    // Check if Claude CLI is available
    const claudeAvailable = await this.checkClaudeCLI();
    
    // Launch the orchestrator.py process with maibarn workspace
    // Create a dedicated workspace for this farm
    const farmWorkspace = pathConfig.getFarmWorkspacePath(options.farmId, false);
    await fileManager.ensureDirectory(farmWorkspace);
    
    // Proactive session mapping - Map the session BEFORE launching orchestrator
    // This ensures the frontend can immediately find the session
    console.log(`[Orchestrator] Proactively mapping farm ${options.farmId} to session ${tmuxSession}`);
    try {
      await harvestSessionCache.mapFarmToSession(options.farmId, tmuxSession);
      
      // Create a placeholder session entry so it appears immediately in UI
      await harvestSessionCache.createSessionEntry(tmuxSession, {
        farmId: options.farmId,
        paneCount: options.numberOfAgents,
        status: 'launching',
        createdAt: new Date()
      });
      
      // Broadcast session prepared event so frontend knows to expect it
      websocketManager.broadcast('session:prepared', {
        farmId: options.farmId,
        sessionName: tmuxSession,
        agentCount: options.numberOfAgents,
        status: 'launching',
        timestamp: new Date()
      });
      
      console.log(`[Orchestrator] Session pre-mapped and broadcast for immediate UI availability`);
    } catch (cacheError) {
      console.warn(`[Orchestrator] Failed to pre-map session, will retry after launch:`, cacheError);
    }
    
    let childProcess: any;
    
    if (!claudeAvailable) {
      console.warn('[Orchestrator] Claude CLI not found, using mock agent');
      
      // Use mock agent script for development/testing
      const mockScriptPath = path.join(process.cwd(), 'scripts', 'mock-claude-agent.sh');
      childProcess = spawn('bash', [mockScriptPath], {
        cwd: farmWorkspace,
        env: { 
          ...providerEnv,
          FARM_ID: options.farmId,
          AGENT_COUNT: options.numberOfAgents.toString()
        },
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      // Immediately create mock tmux session for UI consistency
      setTimeout(async () => {
        console.log('[Orchestrator] Creating mock tmux session for UI');
        try {
          // First ensure tmux server is running
          const checkServer = spawn('tmux', ['list-sessions']);
          const serverRunning = await new Promise<boolean>(resolve => {
            checkServer.on('exit', (code) => resolve(code === 0 || code === 1));
            checkServer.on('error', () => resolve(false));
          });
          
          if (!serverRunning) {
            console.log('[Orchestrator] Starting tmux server first...');
            const startServer = spawn('tmux', ['new-session', '-d', '-s', 'maifarm-keepalive']);
            await new Promise(resolve => {
              startServer.on('exit', () => resolve(null));
              setTimeout(() => resolve(null), 500);
            });
          }
          
          // Now create the actual mock session with proper window
          await new Promise((resolve, reject) => {
            const tmuxCreate = spawn('tmux', ['new-session', '-d', '-s', tmuxSession, '-n', 'agents']);
            tmuxCreate.on('exit', async (code) => {
              if (code === 0) {
                console.log(`[Orchestrator] Created mock tmux session: ${tmuxSession}`);
                // Map farm to session in cache
                try {
                  await harvestSessionCache.mapFarmToSession(options.farmId, tmuxSession);
                  console.log(`[Orchestrator] Mapped farm ${options.farmId} to session ${tmuxSession}`);
                  
                  // Broadcast session creation
                  harvestSessionBroadcaster.broadcastSessionCreated(options.farmId, tmuxSession, options.numberOfAgents);
                } catch (cacheError) {
                  console.warn(`[Orchestrator] Failed to cache session mapping:`, cacheError);
                }
                resolve(null);
              } else {
                reject(new Error(`Failed to create tmux session: ${code}`));
              }
            });
            tmuxCreate.on('error', (err) => reject(err));
          });
          
          // Create additional panes for multi-agent mock
          for (let i = 1; i < options.numberOfAgents; i++) {
            await new Promise((resolve) => {
              const splitPane = spawn('tmux', ['split-window', '-t', `${tmuxSession}:agents`]);
              splitPane.on('exit', () => resolve(null));
              setTimeout(() => resolve(null), 100);
            });
          }
          
          // Tile the layout
          await new Promise((resolve) => {
            const tileLayout = spawn('tmux', ['select-layout', '-t', `${tmuxSession}:agents`, 'tiled']);
            tileLayout.on('exit', () => resolve(null));
            setTimeout(() => resolve(null), 100);
          });
          
          // Set pane titles for mock agents
          await this.setPaneTitles(tmuxSession, agentNames, options.numberOfAgents);
          
          console.log(`[Orchestrator] Mock tmux session ${tmuxSession} ready with ${options.numberOfAgents} panes`);
        } catch (err) {
          console.error('[Orchestrator] Failed to create mock tmux session:', err);
        }
      }, 1000);
    } else {
      childProcess = spawn('python3', args, {
        cwd: farmWorkspace,  // Use the isolated farm workspace
        env: { 
          ...providerEnv,
          PYTHONUNBUFFERED: '1',  // Ensure Python output is not buffered
          MAIFARM_WORKSPACE: farmWorkspace,  // Pass workspace to Python script
          MAIBARN_ROOT: pathConfig.getPath('MAIBARN_ROOT')  // Pass maibarn root
        },
        detached: false,  // Keep attached to parent process
        stdio: ['ignore', 'pipe', 'pipe']  // Capture stdout and stderr
      });
    }

    // Create farm process tracking (must be created before using in timeout)
    // Use optimistic 'active' status for immediate UI feedback
    const farmProcess: FarmProcess = {
      id: processId,
      farmId: options.farmId,
      process: childProcess,
      agents: new Map(),
      tmuxSession,
      status: 'active', // Optimistically set to active for instant UI response
      startTime: new Date(),
      terminalBuffers: new Map()
    };

    // Initialize agent tracking and prepare batch insert
    const agentInsertValues: any[] = [];
    const now = new Date();
    
    for (let i = 0; i < options.numberOfAgents; i++) {
      const agentId = `${options.farmId}-agent-${i}`;
      const agentDbId = uuidv4();
      
      farmProcess.agents.set(i, {
        id: i,
        paneId: `${tmuxSession}:agents.${i}`,  // orchestrator.py creates 'agents' window
        status: 'starting',
        uid: agentId
      });
      farmProcess.terminalBuffers.set(i, []);
      
      // Use the agent name from YAML if available, otherwise fall back to generic name
      const agentName = agentNames.length > i 
        ? agentNames[i] 
        : `${options.name || 'Farm'} Agent ${i + 1} (${selectedProvider})`;
      
      // Prepare values for batch insert
      agentInsertValues.push([
        agentDbId,
        options.farmId,
        agentName,
        options.type || 'standard',
        'launching',
        JSON.stringify(['text-generation', 'code-execution', 'file-operations', 'collaboration']),
        JSON.stringify({ cpu: 2, memory: 2048 }),
        JSON.stringify({ tasksCompleted: 0, avgResponseTime: 0 }),
        JSON.stringify({ 
          provider: selectedProvider,
          tmuxSession,
          paneId: `${tmuxSession}:agents.${i}`,
          agentIndex: i,
          uid: agentId
        }),
        now,
        now,
        now
      ]);
    }
    
    // Batch insert all agents in a single query for better performance
    if (agentInsertValues.length > 0) {
      try {
        const placeholders = agentInsertValues.map((_, idx) => {
          const base = idx * 12;
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12})`;
        }).join(', ');
        
        const flatValues = agentInsertValues.flat();
        
        await db.query(
          `INSERT INTO agents (id, farm_id, name, type, status, capabilities, resources, metrics, config, last_heartbeat, created_at, updated_at)
           VALUES ${placeholders}
           ON CONFLICT (id) DO UPDATE SET 
           status = EXCLUDED.status,
           last_heartbeat = EXCLUDED.last_heartbeat,
           updated_at = EXCLUDED.updated_at`,
          flatValues
        );
        
        console.log(`[Orchestrator] Batch registered ${agentInsertValues.length} agents in database for farm ${options.farmId}`);
      } catch (dbError) {
        console.error(`[Orchestrator] Failed to batch register agents in database:`, dbError);
        // Continue even if database registration fails
      }
    }

    this.farmProcesses.set(processId, farmProcess);
    
    // Register session with lifecycle manager for comprehensive tracking
    try {
      const { farmLifecycleManager } = await import('./farmLifecycleManager');
      await farmLifecycleManager.registerSession(
        options.farmId, 
        tmuxSession,
        true // persistInBackground - configurable based on farm settings
      );
      console.log(`[Orchestrator] Registered session ${tmuxSession} with lifecycle manager`);
    } catch (error) {
      console.error(`[Orchestrator] Failed to register session with lifecycle manager:`, error);
    }
    
    // Register agents with farmManager for dashboard visibility
    await this.registerAgentsWithFarmManager(options.farmId, options.numberOfAgents);

    // Immediately broadcast that agents are launching (before even checking tmux)
    websocketManager.broadcast('farm:agents:launching', {
      farmId: options.farmId,
      processId,
      tmuxSession,
      agentCount: options.numberOfAgents,
      timestamp: new Date()
    });

    // Broadcast that the farm has been launched
    websocketManager.broadcast({
      type: 'farm:launched',
      payload: {
        farmId: options.farmId,
        processId,
        tmuxSession,
        agentCount: options.numberOfAgents,
        timestamp: new Date()
      }
    });
    
    // Also emit a simple farm:launched event for compatibility
    websocketManager.broadcast('farm:launched', {
      farmId: options.farmId,
      processId,
      tmuxSession,
      agentCount: options.numberOfAgents,
      timestamp: new Date()
    });

    // Set pane titles for better identification in the harvest terminal
    this.setPaneTitles(tmuxSession, agentNames, options.numberOfAgents);

    // Set timeout for process initialization (longer for multiple agents) 
    // Increase timeout based on number of agents to allow for launch time
    const launchTimeoutMs = Math.max(30000, options.numberOfAgents * 10000); // 30s minimum, +10s per agent
    const initTimeout = setTimeout(() => {
      if (farmProcess.status === 'launching') {
        console.warn(`[Farm ${options.farmId}] Launch taking longer than expected (${launchTimeoutMs}ms), checking tmux session...`);
        
        // Check if tmux session actually exists before declaring failure - with retry
        this.verifySessionWithRetry(tmuxSession, options.numberOfAgents).then(async sessionVerified => {
          if (sessionVerified) {
            console.log(`[Farm ${options.farmId}] Tmux session verified with correct panes, updating status`);
            farmProcess.status = 'active';
            websocketManager.broadcast('farm:status', {
              farmId: options.farmId,
              processId,
              status: 'active'
            });
            
            // Update farm status in database to 'active'
            try {
              await db.query(
                'UPDATE farms SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                ['active', options.farmId]
              );
              console.log(`[Farm ${options.farmId}] Updated database status to active`);
            } catch (dbError) {
              console.error(`[Farm ${options.farmId}] Failed to update database status:`, dbError);
            }
            
            // Start terminal output monitoring for the new session
            this.getTmuxPaneCount(tmuxSession).then(async (paneCount) => {
              if (paneCount > 0) {
                const { terminalOutputWatcher } = await import('./terminalOutputWatcher');
                await terminalOutputWatcher.startWatching(tmuxSession, options.farmId, paneCount);
                console.log(`[Farm ${options.farmId}] Started terminal output monitoring for ${paneCount} panes`);
              }
            });
          } else {
            console.error(`[Farm ${options.farmId}] Launch timeout - no tmux session created`);
            childProcess.kill('SIGTERM');
            farmProcess.status = 'error';
            
            // Clean up failed farm
            agentCleanupService.cleanupFarm(options.farmId, 'launch_timeout').catch(err => {
              console.error(`[Orchestrator] Failed to cleanup farm ${options.farmId}:`, err);
            });
            
            websocketManager.broadcast('farm:error', {
              farmId: options.farmId,
              processId,
              error: 'Launch timeout - Claude Code agents failed to initialize',
              timestamp: new Date()
            });
          }
        });
      }
    }, launchTimeoutMs); // Dynamic timeout based on number of agents

    // Handle process output
    childProcess.stdout?.on('data', async (data) => {
      const output = data.toString();
      console.log(`[Farm ${options.farmId}] ${output}`);
      
      // Broadcast output for real-time monitoring in harvest terminals
      websocketManager.broadcast('farm:launch:output', {
        farmId: options.farmId,
        processId,
        tmuxSession,
        output,
        timestamp: new Date()
      });
      
      // Parse for Claude Code launch indicators
      if (output.includes('claude --dangerously-skip-permissions') || 
          output.includes('Claude Code') || 
          output.includes('waiting for Claude')) {
        console.log(`[Farm ${options.farmId}] Claude Code is launching...`);
        websocketManager.broadcast('farm:agents:launching', {
          farmId: options.farmId,
          processId,
          message: 'Claude Code agents are starting up...'
        });
      }
      
      // Check for critical errors in stdout
      if (output.includes('[!]') || output.includes('Error:') || output.includes('Failed')) {
        // Mark farm as failed
        if (farmProcess.status !== 'error') {
          farmProcess.status = 'error';
          
          // Trigger cleanup for failed farm
          agentCleanupService.cleanupFarm(options.farmId, 'critical_error').catch(err => {
            console.error(`[Orchestrator] Failed to cleanup farm ${options.farmId}:`, err);
          });
        }
        
        websocketManager.broadcast('farm:error', {
          farmId: options.farmId,
          processId,
          error: output,
          timestamp: new Date()
        });
      } else {
        // Broadcast status updates
        websocketManager.broadcast('farm:log', {
          farmId: options.farmId,
          processId,
          message: output,
          timestamp: new Date()
        });
      }

      // Parse for agent status changes
      this.parseAgentStatus(processId, output);
      
      // Parse terminal output to look for activities and tasks
      if (output.includes('Task:') || output.includes('Working on:') || output.includes('Agent') || output.includes('Starting')) {
        websocketManager.broadcast('farm:agent:activity', {
          farmId: options.farmId,
          processId,
          tmuxSession,
          sessionName: tmuxSession,
          activity: output.trim(),
          timestamp: new Date()
        });
        
        // Also broadcast as agent update for dashboard tracking
        websocketManager.broadcast('agent:updated', {
          farmId: options.farmId,
          processId,
          sessionName: tmuxSession,
          activity: output.trim(),
          agents: options.numberOfAgents,
          timestamp: new Date()
        });
      }
      
      // Check if launch was successful - look for multiple indicators
      const launchIndicators = [
        'Creating tmux session',  // Python script output
        'Created tmux session',   // Alternative output  
        '[+] Created tmux session',
        'Adding',                 // "Adding X pane(s)"
        'Launching agent'         // Agent launch started
      ];
      
      const hasLaunchIndicator = launchIndicators.some(indicator => output.includes(indicator));
      
      // Also proactively check if session already exists (for fast detection)
      if (!hasLaunchIndicator && farmProcess.status === 'launching') {
        const sessionExists = await this.checkTmuxSession(tmuxSession);
        if (sessionExists) {
          const paneCount = await this.getTmuxPaneCount(tmuxSession);
          if (paneCount >= options.numberOfAgents) {
            console.log(`[Orchestrator] Tmux session ${tmuxSession} detected with ${paneCount} panes, marking as active`);
            hasLaunchIndicator = true;
          }
        }
      }
      
      if (hasLaunchIndicator && farmProcess.status === 'launching') {
        console.log(`[Orchestrator] Tmux session creation detected for farm ${options.farmId}, verifying...`);
        
        // Verify session exists and has panes before marking as active
        const sessionVerified = await this.verifySessionWithRetry(tmuxSession, options.numberOfAgents);
        
        if (sessionVerified) {
          farmProcess.status = 'active';
          console.log(`[Orchestrator] Farm ${options.farmId} status transitioned to active`);
        } else {
          console.error(`[Orchestrator] Session verification failed for farm ${options.farmId}, keeping in launching state`);
          // Don't change status yet, let the timeout handler or reconciliation deal with it
          return;
        }
        
        // Map farm to session in cache when session is successfully created
        try {
          await harvestSessionCache.mapFarmToSession(options.farmId, tmuxSession);
          console.log(`[Orchestrator] Mapped farm ${options.farmId} to session ${tmuxSession}`);
          
          // Broadcast session creation
          harvestSessionBroadcaster.broadcastSessionCreated(options.farmId, tmuxSession, options.numberOfAgents);
        } catch (cacheError) {
          console.warn(`[Orchestrator] Failed to cache session mapping:`, cacheError);
        }
        
        // Update database status to active immediately
        db.query(
          'UPDATE farms SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['active', options.farmId]
        ).then(() => {
          console.log(`[Farm ${options.farmId}] Database status updated to active`);
        }).catch(err => {
          console.error(`[Farm ${options.farmId}] Failed to update database status:`, err);
        });
        
        // Only set timeout if explicitly specified (no default timeout for regular farms)
        if (options.timeout && options.timeout > 0) {
          const executionTimeout = options.timeout;
          const timeoutId = setTimeout(async () => {
            console.warn(`[Orchestrator] Farm ${options.farmId} timed out after ${executionTimeout}ms, initiating graceful shutdown`);
          
          // Broadcast timeout warning to give users notice
          websocketManager.broadcast('farm:timeout_warning', {
            farmId: options.farmId,
            processId,
            reason: `Farm execution exceeded timeout of ${executionTimeout}ms`,
            message: 'Initiating graceful shutdown to collect yields...',
            timestamp: new Date()
          });
          
          // Import farmManager dynamically to avoid circular dependency
          try {
            const { farmManager } = await import('./farmManager');
            
            // Use graceful shutdown instead of abrupt stop
            // The graceful shutdown will handle harvest collection before stopping
            await farmManager.gracefulShutdownFarm(options.farmId, 'dev-user', 'timeout');
            
          } catch (error) {
            console.error(`[Orchestrator] Graceful shutdown failed, falling back to regular stop:`, error);
            
            // Fallback to regular stop if graceful shutdown fails
            await this.stopFarm(processId);
            
            // Update farm and agent statuses to timeout
            try {
              await db.query(
                'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
                ['timeout', new Date(), options.farmId]
              );
              await db.query(
                'UPDATE agents SET status = $1, last_heartbeat = $2 WHERE farm_id = $3',
                ['timeout', new Date(), options.farmId]
              );
            } catch (dbError) {
              console.error(`[Orchestrator] Failed to update farm status on timeout:`, dbError);
            }
          }
          
          // Broadcast final timeout event
          websocketManager.broadcast('farm:timeout', {
            farmId: options.farmId,
            processId,
            reason: `Farm execution exceeded timeout of ${executionTimeout}ms`,
            gracefulShutdown: true,
            timestamp: new Date()
          });
        }, executionTimeout);
        
        this.executionTimeouts.set(options.farmId, timeoutId);
        console.log(`[Orchestrator] Set ${executionTimeout}ms timeout for farm ${options.farmId}`);
      } else {
        console.log(`[Orchestrator] No timeout set for farm ${options.farmId} - will run indefinitely`);
      }
        
      // Update farm status in database
      db.query(
        'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
        ['active', new Date(), options.farmId]
      ).catch(err => console.error('[Orchestrator] Failed to update farm status:', err));
      
      // Update agent statuses in database
      db.query(
        'UPDATE agents SET status = $1, last_heartbeat = $2 WHERE farm_id = $3',
        ['ready', new Date(), options.farmId]
      ).catch(err => console.error('[Orchestrator] Failed to update agent statuses:', err));
      
      // Start health monitoring for the new session
      console.log(`[Orchestrator] Starting health monitoring for session: ${tmuxSession}`);
      tmuxHealthManager.startMonitoring(tmuxSession, options.numberOfAgents)
        .then(() => console.log(`[Orchestrator] Health monitoring started for session: ${tmuxSession}`))
        .catch(err => console.error(`[Orchestrator] Failed to start health monitoring for session ${tmuxSession}:`, err));
      
      // Immediately broadcast that tmux is ready
      console.log(`[Orchestrator] Tmux session created, broadcasting ready event`);
      websocketManager.broadcast('farm:tmux:ready', {
        farmId: options.farmId,
        processId,
        sessionName: tmuxSession,
        tmuxSession,
        agentCount: options.numberOfAgents,
        agents: options.numberOfAgents,
        healthMonitoring: true,
        timestamp: new Date()
      });
      
      // Start real-time terminal streaming with pipe-pane
      import('./terminalStreamService').then(async ({ terminalStreamService }) => {
        // Give tmux session a moment to fully initialize
        setTimeout(async () => {
          try {
            await terminalStreamService.startStreaming(tmuxSession, options.farmId, options.numberOfAgents);
            console.log(`[Orchestrator] Started real-time terminal streaming for session: ${tmuxSession}`);
            
            // Broadcast terminal session ready event
            websocketManager.broadcast('terminal:session', {
              type: 'session',
              action: 'ready',
              sessionId: tmuxSession,
              farmId: options.farmId,
              agentCount: options.numberOfAgents,
              streaming: true,  // Indicate real-time streaming is active
              timestamp: new Date()
            });
          } catch (streamError) {
            console.error(`[Orchestrator] Failed to start terminal streaming, falling back to polling:`, streamError);
            
            // Fallback to original terminal output watcher
            const { terminalOutputWatcher } = await import('./terminalOutputWatcher');
            await terminalOutputWatcher.startWatching(tmuxSession, options.farmId, options.numberOfAgents);
            console.log(`[Orchestrator] Using fallback terminal monitoring for session: ${tmuxSession}`);
          }
        }, 1000); // Wait 1 second for tmux session to be fully ready
      }).catch(err => {
        console.error(`[Orchestrator] Failed to load terminal streaming service:`, err);
      });
      } // Close if statement from line 1249
    }); // Close stdout handler

    childProcess.stderr?.on('data', (data) => {
      const error = data.toString();
      console.error(`[Farm ${options.farmId} ERROR] ${error}`);
      
      // Parse specific error types
      let errorType = 'general';
      if (error.includes('API') || error.includes('rate limit')) {
        errorType = 'api_error';
      } else if (error.includes('tmux')) {
        errorType = 'tmux_error';
      } else if (error.includes('Permission')) {
        errorType = 'permission_error';
      }
      
      websocketManager.broadcast({
        type: 'farm:error',
        payload: {
          farmId: options.farmId,
          processId,
          error,
          errorType,
          timestamp: new Date()
        }
      });
    });

    childProcess.on('exit', (code, signal) => {
      // Clear any timeouts
      clearTimeout(initTimeout);
      
      farmProcess.status = code === 0 ? 'completed' : 'error';
      
      console.log(`[Farm ${options.farmId}] Process exited with code ${code}, signal ${signal}`);
      
      // Unregister farm from cleanup service
      agentCleanupService.unregisterFarm(options.farmId);
      
      // If process failed, trigger cleanup
      if (code !== 0) {
        agentCleanupService.cleanupFarm(options.farmId, `process_exit_${code}`).catch(err => {
          console.error(`[Orchestrator] Failed to cleanup farm ${options.farmId}:`, err);
        });
      }
      
      websocketManager.broadcast({
        type: 'farm:status',
        payload: {
          farmId: options.farmId,
          processId,
          status: farmProcess.status,
          sessionName: tmuxSession,
          agentCount: options.numberOfAgents,
          exitCode: code,
          signal
        }
      });

      // Clean up prompt file if created
      if (promptFilePath) {
        fs.unlink(promptFilePath).catch(() => {});
      }
      
      // Clean up tmux session
      spawn('tmux', ['kill-session', '-t', tmuxSession]);
    });

    // Start monitoring tmux panes after a shorter delay
    setTimeout(async () => {
      // Clear the init timeout
      clearTimeout(initTimeout);
      
      // Check if tmux session was created successfully
      const sessionExists = await this.checkTmuxSession(tmuxSession);
      if (sessionExists) {
        console.log(`[Orchestrator] Tmux session ${tmuxSession} detected, starting monitoring`);
        
        // Update farm process to track the session directly
        farmProcess.status = 'active';
        
        // Update farm status in database
        await db.query(
          'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
          ['active', new Date(), options.farmId]
        ).catch(err => console.error('[Orchestrator] Failed to update farm status:', err));
        
        // Broadcast that the tmux session is ready
        websocketManager.broadcast({
          type: 'farm:tmux:ready',
          payload: {
            farmId: options.farmId,
            processId,
            sessionName: tmuxSession,
            timestamp: new Date()
          }
        });
        
        // Get actual pane count and update agent tracking
        const paneCount = await this.getTmuxPaneCount(tmuxSession);
        if (paneCount > 0) {
          console.log(`[Orchestrator] Found ${paneCount} panes for farm ${options.farmId}`);
          
          // Update agent info based on actual panes
          farmProcess.agents.clear();
          for (let i = 0; i < paneCount; i++) {
            farmProcess.agents.set(i, {
              id: i,
              paneId: `${tmuxSession}:agents.${i}`,
              status: 'ready'
            });
          }
          
          // Update agents in database
          await db.query(
            'UPDATE agents SET status = $1, last_heartbeat = $2 WHERE farm_id = $3',
            ['ready', new Date(), options.farmId]
          ).catch(err => console.error('[Orchestrator] Failed to update agent statuses:', err));
          
          // Broadcast farm status with correct agent count
          websocketManager.broadcast('farm:status', {
            farmId: options.farmId,
            status: 'active',
            agents: paneCount,
            timestamp: new Date()
          });
        }
        
        this.startTerminalMonitoring(processId);
        
        websocketManager.broadcast({
          type: 'farm:status',
          payload: {
            farmId: options.farmId,
            processId,
            status: 'active'
          }
        });
      } else if (farmProcess.status === 'launching') {
        // Session wasn't created, mark as error
        farmProcess.status = 'error';
        
        // Update farm status in database
        await db.query(
          'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
          ['error', new Date(), options.farmId]
        ).catch(err => console.error('[Orchestrator] Failed to update farm status:', err));
        
        // Clean up failed farm
        agentCleanupService.cleanupFarm(options.farmId, 'tmux_creation_failed').catch(err => {
          console.error(`[Orchestrator] Failed to cleanup farm ${options.farmId}:`, err);
        });
        
        websocketManager.broadcast({
          type: 'farm:error',
          payload: {
            farmId: options.farmId,
            processId,
            error: 'Failed to create tmux session',
            timestamp: new Date()
          }
        });
      }
      
      // Set up periodic monitoring to check tmux session and update agent count
      const monitoringInterval = setInterval(async () => {
        if (farmProcess.status === 'active') {
        const sessionExists = await this.checkTmuxSession(tmuxSession);
        if (sessionExists) {
          const paneCount = await this.getTmuxPaneCount(tmuxSession);
          if (paneCount !== farmProcess.agents.size) {
            console.log(`[Orchestrator] Agent count changed for farm ${options.farmId}: ${farmProcess.agents.size} -> ${paneCount}`);
            
            // Update agent tracking
            farmProcess.agents.clear();
            for (let i = 0; i < paneCount; i++) {
              farmProcess.agents.set(i, {
                id: i,
                paneId: `${tmuxSession}:agents.${i}`,
                status: 'ready'
              });
            }
            
            // Broadcast updated agent count
            websocketManager.broadcast('farm:agents:updated', {
              farmId: options.farmId,
              agentCount: paneCount,
              timestamp: new Date()
            });
          }
        } else {
          // Session disappeared unexpectedly
          console.warn(`[Orchestrator] Tmux session ${tmuxSession} disappeared for farm ${options.farmId}`);
          farmProcess.status = 'completed';
          clearInterval(monitoringInterval);
          
          // Update farm status in database
          await db.query(
            'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
            ['stopped', new Date(), options.farmId]
          ).catch(err => console.error('[Orchestrator] Failed to update farm status:', err));
          
          websocketManager.broadcast('farm:status', {
            farmId: options.farmId,
            status: 'stopped',
            timestamp: new Date()
          });
        }
      } else if (farmProcess.status === 'stopped' || farmProcess.status === 'error') {
        clearInterval(monitoringInterval);
      }
      }, 10000); // Check every 10 seconds
    }, 5000); // End of setTimeout at line 1428
    
    return processId;
  }

  private parseAgentStatus(processId: string, output: string) {
    const farmProcess = this.farmProcesses.get(processId);
    if (!farmProcess) return;

    // Parse agent status updates from orchestrator.py output
    const agentReadyMatch = output.match(/Agent (\d+) registered \(UID: (agent_\w+)\)/);
    if (agentReadyMatch) {
      const agentId = parseInt(agentReadyMatch[1]);
      const uid = agentReadyMatch[2];
      
      const agent = farmProcess.agents.get(agentId);
      if (agent) {
        agent.status = 'ready';
        agent.uid = uid;
        
        websocketManager.broadcast({
          type: 'agent:status',
          payload: {
            farmId: farmProcess.farmId,
            agentId,
            uid,
            status: 'ready'
          }
        });
      }
    }

    // Multiple patterns for agent status
    const statusPatterns = [
      { pattern: /Agent (\d+) - Working/, status: 'working' },
      { pattern: /Agent (\d+) launched successfully/, status: 'ready' },
      { pattern: /Agent (\d+) completed/, status: 'idle' },
      { pattern: /Agent (\d+).*error/i, status: 'error' },
      { pattern: /\[\+\] Agent (\d+) launched/, status: 'ready' },
      { pattern: /\[\*\] Agent (\d+): waiting/, status: 'starting' },
      { pattern: /\[!\] Agent (\d+)/, status: 'error' }
    ];

    for (const { pattern, status } of statusPatterns) {
      const match = output.match(pattern);
      if (match) {
        const agentId = parseInt(match[1]);
        const agent = farmProcess.agents.get(agentId);
        if (agent) {
          agent.status = status;
          websocketManager.broadcast({
            type: 'agent:status',
            payload: {
              farmId: farmProcess.farmId,
              agentId,
              status,
              timestamp: new Date()
            }
          });
        }
        break;
      }
    }

    // Parse step assignments
    const stepMatch = output.match(/Assigning step (\d+) to agent (\d+)/);
    if (stepMatch) {
      const stepNumber = parseInt(stepMatch[1]);
      const agentId = parseInt(stepMatch[2]);
      
      websocketManager.broadcast({
        type: 'agent:step_assigned',
        payload: {
          farmId: farmProcess.farmId,
          agentId,
          stepNumber,
          timestamp: new Date()
        }
      });
    }
  }

  private async startTerminalMonitoring(processId: string) {
    const farmProcess = this.farmProcesses.get(processId);
    if (!farmProcess) return;

    // Monitor each agent's tmux pane
    const monitorInterval = setInterval(async () => {
      if (farmProcess.status !== 'active') {
        clearInterval(monitorInterval);
        return;
      }

      for (const [agentId, agent] of farmProcess.agents) {
        try {
          const output = await this.captureAgentTerminal(
            farmProcess.tmuxSession,
            agentId
          );
          
          if (output) {
            // Parse for API errors and warnings
            this.parseClaudeMessages(processId, agentId, output);
            
            // Store in buffer
            const buffer = farmProcess.terminalBuffers.get(agentId) || [];
            const lines = output.split('\n');
            buffer.push(...lines);
            
            // Limit buffer size
            if (buffer.length > this.BUFFER_LIMIT) {
              buffer.splice(0, buffer.length - this.BUFFER_LIMIT);
            }
            
            farmProcess.terminalBuffers.set(agentId, buffer);

            // Broadcast terminal update with multiple event types for compatibility
            const terminalData = {
              farmId: farmProcess.farmId,
              sessionName: farmProcess.tmuxSession,
              agentId,
              content: lines.slice(-50).join('\n'), // Send last 50 lines
              terminal: lines.slice(-50), // Also send as array
              timestamp: new Date()
            };
            
            // Send multiple events for different listeners
            websocketManager.broadcast('agent:terminal', terminalData);
            websocketManager.broadcast('harvest:terminal:update', terminalData);
            websocketManager.broadcastToFarm(farmProcess.farmId, 'terminal:update', terminalData);
          }
        } catch (error) {
          // Only log if it's not a common error
          if (error instanceof Error && !error.message.includes('Failed to capture pane')) {
            console.error(`Error capturing terminal for agent ${agentId}:`, error.message);
          }
        }
      }
    }, 3000); // Check every 3 seconds
  }

  private async captureAgentTerminal(session: string, agentId: number): Promise<string> {
    return new Promise((resolve, reject) => {
      // Try multiple possible session names and pane formats
      const possibleTargets = [
        `${session}:agents.${agentId}`,          // orchestrator uses window 0
        `${session}:agents.${agentId}`,     // Alternative format
        `${session}.${agentId}`,            // Direct pane reference
        `${session}:${agentId}`             // Window-less format
      ];
      
      let attemptIndex = 0;
      
      const tryCapture = () => {
        if (attemptIndex >= possibleTargets.length) {
          // All attempts failed, return empty
          resolve('');
          return;
        }
        
        const paneTarget = possibleTargets[attemptIndex];
        attemptIndex++;
        
        const captureProcess = spawn('tmux', [
          'capture-pane',
          '-t', paneTarget,
          '-p',
          '-S', '-100' // Last 100 lines
        ]);

        let output = '';
        let stderr = '';
        
        captureProcess.stdout?.on('data', (data) => {
          output += data.toString();
        });
        
        captureProcess.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        captureProcess.on('exit', (code) => {
          if (code === 0) {
            resolve(output);
          } else {
            // Try next target
            tryCapture();
          }
        });
      };
      
      tryCapture();
    });
  }

  async sendCommandToAgent(processId: string, agentId: number, command: string): Promise<void> {
    const farmProcess = this.farmProcesses.get(processId);
    if (!farmProcess) {
      throw new Error('Farm process not found');
    }

    const agent = farmProcess.agents.get(agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    // Check if agent is ready before sending
    const isReady = await this.checkAgentReady(processId, agentId);
    if (!isReady) {
      console.warn(`[Orchestrator] Agent ${agentId} not ready, waiting...`);
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Handle multi-line commands like orchestrator.py
    if (command.includes('\n')) {
      return this.sendMultiLineCommand(processId, agentId, command);
    }

    // Send single-line command to tmux pane
    return new Promise((resolve, reject) => {
      const sendProcess = spawn('tmux', [
        'send-keys',
        '-t', `${farmProcess.tmuxSession}:agents.${agentId}`,  // Use window 0 like orchestrator.py
        command,
        'C-m' // Enter key
      ]);

      sendProcess.on('exit', (code) => {
        if (code === 0) {
          // Log the command
          const buffer = farmProcess.terminalBuffers.get(agentId) || [];
          buffer.push(`> ${command}`);
          farmProcess.terminalBuffers.set(agentId, buffer);

          // Broadcast command sent
          websocketManager.broadcast({
            type: 'agent:command',
            payload: {
              farmId: farmProcess.farmId,
              agentId,
              command,
              timestamp: new Date()
            }
          });

          resolve();
        } else {
          reject(new Error(`Failed to send command: exit code ${code}`));
        }
      });
    });
  }

  async stopFarm(processId: string): Promise<void> {
    const farmProcess = this.farmProcesses.get(processId);
    if (!farmProcess) {
      throw new Error('Farm process not found');
    }

    console.log(`[Orchestrator] Stopping farm ${farmProcess.farmId} with ${farmProcess.agents.size} agents`);
    farmProcess.status = 'stopping';
    
    // Clear execution timeout if it exists
    const timeoutId = this.executionTimeouts.get(farmProcess.farmId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.executionTimeouts.delete(farmProcess.farmId);
      console.log(`[Orchestrator] Cleared execution timeout for farm ${farmProcess.farmId}`);
    }
    
    // Trigger cleanup service for controlled shutdown
    await agentCleanupService.cleanupFarm(farmProcess.farmId, 'user_stopped');
    
    // Clean up isolated workspace
    try {
      await workspaceManager.cleanupWorkspace(farmProcess.farmId, true); // archive = true
      console.log(`[Orchestrator] Archived workspace for farm ${farmProcess.farmId}`);
    } catch (error) {
      console.error(`[Orchestrator] Failed to cleanup workspace for farm ${farmProcess.farmId}:`, error);
    }

    // Broadcast agent cleanup started
    websocketManager.broadcast({
      type: 'farm:cleanup:started',
      payload: {
        farmId: farmProcess.farmId,
        processId,
        agentCount: farmProcess.agents.size
      }
    });

    // Send exit command to all agents
    const exitResults = [];
    for (const [agentId, agentInfo] of farmProcess.agents.entries()) {
      try {
        await this.sendCommandToAgent(processId, agentId, '/exit');
        exitResults.push({ agentId, success: true });
      } catch (error) {
        console.error(`Error sending exit to agent ${agentId}:`, error);
        exitResults.push({ agentId, success: false, error });
      }
    }

    // Wait a moment for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Kill the orchestrator process if it exists
    if (farmProcess.process) {
      farmProcess.process.kill('SIGTERM');
    }

    // Kill tmux session
    spawn('tmux', ['kill-session', '-t', farmProcess.tmuxSession]);
    
    // Remove session from cache
    try {
      await harvestSessionCache.unmapFarmSession(farmProcess.farmId);
      await harvestSessionCache.invalidateSession(farmProcess.tmuxSession);
      console.log(`[Orchestrator] Removed farm ${farmProcess.farmId} session mapping from cache`);
      
      // Broadcast session destruction
      harvestSessionBroadcaster.broadcastSessionDestroyed(farmProcess.farmId, farmProcess.tmuxSession);
    } catch (cacheError) {
      console.warn(`[Orchestrator] Failed to remove session from cache:`, cacheError);
    }

    // Stop health monitoring for this session
    tmuxHealthManager.stopMonitoring(farmProcess.tmuxSession);
    this.lastHealthBroadcast.delete(farmProcess.tmuxSession);

    // Clear agent data
    farmProcess.agents.clear();
    farmProcess.terminalBuffers.clear();
    farmProcess.status = 'completed';
    
    // Broadcast completion with cleanup details
    websocketManager.broadcast({
      type: 'farm:cleanup:completed',
      payload: {
        farmId: farmProcess.farmId,
        processId,
        status: 'stopped',
        cleanupResults: exitResults
      }
    });

    // Clean up from tracking
    this.farmProcesses.delete(processId);
    
    // Unregister from cleanup service
    agentCleanupService.unregisterFarm(farmProcess.farmId);
    
    console.log(`[Orchestrator] Farm ${farmProcess.farmId} stopped and all agents cleaned up`);
  }

  async pauseFarm(processId: string): Promise<void> {
    const farmProcess = this.farmProcesses.get(processId);
    if (!farmProcess) {
      throw new Error('Farm process not found');
    }

    // Send pause signal to process (SIGSTOP)
    farmProcess.process.kill('SIGSTOP');
    farmProcess.status = 'stopped';
    
    websocketManager.broadcast({
      type: 'farm:status',
      payload: {
        farmId: farmProcess.farmId,
        processId,
        status: 'paused'
      }
    });
  }

  async resumeFarm(processId: string): Promise<void> {
    const farmProcess = this.farmProcesses.get(processId);
    if (!farmProcess) {
      throw new Error('Farm process not found');
    }

    // Send resume signal to process (SIGCONT)
    farmProcess.process.kill('SIGCONT');
    farmProcess.status = 'active';
    
    websocketManager.broadcast({
      type: 'farm:status',
      payload: {
        farmId: farmProcess.farmId,
        processId,
        status: 'active'
      }
    });
  }

  getAgentTerminal(processId: string, agentId: number): string[] {
    const farmProcess = this.farmProcesses.get(processId);
    if (!farmProcess) {
      return [];
    }

    return farmProcess.terminalBuffers.get(agentId) || [];
  }

  getFarmStatus(processId: string): FarmProcess | undefined {
    return this.farmProcesses.get(processId);
  }

  getAllFarmStatuses(): Map<string, FarmProcess> {
    return this.farmProcesses;
  }

  /**
   * Send multi-line command to agent using tmux buffer method
   */
  private async sendMultiLineCommand(processId: string, agentId: number, command: string): Promise<void> {
    const farmProcess = this.farmProcesses.get(processId);
    if (!farmProcess) {
      throw new Error('Farm process not found');
    }

    // Create temporary file for multi-line command
    const tempFile = `/tmp/maifarm_cmd_${Date.now()}_${agentId}.txt`;
    await fs.writeFile(tempFile, command, 'utf-8');

    try {
      // Use unique buffer name
      const bufferName = `maifarm_${processId.substring(0, 8)}_${agentId}`;
      
      // Load into tmux buffer
      await new Promise<void>((resolve, reject) => {
        const loadProcess = spawn('tmux', [
          'load-buffer',
          '-b', bufferName,
          tempFile
        ]);

        loadProcess.on('exit', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Failed to load buffer: exit code ${code}`));
          }
        });
      });

      // Paste buffer to pane
      await new Promise<void>((resolve, reject) => {
        const pasteProcess = spawn('tmux', [
          'paste-buffer',
          '-d', // Delete buffer after pasting
          '-b', bufferName,
          '-t', `${farmProcess.tmuxSession}:agents.${agentId}`
        ]);

        pasteProcess.on('exit', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Failed to paste buffer: exit code ${code}`));
          }
        });
      });

      // Critical: Small delay before sending Enter
      await new Promise(resolve => setTimeout(resolve, 200));

      // Send Enter key
      await new Promise<void>((resolve, reject) => {
        const enterProcess = spawn('tmux', [
          'send-keys',
          '-t', `${farmProcess.tmuxSession}:agents.${agentId}`,
          'C-m'
        ]);

        enterProcess.on('exit', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Failed to send Enter: exit code ${code}`));
          }
        });
      });

      // Log the command
      const buffer = farmProcess.terminalBuffers.get(agentId) || [];
      buffer.push(`> [Multi-line command sent]`);
      farmProcess.terminalBuffers.set(agentId, buffer);

      // Broadcast command sent
      websocketManager.broadcast({
        type: 'agent:command',
        payload: {
          farmId: farmProcess.farmId,
          agentId,
          command: '[Multi-line command]',
          timestamp: new Date()
        }
      });
    } finally {
      // Clean up temp file
      try {
        await fs.unlink(tempFile);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Check if a Claude agent is ready for input
   */
  private async checkAgentReady(processId: string, agentId: number): Promise<boolean> {
    const farmProcess = this.farmProcesses.get(processId);
    if (!farmProcess) return false;

    const output = await this.captureAgentTerminal(farmProcess.tmuxSession, agentId);
    
    // Ready indicators from orchestrator.py
    const readyIndicators = [
      'Welcome to Claude Code',
      '/help for help',
      '? for shortcuts',
      'cwd:',
      'Press Esc twice',
      'Bypassing Permissions',
      '──────────'
    ];

    // Check if any indicator is present
    const isReady = readyIndicators.some(indicator => output.includes(indicator));
    
    // Also check if Claude is responding (not just launched)
    return isReady && output.length > 100;
  }

  /**
   * Parse Claude messages for errors, warnings, and status updates
   */
  private parseClaudeMessages(processId: string, agentId: number, output: string) {
    const farmProcess = this.farmProcesses.get(processId);
    if (!farmProcess) return;

    // API Error patterns
    const apiErrorPatterns = [
      /API error/i,
      /rate limit/i,
      /quota exceeded/i,
      /authentication failed/i,
      /invalid api key/i,
      /error.*api/i,
      /failed.*request/i,
      /anthropic.*error/i
    ];

    // Check for API errors
    for (const pattern of apiErrorPatterns) {
      if (pattern.test(output)) {
        const errorMatch = output.match(/.*(?:error|failed|limit).*/gi);
        const errorMessage = errorMatch ? errorMatch[0] : 'API Error detected';
        
        console.error(`[Orchestrator] Agent ${agentId} API Error: ${errorMessage}`);
        
        // Broadcast API error
        websocketManager.broadcast({
          type: 'agent:api_error',
          payload: {
            farmId: farmProcess.farmId,
            agentId,
            error: errorMessage,
            timestamp: new Date()
          }
        });

        // Update agent status
        const agent = farmProcess.agents.get(agentId);
        if (agent) {
          agent.status = 'error';
        }
        break;
      }
    }

    // Warning patterns - exclude TypeScript type declarations
    const warningPatterns = [
      /\bwarning(?!s:\s*string)/i,  // Match 'warning' but not 'warnings: string'
      /approaching.*limit/i,
      /slow.*response/i,
      /degraded.*performance/i,
      /\berror\b.*occurred/i,
      /failed to/i
    ];
    
    // Exclude patterns that are false positives
    const excludePatterns = [
      /warnings:\s*string\[\]/,  // TypeScript type declaration
      /interface.*warning/i,      // Interface definitions
      /type.*warning/i,           // Type definitions
      /\/\/.*(warning|warnings)/i // Comments about warnings
    ];

    // Check if this is a false positive
    const isFalsePositive = excludePatterns.some(pattern => pattern.test(output));
    
    // Check for warnings only if not a false positive
    if (!isFalsePositive) {
      for (const pattern of warningPatterns) {
        if (pattern.test(output)) {
          const warningMatch = output.match(/.*warning.*/gi);
          const warningMessage = warningMatch ? warningMatch[0] : 'Warning detected';
          
          // Only log actual warnings, not TypeScript declarations
          if (!warningMessage.includes('warnings: string')) {
            console.warn(`[Orchestrator] Agent ${agentId} Warning: ${warningMessage}`);
            
            // Broadcast warning
            websocketManager.broadcast({
              type: 'agent:warning',
              payload: {
                farmId: farmProcess.farmId,
                agentId,
                warning: warningMessage,
                timestamp: new Date()
              }
            });
          }
          break;
        }
      }
    }

    // Status indicators
    if (output.includes('ready') || output.includes('Done') || output.includes('Completed')) {
      const agent = farmProcess.agents.get(agentId);
      if (agent && agent.status === 'working') {
        agent.status = 'ready';
        websocketManager.broadcast({
          type: 'agent:status',
          payload: {
            farmId: farmProcess.farmId,
            agentId,
            status: 'ready',
            timestamp: new Date()
          }
        });
      }
    }
  }

  async attachToTmuxSession(processId: string): Promise<string> {
    const farmProcess = this.farmProcesses.get(processId);
    if (!farmProcess) {
      throw new Error('Farm process not found');
    }

    // Return command to attach to tmux session
    return `tmux attach-session -t ${farmProcess.tmuxSession}`;
  }
  
  /**
   * Update task counts for a farm based on files created
   */
  async updateTaskCountsForFarm(farmId: string): Promise<void> {
    try {
      const farmProcess = this.getFarmProcessByFarmId(farmId);
      if (!farmProcess) return;
      
      // Get total task count for the farm
      const totalTasks = await taskCountService.countTasksForFarm(farmId);
      
      // Update each agent's task count
      for (const [agentIndex, agent] of farmProcess.agents.entries()) {
        const agentTasks = await taskCountService.countTasksForAgent(farmId, agentIndex);
        
        // Update agent performance metrics
        if (agent) {
          const previousTasks = agent.performance?.tasksCompleted || 0;
          agent.performance = {
            ...agent.performance,
            tasksCompleted: agentTasks,
            successRate: 100, // Assume success if file was created
            avgResponseTime: agent.performance?.avgResponseTime || 0
          };
          
          // Broadcast update if task count changed
          if (agentTasks !== previousTasks) {
            websocketManager.broadcast({
              type: 'agent:metrics:updated',
              payload: {
                farmId,
                agentId: agentIndex,
                metrics: {
                  tasksCompleted: agentTasks,
                  filesCreated: agentTasks
                }
              }
            });
          }
        }
      }
      
      // Update farm-level metrics
      websocketManager.broadcast({
        type: 'farm:metrics:updated',
        payload: {
          farmId,
          metrics: {
            totalTasksCompleted: totalTasks,
            totalFilesCreated: totalTasks
          }
        }
      });
      
      console.log(`[Orchestrator] Updated task counts for farm ${farmId}: ${totalTasks} total tasks`);
    } catch (error) {
      console.error(`[Orchestrator] Error updating task counts for farm ${farmId}:`, error);
    }
  }
  
  /**
   * Helper to get farm process by farmId
   */
  private getFarmProcessByFarmId(farmId: string): FarmProcess | undefined {
    for (const [key, proc] of this.farmProcesses.entries()) {
      if (proc.farmId === farmId || key === farmId) {
        return proc;
      }
    }
    return undefined;
  }

  async getStatus(farmId: string): Promise<any> {
    // Try to find by farmId first
    let farmProcess: FarmProcess | undefined;
    
    // Search through all processes
    for (const [key, proc] of this.farmProcesses.entries()) {
      if (proc.farmId === farmId || key === farmId) {
        farmProcess = proc;
        break;
      }
    }
    
    // Always check if tmux session exists to update status
    let tmuxSession: string;
    if (farmId.startsWith('quick-task-')) {
      // For quick tasks, use the task ID portion after 'quick-task-'
      const taskId = farmId.replace('quick-task-', '').substring(0, 8);
      tmuxSession = `quick_${taskId}`;
    } else {
      tmuxSession = `farm-${farmId.substring(0, 8)}`;
    }
    const sessionExists = await this.checkTmuxSession(tmuxSession);
    
    if (sessionExists) {
      // Session exists, get current state
      console.log(`[Orchestrator] Found active session ${tmuxSession}`);
      
      const paneCount = await this.getTmuxPaneCount(tmuxSession);
      const agents = [];
      
      // Capture Claude agent IDs from panes if possible
      for (let i = 0; i < paneCount; i++) {
        const agentId = await this.getClaudeAgentId(tmuxSession, i);
        agents.push({
          id: i,
          paneId: `${tmuxSession}:agents.${i}`,
          status: 'ready',
          uid: agentId || `agent_${i}`
        });
      }
      
      // If we have a tracked process, update it
      if (farmProcess) {
        farmProcess.status = 'active';
        farmProcess.tmuxSession = tmuxSession;
        // Update agents with current state
        farmProcess.agents.clear();
        agents.forEach(agent => {
          farmProcess!.agents.set(agent.id, agent);
        });
      }
      
      return {
        farmId,
        processId: farmProcess?.id || farmId,
        status: 'active',
        tmuxSession,
        agents,
        startTime: farmProcess?.startTime || null,
        isRunning: true
      };
    }
    
    if (!farmProcess) {
      return {
        farmId,
        processId: null,
        status: 'idle',
        tmuxSession: null,
        agents: [],
        startTime: null,
        isRunning: false
      };
    }
    
    // Convert agents Map to array
    const agents = Array.from(farmProcess.agents.values());
    
    return {
      farmId: farmProcess.farmId,
      processId: farmProcess.processId,
      status: farmProcess.status,
      tmuxSession: farmProcess.tmuxSession,
      agents,
      startTime: farmProcess.startTime,
      isRunning: farmProcess.status === 'active'
    };
  }
  
  async getAgentTerminal(farmId: string, agentId: number): Promise<any> {
    // First try to get status to see if session exists
    const status = await this.getStatus(farmId);
    
    if (!status.isRunning) {
      return {
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Farm is not running'
        }
      };
    }
    
    const tmuxSession = status.tmuxSession;
    if (!tmuxSession) {
      return {
        success: false,
        error: {
          code: 'NO_SESSION',
          message: 'No tmux session found'
        }
      };
    }
    
    try {
      const terminal = await this.captureAgentTerminal(tmuxSession, agentId);
      const lines = terminal.split('\n').filter(line => line.trim() !== '');
      
      return {
        success: true,
        data: {
          terminal: lines,
          agentId,
          farmId
        }
      };
    } catch (error) {
      console.error(`Error capturing terminal for agent ${agentId}:`, error);
      return {
        success: false,
        error: {
          code: 'CAPTURE_ERROR',
          message: 'Failed to capture terminal output'
        }
      };
    }
  }

  private getAgentSpecialization(index: number, options: LaunchOptions): string {
    // Assign specializations based on agent index and task
    const specializations = [
      'explorer',      // Searches and discovers new possibilities
      'architect',     // Designs system structures
      'implementer',   // Writes and implements code
      'validator',     // Tests and validates solutions
      'optimizer'      // Optimizes and refines solutions
    ];
    
    // If collaborative mode, assign complementary specializations
    if (options.collaborative) {
      return specializations[index % specializations.length];
    }
    
    // Otherwise, let agents be generalists
    return 'generalist';
  }

  public async updateAgentConsciousness(farmId: string, agentIndex: number): Promise<void> {
    const farmProcess = Array.from(this.farmProcesses.values())
      .find(fp => fp.farmId === farmId);
    
    if (!farmProcess) return;
    
    const agent = farmProcess.agents.get(agentIndex);
    if (!agent?.uid) return;
    
    // Capture recent terminal output for thought extraction
    const terminal = farmProcess.terminalBuffers.get(agentIndex);
    if (terminal && terminal.length > 0) {
      const recentThoughts = terminal.slice(-5).join(' ');
      
      // Transmit thoughts through neural mesh
      // await neuralMeshNetwork.transmitThought(
      //   agent.uid,
      //   recentThoughts,
      //   'reasoning',
      //   0.6
      // );
      
      // Update fitness based on progress
      // const metrics = {
      //   taskSuccess: agent.status === 'ready' ? 0.8 : 0.5,
      //   timeEfficiency: 0.7,
      //   resourceUtilization: 0.6,
      //   innovationScore: Math.random() * 0.5 + 0.3,
      //   collaborationScore: 0.7
      // };
      
      // await strategyEvolution.updateFitness(agent.uid, metrics);
    }
  }

  public getEmergentIntelligenceStats() {
    return {
      consciousness: 0, // neuralMeshNetwork.getConsciousnessLevel(),
      networkState: {}, // neuralMeshNetwork.getNetworkState(),
      memoryStats: {}, // collectiveMemory.getMemoryStats(),
      evolutionStats: {}, // strategyEvolution.getEvolutionStats(),
      capabilities: [] // neuralMeshNetwork.getEmergentCapabilities()
    };
  }

  // Start consciousness monitoring for all active farms
  public startConsciousnessMonitoring(): void {
    setInterval(async () => {
      for (const farmProcess of this.farmProcesses.values()) {
        if (farmProcess.status === 'active') {
          for (const [agentIndex] of farmProcess.agents) {
            await this.updateAgentConsciousness(farmProcess.farmId, agentIndex);
          }
        }
      }
      
      // Broadcast consciousness updates
      const stats = this.getEmergentIntelligenceStats();
      websocketManager.broadcast('emergent:consciousness', {
        level: stats.consciousness,
        timestamp: new Date()
      });
    }, 5000); // Every 5 seconds
  }

  /**
   * Process barn references in YAML content
   */
  private async processBarnReferences(yamlContent: string, references: string[], farmId: string): Promise<string> {
    let processedYaml = yamlContent;
    
    for (const reference of references) {
      try {
        // Resolve the barn reference
        const item = await barnCatalogService.resolveReference(reference);
        if (item) {
          // Track usage
          await barnCatalogService.trackItemUsage(item.id, farmId);
          
          // Get item content
          const content = await barnCatalogService.getItemContent(item.id);
          if (content) {
            // Replace reference with content in YAML
            const referenceComment = `# Referenced from Barn item: ${item.name} (${reference})`;
            const replacement = `${referenceComment}\n${content}`;
            processedYaml = processedYaml.replace(reference, replacement);
            
            console.log(`[Orchestrator] Resolved barn reference ${reference} to item ${item.name}`);
          }
        } else {
          console.warn(`[Orchestrator] Could not resolve barn reference: ${reference}`);
        }
      } catch (error) {
        console.error(`[Orchestrator] Error processing barn reference ${reference}:`, error);
      }
    }
    
    return processedYaml;
  }

  /**
   * Get available barn items for a farm
   */
  async getBarnCatalogForFarm(farmId: string, options?: {
    types?: string[];
    maxItems?: number;
    includeYaml?: boolean;
  }): Promise<string> {
    return await barnCatalogService.generateCatalogForFarm(farmId, options);
  }

  /**
   * Search barn items
   */
  async searchBarnItems(query: {
    type?: string;
    category?: string;
    tags?: string[];
    searchText?: string;
  }) {
    return await barnCatalogService.searchCatalog(query);
  }

  /**
   * Get barn catalog summary
   */
  async getBarnSummary() {
    return await barnCatalogService.getCatalogSummary();
  }

  /**
   * Attempt to recover a dead or unresponsive session
   */
  private async attemptSessionRecovery(farmProcess: FarmProcess, sessionName: string): Promise<void> {
    console.log(`[Orchestrator] Attempting recovery for dead session: ${sessionName}`);
    
    try {
      // Stop health monitoring temporarily
      tmuxHealthManager.stopMonitoring(sessionName);
      
      // Check if session still exists at all
      const sessionExists = await this.checkTmuxSession(sessionName);
      
      if (!sessionExists) {
        console.log(`[Orchestrator] Session ${sessionName} is completely gone - cannot recover`);
        
        // Mark farm as stopped
        farmProcess.status = 'stopped';
        
        // Update database
        await db.query(
          'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
          ['stopped', new Date(), farmProcess.farmId]
        );
        
        // Broadcast final status
        websocketManager.broadcast({
          type: 'farm:status',
          payload: {
            farmId: farmProcess.farmId,
            processId: farmProcess.processId,
            status: 'stopped',
            reason: 'session_dead'
          }
        });
        
        return;
      }
      
      // Session exists but is unresponsive - try to revive it
      console.log(`[Orchestrator] Session ${sessionName} exists but unresponsive - attempting revival`);
      
      // Try sending a simple command to wake up the session
      const wakeCommand = spawn('tmux', ['send-keys', '-t', sessionName, 'echo "System recovery check"', 'C-m']);
      
      wakeCommand.on('exit', async (code) => {
        if (code === 0) {
          // Wait a moment then restart health monitoring
          setTimeout(async () => {
            const paneCount = await this.getTmuxPaneCount(sessionName);
            if (paneCount > 0) {
              await tmuxHealthManager.startMonitoring(sessionName, paneCount);
              console.log(`[Orchestrator] Recovery attempt initiated for session ${sessionName}`);
              
              // Broadcast recovery attempt
              websocketManager.broadcast({
                type: 'farm:recovery',
                payload: {
                  farmId: farmProcess.farmId,
                  processId: farmProcess.processId,
                  sessionName,
                  status: 'recovery_initiated',
                  timestamp: new Date()
                }
              });
            } else {
              console.log(`[Orchestrator] Session ${sessionName} recovery failed - no panes found`);
            }
          }, 3000);
        }
      });
      
    } catch (error) {
      console.error(`[Orchestrator] Session recovery failed for ${sessionName}:`, error);
    }
  }

  /**
   * Attempt to revive unresponsive agents within a session
   */
  /**
   * Recover a lost tmux session for an active farm
   */
  async recoverLostSession(farmId: string): Promise<boolean> {
    console.log(`[Orchestrator] Attempting to recover lost session for farm ${farmId}`);
    
    try {
      // Get farm details from database
      const farmResult = await db.query('SELECT * FROM farms WHERE id = $1 AND status IN ($2, $3)', 
        [farmId, 'active', 'running']);
      
      if (!farmResult.rows.length) {
        console.log(`[Orchestrator] Farm ${farmId} not found or not active`);
        return false;
      }
      
      const farm = farmResult.rows[0];
      const sessionName = `farm-${farmId.substring(0, 8)}`;
      
      // Check if session already exists
      const sessionExists = await this.checkTmuxSession(sessionName);
      if (sessionExists) {
        console.log(`[Orchestrator] Session ${sessionName} already exists`);
        return true;
      }
      
      // Get agents for this farm
      const agentsResult = await db.query('SELECT * FROM agents WHERE farm_id = $1', [farmId]);
      const agentCount = agentsResult.rows.length || farm.config?.maxAgents || 3;
      
      console.log(`[Orchestrator] Recreating session ${sessionName} with ${agentCount} agents`);
      
      // Ensure tmux server is running
      const checkServer = spawn('tmux', ['list-sessions']);
      const serverRunning = await new Promise<boolean>(resolve => {
        checkServer.on('exit', (code) => resolve(code === 0 || code === 1));
        checkServer.on('error', () => resolve(false));
      });
      
      if (!serverRunning) {
        console.log('[Orchestrator] Starting tmux server...');
        const startServer = spawn('tmux', ['new-session', '-d', '-s', 'maifarm-keepalive']);
        await new Promise(resolve => {
          startServer.on('exit', () => resolve(null));
          setTimeout(() => resolve(null), 500);
        });
      }
      
      // Create new session with proper window
      await new Promise((resolve, reject) => {
        const createSession = spawn('tmux', ['new-session', '-d', '-s', sessionName, '-n', 'agents']);
        createSession.on('exit', (code) => {
          if (code === 0) resolve(null);
          else reject(new Error(`Failed to create session: exit code ${code}`));
        });
      });
      
      // Create additional panes
      for (let i = 1; i < agentCount; i++) {
        await new Promise((resolve) => {
          const splitPane = spawn('tmux', ['split-window', '-t', `${sessionName}:agents`]);
          splitPane.on('exit', () => resolve(null));
          setTimeout(() => resolve(null), 100);
        });
      }
      
      // Tile the layout
      await new Promise((resolve) => {
        const tileLayout = spawn('tmux', ['select-layout', '-t', `${sessionName}:agents`, 'tiled']);
        tileLayout.on('exit', () => resolve(null));
        setTimeout(() => resolve(null), 100);
      });
      
      // Set pane titles from agents
      const agentNames = agentsResult.rows.map(a => a.name || `Agent ${a.id}`);
      await this.setPaneTitles(sessionName, agentNames, agentCount);
      
      // Send recovery message to each pane
      for (let i = 0; i < agentCount; i++) {
        const paneId = `${sessionName}:agents.${i}`;
        const agentName = agentNames[i] || `Agent ${i + 1}`;
        const message = `echo "Session recovered for ${agentName} - Ready to continue"`;
        
        await new Promise((resolve) => {
          const sendMessage = spawn('tmux', ['send-keys', '-t', paneId, message, 'Enter']);
          sendMessage.on('exit', () => resolve(null));
          setTimeout(() => resolve(null), 100);
        });
      }
      
      console.log(`[Orchestrator] Successfully recovered session ${sessionName} for farm ${farmId}`);
      
      // Broadcast recovery success
      websocketManager.broadcast('farm:session:recovered', {
        farmId,
        sessionName,
        agentCount,
        timestamp: new Date()
      });
      
      return true;
      
    } catch (error) {
      console.error(`[Orchestrator] Failed to recover session for farm ${farmId}:`, error);
      return false;
    }
  }

  private async attemptAgentRevival(farmProcess: FarmProcess, sessionName: string, health: TmuxSessionHealth): Promise<void> {
    console.log(`[Orchestrator] Attempting agent revival for session ${sessionName} - ${health.zombiePanes} unresponsive agents`);
    
    try {
      const agentHealthMap = tmuxHealthManager.getAgentHealth(sessionName);
      
      if (agentHealthMap) {
        for (const [agentId, agentHealth] of agentHealthMap) {
          if (agentHealth.status === 'unresponsive' || agentHealth.status === 'dead') {
            console.log(`[Orchestrator] Attempting to revive agent ${agentId} in session ${sessionName}`);
            
            // Try sending a series of recovery commands to the unresponsive pane
            const paneId = `${sessionName}:agents.${agentId}`;
            
            // Clear any stuck input
            spawn('tmux', ['send-keys', '-t', paneId, 'C-c']);
            
            setTimeout(() => {
              // Send a simple command to check if agent is responsive
              spawn('tmux', ['send-keys', '-t', paneId, 'echo "Agent revival check"', 'C-m']);
            }, 1000);
            
            setTimeout(() => {
              // If still unresponsive, try more aggressive measures
              spawn('tmux', ['send-keys', '-t', paneId, 'C-z', 'bg', 'C-m']);
            }, 3000);
            
            // Update agent status to indicate revival attempt
            const agent = farmProcess.agents.get(agentId);
            if (agent) {
              agent.status = 'reviving';
            }
            
            // Broadcast agent revival attempt
            websocketManager.broadcast({
              type: 'agent:revival',
              payload: {
                farmId: farmProcess.farmId,
                sessionName,
                agentId,
                paneId,
                status: 'revival_initiated',
                timestamp: new Date()
              }
            });
          }
        }
      }
      
    } catch (error) {
      console.error(`[Orchestrator] Agent revival failed for session ${sessionName}:`, error);
    }
  }
}

export const orchestratorService = new OrchestratorService();

// Enhanced launch function that includes barn integration
export interface EnhancedLaunchOptions extends LaunchOptions {
  autoBarnDiscovery?: boolean; // Automatically discover relevant barn items
  barnSearchQuery?: string;    // Search query for barn items
}

export async function launchFarmWithBarnIntegration(options: EnhancedLaunchOptions): Promise<string> {
  // Auto-discover barn items if requested
  if (options.autoBarnDiscovery) {
    const searchQuery = {
      searchText: options.barnSearchQuery || options.description || options.prompt.substring(0, 100)
    };
    
    const relevantItems = await barnCatalogService.searchCatalog(searchQuery);
    if (relevantItems.length > 0) {
      console.log(`[Orchestrator] Auto-discovered ${relevantItems.length} relevant barn items`);
      options.includeBarnCatalog = true;
      options.barnReferences = relevantItems.slice(0, 5).map(item => item.reference);
    }
  }
  
  return await multiClaudeService.launchFarm(options);
}