import { logger } from '../utils/logger';

/**
 * Structured activity data extracted from terminal output
 */
export interface ParsedActivity {
  type: 'command' | 'file_operation' | 'tool_use' | 'thinking' | 'error' | 'progress' | 'completion';
  content: string;
  metadata: {
    files?: string[];
    tools?: string[];
    command?: string;
    errorLevel?: 'warning' | 'error' | 'critical';
    progress?: number;
    duration?: number;
  };
  timestamp: Date;
  agentId: number;
  sessionName: string;
}

/**
 * High-level agent activity state
 */
export interface AgentActivity {
  agentId: number;
  agentName: string;
  sessionName: string;
  status: 'idle' | 'thinking' | 'executing' | 'waiting' | 'completed' | 'error';
  currentTask: {
    type: 'file_edit' | 'command' | 'search' | 'analysis' | 'coordination' | 'tool_use';
    description: string;
    progress?: number;
    startTime: Date;
  } | null;
  recentActions: ParsedActivity[];
  metrics: {
    filesModified: number;
    commandsRun: number;
    toolsUsed: number;
    errorsEncountered: number;
    tasksCompleted: number;
  };
  lastUpdate: Date;
}

/**
 * Claude Code tool patterns for detection
 */
const TOOL_PATTERNS = {
  read: /(?:Reading|Read) file.*?([^\s]+\.(ts|js|tsx|jsx|py|md|json|yaml|yml|txt|log))/i,
  write: /(?:Writing|Write|Created?) file.*?([^\s]+\.(ts|js|tsx|jsx|py|md|json|yaml|yml|txt|log))/i,
  edit: /(?:Editing|Edit|Modified?) file.*?([^\s]+\.(ts|js|tsx|jsx|py|md|json|yaml|yml|txt|log))/i,
  bash: /(?:Running|Executing|Execute) command:?\s*(.+)/i,
  grep: /(?:Searching|Search) for.*?(?:in|across).*?files?/i,
  glob: /(?:Finding|Found) files? matching.*?pattern/i,
  task: /(?:Using|Invoke|Call) Task tool/i,
  websearch: /(?:Searching|Search) web for/i,
  webfetch: /(?:Fetching|Fetch) content from/i
};

/**
 * Command patterns for structured parsing
 */
const COMMAND_PATTERNS = {
  npm: /npm\s+(run|install|test|build|start)/i,
  git: /git\s+(add|commit|push|pull|status|diff|log)/i,
  test: /(npm\s+test|jest|cypress|playwright)/i,
  build: /(npm\s+run\s+build|vite\s+build|tsc)/i,
  lint: /(eslint|npm\s+run\s+lint|biome)/i,
  typecheck: /(tsc\s+--noEmit|npm\s+run\s+typecheck)/i
};

/**
 * Error patterns for classification
 */
const ERROR_PATTERNS = {
  critical: /(?:error|ERROR|fatal|FATAL|failed|FAILED|exception|Exception)/,
  warning: /(?:warn|WARNING|deprecated|Deprecated)/,
  info: /(?:info|INFO|note|NOTE|tip|TIP)/
};

/**
 * Progress indicators
 */
const PROGRESS_PATTERNS = {
  percentage: /(\d+)%/,
  completion: /(?:completed?|finished?|done)/i,
  starting: /(?:start|starting|begin|beginning)/i,
  processing: /(?:processing|working|analyzing)/i
};

export class ActivityParser {
  private agentActivities: Map<string, AgentActivity> = new Map();
  private rawOutputBuffer: Map<string, string> = new Map();

  /**
   * Parse raw terminal output into structured activities
   */
  parseTerminalOutput(
    sessionName: string,
    agentId: number,
    agentName: string,
    rawOutput: string
  ): ParsedActivity[] {
    const activities: ParsedActivity[] = [];
    const lines = rawOutput.split('\n').filter(line => line.trim());

    // Update agent state
    this.updateAgentActivity(sessionName, agentId, agentName);

    for (const line of lines) {
      const cleanLine = this.cleanLine(line);
      if (!cleanLine) continue;

      // Parse different types of activities
      const activity = this.parseLine(cleanLine, sessionName, agentId);
      if (activity) {
        activities.push(activity);
        this.updateAgentFromActivity(sessionName, agentId, activity);
      }
    }

    return activities;
  }

