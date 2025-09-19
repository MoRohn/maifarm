import { logger, LogCategory } from '../utils/logger';
import { WebSocketManager } from '../websocket/websocketManager';

export interface AgentError {
  farmId: string;
  agentId: number;
  agentName: string;
  severity: 'error' | 'warning' | 'critical';
  type: 'api_key' | 'cli_missing' | 'permission' | 'timeout' | 'crash' | 'unknown';
  message: string;
  rawOutput: string;
  timestamp: Date;
  context?: string;
}

export interface ErrorPattern {
  pattern: RegExp;
  type: AgentError['type'];
  severity: AgentError['severity'];
  messageExtractor: (match: RegExpMatchArray) => string;
  contextExtractor?: (lines: string[], matchIndex: number) => string;
}

/**
 * Service for detecting and reporting errors/warnings from Claude agents
 */
export class AgentErrorDetectionService {
  private static instance: AgentErrorDetectionService;
  private errorPatterns: ErrorPattern[] = [];
  private reportedErrors: Set<string> = new Set(); // Prevent duplicate notifications

  private constructor() {
    this.initializeErrorPatterns();
  }

  static getInstance(): AgentErrorDetectionService {
    if (!AgentErrorDetectionService.instance) {
      AgentErrorDetectionService.instance = new AgentErrorDetectionService();
    }
    return AgentErrorDetectionService.instance;
  }

  /**
   * Initialize error patterns to detect various types of agent issues
   */
  private initializeErrorPatterns(): void {
    this.errorPatterns = [
      // API Key Issues
      {
        pattern: /No ANTHROPIC_API_KEY|Invalid ANTHROPIC_API_KEY|ANTHROPIC_API_KEY.*not.*configured|authentication.*failed|401.*unauthorized/i,
        type: 'api_key',
        severity: 'critical',
        messageExtractor: () => 'API key is missing or invalid. Please check your Anthropic API key configuration.',
      },

      // Claude CLI Issues
      {
        pattern: /Claude CLI not installed|command not found.*claude|claude.*not.*found/i,
        type: 'cli_missing',
        severity: 'critical',
        messageExtractor: () => 'Claude CLI is not installed. Please install it with: npm install -g @anthropic-ai/cli',
      },

      // Permission Issues
      {
        pattern: /permission denied|access denied|forbidden|403.*forbidden|EACCES|EPERM/i,
        type: 'permission',
        severity: 'error',
        messageExtractor: (match) => `Permission denied: ${match[0]}`,
        contextExtractor: (lines, index) => {
          // Get 2 lines before and after for context
          const start = Math.max(0, index - 2);
          const end = Math.min(lines.length, index + 3);
          return lines.slice(start, end).join('\n');
        }
      },

      // Timeout Issues
      {
        pattern: /timeout|timed out|request timeout|connection timeout|ETIMEDOUT/i,
        type: 'timeout',
        severity: 'warning',
        messageExtractor: (match) => `Request timed out: ${match[0]}`,
      },

      // Memory Issues
      {
        pattern: /out of memory|memory limit|heap out of memory|ENOMEM|JavaScript heap out of memory/i,
        type: 'crash',
        severity: 'critical',
        messageExtractor: () => 'Agent ran out of memory. Consider increasing memory allocation.',
      },

      // Network Issues
      {
        pattern: /network error|connection refused|ECONNREFUSED|ENOTFOUND|DNS.*failed|resolve.*failed/i,
        type: 'unknown',
        severity: 'error',
        messageExtractor: (match) => `Network error: ${match[0]}`,
      },

      // Rate Limiting
      {
        pattern: /rate limit|too many requests|429.*rate|quota.*exceeded/i,
        type: 'unknown',
        severity: 'warning',
        messageExtractor: () => 'Rate limit exceeded. The agent will retry automatically.',
      },

      // Generic Error Patterns
      {
        pattern: /\[ERROR\]|ERROR:|Error:/i,
        type: 'unknown',
        severity: 'error',
        messageExtractor: (match) => {
          // Try to extract the actual error message after ERROR:
          const fullMatch = match.input || '';
          const errorMatch = fullMatch.match(/\[?ERROR\]?:?\s*(.+)/i);
          return errorMatch ? errorMatch[1] : 'Unknown error occurred';
        },
        contextExtractor: (lines, index) => {
          // For generic errors, get more context
          const start = Math.max(0, index - 1);
          const end = Math.min(lines.length, index + 2);
          return lines.slice(start, end).join('\n');
        }
      },

      // Warning Patterns
      {
        pattern: /\[WARNING\]|WARNING:|Warning:/i,
        type: 'unknown',
        severity: 'warning',
        messageExtractor: (match) => {
          const fullMatch = match.input || '';
          const warningMatch = fullMatch.match(/\[?WARNING\]?:?\s*(.+)/i);
          return warningMatch ? warningMatch[1] : 'Warning detected';
        },
      },

      // Claude Code specific errors
      {
        pattern: /claude.*failed|claude.*error|anthropic.*error/i,
        type: 'unknown',
        severity: 'error',
        messageExtractor: (match) => `Claude Code error: ${match[0]}`,
      }
    ];

    logger.info(LogCategory.AGENT, `Initialized ${this.errorPatterns.length} error detection patterns`);
  }

