/**
 * ConfidenzService - Confidence scoring service for MaiFarm
 *
 * Integrates with the inference-confidenz plugin to provide:
 * - Real-time confidence scoring for agent responses
 * - Aggregate farm confidence metrics
 * - Confidence history tracking
 *
 * @author Blerbz
 * @license MIT
 */

import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';
import { EventEmitter } from 'events';
import { confidenceCoordinationReader } from './ConfidenceCoordinationReader';
import { FarmConfidenceSummary, ConfidenceUpdateEvent } from '../types/plugins';

export interface ConfidenceScore {
  farmId: string;
  agentId?: string;
  agentName?: string;
  score: number; // 0-99
  level: 'high' | 'medium' | 'low';
  timestamp: Date;
  sessionId?: string;
}

export interface FarmConfidenceMetrics {
  farmId: string;
  currentScore: number;
  averageScore: number;
  minScore: number;
  maxScore: number;
  scoreCount: number;
  trend: 'improving' | 'declining' | 'stable';
  lastUpdated: Date;
}

interface AgentConfidence {
  agentId: string;
  agentName: string;
  score: number;
  lastUpdated: Date;
}

class ConfidenzServiceClass extends EventEmitter {
  private farmConfidence: Map<string, AgentConfidence[]> = new Map();
  private confidenceHistory: Map<string, ConfidenceScore[]> = new Map();
  private readonly HISTORY_LIMIT = 100; // Keep last 100 scores per farm
  private readonly THRESHOLDS = {
    high: 75,
    medium: 40,
  };

  constructor() {
    super();

    // Subscribe to coordination file updates from Python orchestrator
    this.subscribeToCoordinationUpdates();

    logger.info(LogCategory.SYSTEM, '[ConfidenzService] Initialized with coordination reader integration');
  }

  /**
   * Subscribe to confidence updates from the coordination reader
   * This integrates with the Python orchestrator's confidence file output
   */
  private subscribeToCoordinationUpdates(): void {
    confidenceCoordinationReader.on('confidence:update', (event: ConfidenceUpdateEvent) => {
      this.handleCoordinationUpdate(event);
    });
  }

  /**
   * Handle confidence update from coordination files
   */
  private handleCoordinationUpdate(event: ConfidenceUpdateEvent): void {
    const { farmId, agents } = event;

    // Update per-agent confidence from coordination data
    for (const agent of agents) {
      this.recordConfidence(
        farmId,
        agent.agentId,
        agent.agentName,
        agent.score
      );
    }

    logger.debug(LogCategory.SYSTEM, `[ConfidenzService] Synced ${agents.length} agents from coordination for farm ${farmId}`);
  }

  /**
   * Start monitoring a farm (integrates with coordination reader)
   */
  async startMonitoring(farmId: string): Promise<void> {
    await confidenceCoordinationReader.startMonitoring(farmId);
    logger.info(LogCategory.SYSTEM, `[ConfidenzService] Started monitoring farm ${farmId}`);
  }

  /**
   * Stop monitoring a farm
   */
  stopMonitoring(farmId: string): void {
    confidenceCoordinationReader.stopMonitoring(farmId);
    this.clearFarm(farmId);
    logger.info(LogCategory.SYSTEM, `[ConfidenzService] Stopped monitoring farm ${farmId}`);
  }

  /**
   * Get coordination-based confidence summary
   * Returns data from Python orchestrator's coordination files
   */
  getCoordinationSummary(farmId: string): FarmConfidenceSummary | null {
    return confidenceCoordinationReader.getConfidenceSummary(farmId);
  }

  /**
   * Calculate confidence level from score
   */
  private getLevel(score: number): 'high' | 'medium' | 'low' {
    if (score >= this.THRESHOLDS.high) return 'high';
    if (score >= this.THRESHOLDS.medium) return 'medium';
    return 'low';
  }

