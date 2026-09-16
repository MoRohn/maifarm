/**
 * User-friendly error mapper
 * Converts technical error messages to user-friendly explanations
 */

import { structuredLogger as logger, LogCategory } from './structuredLogger';

export interface MappedError {
  userMessage: string;
  technicalMessage: string;
  code: string;
  recoverable: boolean;
  suggestions?: string[];
  helpLink?: string;
}

/**
 * Error code to user-friendly message mappings
 */
const ERROR_MAPPINGS: Record<string, Partial<MappedError>> = {
  // Network errors
  'ECONNREFUSED': {
    userMessage: 'Unable to connect to the AI service.',
    suggestions: [
      'Check your API keys in Settings',
      'Verify your internet connection',
      'The AI service may be temporarily unavailable'
    ],
    recoverable: true,
    code: 'CONNECTION_REFUSED'
  },
  
  'ETIMEDOUT': {
    userMessage: 'The request took too long to complete.',
    suggestions: [
      'The AI service may be busy',
      'Try again in a few moments',
      'Consider using a smaller prompt or fewer agents'
    ],
    recoverable: true,
    code: 'TIMEOUT'
  },
  
  'ENOTFOUND': {
    userMessage: 'Could not reach the AI service.',
    suggestions: [
      'Check your internet connection',
      'Verify the API endpoint is correct',
      'Your firewall may be blocking the connection'
    ],
    recoverable: true,
    code: 'SERVICE_NOT_FOUND'
  },
  
  // API errors
  'ANTHROPIC_API_KEY': {
    userMessage: 'Claude API key is not configured.',
    suggestions: [
      'Go to Settings → AI Providers',
      'Add your Anthropic API key',
      'Get an API key from console.anthropic.com'
    ],
    recoverable: false,
    code: 'MISSING_API_KEY',
    helpLink: 'https://console.anthropic.com'
  },
  
  'OPENAI_API_KEY': {
    userMessage: 'OpenAI API key is not configured.',
    suggestions: [
      'Go to Settings → AI Providers',
      'Add your OpenAI API key',
      'Get an API key from platform.openai.com'
    ],
    recoverable: false,
    code: 'MISSING_API_KEY',
    helpLink: 'https://platform.openai.com'
  },
  
  '401': {
    userMessage: 'Authentication failed with the AI service.',
    suggestions: [
      'Your API key may be invalid',
      'Check your API key in Settings',
      'Ensure your API key has the necessary permissions'
    ],
    recoverable: false,
    code: 'AUTH_FAILED'
  },
  
  '403': {
    userMessage: 'Access denied by the AI service.',
    suggestions: [
      'Your API key may not have the required permissions',
      'Check your account status with the AI provider',
      'You may have exceeded your usage quota'
    ],
    recoverable: false,
    code: 'ACCESS_DENIED'
  },
  
  '429': {
    userMessage: 'Too many requests to the AI service.',
    suggestions: [
      'You\'ve hit the rate limit',
      'Wait a few moments before trying again',
      'Consider reducing the number of concurrent agents'
    ],
    recoverable: true,
    code: 'RATE_LIMITED'
  },
  
  '500': {
    userMessage: 'The AI service encountered an error.',
    suggestions: [
      'This is a temporary issue with the AI service',
      'Try again in a few moments',
      'If the problem persists, check the service status page'
    ],
    recoverable: true,
    code: 'SERVICE_ERROR'
  },
  
  '503': {
    userMessage: 'The AI service is temporarily unavailable.',
    suggestions: [
      'The service is undergoing maintenance',
      'Try again in a few minutes',
      'Check the service status page for updates'
    ],
    recoverable: true,
    code: 'SERVICE_UNAVAILABLE'
  },
  
  // Tmux errors
  'tmux has-session': {
    userMessage: 'Session management issue detected.',
    suggestions: [
      'The farm session may have been terminated',
      'Try restarting the farm',
      'Check if tmux is running: tmux list-sessions'
    ],
    recoverable: true,
    code: 'SESSION_ERROR'
  },
  
  'no server running': {
    userMessage: 'The tmux server is not running.',
    suggestions: [
      'Start tmux server: tmux start-server',
      'Restart the MaiFarm application',
      'Check if tmux is installed: which tmux'
    ],
    recoverable: false,
    code: 'TMUX_NOT_RUNNING'
  },
  
  'session not found': {
    userMessage: 'The farm session could not be found.',
    suggestions: [
      'The farm may have already completed',
      'Try creating a new farm',
      'Check active sessions: tmux list-sessions'
    ],
    recoverable: true,
    code: 'SESSION_NOT_FOUND'
  },
  
  // Database errors
  'ECONNRESET': {
    userMessage: 'Lost connection to the database.',
    suggestions: [
      'Check if PostgreSQL is running',
      'Verify database credentials',
      'The database may be restarting'
    ],
    recoverable: true,
    code: 'DB_CONNECTION_LOST'
  },
  
  'ER_ACCESS_DENIED_ERROR': {
    userMessage: 'Database access denied.',
    suggestions: [
      'Check database username and password',
      'Verify database permissions',
      'Update .env.development with correct credentials'
    ],
    recoverable: false,
    code: 'DB_ACCESS_DENIED'
  },
  
  'ER_BAD_DB_ERROR': {
    userMessage: 'Database does not exist.',
    suggestions: [
      'Run database setup: npm run setup:postgres',
      'Create database manually: createdb maifarm_dev',
      'Check database name in .env.development'
    ],
    recoverable: false,
    code: 'DB_NOT_FOUND'
  },
  
  // File system errors
  'ENOENT': {
    userMessage: 'Required file or directory not found.',
    suggestions: [
      'The workspace may not have been created',
      'Check file permissions',
      'Try recreating the farm'
    ],
    recoverable: true,
    code: 'FILE_NOT_FOUND'
  },
  
  'EACCES': {
    userMessage: 'Permission denied accessing files.',
    suggestions: [
      'Check file permissions in the maibarn directory',
      'Ensure the application has write access',
      'Try running with appropriate permissions'
    ],
    recoverable: false,
    code: 'PERMISSION_DENIED'
  },
  
  'ENOSPC': {
    userMessage: 'Not enough disk space available.',
    suggestions: [
      'Free up disk space',
      'Clean up old harvests in the Barn',
      'Check available space: df -h'
    ],
    recoverable: false,
    code: 'DISK_FULL'
  },
  
  // Application errors
  'FARM_TIMEOUT': {
    userMessage: 'The farm exceeded its time limit.',
    suggestions: [
      'The task may have been too complex',
      'Try breaking it into smaller tasks',
      'Increase the timeout in farm settings'
    ],
    recoverable: false,
    code: 'FARM_TIMEOUT'
  },
  
  'AGENT_FAILED': {
    userMessage: 'One or more agents encountered errors.',
    suggestions: [
      'Check the terminal output for details',
      'The agent may have crashed',
      'Try reducing the number of agents'
    ],
    recoverable: true,
    code: 'AGENT_FAILED'
  },
  
  'COLLECTION_FAILED': {
    userMessage: 'Failed to collect harvest files.',
    suggestions: [
      'The agents may not have produced output',
      'Check the workspace directory',
      'Try manual collection from the Harvest page'
    ],
    recoverable: true,
    code: 'COLLECTION_FAILED'
  }
};

