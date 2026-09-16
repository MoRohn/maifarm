/**
 * Logger utility - Proxy to enhanced logger
 * This file now proxies to the enhanced logger for consistency
 */
import { logger as enhancedLogger, LogLevel } from '../config/logging';

// Re-export LogLevel for use in other modules
export { LogLevel };

// Define LogCategory enum for structured logging
export enum LogCategory {
  TERMINAL = 'TERMINAL',
  FARM = 'FARM',
  AGENT = 'AGENT',
  HARVEST = 'HARVEST',
  ERROR = 'ERROR',
  WEBSOCKET = 'WEBSOCKET',
  ORCHESTRATOR = 'ORCHESTRATOR',
  API = 'API',
  DATABASE = 'DATABASE',
  MONITORING = 'MONITORING',
  XENOSYNC = 'XENOSYNC',
  EMAIL = 'EMAIL',
  SECURITY = 'SECURITY',
  SYSTEM = 'SYSTEM',
  APP = 'APP',
  GENERAL = 'GENERAL',
  COORDINATION = 'COORDINATION',
  FILESYSTEM = 'FILESYSTEM',
  CLEANUP = 'CLEANUP',
  AI = 'AI',
  THERMAL = 'THERMAL'
}

// Create a compatibility wrapper for Winston-style logging
const logger = {
  error: (message: string, ...args: any[]) => {
    // Guard against undefined message
    if (!message) {
      enhancedLogger.error('General', 'Unknown error', ...args);
      return;
    }
    // Extract category from message if it contains brackets
    const match = message.match(/^\[([^\]]+)\]\s*(.*)/);
    if (match) {
      if (args.length > 0 && args[0] !== undefined) {
        enhancedLogger.error(match[1], match[2], ...args);
      } else {
        enhancedLogger.error(match[1], match[2]);
      }
    } else {
      if (args.length > 0 && args[0] !== undefined) {
        enhancedLogger.error('APP', message, ...args);
      } else {
        enhancedLogger.error('APP', message);
      }
    }
  },
  
  warn: (message: string, ...args: any[]) => {
    if (!message) {
      enhancedLogger.warn('General', 'Unknown warning', ...args);
      return;
    }
    const match = message.match(/^\[([^\]]+)\]\s*(.*)/);
    if (match) {
      if (args.length > 0 && args[0] !== undefined) {
        enhancedLogger.warn(match[1], match[2], ...args);
      } else {
        enhancedLogger.warn(match[1], match[2]);
      }
    } else {
      if (args.length > 0 && args[0] !== undefined) {
        enhancedLogger.warn('APP', message, ...args);
      } else {
        enhancedLogger.warn('APP', message);
      }
    }
  },
  
  info: (message: string, ...args: any[]) => {
    if (!message) {
      enhancedLogger.info('General', 'Unknown info', ...args);
      return;
    }
    const match = message.match(/^\[([^\]]+)\]\s*(.*)/);
    if (match) {
      if (args.length > 0 && args[0] !== undefined) {
        enhancedLogger.info(match[1], match[2], ...args);
      } else {
        enhancedLogger.info(match[1], match[2]);
      }
    } else {
      if (args.length > 0 && args[0] !== undefined) {
        enhancedLogger.info('APP', message, ...args);
      } else {
        enhancedLogger.info('APP', message);
      }
    }
  },
  
  http: (message: string, ...args: any[]) => {
    // HTTP logs go to debug level in enhanced logger
    if (!message) {
      enhancedLogger.debug('HTTP', 'Unknown request', ...args);
      return;
    }
    const match = message.match(/^\[([^\]]+)\]\s*(.*)/);
    if (match) {
      enhancedLogger.debug(match[1], match[2], ...args);
    } else {
      enhancedLogger.debug('HTTP', message, ...args);
    }
  },
  
  debug: (message: string, ...args: any[]) => {
    if (!message) {
      enhancedLogger.debug('General', 'Unknown debug', ...args);
      return;
    }
    const match = message.match(/^\[([^\]]+)\]\s*(.*)/);
    if (match) {
      if (args.length > 0 && args[0] !== undefined) {
        enhancedLogger.debug(match[1], match[2], ...args);
      } else {
        enhancedLogger.debug(match[1], match[2]);
      }
    } else {
      if (args.length > 0 && args[0] !== undefined) {
        enhancedLogger.debug('APP', message, ...args);
      } else {
        enhancedLogger.debug('APP', message);
      }
    }
  },
  
  trace: (message: string, ...args: any[]) => {
    if (!message) {
      enhancedLogger.trace('General', 'Unknown trace', ...args);
      return;
    }
    const match = message.match(/^\[([^\]]+)\]\s*(.*)/);
    if (match) {
      enhancedLogger.trace(match[1], match[2], ...args);
    } else {
      enhancedLogger.trace('APP', message, ...args);
    }
  },
  
  // Winston compatibility - ignore metadata objects
  log: (level: string, message: string, meta?: any) => {
    const levelMap: Record<string, keyof typeof logger> = {
      'error': 'error',
      'warn': 'warn',
      'info': 'info',
      'http': 'http',
      'debug': 'debug'
    };
    const method = levelMap[level] || 'info';
    logger[method](LogCategory.GENERAL, message);
  }
};

export default logger;
export { logger };