  /**
   * Record a confidence score for an agent response
   */
  recordConfidence(
    farmId: string,
    agentId: string,
    agentName: string,
    score: number,
    sessionId?: string
  ): ConfidenceScore {
    // Clamp score to 0-99
    score = Math.max(0, Math.min(99, Math.round(score)));

    const confidenceScore: ConfidenceScore = {
      farmId,
      agentId,
      agentName,
      score,
      level: this.getLevel(score),
      timestamp: new Date(),
      sessionId,
    };

    // Update per-agent confidence
    const farmAgents = this.farmConfidence.get(farmId) || [];
    const existingIndex = farmAgents.findIndex((a) => a.agentId === agentId);

    if (existingIndex >= 0) {
      farmAgents[existingIndex] = {
        agentId,
        agentName,
        score,
        lastUpdated: new Date(),
      };
    } else {
      farmAgents.push({
        agentId,
        agentName,
        score,
        lastUpdated: new Date(),
      });
    }
    this.farmConfidence.set(farmId, farmAgents);

    // Add to history
    const history = this.confidenceHistory.get(farmId) || [];
    history.push(confidenceScore);

    // Trim history to limit
    if (history.length > this.HISTORY_LIMIT) {
      history.shift();
    }
    this.confidenceHistory.set(farmId, history);

    // Emit event for real-time updates
    this.emit('confidenz:update', confidenceScore);

    logger.debug(LogCategory.SYSTEM, `[ConfidenzService] Recorded score ${score}% for agent ${agentName} on farm ${farmId}`);

    return confidenceScore;
  }

  /**
   * Parse confidence from terminal output
   * Looks for patterns like "Confidenz: 87%" or "---\nConfidenz: 87%"
   */
  parseConfidenceFromOutput(
    output: string,
    farmId: string,
    agentId: string,
    agentName: string
  ): ConfidenceScore | null {
    // Match patterns:
    // "Confidenz: 87%"
    // "Subagent Confidenz: 65%"
    const patterns = [
      /(?:Subagent\s+)?Confidenz:\s*(\d+)%/i,
      /confidence[:\s]+(\d+)%/i,
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) {
        const score = parseInt(match[1], 10);
        if (!isNaN(score) && score >= 0 && score <= 99) {
          return this.recordConfidence(farmId, agentId, agentName, score);
        }
      }
    }

