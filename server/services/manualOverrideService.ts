/**
 * Manual Override Service
 * Implements XenoSync-style manual triggers for stuck agent situations
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as process from 'process';
import { logger } from '../utils/logger';
import { projectCoordinator } from './projectWorkspaceCoordinator';
import { completionDetector } from './enhancedCompletionDetector';
import { websocketManager } from '../websocket/websocketManager';
import chokidar from 'chokidar';

interface ManualTrigger {
  type: 'signal' | 'file' | 'api';
  farmId: string;
  action: 'merge' | 'complete' | 'abort' | 'force_harvest';
  timestamp: Date;
  source: string;
}

export class ManualOverrideService extends EventEmitter {
  private triggerHistory: ManualTrigger[] = [];
  private fileWatchers: Map<string, chokidar.FSWatcher> = new Map();
  private signalHandlersRegistered: boolean = false;
  private activeFarms: Map<string, string> = new Map(); // farmId -> workspacePath

  constructor() {
    super();
    this.setupSignalHandlers();
  }

  /**
   * Register a farm for manual override monitoring
   */
  registerFarm(farmId: string, workspacePath: string): void {
    this.activeFarms.set(farmId, workspacePath);
    this.setupFileTriggerWatcher(farmId, workspacePath);
    
    logger.info(`[ManualOverride] Registered farm ${farmId} for override monitoring`);
  }

  /**
   * Unregister a farm from monitoring
   */
  unregisterFarm(farmId: string): void {
    // Stop file watcher
    const watcher = this.fileWatchers.get(farmId);
    if (watcher) {
      watcher.close();
      this.fileWatchers.delete(farmId);
    }
    
    this.activeFarms.delete(farmId);
    
    logger.info(`[ManualOverride] Unregistered farm ${farmId}`);
  }

  /**
   * Setup signal handlers for manual triggers
   */
  private setupSignalHandlers(): void {
    if (this.signalHandlersRegistered) return;
    
    // USR1 signal - trigger immediate merge (XenoSync style)
    process.on('SIGUSR1', () => {
      logger.info('[ManualOverride] Received USR1 signal - triggering manual merge');
      this.handleSignalTrigger('merge');
    });
    
    // USR2 signal - force completion
    process.on('SIGUSR2', () => {
      logger.info('[ManualOverride] Received USR2 signal - forcing completion');
      this.handleSignalTrigger('complete');
    });
    
    // SIGINFO signal (macOS) or SIGUSR1 (Linux) - show status
    if (process.platform === 'darwin') {
      // macOS uses SIGINFO (Ctrl+T in terminal)
      process.on('SIGINFO' as any, () => {
        this.showSystemStatus();
      });
    }
    
    this.signalHandlersRegistered = true;
    logger.info('[ManualOverride] Signal handlers registered (USR1=merge, USR2=complete)');
  }

  /**
   * Handle signal-based trigger
   */
  private async handleSignalTrigger(action: 'merge' | 'complete'): Promise<void> {
    // Apply to all active farms
    for (const [farmId, workspacePath] of this.activeFarms) {
      const trigger: ManualTrigger = {
        type: 'signal',
        farmId,
        action,
        timestamp: new Date(),
        source: `PID ${process.pid}`
      };
      
      this.triggerHistory.push(trigger);
      
      try {
        await this.executeTriggerAction(trigger);
      } catch (error) {
        logger.error(`[ManualOverride] Failed to execute signal trigger for farm ${farmId}:`, error);
      }
    }
  }

  /**
   * Setup file trigger watcher for a farm
   */
  private setupFileTriggerWatcher(farmId: string, workspacePath: string): void {
    const triggerFiles = [
      '.xenosync_merge_now',      // XenoSync compatibility
      '.maifarm_merge_now',        // MaiFarm specific
      '.force_complete',           // Force completion
      '.abort_farm'                // Abort farm
    ];
    
    // Watch for trigger files in workspace root
    const watcher = chokidar.watch(
      triggerFiles.map(f => path.join(workspacePath, f)),
      {
        persistent: true,
        ignoreInitial: true,
        depth: 0
      }
    );
    
    watcher.on('add', async (filePath) => {
      const fileName = path.basename(filePath);
      let action: ManualTrigger['action'] = 'merge';
      
      switch (fileName) {
        case '.xenosync_merge_now':
        case '.maifarm_merge_now':
          action = 'merge';
          break;
        case '.force_complete':
          action = 'complete';
          break;
        case '.abort_farm':
          action = 'abort';
          break;
      }
      
      logger.info(`[ManualOverride] Detected trigger file ${fileName} for farm ${farmId}`);
      
      const trigger: ManualTrigger = {
        type: 'file',
        farmId,
        action,
        timestamp: new Date(),
        source: fileName
      };
      
      this.triggerHistory.push(trigger);
      
      // Execute trigger action
      await this.executeTriggerAction(trigger);
      
      // Remove trigger file after processing
      try {
        await fs.unlink(filePath);
      } catch (error) {
        logger.warn(`[ManualOverride] Could not remove trigger file ${fileName}:`, error);
      }
    });
    
    this.fileWatchers.set(farmId, watcher);
    
    logger.debug(`[ManualOverride] File trigger watcher set up for farm ${farmId}`);
  }

  /**
   * Execute trigger action
   */
  private async executeTriggerAction(trigger: ManualTrigger): Promise<void> {
    logger.info(`[ManualOverride] Executing ${trigger.action} for farm ${trigger.farmId}`);
    
    switch (trigger.action) {
      case 'merge':
        await this.triggerProjectMerge(trigger.farmId);
        break;
        
      case 'complete':
        await this.forceCompletion(trigger.farmId);
        break;
        
      case 'abort':
        await this.abortFarm(trigger.farmId);
        break;
        
      case 'force_harvest':
        await this.forceHarvest(trigger.farmId);
        break;
        
      default:
        logger.warn(`[ManualOverride] Unknown action: ${trigger.action}`);
    }
    
    // Emit event for monitoring
    this.emit('manual:trigger', trigger);
    
    // Broadcast to WebSocket clients
    websocketManager.broadcast('farm:manual:override', {
      farmId: trigger.farmId,
      action: trigger.action,
      type: trigger.type,
      timestamp: trigger.timestamp
    });
  }

  /**
   * Trigger immediate project merge
   */
  private async triggerProjectMerge(farmId: string): Promise<void> {
    try {
      logger.info(`[ManualOverride] Triggering immediate merge for farm ${farmId}`);
      
      // Force merge in project coordinator
      const mergeSuccess = await projectCoordinator.mergeProjects();
      
      if (mergeSuccess) {
        logger.info(`[ManualOverride] Successfully triggered merge for farm ${farmId}`);
        
        // Notify completion detector
        completionDetector.addExplicitSignal(-1, 1.0, 'Manual merge triggered');
      } else {
        logger.error(`[ManualOverride] Failed to merge projects for farm ${farmId}`);
      }
    } catch (error) {
      logger.error(`[ManualOverride] Error triggering merge for farm ${farmId}:`, error);
      throw error;
    }
  }

  /**
   * Force completion of all agents
   */
  private async forceCompletion(farmId: string): Promise<void> {
    try {
      logger.info(`[ManualOverride] Forcing completion for all agents in farm ${farmId}`);
      
      // Get number of agents from project coordinator
      const status = projectCoordinator.getSessionStatus();
      
      for (const agent of status.agents) {
        // Mark agent as completed in project coordinator
        await projectCoordinator.markAgentCompleted(agent.agentId);
        
        // Add explicit completion signal
        completionDetector.addExplicitSignal(
          agent.agentId,
          1.0,
          'Manual completion override'
        );
      }
      
      logger.info(`[ManualOverride] Forced completion for ${status.agents.length} agents`);
      
      // Trigger merge after marking all complete
      await this.triggerProjectMerge(farmId);
    } catch (error) {
      logger.error(`[ManualOverride] Error forcing completion for farm ${farmId}:`, error);
      throw error;
    }
  }

  /**
   * Abort farm execution
   */
  private async abortFarm(farmId: string): Promise<void> {
    try {
      logger.info(`[ManualOverride] Aborting farm ${farmId}`);
      
      // Import required services
      const { shutdownCoordinator } = await import('./shutdownCoordinator');
      
      // Trigger graceful shutdown
      await shutdownCoordinator.gracefulShutdown(farmId, 'manual_abort');
      
      logger.info(`[ManualOverride] Farm ${farmId} aborted`);
    } catch (error) {
      logger.error(`[ManualOverride] Error aborting farm ${farmId}:`, error);
      throw error;
    }
  }

  /**
   * Force harvest collection
   */
  private async forceHarvest(farmId: string): Promise<void> {
    try {
      logger.info(`[ManualOverride] Forcing harvest collection for farm ${farmId}`);
      
      // First force completion
      await this.forceCompletion(farmId);
      
      // Then trigger harvest
      const { xenosyncBarnIntegration } = await import('./xenosyncBarnIntegration');
      const workspacePath = this.activeFarms.get(farmId);
      
      if (workspacePath) {
        const finalProjectPath = path.join(workspacePath, 'final-project');
        await xenosyncBarnIntegration.collectProjectHarvest(farmId, finalProjectPath, 0);
      }
      
      logger.info(`[ManualOverride] Harvest forced for farm ${farmId}`);
    } catch (error) {
      logger.error(`[ManualOverride] Error forcing harvest for farm ${farmId}:`, error);
      throw error;
    }
  }

  /**
   * Create manual trigger via API
   */
  async createManualTrigger(farmId: string, action: ManualTrigger['action']): Promise<void> {
    const trigger: ManualTrigger = {
      type: 'api',
      farmId,
      action,
      timestamp: new Date(),
      source: 'API'
    };
    
    this.triggerHistory.push(trigger);
    await this.executeTriggerAction(trigger);
  }

  /**
   * Create trigger file for a farm
   */
  async createTriggerFile(farmId: string, triggerType: 'merge' | 'complete' | 'abort'): Promise<void> {
    const workspacePath = this.activeFarms.get(farmId);
    if (!workspacePath) {
      throw new Error(`Farm ${farmId} not registered for manual override`);
    }
    
    let fileName: string;
    switch (triggerType) {
      case 'merge':
        fileName = '.xenosync_merge_now';
        break;
      case 'complete':
        fileName = '.force_complete';
        break;
      case 'abort':
        fileName = '.abort_farm';
        break;
      default:
        throw new Error(`Unknown trigger type: ${triggerType}`);
    }
    
    const triggerPath = path.join(workspacePath, fileName);
    await fs.writeFile(triggerPath, new Date().toISOString());
    
    logger.info(`[ManualOverride] Created trigger file ${fileName} for farm ${farmId}`);
  }

  /**
   * Show system status (for SIGINFO)
   */
  private showSystemStatus(): void {
    console.log('\n=== MaiFarm System Status ===');
    console.log(`Active Farms: ${this.activeFarms.size}`);
    
    for (const [farmId, workspacePath] of this.activeFarms) {
      const status = projectCoordinator.getSessionStatus();
      if (status && status.sessionId.includes(farmId)) {
        console.log(`\nFarm ${farmId}:`);
        console.log(`  Agents: ${status.totalProjects}`);
        console.log(`  Completed: ${status.completedProjects}`);
        console.log(`  Merged: ${status.mergedProjects}`);
        console.log(`  Workspace: ${workspacePath}`);
      }
    }
    
    console.log(`\nTrigger History: ${this.triggerHistory.length} triggers`);
    
    // Show last 3 triggers
    const recent = this.triggerHistory.slice(-3);
    for (const trigger of recent) {
      console.log(`  ${trigger.timestamp.toISOString()} - ${trigger.type}: ${trigger.action} for ${trigger.farmId}`);
    }
    
    console.log('\nManual Override Commands:');
    console.log('  kill -USR1 <pid>  - Trigger immediate merge');
    console.log('  kill -USR2 <pid>  - Force completion');
    console.log('  touch .xenosync_merge_now - File-based merge trigger');
    console.log('  touch .force_complete - File-based completion trigger');
    console.log('  touch .abort_farm - File-based abort trigger');
    console.log('=============================\n');
  }

  /**
   * Get trigger history
   */
  getTriggerHistory(farmId?: string): ManualTrigger[] {
    if (farmId) {
      return this.triggerHistory.filter(t => t.farmId === farmId);
    }
    return this.triggerHistory;
  }

  /**
   * Clear trigger history
   */
  clearHistory(): void {
    this.triggerHistory = [];
  }

  /**
   * Cleanup all watchers
   */
  async cleanup(): void {
    // Close all file watchers
    for (const [farmId, watcher] of this.fileWatchers) {
      await watcher.close();
    }
    
    this.fileWatchers.clear();
    this.activeFarms.clear();
    
    logger.info('[ManualOverride] Cleanup complete');
  }
}

// Export singleton instance
export const manualOverrideService = new ManualOverrideService();