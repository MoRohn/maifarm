import { spawn } from 'child_process';

/**
 * MaiFarm Task Standard for Claude Code Agents
 * 
 * DEFINITION:
 * - 1 Agent = 1 tmux pane = 1 concurrent task execution context
 * - 1 Task = A specific instruction/prompt given to an agent
 * - Agents can execute multiple tasks sequentially over time
 * - But only 1 task per agent at any given moment
 * 
 * ARCHITECTURE:
 * Farm -> N Agents (tmux panes) -> M Tasks (sequential per agent)
 */

export interface TaskStandard {
  // Core definitions
  agentCount: number;           // Number of tmux panes (concurrent execution contexts)
  taskCount: number;            // Total tasks assigned across all agents
  activeTasks: number;          // Currently executing tasks (≤ agentCount)
  completedTasks: number;       // Successfully finished tasks
  failedTasks: number;          // Failed/errored tasks
  
  // Calculated metrics
  tasksPerAgent: number;        // Average tasks assigned per agent
  completionRate: number;       // Percentage of tasks completed successfully
  concurrencyUtilization: number; // Percentage of agents actively working
}

export interface AgentTaskInfo {
  agentId: string;
  tmuxPane: number;
  currentTask?: {
    id: string;
    description: string;
    startedAt: Date;
    status: 'running' | 'completing' | 'completed' | 'failed';
  };
  taskHistory: Array<{
    id: string;
    description: string;
    startedAt: Date;
    completedAt?: Date;
    status: 'completed' | 'failed';
    duration?: number; // milliseconds
  }>;
  totalTasksAssigned: number;
  totalTasksCompleted: number;
  totalTasksFailed: number;
}

class TaskStandardService {
  /**
   * Get accurate agent count using tmux list-panes
   */
  async getAgentCount(tmuxSession: string): Promise<number> {
    return new Promise((resolve) => {
      // Use simple tmux list-panes command
      const listProcess = spawn('tmux', ['list-panes', '-t', tmuxSession]);
      let output = '';
      
      listProcess.stdout?.on('data', (data) => { 
        output += data.toString(); 
      });
      
      listProcess.on('exit', (code) => {
        if (code === 0) {
          // Count lines of output - each line is a pane
          const paneLines = output.trim().split('\n').filter(line => line.trim());
          resolve(paneLines.length);
        } else {
          console.warn(`[TaskStandard] Failed to list tmux panes for session ${tmuxSession}`);
          resolve(0);
        }
      });
      
      listProcess.on('error', (error) => {
        console.error(`[TaskStandard] Error listing tmux panes: ${error.message}`);
        resolve(0);
      });
    });
  }

  /**
   * Get detailed pane information with formatted output
   */
  async getAgentDetails(tmuxSession: string): Promise<Array<{ paneIndex: number; command: string; active: boolean }>> {
    return new Promise((resolve) => {
      // Use formatted output to get pane details
      const listProcess = spawn('tmux', [
        'list-panes', 
        '-t', tmuxSession, 
        '-F', '#{pane_index}:#{pane_current_command}:#{pane_active}'
      ]);
      let output = '';
      
      listProcess.stdout?.on('data', (data) => { 
        output += data.toString(); 
      });
      
      listProcess.on('exit', (code) => {
        if (code === 0) {
          const panes = output.trim().split('\n')
            .filter(line => line.trim())
            .map(line => {
              const [indexStr, command, activeStr] = line.split(':');
              return {
                paneIndex: parseInt(indexStr, 10),
                command: command || 'unknown',
                active: activeStr === '1'
              };
            });
          resolve(panes);
        } else {
          resolve([]);
        }
      });
    });
  }

