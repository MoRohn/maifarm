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
import { tmuxHealthManager } from './tmuxHealthManager';
import { harvestSessionCache } from './harvestSessionCache';
import { harvestSessionBroadcaster } from './harvestSessionBroadcaster';
import { terminalStreamService } from './terminalStreamService';
import { logger } from '../utils/logger';
import { getFarmAgentName } from '../utils/farmAgentNames';
import { XENO_UUID } from '../utils/systemUuids';

interface XenoSyncLaunchOptions {
  farmId: string;
  name: string;
  description: string;
  numberOfAgents: number;
  prompt: string;
  yamlContent?: string;
  steps?: string[];
  mode?: 'parallel' | 'collaborative';
  workingDirectory?: string;
  contextFiles?: string[];
  debug?: boolean;
  timeout?: number;
  terminalMode?: 'tmux' | 'tmux-windows' | 'separate'; // Terminal display mode
  correlationId?: string; // Request correlation ID for tracing
}

interface XenoSyncProcess {
  id: string;
  farmId: string;
  process: ChildProcess;
  sessionId: string;
  status: 'launching' | 'active' | 'stopping' | 'stopped' | 'error';
  startTime: Date;
  numberOfAgents: number;
  mode: 'parallel' | 'collaborative';
}

interface XenoSyncConfig {
  log_level: string;
  sessions_dir: string;
  prompts_dir: string;
  claude_command: string;
  claude_args: string[];
  num_agents: number;
  execution_mode: 'parallel' | 'collaborative';
  agent_monitor_interval: number;
  message_grace_period: number;
  use_tmux: boolean;
}

/**
 * XenoSync Service - Wrapper for XenoSync multi-agent orchestrator
 * Provides an alternative orchestration engine that uses XenoSync's Python implementation
 */
class XenoSyncService extends EventEmitter {
  private processes: Map<string, XenoSyncProcess> = new Map();
  private readonly XENOSYNC_PATH = path.join(process.cwd(), 'server/orchestrators/xenosync');
  private readonly XENOSYNC_SESSIONS_DIR: string;
  private readonly COORDINATION_PATH: string;
  private paths = pathConfig.getPaths();

  constructor() {
    super();
    this.XENOSYNC_SESSIONS_DIR = path.join(this.paths.MAIBARN_ROOT, 'xenosync-sessions');
    this.COORDINATION_PATH = this.paths.COORDINATION_DIR;
    this.setupDirectories();
  }

  private setupDirectories() {
    try {
      // Create XenoSync sessions directory synchronously in constructor
      fsSync.mkdirSync(this.XENOSYNC_SESSIONS_DIR, { recursive: true });
      fsSync.mkdirSync(path.join(this.XENOSYNC_SESSIONS_DIR, 'coordination'), { recursive: true });
      logger.info('[XenoSyncService] Directories initialized');
    } catch (error) {
      logger.error('[XenoSyncService] Failed to setup directories:', error);
    }
  }

  /**
   * Validate that Claude is the selected AI provider
   */
  private validateClaudeProvider(): void {
    const currentProvider = aiProviderManager.getDefaultProvider();
    if (currentProvider !== 'claude') {
      throw new Error('XenoSync requires Claude Code as the AI provider. Please switch to Claude in Settings.');
    }
  }