/**
 * Map a technical error to a user-friendly message
 */
export function mapError(error: Error | string | any): MappedError {
  const errorString = typeof error === 'string' 
    ? error 
    : error?.message || error?.code || String(error);
  
  // Check for exact matches first
  for (const [pattern, mapping] of Object.entries(ERROR_MAPPINGS)) {
    if (errorString.includes(pattern)) {
      return {
        userMessage: mapping.userMessage || 'An unexpected error occurred.',
        technicalMessage: errorString,
        code: mapping.code || 'UNKNOWN_ERROR',
        recoverable: mapping.recoverable ?? false,
        suggestions: mapping.suggestions,
        helpLink: mapping.helpLink
      };
    }
  }
  
  // Check for HTTP status codes
  const statusMatch = errorString.match(/\b(4\d{2}|5\d{2})\b/);
  if (statusMatch) {
    const statusCode = statusMatch[1];
    const mapping = ERROR_MAPPINGS[statusCode];
    if (mapping) {
      return {
        userMessage: mapping.userMessage || `HTTP ${statusCode} error occurred.`,
        technicalMessage: errorString,
        code: mapping.code || `HTTP_${statusCode}`,
        recoverable: mapping.recoverable ?? false,
        suggestions: mapping.suggestions,
        helpLink: mapping.helpLink
      };
    }
  }
  
  // Check for common patterns
  if (errorString.toLowerCase().includes('timeout')) {
    return mapError('ETIMEDOUT');
  }
  
  if (errorString.toLowerCase().includes('connection') && errorString.toLowerCase().includes('refused')) {
    return mapError('ECONNREFUSED');
  }
  
  if (errorString.toLowerCase().includes('api') && errorString.toLowerCase().includes('key')) {
    if (errorString.includes('anthropic') || errorString.includes('claude')) {
      return mapError('ANTHROPIC_API_KEY');
    }
    if (errorString.includes('openai') || errorString.includes('gpt')) {
      return mapError('OPENAI_API_KEY');
    }
  }
  
  // Default fallback
  return {
    userMessage: 'An unexpected error occurred.',
    technicalMessage: errorString,
    code: 'UNKNOWN_ERROR',
    recoverable: false,
    suggestions: [
      'Check the logs for more details',
      'Try restarting the application',
      'If the problem persists, report it on GitHub'
    ]
  };
}

