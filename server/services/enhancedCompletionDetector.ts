/**
 * Enhanced Completion Detection Service
 * Implements XenoSync-style multi-signal analysis for detecting agent completion
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

interface CompletionSignal {
  type: 'pattern' | 'file_activity' | 'git_activity' | 'terminal_output' | 'explicit';
  confidence: number; // 0.0 to 1.0
  timestamp: Date;
  details: string;
}

interface CompletionAnalysis {
  agentId: number;
  overallConfidence: number;
  signals: CompletionSignal[];
  recommendation: 'not_complete' | 'likely_complete' | 'confirmed_complete';
  workDuration: number; // minutes
  filesCreated: number;
  lastActivity: Date;
}

export class EnhancedCompletionDetector extends EventEmitter {
  private readonly COMPLETION_PATTERNS = [
    { pattern: /task[s]?\s+completed?/i, confidence: 0.8 },
    { pattern: /finished\s+all\s+tasks?/i, confidence: 0.9 },
    { pattern: /done\s+with\s+everything/i, confidence: 0.7 },
    { pattern: /all\s+tests?\s+pass/i, confidence: 0.6 },
    { pattern: /ready\s+for\s+review/i, confidence: 0.7 },
    { pattern: /implementation\s+complete/i, confidence: 0.8 },
    { pattern: /successfully\s+implemented/i, confidence: 0.7 },
    { pattern: /✅|✓|√|☑/g, confidence: 0.3 }, // Checkmarks
    { pattern: /\[x\]\s+\w+/gi, confidence: 0.4 }, // Checked items
    { pattern: /nothing\s+more\s+to\s+do/i, confidence: 0.8 },
    { pattern: /waiting\s+for\s+(instructions?|input|guidance)/i, confidence: 0.7 }
  ];

  private readonly IN_PROGRESS_PATTERNS = [
    { pattern: /working\s+on/i, confidence: -0.8 },
    { pattern: /implementing/i, confidence: -0.7 },
    { pattern: /debugging/i, confidence: -0.6 },
    { pattern: /testing/i, confidence: -0.5 },
    { pattern: /let\s+me/i, confidence: -0.4 },
    { pattern: /I'll\s+\w+/i, confidence: -0.5 },
    { pattern: /next\s+step/i, confidence: -0.6 },
    { pattern: /\.\.\./g, confidence: -0.3 } // Ellipsis indicates ongoing work
  ];

  // Configuration
  private completionConfidenceThreshold: number = 0.7;
  private minimumWorkDurationMinutes: number = 10;
  private fileActivityTimeoutMinutes: number = 10;
  private projectQualityThreshold: number = 3; // minimum files
  private projectSubstantialWorkThreshold: number = 500; // minimum characters

  // Tracking
  private agentStartTimes: Map<number, Date> = new Map();
  private agentLastActivities: Map<number, Date> = new Map();
  private agentSignalHistory: Map<number, CompletionSignal[]> = new Map();
  private agentConfidenceHistory: Map<number, number[]> = new Map();
  private verificationInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startVerificationLoop();
  }

  /**
   * Start periodic verification loop
   */
  private startVerificationLoop(): void {
    // Check every 5 minutes for stuck agents
    this.verificationInterval = setInterval(() => {
      this.performProactiveVerification();
    }, 5 * 60 * 1000);
  }

  /**
   * Register an agent for tracking
   */
  registerAgent(agentId: number): void {
    this.agentStartTimes.set(agentId, new Date());
    this.agentLastActivities.set(agentId, new Date());
    this.agentSignalHistory.set(agentId, []);
    this.agentConfidenceHistory.set(agentId, []);
    
    logger.info(`[CompletionDetector] Registered agent ${agentId} for tracking`);
  }

  /**
   * Analyze terminal output for completion patterns
   */
  analyzeTerminalOutput(agentId: number, output: string): CompletionSignal[] {
    const signals: CompletionSignal[] = [];
    
    // Check completion patterns
    for (const { pattern, confidence } of this.COMPLETION_PATTERNS) {
      if (pattern.test(output)) {
        signals.push({
          type: 'pattern',
          confidence,
          timestamp: new Date(),
          details: `Matched pattern: ${pattern.source}`
        });
      }
    }
    
    // Check in-progress patterns (negative confidence)
    for (const { pattern, confidence } of this.IN_PROGRESS_PATTERNS) {
      if (pattern.test(output)) {
        signals.push({
          type: 'pattern',
          confidence, // negative value
          timestamp: new Date(),
          details: `In-progress pattern: ${pattern.source}`
        });
      }
    }
    
    // Store signals in history
    const history = this.agentSignalHistory.get(agentId) || [];
    history.push(...signals);
    this.agentSignalHistory.set(agentId, history);
    
    // Update last activity
    this.agentLastActivities.set(agentId, new Date());
    
    return signals;
  }

  /**
   * Check file activity for an agent's project
   */
  async checkFileActivity(agentId: number, projectPath: string): Promise<CompletionSignal> {
    try {
      // Get most recent file modification time
      const recentFile = await this.getMostRecentFileTime(projectPath);
      const lastActivity = this.agentLastActivities.get(agentId) || new Date();
      
      const timeSinceActivity = (Date.now() - recentFile.getTime()) / 1000 / 60; // minutes
      
      let confidence = 0;
      let details = '';
      
      if (timeSinceActivity < 2) {
        confidence = -0.8; // Very recent activity, still working
        details = 'Very recent file activity detected';
      } else if (timeSinceActivity < 5) {
        confidence = -0.4; // Recent activity
        details = 'Recent file activity detected';
      } else if (timeSinceActivity < this.fileActivityTimeoutMinutes) {
        confidence = 0.3; // Some time passed
        details = `No file activity for ${Math.round(timeSinceActivity)} minutes`;
      } else {
        confidence = 0.7; // No activity for timeout period
        details = `No file activity for over ${this.fileActivityTimeoutMinutes} minutes`;
      }
      
      const signal: CompletionSignal = {
        type: 'file_activity',
        confidence,
        timestamp: new Date(),
        details
      };
      
      // Add to history
      const history = this.agentSignalHistory.get(agentId) || [];
      history.push(signal);
      this.agentSignalHistory.set(agentId, history);
      
      return signal;
    } catch (error) {
      logger.error(`[CompletionDetector] Error checking file activity for agent ${agentId}:`, error);
      return {
        type: 'file_activity',
        confidence: 0,
        timestamp: new Date(),
        details: 'Error checking file activity'
      };
    }
  }

  /**
   * Get most recent file modification time in a directory
   */
  private async getMostRecentFileTime(dir: string): Promise<Date> {
    let mostRecent = new Date(0);
    
    async function checkRecursive(currentDir: string): Promise<void> {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.name === '.git') continue;
          
          const fullPath = path.join(currentDir, entry.name);
          const stats = await fs.stat(fullPath);
          
          if (stats.mtime > mostRecent) {
            mostRecent = stats.mtime;
          }
          
          if (entry.isDirectory()) {
            await checkRecursive(fullPath);
          }
        }
      } catch (error) {
        // Ignore errors for individual files
      }
    }
    
    await checkRecursive(dir);
    return mostRecent;
  }

  /**
   * Check git activity for completion signals
   */
  async checkGitActivity(agentId: number, projectPath: string): Promise<CompletionSignal> {
    try {
      // Check last commit time
      const { stdout } = await execAsync('git log -1 --format=%ar', { cwd: projectPath });
      const lastCommitTime = stdout.trim();
      
      let confidence = 0;
      let details = `Last commit: ${lastCommitTime}`;
      
      if (lastCommitTime.includes('second') || lastCommitTime.includes('minute')) {
        const minutes = this.parseTimeAgo(lastCommitTime);
        if (minutes < 2) {
          confidence = -0.7; // Very recent commit
        } else if (minutes < 5) {
          confidence = -0.3; // Recent commit
        } else if (minutes < 10) {
          confidence = 0.2; // Some time passed
        } else {
          confidence = 0.5; // No recent commits
        }
      } else {
        confidence = 0.6; // Old commit
      }
      
      // Check for uncommitted changes
      const { stdout: status } = await execAsync('git status --porcelain', { cwd: projectPath });
      if (status.trim()) {
        confidence -= 0.3; // Uncommitted changes suggest ongoing work
        details += ' (uncommitted changes present)';
      }
      
      return {
        type: 'git_activity',
        confidence,
        timestamp: new Date(),
        details
      };
    } catch (error) {
      return {
        type: 'git_activity',
        confidence: 0,
        timestamp: new Date(),
        details: 'Error checking git activity'
      };
    }
  }

  /**
   * Parse time ago string to minutes
   */
  private parseTimeAgo(timeStr: string): number {
    if (timeStr.includes('second')) {
      return 0;
    } else if (timeStr.includes('minute')) {
      const match = timeStr.match(/(\d+)\s+minute/);
      return match ? parseInt(match[1]) : 1;
    } else if (timeStr.includes('hour')) {
      const match = timeStr.match(/(\d+)\s+hour/);
      return match ? parseInt(match[1]) * 60 : 60;
    }
    return 999; // Very old
  }

  /**
   * Perform comprehensive completion analysis
   */
  async analyzeCompletion(agentId: number, projectPath: string): Promise<CompletionAnalysis> {
    const startTime = this.agentStartTimes.get(agentId) || new Date();
    const workDuration = (Date.now() - startTime.getTime()) / 1000 / 60; // minutes
    
    // Get all signals
    const historicalSignals = this.agentSignalHistory.get(agentId) || [];
    const fileSignal = await this.checkFileActivity(agentId, projectPath);
    const gitSignal = await this.checkGitActivity(agentId, projectPath);
    
    // Combine all signals
    const allSignals = [...historicalSignals, fileSignal, gitSignal];
    
    // Calculate weighted confidence
    let totalConfidence = 0;
    let totalWeight = 0;
    
    for (const signal of allSignals) {
      // More recent signals have higher weight
      const age = (Date.now() - signal.timestamp.getTime()) / 1000 / 60; // minutes
      const weight = Math.max(0.1, 1 - (age / 30)); // Decay over 30 minutes
      
      totalConfidence += signal.confidence * weight;
      totalWeight += weight;
    }
    
    const overallConfidence = totalWeight > 0 ? totalConfidence / totalWeight : 0;
    
    // Apply work duration factor
    let durationFactor = 1.0;
    if (workDuration < this.minimumWorkDurationMinutes) {
      // Reduce confidence if minimum work duration not met
      durationFactor = workDuration / this.minimumWorkDurationMinutes;
      logger.debug(`[CompletionDetector] Agent ${agentId} duration factor: ${durationFactor} (${workDuration}/${this.minimumWorkDurationMinutes} min)`);
    }
    
    const adjustedConfidence = overallConfidence * durationFactor;
    
    // Check project quality
    const filesCreated = await this.countFiles(projectPath);
    const hasQuality = filesCreated >= this.projectQualityThreshold;
    
    // Determine recommendation
    let recommendation: 'not_complete' | 'likely_complete' | 'confirmed_complete';
    if (adjustedConfidence >= this.completionConfidenceThreshold && hasQuality) {
      recommendation = 'confirmed_complete';
    } else if (adjustedConfidence >= 0.5) {
      recommendation = 'likely_complete';
    } else {
      recommendation = 'not_complete';
    }
    
    // Store confidence in history
    const confidenceHistory = this.agentConfidenceHistory.get(agentId) || [];
    confidenceHistory.push(adjustedConfidence);
    this.agentConfidenceHistory.set(agentId, confidenceHistory);
    
    const analysis: CompletionAnalysis = {
      agentId,
      overallConfidence: adjustedConfidence,
      signals: allSignals.slice(-10), // Last 10 signals
      recommendation,
      workDuration,
      filesCreated,
      lastActivity: this.agentLastActivities.get(agentId) || new Date()
    };
    
    logger.info(`[CompletionDetector] Agent ${agentId} analysis: confidence=${adjustedConfidence.toFixed(2)}, recommendation=${recommendation}, duration=${workDuration.toFixed(1)}min, files=${filesCreated}`);
    
    return analysis;
  }

  /**
   * Count files in a directory (excluding .git)
   */
  private async countFiles(dir: string): Promise<number> {
    let count = 0;
    
    async function countRecursive(currentDir: string): Promise<void> {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.name === '.git') continue;
          
          const fullPath = path.join(currentDir, entry.name);
          
          if (entry.isFile()) {
            count++;
          } else if (entry.isDirectory()) {
            await countRecursive(fullPath);
          }
        }
      } catch (error) {
        // Ignore errors
      }
    }
    
    await countRecursive(dir);
    return count;
  }

  /**
   * Add explicit completion signal (manual or verified)
   */
  addExplicitSignal(agentId: number, confidence: number, details: string): void {
    const signal: CompletionSignal = {
      type: 'explicit',
      confidence,
      timestamp: new Date(),
      details
    };
    
    const history = this.agentSignalHistory.get(agentId) || [];
    history.push(signal);
    this.agentSignalHistory.set(agentId, history);
    
    logger.info(`[CompletionDetector] Added explicit signal for agent ${agentId}: ${details}`);
  }

  /**
   * Perform proactive verification of all agents
   */
  private async performProactiveVerification(): Promise<void> {
    logger.debug('[CompletionDetector] Performing proactive verification of all agents');
    
    for (const [agentId, lastActivity] of this.agentLastActivities) {
      const timeSinceActivity = (Date.now() - lastActivity.getTime()) / 1000 / 60; // minutes
      
      if (timeSinceActivity > this.fileActivityTimeoutMinutes) {
        // Agent might be stuck or completed
        this.emit('agent:possibly_complete', {
          agentId,
          timeSinceActivity,
          lastActivity
        });
      }
    }
  }

  /**
   * Get confidence trend for an agent
   */
  getConfidenceTrend(agentId: number): { trend: 'increasing' | 'decreasing' | 'stable'; average: number } {
    const history = this.agentConfidenceHistory.get(agentId) || [];
    
    if (history.length < 2) {
      return { trend: 'stable', average: history[0] || 0 };
    }
    
    const recent = history.slice(-5); // Last 5 readings
    const average = recent.reduce((sum, val) => sum + val, 0) / recent.length;
    
    // Calculate trend
    let increases = 0;
    let decreases = 0;
    
    for (let i = 1; i < recent.length; i++) {
      if (recent[i] > recent[i - 1]) increases++;
      else if (recent[i] < recent[i - 1]) decreases++;
    }
    
    let trend: 'increasing' | 'decreasing' | 'stable';
    if (increases > decreases * 1.5) {
      trend = 'increasing';
    } else if (decreases > increases * 1.5) {
      trend = 'decreasing';
    } else {
      trend = 'stable';
    }
    
    return { trend, average };
  }

  /**
   * Reset agent tracking
   */
  resetAgent(agentId: number): void {
    this.agentStartTimes.delete(agentId);
    this.agentLastActivities.delete(agentId);
    this.agentSignalHistory.delete(agentId);
    this.agentConfidenceHistory.delete(agentId);
  }

  /**
   * Clean up and stop verification
   */
  cleanup(): void {
    if (this.verificationInterval) {
      clearInterval(this.verificationInterval);
      this.verificationInterval = null;
    }
    
    this.agentStartTimes.clear();
    this.agentLastActivities.clear();
    this.agentSignalHistory.clear();
    this.agentConfidenceHistory.clear();
  }

  /**
   * Update configuration
   */
  updateConfig(config: {
    completionConfidenceThreshold?: number;
    minimumWorkDurationMinutes?: number;
    fileActivityTimeoutMinutes?: number;
    projectQualityThreshold?: number;
    projectSubstantialWorkThreshold?: number;
  }): void {
    if (config.completionConfidenceThreshold !== undefined) {
      this.completionConfidenceThreshold = config.completionConfidenceThreshold;
    }
    if (config.minimumWorkDurationMinutes !== undefined) {
      this.minimumWorkDurationMinutes = config.minimumWorkDurationMinutes;
    }
    if (config.fileActivityTimeoutMinutes !== undefined) {
      this.fileActivityTimeoutMinutes = config.fileActivityTimeoutMinutes;
    }
    if (config.projectQualityThreshold !== undefined) {
      this.projectQualityThreshold = config.projectQualityThreshold;
    }
    if (config.projectSubstantialWorkThreshold !== undefined) {
      this.projectSubstantialWorkThreshold = config.projectSubstantialWorkThreshold;
    }
    
    logger.info('[CompletionDetector] Configuration updated');
  }
}

// Export singleton instance
export const completionDetector = new EnhancedCompletionDetector();