  /**
   * Calculate task standard metrics for a farm
   */
  calculateTaskStandard(farmData: {
    tmuxSession: string;
    agents?: Array<AgentTaskInfo>;
    totalTasksAssigned?: number;
    completedTasks?: number;
    failedTasks?: number;
  }): Promise<TaskStandard> {
    return new Promise(async (resolve) => {
      try {
        const agentCount = await this.getAgentCount(farmData.tmuxSession);
        const agents = farmData.agents || [];
        
        const totalTasksAssigned = farmData.totalTasksAssigned || 
          agents.reduce((sum, agent) => sum + agent.totalTasksAssigned, 0);
        
        const completedTasks = farmData.completedTasks ||
          agents.reduce((sum, agent) => sum + agent.totalTasksCompleted, 0);
        
        const failedTasks = farmData.failedTasks ||
          agents.reduce((sum, agent) => sum + agent.totalTasksFailed, 0);
        
        const activeTasks = agents.filter(agent => 
          agent.currentTask && agent.currentTask.status === 'running'
        ).length;
        
        const taskCount = totalTasksAssigned;
        const tasksPerAgent = agentCount > 0 ? taskCount / agentCount : 0;
        const completionRate = taskCount > 0 ? (completedTasks / taskCount) * 100 : 0;
        const concurrencyUtilization = agentCount > 0 ? (activeTasks / agentCount) * 100 : 0;
        
        resolve({
          agentCount,
          taskCount,
          activeTasks,
          completedTasks,
          failedTasks,
          tasksPerAgent: Math.round(tasksPerAgent * 100) / 100, // 2 decimal places
          completionRate: Math.round(completionRate * 100) / 100,
          concurrencyUtilization: Math.round(concurrencyUtilization * 100) / 100
        });
      } catch (error) {
        console.error('[TaskStandard] Error calculating task standard:', error);
        resolve({
          agentCount: 0,
          taskCount: 0,
          activeTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          tasksPerAgent: 0,
          completionRate: 0,
          concurrencyUtilization: 0
        });
      }
    });
  }

  /**
   * Validate task assignment logic
   * Ensures we don't assign more concurrent tasks than agents
   */
  validateTaskAssignment(agentCount: number, tasksToAssign: number): {
    isValid: boolean;
    maxConcurrentTasks: number;
    recommendedBatchSize: number;
    message: string;
  } {
    const maxConcurrentTasks = agentCount; // 1 task per agent max
    
    if (tasksToAssign <= maxConcurrentTasks) {
      return {
        isValid: true,
        maxConcurrentTasks,
        recommendedBatchSize: tasksToAssign,
        message: `Can assign ${tasksToAssign} tasks to ${agentCount} agents concurrently`
      };
    } else {
      const batches = Math.ceil(tasksToAssign / maxConcurrentTasks);
      return {
        isValid: true, // Still valid, but requires batching
        maxConcurrentTasks,
        recommendedBatchSize: maxConcurrentTasks,
        message: `${tasksToAssign} tasks require ${batches} batches with ${agentCount} agents (${maxConcurrentTasks} concurrent tasks max)`
      };
    }
  }

  /**
   * Create a standardized agent identifier
   */
  createAgentId(farmId: string, tmuxPane: number): string {
    return `${farmId}-agent-${tmuxPane}`;
  }

  /**
   * Parse agent ID back to components
   */
  parseAgentId(agentId: string): { farmId: string; tmuxPane: number } | null {
    const match = agentId.match(/^(.+)-agent-(\d+)$/);
    if (match) {
      return {
        farmId: match[1],
        tmuxPane: parseInt(match[2], 10)
      };
    }
    return null;
  }
}

// Export singleton instance
export const taskStandardService = new TaskStandardService();

/**
 * USAGE EXAMPLES:
 * 
 * // Get agent count from tmux
 * const agentCount = await taskStandardService.getAgentCount('farm-session-123');
 * 
 * // Calculate task metrics
 * const metrics = await taskStandardService.calculateTaskStandard({
 *   tmuxSession: 'farm-session-123',
 *   totalTasksAssigned: 10,
 *   completedTasks: 7,
 *   failedTasks: 1
 * });
 * 
 * // Validate task assignment
 * const validation = taskStandardService.validateTaskAssignment(5, 12);
 * console.log(validation.message); // "12 tasks require 3 batches with 5 agents"
 */