  /**
   * Analyze terminal output lines for errors and warnings
   */
  public analyzeOutput(
    farmId: string,
    agentId: number,
    agentName: string,
    outputLines: string[]
  ): AgentError[] {
    const errors: AgentError[] = [];
    
    for (let i = 0; i < outputLines.length; i++) {
      const line = outputLines[i];
      
      for (const pattern of this.errorPatterns) {
        const match = line.match(pattern.pattern);
        if (match) {
          // Create unique key to prevent duplicate notifications
          const errorKey = `${farmId}-${agentId}-${pattern.type}-${match[0].substring(0, 50)}`;
          
          if (!this.reportedErrors.has(errorKey)) {
            const error: AgentError = {
              farmId,
              agentId,
              agentName,
              severity: pattern.severity,
              type: pattern.type,
              message: pattern.messageExtractor(match),
              rawOutput: line,
              timestamp: new Date(),
              context: pattern.contextExtractor ? pattern.contextExtractor(outputLines, i) : undefined
            };
            
            errors.push(error);
            this.reportedErrors.add(errorKey);
            
            // Log the detected error
            logger.warn(LogCategory.AGENT, 
              `Detected ${error.severity} in agent ${agentName} (${agentId}): ${error.message}`);
            
            // Only process the first match per line to avoid duplicates
            break;
          }
        }
      }
    }
    
    return errors;
  }

  /**
   * Report errors to the notification system via WebSocket
   */
  public reportErrors(errors: AgentError[]): void {
    for (const error of errors) {
      this.reportError(error);
    }
  }

  /**
   * Report a single error via WebSocket
   */
  private reportError(error: AgentError): void {
    const eventName = error.severity === 'warning' ? 'agent:warning' : 'agent:error';
    
    WebSocketManager.broadcast(eventName, {
      farmId: error.farmId,
      agentId: error.agentId,
      agentName: error.agentName,
      severity: error.severity,
      type: error.type,
      message: error.message,
      rawOutput: error.rawOutput,
      timestamp: error.timestamp,
      context: error.context
    });

    // Also broadcast to specific farm listeners
    WebSocketManager.broadcast(`farm:${error.farmId}:${eventName}`, {
      agentId: error.agentId,
      agentName: error.agentName,
      severity: error.severity,
      type: error.type,
      message: error.message,
      rawOutput: error.rawOutput,
      timestamp: error.timestamp,
      context: error.context
    });

    logger.info(LogCategory.AGENT, 
      `Reported ${error.severity} for agent ${error.agentName}: ${error.message}`);
  }

  /**
   * Clear reported errors cache for a specific farm (useful when farm restarts)
   */
  public clearReportedErrors(farmId?: string): void {
    if (farmId) {
      // Clear only errors for specific farm
      const keysToDelete = Array.from(this.reportedErrors).filter(key => key.startsWith(farmId));
      keysToDelete.forEach(key => this.reportedErrors.delete(key));
      logger.debug(LogCategory.AGENT, `Cleared ${keysToDelete.length} reported errors for farm ${farmId}`);
    } else {
      // Clear all reported errors
      this.reportedErrors.clear();
      logger.debug(LogCategory.AGENT, 'Cleared all reported errors cache');
    }
  }

  /**
   * Add custom error pattern
   */
  public addCustomPattern(pattern: ErrorPattern): void {
    this.errorPatterns.push(pattern);
    logger.info(LogCategory.AGENT, `Added custom error pattern for type: ${pattern.type}`);
  }

  /**
   * Get statistics about detected errors
   */
  public getErrorStats(): { totalReported: number; patternCount: number } {
    return {
      totalReported: this.reportedErrors.size,
      patternCount: this.errorPatterns.length
    };
  }
}

// Export singleton instance
export const agentErrorDetectionService = AgentErrorDetectionService.getInstance();