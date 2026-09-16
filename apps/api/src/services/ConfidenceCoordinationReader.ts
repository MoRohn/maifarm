/**
 * ConfidenceCoordinationReader Service
 *
 * Watches coordination files written by the Python orchestrator and emits
 * events when confidence data changes. Integrates with blerbz-plugins
 * (inference-confidenz, inference-continuez) to provide real-time
 * confidence scoring to the dashboard.
 *
 * Coordination Files:
 * - maibarn/coordination/confidence_summary.json (farm-wide summary)
 * - maibarn/coordination/agent_{idx}_confidence.json (per-agent data)
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { watch, FSWatcher } from 'fs';
import { logger, LogCategory } from '../utils/logger';
import { pathConfig } from '../config/paths';
import {
  AgentConfidenceData,
  FarmConfidenceSummary,
  ConfidenceUpdateEvent,
  ConfidenceLevel,
  ConfidenceTrend,
  getConfidenceLevel,
  shouldAutoContinue
} from '../types/plugins';

/**
 * Raw confidence file format from Python orchestrator
 */
interface RawAgentConfidence {
  score: number;
  level: string;
  heuristic: boolean;
  should_auto_continue: boolean;
  timestamp: string;
}

interface RawConfidenceSummary {
  farm_id: string;
  agents: Record<string, RawAgentConfidence>;
  average_score: number;
  min_score: number;
  max_score: number;
  overall_level: string;
  updated_at: string;
}

class ConfidenceCoordinationReaderService extends EventEmitter {
  private static instance: ConfidenceCoordinationReaderService;
  private watchers: Map<string, FSWatcher> = new Map();
  private farmConfidence: Map<string, FarmConfidenceSummary> = new Map();
  private confidenceHistory: Map<string, number[]> = new Map(); // farmId -> recent scores
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL_MS = 2000; // Poll every 2 seconds
  private readonly HISTORY_SIZE = 10; // Keep last 10 readings for trend

  private constructor() {
    super();
    logger.info(LogCategory.SYSTEM, 'ConfidenceCoordinationReader initialized');
  }

  public static getInstance(): ConfidenceCoordinationReaderService {
    if (!ConfidenceCoordinationReaderService.instance) {
      ConfidenceCoordinationReaderService.instance = new ConfidenceCoordinationReaderService();
    }
    return ConfidenceCoordinationReaderService.instance;
  }

  /**
   * Start monitoring a farm's confidence coordination files
   */
  public async startMonitoring(farmId: string): Promise<void> {
    const coordinationDir = pathConfig.getPath('COORDINATION_DIR');
    const summaryPath = path.join(coordinationDir, `${farmId}_confidence_summary.json`);

    // Check if already monitoring
    if (this.watchers.has(farmId)) {
      logger.debug(LogCategory.SYSTEM, `Already monitoring confidence for farm ${farmId}`);
      return;
    }

    try {
      // Try to set up file watcher
      const watcher = watch(coordinationDir, async (eventType, filename) => {
        if (filename && (filename.includes('confidence') || filename.includes(farmId))) {
          await this.handleFileChange(farmId, coordinationDir);
        }
      });

      this.watchers.set(farmId, watcher);
      logger.info(LogCategory.SYSTEM, `Started confidence monitoring for farm ${farmId}`);

      // Also start polling as backup (file watchers can be unreliable)
      this.startPolling(farmId, coordinationDir);

      // Initial read
      await this.handleFileChange(farmId, coordinationDir);
    } catch (error) {
      logger.warn(LogCategory.SYSTEM, `Failed to set up file watcher for farm ${farmId}, using polling only:`, error);
      // Fall back to polling only
      this.startPolling(farmId, pathConfig.getPath('COORDINATION_DIR'));
    }
  }

  /**
   * Stop monitoring a farm
   */
  public stopMonitoring(farmId: string): void {
    const watcher = this.watchers.get(farmId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(farmId);
    }
    this.farmConfidence.delete(farmId);
    this.confidenceHistory.delete(farmId);
    logger.info(LogCategory.SYSTEM, `Stopped confidence monitoring for farm ${farmId}`);
  }

  /**
   * Get current confidence summary for a farm
   */
  public getConfidenceSummary(farmId: string): FarmConfidenceSummary | null {
    return this.farmConfidence.get(farmId) || null;
  }

  /**
   * Get all monitored farms' confidence data
   */
  public getAllConfidenceData(): Map<string, FarmConfidenceSummary> {
    return new Map(this.farmConfidence);
  }

  /**
   * Start polling for a farm (backup to file watcher)
   */
  private startPolling(farmId: string, coordinationDir: string): void {
    // Use a single interval that checks all farms
    if (!this.pollInterval) {
      this.pollInterval = setInterval(async () => {
        for (const [fId] of this.watchers) {
          await this.handleFileChange(fId, coordinationDir);
        }
      }, this.POLL_INTERVAL_MS);
    }
  }

  /**
   * Handle file change event
   */
  private async handleFileChange(farmId: string, coordinationDir: string): Promise<void> {
    try {
      const summary = await this.readConfidenceSummary(farmId, coordinationDir);
      if (summary) {
        // Calculate trend from history
        const trend = this.calculateTrend(farmId, summary.averageScore);
        summary.trend = trend;

        // Store and emit
        this.farmConfidence.set(farmId, summary);
        this.emitConfidenceUpdate(farmId, summary);
      }
    } catch (error) {
      // Silent fail - file might not exist yet
      logger.debug(LogCategory.SYSTEM, `No confidence data for farm ${farmId}: ${error}`);
    }
  }

