/**
 * PluginCoordinatorService
 *
 * Central coordinator for all blerbz-plugins:
 * - inference-confidenz: Real-time confidence scoring
 * - inference-continuez: Auto-continuation based on confidence threshold
 * - inference-planz: Multi-agent research/survey/plan workflow
 *
 * Manages plugin lifecycle, configuration per farm mode, and
 * integrates with the Python orchestrator through coordination files.
 *
 * @author Blerbz
 * @license MIT
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger, LogCategory } from '../utils/logger';
import { pathConfig } from '../config/paths';
import { confidenzService } from './ConfidenzService';
import { confidenceCoordinationReader } from './ConfidenceCoordinationReader';
import { getPluginConfig, FarmMode } from '../config/farmModeOptimizations';
import {
  PluginConfig,
  FarmConfidenceSummary,
  ConfidenceUpdateEvent,
  ConfidenceLevel,
  getConfidenceLevel,
  shouldAutoContinue
} from '../types/plugins';

// ============================================================================
// Types
// ============================================================================

export interface PluginState {
  farmId: string;
  mode: FarmMode;
  config: PluginConfig;
  isActive: boolean;
  startedAt: Date;
  confidenz: {
    enabled: boolean;
    lastScore: number;
    history: number[];
  };
  continuez: {
    enabled: boolean;
    threshold: number;
    continuationCount: number;
    shouldContinue: boolean;
  };
  planz: {
    enabled: boolean;
    phase: 'idle' | 'research' | 'survey' | 'plan' | 'execute';
    sessionId?: string;
  };
}

export interface ContinuezDecision {
  farmId: string;
  agentId: string;
  shouldContinue: boolean;
  confidenceScore: number;
  threshold: number;
  reason: string;
}

export interface PlanzSession {
  id: string;
  farmId: string;
  phase: 'research' | 'survey' | 'plan' | 'execute';
  prompt: string;
  research: PlanzResearchResult[];
  survey: PlanzSurveyQuestion[];
  responses: PlanzSurveyResponse[];
  roadmap: PlanzRoadmapStep[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanzResearchResult {
  category: string;
  finding: string;
  confidence: number;
  sources: string[];
}

export interface PlanzSurveyQuestion {
  id: string;
  question: string;
  header: string;
  options: Array<{
    label: string;
    description: string;
  }>;
  multiSelect: boolean;
}

export interface PlanzSurveyResponse {
  questionId: string;
  selectedOptions: string[];
  customInput?: string;
}

export interface PlanzRoadmapStep {
  id: string;
  title: string;
  description: string;
  phase: string;
  dependencies: string[];
  estimatedEffort: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
}

// ============================================================================
// Service Implementation
// ============================================================================

class PluginCoordinatorServiceClass extends EventEmitter {
  private farmPluginStates: Map<string, PluginState> = new Map();
  private planzSessions: Map<string, PlanzSession> = new Map();

  constructor() {
    super();
    this.setupEventListeners();
    logger.info(LogCategory.SYSTEM, '[PluginCoordinator] Initialized');
  }

  /**
   * Setup event listeners for plugin coordination
   */
  private setupEventListeners(): void {
    // Listen for confidence updates
    confidenceCoordinationReader.on('confidence:update', (event: ConfidenceUpdateEvent) => {
      this.handleConfidenceUpdate(event);
    });
  }

  /**
   * Initialize plugins for a farm based on its mode
   */
  async initializeForFarm(farmId: string, mode: FarmMode): Promise<PluginState> {
    const config = getPluginConfig(mode);

    const state: PluginState = {
      farmId,
      mode,
      config,
      isActive: true,
      startedAt: new Date(),
      confidenz: {
        enabled: config.confidenzEnabled,
        lastScore: 0,
        history: [],
      },
      continuez: {
        enabled: config.continuezEnabled,
        threshold: config.continuezThreshold,
        continuationCount: 0,
        shouldContinue: true,
      },
      planz: {
        enabled: config.planzEnabled,
        phase: 'idle',
      },
    };

    this.farmPluginStates.set(farmId, state);

    // Start confidence monitoring if enabled
    if (config.confidenzEnabled) {
      await confidenzService.startMonitoring(farmId);
      logger.info(LogCategory.SYSTEM, `[PluginCoordinator] Started confidenz for farm ${farmId}`);
    }

    // Run pre-launch planz survey if enabled
    if (config.planzEnabled && config.planzPrelaunchSurvey) {
      logger.info(LogCategory.SYSTEM, `[PluginCoordinator] Planz pre-launch survey ready for farm ${farmId}`);
      // Emit event for dashboard to show survey modal
      this.emit('planz:survey:ready', { farmId });
    }

    logger.info(LogCategory.SYSTEM, `[PluginCoordinator] Initialized plugins for farm ${farmId} (mode: ${mode})`);
    return state;
  }

  /**
   * Handle confidence update event
   */
  private handleConfidenceUpdate(event: ConfidenceUpdateEvent): void {
    const state = this.farmPluginStates.get(event.farmId);
    if (!state || !state.isActive) return;

    // Update confidenz state
    state.confidenz.lastScore = event.aggregate.averageScore;
    state.confidenz.history.push(event.aggregate.averageScore);
    if (state.confidenz.history.length > 100) {
      state.confidenz.history.shift();
    }

    // Check continuez decision for each agent
    if (state.continuez.enabled) {
      for (const agent of event.agents) {
        const decision = this.evaluateContinuez(event.farmId, agent.agentId, agent.score);
        if (!decision.shouldContinue) {
          this.emit('continuez:pause', decision);
        }
      }
    }

    // Emit aggregated update
    this.emit('plugins:confidence:update', {
      farmId: event.farmId,
      confidence: event.aggregate,
      continuez: state.continuez,
    });
  }

  /**
   * Evaluate whether an agent should continue based on confidence
   */
  evaluateContinuez(farmId: string, agentId: string, score: number): ContinuezDecision {
    const state = this.farmPluginStates.get(farmId);
    if (!state) {
      return {
        farmId,
        agentId,
        shouldContinue: true,
        confidenceScore: score,
        threshold: 80,
        reason: 'No plugin state found, defaulting to continue',
      };
    }

    const threshold = state.continuez.threshold;
    const shouldContinue = shouldAutoContinue(score, threshold);
    const level = getConfidenceLevel(score);

    let reason: string;
    if (shouldContinue) {
      reason = `Confidence ${score}% >= threshold ${threshold}%, continuing`;
    } else {
      reason = `Confidence ${score}% < threshold ${threshold}%, pausing for review`;
    }

    const decision: ContinuezDecision = {
      farmId,
      agentId,
      shouldContinue,
      confidenceScore: score,
      threshold,
      reason,
    };

    // Update state
    state.continuez.shouldContinue = shouldContinue;
    if (shouldContinue) {
      state.continuez.continuationCount++;
    }

    logger.debug(LogCategory.SYSTEM, `[PluginCoordinator] Continuez decision for agent ${agentId}: ${reason}`);

    return decision;
  }

  /**
   * Start a planz session for a farm
   */
  async startPlanzSession(farmId: string, prompt: string): Promise<PlanzSession> {
    const sessionId = `planz_${farmId}_${Date.now()}`;

    const session: PlanzSession = {
      id: sessionId,
      farmId,
      phase: 'research',
      prompt,
      research: [],
      survey: [],
      responses: [],
      roadmap: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.planzSessions.set(sessionId, session);

    // Update plugin state
    const state = this.farmPluginStates.get(farmId);
    if (state) {
      state.planz.phase = 'research';
      state.planz.sessionId = sessionId;
    }

    // Write session info to coordination file for Python orchestrator
    await this.writePlanzCoordinationFile(session);

    logger.info(LogCategory.SYSTEM, `[PluginCoordinator] Started planz session ${sessionId} for farm ${farmId}`);

    this.emit('planz:session:started', session);
    return session;
  }

  /**
   * Write planz session to coordination file
   */
  private async writePlanzCoordinationFile(session: PlanzSession): Promise<void> {
    const coordinationDir = pathConfig.getPath('COORDINATION_DIR');
    const filePath = path.join(coordinationDir, `${session.farmId}_planz_session.json`);

    try {
      await fs.mkdir(coordinationDir, { recursive: true });
      await fs.writeFile(filePath, JSON.stringify({
        session_id: session.id,
        farm_id: session.farmId,
        phase: session.phase,
        prompt: session.prompt,
        research: session.research,
        survey: session.survey,
        responses: session.responses,
        roadmap: session.roadmap,
        created_at: session.createdAt.toISOString(),
        updated_at: session.updatedAt.toISOString(),
      }, null, 2));
    } catch (error) {
      logger.error(LogCategory.SYSTEM, `[PluginCoordinator] Failed to write planz coordination file: ${error}`);
    }
  }

  /**
   * Submit planz survey responses
   */
  async submitPlanzSurveyResponses(
    sessionId: string,
    responses: PlanzSurveyResponse[]
  ): Promise<PlanzSession | null> {
    const session = this.planzSessions.get(sessionId);
    if (!session) {
      logger.warn(LogCategory.SYSTEM, `[PluginCoordinator] Planz session not found: ${sessionId}`);
      return null;
    }

    session.responses = responses;
    session.phase = 'plan';
    session.updatedAt = new Date();

    await this.writePlanzCoordinationFile(session);

    // Update plugin state
    const state = this.farmPluginStates.get(session.farmId);
    if (state) {
      state.planz.phase = 'plan';
    }

    this.emit('planz:survey:submitted', session);
    logger.info(LogCategory.SYSTEM, `[PluginCoordinator] Survey responses submitted for session ${sessionId}`);

    return session;
  }

  /**
   * Get planz session by ID
   */
  getPlanzSession(sessionId: string): PlanzSession | null {
    return this.planzSessions.get(sessionId) || null;
  }

  /**
   * Get planz session for a farm
   */
  getPlanzSessionForFarm(farmId: string): PlanzSession | null {
    const state = this.farmPluginStates.get(farmId);
    if (!state?.planz.sessionId) return null;
    return this.planzSessions.get(state.planz.sessionId) || null;
  }

  /**
   * Get plugin state for a farm
   */
  getPluginState(farmId: string): PluginState | null {
    return this.farmPluginStates.get(farmId) || null;
  }

  /**
   * Get confidence summary for a farm
   */
  getConfidenceSummary(farmId: string): FarmConfidenceSummary | null {
    return confidenceCoordinationReader.getConfidenceSummary(farmId);
  }

  /**
   * Update continuez threshold for a farm
   */
  updateContinuezThreshold(farmId: string, threshold: number): boolean {
    const state = this.farmPluginStates.get(farmId);
    if (!state) return false;

    state.continuez.threshold = Math.max(0, Math.min(99, threshold));
    state.config.continuezThreshold = state.continuez.threshold;

    logger.info(LogCategory.SYSTEM, `[PluginCoordinator] Updated continuez threshold for farm ${farmId} to ${threshold}%`);
    return true;
  }

  /**
   * Stop plugins for a farm
   */
  async stopForFarm(farmId: string): Promise<void> {
    const state = this.farmPluginStates.get(farmId);
    if (!state) return;

    state.isActive = false;

    // Stop confidence monitoring
    if (state.confidenz.enabled) {
      confidenzService.stopMonitoring(farmId);
    }

    // Cleanup planz session
    if (state.planz.sessionId) {
      this.planzSessions.delete(state.planz.sessionId);
    }

    this.farmPluginStates.delete(farmId);
    logger.info(LogCategory.SYSTEM, `[PluginCoordinator] Stopped plugins for farm ${farmId}`);
  }

  /**
   * Get all active plugin states
   */
  getAllActiveStates(): PluginState[] {
    return Array.from(this.farmPluginStates.values()).filter(s => s.isActive);
  }

  /**
   * Shutdown all plugins
   */
  async shutdown(): Promise<void> {
    const activeFarms = Array.from(this.farmPluginStates.keys());
    for (const farmId of activeFarms) {
      await this.stopForFarm(farmId);
    }

    confidenceCoordinationReader.shutdown();
    logger.info(LogCategory.SYSTEM, '[PluginCoordinator] Shutdown complete');
  }
}

// Singleton export
export const pluginCoordinatorService = new PluginCoordinatorServiceClass();
export default pluginCoordinatorService;
