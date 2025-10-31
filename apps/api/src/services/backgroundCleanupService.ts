import { logger, LogCategory } from '../utils/logger';
import { MaiBarn } from './maibarn';

/**
 * Background cleanup service to handle stale session cleanup without blocking API calls
 */
export class BackgroundCleanupService {
  private static instance: BackgroundCleanupService;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private lastCleanupTime = 0;
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MIN_CLEANUP_DELAY_MS = 60 * 1000; // 1 minute minimum between cleanups
  private isRunning = false;
  
  private constructor() {}
  
  static getInstance(): BackgroundCleanupService {
    if (!BackgroundCleanupService.instance) {
      BackgroundCleanupService.instance = new BackgroundCleanupService();
    }
    return BackgroundCleanupService.instance;
  }
  
  /**
   * Start the background cleanup service
   */
  start() {
    if (this.cleanupInterval) {
      logger.debug('[BackgroundCleanup] Service already running');
      return;
    }
    
    logger.info('[BackgroundCleanup] Starting background cleanup service');
    
    // Run initial cleanup after 30 seconds
    setTimeout(() => this.performCleanup(), 30000);
    
    // Set up recurring cleanup
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.CLEANUP_INTERVAL_MS);
  }
  
  /**
   * Stop the background cleanup service
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('[BackgroundCleanup] Background cleanup service stopped');
    }
  }
  
  /**
   * Force cleanup now (with throttling)
   */
  async forceCleanup(includeAll: boolean = false): Promise<string[]> {
    const now = Date.now();
    
    // Throttle cleanup calls - don't run more than once per minute
    if (now - this.lastCleanupTime < this.MIN_CLEANUP_DELAY_MS) {
      const nextCleanupIn = this.MIN_CLEANUP_DELAY_MS - (now - this.lastCleanupTime);
      logger.debug(`[BackgroundCleanup] Cleanup throttled, next cleanup in ${Math.ceil(nextCleanupIn / 1000)}s`);
      return [];
    }
    
    return this.performCleanup(includeAll);
  }
  
  /**
   * Perform the actual cleanup operation
   */
  private async performCleanup(includeAll: boolean = false): Promise<string[]> {
    if (this.isRunning) {
      logger.debug('[BackgroundCleanup] Cleanup already in progress, skipping');
      return [];
    }
    
    this.isRunning = true;
    this.lastCleanupTime = Date.now();
    
    try {
      logger.debug('[BackgroundCleanup] Starting session cleanup');
      const cleanedSessions = await MaiBarn.cleanupStaleSessions(includeAll);
      
      if (cleanedSessions.length > 0) {
        logger.info(`[BackgroundCleanup] Cleaned up ${cleanedSessions.length} stale sessions: ${cleanedSessions.join(', ')}`);
      } else {
        logger.debug('[BackgroundCleanup] No stale sessions found to clean');
      }
      
      return cleanedSessions;
    } catch (error) {
      logger.error('[BackgroundCleanup] Error during cleanup:', error);
      return [];
    } finally {
      this.isRunning = false;
    }
  }
  
  /**
   * Get cleanup service status
   */
  getStatus() {
    return {
      running: !!this.cleanupInterval,
      lastCleanup: this.lastCleanupTime,
      nextCleanup: this.cleanupInterval ? this.lastCleanupTime + this.CLEANUP_INTERVAL_MS : null,
      isProcessing: this.isRunning
    };
  }
}

// Export singleton instance
export const backgroundCleanupService = BackgroundCleanupService.getInstance();