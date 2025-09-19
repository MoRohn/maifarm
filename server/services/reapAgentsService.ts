/**
 * ReapAgentsService - TypeScript wrapper for ReapAgents deep agent orchestration
 * 
 * Provides advanced agent orchestration with:
 * - Intelligent task planning and decomposition
 * - Specialized sub-agents for different tasks
 * - Memory and learning capabilities
 * - Deep integration with MaiFarm ecosystem
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as yaml from 'js-yaml';
import { websocketManager } from '../websocket/websocketManager';
import { aiProviderManager } from '../config/aiProviders';
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
import { db } from '../database/connection';

// ReapAgents specific types
interface ReapAgentConfig {
  farmId: string;
  numAgents: number;
  provider: 'claude' | 'openai' | 'qwen' | 'ollama';
  workspacePath: string;
  barnPath: string;
  coordinationPath: string;
  harvestPath: string;
  timeout: number;
  collaborative: boolean;
  parallelExecution: boolean;
  enableMemory: boolean;
  enableSubAgents: boolean;
  autoHarvest: boolean;
  debug: boolean;
  subAgents: string[];
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
}

interface ReapAgentState {
  agentId: string;
  index: number;
  status: 'idle' | 'planning' | 'working' | 'reviewing' | 'completed' | 'error';
  currentPhase: 'planning' | 'execution' | 'review' | 'completion';
  todos: ReapTodo[];
  plan?: string;
  metrics?: Record<string, any>;
  subAgentsActive: string[];
}

interface ReapTodo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  agentId?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  dependencies?: string[];
  createdAt: string;
  completedAt?: string;
}

interface ReapSubAgent {
  name: string;
  type: 'code-architect' | 'code-implementer' | 'test-engineer' | 'documentation-writer' | 
        'security-auditor' | 'performance-optimizer' | 'harvest-collector' | 'coordinator';
  status: 'idle' | 'working' | 'completed';
  currentTask?: string;
  completedTasks: number;
}

interface ReapLaunchOptions {
  farmId: string;
  name: string;
  description: string;
  numberOfAgents: number;
  prompt: string;
  yamlContent?: string;
  steps?: string[];
  mode?: 'auto' | 'reap' | 'traditional';
  workingDirectory?: string;
  contextFiles?: string[];
  debug?: boolean;
  timeout?: number;
  provider?: 'claude' | 'openai' | 'qwen' | 'ollama';
  enableSubAgents?: boolean;
  subAgentTypes?: string[];
  enableMemory?: boolean;
  collaborative?: boolean;
}

interface ReapProcess {
  id: string;
  farmId: string;
  process: ChildProcess;
  sessionId: string;
  status: 'launching' | 'planning' | 'executing' | 'reviewing' | 'harvesting' | 'completed' | 'error';
  startTime: Date;
  agents: Map<number, ReapAgentState>;
  subAgents: Map<string, ReapSubAgent>;
  config: ReapAgentConfig;
  metrics: {
    tasksTotal: number;
    tasksCompleted: number;
    filesCreated: number;
    testsRun: number;
    testsPassed: number;
    securityIssues: number;
    performanceScore: number;
  };
}

/**
 * ReapAgentsService - Advanced deep agent orchestration for MaiFarm
 */
class ReapAgentsService extends EventEmitter {
  private processes: Map<string, ReapProcess> = new Map();
  private readonly ORCHESTRATOR_PATH = path.join(process.cwd(), 'orchestrator_reap.py');
  private readonly REAPAGENTS_PATH = path.join(process.cwd(), 'server/orchestrators/reapagents');
  private readonly CONFIG_DIR: string;
  private paths = pathConfig.getPaths();
  private taskAnalysisCache: Map<string, any> = new Map();

  constructor() {
    super();
    this.CONFIG_DIR = path.join(this.paths.MAIBARN_ROOT, 'reapagents-configs');
    this.setupDirectories();
  }

