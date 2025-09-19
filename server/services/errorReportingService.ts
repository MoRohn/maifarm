import { EventEmitter } from 'events';
import logger from '../utils/logger';
import { WebSocketManager } from '../websocket/websocketManager';

export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  API_KEY = 'api_key',
  LAUNCH = 'launch',
  RUNTIME = 'runtime',
  HARVEST = 'harvest',
  CONFIGURATION = 'configuration',
  NETWORK = 'network',
  DATABASE = 'database'
}

export interface FarmError {
  farmId: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  details?: any;
  timestamp: Date;
  source: string;
  actionable: boolean;
  suggestedAction?: string;
}

class ErrorReportingService extends EventEmitter {
  private errors: Map<string, FarmError[]> = new Map();
  private criticalErrors: FarmError[] = [];

  /**
   * Report a farm error with full context
   */
  reportError(error: FarmError): void {
    // Log the error
    const logMessage = `[${error.source}] ${error.severity.toUpperCase()}: ${error.message} (Farm: ${error.farmId})`;
    
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        logger.error(logMessage, error.details);
        this.criticalErrors.push(error);
        break;
      case ErrorSeverity.ERROR:
        logger.error(logMessage, error.details);
        break;
      case ErrorSeverity.WARNING:
        logger.warn(logMessage, error.details);
        break;
      default:
        logger.info(logMessage, error.details);
    }

    // Store error for farm
    if (!this.errors.has(error.farmId)) {
      this.errors.set(error.farmId, []);
    }
    this.errors.get(error.farmId)!.push(error);

    // Broadcast to WebSocket
    this.broadcastError(error);

    // Emit event for listeners
    this.emit('error', error);
  }

  /**
   * Report API key error with specific guidance
   */
  reportApiKeyError(farmId: string, provider: string, source: string = 'OrchestratorService'): void {
    this.reportError({
      farmId,
      category: ErrorCategory.API_KEY,
      severity: ErrorSeverity.CRITICAL,
      message: `${provider.toUpperCase()} API key not configured or invalid`,
      timestamp: new Date(),
      source,
      actionable: true,
      suggestedAction: `Please add your ${provider} API key in Settings > API Keys or set ${provider === 'claude' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} in .env.development`,
      details: { provider }
    });
  }

  /**
   * Report agent launch failure
   */
  reportLaunchFailure(farmId: string, reason: string, details?: any): void {
    this.reportError({
      farmId,
      category: ErrorCategory.LAUNCH,
      severity: ErrorSeverity.ERROR,
      message: `Farm launch failed: ${reason}`,
      timestamp: new Date(),
      source: 'LaunchService',
      actionable: true,
      suggestedAction: this.getSuggestedActionForLaunchError(reason),
      details
    });
  }

  /**
   * Report harvest collection failure
   */
  reportHarvestError(farmId: string, harvestId: string, reason: string): void {
    this.reportError({
      farmId,
      category: ErrorCategory.HARVEST,
      severity: ErrorSeverity.WARNING,
      message: `Harvest collection issue: ${reason}`,
      timestamp: new Date(),
      source: 'HarvestService',
      actionable: false,
      details: { harvestId }
    });
  }

  /**
   * Get all errors for a farm
   */
  getFarmErrors(farmId: string): FarmError[] {
    return this.errors.get(farmId) || [];
  }

  /**
   * Get latest error for a farm
   */
  getLatestError(farmId: string): FarmError | null {
    const errors = this.getFarmErrors(farmId);
    return errors.length > 0 ? errors[errors.length - 1] : null;
  }

  /**
   * Clear errors for a farm
   */
  clearFarmErrors(farmId: string): void {
    this.errors.delete(farmId);
  }

  /**
   * Get critical errors across all farms
   */
  getCriticalErrors(): FarmError[] {
    return [...this.criticalErrors];
  }

  private broadcastError(error: FarmError): void {
    const eventName = error.severity === ErrorSeverity.CRITICAL ? 'error:critical' : 'error:reported';
    
    WebSocketManager.broadcast(eventName, {
      farmId: error.farmId,
      category: error.category,
      severity: error.severity,
      message: error.message,
      actionable: error.actionable,
      suggestedAction: error.suggestedAction,
      timestamp: error.timestamp
    });

    // Also broadcast farm-specific error event
    WebSocketManager.broadcastToFarm(error.farmId, 'farm:error', {
      category: error.category,
      message: error.message,
      severity: error.severity,
      actionable: error.actionable,
      suggestedAction: error.suggestedAction
    });
  }

  private getSuggestedActionForLaunchError(reason: string): string {
    if (reason.includes('API key')) {
      return 'Configure your API key in Settings > API Keys';
    }
    if (reason.includes('Claude CLI')) {
      return 'Install Claude CLI: npm install -g @anthropic-ai/cli';
    }
    if (reason.includes('tmux')) {
      return 'Ensure tmux is installed: brew install tmux (macOS) or apt-get install tmux (Linux)';
    }
    if (reason.includes('timeout')) {
      return 'Check your network connection and try again';
    }
    return 'Check the logs for more details';
  }
}

export const errorReportingService = new ErrorReportingService();