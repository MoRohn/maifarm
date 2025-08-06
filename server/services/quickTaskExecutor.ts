import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { quickTaskService } from './quickTaskService';
import { WebSocketManager } from '../websocket/websocketManager';
import { logger } from '../utils/logger';

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

  /**
   * Execute a quick task in a tmux session
   */
  async executeTask(config: QuickTaskExecutionConfig): Promise<ExecutionResult> {
    const startTime = Date.now();
    const sessionName = this.generateSessionName(config.taskId);
    
    try {
      logger.info(`[QuickTaskExecutor] Starting execution for task ${config.taskId}`);
      
      // Emit starting event
      WebSocketManager.broadcast('quicktask:starting', {
        taskId: config.taskId,
        farmId: config.farmId,
        sessionName,
        timestamp: new Date()
      });

      // Create tmux session
      const sessionCreated = await this.createTmuxSession(sessionName, config);
      if (!sessionCreated) {
        throw new Error('Failed to create tmux session');
      }

      this.activeSessions.set(config.taskId, sessionName);

      // Update task status to processing
      await quickTaskService.updateTaskProgress(config.taskId, 10, 'Task started');
      
      // Run the task in the session
      await this.runTaskInSession(sessionName, config);
      
      // Monitor execution with timeout
      const result = await this.monitorExecution(config);
      
      // Capture final output
      const output = await this.captureOutput(sessionName);
      
      return {
        success: true,
        output,
        executionTime: Date.now() - startTime,
        sessionName
      };
      
    } catch (error) {
      logger.error(`[QuickTaskExecutor] Task ${config.taskId} failed:`, error);
      
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
    
    // Determine AI provider from metadata or use default
    const provider = config.metadata?.provider || process.env.AI_PROVIDER || 'claude';
    
    // Launch actual AI agent instead of simulating
    if (provider === 'qwen') {
      await this.launchQwenAgent(sessionName, config);
    } else {
      await this.launchClaudeAgent(sessionName, config);
    }
  }

  /**
   * Launch Claude agent for quick task
   */
  private async launchClaudeAgent(sessionName: string, config: QuickTaskExecutionConfig): Promise<void> {
    logger.info(`[QuickTaskExecutor] Launching Claude agent for task ${config.taskId}`);
    
    // Build the task prompt from metadata if available, otherwise use title and description
    const taskPrompt = config.metadata?.prompt || config.description || config.title;
    
    // Launch Claude Code
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
    
    // Launch Qwen Code with the task prompt
    const prompt = `${config.title}: ${config.description}`;
    
    // Check if we should use local Qwen via Ollama or API
    const useLocal = config.metadata?.useLocalQwen || process.env.QWEN_USE_LOCAL === 'true';
    
    if (useLocal) {
      // Launch local Qwen via Ollama
      await this.sendToSession(sessionName, `ollama run qwen2.5-coder:32b`, false);
    } else {
      // Use Qwen API via custom command (would need implementation)
      await this.sendToSession(sessionName, `echo "Qwen API integration pending..."`, false);
      await this.sendToSession(sessionName, `claude --dangerously-skip-permissions`, false); // Fallback to Claude
    }
    
    // Wait for agent to initialize
    await new Promise(resolve => setTimeout(resolve, 3000));
    await quickTaskService.updateTaskProgress(config.taskId, 40, 'Qwen agent starting...');
    
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
      
      // Set timeout
      const timer = setTimeout(() => {
        logger.warn(`[QuickTaskExecutor] Task ${config.taskId} timed out after ${timeout}ms`);
        reject(new Error('Task execution timed out'));
      }, timeout);
      
      this.executionTimers.set(config.taskId, timer);
      
      // Monitor the session for completion
      const monitor = setInterval(async () => {
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
    return `quick-${taskId.substring(0, 8)}`;
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
    if (sessionName) {
      await this.cleanup(taskId, sessionName);
    }
  }
}

// Export singleton instance
export const quickTaskExecutor = new QuickTaskExecutor();