  private async setupDirectories() {
    try {
      await fs.mkdir(this.CONFIG_DIR, { recursive: true });
      await fs.mkdir(path.join(this.paths.MAIBARN_ROOT, 'reapagents-sessions'), { recursive: true });
      logger.info('[ReapAgentsService] Directories initialized');
    } catch (error) {
      logger.error('[ReapAgentsService] Failed to setup directories:', error);
    }
  }

  /**
   * Analyze task complexity to determine if ReapAgents should be used
   */
  async analyzeTaskComplexity(prompt: string): Promise<{
    recommendedMode: 'reap' | 'traditional';
    complexityScore: number;
    confidence: number;
    analysis: {
      hasArchitecture: boolean;
      hasTestingNeeds: boolean;
      hasSecurityConcerns: boolean;
      hasPerformanceRequirements: boolean;
      estimatedLinesOfCode: number;
      estimatedDuration: number;
    };
  }> {
    // Check cache first
    const cacheKey = prompt.substring(0, 100);
    if (this.taskAnalysisCache.has(cacheKey)) {
      return this.taskAnalysisCache.get(cacheKey);
    }

    const promptLower = prompt.toLowerCase();
    
    // Analyze task characteristics
    const analysis = {
      hasArchitecture: /architect|design|system|structure|pattern/i.test(prompt),
      hasTestingNeeds: /test|spec|validate|verify|quality/i.test(prompt),
      hasSecurityConcerns: /security|auth|encrypt|vulnerab|audit/i.test(prompt),
      hasPerformanceRequirements: /performance|optimize|speed|efficient|scale/i.test(prompt),
      estimatedLinesOfCode: this.estimateLinesOfCode(prompt),
      estimatedDuration: 0
    };

    // Calculate complexity score
    let complexityScore = 0;
    if (analysis.hasArchitecture) complexityScore += 3;
    if (analysis.hasTestingNeeds) complexityScore += 2;
    if (analysis.hasSecurityConcerns) complexityScore += 2;
    if (analysis.hasPerformanceRequirements) complexityScore += 2;
    if (analysis.estimatedLinesOfCode > 500) complexityScore += 3;
    if (analysis.estimatedLinesOfCode > 1000) complexityScore += 2;

    // Check for complex keywords
    const complexKeywords = ['build', 'implement', 'create', 'develop', 'design', 'architect'];
    const simpleKeywords = ['fix', 'update', 'change', 'modify', 'adjust', 'rename'];
    
    const hasComplexKeywords = complexKeywords.some(k => promptLower.includes(k));
    const hasSimpleKeywords = simpleKeywords.some(k => promptLower.includes(k));
    
    if (hasComplexKeywords) complexityScore += 2;
    if (hasSimpleKeywords) complexityScore -= 2;

    // Estimate duration based on complexity
    analysis.estimatedDuration = Math.min(60, 5 + complexityScore * 3); // minutes

    // Determine recommendation
    const recommendedMode = complexityScore >= 5 ? 'reap' : 'traditional';
    const confidence = Math.min(0.95, 0.5 + Math.abs(complexityScore - 5) * 0.05);

    const result = {
      recommendedMode,
      complexityScore,
      confidence,
      analysis
    };

    // Cache the result
    this.taskAnalysisCache.set(cacheKey, result);
    
    return result;
  }

  private estimateLinesOfCode(prompt: string): number {
    // Simple heuristic based on task description
    const words = prompt.split(/\s+/).length;
    const hasMultipleFeatures = /and|also|additionally|furthermore/i.test(prompt);
    const isFullApplication = /application|system|platform|service/i.test(prompt);
    
    let estimate = words * 2; // Base estimate
    if (hasMultipleFeatures) estimate *= 2;
    if (isFullApplication) estimate *= 5;
    
    return Math.min(10000, estimate);
  }