    return null;
  }

  /**
   * Get aggregate confidence metrics for a farm
   */
  getFarmMetrics(farmId: string): FarmConfidenceMetrics | null {
    const agents = this.farmConfidence.get(farmId);
    const history = this.confidenceHistory.get(farmId);

    if (!agents || agents.length === 0) {
      return null;
    }

    // Calculate current aggregate score (weighted average by recency)
    const now = Date.now();
    let weightedSum = 0;
    let weightTotal = 0;

    for (const agent of agents) {
      const ageMinutes = (now - agent.lastUpdated.getTime()) / 60000;
      const weight = Math.max(0.1, 1 - ageMinutes / 60); // Decay over 1 hour
      weightedSum += agent.score * weight;
      weightTotal += weight;
    }

    const currentScore = Math.round(weightedSum / weightTotal);

    // Calculate historical metrics
    const scores = history?.map((h) => h.score) || [currentScore];
    const averageScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);

    // Calculate trend (compare recent 5 vs previous 5)
    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (scores.length >= 10) {
      const recent = scores.slice(-5);
      const previous = scores.slice(-10, -5);
      const recentAvg = recent.reduce((a, b) => a + b, 0) / 5;
      const previousAvg = previous.reduce((a, b) => a + b, 0) / 5;

      if (recentAvg > previousAvg + 5) trend = 'improving';
      else if (recentAvg < previousAvg - 5) trend = 'declining';
    }

    return {
      farmId,
      currentScore,
      averageScore,
      minScore,
      maxScore,
      scoreCount: scores.length,
      trend,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get confidence history for a farm
   */
  getHistory(farmId: string, limit = 50): ConfidenceScore[] {
    const history = this.confidenceHistory.get(farmId) || [];
    return history.slice(-limit);
  }

  /**
   * Get per-agent confidence for a farm
   */
  getAgentConfidence(farmId: string): AgentConfidence[] {
    return this.farmConfidence.get(farmId) || [];
  }

  /**
   * Clear confidence data for a farm (on completion/termination)
   */
  clearFarm(farmId: string): void {
    this.farmConfidence.delete(farmId);
    this.confidenceHistory.delete(farmId);
    logger.debug(LogCategory.SYSTEM, `[ConfidenzService] Cleared data for farm ${farmId}`);
  }

  /**
   * Save confidence metrics to database
   */
  async persistMetrics(farmId: string): Promise<void> {
    const metrics = this.getFarmMetrics(farmId);
    if (!metrics) return;

    try {
      await db.query(
        `INSERT INTO metrics (farm_id, name, value, source, type, unit, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (farm_id, name, source) DO UPDATE SET value = $3, created_at = NOW()`,
        [
          farmId,
          'confidence_score',
          metrics.currentScore,
          'confidenz',
          'gauge',
          'percent',
        ]
      );

      logger.debug(LogCategory.SYSTEM, `[ConfidenzService] Persisted metrics for farm ${farmId}`);
    } catch (error) {
      logger.error(LogCategory.SYSTEM, `[ConfidenzService] Failed to persist metrics: ${error}`);
    }
  }

  /**
   * Calculate confidence score from response text (for API use)
   */
  calculateConfidence(text: string): number {
    let score = 50; // Base score

    const lowerText = text.toLowerCase();

    // Positive indicators
    const completionPatterns = ['completed', 'done', 'finished', 'successfully', 'implemented', 'fixed', 'resolved'];
    let completionBoost = 0;
    for (const pattern of completionPatterns) {
      if (lowerText.includes(pattern)) {
        completionBoost += 15;
      }
    }
    score += Math.min(30, completionBoost);

    // Definitive language
    const definitivePatterns = ['will ', 'is ', 'are ', 'has ', 'have ', 'definitely', 'certainly'];
    let definitiveBoost = 0;
    for (const pattern of definitivePatterns) {
      if (lowerText.includes(pattern)) {
        definitiveBoost += 5;
      }
    }
    score += Math.min(20, definitiveBoost);

    // Code blocks indicate implementation
    if (text.includes('```')) {
      score += 5;
    }

    // Negative indicators
    const hedgingPatterns = ['might ', 'could ', 'possibly', 'perhaps', 'maybe', 'uncertain', 'unclear', 'not sure', 'i think'];
    let hedgePenalty = 0;
    for (const pattern of hedgingPatterns) {
      if (lowerText.includes(pattern)) {
        hedgePenalty += 8;
      }
    }
    score -= Math.min(24, hedgePenalty);

    // Error indicators
    const errorPatterns = ['error', 'failed', 'warning', 'issue', 'problem', 'bug', 'broken'];
    let errorPenalty = 0;
    for (const pattern of errorPatterns) {
      if (lowerText.includes(pattern)) {
        errorPenalty += 10;
      }
    }
    score -= Math.min(20, errorPenalty);

    // Question marks
    const questionCount = (text.match(/\?/g) || []).length;
    score -= Math.min(15, questionCount * 5);

    // Incomplete indicators
    const incompletePatterns = ['todo', 'fixme', 'xxx', 'hack', 'temporary', 'placeholder', 'not implemented'];
    for (const pattern of incompletePatterns) {
      if (lowerText.includes(pattern)) {
        score -= 15;
        break;
      }
    }

    // Very short responses
    const wordCount = text.split(/\s+/).length;
    if (wordCount < 20) {
      score -= 10;
    } else if (wordCount > 100) {
      score += 5;
    }

    // Structured response bonus
    if (/^[0-9]+\.|^-|^\*/m.test(text)) {
      score += 5;
    }

    // Clamp to 0-99
    return Math.max(0, Math.min(99, Math.round(score)));
  }
}

// Singleton instance
export const confidenzService = new ConfidenzServiceClass();
export default confidenzService;
