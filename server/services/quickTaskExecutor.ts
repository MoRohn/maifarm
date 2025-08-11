import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { quickTaskService } from './quickTaskService';
import { WebSocketManager } from '../websocket/websocketManager';
import { logger } from '../utils/logger';
import { Task } from '../types/api';
import { db } from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import { thinkingStrategyService } from './thinkingStrategyService';
import { ThinkingLevel, ThinkingConfig } from '../types/thinking';

interface QuickTaskExecutionConfig {
  taskId: string;
  farmId: string;
  title: string;
  description: string;
  timeout: number;
  metadata?: Record<string, any>;
}

interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  executionTime: number;
  sessionName?: string;
}

export class QuickTaskExecutor extends EventEmitter {
  private activeSessions: Map<string, string> = new Map(); // taskId -> sessionName
  private executionTimers: Map<string, NodeJS.Timeout> = new Map();
  private inMemoryQueue: Task[] = []; // Fallback queue when Redis unavailable
  private isProcessing: boolean = false;
  private virtualAgents: Map<string, string> = new Map(); // taskId -> agentId

  /**
   * Create a virtual agent record for the quick task
   */
  private async createVirtualAgent(config: QuickTaskExecutionConfig, provider: string): Promise<string> {
    const agentId = uuidv4();
    const agentName = `Quick Task Agent (${provider})`;
    
    try {
      await db.query(
        `INSERT INTO agents (id, farm_id, name, type, status, capabilities, resources, metrics, config, last_heartbeat, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          agentId,
          config.farmId,
          agentName,
          'quick-task',
          'launching',
          JSON.stringify(['text-generation', 'code-execution', 'file-operations']),
          JSON.stringify({ cpu: 1, memory: 1024 }),
          JSON.stringify({ tasksCompleted: 0, avgResponseTime: 0 }),
          JSON.stringify({ 
            provider,
            isVirtual: true,
            taskId: config.taskId,
            sessionName: this.generateSessionName(config.taskId)
          }),
          new Date(),
          new Date(),
          new Date()
        ]
      );
      
      this.virtualAgents.set(config.taskId, agentId);
      
      // Emit agent created event
      WebSocketManager.broadcast('agent:created', {
        agent: {
          id: agentId,
          farmId: config.farmId,
          name: agentName,
          type: 'quick-task',
          status: 'launching',
          isVirtual: true,
          provider
        }
      });
      
      logger.info(`[QuickTaskExecutor] Created virtual agent ${agentId} for task ${config.taskId}`);
      return agentId;
    } catch (error) {
      logger.error(`[QuickTaskExecutor] Failed to create virtual agent for task ${config.taskId}:`, error);
      throw error;
    }
  }

  /**
   * Update virtual agent status
   */
  private async updateVirtualAgentStatus(taskId: string, status: string, metadata?: any): Promise<void> {
    const agentId = this.virtualAgents.get(taskId);
    if (!agentId) return;
    
    try {
      await db.query(
        `UPDATE agents 
         SET status = $1, last_heartbeat = $2, updated_at = $3, metrics = $4
         WHERE id = $5`,
        [
          status,
          new Date(),
          new Date(),
          JSON.stringify({
            tasksCompleted: status === 'completed' ? 1 : 0,
            avgResponseTime: 0,
            ...metadata
          }),
          agentId
        ]
      );
      
      // Emit agent status update event
      WebSocketManager.broadcast('agent:status', {
        agentId,
        status,
        timestamp: new Date(),
        metadata
      });
      
      logger.info(`[QuickTaskExecutor] Updated virtual agent ${agentId} status to ${status}`);
    } catch (error) {
      logger.error(`[QuickTaskExecutor] Failed to update virtual agent status:`, error);
    }
  }

  /**
   * Remove virtual agent record
   */
  private async removeVirtualAgent(taskId: string): Promise<void> {
    const agentId = this.virtualAgents.get(taskId);
    if (!agentId) return;
    
    try {
      await db.query('DELETE FROM agents WHERE id = $1', [agentId]);
      this.virtualAgents.delete(taskId);
      
      // Emit agent removed event
      WebSocketManager.broadcast('agent:removed', {
        agentId,
        timestamp: new Date()
      });
      
      logger.info(`[QuickTaskExecutor] Removed virtual agent ${agentId} for task ${taskId}`);
    } catch (error) {
      logger.error(`[QuickTaskExecutor] Failed to remove virtual agent:`, error);
    }
  }

  /**
   * Execute a quick task in a tmux session
   */
  async executeTask(config: QuickTaskExecutionConfig): Promise<ExecutionResult> {
    const startTime = Date.now();
    const sessionName = this.generateSessionName(config.taskId);
    
    // Determine provider from metadata or default
    const provider = config.metadata?.provider || process.env.AI_PROVIDER || 'claude';
    
    try {
      logger.info(`[QuickTaskExecutor] Starting execution for task ${config.taskId} with provider ${provider}`);
      
      // Create virtual agent record
      await this.createVirtualAgent(config, provider);
      
      // Emit starting event
      WebSocketManager.broadcast('quicktask:starting', {
        taskId: config.taskId,
        farmId: config.farmId,
        sessionName,
        provider,
        timestamp: new Date()
      });

      // Create tmux session
      const sessionCreated = await this.createTmuxSession(sessionName, config);
      if (!sessionCreated) {
        await this.updateVirtualAgentStatus(config.taskId, 'failed');
        throw new Error('Failed to create tmux session');
      }

      this.activeSessions.set(config.taskId, sessionName);
      await this.updateVirtualAgentStatus(config.taskId, 'initializing');

      // Update task status to processing
      await quickTaskService.updateTaskProgress(config.taskId, 10, 'Task started');
      
      // Run the task in the session
      await this.runTaskInSession(sessionName, config);
      await this.updateVirtualAgentStatus(config.taskId, 'running');
      
      // Monitor execution with timeout
      const result = await this.monitorExecution(config);
      
      // Capture final output
      const output = await this.captureOutput(sessionName);
      
      // Mark agent as completed
      await this.updateVirtualAgentStatus(config.taskId, 'completed', {
        executionTime: Date.now() - startTime
      });
      
      return {
        success: true,
        output,
        executionTime: Date.now() - startTime,
        sessionName
      };
      
    } catch (error) {
      logger.error(`[QuickTaskExecutor] Task ${config.taskId} failed:`, error);
      
      // Mark agent as failed
      await this.updateVirtualAgentStatus(config.taskId, 'failed', {
        error: error.message,
        executionTime: Date.now() - startTime
      });
      
      return {
        success: false,
        error: error.message || 'Task execution failed',
        executionTime: Date.now() - startTime,
        sessionName
      };
      
    } finally {
      // Schedule cleanup after a delay to allow harvest collection
      setTimeout(() => {
        this.cleanup(config.taskId, sessionName);
      }, 5000);
    }
  }

  /**
   * Create a tmux session for the quick task
   */
  private async createTmuxSession(sessionName: string, config: QuickTaskExecutionConfig): Promise<boolean> {
    return new Promise((resolve) => {
      // Kill existing session if it exists
      const killProcess = spawn('tmux', ['kill-session', '-t', sessionName]);
      killProcess.on('exit', () => {
        // Create new session
        const createProcess = spawn('tmux', [
          'new-session',
          '-d',
          '-s', sessionName,
          '-n', 'quicktask'
        ]);

        createProcess.on('exit', (code) => {
          if (code === 0) {
            logger.info(`[QuickTaskExecutor] Created tmux session: ${sessionName}`);
            
            // Emit session created event
            WebSocketManager.broadcast('quicktask:session:created', {
              taskId: config.taskId,
              sessionName,
              timestamp: new Date()
            });
            
            // Also emit harvest event so it appears in terminal
            WebSocketManager.broadcast('harvest:session:created', {
              sessionName,
              paneCount: 1,
              windowName: 'quicktask',
              active: true,
              metadata: {
                isQuickTask: true,
                taskId: config.taskId,
                farmId: config.farmId
              }
            });
            
            resolve(true);
          } else {
            logger.error(`[QuickTaskExecutor] Failed to create tmux session: ${sessionName}`);
            resolve(false);
          }
        });
      });
    });
  }

  /**
   * Run the task in the tmux session
   */
  private async runTaskInSession(sessionName: string, config: QuickTaskExecutionConfig): Promise<void> {
    // Update progress
    await quickTaskService.updateTaskProgress(config.taskId, 25, 'Initializing task environment');
    
    // Determine AI provider from settings, metadata, or environment
    const provider = config.metadata?.provider || process.env.AI_PROVIDER || 'claude';
    
    logger.info(`[QuickTaskExecutor] Using AI provider: ${provider}`);
    
    // Launch actual AI agent based on provider setting
    if (provider === 'qwen') {
      await this.launchQwenAgent(sessionName, config);
    } else {
      // Default to Claude for any other value including 'claude'
      await this.launchClaudeAgent(sessionName, config);
    }
  }

  /**
   * Launch Claude agent for quick task
   */
  private async launchClaudeAgent(sessionName: string, config: QuickTaskExecutionConfig): Promise<void> {
    logger.info(`[QuickTaskExecutor] Launching Claude agent for task ${config.taskId}`);
    
    // Build the base task prompt
    const basePrompt = config.description || config.title || 'Please help with this task';
    
    // Analyze prompt to determine if thinking strategy should be applied
    const recommendation = thinkingStrategyService.recommendThinkingLevel(basePrompt);
    
    // Apply thinking strategy for quick tasks
    let taskPrompt = basePrompt;
    if (recommendation.level !== ThinkingLevel.NONE) {
      const thinkingConfig: ThinkingConfig = {
        level: recommendation.level,
        context: 'This is a quick task that should be completed efficiently.',
        autoEscalate: false, // Don't auto-escalate for quick tasks
        maxLevel: ThinkingLevel.MODERATE // Cap at moderate for quick tasks to maintain speed
      };
      
      const enhancedResult = thinkingStrategyService.enhancePrompt(basePrompt, thinkingConfig);
      taskPrompt = enhancedResult.enhancedPrompt;
      
      logger.info(`[QuickTaskExecutor] Applied thinking level ${enhancedResult.appliedLevel} to quick task`, {
        taskId: config.taskId,
        complexityScore: recommendation.complexityScore,
        reasoning: recommendation.reasoning
      });
      
      // Update progress with thinking strategy info
      await quickTaskService.updateTaskProgress(
        config.taskId, 
        35, 
        `Applying ${enhancedResult.appliedLevel} thinking strategy...`
      );
    }
    
    // Launch Claude Code directly without echo
    await this.sendToSession(sessionName, `claude --dangerously-skip-permissions`, false);
    
    // Wait for Claude to initialize
    await new Promise(resolve => setTimeout(resolve, 3000));
    await quickTaskService.updateTaskProgress(config.taskId, 40, 'Claude agent starting...');
    
    // Send the task prompt to Claude
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.sendToSession(sessionName, taskPrompt, false);
    await quickTaskService.updateTaskProgress(config.taskId, 60, 'Task sent to Claude agent');
    
    // Emit events for UI updates
    WebSocketManager.broadcast('quicktask:agent:launched', {
      taskId: config.taskId,
      sessionName,
      provider: 'claude',
      timestamp: new Date()
    });
    
    // Also emit farm launched event for Harvest Terminal
    WebSocketManager.broadcast('farm:launched', {
      farmId: config.farmId,
      processId: config.taskId,
      tmuxSession: sessionName,
      agentCount: 1,
      timestamp: new Date()
    });
    
    // Monitor for completion (Claude will work on the task)
    await quickTaskService.updateTaskProgress(config.taskId, 80, 'Claude agent working on task...');
  }
  
  /**
   * Launch Qwen agent for quick task
   */
  private async launchQwenAgent(sessionName: string, config: QuickTaskExecutionConfig): Promise<void> {
    logger.info(`[QuickTaskExecutor] Launching Qwen agent for task ${config.taskId}`);
    
    // Build the task prompt
    const taskPrompt = config.description || config.title;
    
    // Check if we should use local Qwen via Ollama or API
    const useLocal = config.metadata?.useLocalQwen || process.env.QWEN_USE_LOCAL === 'true';
    
    if (useLocal) {
      // Launch local Qwen via Ollama
      logger.info(`[QuickTaskExecutor] Using local Qwen via Ollama`);
      await this.sendToSession(sessionName, `ollama run qwen2.5-coder:32b`, false);
      
      // Wait for Ollama to initialize
      await new Promise(resolve => setTimeout(resolve, 3000));
      await quickTaskService.updateTaskProgress(config.taskId, 40, 'Qwen agent starting...');
      
      // Send the task prompt
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.sendToSession(sessionName, taskPrompt, false);
      await quickTaskService.updateTaskProgress(config.taskId, 60, 'Task sent to Qwen agent');
    } else {
      // Qwen API mode not yet implemented, use Claude as fallback
      logger.warn(`[QuickTaskExecutor] Qwen API mode not implemented, falling back to Claude`);
      await this.launchClaudeAgent(sessionName, config);
      return;
    }
    
    // Wait for agent to initialize
    await new Promise(resolve => setTimeout(resolve, 3000));
    await quickTaskService.updateTaskProgress(config.taskId, 40, 'AI agent starting...');
    
    // Send the task prompt
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.sendToSession(sessionName, prompt, false);
    await quickTaskService.updateTaskProgress(config.taskId, 60, 'Task sent to Qwen agent');
    
    // Emit events for UI updates
    WebSocketManager.broadcast('quicktask:agent:launched', {
      taskId: config.taskId,
      sessionName,
      provider: 'qwen',
      timestamp: new Date()
    });
    
    // Also emit farm launched event for Harvest Terminal
    WebSocketManager.broadcast('farm:launched', {
      farmId: config.farmId,
      processId: config.taskId,
      tmuxSession: sessionName,
      agentCount: 1,
      timestamp: new Date()
    });
    
    // Monitor for completion
    await quickTaskService.updateTaskProgress(config.taskId, 80, 'Qwen agent working on task...');
  }


  /**
   * Monitor task execution
   */
  private async monitorExecution(config: QuickTaskExecutionConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = config.timeout || 300000; // Default 5 minutes
      const checkInterval = 5000; // Check every 5 seconds
      let elapsed = 0;
      let monitor: NodeJS.Timeout;
      
      // Set timeout
      const timer = setTimeout(async () => {
        logger.warn(`[QuickTaskExecutor] Task ${config.taskId} timed out after ${timeout}ms`);
        
        // Clear the monitor interval
        if (monitor) clearInterval(monitor);
        this.executionTimers.delete(config.taskId);
        
        // Update task status to timeout/failed in database
        try {
          await quickTaskService.failTask(config.taskId, 'Task execution timed out');
          await this.updateVirtualAgentStatus(config.taskId, 'timeout', { reason: 'Task execution timed out' });
        } catch (error) {
          logger.error(`[QuickTaskExecutor] Failed to update task status on timeout:`, error);
        }
        
        // Kill tmux session and cleanup resources
        const sessionName = this.activeSessions.get(config.taskId);
        if (sessionName) {
          await this.cleanup(config.taskId, sessionName);
        }
        
        reject(new Error('Task execution timed out'));
      }, timeout);
      
      this.executionTimers.set(config.taskId, timer);
      
      // Monitor the session for completion
      monitor = setInterval(async () => {
        elapsed += checkInterval;
        
        // Check if task is still active
        if (!this.activeSessions.has(config.taskId)) {
          clearInterval(monitor);
          clearTimeout(timer);
          this.executionTimers.delete(config.taskId);
          resolve();
          return;
        }
        
        // Update progress based on elapsed time
        const progress = Math.min(90, Math.floor((elapsed / timeout) * 100));
        await quickTaskService.updateTaskProgress(
          config.taskId,
          progress,
          `Agent working... ${Math.ceil((timeout - elapsed) / 1000)}s remaining`
        );
        
        // Check session output for completion indicators
        const sessionName = this.activeSessions.get(config.taskId);
        if (sessionName) {
          const output = await this.captureOutput(sessionName);
          if (output.includes('Task completed') || output.includes('Done') || output.includes('Finished')) {
            clearInterval(monitor);
            clearTimeout(timer);
            this.executionTimers.delete(config.taskId);
            await quickTaskService.updateTaskProgress(config.taskId, 100, 'Task completed');
            resolve();
          }
        }
      }, checkInterval);
    });
  }

  /**
   * Capture output from tmux session
   */
  private async captureOutput(sessionName: string, lines: number = 100): Promise<string> {
    return new Promise((resolve) => {
      const captureProcess = spawn('tmux', [
        'capture-pane',
        '-t', `${sessionName}:0`,
        '-p',
        '-S', `-${lines}`
      ]);
      
      let output = '';
      captureProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      captureProcess.on('exit', () => {
        resolve(output);
      });
      
      // Timeout fallback
      setTimeout(() => resolve(output || 'No output captured'), 2000);
    });
  }

  /**
   * Send command to tmux session
   */
  private async sendToSession(sessionName: string, command: string, sendEnter: boolean = true): Promise<void> {
    return new Promise((resolve) => {
      const args = ['send-keys', '-t', `${sessionName}:0`, command];
      if (sendEnter) {
        args.push('C-m');
      } else {
        args.push('Enter');
      }
      
      const sendProcess = spawn('tmux', args);
      sendProcess.on('exit', () => resolve());
      
      // Timeout fallback
      setTimeout(resolve, 1000);
    });
  }

  /**
   * Clean up resources
   */
  private async cleanup(taskId: string, sessionName: string): Promise<void> {
    try {
      // Remove from active sessions
      this.activeSessions.delete(taskId);
      
      // Clear any timers
      const timer = this.executionTimers.get(taskId);
      if (timer) {
        clearTimeout(timer);
        this.executionTimers.delete(taskId);
      }
      
      // Remove virtual agent record
      await this.removeVirtualAgent(taskId);
      
      // Kill tmux session
      const killProcess = spawn('tmux', ['kill-session', '-t', sessionName]);
      killProcess.on('exit', (code) => {
        if (code === 0) {
          logger.info(`[QuickTaskExecutor] Cleaned up session: ${sessionName}`);
        }
      });
      
      // Emit cleanup event
      WebSocketManager.broadcast('quicktask:cleaned', {
        taskId,
        sessionName,
        timestamp: new Date()
      });
      
    } catch (error) {
      logger.error(`[QuickTaskExecutor] Cleanup failed for task ${taskId}:`, error);
    }
  }

  /**
   * Generate session name for quick task
   */
  private generateSessionName(taskId: string): string {
    return `quick_${taskId.substring(0, 8)}`;
  }

  /**
   * Check if a session exists
   */
  async sessionExists(sessionName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const checkProcess = spawn('tmux', ['has-session', '-t', sessionName]);
      checkProcess.on('exit', (code) => resolve(code === 0));
    });
  }

  /**
   * Get all active quick task sessions
   */
  async getActiveSessions(): Promise<string[]> {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Force stop a task
   */
  async stopTask(taskId: string): Promise<void> {
    const sessionName = this.activeSessions.get(taskId);
    
    // Mark virtual agent as stopped before cleanup
    await this.updateVirtualAgentStatus(taskId, 'stopped');
    
    if (sessionName) {
      await this.cleanup(taskId, sessionName);
    }
  }

  /**
   * Queue a task for execution (Redis fallback support)
   */
  async queueTask(task: any): Promise<void> {
    this.inMemoryQueue.push(task);
    logger.info(`[QuickTaskExecutor] Task ${task.id} queued in-memory. Queue size: ${this.inMemoryQueue.length}`);
    
    // Emit queue event
    WebSocketManager.broadcast('quicktask:queued', {
      taskId: task.id,
      farmId: task.farmId,
      queueSize: this.inMemoryQueue.length,
      timestamp: new Date()
    });
    
    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Process tasks from the in-memory queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.inMemoryQueue.length === 0) {
      return;
    }
    
    this.isProcessing = true;
    
    while (this.inMemoryQueue.length > 0) {
      const task = this.inMemoryQueue.shift();
      if (!task) continue;
      
      try {
        logger.info(`[QuickTaskExecutor] Processing task ${task.id} from in-memory queue`);
        
        // Execute the task
        const config: QuickTaskExecutionConfig = {
          taskId: task.id,
          farmId: task.farmId,
          title: task.payload?.title || 'Quick Task',
          description: task.payload?.description || '',
          timeout: task.timeout || 300000,
          metadata: task.metadata
        };
        
        await this.executeTask(config);
        
      } catch (error) {
        logger.error(`[QuickTaskExecutor] Failed to process task ${task.id}:`, error);
        
        // Notify failure
        WebSocketManager.broadcast('quicktask:failed', {
          taskId: task.id,
          farmId: task.farmId,
          error: error.message,
          timestamp: new Date()
        });
      }
      
      // Small delay between tasks
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    this.isProcessing = false;
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): any {
    return {
      queueSize: this.inMemoryQueue.length,
      activeSessions: this.activeSessions.size,
      isProcessing: this.isProcessing
    };
  }
}

// Export singleton instance
export const quickTaskExecutor = new QuickTaskExecutor();