  /**
   * Create ReapAgents configuration
   */
  private async createReapConfig(sessionId: string, options: ReapLaunchOptions): Promise<string> {
    const config: ReapAgentConfig = {
      farmId: options.farmId,
      numAgents: options.numberOfAgents,
      provider: options.provider || 'claude',
      workspacePath: path.join(this.paths.WORKSPACES_DIR, options.farmId),
      barnPath: this.paths.BARN_DIR,
      coordinationPath: this.paths.COORDINATION_DIR,
      harvestPath: path.join(this.paths.HARVESTS_DIR, options.farmId),
      timeout: options.timeout || 300000,
      collaborative: options.collaborative !== false,
      parallelExecution: true,
      enableMemory: options.enableMemory !== false,
      enableSubAgents: options.enableSubAgents !== false,
      autoHarvest: true,
      debug: options.debug || false,
      subAgents: options.subAgentTypes || [
        'code-architect',
        'code-implementer',
        'test-engineer',
        'documentation-writer',
        'security-auditor',
        'performance-optimizer',
        'harvest-collector',
        'coordinator'
      ]
    };

    const configPath = path.join(this.CONFIG_DIR, `${sessionId}.json`);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    return configPath;
  }

  /**
   * Launch ReapAgents farm
   */
  async launchFarm(options: ReapLaunchOptions): Promise<string> {
    const sessionId = `reap-${options.farmId}-${uuidv4().substring(0, 8)}`;
    
    logger.info(`[ReapAgentsService] Launching ReapAgents farm: ${sessionId}`);

    try {
      // Create configuration
      const configPath = await this.createReapConfig(sessionId, options);

      // Create workspace
      const workspacePath = path.join(this.paths.WORKSPACES_DIR, options.farmId);
      await workspaceManager.createWorkspace(options.farmId, {
        template: 'reapagents',
        includeContext: true
      });

      // Prepare command
      const args = [
        this.ORCHESTRATOR_PATH,
        '-n', String(options.numberOfAgents),
        '-p', options.prompt,
        '--mode', options.mode || 'auto',
        '--provider', options.provider || 'claude',
        '--farm-id', options.farmId,
        '--timeout', String((options.timeout || 300000) / 1000),
      ];

      if (options.debug) {
        args.push('--debug');
      }

      if (options.yamlContent) {
        // Save YAML to file
        const yamlPath = path.join(workspacePath, 'task.yaml');
        await fs.writeFile(yamlPath, options.yamlContent);
        args.push('--prompt-file', yamlPath);
      }

      // Spawn the process
      const process = spawn('python3', args, {
        cwd: workspacePath,
        env: {
          ...process.env,
          MAIBARN_ROOT: this.paths.MAIBARN_ROOT,
          AI_PROVIDER: options.provider || 'claude',
          PYTHONPATH: this.REAPAGENTS_PATH
        }
      });

      // Create process tracking
      const reapProcess: ReapProcess = {
        id: sessionId,
        farmId: options.farmId,
        process,
        sessionId,
        status: 'launching',
        startTime: new Date(),
        agents: new Map(),
        subAgents: new Map(),
        config: JSON.parse(await fs.readFile(configPath, 'utf-8')),
        metrics: {
          tasksTotal: 0,
          tasksCompleted: 0,
          filesCreated: 0,
          testsRun: 0,
          testsPassed: 0,
          securityIssues: 0,
          performanceScore: 0
        }
      };

      // Initialize agents
      for (let i = 0; i < options.numberOfAgents; i++) {
        const agentState: ReapAgentState = {
          agentId: `agent-${i}`,
          index: i,
          status: 'idle',
          currentPhase: 'planning',
          todos: [],
          subAgentsActive: []
        };
        reapProcess.agents.set(i, agentState);
      }

      // Initialize sub-agents
      const subAgentTypes = options.subAgentTypes || [
        'code-architect', 'code-implementer', 'test-engineer',
        'documentation-writer', 'security-auditor', 'performance-optimizer',
        'harvest-collector', 'coordinator'
      ];

      for (const type of subAgentTypes) {
        const subAgent: ReapSubAgent = {
          name: type,
          type: type as any,
          status: 'idle',
          completedTasks: 0
        };
        reapProcess.subAgents.set(type, subAgent);
      }

      this.processes.set(sessionId, reapProcess);

      // Handle process output
      this.handleProcessOutput(reapProcess);

      // Set up monitoring
      this.monitorProcess(reapProcess);

      // Emit launch event
      this.emit('farm:launched', {
        sessionId,
        farmId: options.farmId,
        mode: 'reapagents',
        numberOfAgents: options.numberOfAgents
      });

      // Broadcast via WebSocket
      websocketManager.broadcast('reapagents:launched', {
        sessionId,
        farmId: options.farmId,
        agents: Array.from(reapProcess.agents.values()),
        subAgents: Array.from(reapProcess.subAgents.values())
      });

      return sessionId;

    } catch (error) {
      logger.error('[ReapAgentsService] Failed to launch farm:', error);
      throw error;
    }
  }