  /**
   * Clean terminal line of ANSI codes and control characters
   */
  private cleanLine(line: string): string {
    return line
      .replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI colors
      .replace(/\x1b\[[0-9]*[A-Z]/gi, '') // Remove cursor movement
      .replace(/\x1b\[2[JK]/g, '') // Remove clear commands
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars
      .trim();
  }

  /**
   * Parse individual line into activity
   */
  private parseLine(line: string, sessionName: string, agentId: number): ParsedActivity | null {
    const timestamp = new Date();

    // Check for tool usage patterns
    for (const [toolName, pattern] of Object.entries(TOOL_PATTERNS)) {
      const match = line.match(pattern);
      if (match) {
        return {
          type: 'tool_use',
          content: line,
          metadata: {
            tools: [toolName],
            files: this.extractFiles(line),
            command: toolName === 'bash' ? match[1] : undefined
          },
          timestamp,
          agentId,
          sessionName
        };
      }
    }

    // Check for command patterns
    for (const [cmdType, pattern] of Object.entries(COMMAND_PATTERNS)) {
      if (pattern.test(line)) {
        return {
          type: 'command',
          content: line,
          metadata: {
            command: line,
            tools: [cmdType]
          },
          timestamp,
          agentId,
          sessionName
        };
      }
    }

    // Check for error patterns
    const errorLevel = this.detectErrorLevel(line);
    if (errorLevel) {
      return {
        type: 'error',
        content: line,
        metadata: {
          errorLevel
        },
        timestamp,
        agentId,
        sessionName
      };
    }

    // Check for progress indicators
    const progress = this.extractProgress(line);
    if (progress !== null) {
      return {
        type: 'progress',
        content: line,
        metadata: {
          progress
        },
        timestamp,
        agentId,
        sessionName
      };
    }

    // Check for completion indicators
    if (PROGRESS_PATTERNS.completion.test(line)) {
      return {
        type: 'completion',
        content: line,
        metadata: {},
        timestamp,
        agentId,
        sessionName
      };
    }

    // Default: thinking/output
    if (line.length > 10) { // Only capture meaningful content
      return {
        type: 'thinking',
        content: line,
        metadata: {},
        timestamp,
        agentId,
        sessionName
      };
    }

    return null;
  }

  /**
   * Extract file paths from line
   */
  private extractFiles(line: string): string[] {
    const filePattern = /([^\s]+\.(ts|js|tsx|jsx|py|md|json|yaml|yml|txt|log|css|scss|html))/gi;
    const matches = line.match(filePattern);
    return matches ? [...new Set(matches)] : [];
  }

  /**
   * Detect error level from line content
   */
  private detectErrorLevel(line: string): 'warning' | 'error' | 'critical' | null {
    if (ERROR_PATTERNS.critical.test(line)) return 'critical';
    if (ERROR_PATTERNS.warning.test(line)) return 'warning';
    return null;
  }

  /**
   * Extract progress percentage from line
   */
  private extractProgress(line: string): number | null {
    const match = line.match(PROGRESS_PATTERNS.percentage);
    if (match) {
      const percentage = parseInt(match[1], 10);
      return isNaN(percentage) ? null : Math.min(100, Math.max(0, percentage));
    }
    return null;
  }

  /**
   * Update agent activity state
   */
  private updateAgentActivity(sessionName: string, agentId: number, agentName: string): void {
    const key = `${sessionName}:${agentId}`;
    
    if (!this.agentActivities.has(key)) {
      this.agentActivities.set(key, {
        agentId,
        agentName,
        sessionName,
        status: 'idle',
        currentTask: null,
        recentActions: [],
        metrics: {
          filesModified: 0,
          commandsRun: 0,
          toolsUsed: 0,
          errorsEncountered: 0,
          tasksCompleted: 0
        },
        lastUpdate: new Date()
      });
    }
  }

  /**
   * Update agent state based on parsed activity
   */
  private updateAgentFromActivity(sessionName: string, agentId: number, activity: ParsedActivity): void {
    const key = `${sessionName}:${agentId}`;
    const agent = this.agentActivities.get(key);
    if (!agent) return;

    // Update status based on activity type
    switch (activity.type) {
      case 'tool_use':
      case 'command':
        agent.status = 'executing';
        agent.metrics.toolsUsed++;
        if (activity.type === 'command') agent.metrics.commandsRun++;
        break;
      case 'error':
        agent.status = 'error';
        agent.metrics.errorsEncountered++;
        break;
      case 'completion':
        agent.status = 'completed';
        agent.metrics.tasksCompleted++;
        break;
      case 'thinking':
        agent.status = 'thinking';
        break;
      case 'progress':
        agent.status = 'executing';
        break;
    }

    // Update current task
    if (activity.type === 'tool_use' || activity.type === 'command') {
      const taskType = this.getTaskTypeFromActivity(activity);
      agent.currentTask = {
        type: taskType,
        description: this.generateTaskDescription(activity),
        progress: activity.metadata.progress,
        startTime: activity.timestamp
      };
    }

    // Update file metrics
    if (activity.metadata.files?.length) {
      agent.metrics.filesModified += activity.metadata.files.length;
    }

    // Keep recent actions (last 10)
    agent.recentActions.unshift(activity);
    if (agent.recentActions.length > 10) {
      agent.recentActions = agent.recentActions.slice(0, 10);
    }

    agent.lastUpdate = new Date();
    
    logger.debug(`[ActivityParser] Updated agent ${agentId} status: ${agent.status}`);
  }

  /**
   * Determine task type from activity
   */
  private getTaskTypeFromActivity(activity: ParsedActivity): AgentActivity['currentTask']['type'] {
    if (activity.metadata.tools?.includes('read') || activity.metadata.tools?.includes('grep')) {
      return 'search';
    }
    if (activity.metadata.tools?.includes('write') || activity.metadata.tools?.includes('edit')) {
      return 'file_edit';
    }
    if (activity.metadata.tools?.includes('bash')) {
      return 'command';
    }
    if (activity.metadata.tools?.includes('task')) {
      return 'coordination';
    }
    return 'analysis';
  }

  /**
   * Generate human-readable task description
   */
  private generateTaskDescription(activity: ParsedActivity): string {
    const tools = activity.metadata.tools || [];
    const files = activity.metadata.files || [];
    
    if (tools.includes('write')) {
      return `Creating ${files.length > 0 ? files[0] : 'file'}`;
    }
    if (tools.includes('edit')) {
      return `Editing ${files.length > 0 ? files[0] : 'file'}`;
    }
    if (tools.includes('read')) {
      return `Reading ${files.length > 0 ? files[0] : 'file'}`;
    }
    if (tools.includes('bash')) {
      const cmd = activity.metadata.command;
      if (cmd?.includes('npm')) return 'Running npm command';
      if (cmd?.includes('git')) return 'Git operation';
      if (cmd?.includes('test')) return 'Running tests';
      return 'Executing command';
    }
    if (tools.includes('grep')) {
      return 'Searching files';
    }
    
    return 'Working...';
  }

  /**
   * Get current agent activity
   */
  getAgentActivity(sessionName: string, agentId: number): AgentActivity | null {
    const key = `${sessionName}:${agentId}`;
    return this.agentActivities.get(key) || null;
  }

  /**
   * Get all agents for a session
   */
  getSessionActivities(sessionName: string): AgentActivity[] {
    const activities: AgentActivity[] = [];
    Array.from(this.agentActivities.entries()).forEach(([key, activity]) => {
      if (key.startsWith(`${sessionName}:`)) {
        activities.push(activity);
      }
    });
    return activities.sort((a, b) => a.agentId - b.agentId);
  }

  /**
   * Clean up activities for completed session
   */
  cleanupSession(sessionName: string): void {
    const keysToDelete: string[] = [];
    Array.from(this.agentActivities.keys()).forEach(key => {
      if (key.startsWith(`${sessionName}:`)) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => {
      this.agentActivities.delete(key);
    });
    
    logger.info(`[ActivityParser] Cleaned up activities for session ${sessionName}`);
  }

  /**
   * Get session-level progress metrics
   */
  getSessionProgress(sessionName: string): {
    overallProgress: number;
    activeAgents: number;
    totalTasks: number;
    completedTasks: number;
    errorCount: number;
  } {
    const activities = this.getSessionActivities(sessionName);
    
    const activeAgents = activities.filter(a => 
      a.status !== 'idle' && a.status !== 'completed'
    ).length;
    
    const totalTasks = activities.reduce((sum, a) => sum + a.metrics.tasksCompleted, 0);
    const errorCount = activities.reduce((sum, a) => sum + a.metrics.errorsEncountered, 0);
    
    // Calculate overall progress based on agent statuses
    let progressSum = 0;
    for (const activity of activities) {
      if (activity.status === 'completed') progressSum += 100;
      else if (activity.currentTask?.progress) progressSum += activity.currentTask.progress;
      else if (activity.status === 'executing') progressSum += 50;
      else if (activity.status === 'thinking') progressSum += 25;
    }
    
    const overallProgress = activities.length > 0 ? Math.round(progressSum / activities.length) : 0;
    
    return {
      overallProgress,
      activeAgents,
      totalTasks,
      completedTasks: totalTasks, // For now, same as totalTasks
      errorCount
    };
  }
}

// Export singleton instance
export const activityParser = new ActivityParser();