  /**
   * Read and parse confidence summary file
   */
  private async readConfidenceSummary(
    farmId: string,
    coordinationDir: string
  ): Promise<FarmConfidenceSummary | null> {
    // Try farm-specific summary first
    const summaryPath = path.join(coordinationDir, `${farmId}_confidence_summary.json`);

    try {
      const content = await fs.readFile(summaryPath, 'utf-8');
      const raw: RawConfidenceSummary = JSON.parse(content);
      return this.transformSummary(farmId, raw);
    } catch {
      // Try generic confidence_summary.json
      try {
        const genericPath = path.join(coordinationDir, 'confidence_summary.json');
        const content = await fs.readFile(genericPath, 'utf-8');
        const raw: RawConfidenceSummary = JSON.parse(content);
        if (raw.farm_id === farmId) {
          return this.transformSummary(farmId, raw);
        }
      } catch {
        // Try reading individual agent files
        return await this.readAgentFiles(farmId, coordinationDir);
      }
    }
    return null;
  }

  /**
   * Read individual agent confidence files
   */
  private async readAgentFiles(
    farmId: string,
    coordinationDir: string
  ): Promise<FarmConfidenceSummary | null> {
    const agents: Record<string, AgentConfidenceData> = {};
    let foundAny = false;

    // Try reading agent_0 through agent_9
    for (let i = 0; i < 10; i++) {
      const agentPath = path.join(coordinationDir, `agent_${i}_confidence.json`);
      try {
        const content = await fs.readFile(agentPath, 'utf-8');
        const raw: RawAgentConfidence = JSON.parse(content);
        agents[String(i)] = {
          agentId: `agent_${i}`,
          agentName: `Agent ${i + 1}`,
          agentIndex: i,
          score: raw.score,
          level: raw.level as ConfidenceLevel,
          heuristic: raw.heuristic,
          shouldAutoContinue: raw.should_auto_continue,
          timestamp: raw.timestamp
        };
        foundAny = true;
      } catch {
        // Agent file doesn't exist, stop looking
        if (!foundAny) continue;
        break;
      }
    }

    if (!foundAny) return null;

    // Calculate aggregate metrics
    const scores = Object.values(agents).map(a => a.score);
    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);

    return {
      farmId,
      agents,
      averageScore,
      minScore,
      maxScore,
      overallLevel: getConfidenceLevel(averageScore),
      trend: 'stable',
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Transform raw Python format to TypeScript format
   */
  private transformSummary(farmId: string, raw: RawConfidenceSummary): FarmConfidenceSummary {
    const agents: Record<string, AgentConfidenceData> = {};

    for (const [idx, agentData] of Object.entries(raw.agents)) {
      agents[idx] = {
        agentId: `agent_${idx}`,
        agentName: `Agent ${parseInt(idx) + 1}`,
        agentIndex: parseInt(idx),
        score: agentData.score,
        level: agentData.level as ConfidenceLevel,
        heuristic: agentData.heuristic,
        shouldAutoContinue: agentData.should_auto_continue,
        timestamp: agentData.timestamp
      };
    }

    return {
      farmId,
      agents,
      averageScore: raw.average_score,
      minScore: raw.min_score,
      maxScore: raw.max_score,
      overallLevel: raw.overall_level as ConfidenceLevel,
      trend: 'stable', // Will be calculated separately
      updatedAt: raw.updated_at
    };
  }

  /**
   * Calculate confidence trend based on recent history
   */
  private calculateTrend(farmId: string, currentScore: number): ConfidenceTrend {
    let history = this.confidenceHistory.get(farmId);
    if (!history) {
      history = [];
      this.confidenceHistory.set(farmId, history);
    }

    history.push(currentScore);
    if (history.length > this.HISTORY_SIZE) {
      history.shift();
    }

    if (history.length < 3) return 'stable';

    // Calculate trend from first half vs second half
    const midpoint = Math.floor(history.length / 2);
    const firstHalf = history.slice(0, midpoint);
    const secondHalf = history.slice(midpoint);

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const diff = secondAvg - firstAvg;
    if (diff > 5) return 'improving';
    if (diff < -5) return 'declining';
    return 'stable';
  }

  /**
   * Emit confidence update event
   */
  private emitConfidenceUpdate(farmId: string, summary: FarmConfidenceSummary): void {
    const event: ConfidenceUpdateEvent = {
      type: 'farm:confidence:update',
      farmId,
      agents: Object.values(summary.agents).map(a => ({
        agentId: a.agentId,
        agentName: a.agentName,
        score: a.score,
        level: a.level,
        shouldAutoContinue: a.shouldAutoContinue
      })),
      aggregate: {
        averageScore: summary.averageScore,
        minScore: summary.minScore,
        maxScore: summary.maxScore,
        trend: summary.trend
      },
      timestamp: summary.updatedAt
    };

    this.emit('confidence:update', event);
    logger.debug(LogCategory.SYSTEM, `Emitted confidence update for farm ${farmId}: avg=${summary.averageScore.toFixed(1)}%`);
  }

  /**
   * Cleanup all watchers
   */
  public shutdown(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    for (const [farmId, watcher] of this.watchers) {
      watcher.close();
      logger.debug(LogCategory.SYSTEM, `Closed confidence watcher for farm ${farmId}`);
    }
    this.watchers.clear();
    this.farmConfidence.clear();
    this.confidenceHistory.clear();
    logger.info(LogCategory.SYSTEM, 'ConfidenceCoordinationReader shutdown complete');
  }
}

// Export singleton instance
export const confidenceCoordinationReader = ConfidenceCoordinationReaderService.getInstance();