/**
 * Format an error for display to the user
 */
export function formatErrorForUser(error: Error | string | any): string {
  const mapped = mapError(error);
  
  let formatted = mapped.userMessage;
  
  if (mapped.suggestions && mapped.suggestions.length > 0) {
    formatted += '\n\nSuggestions:\n';
    formatted += mapped.suggestions.map(s => `• ${s}`).join('\n');
  }
  
  if (mapped.helpLink) {
    formatted += `\n\nFor more help, visit: ${mapped.helpLink}`;
  }
  
  return formatted;
}

/**
 * Log an error with context
 */
export function logError(
  error: Error | string | any,
  context?: Record<string, any>
): MappedError {
  const mapped = mapError(error);
  
  logger.error(LogCategory.ERROR, mapped.userMessage, {
    ...context,
    technicalMessage: mapped.technicalMessage,
    code: mapped.code,
    recoverable: mapped.recoverable
  });
  
  return mapped;
}

/**
 * Check if an error is recoverable
 */
export function isRecoverableError(error: Error | string | any): boolean {
  const mapped = mapError(error);
  return mapped.recoverable;
}

/**
 * Get error code from error
 */
export function getErrorCode(error: Error | string | any): string {
  const mapped = mapError(error);
  return mapped.code;
}

/**
 * Create a custom error with user-friendly message
 */
export class UserFriendlyError extends Error {
  public userMessage: string;
  public code: string;
  public recoverable: boolean;
  public suggestions?: string[];
  public helpLink?: string;
  
  constructor(
    technicalMessage: string,
    userMessage?: string,
    code: string = 'CUSTOM_ERROR',
    recoverable: boolean = false
  ) {
    super(technicalMessage);
    this.name = 'UserFriendlyError';
    
    const mapped = mapError(technicalMessage);
    this.userMessage = userMessage || mapped.userMessage;
    this.code = code;
    this.recoverable = recoverable;
    this.suggestions = mapped.suggestions;
    this.helpLink = mapped.helpLink;
  }
  
  toJSON(): MappedError {
    return {
      userMessage: this.userMessage,
      technicalMessage: this.message,
      code: this.code,
      recoverable: this.recoverable,
      suggestions: this.suggestions,
      helpLink: this.helpLink
    };
  }
}