  /**
   * Validate and normalize launch options
   */
  private validateAndNormalizeOptions(options: XenoSyncLaunchOptions): void {
    // Validate required fields
    if (!options.farmId) {
      throw new Error('Farm ID is required for XenoSync launch');
    }
    
    if (!options.name) {
      throw new Error('Farm name is required for XenoSync launch');
    }
    
    if (!options.prompt && !options.yamlContent) {
      throw new Error('Either prompt or yamlContent is required for XenoSync launch');
    }
    
    // Ensure minimum 2 agents (XenoSync requirement)
    if (options.numberOfAgents < 2) {
      logger.warn(`[XenoSyncService] Adjusting agent count from ${options.numberOfAgents} to 2 (minimum required)`);
      options.numberOfAgents = 2;
    }
    
    // Normalize timeout to milliseconds if needed
    if (options.timeout) {
      // If timeout is less than 1000, assume it's in seconds and convert to milliseconds
      if (options.timeout < 1000) {
        logger.info(`[XenoSyncService] Converting timeout from ${options.timeout}s to ${options.timeout * 1000}ms`);
        options.timeout = options.timeout * 1000;
      }
      
      // Ensure minimum timeout of 60 seconds
      const MIN_TIMEOUT = 60000; // 1 minute
      if (options.timeout < MIN_TIMEOUT) {
        logger.warn(`[XenoSyncService] Timeout ${options.timeout}ms is below minimum, setting to ${MIN_TIMEOUT}ms`);
        options.timeout = MIN_TIMEOUT;
      }
    } else {
      // Default timeout to 30 minutes if not specified
      options.timeout = 1800000; // 30 minutes in milliseconds
      logger.info(`[XenoSyncService] No timeout specified, using default: ${options.timeout}ms`);
    }
    
    // Set default mode if not specified
    if (!options.mode) {
      options.mode = 'parallel';
      logger.info(`[XenoSyncService] No mode specified, using default: ${options.mode}`);
    }
    
    // Clean and validate prompt if provided
    if (options.prompt) {
      // Remove any potentially problematic characters that could break YAML
      options.prompt = options.prompt.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      
      // Ensure prompt is not empty after cleaning
      if (options.prompt.length === 0) {
        throw new Error('Prompt cannot be empty after sanitization');
      }
    }
    
    // Validate mode
    if (options.mode !== 'parallel' && options.mode !== 'collaborative') {
      logger.warn(`[XenoSyncService] Invalid mode '${options.mode}', defaulting to 'parallel'`);
      options.mode = 'parallel';
    }
  }

  /**
   * Create XenoSync configuration file
   */
  private async createXenoSyncConfig(sessionId: string, options: XenoSyncLaunchOptions): Promise<string> {
    // Check if Claude API key is available
    await aiProviderManager.refreshApiKeys();
    const providerEnv = aiProviderManager.getProviderEnvironment(AIProvider.CLAUDE);
    const hasApiKey = !!(providerEnv.ANTHROPIC_API_KEY || providerEnv.CLAUDE_API_KEY);
    
    // If API key is available, add --api-key flag to bypass initial prompt
    const claudeArgs = ['--dangerously-skip-permissions'];
    if (hasApiKey) {
      // Add flags to bypass the initial API key prompt
      claudeArgs.push('--continue', '--no-interactive');
      logger.info('[XenoSyncService] Claude API key detected, adding bypass flags');
    }
    
    const config: any = {
      log_level: options.debug ? 'DEBUG' : 'INFO',
      sessions_dir: this.XENOSYNC_SESSIONS_DIR,
      prompts_dir: path.join(this.XENOSYNC_PATH, 'prompts'),
      claude_command: 'claude',
      claude_args: claudeArgs,
      num_agents: Math.max(2, options.numberOfAgents), // XenoSync requires minimum 2 agents
      execution_mode: options.mode || 'parallel',
      agent_monitor_interval: 30,
      message_grace_period: 60,
      use_tmux: options.terminalMode !== 'separate', // Disable tmux for separate terminal mode
      terminal_mode: options.terminalMode || 'tmux', // Pass terminal mode to XenoSync
      auto_open_terminal: false,  // Disable automatic terminal opening in server environment
      // Pass API key availability flag to XenoSync
      has_api_key: hasApiKey
    };

    // Ensure the directory exists before writing the file
    await fs.mkdir(this.XENOSYNC_SESSIONS_DIR, { recursive: true });
    
    const configPath = path.join(this.XENOSYNC_SESSIONS_DIR, `config-${sessionId}.yaml`);
    await fs.writeFile(configPath, yaml.dump(config), 'utf-8');
    return configPath;
  }

  /**
   * Create XenoSync prompt file from MaiFarm options
   */
  private async createPromptFile(sessionId: string, options: XenoSyncLaunchOptions): Promise<string> {
    // Clean the prompt to ensure it's properly formatted for YAML
    // Go Wild mode may add multiline prompts that break YAML
    const cleanPrompt = options.prompt.trim().replace(/\n+/g, ' ').replace(/\s+/g, ' ');
    
    let promptData: any = {
      name: options.name,
      description: options.description,
      initial_prompt: cleanPrompt,
      numberOfAgents: options.numberOfAgents,
      steps: options.steps ? options.steps.map((step, i) => ({
        number: i + 1,
        content: step
      })) : []
    };

    // If YAML content is provided, merge it with prompt data
    if (options.yamlContent) {
      try {
        const parsedYaml = yaml.load(options.yamlContent) as any;
        
        // Merge the parsed YAML with promptData, preserving important fields
        promptData = {
          ...parsedYaml,  // Start with the generated YAML
          ...promptData,  // Override with explicit prompt data
          // Preserve specific fields from parsed YAML if not in promptData
          agents: parsedYaml.agents || promptData.agents,
          task: parsedYaml.task || promptData.task,
          timeout: parsedYaml.timeout || promptData.timeout
        };
        
        // Extract steps if available and not already set
        if (!options.steps && parsedYaml.steps) {
          promptData.steps = parsedYaml.steps.map((step: any, i: number) => ({
            number: i + 1,
            content: step.content || step.description || step
          }));
        }
      } catch (error) {
        logger.warn('[XenoSyncService] Failed to parse YAML content:', error);
      }
    }

    // Ensure the directory exists before writing the file
    await fs.mkdir(this.XENOSYNC_SESSIONS_DIR, { recursive: true });
    
    const promptPath = path.join(this.XENOSYNC_SESSIONS_DIR, `prompt-${sessionId}.yaml`);
    await fs.writeFile(promptPath, yaml.dump(promptData), 'utf-8');
    return promptPath;
  }

