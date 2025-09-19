/**
 * Fix for premature farm completion issue
 * Prevents farms from completing immediately when API key is missing
 */

import { logger } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { db } from '../database/connection';

export class FarmCompletionFix {
  private static activeTimeouts = new Map<string, NodeJS.Timeout>();
  
  /**
   * Check if farm should complete based on actual runtime
   */
  static async shouldFarmComplete(farmId: string): Promise<boolean> {
    try {
      // Get farm creation time and configured timeout
      const result = await db.query(
        `SELECT created_at, config, status FROM farms WHERE id = $1`,
        [farmId]
      );
      
      if (result.rows.length === 0) {
        logger.warn(`[FarmCompletionFix] Farm ${farmId} not found`);
        return false;
      }
      
      const farm = result.rows[0];
      const createdAt = new Date(farm.created_at);
      const now = new Date();
      const elapsedSeconds = Math.floor((now.getTime() - createdAt.getTime()) / 1000);
      const configuredTimeout = farm.config?.timeout || 300; // Default 5 minutes
      
      logger.info(`[FarmCompletionFix] Farm ${farmId} runtime check:`, {
        elapsed: elapsedSeconds,
        configured: configuredTimeout,
        status: farm.status
      });
      
      // Only allow completion if:
      // 1. Farm has been running for at least 30 seconds (prevent immediate completion)
      // 2. Farm has exceeded its configured timeout
      // 3. OR farm status is explicitly set to completed/failed
      
      const minimumRuntime = 30; // seconds
      const shouldComplete = elapsedSeconds >= minimumRuntime && 
                           (elapsedSeconds >= configuredTimeout || 
                            farm.status === 'completed' || 
                            farm.status === 'failed');
      
      if (!shouldComplete && elapsedSeconds < minimumRuntime) {
        logger.warn(`[FarmCompletionFix] Preventing premature completion of farm ${farmId}. Only ${elapsedSeconds}s elapsed.`);
      }
      
      return shouldComplete;
    } catch (error) {
      logger.error(`[FarmCompletionFix] Error checking farm completion:`, error);
      return false;
    }
  }
  
  /**
   * Handle orchestrator process exit - validate before marking complete
   */
  static async handleProcessExit(farmId: string, exitCode: number | null): Promise<string> {
    logger.info(`[FarmCompletionFix] Process exit for farm ${farmId} with code ${exitCode}`);
    
    // Check if this is a premature exit
    const shouldComplete = await this.shouldFarmComplete(farmId);
    
    if (!shouldComplete) {
      // Process exited too early - likely due to missing API key or config issue
      logger.warn(`[FarmCompletionFix] Process exited prematurely for farm ${farmId}`);
      
      // Check for common issues
      const issues = await this.diagnoseIssues(farmId);
      
      if (issues.missingApiKey) {
        // Update farm status to indicate configuration issue
        await db.query(
          `UPDATE farms SET 
           status = 'failed',
           metrics = jsonb_set(
             COALESCE(metrics, '{}'::jsonb),
             '{error}',
             '"API key not configured"'::jsonb
           ),
           updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [farmId]
        );
        
        websocketManager.broadcast('farm:error', {
          farmId,
          error: 'Claude API key not configured. Please add ANTHROPIC_API_KEY to .env.development',
          needsConfiguration: true
        });
        
        return 'failed';
      }
      
      // Mark as failed with diagnostic info
      await db.query(
        `UPDATE farms SET 
         status = 'failed',
         metrics = jsonb_set(
           COALESCE(metrics, '{}'::jsonb),
           '{error}',
           $2::jsonb
         ),
         updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [farmId, JSON.stringify(issues.message || 'Process exited prematurely')]
      );
      
      return 'failed';
    }
    
    // Normal completion after appropriate runtime
    const finalStatus = exitCode === 0 ? 'completed' : 'failed';
    
    await db.query(
      `UPDATE farms SET 
       status = $2,
       updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [farmId, finalStatus]
    );
    
    return finalStatus;
  }
  
  /**
   * Diagnose common issues that cause premature exit
   */
  private static async diagnoseIssues(farmId: string): Promise<{
    missingApiKey: boolean;
    message: string;
  }> {
    const issues = {
      missingApiKey: false,
      message: ''
    };
    
    // Check for API keys
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY || !!process.env.CLAUDE_API_KEY;
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    
    if (!hasAnthropicKey && !hasOpenAIKey) {
      issues.missingApiKey = true;
      issues.message = 'No AI provider API keys configured';
      logger.error(`[FarmCompletionFix] No API keys found for farm ${farmId}`);
    }
    
    // Check farm configuration
    try {
      const result = await db.query(
        `SELECT config FROM farms WHERE id = $1`,
        [farmId]
      );
      
      if (result.rows.length > 0) {
        const config = result.rows[0].config;
        
        if (config?.provider === 'claude' && !hasAnthropicKey) {
          issues.missingApiKey = true;
          issues.message = 'Claude provider selected but ANTHROPIC_API_KEY not configured';
        } else if (config?.provider === 'openai' && !hasOpenAIKey) {
          issues.missingApiKey = true;
          issues.message = 'OpenAI provider selected but OPENAI_API_KEY not configured';
        }
      }
    } catch (error) {
      logger.error(`[FarmCompletionFix] Error checking farm config:`, error);
    }
    
    return issues;
  }
  
  /**
   * Set a proper timeout for farm completion
   */
  static scheduleProperTimeout(farmId: string, timeoutSeconds: number): void {
    // Clear any existing timeout
    if (this.activeTimeouts.has(farmId)) {
      clearTimeout(this.activeTimeouts.get(farmId)!);
    }
    
    // Ensure minimum runtime of 30 seconds
    const actualTimeout = Math.max(30, timeoutSeconds);
    
    logger.info(`[FarmCompletionFix] Scheduling proper timeout for farm ${farmId}: ${actualTimeout}s`);
    
    const timeout = setTimeout(async () => {
      logger.info(`[FarmCompletionFix] Timeout reached for farm ${farmId}`);
      
      // Trigger graceful shutdown through proper channels
      const { shutdownCoordinator } = await import('./shutdownCoordinator');
      await shutdownCoordinator.gracefulShutdown(farmId, 'timeout');
      
      this.activeTimeouts.delete(farmId);
    }, actualTimeout * 1000);
    
    this.activeTimeouts.set(farmId, timeout);
  }
  
  /**
   * Clear timeout for a farm
   */
  static clearTimeout(farmId: string): void {
    if (this.activeTimeouts.has(farmId)) {
      clearTimeout(this.activeTimeouts.get(farmId)!);
      this.activeTimeouts.delete(farmId);
      logger.info(`[FarmCompletionFix] Cleared timeout for farm ${farmId}`);
    }
  }
}

export default FarmCompletionFix;