  /**
   * Handle process output and parse agent updates
   */
  private handleProcessOutput(reapProcess: ReapProcess) {
    const { process: proc } = reapProcess;

    // Handle stdout
    proc.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      
      // Parse structured output
      const lines = output.split('\n');
      for (const line of lines) {
        this.parseAgentOutput(reapProcess, line);
      }

      // Stream to terminal
      terminalStreamService.streamOutput(reapProcess.farmId, output);
    });

    // Handle stderr
    proc.stderr?.on('data', (data: Buffer) => {
      const error = data.toString();
      logger.error(`[ReapAgents ${reapProcess.farmId}] Error:`, error);
      
      // Update status on error
      if (error.includes('CRITICAL') || error.includes('FATAL')) {
        reapProcess.status = 'error';
        this.broadcastStatus(reapProcess);
      }
    });

    // Handle process exit
    proc.on('exit', (code) => {
      logger.info(`[ReapAgents ${reapProcess.farmId}] Process exited with code ${code}`);
      
      reapProcess.status = code === 0 ? 'completed' : 'error';
      this.collectHarvest(reapProcess);
      this.saveMetrics(reapProcess);
      this.broadcastStatus(reapProcess);
    });
  }

  /**
   * Parse agent output for structured updates
   */
  private parseAgentOutput(reapProcess: ReapProcess, line: string) {
    try {
      // Look for JSON structured output
      if (line.startsWith('{') && line.endsWith('}')) {
        const data = JSON.parse(line);
        
        if (data.type === 'agent_update') {
          this.updateAgentState(reapProcess, data);
        } else if (data.type === 'todo_update') {
          this.updateTodos(reapProcess, data);
        } else if (data.type === 'subagent_update') {
          this.updateSubAgent(reapProcess, data);
        } else if (data.type === 'metrics_update') {
          this.updateMetrics(reapProcess, data);
        } else if (data.type === 'phase_change') {
          this.updatePhase(reapProcess, data);
        }
      }
      
      // Look for status patterns
      if (line.includes('[Agent')) {
        const agentMatch = line.match(/\[Agent (\d+)\] (\w+): (.+)/);
        if (agentMatch) {
          const [_, indexStr, status, message] = agentMatch;
          const index = parseInt(indexStr) - 1;
          const agent = reapProcess.agents.get(index);
          if (agent) {
            agent.status = this.mapStatus(status);
            this.broadcastAgentUpdate(reapProcess, agent);
          }
        }
      }
      
      // Look for sub-agent activation
      if (line.includes('Sub-agent')) {
        const subAgentMatch = line.match(/Sub-agent \[(\w+)\] (\w+): (.+)/);
        if (subAgentMatch) {
          const [_, name, status, task] = subAgentMatch;
          const subAgent = reapProcess.subAgents.get(name);
          if (subAgent) {
            subAgent.status = status.toLowerCase() as any;
            subAgent.currentTask = task;
            this.broadcastSubAgentUpdate(reapProcess, subAgent);
          }
        }
      }

    } catch (error) {
      // Not JSON or couldn't parse, ignore
    }
  }

  private mapStatus(status: string): ReapAgentState['status'] {
    const statusMap: Record<string, ReapAgentState['status']> = {
      'planning': 'planning',
      'working': 'working',
      'executing': 'working',
      'reviewing': 'reviewing',
      'completed': 'completed',
      'error': 'error',
      'failed': 'error'
    };
    return statusMap[status.toLowerCase()] || 'idle';
  }

  /**
   * Update agent state
   */
  private updateAgentState(reapProcess: ReapProcess, data: any) {
    const agent = reapProcess.agents.get(data.agentIndex);
    if (agent) {
      Object.assign(agent, data.state);
      this.broadcastAgentUpdate(reapProcess, agent);
    }
  }

  /**
   * Update todos
   */
  private updateTodos(reapProcess: ReapProcess, data: any) {
    const agent = reapProcess.agents.get(data.agentIndex);
    if (agent) {
      agent.todos = data.todos;
      
      // Update metrics
      reapProcess.metrics.tasksTotal = agent.todos.length;
      reapProcess.metrics.tasksCompleted = agent.todos.filter(t => t.status === 'completed').length;
      
      this.broadcastTodoUpdate(reapProcess, agent);
    }
  }

  /**
   * Update sub-agent
   */
  private updateSubAgent(reapProcess: ReapProcess, data: any) {
    const subAgent = reapProcess.subAgents.get(data.name);
    if (subAgent) {
      Object.assign(subAgent, data.state);
      if (data.state.status === 'completed') {
        subAgent.completedTasks++;
      }
      this.broadcastSubAgentUpdate(reapProcess, subAgent);
    }
  }

  /**
   * Update metrics
   */
  private updateMetrics(reapProcess: ReapProcess, data: any) {
    Object.assign(reapProcess.metrics, data.metrics);
    this.broadcastMetrics(reapProcess);
  }

  /**
   * Update phase
   */
  private updatePhase(reapProcess: ReapProcess, data: any) {
    const agent = reapProcess.agents.get(data.agentIndex);
    if (agent) {
      agent.currentPhase = data.phase;
      this.broadcastPhaseChange(reapProcess, agent);
    }
    
    // Update overall process status based on phases
    const phases = Array.from(reapProcess.agents.values()).map(a => a.currentPhase);
    if (phases.every(p => p === 'planning')) {
      reapProcess.status = 'planning';
    } else if (phases.some(p => p === 'execution')) {
      reapProcess.status = 'executing';
    } else if (phases.every(p => p === 'review')) {
      reapProcess.status = 'reviewing';
    } else if (phases.every(p => p === 'completion')) {
      reapProcess.status = 'harvesting';
    }
  }

  /**
   * Monitor process health and progress
   */
  private monitorProcess(reapProcess: ReapProcess) {
    const interval = setInterval(() => {
      if (!this.processes.has(reapProcess.id)) {
        clearInterval(interval);
        return;
      }

      // Check process health
      if (reapProcess.process.killed) {
        reapProcess.status = 'error';
        this.processes.delete(reapProcess.id);
        clearInterval(interval);
        return;
      }

      // Broadcast periodic status update
      this.broadcastStatus(reapProcess);

    }, 5000); // Check every 5 seconds
  }

  /**
   * Collect harvest from completed farm
   */
  private async collectHarvest(reapProcess: ReapProcess) {
    try {
      const harvestPath = path.join(this.paths.HARVESTS_DIR, reapProcess.farmId);
      
      // Read harvest files
      const harvestFile = path.join(harvestPath, `harvest_${reapProcess.farmId}.json`);
      if (fsSync.existsSync(harvestFile)) {
        const harvest = JSON.parse(await fs.readFile(harvestFile, 'utf-8'));
        
        // Store in database
        await db.query(
          `INSERT INTO harvests (farm_id, harvest_data, created_at) VALUES ($1, $2, NOW())`,
          [reapProcess.farmId, JSON.stringify(harvest)]
        );

        // Cache for quick access
        harvestSessionCache.set(reapProcess.farmId, harvest);

        // Broadcast harvest ready
        websocketManager.broadcast('reapagents:harvest:ready', {
          farmId: reapProcess.farmId,
          sessionId: reapProcess.sessionId,
          files: Object.keys(harvest.files || {}),
          artifacts: harvest.artifacts || [],
          metrics: harvest.metrics || {}
        });
      }
    } catch (error) {
      logger.error('[ReapAgentsService] Failed to collect harvest:', error);
    }
  }

  /**
   * Save metrics to database
   */
  private async saveMetrics(reapProcess: ReapProcess) {
    try {
      await db.query(
        `INSERT INTO reap_metrics 
         (farm_id, session_id, metrics_data, created_at) 
         VALUES ($1, $2, $3, NOW())`,
        [reapProcess.farmId, reapProcess.sessionId, JSON.stringify(reapProcess.metrics)]
      );
    } catch (error) {
      logger.error('[ReapAgentsService] Failed to save metrics:', error);
    }
  }

  // Broadcasting methods
  private broadcastStatus(reapProcess: ReapProcess) {
    websocketManager.broadcast('reapagents:status', {
      sessionId: reapProcess.sessionId,
      farmId: reapProcess.farmId,
      status: reapProcess.status,
      metrics: reapProcess.metrics
    });
  }

  private broadcastAgentUpdate(reapProcess: ReapProcess, agent: ReapAgentState) {
    websocketManager.broadcast('reapagents:agent:update', {
      sessionId: reapProcess.sessionId,
      farmId: reapProcess.farmId,
      agent
    });
  }

  private broadcastTodoUpdate(reapProcess: ReapProcess, agent: ReapAgentState) {
    websocketManager.broadcast('reapagents:todos:update', {
      sessionId: reapProcess.sessionId,
      farmId: reapProcess.farmId,
      agentId: agent.agentId,
      todos: agent.todos
    });
  }

  private broadcastSubAgentUpdate(reapProcess: ReapProcess, subAgent: ReapSubAgent) {
    websocketManager.broadcast('reapagents:subagent:update', {
      sessionId: reapProcess.sessionId,
      farmId: reapProcess.farmId,
      subAgent
    });
  }

  private broadcastPhaseChange(reapProcess: ReapProcess, agent: ReapAgentState) {
    websocketManager.broadcast('reapagents:phase:change', {
      sessionId: reapProcess.sessionId,
      farmId: reapProcess.farmId,
      agentId: agent.agentId,
      phase: agent.currentPhase
    });
  }

  private broadcastMetrics(reapProcess: ReapProcess) {
    websocketManager.broadcast('reapagents:metrics', {
      sessionId: reapProcess.sessionId,
      farmId: reapProcess.farmId,
      metrics: reapProcess.metrics
    });
  }

  /**
   * Get status of a ReapAgents farm
   */
  getStatus(sessionId: string): any {
    const process = this.processes.get(sessionId);
    if (!process) {
      return null;
    }

    return {
      sessionId: process.sessionId,
      farmId: process.farmId,
      status: process.status,
      agents: Array.from(process.agents.values()),
      subAgents: Array.from(process.subAgents.values()),
      metrics: process.metrics,
      startTime: process.startTime,
      duration: Date.now() - process.startTime.getTime()
    };
  }

  /**
   * Stop a ReapAgents farm
   */
  async stopFarm(sessionId: string): Promise<void> {
    const process = this.processes.get(sessionId);
    if (!process) {
      throw new Error(`Farm ${sessionId} not found`);
    }

    logger.info(`[ReapAgentsService] Stopping farm ${sessionId}`);

    // Send termination signal
    process.process.kill('SIGTERM');

    // Wait for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Force kill if still running
    if (!process.process.killed) {
      process.process.kill('SIGKILL');
    }

    // Clean up
    this.processes.delete(sessionId);
  }

  /**
   * Get all active ReapAgents farms
   */
  getActiveFarms(): any[] {
    return Array.from(this.processes.values()).map(p => ({
      sessionId: p.sessionId,
      farmId: p.farmId,
      status: p.status,
      numberOfAgents: p.config.numAgents,
      provider: p.config.provider,
      startTime: p.startTime
    }));
  }
}

// Export singleton instance
export const reapAgentsService = new ReapAgentsService();