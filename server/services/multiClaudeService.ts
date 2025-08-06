import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { websocketManager } from '../websocket/websocketManager';
import { aiProviderManager, AIProvider } from '../config/aiProviders';

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
  status: 'launching' | 'running' | 'stopping' | 'stopped' | 'error';
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
  contextFiles?: string[];  // Add context files support
  staggerDelay?: number;    // Delay between agent launches
  debug?: boolean;          // Enable debug mode
  provider?: 'claude' | 'qwen';  // AI provider selection
}

class MultiClaudeService extends EventEmitter {
  private farmProcesses: Map<string, FarmProcess> = new Map();
  private readonly MULTI_CLAUDE_PATH = path.join(process.cwd(), 'multi_claude.py');
  private readonly COORDINATION_PATH = '/tmp/claude_coordination';
  private readonly BUFFER_LIMIT = 1000; // Lines per agent
  private sessionCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.setupCoordinationWatcher();
    this.startSessionMonitoring();
  }

  private async checkTmuxSession(sessionName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const checkProcess = spawn('tmux', ['has-session', '-t', sessionName]);
      checkProcess.on('exit', (code) => resolve(code === 0));
    });
  }

  private async getTmuxPaneCount(sessionName: string): Promise<number> {
    return new Promise((resolve) => {
      const listProcess = spawn('tmux', ['list-panes', '-t', `${sessionName}:0`, '-F', '#{pane_index}']);
      let output = '';
      listProcess.stdout?.on('data', (data) => { output += data.toString(); });
      listProcess.on('exit', (code) => {
        if (code === 0) {
          const panes = output.trim().split('\n').filter(Boolean);
          resolve(panes.length);
        } else {
          resolve(0);
        }
      });
    });
  }

  private async getClaudeAgentId(sessionName: string, paneIndex: number): Promise<string | null> {
    return new Promise((resolve) => {
      // Capture first few lines to look for Claude agent ID
      const captureProcess = spawn('tmux', [
        'capture-pane',
        '-t', `${sessionName}:0.${paneIndex}`,
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
      status: 'running',
      startTime: new Date(),
      terminalBuffers: new Map()
    };
    
    // Initialize agents based on panes
    for (let i = 0; i < agentCount; i++) {
      farmProcess.agents.set(i, {
        id: i,
        paneId: `${tmuxSession}:0.${i}`,
        status: 'ready'
      });
      farmProcess.terminalBuffers.set(i, []);
    }
    
    return farmProcess;
  }

  private startSessionMonitoring() {
    // Periodically check for orphaned tmux sessions
    this.sessionCheckInterval = setInterval(async () => {
      for (const [processId, farmProcess] of this.farmProcesses.entries()) {
        if (farmProcess.tmuxSession) {
          const exists = await this.checkTmuxSession(farmProcess.tmuxSession);
          
          // Check if session exists and update status accordingly
          if (!exists && farmProcess.status === 'running') {
            // Session disappeared
            farmProcess.status = 'stopped';
            websocketManager.broadcast({
              type: 'farm:status',
              payload: {
                farmId: farmProcess.farmId,
                processId,
                status: 'stopped'
              }
            });
          } else if (exists && (farmProcess.status === 'launching' || farmProcess.status === 'stopped')) {
            // Session exists but farm is still launching or was stopped
            const paneCount = await this.getTmuxPaneCount(farmProcess.tmuxSession);
            
            if (paneCount > 0) {
              // Update to running status
              farmProcess.status = 'running';
              
              // Update agent tracking with actual panes
              farmProcess.agents.clear();
              for (let i = 0; i < paneCount; i++) {
                farmProcess.agents.set(i, {
                  id: i,
                  paneId: `${farmProcess.tmuxSession}:0.${i}`,
                  status: 'ready'
                });
              }
              
              // Broadcast status update
              websocketManager.broadcast({
                type: 'farm:status',
                payload: {
                  farmId: farmProcess.farmId,
                  processId,
                  status: 'running',
                  agentCount: paneCount
                }
              });
              
              // Broadcast tmux ready event
              websocketManager.broadcast({
                type: 'farm:tmux:ready',
                payload: {
                  farmId: farmProcess.farmId,
                  processId,
                  sessionName: farmProcess.tmuxSession,
                  paneCount,
                  timestamp: new Date()
                }
              });
              
              // Also emit simple event for compatibility
              websocketManager.broadcast('farm:tmux:ready', {
                farmId: farmProcess.farmId,
                processId,
                sessionName: farmProcess.tmuxSession,
                paneCount,
                timestamp: new Date()
              });
              
              // Also emit multi-claude status
              websocketManager.broadcast({
                type: 'multi-claude:status',
                payload: {
                  farmId: farmProcess.farmId,
                  processId,
                  status: 'running',
                  sessionName: farmProcess.tmuxSession,
                  agents: paneCount
                }
              });
            }
          }
        }
      }
    }, 1000); // Check every 1 second for even faster detection
  }

  private async setupCoordinationWatcher() {
    // Watch the coordination directory for agent updates
    try {
      await fs.access(this.COORDINATION_PATH);
    } catch {
      await fs.mkdir(this.COORDINATION_PATH, { recursive: true });
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
            websocketManager.broadcast({
              type: 'agent:updated',
              payload: {
                farmId: farmProcess.farmId,
                agentUid: uid,
                ...agentData
              }
            });
          }
        }
      } catch (error) {
        // File might not exist yet, ignore
      }
    }, 1000);
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
    console.log(`[MultiClaude] Starting farm launch for ${options.farmId}`);
    
    // Validate that multi_claude.py exists
    try {
      await fs.access(this.MULTI_CLAUDE_PATH);
      console.log(`[MultiClaude] Found multi_claude.py at ${this.MULTI_CLAUDE_PATH}`);
    } catch (error) {
      console.error(`[MultiClaude] Script not found at ${this.MULTI_CLAUDE_PATH}`);
      throw new Error(`Multi-Claude script not found at ${this.MULTI_CLAUDE_PATH}`);
    }
    
    const processId = uuidv4();
    const tmuxSession = `farm_${options.farmId.substring(0, 8)}`;
    console.log(`[MultiClaude] Using tmux session name: ${tmuxSession}`);

    // Check if session already exists and is running
    const sessionExists = await this.checkTmuxSession(tmuxSession);
    if (sessionExists) {
      console.log(`[MultiClaude] Session ${tmuxSession} already exists, reusing it`);
      // Create tracking for existing session
      const farmProcess = await this.createTrackingForExistingSession(
        processId,
        options.farmId,
        tmuxSession,
        options.numberOfAgents
      );
      this.farmProcesses.set(processId, farmProcess);
      
      // Broadcast that we're using an existing session
      websocketManager.broadcast({
        type: 'farm:launched',
        payload: {
          farmId: options.farmId,
          processId,
          tmuxSession,
          agentCount: paneCount || options.numberOfAgents,
          timestamp: new Date(),
          existingSession: true
        }
      });
      
      // Also emit simple event for compatibility
      websocketManager.broadcast('farm:launched', {
        farmId: options.farmId,
        processId,
        tmuxSession,
        agentCount: paneCount || options.numberOfAgents,
        timestamp: new Date(),
        existingSession: true
      });
      
      // Also broadcast tmux ready immediately since session exists
      websocketManager.broadcast({
        type: 'farm:tmux:ready',
        payload: {
          farmId: options.farmId,
          processId,
          sessionName: tmuxSession,
          agentCount: paneCount || options.numberOfAgents
        }
      });
      
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

    // Create prompt file if YAML is provided
    let promptFilePath: string | undefined;
    if (options.yamlContent) {
      promptFilePath = path.join('/tmp', `farm_${processId}.yaml`);
      await fs.writeFile(promptFilePath, options.yamlContent);
    }

    // Build command arguments
    const args: string[] = [
      this.MULTI_CLAUDE_PATH,
      '-n', options.numberOfAgents.toString(),
      '-s', tmuxSession,
      '--farm-id', options.farmId  // Pass farm ID to Python script
    ];
    
    // Add harvest ID if provided
    if ((options as any).harvestId) {
      args.push('--harvest-id', (options as any).harvestId);
    }

    if (promptFilePath) {
      args.push('--prompt-file', promptFilePath);
    } else {
      args.push('-p', options.prompt);
    }
    
    console.log(`[MultiClaude] Launch command: python3 ${args.join(' ')}`);
    console.log(`[MultiClaude] Number of agents: ${options.numberOfAgents}`);

    if (options.steps && options.steps.length > 0) {
      args.push('--steps', ...options.steps);
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
    
    // Enable debug mode for better error tracking
    if (options.debug || process.env.NODE_ENV === 'development') {
      args.push('--debug');
    }

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

    console.log(`[MultiClaude] Launching with command: python3 ${args.join(' ')} [Provider: ${selectedProvider}]`);
    
    // Get provider-specific environment variables
    const providerEnv = aiProviderManager.getProviderEnvironment(selectedProvider as AIProvider);
    
    // Launch the multi_claude.py process with better error handling
    const childProcess = spawn('python3', args, {
      cwd: process.cwd(),
      env: { 
        ...providerEnv,
        PYTHONUNBUFFERED: '1',  // Ensure Python output is not buffered
      },
      detached: false,  // Keep attached to parent process
      stdio: ['ignore', 'pipe', 'pipe']  // Capture stdout and stderr
    });

    // Create farm process tracking (must be created before using in timeout)
    const farmProcess: FarmProcess = {
      id: processId,
      farmId: options.farmId,
      process: childProcess,
      agents: new Map(),
      tmuxSession,
      status: 'launching',
      startTime: new Date(),
      terminalBuffers: new Map()
    };

    // Initialize agent tracking
    for (let i = 0; i < options.numberOfAgents; i++) {
      farmProcess.agents.set(i, {
        id: i,
        paneId: `${tmuxSession}:0.${i}`,  // multi_claude.py creates window 0 by default
        status: 'starting'
      });
      farmProcess.terminalBuffers.set(i, []);
    }

    this.farmProcesses.set(processId, farmProcess);

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

    // Set timeout for process initialization (longer for multiple agents)
    const initTimeout = setTimeout(() => {
      if (farmProcess.status === 'launching') {
        console.warn(`[Farm ${options.farmId}] Launch taking longer than expected, checking tmux session...`);
        
        // Check if tmux session actually exists before declaring failure
        this.checkTmuxSession(tmuxSession).then(exists => {
          if (exists) {
            console.log(`[Farm ${options.farmId}] Tmux session exists, updating status`);
            farmProcess.status = 'running';
            websocketManager.broadcast({
              type: 'farm:status',
              payload: {
                farmId: options.farmId,
                processId,
                status: 'running'
              }
            });
          } else {
            console.error(`[Farm ${options.farmId}] Launch timeout - no tmux session created`);
            childProcess.kill('SIGTERM');
            farmProcess.status = 'error';
            
            websocketManager.broadcast({
              type: 'farm:error',
              payload: {
                farmId: options.farmId,
                processId,
                error: 'Launch timeout - Claude Code agents failed to initialize',
                timestamp: new Date()
              }
            });
          }
        });
      }
    }, 20000); // 20 second timeout for launch check (faster detection)

    // Handle process output
    childProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      console.log(`[Farm ${options.farmId}] ${output}`);
      
      // Broadcast output for real-time monitoring in harvest terminals
      websocketManager.broadcast({
        type: 'farm:launch:output',
        payload: {
          farmId: options.farmId,
          processId,
          tmuxSession,
          output,
          timestamp: new Date()
        }
      });
      
      // Parse for Claude Code launch indicators
      if (output.includes('claude --dangerously-skip-permissions') || 
          output.includes('Claude Code') || 
          output.includes('waiting for Claude')) {
        console.log(`[Farm ${options.farmId}] Claude Code is launching...`);
        websocketManager.broadcast({
          type: 'farm:agents:launching',
          payload: {
            farmId: options.farmId,
            processId,
            message: 'Claude Code agents are starting up...'
          }
        });
      }
      
      // Check for critical errors in stdout
      if (output.includes('[!]') || output.includes('Error:') || output.includes('Failed')) {
        websocketManager.broadcast({
          type: 'farm:error',
          payload: {
            farmId: options.farmId,
            processId,
            error: output,
            timestamp: new Date()
          }
        });
      } else {
        // Broadcast status updates
        websocketManager.broadcast({
          type: 'farm:log',
          payload: {
            farmId: options.farmId,
            processId,
            message: output,
            timestamp: new Date()
          }
        });
      }

      // Parse for agent status changes
      this.parseAgentStatus(processId, output);
      
      // Check if launch was successful
      if ((output.includes('Created tmux session') || output.includes('[+] Created tmux session')) && farmProcess.status === 'launching') {
        farmProcess.status = 'running';
        
        // Immediately broadcast that tmux is ready
        console.log(`[MultiClaude] Tmux session created, broadcasting ready event`);
        websocketManager.broadcast({
          type: 'farm:tmux:ready',
          payload: {
            farmId: options.farmId,
            processId,
            sessionName: tmuxSession,
            timestamp: new Date()
          }
        });
      }
    });

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
      
      farmProcess.status = code === 0 ? 'stopped' : 'error';
      
      console.log(`[Farm ${options.farmId}] Process exited with code ${code}, signal ${signal}`);
      
      websocketManager.broadcast({
        type: 'farm:status',
        payload: {
          farmId: options.farmId,
          processId,
          status: farmProcess.status,
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
        console.log(`[MultiClaude] Tmux session ${tmuxSession} detected, starting monitoring`);
        
        // Update farm process to track the session directly
        farmProcess.status = 'running';
        
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
          // Update agent info based on actual panes
          farmProcess.agents.clear();
          for (let i = 0; i < paneCount; i++) {
            farmProcess.agents.set(i, {
              id: i,
              paneId: `${tmuxSession}:0.${i}`,
              status: 'ready'
            });
          }
        }
        
        this.startTerminalMonitoring(processId);
        
        websocketManager.broadcast({
          type: 'farm:status',
          payload: {
            farmId: options.farmId,
            processId,
            status: 'running'
          }
        });
      } else if (farmProcess.status === 'launching') {
        // Session wasn't created, mark as error
        farmProcess.status = 'error';
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
    }, 5000); // Wait for agents to initialize (reduced for faster detection)

    return processId;
  }

  private parseAgentStatus(processId: string, output: string) {
    const farmProcess = this.farmProcesses.get(processId);
    if (!farmProcess) return;

    // Parse agent status updates from multi_claude.py output
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
      if (farmProcess.status !== 'running') {
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
        `${session}:0.${agentId}`,          // multi_claude uses window 0
        `${session}:agents.${agentId}`,     // Alternative format
        `claude_agents:0.${agentId}`,       // Default session with window 0
        `claude_agents:agents.${agentId}`   // Default with alternative format
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
      console.warn(`[MultiClaude] Agent ${agentId} not ready, waiting...`);
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Handle multi-line commands like multi_claude.py
    if (command.includes('\n')) {
      return this.sendMultiLineCommand(processId, agentId, command);
    }

    // Send single-line command to tmux pane
    return new Promise((resolve, reject) => {
      const sendProcess = spawn('tmux', [
        'send-keys',
        '-t', `${farmProcess.tmuxSession}:0.${agentId}`,  // Use window 0 like multi_claude.py
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

    console.log(`[MultiClaude] Stopping farm ${farmProcess.farmId} with ${farmProcess.agents.size} agents`);
    farmProcess.status = 'stopping';

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

    // Kill the multi_claude process if it exists
    if (farmProcess.process) {
      farmProcess.process.kill('SIGTERM');
    }

    // Kill tmux session
    spawn('tmux', ['kill-session', '-t', farmProcess.tmuxSession]);

    // Clear agent data
    farmProcess.agents.clear();
    farmProcess.terminalBuffers.clear();
    farmProcess.status = 'stopped';
    
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
    console.log(`[MultiClaude] Farm ${farmProcess.farmId} stopped and all agents cleaned up`);
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
    farmProcess.status = 'running';
    
    websocketManager.broadcast({
      type: 'farm:status',
      payload: {
        farmId: farmProcess.farmId,
        processId,
        status: 'running'
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
          '-t', `${farmProcess.tmuxSession}:0.${agentId}`
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
          '-t', `${farmProcess.tmuxSession}:0.${agentId}`,
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
    
    // Ready indicators from multi_claude.py
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
        
        console.error(`[MultiClaude] Agent ${agentId} API Error: ${errorMessage}`);
        
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

    // Warning patterns
    const warningPatterns = [
      /warning/i,
      /approaching.*limit/i,
      /slow.*response/i,
      /degraded.*performance/i
    ];

    // Check for warnings
    for (const pattern of warningPatterns) {
      if (pattern.test(output)) {
        const warningMatch = output.match(/.*warning.*/gi);
        const warningMessage = warningMatch ? warningMatch[0] : 'Warning detected';
        
        console.warn(`[MultiClaude] Agent ${agentId} Warning: ${warningMessage}`);
        
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
        break;
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
    const tmuxSession = `farm_${farmId.substring(0, 8)}`;
    const sessionExists = await this.checkTmuxSession(tmuxSession);
    
    if (sessionExists) {
      // Session exists, get current state
      console.log(`[MultiClaude] Found active session ${tmuxSession}`);
      
      const paneCount = await this.getTmuxPaneCount(tmuxSession);
      const agents = [];
      
      // Capture Claude agent IDs from panes if possible
      for (let i = 0; i < paneCount; i++) {
        const agentId = await this.getClaudeAgentId(tmuxSession, i);
        agents.push({
          id: i,
          paneId: `${tmuxSession}:0.${i}`,
          status: 'ready',
          uid: agentId || `agent_${i}`
        });
      }
      
      // If we have a tracked process, update it
      if (farmProcess) {
        farmProcess.status = 'running';
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
        status: 'running',
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
      isRunning: farmProcess.status === 'running'
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
}

export const multiClaudeService = new MultiClaudeService();