  /**
   * Launch a farm using XenoSync orchestrator
   */
  async launchFarm(options: XenoSyncLaunchOptions): Promise<string> {
    const correlationId = options.correlationId || `xeno-${options.farmId.substring(0, 8)}-${Date.now()}`;
    
    logger.info('[XenoSyncService] Launching farm with XenoSync:', {
      correlationId,
      farmId: options.farmId,
      name: options.name,
      agents: options.numberOfAgents,
      mode: options.mode || 'parallel'
    });

    // Validate and normalize parameters
    this.validateAndNormalizeOptions(options);

    // Validate Claude provider
    this.validateClaudeProvider();

    const processId = uuidv4();
    const sessionId = `farm-${options.farmId.substring(0, 8)}`;
    
    // XenoSync should NOT create farms - it should only orchestrate existing ones
    let actualFarmId = options.farmId;
    try {
      const { farmManager } = await import('./farmManager');
      let farm = await farmManager.getFarm(options.farmId);
      
      if (!farm) {
        // Don't create a farm - this is an error condition
        logger.error(`[XenoSyncService] Farm ${options.farmId} does not exist! XenoSync requires an existing farm.`, { correlationId });
        throw new Error(`Farm ${options.farmId} not found. XenoSync can only orchestrate existing farms.`);
      } else {
        logger.info('[XenoSyncService] Using existing farm', { correlationId, farmId: actualFarmId });
      }
      
      // Update farm status to launching
      await farmManager.updateFarmStatus(actualFarmId, 'launching');
      
      // Broadcast XenoSync orchestrator selection with correlation ID
      websocketManager.broadcast('farm:orchestrator:selected', {
        correlationId,
        farmId: actualFarmId,
        orchestrator: 'xenosync',
        agentCount: options.numberOfAgents,
        mode: options.mode,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('[XenoSyncService] Failed to create/update farm:', error);
      // Continue anyway - the farm might be created by other means
    }

    try {
      // Create XenoSync configuration with error handling
      let configPath: string;
      let promptPath: string;
      
      try {
        configPath = await this.createXenoSyncConfig(sessionId, options);
      } catch (configError) {
        logger.error('[XenoSyncService] Failed to create XenoSync config:', configError);
        throw new Error(`Failed to create XenoSync configuration: ${configError.message}`);
      }
      
      try {
        promptPath = await this.createPromptFile(sessionId, options);
      } catch (promptError) {
        logger.error('[XenoSyncService] Failed to create prompt file:', { correlationId, error: promptError });
        throw new Error(`Failed to create prompt file: ${promptError.message}`);
      }

      // Create workspace for the farm if not exists
      const workspacePath = options.workingDirectory || 
        path.join(this.paths.FARM_WORKSPACES_ACTIVE, actualFarmId);
      await fs.mkdir(workspacePath, { recursive: true });

      // Save YAML content to workspace if provided
      if (options.yamlContent) {
        const yamlPath = path.join(workspacePath, 'farm.yaml');
        await fs.writeFile(yamlPath, options.yamlContent, 'utf-8');
        logger.info(`[XenoSyncService] Saved YAML configuration`, { correlationId, yamlPath });
      }

      // Build XenoSync command using MaiFarm-enhanced launcher for Harvest Terminal compatibility
      const launcherPath = path.join(process.cwd(), 'server', 'orchestrators', 'xenosync-maifarm-launcher.py');
      
      // Verify launcher exists, fallback to standard launcher if not found
      let usingMaiFarmLauncher = true;
      try {
        await fs.access(launcherPath);
        logger.info(`[XenoSyncService] Using MaiFarm-enhanced launcher`, { correlationId, launcherPath });
      } catch (error) {
        // Fallback to standard launcher
        const standardLauncherPath = path.join(process.cwd(), 'server', 'orchestrators', 'xenosync-launcher.py');
        try {
          await fs.access(standardLauncherPath);
          logger.info(`[XenoSyncService] Using standard launcher`, { correlationId, launcherPath: standardLauncherPath });
          usingMaiFarmLauncher = false;
        } catch (fallbackError) {
          logger.error(`[XenoSyncService] No XenoSync launcher found`, { correlationId });
          throw new Error(`XenoSync launcher not found. Please ensure XenoSync is properly installed.`);
        }
      }
      
      const actualLauncherPath = usingMaiFarmLauncher ? 
        launcherPath : 
        path.join(process.cwd(), 'server', 'orchestrators', 'xenosync-launcher.py');
      
      const xenosyncCommand = [
        'python3', actualLauncherPath,
        promptPath,
        '--agents', String(Math.max(2, options.numberOfAgents)),
        '--mode', options.mode || 'parallel',
        '--config', configPath,
        '--sessions-dir', this.XENOSYNC_SESSIONS_DIR,
        '--session-id', sessionId,
        '--farm-id', actualFarmId  // Pass farm ID for proper tmux session naming
      ];

      if (options.debug) {
        xenosyncCommand.push('--debug');
      }

      logger.info('[XenoSyncService] Starting XenoSync with command:', xenosyncCommand.join(' '));

      // Get Claude provider configuration with API key
      // First refresh API keys from database to get latest settings
      await aiProviderManager.refreshApiKeys();
      const providerEnv = aiProviderManager.getProviderEnvironment(AIProvider.CLAUDE);
      
      // Log API key status for debugging
      logger.info('[XenoSyncService] Claude API key status:', 
        providerEnv.ANTHROPIC_API_KEY ? `Configured (${providerEnv.ANTHROPIC_API_KEY.length} chars)` : 'NOT CONFIGURED');
      
      // Spawn XenoSync process with Claude API key in environment
      const xenosyncProcess = spawn(xenosyncCommand[0], xenosyncCommand.slice(1), {
        cwd: this.XENOSYNC_PATH,
        env: {
          ...process.env,
          ...providerEnv, // Include Claude API key and other provider settings
          PYTHONPATH: this.XENOSYNC_PATH,
          XENOSYNC_SESSIONS_DIR: this.XENOSYNC_SESSIONS_DIR,
          XENOSYNC_WORKSPACE: workspacePath,
          XENOSYNC_FARM_ID: actualFarmId,
          XENOSYNC_CONFIG: configPath,
          // Ensure Claude CLI can use the API key
          ANTHROPIC_API_KEY: providerEnv.ANTHROPIC_API_KEY || '',
          CLAUDE_API_KEY: providerEnv.CLAUDE_API_KEY || ''
        }
      });
      
      // Handle spawn errors
      if (!xenosyncProcess || !xenosyncProcess.pid) {
        logger.error('[XenoSyncService] Failed to spawn XenoSync process');
        throw new Error('Failed to spawn XenoSync process - check Python installation');
      }

      // Create process tracking object
      const processInfo: XenoSyncProcess = {
        id: processId,
        farmId: actualFarmId,  // Use the actual farm ID
        process: xenosyncProcess,
        sessionId,
        status: 'launching',
        startTime: new Date(),
        numberOfAgents: options.numberOfAgents,
        mode: options.mode || 'parallel'
      };

      this.processes.set(processId, processInfo);

      // Handle process output
      xenosyncProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        logger.info(`[XenoSync ${sessionId}] ${output}`);
        
        // Parse XenoSync status updates
        this.parseXenoSyncOutput(processId, output);
      });

      xenosyncProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        
        // Python logging sends INFO/DEBUG logs to stderr by default
        // Parse the log level from the Python logging format
        const lines = output.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          // Check if it's a Python log line with level (format: "YYYY-MM-DD HH:MM:SS,mmm - logger - LEVEL - message")
          if (line.includes(' - INFO - ')) {
            logger.info(`[XenoSync ${sessionId}] ${line}`);
          } else if (line.includes(' - DEBUG - ')) {
            logger.debug(`[XenoSync ${sessionId}] ${line}`);
          } else if (line.includes(' - WARNING - ') || line.includes(' - WARN - ')) {
            logger.warn(`[XenoSync ${sessionId}] ${line}`);
          } else if (line.includes(' - ERROR - ') || line.includes(' - CRITICAL - ')) {
            logger.error(`[XenoSync ${sessionId}] ${line}`);
          } else if (line.trim()) {
            // Default to info for non-formatted output (not an error just because it's on stderr)
            logger.info(`[XenoSync ${sessionId}] ${line}`);
          }
        }
      });

      xenosyncProcess.on('error', (error) => {
        logger.error(`[XenoSync ${sessionId}] Process error:`, error);
        processInfo.status = 'error';
        this.emit('xenosync:error', { processId, farmId: options.farmId, error });
      });

      xenosyncProcess.on('exit', (code, signal) => {
        logger.info(`[XenoSync ${sessionId}] Process exited with code ${code}, signal ${signal}`);
        processInfo.status = 'stopped';
        this.emit('xenosync:stopped', { processId, farmId: options.farmId, code, signal });
        this.processes.delete(processId);
      });

      // Wait for XenoSync to initialize
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Update status to active
      processInfo.status = 'active';
      
      // Update farm status to active
      try {
        const { farmManager } = await import('./farmManager');
        await farmManager.updateFarmStatus(actualFarmId, 'active');
      } catch (error) {
        logger.warn('[XenoSyncService] Failed to update farm status to active:', error);
      }
      
      // Setup terminal streaming for XenoSync tmux session
      await this.setupTerminalStreaming(sessionId, options.farmId, options.numberOfAgents);

      // Add farm to health monitor for crash detection
      // CRITICAL FIX: Ensure consistent session naming for XenoSync
      const tmuxSession = `farm-${options.farmId.substring(0, 8)}`;
      process.env.TMUX_TMPDIR = '/tmp'; // Set globally for this process
      const { tmuxHealthMonitor } = await import('./tmuxHealthMonitor');
      tmuxHealthMonitor.addFarm(options.farmId, tmuxSession, options.numberOfAgents);
      logger.info(`[XenoSyncService] Added farm ${options.farmId} to health monitoring`);

      // Emit launch success event
      this.emit('xenosync:launched', {
        processId,
        farmId: options.farmId,
        sessionId,
        numberOfAgents: options.numberOfAgents,
        mode: options.mode
      });

      // Broadcast farm status update
      websocketManager.broadcast('farm:status', {
        farmId: options.farmId,
        status: 'active',
        orchestrator: 'xenosync',
        sessionId
      });

      return processId;

    } catch (error) {
      logger.error('[XenoSyncService] Failed to launch farm:', error);
      
      // Clean up any resources that were partially created
      try {
        // Try to update farm status to failed
        const { farmManager } = await import('./farmManager');
        await farmManager.updateFarmStatus(options.farmId, 'failed');
        
        // Broadcast failure event
        websocketManager.broadcast('farm:failed', {
          farmId: options.farmId,
          error: error.message || 'Unknown error',
          timestamp: new Date()
        });
      } catch (cleanupError) {
        logger.error('[XenoSyncService] Error during cleanup:', cleanupError);
      }
      
      // Throw a more informative error
      if (error.message && error.message.includes('API key')) {
        throw new Error(`XenoSync launch failed: Claude API key not configured. Please add your API key in Settings.`);
      } else if (error.message && error.message.includes('Python')) {
        throw new Error(`XenoSync launch failed: Python 3 is required but not found. Please install Python 3.`);
      } else if (error.message && error.message.includes('tmux')) {
        throw new Error(`XenoSync launch failed: tmux is required but not found. Please install tmux.`);
      } else {
        throw new Error(`XenoSync launch failed: ${error.message || 'Unknown error'}`);
      }
    }
  }

  /**
   * Parse XenoSync output for status updates
   */
  private parseXenoSyncOutput(processId: string, output: string) {
    const process = this.processes.get(processId);
    if (!process) return;

    // Check for agent status updates
    if (output.includes('Agent') && output.includes('started')) {
      const agentMatch = output.match(/Agent\s+(\d+)\s+started/);
      if (agentMatch) {
        const agentId = parseInt(agentMatch[1]);
        this.emit('xenosync:agent:started', {
          processId,
          farmId: process.farmId,
          agentId
        });
        
        // Broadcast agent started event for UI
        websocketManager.broadcast('xenosync:agent:started', {
          farmId: process.farmId,
          agentId,
          agentName: getFarmAgentName(agentId + 1),
          status: 'active',
          timestamp: new Date()
        });
      }
    }

    // Check for task claims
    if (output.includes('claimed task') || output.includes('working on')) {
      this.emit('xenosync:task:claimed', {
        processId,
        farmId: process.farmId,
        output
      });
      
      // Broadcast task progress for UI
      websocketManager.broadcast('xenosync:task:progress', {
        farmId: process.farmId,
        message: output,
        timestamp: new Date()
      });
    }

    // Check for completion
    if (output.includes('All tasks completed') || output.includes('Session complete')) {
      this.emit('xenosync:completed', {
        processId,
        farmId: process.farmId
      });
      
      // Broadcast completion event for UI
      websocketManager.broadcast('xenosync:session:completed', {
        farmId: process.farmId,
        status: 'completed',
        timestamp: new Date()
      });
      
      // Update farm status to trigger harvest collection
      this.handleFarmCompletion(process.farmId);
    }
  }

  /**
   * Setup terminal streaming for XenoSync tmux session
   */
  private async setupTerminalStreaming(sessionId: string, farmId: string, numberOfAgents: number) {
    try {
      // XenoSync now uses MaiFarm's standard session naming convention
      const tmuxSession = `farm-${farmId.substring(0, 8)}`;
      
      // Wait for the session to be created
      const sessionReady = await this.waitForTmuxSession(tmuxSession, 30000);
      
      if (!sessionReady) {
        logger.warn(`[XenoSyncService] Tmux session ${tmuxSession} not ready after timeout`);
        return;
      }
      
      logger.info(`[XenoSyncService] Found tmux session: ${tmuxSession}`);
      
      // Wait for panes to be ready
      const panesReady = await this.verifyPanesReady(tmuxSession, numberOfAgents, 15000);
      if (panesReady) {
        logger.info(`[XenoSyncService] All ${numberOfAgents} panes ready in session ${tmuxSession}`);
        
        // Emit session verified event
        websocketManager.broadcast('session:verified', {
          farmId,
          sessionName: tmuxSession,
          agentCount: numberOfAgents,
          status: 'ready',
          timestamp: new Date()
        });
      } else {
        logger.warn(`[XenoSyncService] Not all panes ready for session ${tmuxSession}, continuing anyway`);
      }

      // Setup terminal streaming for all agent panes at once
      try {
        await terminalStreamService.startStreaming(
          tmuxSession,  // The tmux session name (e.g., "farm-abc123")
          farmId,       // The farm ID
          numberOfAgents // Total number of agents
        );
        
        logger.info(`[XenoSyncService] Terminal streaming setup for ${numberOfAgents} agents in session ${tmuxSession}`);
        
        // Log individual agent names for clarity
        for (let i = 0; i < numberOfAgents; i++) {
          const agentName = getFarmAgentName(i + 1); // Agent numbering starts from 1
          logger.debug(`[XenoSyncService] Agent ${i}: ${agentName}`);
        }
      } catch (error) {
        logger.error(`[XenoSyncService] Failed to setup terminal streaming:`, error);
      }
    } catch (error) {
      logger.error('[XenoSyncService] Failed to setup terminal streaming:', error);
    }
  }

  /**
   * Wait for a tmux session to be created (optimized with better delays and consistency)
   */
  private async waitForTmuxSession(sessionName: string, maxWaitMs: number = 30000): Promise<boolean> {
    const startTime = Date.now();
    let retries = 0;
    let delay = 50; // PERFORMANCE FIX: Start with 50ms instead of 100ms
    
    logger.info(`[XenoSyncService] Waiting for tmux session ${sessionName} to be ready...`);
    
    while (Date.now() - startTime < maxWaitMs) {
      try {
        // CRITICAL FIX: Always use TMUX_TMPDIR=/tmp for session visibility
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        // Ensure TMUX_TMPDIR is set in environment
        process.env.TMUX_TMPDIR = '/tmp';
        await execAsync(`TMUX_TMPDIR=/tmp tmux has-session -t ${sessionName} 2>/dev/null`);
        logger.info(`[XenoSyncService] Session ${sessionName} ready after ${retries} retries (${Date.now() - startTime}ms)`);
        return true;
      } catch (error) {
        retries++;
        
        // PERFORMANCE FIX: Better exponential backoff with cap
        const nextDelay = Math.min(delay * 1.2, 1000); // Max 1s delay, gentler exponential growth
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = nextDelay;
      }
    }
    
    logger.error(`[XenoSyncService] Session ${sessionName} not ready after ${maxWaitMs}ms (${retries} retries)`);
    return false;
  }

  /**
   * Verify that all expected panes are ready
   */
  private async verifyPanesReady(sessionName: string, expectedCount: number, maxWaitMs: number = 15000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        // CRITICAL FIX: Check both window 0 and agents window for XenoSync compatibility
        let result;
        try {
          // Try agents window first (XenoSync uses this)
          result = await execAsync(`TMUX_TMPDIR=/tmp tmux list-panes -t ${sessionName}:agents -F '#{pane_index}' 2>/dev/null`);
        } catch {
          // Fallback to window 0 (standard orchestrator)
          result = await execAsync(`TMUX_TMPDIR=/tmp tmux list-panes -t ${sessionName}:0 -F '#{pane_index}' 2>/dev/null`);
        }
        const paneCount = result.stdout.trim().split('\n').filter(Boolean).length;
        
        if (paneCount >= expectedCount) {
          logger.info(`[XenoSyncService] All ${paneCount} panes ready in session ${sessionName}`);
          return true;
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    logger.warn(`[XenoSyncService] Panes not ready in ${sessionName} after ${maxWaitMs}ms`);
    return false;
  }

  /**
   * Get status of a XenoSync process
   */
  async getStatus(processId: string): Promise<any> {
    const process = this.processes.get(processId);
    if (!process) {
      return { isRunning: false, error: 'Process not found' };
    }

    // Read XenoSync session status from coordination files
    try {
      const sessionFile = path.join(
        this.XENOSYNC_SESSIONS_DIR,
        process.sessionId,
        'session.json'
      );
      
      if (fsSync.existsSync(sessionFile)) {
        const sessionData = JSON.parse(await fs.readFile(sessionFile, 'utf-8'));
        
        return {
          isRunning: process.status === 'active',
          processId: process.id,
          farmId: process.farmId,
          sessionId: process.sessionId,
          status: process.status,
          numberOfAgents: process.numberOfAgents,
          mode: process.mode,
          startTime: process.startTime,
          xenosyncStatus: sessionData.status || 'unknown',
          agents: sessionData.agents || [],
          tasks: sessionData.tasks || []
        };
      }
    } catch (error) {
      logger.warn('[XenoSyncService] Could not read session status:', error);
    }

    return {
      isRunning: process.status === 'active',
      processId: process.id,
      farmId: process.farmId,
      sessionId: process.sessionId,
      status: process.status,
      numberOfAgents: process.numberOfAgents,
      mode: process.mode,
      startTime: process.startTime
    };
  }

  /**
   * Stop a XenoSync process
   */
  async stopFarm(processId: string): Promise<void> {
    const process = this.processes.get(processId);
    if (!process) {
      logger.warn(`[XenoSyncService] Process ${processId} not found`);
      return;
    }

    logger.info(`[XenoSyncService] Stopping XenoSync process ${processId} for farm ${process.farmId}`);
    
    process.status = 'stopping';
    
    // Trigger harvest collection before stopping
    try {
      logger.info(`[XenoSyncService] Triggering harvest collection for farm ${process.farmId}`);
      const { shutdownCoordinator } = await import('./shutdownCoordinator');
      await shutdownCoordinator.gracefulShutdown(process.farmId, 'xenosync_stopped');
    } catch (error) {
      logger.error('[XenoSyncService] Failed to trigger harvest collection:', error);
    }

    // Send graceful shutdown signal
    process.process.kill('SIGTERM');

    // Give it time to shutdown gracefully
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Force kill if still running
    if (process.process.killed === false) {
      process.process.kill('SIGKILL');
    }

    // Kill tmux session
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      // Kill any session with the farm ID pattern
      const sessionName = `farm-${process.farmId.substring(0, 8)}`;
      await execAsync(`tmux kill-session -t ${sessionName} 2>/dev/null || true`);
      logger.info('[XenoSyncService] Killed XenoSync tmux session');
    } catch (error) {
      // Session might already be gone
      logger.debug('[XenoSyncService] Tmux session cleanup:', error);
    }

    // Stop terminal streaming
    try {
      await terminalStreamService.stopAllStreaming(process.farmId);
    } catch (error) {
      logger.warn('[XenoSyncService] Failed to stop terminal streaming:', error);
    }
    
    // Update farm status
    try {
      const { farmManager } = await import('./farmManager');
      await farmManager.updateFarmStatus(process.farmId, 'stopped');
    } catch (error) {
      logger.warn('[XenoSyncService] Failed to update farm status:', error);
    }

    this.processes.delete(processId);
    
    this.emit('xenosync:stopped', {
      processId,
      farmId: process.farmId
    });
  }

  /**
   * Send command to a specific agent in XenoSync
   */
  async sendCommandToAgent(processId: string, agentIndex: number, command: string): Promise<void> {
    const process = this.processes.get(processId);
    if (!process) {
      throw new Error(`Process ${processId} not found`);
    }

    // Send command via tmux using MaiFarm's standard naming
    const tmuxSession = `farm-${process.farmId.substring(0, 8)}`;
    const targetPane = `${tmuxSession}:agents.${agentIndex}`;
    
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    try {
      await execAsync(`tmux send-keys -t "${targetPane}" "${command}" Enter`);
      logger.info(`[XenoSyncService] Sent command to agent ${agentIndex}`);
    } catch (error) {
      logger.error(`[XenoSyncService] Failed to send command to agent ${agentIndex}:`, error);
      throw error;
    }
  }

  /**
   * Get all active XenoSync processes
   */
  getActiveProcesses(): Map<string, XenoSyncProcess> {
    return new Map(
      Array.from(this.processes.entries())
        .filter(([_, p]) => p.status === 'active')
    );
  }

  /**
   * Check if XenoSync is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Check if XenoSync launcher exists
      const launcherPath = path.join(process.cwd(), 'server', 'orchestrators', 'xenosync-launcher.py');
      await fs.access(launcherPath);
      
      // Check if Python is available
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      const { stdout } = await execAsync('python3 --version');
      logger.info('[XenoSyncService] Python version:', stdout.trim());
      
      // Check if Claude CLI is available
      try {
        const { stdout } = await execAsync('which claude');
        logger.info('[XenoSyncService] Claude CLI found at:', stdout.trim());
        
        // CRITICAL: Also check if we have a valid API key
        // XenoSync requires both Claude CLI AND a valid API key
        const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';
        if (!apiKey || apiKey.length < 30 || apiKey.startsWith('test-') || apiKey.includes('your-')) {
          logger.warn('[XenoSyncService] Claude CLI found but no valid API key configured');
          logger.info('[XenoSyncService] XenoSync unavailable - will use mock agents instead');
          return false;
        }
        
        return true;
      } catch {
        logger.warn('[XenoSyncService] Claude CLI not found');
        return false;
      }
    } catch (error) {
      logger.error('[XenoSyncService] XenoSync availability check failed:', error);
      return false;
    }
  }

  /**
   * Handle farm completion - update status and trigger harvest collection
   */
  private async handleFarmCompletion(farmId: string): Promise<void> {
    try {
      logger.info(`[XenoSyncService] Handling completion for farm ${farmId}`);
      
      // Remove farm from health monitoring
      const { tmuxHealthMonitor } = await import('./tmuxHealthMonitor');
      tmuxHealthMonitor.removeFarm(farmId);
      logger.info(`[XenoSyncService] Removed farm ${farmId} from health monitoring`);
      
      // Import farmManager to update status
      const { farmManager } = await import('./farmManager');
      const farm = await farmManager.getFarm(farmId);
      
      if (farm) {
        // Update farm status to completed
        await farmManager.updateFarmStatus(farmId, 'completed');
        logger.info(`[XenoSyncService] Farm ${farmId} marked as completed`);
        
        // Trigger harvest collection via shutdownCoordinator
        const { shutdownCoordinator } = await import('./shutdownCoordinator');
        await shutdownCoordinator.gracefulShutdown(farmId, 'xenosync_completed');
        
        // Broadcast completion event
        websocketManager.broadcast('farm:completed', {
          farmId,
          status: 'completed',
          orchestrator: 'xenosync',
          timestamp: new Date()
        });
      }
    } catch (error) {
      logger.error(`[XenoSyncService] Failed to handle farm completion:`, error);
    }
  }

  /**
   * Install XenoSync dependencies
   */
  async installDependencies(): Promise<void> {
    logger.info('[XenoSyncService] Installing XenoSync dependencies...');
    
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    try {
      // Install Python dependencies
      const requirementsPath = path.join(this.XENOSYNC_PATH, 'requirements.txt');
      await execAsync(`pip3 install -r ${requirementsPath}`, {
        cwd: this.XENOSYNC_PATH
      });
      
      logger.info('[XenoSyncService] Dependencies installed successfully');
    } catch (error) {
      logger.error('[XenoSyncService] Failed to install dependencies:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const xenoSyncService = new XenoSyncService();