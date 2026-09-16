/**
 * Unified Farm Launch Orchestrator
 *
 * Provides a single, consistent interface for launching farms across all modes:
 * - Harvest Mode: Multi-agent collaborative development with XenoSync
 * - Quick Task Mode: Single quick task with strict timeout (5 minutes)
 * - Go Wild Mode: Autonomous creative mode with extended timeouts
 *
 * Features:
 * - Mode-specific configurations
 * - XenoSync integration for supported modes
 * - Tmux session management
 * - Terminal streaming and monitoring
 * - Graceful error handling and recovery
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';
import { websocketManager } from '../websocket/websocketManager';
import { withDatabaseRetry } from '../utils/retry';
import { TmuxManager } from '../utils/tmuxManager';
import { unifiedTerminalStreamService } from './UnifiedTerminalStreamService';
import { enhancedTerminalService } from './EnhancedRealTimeTerminalService';
import { unifiedAIEngineLauncher } from './UnifiedAIEngineLauncher';
import { agentActivityHeartbeatService } from './AgentActivityHeartbeatService';
import { harvestService } from './unified/harvestService';
import { harvestSessionCache } from './harvestSessionCache';
import { yieldDetectionService } from './YieldDetectionService';
import { pathConfig } from '../config/paths';
import { shutdownCoordinator } from './shutdownCoordinator';
import { tmuxSessionVerifier } from './TmuxSessionVerifier';
import { workspaceManager } from './workspaceManager';
import { aiProviderManager, AIProvider } from '../config/aiProviders';
import { xenoSyncMonitor } from './XenoSyncMonitor';
import { farmHealthMonitor } from './farmHealthMonitor';
import { orchestratorBridge, OrchestratorStatus } from './OrchestratorBridge';
import { orchestratorHealthMonitor } from './OrchestratorHealthMonitor';
import {
  MODE_OPTIMIZATIONS,
  getOptimizedLaunchSequence,
  calculateOptimalTimeout,
  getPreflightRequirements,
  getPluginConfig
} from '../config/farmModeOptimizations';
import { FarmMode, FarmProvider } from '../types/farm';
import { farmService } from './unified/farmService';
import { problemModelingService } from './ProblemModelingService';
import { causalModelingService } from './CausalModelingService';
import { thermalMonitoringService, ThermalPressureLevel, THERMAL_PRESSURE_LABELS } from './ThermalMonitoringService';
import { seedContextAssembler } from './seedContextAssembler';

const tmuxTmpDir = pathConfig.getPath('TMUX_TMP_DIR');

const resolveProvider = (provider: FarmProvider | undefined): FarmProvider => {
  if (provider) {
    return provider;
  }
  const defaultProvider = aiProviderManager.getDefaultProvider();
  return (defaultProvider as FarmProvider) || 'claude';
};

const mapToAiProvider = (provider: FarmProvider): AIProvider => {
  switch (provider) {
    case 'openai':
      return AIProvider.OPENAI;
    case 'gpt-oss':
      return AIProvider.GPT_OSS;
    case 'llama':
    case 'ollama':
      return AIProvider.LLAMA;
    default:
      return AIProvider.CLAUDE;
  }
};

type OrchestratorProvider = 'claude' | 'openai' | 'gpt-oss' | 'grok';

const mapToOrchestratorProvider = (provider: FarmProvider): OrchestratorProvider => {
  // FIXED: Explicitly handle each provider type including grok
  switch (provider) {
    case 'gpt-oss':
      return 'gpt-oss';
    case 'openai':
      return 'openai';
    case 'claude':
      return 'claude';
    case 'grok':
      return 'grok';
    case 'llama':
    case 'ollama':
      // Llama/Ollama use local inference - map to gpt-oss which has local support
      logger.info(LogCategory.FARM, `Provider ${provider} mapped to gpt-oss for local inference`);
      return 'gpt-oss';
    default:
      // Log warning for unexpected provider but default to claude
      logger.warn(LogCategory.FARM, `Unknown provider "${provider}", defaulting to claude`);
      return 'claude';
  }
};

// Launch configuration for each mode
interface FarmLaunchConfig {
  farmId: string;
  farmName?: string;  // Farm name for display
  mode: FarmMode;
  prompt: string;
  agentCount: number;
  timeout: number; // in seconds
  provider: FarmProvider;
  useXenoSync: boolean;
  userId: string;
  creativityLevel?: number; // For Go Wild mode
  files?: string[];
  metadata?: any;
  yamlContent?: string; // YAML configuration for agents
  // Seeds context injection (Feature A: Seeds can Seed a Farm)
  appliedSeedIds?: string[];
  seedsTextSnapshot?: string;
}

// Mode-specific configurations (ENHANCED for extended farming sessions)
const MODE_CONFIGS = {
  [FarmMode.HARVEST]: {
    defaultAgentCount: 3,
    minAgents: 2,
    maxAgents: 10,
    defaultTimeout: 7200, // 2 hours (extended from 1 hour for comprehensive work)
    useXenoSync: true,
    requiresPrompt: true,
    sessionPrefix: 'farm',
    windowName: 'agents'
  },
  [FarmMode.QUICK_TASK]: {
    defaultAgentCount: 2,  // XenoSync requires minimum 2 agents
    minAgents: 2,
    maxAgents: 2,
    defaultTimeout: 900, // 15 minutes (extended from 5 min for complete bug fixes)
    useXenoSync: true,  // Enable XenoSync for proper coordination
    requiresPrompt: true,
    sessionPrefix: 'farm',  // STANDARDIZED: All modes use 'farm' prefix
    windowName: 'agents'  // Use 'agents' window like other modes
  },
  [FarmMode.GO_WILD]: {
    defaultAgentCount: 5,
    minAgents: 3,
    maxAgents: 20,
    defaultTimeout: 5400, // 1.5 hours (extended from 45 min for thorough exploration)
    useXenoSync: true,
    requiresPrompt: true,
    sessionPrefix: 'farm',  // STANDARDIZED: All modes use 'farm' prefix
    windowName: 'agents'
  }
};

export enum LaunchPhase {
  PREFLIGHT = 'preflight',
  MODELING = 'modeling',  // Model-First Reasoning + Causal Model extraction
  WORKSPACE = 'workspace',
  HARVEST = 'harvest',
  TMUX = 'tmux',
  AGENTS = 'agents',
  STREAMING = 'streaming',
  FINALIZE = 'finalize'
}

interface LaunchPhaseRecord {
  phase: LaunchPhase;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  message?: string;
  error?: string;
}

export interface LaunchProgressEvent {
  farmId: string;
  sessionName: string;
  phase: LaunchPhase;
  status: 'in_progress' | 'completed' | 'failed';
  message: string;
  timestamp: Date;
  error?: string;
}

class LaunchPipelineError extends Error {
  constructor(
    public readonly phase: LaunchPhase,
    message: string,
    cause?: unknown
  ) {
    super(message);
    this.name = 'LaunchPipelineError';
    if (cause !== undefined) {
      (this as any).cause = cause;
    }
  }
}

interface LaunchState {
  farmId: string;
  mode: FarmMode;
  provider: FarmProvider;  // ADDED: Track provider for orchestrator restart
  status: 'initializing' | 'launching' | 'running' | 'completed' | 'failed';
  sessionName: string;
  windowName: string;
  agentCount: number;
  agents: Map<number, AgentState>;
  startTime: Date;
  harvestId?: string;
  errors: Error[];
  currentPhase?: LaunchPhase;
  phases: LaunchPhaseRecord[];
  metadata?: {
    orchestratorPid?: number;
    [key: string]: any;
  };
}

interface AgentState {
  id: number;
  name: string;
  paneId: string;
  status: 'initializing' | 'starting' | 'active' | 'working' | 'completed' | 'failed' | 'error';
  pid?: number;
  lastActivity?: Date;
  output?: string[];
}

export class UnifiedFarmLaunchOrchestrator extends EventEmitter {
  private static instance: UnifiedFarmLaunchOrchestrator;
  private activeFarms = new Map<string, LaunchState>();
  private orchestratorProcesses = new Map<string, ChildProcess>();
  private forceKillTimeouts = new Map<string, NodeJS.Timeout>(); // Track force-kill timeouts
  private tmuxManager: TmuxManager;

  private constructor() {
    super();
    this.tmuxManager = new TmuxManager();
    this.setupEventHandlers();
  }

  private emitLaunchProgress(
    state: LaunchState,
    phase: LaunchPhase,
    status: 'in_progress' | 'completed' | 'failed',
    message: string,
    error?: string
  ): void {
    const payload: LaunchProgressEvent = {
      farmId: state.farmId,
      sessionName: state.sessionName,
      phase,
      status,
      message,
      timestamp: new Date(),
      error
    };

    if (status === 'failed') {
      logger.error(LogCategory.FARM, `[Launch] ${state.farmId} ${phase} failed: ${message}${error ? ` :: ${error}` : ''}`);
    } else if (status === 'completed') {
      logger.info(LogCategory.FARM, `[Launch] ${state.farmId} ${phase} completed: ${message}`);
    } else {
      logger.debug(LogCategory.FARM, `[Launch] ${state.farmId} ${phase} → ${message}`);
    }

    this.emit('farm:launch-progress', payload);
    websocketManager.broadcast('farm:launch-progress', payload);
    websocketManager.broadcastToFarm(state.farmId, 'farm:launch-progress', payload);
  }

  private async runLaunchStep(
    state: LaunchState,
    phase: LaunchPhase,
    label: string,
    executor: () => Promise<void>
  ): Promise<void> {
    const record: LaunchPhaseRecord = {
      phase,
      status: 'in_progress',
      startedAt: new Date(),
      message: label
    };

    state.currentPhase = phase;
    state.phases.push(record);
    this.emitLaunchProgress(state, phase, 'in_progress', label);

    try {
      await executor();
      record.status = 'completed';
      record.completedAt = new Date();
      this.emitLaunchProgress(state, phase, 'completed', label);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      record.status = 'failed';
      record.completedAt = new Date();
      record.error = reason;
      this.emitLaunchProgress(state, phase, 'failed', label, reason);
      state.errors.push(error instanceof Error ? error : new Error(reason));
      throw new LaunchPipelineError(phase, `Launch step ${phase} failed: ${reason}`, error);
    }
  }

  private async performPreflightChecks(config: FarmLaunchConfig, state: LaunchState): Promise<void> {
    // Get mode-specific requirements
    const requirements = getPreflightRequirements(config.mode);

    // Check system resources
    const os = await import('os');
    const availableMemoryGB = os.freemem() / (1024 * 1024 * 1024);
    if (availableMemoryGB < requirements.minMemoryGB) {
      throw new Error(`Insufficient memory: ${availableMemoryGB.toFixed(1)}GB available, ${requirements.minMemoryGB}GB required for ${config.mode} mode`);
    }

    // Check load average
    const loadAverage = os.loadavg()[0] / os.cpus().length;
    if (loadAverage > requirements.maxLoadAverage) {
      logger.warn(LogCategory.FARM, `System load high: ${loadAverage.toFixed(2)}, recommended max ${requirements.maxLoadAverage}`);
    }

    // Check thermal state - prevent launching during thermal throttling
    const thermalCheck = thermalMonitoringService.canLaunchFarm();
    if (!thermalCheck.allowed) {
      logger.error(LogCategory.THERMAL, `Farm launch blocked due to thermal conditions`, {
        farmId: config.farmId,
        reason: thermalCheck.reason
      });
      throw new Error(`Thermal protection: ${thermalCheck.reason}`);
    }

    // Adjust agent count based on thermal state
    const recommendedAgents = thermalMonitoringService.getRecommendedAgentCount(config.agentCount);
    if (recommendedAgents < config.agentCount) {
      const currentMetrics = thermalMonitoringService.getCurrentMetrics();
      logger.warn(LogCategory.THERMAL, `Reducing agent count due to thermal pressure`, {
        farmId: config.farmId,
        requestedAgents: config.agentCount,
        recommendedAgents,
        pressureLevel: currentMetrics?.pressureLabel || 'unknown'
      });

      // Update config with reduced agent count
      config.agentCount = recommendedAgents;
      state.agentCount = recommendedAgents;

      // Emit warning event
      websocketManager.broadcast('thermal:agent-reduction', {
        farmId: config.farmId,
        originalCount: config.agentCount,
        reducedCount: recommendedAgents,
        reason: `Thermal pressure: ${currentMetrics?.pressureLabel || 'elevated'}`,
        timestamp: new Date()
      });
    }

    await aiProviderManager.refreshApiKeys();
    const resolvedProvider = resolveProvider(config.provider);
    const providerEnum = mapToAiProvider(resolvedProvider);

    if (!aiProviderManager.isProviderEnabled(providerEnum)) {
      throw new Error(`Provider ${resolvedProvider} is not enabled. Add a valid configuration before launching.`);
    }

    const tmuxReady = await this.tmuxManager.ensureServerRunning();
    if (!tmuxReady) {
      throw new Error('Unable to communicate with tmux server');
    }

    // Pre-register terminal sessions so streaming can hook in as soon as panes appear
    // Using the new consolidated terminal service for all terminal operations
    logger.info(LogCategory.TERMINAL,
      `Pre-registering terminal session for farm ${config.farmId} with ${config.agentCount} agents`);

    // The consolidated service will handle everything internally

    // Prime harvest session cache to avoid frontend timeouts while panes come online
    try {
      await harvestSessionCache.createSessionEntry(state.sessionName, {
        farmId: config.farmId,
        paneCount: config.agentCount,
        status: 'launching',
        createdAt: new Date()
      });
      await harvestSessionCache.mapFarmToSession(config.farmId, state.sessionName);
    } catch (error) {
      logger.warn(LogCategory.HARVEST, `Failed to prime harvest session cache for ${config.farmId}:`, error);
    }
  }

  /**
   * MODELING PHASE - Model-First Reasoning + Causal Model Extraction
   *
   * Based on:
   * - "Model-First Reasoning LLM Agents" (arxiv 2512.14474)
   * - "Large Causal Models from Large Language Models" (arxiv 2512.07796)
   *
   * This phase generates explicit problem models and causal graphs before
   * agent execution, reducing hallucinations and enabling intelligent task ordering.
   */
  private async executeModelingPhase(config: FarmLaunchConfig, state: LaunchState): Promise<void> {
    const startTime = Date.now();
    const farmId = config.farmId;

    logger.info(LogCategory.FARM,
      `Starting MODELING phase for farm ${farmId} (${config.mode} mode, ${config.agentCount} agents)`);

    // Broadcast modeling started event
    websocketManager.broadcast('farm:modeling-started', {
      farmId,
      phase: 'MODELING',
      mode: config.mode,
      agentCount: config.agentCount,
      timestamp: new Date().toISOString(),
    });
    websocketManager.broadcastToFarm(farmId, 'farm:modeling-started', {
      farmId,
      phase: 'MODELING',
      mode: config.mode,
      agentCount: config.agentCount,
      timestamp: new Date().toISOString(),
    });

    try {
      // Determine AI provider for model generation
      const modelProvider = config.provider === 'openai' ? 'openai' :
                           config.provider === 'ollama' || config.provider === 'llama' ? 'ollama' :
                           'claude';

      // Generate Problem Model (Model-First Reasoning)
      logger.info(LogCategory.FARM, `Generating problem model for farm ${farmId}`);
      const problemModelResult = await problemModelingService.generateModel({
        farmId,
        prompt: config.prompt,
        mode: config.mode.toUpperCase() as 'HARVEST' | 'QUICK_TASK' | 'GO_WILD',
        agentCount: config.agentCount,
        provider: modelProvider,
        context: config.yamlContent,
      });

      if (problemModelResult.warnings.length > 0) {
        logger.warn(LogCategory.FARM,
          `Problem model warnings for ${farmId}: ${problemModelResult.warnings.join(', ')}`);
      }

      logger.info(LogCategory.FARM,
        `Problem model generated for ${farmId}: ` +
        `${problemModelResult.model.entities.length} entities, ` +
        `${problemModelResult.model.actions.length} actions, ` +
        `${problemModelResult.model.constraints.length} constraints ` +
        `(${problemModelResult.durationMs}ms)`);

      // Broadcast problem model generated event
      websocketManager.broadcast('farm:problem-model-generated', {
        farmId,
        modelId: problemModelResult.model.id,
        entityCount: problemModelResult.model.entities.length,
        actionCount: problemModelResult.model.actions.length,
        constraintCount: problemModelResult.model.constraints.length,
        goalCount: problemModelResult.model.goals.length,
        durationMs: problemModelResult.durationMs,
        timestamp: new Date().toISOString(),
      });

      // Generate Causal Model (DEMOCRITUS-inspired)
      logger.info(LogCategory.FARM, `Extracting causal model for farm ${farmId}`);
      const causalModel = await causalModelingService.extractCausalModel({
        farmId,
        prompt: config.prompt,
        problemModel: {
          entities: problemModelResult.model.entities.map(e => ({
            id: e.id,
            name: e.name,
            type: e.type,
          })),
          actions: problemModelResult.model.actions.map(a => ({
            id: a.id,
            name: a.name,
            description: a.description,
          })),
        },
        provider: modelProvider,
        context: config.yamlContent,
      });

      logger.info(LogCategory.FARM,
        `Causal model extracted for ${farmId}: ` +
        `${causalModel.triples.length} triples, ` +
        `${causalModel.graph.nodes.length} nodes, ` +
        `${causalModel.conflicts.length} conflicts ` +
        `(isDAG: ${causalModel.graph.isDAG})`);

      // Broadcast causal model generated event
      websocketManager.broadcast('farm:causal-model-generated', {
        farmId,
        modelId: causalModel.id,
        tripleCount: causalModel.triples.length,
        nodeCount: causalModel.graph.nodes.length,
        edgeCount: causalModel.graph.edges.length,
        conflictCount: causalModel.conflicts.length,
        isDAG: causalModel.graph.isDAG,
        topologicalOrder: causalModel.topologicalOrder,
        timestamp: new Date().toISOString(),
      });

      // Store model references in launch state metadata
      state.metadata = state.metadata || {};
      state.metadata.problemModelId = problemModelResult.model.id;
      state.metadata.causalModelId = causalModel.id;
      state.metadata.taskOrder = causalModel.topologicalOrder;

      // Broadcast modeling completion
      websocketManager.broadcast('farm:modeling-complete', {
        farmId,
        problemModel: problemModelingService.getModelSummary(problemModelResult.model),
        causalModel: causalModelingService.getModelSummary(causalModel),
      });

      const totalDuration = Date.now() - startTime;
      logger.info(LogCategory.FARM,
        `MODELING phase completed for ${farmId} in ${totalDuration}ms`);

    } catch (error) {
      // MODELING phase is non-blocking - log warning but continue
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(LogCategory.FARM,
        `MODELING phase failed for ${farmId}, continuing without models: ${errorMessage}`);

      // Still mark as completed (with warning) so pipeline continues
      state.metadata = state.metadata || {};
      state.metadata.modelingFailed = true;
      state.metadata.modelingError = errorMessage;
    }
  }

  private async initializeHarvestStage(config: FarmLaunchConfig, state: LaunchState): Promise<void> {
    const harvestId = await this.initializeHarvest(config);
    state.harvestId = harvestId;

    // Refresh mapping with confirmed harvest ID association
    try {
      await harvestSessionCache.mapFarmToSession(config.farmId, state.sessionName);
    } catch (error) {
      logger.warn(LogCategory.HARVEST, `Failed to refresh harvest session cache mapping:`, error);
    }
  }

  private async provisionTmuxSession(config: FarmLaunchConfig, state: LaunchState): Promise<void> {
    await this.setupTmuxSession(config, state);
    await this.ensureTmuxSessionReady(state.sessionName, config.agentCount);

    // **CRITICAL FIX**: Schedule shutdown IMMEDIATELY after session creation
    // to protect from session cleanup service race condition
    logger.info(LogCategory.FARM,
      `Scheduling shutdown protection for ${config.farmId} immediately after tmux session creation`);

    if (state.harvestId) {
      await this.scheduleShutdown(config, state.harvestId);
    } else {
      // Schedule without harvest ID for now, will update later
      await this.scheduleShutdown(config);
    }

    // Reapply pipe-pane configuration after verification in case recovery tampered with the session
    await this.setupPipePaneForAllAgents(
      state.sessionName,
      state.windowName,
      config.farmId,
      config.agentCount
    );
  }

  private async finalizeLaunch(config: FarmLaunchConfig, state: LaunchState): Promise<void> {
    const finalizeStart = Date.now();
    logger.info(LogCategory.FARM, `finalizeLaunch called for farm ${config.farmId}, state.agents.size: ${state.agents.size}`);

    // Shutdown already scheduled in provisionTmuxSession() - no need to schedule again
    logger.info(LogCategory.FARM, `Shutdown already scheduled for ${config.farmId} during tmux provisioning`);

    // CRITICAL FIX: Broadcast agent registration BEFORE database persistence so the
    // frontend receives agent identities before any terminal output arrives.
    // This prevents the race condition described in CLAUDE.md (agents must be visible
    // before logs stream in). The database transaction then persists the same data.
    try {
      await this.broadcastAgentRegistration(config.farmId, state);
    } catch (error) {
      logger.error(LogCategory.FARM, `Failed to broadcast agents pre-database for farm ${config.farmId}:`, error);
    }

    // Use transaction with retry to ensure persistent storage after the pre-broadcast
    // Enhanced with transaction monitoring to diagnose orphaned session root cause
    const transactionStart = Date.now();
    let transactionCompleted = false;

    try {
      await withDatabaseRetry(async () => {
        const txStart = Date.now();

        await db.transaction(async (client) => {
          // 1. Save agents to database FIRST
          const agentSaveStart = Date.now();
          logger.info(LogCategory.FARM, `Saving ${state.agents.size} agents to database for farm ${config.farmId}`);

          // Track agent data for farms.agents JSONB array update
          // FIXED Bug #9: Explicitly type array to prevent TypeScript inference issues
          const agentsArray: Array<{
            id: string;
            farmId: string;
            name: string;
            displayName: string;
            agentNumber: number;
            type: string;
            status: string;
            sessionName: string;
            paneId: number;
          }> = [];

          for (const [agentId, agentState] of state.agents) {
            const agentUid = uuidv4();
            const agentType = agentId === 0 ? 'primary' : 'secondary';

            await client.query(
              `INSERT INTO agents (id, farm_id, name, type, status, session_name, pane_index, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
               ON CONFLICT (id) DO UPDATE SET
                 name = EXCLUDED.name,
                 type = EXCLUDED.type,
                 status = EXCLUDED.status,
                 session_name = EXCLUDED.session_name,
                 pane_index = EXCLUDED.pane_index,
                 updated_at = NOW()`,
              [
                agentUid,
                config.farmId,
                agentState.name,
                agentType,
                agentState.status,
                state.sessionName,
                agentId
              ]
            );
            logger.debug(LogCategory.FARM, `Saved agent ${agentId} (${agentState.name}) with UUID ${agentUid}`);

            // FIXED Bug #9: Build agents array for farms.agents JSONB column
            const agentData = {
              id: agentUid,
              farmId: config.farmId,
              name: agentState.name,
              displayName: agentState.name,
              agentNumber: agentId + 1, // 1-based index for display
              type: agentType,
              status: agentState.status,
              sessionName: state.sessionName,
              paneId: agentId
            };

            agentsArray.push(agentData);
          }

          const agentSaveDuration = Date.now() - agentSaveStart;
          logger.info(LogCategory.DATABASE, `Agent save completed in ${agentSaveDuration}ms for farm ${config.farmId}`);

          // Alert on slow agent saves (>3 seconds)
          if (agentSaveDuration > 3000) {
            logger.warn(LogCategory.DATABASE, `SLOW AGENT SAVE: ${agentSaveDuration}ms for ${state.agents.size} agents in farm ${config.farmId}`);
          }

          // FIXED Bug #9: Update farms.agents JSONB array with agent data
          let agentsJson: string;
          try {
            agentsJson = JSON.stringify(agentsArray);
          } catch (err) {
            logger.error(LogCategory.DATABASE, `Failed to stringify agentsArray for farm ${config.farmId}:`, err);
            throw new Error(`Failed to stringify agentsArray: ${err}`);
          }

          logger.info(LogCategory.FARM, `Updating farms.agents JSONB array with ${agentsArray.length} agents for farm ${config.farmId}`);

          try {
            const updateResult = await client.query(
              `UPDATE farms SET agents = $1::jsonb WHERE id = $2 RETURNING id, jsonb_array_length(agents) as updated_count`,
              [agentsJson, config.farmId]
            );

            if (updateResult.rowCount === 0) {
              logger.error(LogCategory.DATABASE, `farms.agents UPDATE matched 0 rows for farm ${config.farmId}`);
              throw new Error(`Farm ${config.farmId} not found in database during agents update`);
            } else {
              const updatedCount = updateResult.rows[0]?.updated_count;
              logger.info(LogCategory.DATABASE, `farms.agents JSONB array updated successfully: ${updatedCount} agents for farm ${config.farmId}`);

              // CRITICAL FIX: Validate that the database has the correct number of agents
              // If JSONB serialization failed, updatedCount will be null or different from expected
              if (updatedCount !== agentsArray.length) {
                const errorMsg = `Agent count mismatch for farm ${config.farmId}: expected ${agentsArray.length}, database has ${updatedCount}`;
                logger.error(LogCategory.DATABASE, errorMsg);
                throw new Error(errorMsg);
              }
            }
          } catch (err) {
            logger.error(LogCategory.DATABASE, `farms.agents UPDATE query failed for farm ${config.farmId}:`, err);
            throw err;
          }

          // 2. Update farm status to active using state machine (NOT direct SQL)
          // Direct SQL UPDATE bypasses state machine validation
          const farmUpdateStart = Date.now();
          await client.query(
            `UPDATE farms SET session_name = $1, updated_at = NOW() WHERE id = $2`,
            [state.sessionName, config.farmId]
          );
          const farmUpdateDuration = Date.now() - farmUpdateStart;

          logger.debug(LogCategory.DATABASE, `Farm status update completed in ${farmUpdateDuration}ms for farm ${config.farmId}`);

          const txDuration = Date.now() - txStart;
          logger.info(LogCategory.DATABASE, `Database transaction committed for farm ${config.farmId} in ${txDuration}ms`);

          // Alert on slow transactions (>5 seconds)
          if (txDuration > 5000) {
            logger.warn(LogCategory.DATABASE, `SLOW TRANSACTION: ${txDuration}ms for farm ${config.farmId} (${state.agents.size} agents)`);
          }

          transactionCompleted = true;
        });

      }, 'finalizeLaunch', { farmId: config.farmId, agentCount: state.agents.size });

      const transactionDuration = Date.now() - transactionStart;
      const finalizeDuration = Date.now() - finalizeStart;

      logger.info(LogCategory.FARM,
        `finalizeLaunch completed for farm ${config.farmId}: total=${finalizeDuration}ms, transaction=${transactionDuration}ms`);

      // Update farm status to 'active' through state machine after successful launch
      // This must happen OUTSIDE the transaction to avoid state machine conflicts
      // CRITICAL FIX: Add retry and fallback to ensure status is updated
      let statusUpdateSuccess = false;
      const maxStatusRetries = 3;

      for (let attempt = 1; attempt <= maxStatusRetries; attempt++) {
        try {
          await farmService.updateFarmStatus(config.farmId, 'active', 'farm_launch_completed');
          logger.info(LogCategory.FARM, `Farm ${config.farmId} status updated to active via state machine`);
          statusUpdateSuccess = true;
          break;
        } catch (statusError) {
          logger.warn(LogCategory.FARM,
            `Status update attempt ${attempt}/${maxStatusRetries} failed:`,
            statusError instanceof Error ? statusError.message : statusError);

          if (attempt < maxStatusRetries) {
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
          }
        }
      }

      // CRITICAL FALLBACK: If state machine update failed, directly update DB and broadcast
      if (!statusUpdateSuccess) {
        logger.error(LogCategory.FARM,
          `All ${maxStatusRetries} status update attempts failed for farm ${config.farmId}. Using fallback.`);

        try {
          // Direct database update bypassing state machine
          await db.query(
            'UPDATE farms SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            ['active', config.farmId]
          );
          logger.info(LogCategory.FARM, `Farm ${config.farmId} status force-updated to active via direct DB`);
          statusUpdateSuccess = true;
        } catch (dbError) {
          logger.error(LogCategory.DATABASE, `Direct DB status update failed:`, dbError);
        }

        // ALWAYS broadcast status even if DB update failed - frontend needs to know
        const statusPayload = {
          farmId: config.farmId,
          status: 'active',
          previousStatus: 'launching',
          reason: 'farm_launch_completed',
          fallbackUsed: true,
          timestamp: new Date()
        };
        websocketManager.broadcast('farm:status', statusPayload);
        websocketManager.broadcastToFarm(config.farmId, 'farm:status', statusPayload);
        websocketManager.broadcast('farm:status:changed', statusPayload);
        logger.info(LogCategory.FARM, `Broadcast farm:status event for ${config.farmId} -> active (fallback)`);
      }

      // Alert on very slow finalization (>10 seconds)
      if (finalizeDuration > 10000) {
        logger.error(LogCategory.DATABASE,
          `CRITICAL: VERY SLOW FINALIZATION: ${finalizeDuration}ms for farm ${config.farmId}. ` +
          `This may lead to orphaned sessions!`);
      }

    } catch (error) {
      const failureDuration = Date.now() - transactionStart;

      logger.error(LogCategory.DATABASE,
        `TRANSACTION FAILED for farm ${config.farmId} after ${failureDuration}ms: ${error instanceof Error ? error.message : String(error)}`, {
          farmId: config.farmId,
          sessionName: state.sessionName,
          agentCount: state.agents.size,
          transactionCompleted,
          error: error instanceof Error ? error.stack : String(error)
        });

      // CRITICAL FIX: Transaction failed but tmux session exists - clean up the orphaned session immediately
      logger.error(LogCategory.SYSTEM,
        `ORPHANED SESSION ALERT: Farm ${config.farmId} has tmux session ${state.sessionName} ` +
        `but database transaction failed. Cleaning up orphaned session immediately.`);

      // Clean up the orphaned tmux session to prevent resource leak
      try {
        if (state.sessionName) {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);

          // Kill the tmux session using TMUX_TMPDIR for cross-process visibility
          await execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t ${state.sessionName}`, {
            timeout: 10000
          });
          logger.info(LogCategory.FARM, `Successfully cleaned up orphaned tmux session ${state.sessionName} after transaction failure`);
        }
      } catch (cleanupError) {
        logger.error(LogCategory.FARM, `Failed to clean up orphaned tmux session ${state.sessionName}:`, cleanupError);
        // Continue to throw original error - cleanup failure is secondary
      }

      // CRITICAL FIX: Update farm status to 'failed' in database before throwing
      // This prevents farms from being stuck in 'launching' or 'active' status forever
      try {
        const pool = getPool();
        await pool.query(
          `UPDATE farms SET status = 'failed', updated_at = NOW() WHERE id = $1`,
          [config.farmId]
        );
        logger.info(LogCategory.DATABASE, `Updated farm ${config.farmId} status to 'failed' after transaction failure`);

        // Broadcast status change to connected clients
        websocketManager.broadcast('farm:status', {
          farmId: config.farmId,
          status: 'failed',
          error: `Farm launch transaction failed: ${error instanceof Error ? error.message : String(error)}`
        });
      } catch (statusUpdateError) {
        logger.error(LogCategory.DATABASE, `Failed to update farm status to 'failed' after transaction failure:`, statusUpdateError);
      }

      throw error;
    }

    // Terminal streaming is already set up in the STREAMING phase
    logger.debug(LogCategory.FARM, `Terminal streaming already configured for farm ${config.farmId}`);
  }

  private async ensureTmuxSessionReady(sessionName: string, expectedAgents: number): Promise<void> {
    const verified = await tmuxSessionVerifier.verifyAndRecover(sessionName, expectedAgents, {
      maxAttempts: 5,
      retryDelay: 1500,
      recreateOnFailure: false
    });

    if (!verified) {
      throw new Error(`Tmux session ${sessionName} did not become ready with ${expectedAgents} panes`);
    }
  }

  static getInstance(): UnifiedFarmLaunchOrchestrator {
    if (!UnifiedFarmLaunchOrchestrator.instance) {
      UnifiedFarmLaunchOrchestrator.instance = new UnifiedFarmLaunchOrchestrator();
    }
    return UnifiedFarmLaunchOrchestrator.instance;
  }

  /**
   * Launch a farm with mode-specific configuration
   */
  async launchFarm(config: Partial<FarmLaunchConfig>): Promise<{
    success: boolean;
    farmId: string;
    sessionName?: string;
    harvestId?: string;
    error?: string;
  }> {
    let normalizedConfig: FarmLaunchConfig | null = null;
    let launchState: LaunchState | null = null;
    try {
      normalizedConfig = await this.normalizeConfig(config);
      const { farmId, mode } = normalizedConfig;

      logger.info(LogCategory.FARM, `Launching ${mode} farm ${farmId}`);

      const sessionName = this.generateSessionName(normalizedConfig);
      const modeConfig = MODE_CONFIGS[mode];

      launchState = {
        farmId,
        mode,
        provider: normalizedConfig.provider,  // ADDED: Track provider for API key management
        status: 'initializing',
        sessionName,
        windowName: modeConfig.windowName,
        agentCount: normalizedConfig.agentCount,
        agents: new Map(),
        startTime: new Date(),
        errors: [],
        phases: []
      };

      this.activeFarms.set(farmId, launchState);

      const steps: Array<{ phase: LaunchPhase; label: string; exec: () => Promise<void> }> = [
        {
          phase: LaunchPhase.PREFLIGHT,
          label: 'Running preflight checks',
          exec: () => this.performPreflightChecks(normalizedConfig!, launchState!)
        },
        {
          phase: LaunchPhase.MODELING,
          label: 'Generating problem and causal models',
          exec: () => this.executeModelingPhase(normalizedConfig!, launchState!)
        },
        {
          phase: LaunchPhase.WORKSPACE,
          label: 'Preparing isolated workspace',
          exec: () => this.createWorkspace(normalizedConfig!)
        },
        {
          phase: LaunchPhase.HARVEST,
          label: 'Initializing harvest tracking',
          exec: () => this.initializeHarvestStage(normalizedConfig!, launchState!)
        },
        {
          phase: LaunchPhase.TMUX,
          label: 'Provisioning tmux session',
          exec: () => this.provisionTmuxSession(normalizedConfig!, launchState!)
        },
        {
          phase: LaunchPhase.AGENTS,
          label: 'Launching farm agents',
          exec: () => this.launchAgentsByMode(normalizedConfig!, launchState!)
        },
        {
          phase: LaunchPhase.STREAMING,
          label: 'Attaching terminal streaming',
          exec: () => this.setupTerminalStreaming(normalizedConfig!, launchState!)
        },
        {
          phase: LaunchPhase.FINALIZE,
          label: 'Finalizing launch lifecycle',
          exec: () => this.finalizeLaunch(normalizedConfig!, launchState!)
        }
      ];

      launchState.status = 'launching';

      // CRITICAL FIX: Add overall pipeline timeout to prevent hanging indefinitely
      // FIX: Increase pipeline timeout for longer farm modes (HARVEST, GO_WILD)
      // Default: 10 minutes for initialization, or 20% of farm timeout (whichever is larger)
      const basePipelineTimeout = 600000; // 10 minutes base
      const configBasedTimeout = normalizedConfig.timeout
        ? Math.max(normalizedConfig.timeout * 1000 * 0.2, basePipelineTimeout) // 20% of farm time or 10 min
        : basePipelineTimeout;
      const pipelineTimeoutMs = Math.min(configBasedTimeout, 1200000); // Cap at 20 minutes max

      const pipelinePromise = (async () => {
        for (const step of steps) {
          await this.runLaunchStep(launchState!, step.phase, step.label, step.exec);
        }
      })();

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Farm launch pipeline timed out after ${pipelineTimeoutMs / 1000} seconds`));
        }, pipelineTimeoutMs);
      });

      // Race between pipeline completion and timeout
      await Promise.race([pipelinePromise, timeoutPromise]);

      launchState.status = 'running';

      // Update farm status in database to running
      await this.updateFarmDatabase(farmId, 'running', sessionName);

      // Start health monitoring for this farm
      await farmHealthMonitor.startMonitoring(farmId);
      logger.info(LogCategory.FARM, `Health monitoring started for farm ${farmId}`);

      // Start orchestrator health monitoring (watches orchestrator.py health files)
      await orchestratorHealthMonitor.startMonitoring(farmId);
      logger.info(LogCategory.FARM, `Orchestrator health monitoring started for farm ${farmId}`);

      this.emit('farm:launched', {
        farmId,
        mode,
        sessionName,
        harvestId: launchState.harvestId,
        agentCount: normalizedConfig.agentCount
      });

      logger.info(LogCategory.FARM, `${mode} farm ${farmId} launched successfully`);

      return {
        success: true,
        farmId,
        sessionName,
        harvestId: launchState.harvestId
      };

    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      logger.error(LogCategory.FARM, `Farm launch failed:`, error);

      const failedFarmId = normalizedConfig?.farmId || config.farmId;

      if (launchState) {
        launchState.status = 'failed';
        launchState.errors.push(error instanceof Error ? error : new Error(reason));
      }

      if (failedFarmId) {
        await this.cleanupFailedLaunch(failedFarmId);
      }

      return {
        success: false,
        farmId: failedFarmId || '',
        error: reason
      };
    }
  }

  /**
   * Normalize and validate configuration based on mode
   */
  private async normalizeConfig(config: Partial<FarmLaunchConfig>): Promise<FarmLaunchConfig> {
    // Determine mode - ensure it's a valid FarmMode value
    // Map collaborative mode to harvest mode for compatibility
    let mode = config.mode || FarmMode.HARVEST;

    // CRITICAL FIX: Normalize mode to lowercase to handle both enum keys (QUICK_TASK) and values (quick_task)
    // Frontend may send uppercase enum keys, but MODE_CONFIGS uses lowercase values
    if (typeof mode === 'string') {
      mode = mode.toLowerCase() as FarmMode;
    }

    if (mode === 'collaborative' || mode === 'sequential' || mode === 'autonomous') {
      logger.info(LogCategory.FARM, `Mapping ${mode} mode to harvest mode`);
      mode = FarmMode.HARVEST;
    }

    // Log for debugging
    logger.info(LogCategory.FARM,
      `Normalizing config - mode: ${mode}, config keys: ${Object.keys(config).join(', ')}`);

    // Get mode config - cast mode to ensure correct type
    const modeConfig = MODE_CONFIGS[mode as FarmMode];

    // Check if mode config exists
    if (!modeConfig) {
      logger.error(LogCategory.FARM,
        `Invalid farm mode: ${mode}. Valid modes: ${Object.values(FarmMode).join(', ')}, MODE_CONFIGS keys: ${Object.keys(MODE_CONFIGS).join(', ')}`);
      throw new Error(`Invalid farm mode: ${mode}. Valid modes are: ${Object.values(FarmMode).join(', ')}`);
    }

    // Generate farm ID if not provided
    const farmId = config.farmId || uuidv4();

    // Validate prompt
    if (modeConfig.requiresPrompt && !config.prompt?.trim()) {
      throw new Error(`Prompt is required for ${mode} mode`);
    }

    // Normalize agent count with explicit validation
    let agentCount = config.agentCount || modeConfig.defaultAgentCount;
    logger.info(LogCategory.FARM,
      `Agent count before normalization: ${agentCount}, config.agentCount: ${config.agentCount}, defaultAgentCount: ${modeConfig.defaultAgentCount}`);

    // CRITICAL VALIDATION: Ensure agent count is a valid positive number
    if (typeof agentCount !== 'number' || !Number.isFinite(agentCount)) {
      logger.error(LogCategory.FARM, `Invalid agent count type: ${typeof agentCount}, value: ${agentCount}`);
      throw new Error(`Invalid agent count: must be a positive number, got ${agentCount}`);
    }

    const originalCount = agentCount;
    agentCount = Math.max(modeConfig.minAgents, Math.min(modeConfig.maxAgents, agentCount));

    // CRITICAL: Enforce minimum of 1 agent regardless of mode config (safety check)
    if (agentCount < 1) {
      logger.error(LogCategory.FARM, `Agent count ${agentCount} is below minimum of 1`);
      throw new Error(`Farm must have at least 1 agent. Requested: ${originalCount}, after normalization: ${agentCount}`);
    }

    // Log warning if agent count was adjusted significantly
    if (originalCount !== agentCount) {
      logger.warn(LogCategory.FARM,
        `Agent count adjusted from ${originalCount} to ${agentCount} (min: ${modeConfig.minAgents}, max: ${modeConfig.maxAgents})`);
    }

    logger.info(LogCategory.FARM,
      `Agent count after normalization: ${agentCount} (was ${originalCount}), min: ${modeConfig.minAgents}, max: ${modeConfig.maxAgents}`);

    // Set timeout using optimized calculation
    const timeout = mode === FarmMode.QUICK_TASK
      ? MODE_CONFIGS[FarmMode.QUICK_TASK].defaultTimeout  // Fixed 5 minutes for quick task
      : (config.timeout || calculateOptimalTimeout(mode, agentCount));

    // Determine if XenoSync should be used
    const providerKey = resolveProvider(config.provider);
    const orchestrationProvider = mapToOrchestratorProvider(providerKey);
    const useXenoSync = modeConfig.useXenoSync &&
                        orchestrationProvider === 'claude' &&
                        agentCount >= 2;

    return {
      farmId,
      mode,
      prompt: config.prompt || '',
      agentCount,
      timeout,
      provider: providerKey,
      useXenoSync,
      userId: config.userId || '',
      creativityLevel: config.creativityLevel,
      files: config.files,
      metadata: config.metadata,
      yamlContent: config.yamlContent,
      // Seeds context injection (Feature A: Seeds can Seed a Farm)
      appliedSeedIds: config.appliedSeedIds,
      seedsTextSnapshot: config.seedsTextSnapshot
    };
  }

  /**
   * Generate session name based on mode
   */
  private generateSessionName(config: FarmLaunchConfig): string {
    const modeConfig = MODE_CONFIGS[config.mode];
    return `${modeConfig.sessionPrefix}-${config.farmId.substring(0, 8)}`;
  }

  /**
   * Create workspace directory structure
   */
  private async createWorkspace(config: FarmLaunchConfig): Promise<void> {
    await aiProviderManager.refreshApiKeys();
    const resolvedProvider = resolveProvider(config.provider);
    const providerEnum = mapToAiProvider(resolvedProvider);

    const workspaceInfo = await workspaceManager.createFarmWorkspace(config.farmId, {
      template: 'default',
      aiProvider: providerEnum,
      includeBarnAccess: true,
      initAI: true,
      metadata: {
        mode: config.mode,
        provider: resolvedProvider
      }
    });

    const workspacePath = workspaceInfo.path;

    // Ensure shared agent directory exists
    await fs.mkdir(path.join(workspacePath, '.agents'), { recursive: true });

    // Write prompt file
    await fs.writeFile(
      path.join(workspacePath, 'prompt.txt'),
      config.prompt,
      'utf-8'
    );

    // Write YAML configuration if provided (for XenoSync coordination)
    if (config.yamlContent) {
      await fs.writeFile(
        path.join(workspacePath, 'farm.yaml'),
        config.yamlContent,
        'utf-8'
      );
      logger.info(LogCategory.FARM,
        `YAML configuration written for ${config.mode} farm ${config.farmId}`);
    }

    // Copy uploaded files if any
    if (config.files && config.files.length > 0) {
      const filesDir = path.join(workspacePath, 'files');
      await fs.mkdir(filesDir, { recursive: true });

      for (const file of config.files) {
        const fileName = path.basename(file);
        await fs.copyFile(file, path.join(filesDir, fileName));
      }
    }

    logger.debug(LogCategory.FARM, `Workspace created for ${config.mode} farm at ${workspacePath}`);
  }

  /**
   * Initialize harvest for the farm
   */
  private async initializeHarvest(config: FarmLaunchConfig): Promise<string> {
    const farmName = config.farmName || `${config.mode}-${config.farmId.substring(0, 8)}`;

    // Use UnifiedHarvestService with proper signature (farmId, farmName, userId)
    // Validate that userId is provided
    if (!config.userId) {
      throw new Error('userId is required to initialize harvest');
    }

    const harvest = await harvestService.startHarvest(
      config.farmId,
      farmName,
      config.userId
    );

    logger.info(LogCategory.HARVEST,
      `Harvest ${harvest.id} initialized for farm ${config.farmId}`);

    return harvest.id;
  }

  /**
   * Setup Tmux session with proper window configuration
   */
  private async setupTmuxSession(config: FarmLaunchConfig, state: LaunchState): Promise<void> {
    const { sessionName, windowName } = state;

    // Ensure tmux server is running
    await this.tmuxManager.ensureServerRunning();

    // Create session
    const created = await this.tmuxManager.createSession(sessionName, windowName);
    if (!created) {
      throw new Error(`Failed to create tmux session ${sessionName}`);
    }

    // Create panes if multiple agents
    if (config.agentCount > 1) {
      await this.tmuxManager.createPanes(sessionName, windowName, config.agentCount);
    }

    // Set up pipe-pane for terminal output capture IMMEDIATELY after session creation
    await this.setupPipePaneForAllAgents(sessionName, windowName, config.farmId, config.agentCount);

    logger.info(LogCategory.FARM,
      `Created tmux session ${sessionName}:${windowName} with ${config.agentCount} panes and pipe-pane configured`);
  }

  /**
   * Set up pipe-pane for all agents to capture terminal output
   */
  private async setupPipePaneForAllAgents(sessionName: string, windowName: string, farmId: string, agentCount: number): Promise<void> {
    // CRITICAL: Use consistent path with orchestrator.py - use FULL farm ID
    // FIX: Removed hardcoded developer path, use proper fallback from MAIBARN_ROOT
    const terminalsBase = pathConfig.getPath('TERMINALS_DIR') || path.join(pathConfig.getPath('MAIBARN_ROOT'), 'terminals');
    const terminalDir = path.join(terminalsBase, farmId);

    try {
      // Create terminal directory
      await fs.mkdir(terminalDir, { recursive: true });
      logger.info(LogCategory.TERMINAL, `Created terminal directory: ${terminalDir}`);

      // Set up pipe-pane for each agent
      for (let i = 0; i < agentCount; i++) {
        const outputFile = path.join(terminalDir, `agent-${i}.log`);

        // Create empty file first with initial message
        await fs.writeFile(outputFile, `[Terminal] Starting output capture for Agent ${i} at ${new Date().toISOString()}\n`);

        // Set up pipe-pane to capture output
        const paneTarget = `${sessionName}:${windowName}.${i}`;
        const pipeCmd = ['pipe-pane', '-t', paneTarget, '-o', `cat >> ${outputFile}`];

        await new Promise((resolve, reject) => {
          const proc = spawn('tmux', pipeCmd, {
            env: { ...process.env, TMUX_TMPDIR: tmuxTmpDir }
          });
          proc.on('close', (code) => {
            if (code === 0) {
              logger.info(LogCategory.TERMINAL, `Set up pipe-pane for ${paneTarget} -> ${outputFile}`);
              resolve(null);
            } else {
              logger.warn(LogCategory.TERMINAL, `Failed to set up pipe-pane for ${paneTarget} (code: ${code})`);
              // Don't reject - continue even if pipe-pane fails for one pane
              resolve(null);
            }
          });
        });
      }

      logger.info(LogCategory.TERMINAL, `Configured pipe-pane for ${agentCount} agents in session ${sessionName}`);

      // File watching is handled by UnifiedTerminalStreamService

    } catch (error) {
      logger.error(LogCategory.TERMINAL, `Failed to set up pipe-pane for agents:`, error);
      // Don't throw - allow farm to continue even if pipe-pane fails
    }
  }

  /**
   * Launch agents based on mode
   */
  private async launchAgentsByMode(config: FarmLaunchConfig, state: LaunchState): Promise<void> {
    const optimization = MODE_OPTIMIZATIONS[config.mode];

    logger.info(LogCategory.FARM, `Launching agents with optimized strategy for ${config.mode} mode`);

    // CRITICAL FIX: Initialize agent states EARLY before launching orchestrator
    // This ensures agents are registered in the state BEFORE terminal output arrives
    const agentNames = this.generateAgentNames(config.mode || FarmMode.HARVEST, config.agentCount);
    for (let i = 0; i < config.agentCount; i++) {
      const agentState: AgentState = {
        id: i,
        name: agentNames[i] || `Agent ${i + 1}`,
        paneId: `${state.sessionName}:${state.windowName}.${i}`,
        status: 'initializing',  // Start as initializing, will update to active when orchestrator confirms
        lastActivity: new Date()
      };
      state.agents.set(i, agentState);
    }

    logger.info(LogCategory.FARM,
      `Pre-initialized ${config.agentCount} agents in state with names: ${agentNames.join(', ')}`);

    // Register farm with YieldDetectionService for real-time artifact detection
    try {
      yieldDetectionService.registerFarm(config.farmId, config.prompt, agentNames);
      logger.info(LogCategory.FARM,
        `Registered farm ${config.farmId} with YieldDetectionService for yield detection`);
    } catch (error) {
      logger.error(LogCategory.FARM,
        `Failed to register farm with YieldDetectionService:`, error);
    }

    // Apply mode-specific timing delays
    await new Promise(resolve => setTimeout(resolve, optimization.timing.orchestratorStartDelay));

    switch (config.mode) {
      case FarmMode.HARVEST:
        await this.launchHarvestAgents(config, state);
        break;
      case FarmMode.QUICK_TASK:
        await this.launchQuickTaskAgent(config, state);
        break;
      case FarmMode.GO_WILD:
        await this.launchGoWildAgents(config, state);
        break;
      default:
        throw new Error(`Unknown farm mode: ${config.mode}`);
    }
  }

  /**
   * Launch Harvest mode agents (always uses orchestrator for proper agent management)
   */
  private async launchHarvestAgents(config: FarmLaunchConfig, state: LaunchState): Promise<void> {
    // Always use the orchestrator for Harvest farms to ensure proper agent launching
    logger.info(LogCategory.FARM, `Launching Harvest farm with orchestrator (${config.agentCount} agents)`);

    // Even single-agent farms benefit from orchestrator's proper launch sequence
    config.useXenoSync = true;  // Force orchestrator usage
    await this.launchXenoSyncAgents(config, state);
  }

  /**
   * Launch Quick Task agents (uses XenoSync for 2-agent coordination)
   */
  private async launchQuickTaskAgent(config: FarmLaunchConfig, state: LaunchState): Promise<void> {
    // Quick Task mode always uses 2 agents with XenoSync coordination
    logger.info(LogCategory.FARM, `Launching Quick Task farm with XenoSync (${config.agentCount} agents)`);

    // Set useXenoSync to true for Quick Task
    config.useXenoSync = true;

    // Use the XenoSync launcher which properly spawns the Python orchestrator
    await this.launchXenoSyncAgents(config, state);
  }

  /**
   * Launch Go Wild agents (autonomous mode with creativity)
   */
  private async launchGoWildAgents(config: FarmLaunchConfig, state: LaunchState): Promise<void> {
    // Go Wild uses enhanced creativity with multi-agent coordination
    const goWildPrompt = this.enhancePromptForGoWild(config.prompt, config.creativityLevel);
    const enhancedConfig = { ...config, prompt: goWildPrompt };

    // Always use the orchestrator for Go Wild mode
    logger.info(LogCategory.FARM, `Launching Go Wild farm with orchestrator (${config.agentCount} agents)`);
    enhancedConfig.useXenoSync = true;  // Force orchestrator usage
    await this.launchXenoSyncAgents(enhancedConfig, state);
  }

  /**
   * Launch agents using XenoSync
   */
  private async launchXenoSyncAgents(config: FarmLaunchConfig, state: LaunchState): Promise<void> {
    // Debug logging
    logger.info(LogCategory.FARM, `launchXenoSyncAgents - config.farmId: ${config.farmId}, config.mode: ${config.mode}`);

    if (!config.farmId) {
      logger.error(LogCategory.FARM, `farmId is missing in XenoSync launch config:`, config);
      throw new Error('farmId is required for XenoSync agent launch');
    }

    const optimization = MODE_OPTIMIZATIONS[config.mode];
    const workspacePath = pathConfig.getFarmWorkspacePath(config.farmId, false);

    // Write the prompt to a YAML file for XenoSync
    const maibarnRoot = pathConfig.getPath('MAIBARN_ROOT');
    logger.info(LogCategory.FARM, `MAIBARN_ROOT value: ${maibarnRoot}`);

    let promptYamlPath: string;
    if (!maibarnRoot) {
      logger.error(LogCategory.FARM, `MAIBARN_ROOT is undefined, using fallback`);
      // Use a fallback path
      const fallbackPath = path.join(process.cwd(), 'var', 'maibarn');
      logger.info(LogCategory.FARM, `Using fallback path: ${fallbackPath}`);
      promptYamlPath = path.join(
        fallbackPath,
        'xenosync-sessions',
        `prompt-${config.farmId}.yaml`
      );
    } else {
      promptYamlPath = path.join(
        maibarnRoot,
        'xenosync-sessions',
        `prompt-${config.farmId}.yaml`
      );
    }

    // Ensure xenosync-sessions directory exists
    await fs.mkdir(path.dirname(promptYamlPath), { recursive: true });

    // Create YAML content with proper agent names
    const agentNames = this.generateAgentNames(config.mode || 'harvest', config.agentCount);

    // Build agents array for YAML - orchestrator expects specific format
    const agentsList = [];
    for (let i = 0; i < config.agentCount; i++) {
      const agentName = agentNames[i];
      const agentRole = this.getAgentRole(config.mode || 'harvest', i);
      agentsList.push({
        name: agentName,
        role: agentRole,
        type: i === 0 ? 'primary' : 'secondary',
        tasks: [],
        capabilities: []
      });
    }

    // Create YAML content in the format expected by orchestrator.py
    const yamlData = {
      name: config.farmName || `${config.mode} Farm`,
      description: config.prompt,
      initial_prompt: config.prompt,
      numberOfAgents: config.agentCount,
      agents: agentsList,
      steps: []
    };

    // Convert to YAML string with proper formatting
    let yamlContent = `name: '${yamlData.name}'\n`;
    yamlContent += `description: ${JSON.stringify(yamlData.description)}\n`;
    yamlContent += `initial_prompt: ${JSON.stringify(yamlData.initial_prompt)}\n`;
    yamlContent += `numberOfAgents: ${yamlData.numberOfAgents}\n`;
    yamlContent += `agents:\n`;

    for (const agent of agentsList) {
      yamlContent += `  - name: "${agent.name}"\n`;
      yamlContent += `    role: "${agent.role}"\n`;
      yamlContent += `    type: "${agent.type}"\n`;
      yamlContent += `    tasks: []\n`;
      yamlContent += `    capabilities: []\n`;
    }

    yamlContent += `steps: []\n`;

    await fs.writeFile(promptYamlPath, yamlContent);
    logger.info(LogCategory.FARM, `YAML file written successfully to: ${promptYamlPath}`);

    // USE THE ALREADY-CREATED SESSION NAME FROM state.sessionName
    // This prevents duplicate session creation with different prefixes
    const tmuxSessionName = state.sessionName;
    logger.info(LogCategory.FARM, `Using already-created tmux session: ${tmuxSessionName}`);

    // Terminal streaming is handled by UnifiedTerminalStreamService
    logger.debug(LogCategory.FARM, `Terminal streaming will be set up by UnifiedTerminalStreamService`);

    // Session was already created in setupTmuxSession (provisionTmuxSession phase)
    // Just verify it exists instead of trying to create it again
    try {
      logger.info(LogCategory.FARM, `Verifying tmux session ${tmuxSessionName} exists...`);

      // Use optimized session creation delay based on mode
      await new Promise(resolve => setTimeout(resolve, optimization.timing.sessionCreationDelay));

      // Verify session was actually created
      const sessionExists = await tmuxSessionVerifier.verifyAndRecover(
        tmuxSessionName,
        1, // At least 1 pane should exist
        {
          maxAttempts: 3,
          retryDelay: 1000,
          recreateOnFailure: true  // Changed to true - try to recreate if missing
        }
      );

      if (!sessionExists) {
        // This is critical - without a session, orchestrator cannot work
        logger.error(LogCategory.FARM, `Failed to create tmux session ${tmuxSessionName} - aborting XenoSync launch`);
        throw new Error(`Tmux session ${tmuxSessionName} could not be created`);
      } else {
        logger.info(LogCategory.FARM, `Tmux session ${tmuxSessionName} verified and ready`);
      }
    } catch (err) {
      // This is a critical failure - orchestrator needs the session
      logger.error(LogCategory.FARM, `Failed to create tmux session for XenoSync:`, err);
      throw new Error(`Tmux session creation failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Launch orchestrator (use the main orchestrator.py, not xenosync)
    const orchestratorPath = path.join(
      process.cwd(),
      'scripts/python/orchestrator.py'
    );

    // Verify orchestrator script exists
    if (!await fs.access(orchestratorPath).then(() => true).catch(() => false)) {
      logger.error(LogCategory.FARM, `Orchestrator script not found at: ${orchestratorPath}`);
      throw new Error(`Orchestrator script not found: ${orchestratorPath}`);
    }

    // Get memory optimization for this mode
    const memoryPerAgent = String(optimization.resources.nodeMemoryPerAgent);

    // Ensure coordination directory exists and write seeds files if provided
    const coordinationDir = path.join(maibarnRoot, 'coordination');
    await fs.mkdir(coordinationDir, { recursive: true });

    // Write applied seeds to coordination directory for orchestrator to pick up
    if (config.appliedSeedIds && config.appliedSeedIds.length > 0) {
      try {
        // Assemble seeds context using the canonical assembler
        const assembledContext = await seedContextAssembler.assembleContext({
          farmId: config.farmId,
          mode: config.mode,
          provider: config.provider,
          basePrompt: config.prompt,
          seedIds: config.appliedSeedIds,
          pinVersions: true
        });

        // Write applied seeds JSON for orchestrator
        const appliedSeedsData = assembledContext.appliedSeeds.map(s => ({
          seedId: s.seedId,
          seedName: s.seedName,
          seedVersion: s.seedVersion,
          seedPrompt: s.seedPrompt
        }));
        await fs.writeFile(
          path.join(coordinationDir, 'applied_seeds.json'),
          JSON.stringify(appliedSeedsData, null, 2)
        );

        // Write seeds text snapshot for direct injection
        if (assembledContext.seedsSection) {
          await fs.writeFile(
            path.join(coordinationDir, 'seeds_text_snapshot.txt'),
            assembledContext.seedsSection
          );
        }

        // Update farm with applied seeds
        await seedContextAssembler.updateFarmWithSeeds(
          config.farmId,
          config.appliedSeedIds,
          assembledContext.seedsSection
        );

        logger.info(LogCategory.FARM, `Seeds context written: ${appliedSeedsData.length} seeds for farm ${config.farmId}`);

        if (assembledContext.warnings.length > 0) {
          logger.warn(LogCategory.FARM, `Seeds warnings: ${assembledContext.warnings.join(', ')}`);
        }
      } catch (seedErr) {
        logger.warn(LogCategory.FARM, `Failed to write seeds context, continuing without seeds:`, seedErr);
      }
    } else if (config.seedsTextSnapshot) {
      // If text snapshot provided directly, write it
      try {
        await fs.writeFile(
          path.join(coordinationDir, 'seeds_text_snapshot.txt'),
          config.seedsTextSnapshot
        );
        logger.info(LogCategory.FARM, `Seeds text snapshot written directly for farm ${config.farmId}`);
      } catch (seedErr) {
        logger.warn(LogCategory.FARM, `Failed to write seeds text snapshot:`, seedErr);
      }
    }

    // Build orchestrator arguments
    // maibarnRoot already declared earlier in this function
    // CRITICAL FIX: Include 'active' subdirectory to match where workspaceManager creates workspaces
    const workspaceRoot = path.join(maibarnRoot, 'workspaces', 'active');

    // Get mode-specific plugin configuration
    const pluginConfig = getPluginConfig(config.mode);

    const orchestratorArgs = [
      orchestratorPath,
      '--prompt-file', promptYamlPath,  // Use --prompt-file flag as expected by orchestrator.py
      '--num-agents', String(config.agentCount),
      '--farm-id', config.farmId,
      '--session', tmuxSessionName,  // Use --session (not --session-name)
      '--workspace-dir', workspaceRoot,  // Base workspace dir, farm ID added by orchestrator
      '--coordination-dir', path.join(maibarnRoot, 'coordination'),  // CRITICAL: Required for status file
      '--provider', mapToOrchestratorProvider(resolveProvider(config.provider)),
      // REMOVED --reuse-session: Each farm needs its own fresh session with correct pane count for all agents
      '--debug',  // Add debug flag for better logging
      '--no-kill-on-exit',  // CRITICAL FIX: Prevent orchestrator from killing tmux sessions on exit
      '--fast-launch',  // PERFORMANCE: Skip checks and minimize delays
      '--max-runtime', String(config.timeout),  // Pass farm timeout to orchestrator (already in seconds)
      // Blerbz Plugins Configuration (inference-confidenz, inference-continuez, inference-planz)
      '--continuez-threshold', String(pluginConfig.continuezThreshold),
    ];

    // Add plugin flags based on mode-specific configuration
    if (pluginConfig.pluginsEnabled) {
      orchestratorArgs.push('--plugins-enabled');
      if (pluginConfig.confidenzEnabled) {
        orchestratorArgs.push('--confidenz-enabled');
      } else {
        orchestratorArgs.push('--no-confidenz');
      }
      if (pluginConfig.continuezEnabled) {
        orchestratorArgs.push('--continuez-enabled');
      } else {
        orchestratorArgs.push('--no-continuez');
      }
      if (pluginConfig.planzEnabled) {
        orchestratorArgs.push('--planz-enabled');
      }
      if (pluginConfig.planzPrelaunchSurvey) {
        orchestratorArgs.push('--planz-prelaunch');
      }
    } else {
      orchestratorArgs.push('--no-plugins');
    }

    logger.info(LogCategory.FARM, `Plugin config for ${config.mode}: threshold=${pluginConfig.continuezThreshold}%, planz=${pluginConfig.planzEnabled}`);

    // FIXED: Use aiProviderManager to get properly validated/decrypted API keys
    const resolvedProvider = resolveProvider(config.provider);
    const providerEnum = mapToAiProvider(resolvedProvider);
    const providerEnv = aiProviderManager.getProviderEnvironment(providerEnum);

    // Log the full command for debugging
    logger.info(LogCategory.FARM, `Launching orchestrator: python3 ${orchestratorArgs.join(' ')}`);
    logger.info(LogCategory.FARM, `Environment: TMUX_TMPDIR=${tmuxTmpDir}, API_KEY=${providerEnv.ANTHROPIC_API_KEY ? 'set' : 'not set'}`);

    const orchestratorProcess = spawn('python3', orchestratorArgs, {
      detached: false,  // Changed from true to false to keep it attached for better monitoring
      stdio: ['ignore', 'pipe', 'pipe'],  // Capture stdout and stderr for debugging
      env: {
        ...process.env,
        ...providerEnv,  // Use validated provider environment from aiProviderManager
        TMUX_TMPDIR: tmuxTmpDir,
        NODE_MEMORY_PER_AGENT: memoryPerAgent,  // Pass optimized memory setting
        MAIBARN_ROOT: maibarnRoot,
        MAIFARM_WORKSPACE: workspaceRoot,
        USE_LLM_PROXY: process.env.USE_LLM_PROXY ?? 'false',
        LLM_PROXY_URL: process.env.LLM_PROXY_URL ?? '',
        PYTHONUNBUFFERED: '1'  // Ensure Python output is not buffered
      },
      cwd: process.cwd()  // Ensure correct working directory
    });

    // DEBUG: Log spawn success
    logger.info(LogCategory.FARM, `Orchestrator process spawned - PID: ${orchestratorProcess.pid}, API Key in env: ${providerEnv.ANTHROPIC_API_KEY ? 'YES' : 'NO'}`);

    // Track if orchestrator started successfully
    let orchestratorStarted = false;
    let outputBuffer = '';

    // Capture orchestrator output for debugging
    if (orchestratorProcess.stdout) {
      orchestratorProcess.stdout.on('data', (data) => {
        const output = data.toString();
        outputBuffer += output;

        // Log each line separately for clarity
        const lines = output.trim().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            logger.info(LogCategory.FARM, `[Orchestrator] ${line}`);

            // Check for successful startup indicators
            if (line.includes('Session') && line.includes('verified with') && line.includes('panes')) {
              orchestratorStarted = true;
              logger.info(LogCategory.FARM, `Orchestrator confirmed session ready for farm ${config.farmId}`);
            }
            if (line.includes('Launching agent') || line.includes('ready')) {
              orchestratorStarted = true;
            }
          }
        }
      });
    }

    if (orchestratorProcess.stderr) {
      orchestratorProcess.stderr.on('data', (data) => {
        const error = data.toString();
        // Python's logging.basicConfig sends ALL logs to stderr by default
        // So we need to properly classify messages by their log level
        if (error.includes('[DEBUG]') || error.includes('DEBUG')) {
          logger.debug(LogCategory.FARM, `[Orchestrator Debug] ${error.trim()}`);
        } else if (error.includes('[INFO]')) {
          // INFO messages from Python orchestrator are normal operation logs
          logger.info(LogCategory.FARM, `[Orchestrator] ${error.trim()}`);
        } else if (error.includes('WARNING') || error.includes('[WARNING]')) {
          logger.warn(LogCategory.FARM, `[Orchestrator Warning] ${error.trim()}`);
        } else if (error.includes('ERROR') || error.includes('[ERROR]')) {
          // Only actual ERROR messages should be treated as errors
          logger.error(LogCategory.FARM, `[Orchestrator Error] ${error.trim()}`);
          state.errors.push(new Error(`Orchestrator error: ${error.trim()}`));
        } else {
          // Unknown messages - log as info to avoid false positives
          logger.info(LogCategory.FARM, `[Orchestrator] ${error.trim()}`);
        }
      });
    }

    orchestratorProcess.on('error', (error) => {
      logger.error(LogCategory.FARM, `Failed to launch orchestrator:`, error);
      logger.error(LogCategory.FARM, `Working directory: ${process.cwd()}`);
      logger.error(LogCategory.FARM, `Script path: ${orchestratorPath}`);

      // Mark farm as failed if orchestrator fails to start
      state.status = 'failed';
      state.errors.push(new Error(`Orchestrator launch failed: ${error.message}`));

      // Register failure with XenoSync monitor
      xenoSyncMonitor.stopMonitoring(config.farmId);
    });

    orchestratorProcess.on('exit', (code, signal) => {
      logger.info(LogCategory.FARM, `Orchestrator process exited with code ${code}, signal ${signal}`);

      // Check if this was an early exit (within 5 seconds)
      const runtime = Date.now() - state.startTime.getTime();
      if (runtime < 5000 && code !== 0) {
        logger.error(LogCategory.FARM, `Orchestrator exited too quickly (${runtime}ms), likely failed to start`);
        logger.error(LogCategory.FARM, `Last output: ${outputBuffer.slice(-500)}`);
        state.status = 'failed';
        state.errors.push(new Error(`Orchestrator failed to start (exit code ${code})`));
      } else if (code === 0) {
        logger.info(LogCategory.FARM, `Orchestrator completed successfully for farm ${config.farmId}`);
      }
    });

    // Store process reference for cleanup
    if (!state.metadata) state.metadata = {};
    state.metadata.orchestratorPid = orchestratorProcess.pid;
    state.metadata.orchestratorProcess = orchestratorProcess;

    // Track process in Map for cleanup
    this.orchestratorProcesses.set(config.farmId, orchestratorProcess);

    logger.info(LogCategory.FARM, `Orchestrator process started with PID ${orchestratorProcess.pid}`);

    // **CRITICAL FIX**: Wait for orchestrator to signal readiness instead of blind polling
    logger.info(LogCategory.FARM, `Waiting for orchestrator to signal readiness for farm ${config.farmId}...`);

    try {
      const orchestratorStatus = await orchestratorBridge.waitForOrchestratorReady(
        config.farmId,
        {
          timeout: 90000, // 90s timeout for multi-agent farms
          requiredStatus: [OrchestratorStatus.READY]
        }
      );

      logger.info(LogCategory.FARM,
        `Orchestrator ready for farm ${config.farmId}: session=${orchestratorStatus.sessionName}, ` +
        `panes=${orchestratorStatus.panesCreated}, pid=${orchestratorStatus.orchestratorPid}`
      );

      // CRITICAL VALIDATION: Verify orchestrator created expected number of panes
      if (orchestratorStatus.panesCreated !== config.agentCount) {
        logger.error(LogCategory.FARM,
          `Orchestrator pane count mismatch for farm ${config.farmId}: ` +
          `expected ${config.agentCount}, got ${orchestratorStatus.panesCreated}`
        );
        throw new Error(
          `Orchestrator created ${orchestratorStatus.panesCreated} panes but expected ${config.agentCount}`
        );
      }

      // Verify orchestrator status is "ready" or "completed" not just "initializing"
      if (orchestratorStatus.status !== 'ready' && orchestratorStatus.status !== OrchestratorStatus.COMPLETED) {
        logger.error(LogCategory.FARM,
          `Orchestrator not in ready state for farm ${config.farmId}: status=${orchestratorStatus.status}`
        );
        throw new Error(`Orchestrator status is ${orchestratorStatus.status}, expected ready`);
      }

      // Start monitoring for orchestrator completion
      logger.info(LogCategory.FARM, `Starting completion monitoring for farm ${config.farmId}`);
      orchestratorBridge.monitorForCompletion(config.farmId).catch((error) => {
        logger.error(LogCategory.FARM, `Completion monitoring error for farm ${config.farmId}:`, error);
      });

      // Register with XenoSync monitor for comprehensive health tracking
      await xenoSyncMonitor.registerSession(config.farmId, tmuxSessionName, config.agentCount);

      // Verify session health after orchestrator signals ready
      const sessionCreated = await tmuxSessionVerifier.verifyAndRecover(
        tmuxSessionName,
        config.agentCount,
        {
          maxAttempts: 3, // Reduced since orchestrator already confirmed
          retryDelay: 1000,
          recreateOnFailure: false
        }
      );

      if (!sessionCreated) {
        logger.warn(LogCategory.FARM,
          `Session verification failed after orchestrator ready signal for farm ${config.farmId}`);
        // Try one more time with recovery
        await tmuxSessionVerifier.verifyAndRecover(tmuxSessionName, config.agentCount, {
          maxAttempts: 2,
          retryDelay: 2000,
          recreateOnFailure: true
        });
      }

    } catch (error) {
      logger.error(LogCategory.FARM,
        `Orchestrator failed to become ready for farm ${config.farmId}:`, error);

      // Fallback to old polling method
      logger.warn(LogCategory.FARM, `Falling back to polling verification for farm ${config.farmId}`);

      const sessionCreated = await tmuxSessionVerifier.verifyAndRecover(
        tmuxSessionName,
        config.agentCount,
        {
          maxAttempts: 5,
          retryDelay: 2000,
          recreateOnFailure: false
        }
      );

      if (!sessionCreated) {
        throw new Error(`Failed to verify tmux session ${tmuxSessionName} after orchestrator launch`);
      }
    }

    // Update agent states from pending to active now that orchestrator is ready
    // The agents were already pre-initialized in launchAgentsByMode()
    for (let i = 0; i < config.agentCount; i++) {
      const existingAgent = state.agents.get(i);
      if (existingAgent) {
        existingAgent.status = 'active';  // Update status from 'pending' to 'active'
        existingAgent.lastActivity = new Date();
        logger.debug(LogCategory.FARM, `Updated agent ${i} (${existingAgent.name}) status to active`);
      } else {
        // Fallback if somehow agent wasn't pre-initialized (shouldn't happen)
        logger.warn(LogCategory.FARM, `Agent ${i} not found in state, creating now`);
        const agentState: AgentState = {
          id: i,
          name: agentNames[i] || `Agent ${i + 1}`,
          paneId: `${state.sessionName}:${state.windowName}.${i}`,
          status: 'active',
          lastActivity: new Date()
        };
        state.agents.set(i, agentState);
      }
    }

    logger.info(LogCategory.FARM,
      `Updated ${config.agentCount} XenoSync agents to active status for ${config.mode} farm ${config.farmId}`);
  }

  /**
   * Launch standard agents (non-XenoSync)
   */
  private async launchStandardAgents(config: FarmLaunchConfig, state: LaunchState): Promise<void> {
    // Agents were already pre-initialized in launchAgentsByMode()
    // Just update their status to starting/active
    for (let i = 0; i < config.agentCount; i++) {
      const existingAgent = state.agents.get(i);
      if (existingAgent) {
        existingAgent.status = 'starting';
        existingAgent.lastActivity = new Date();
        logger.debug(LogCategory.FARM, `Updated agent ${i} (${existingAgent.name}) status to starting`);
      } else {
        // This shouldn't happen as agents are pre-initialized, but log a warning
        logger.warn(LogCategory.FARM, `Agent ${i} not found in state during standard launch`);
      }
    }

    // The Python orchestrator handles the actual agent launching
    // We just need to track their state here

    logger.info(LogCategory.FARM,
      `Updated ${config.agentCount} standard agents status for ${config.mode} farm ${config.farmId}`);
  }

  /**
   * Build agent launch command
   */
  private buildAgentLaunchCommand(config: FarmLaunchConfig, agentId: number, isXenoSync: boolean): string {
    // Debug logging
    logger.info(LogCategory.FARM, `buildAgentLaunchCommand - config.farmId: ${config.farmId}, agentId: ${agentId}, isXenoSync: ${isXenoSync}`);

    if (!config.farmId) {
      logger.error(LogCategory.FARM, `farmId is missing in config:`, config);
      throw new Error('farmId is required to build agent launch command');
    }

    const workspace = pathConfig.getFarmWorkspacePath(config.farmId, false);

    if (isXenoSync) {
      // XenoSync handles this internally
      return '';
    }

    // Get the active AI provider
    const provider = aiProviderManager.getDefaultProvider();

    // Build command based on provider
    switch (provider) {
      case AIProvider.CLAUDE:
        return `cd ${workspace} && NODE_OPTIONS='--max-old-space-size=4096' claude --dangerously-skip-permissions`;
      case AIProvider.OPENAI:
        return `cd ${workspace} && echo "OpenAI agent launching..."`;
      case AIProvider.GPT_OSS:
        return `cd ${workspace} && echo "GPT-OSS agent launching..."`;
      case AIProvider.LLAMA:
        return `cd ${workspace} && echo "Llama agent launching..."`;
      default:
        // Fallback to Claude
        return `cd ${workspace} && NODE_OPTIONS='--max-old-space-size=4096' claude --dangerously-skip-permissions`;
    }
  }

  /**
   * Launch agent with two-stage approach: init then prompt
   */
  private async launchAgentWithPrompt(
    sessionName: string,
    windowName: string,
    paneIndex: number,
    config: FarmLaunchConfig
  ): Promise<void> {
    // Get agent from state
    const agentState = this.activeFarms.get(config.farmId)?.agents.get(paneIndex);
    const agentName = agentState?.name || `Agent ${paneIndex + 1}`;

    // Use unified AI engine launcher for all providers
    try {
      const farmProviderForLaunch = (config.provider || aiProviderManager.getDefaultProvider()) as FarmProvider;
      await unifiedAIEngineLauncher.launchAgent({
        farmId: config.farmId,
        agentId: `${config.farmId}-agent-${paneIndex}`,
        agentIndex: paneIndex,
        agentName: agentName,
        prompt: config.prompt,
        sessionName: sessionName,
        workspacePath: pathConfig.getFarmWorkspacePath(config.farmId, false),
        provider: mapToAiProvider(farmProviderForLaunch),
        timeout: config.timeout
      });

      logger.info(LogCategory.FARM, `Launched agent ${agentName} with unified AI engine launcher`);
    } catch (error) {
      logger.error(LogCategory.FARM, `Failed to launch agent ${agentName}:`, error);

      // Fallback to original method for Claude
      if (aiProviderManager.getDefaultProvider() === AIProvider.CLAUDE) {
        // Stage 1: Launch Claude
        const launchCommand = this.buildAgentLaunchCommand(config, paneIndex, false);
        await this.executeInPane(sessionName, windowName, paneIndex, launchCommand);

        // Wait for Claude to initialize
        await new Promise(resolve => setTimeout(resolve, 4000));

        // Stage 2: Send the prompt line by line
        await this.sendPromptToPane(sessionName, windowName, paneIndex, config.prompt);

        // Wait for prompt to be processed
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  /**
   * Send prompt to pane line by line (two-stage launch)
   */
  private async sendPromptToPane(
    sessionName: string,
    windowName: string,
    paneIndex: number,
    prompt: string
  ): Promise<void> {
    const paneTarget = `${sessionName}:${windowName}.${paneIndex}`;
    const lines = prompt.split('\n');

    for (const line of lines) {
      if (line.trim()) {
        // Use literal mode to avoid shell interpretation
        await new Promise<void>((resolve, reject) => {
          const proc = spawn('tmux', ['send-keys', '-t', paneTarget, '-l', line], {
            env: { ...process.env, TMUX_TMPDIR: tmuxTmpDir }
          });

          proc.on('error', reject);
          proc.on('exit', (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`tmux send-keys failed with code ${code}`));
            }
          });
        });

        // Send Enter after each line
        await new Promise<void>((resolve, reject) => {
          const proc = spawn('tmux', ['send-keys', '-t', paneTarget, 'Enter'], {
            env: { ...process.env, TMUX_TMPDIR: tmuxTmpDir }
          });

          proc.on('error', reject);
          proc.on('exit', (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`tmux send-keys Enter failed with code ${code}`));
            }
          });
        });

        // Small delay between lines
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  }

  /**
   * Execute command in tmux pane
   */
  private async executeInPane(
    sessionName: string,
    windowName: string,
    paneIndex: number,
    command: string
  ): Promise<void> {
    if (!command) return;

    const paneTarget = `${sessionName}:${windowName}.${paneIndex}`;

    return new Promise((resolve, reject) => {
      const proc = spawn('tmux', ['send-keys', '-t', paneTarget, command, 'Enter'], {
        env: { ...process.env, TMUX_TMPDIR: tmuxTmpDir }
      });

      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`tmux send-keys failed with code ${code}`));
        }
      });
    });
  }

  /**
   * Setup terminal streaming for all agents
   */
  private async setupTerminalStreaming(config: FarmLaunchConfig, state: LaunchState): Promise<void> {
    logger.info(LogCategory.TERMINAL,
      `Setting up enhanced real-time terminal streaming for farm ${config.farmId} with ${config.agentCount} agents`);

    // Use BOTH terminal services for maximum reliability:
    // 1. Enhanced service for structured messages and yield detection
    // 2. Unified service for backward compatibility

    // Register farm session with unified service (backward compatibility)
    unifiedTerminalStreamService.registerFarmSession(
      config.farmId,
      state.sessionName,
      config.agentCount,
      state.windowName
    );

    // Register agents with activity heartbeat service for real-time status tracking
    const agentNames = Array.from(state.agents.values()).map(a => a.name);
    for (let i = 0; i < config.agentCount; i++) {
      agentActivityHeartbeatService.registerAgent(
        config.farmId,
        i,
        `agent-${i}`,
        agentNames[i] || `Agent ${i + 1}`
      );
    }

    // Register farm with yield detection service
    yieldDetectionService.registerFarm(
      config.farmId,
      config.prompt,
      agentNames
    );

    logger.info(LogCategory.AGENT,
      `Registered ${config.agentCount} agents with activity heartbeat and yield detection services`);

    // CRITICAL FIX: Track terminal service initialization for coordination
    let unifiedStreamSuccess = false;
    let enhancedStreamsStarted = 0;
    let enhancedStreamsFailed = 0;

    // Start unified terminal streaming (existing service)
    try {
      await unifiedTerminalStreamService.startFarmStreaming(
        config.farmId,
        state.sessionName,
        config.agentCount
      );
      unifiedStreamSuccess = true;
      logger.info(LogCategory.TERMINAL,
        `Unified terminal streaming started for farm ${config.farmId}`);
    } catch (unifiedError) {
      logger.error(LogCategory.TERMINAL,
        `Failed to start unified terminal streaming:`, unifiedError);
      // Continue anyway - enhanced service may still work
    }

    // Start enhanced terminal streaming for each agent (new service)
    const farmProvider = (config.provider || aiProviderManager.getDefaultProvider()) as FarmProvider;
    const aiProvider = mapToAiProvider(farmProvider);
    const workspace = pathConfig.getFarmWorkspacePath(config.farmId, false);

    for (let i = 0; i < config.agentCount; i++) {
      const agent = state.agents.get(i);
      if (agent) {
        try {
          await enhancedTerminalService.startStreaming({
            farmId: config.farmId,
            agentId: `${config.farmId}-agent-${i}`,
            agentIndex: i,
            agentName: agent.name,
            sessionName: state.sessionName,
            aiProvider: aiProvider,
            outputPath: pathConfig.getTerminalLogPath(config.farmId, i),
            workspacePath: workspace
          });

          enhancedStreamsStarted++;
          logger.info(LogCategory.TERMINAL,
            `Started enhanced streaming for ${agent.name} with ${farmProvider} provider`);
        } catch (error) {
          enhancedStreamsFailed++;
          logger.warn(LogCategory.TERMINAL,
            `Failed to start enhanced streaming for ${agent.name}:`, error);
        }
      }
    }

    // Log coordination summary
    const totalAgents = config.agentCount;
    const streamingHealth = enhancedStreamsStarted / totalAgents;
    logger.info(LogCategory.TERMINAL,
      `Terminal streaming coordination: unified=${unifiedStreamSuccess ? 'OK' : 'FAILED'}, ` +
      `enhanced=${enhancedStreamsStarted}/${totalAgents} started, ${enhancedStreamsFailed} failed ` +
      `(health: ${(streamingHealth * 100).toFixed(0)}%)`);

    // Emit event if streaming is degraded (less than 80% success)
    if (streamingHealth < 0.8 || !unifiedStreamSuccess) {
      const degradedPayload = {
        farmId: config.farmId,
        unifiedStreamSuccess,
        enhancedStreamsStarted,
        enhancedStreamsFailed,
        totalAgents,
        streamingHealth,
        timestamp: new Date()
      };
      websocketManager.broadcast('farm:streaming:degraded', degradedPayload);
      logger.warn(LogCategory.TERMINAL,
        `Farm ${config.farmId} terminal streaming is degraded - some agents may not show output`);
    }

    logger.info(LogCategory.TERMINAL,
      `Real-time terminal streaming initialized for farm ${config.farmId}`);

    // CRITICAL FIX: Properly verify pipe-pane is working before broadcasting ready
    // Wait longer and verify terminal log files are being created/written
    const verificationStartTime = Date.now();
    const maxVerificationWaitMs = 5000; // 5 seconds max wait
    const checkIntervalMs = 500;
    let allTerminalLogsReady = false;

    while (Date.now() - verificationStartTime < maxVerificationWaitMs) {
      try {
        // Check if terminal log files exist for all agents
        let readyCount = 0;
        for (let i = 0; i < config.agentCount; i++) {
          const logPath = pathConfig.getTerminalLogPath(config.farmId, i);
          try {
            const stats = await fs.stat(logPath);
            // Consider ready if file exists (content may come later from agents)
            if (stats.isFile()) {
              readyCount++;
            }
          } catch {
            // File doesn't exist yet
          }
        }

        if (readyCount >= config.agentCount) {
          allTerminalLogsReady = true;
          logger.info(LogCategory.TERMINAL,
            `All ${config.agentCount} terminal log files verified for farm ${config.farmId}`);
          break;
        }

        logger.debug(LogCategory.TERMINAL,
          `Waiting for terminal logs: ${readyCount}/${config.agentCount} ready`);
        await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
      } catch (error) {
        logger.warn(LogCategory.TERMINAL,
          `Error verifying terminal logs:`, error);
        await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
      }
    }

    if (!allTerminalLogsReady) {
      logger.warn(LogCategory.TERMINAL,
        `Terminal log verification incomplete after ${maxVerificationWaitMs}ms - proceeding anyway`);
    }

    // Refresh harvest session cache with confirmed pane count so UI polling succeeds
    try {
      await harvestSessionCache.sessionExists(state.sessionName);
    } catch (error) {
      logger.warn(LogCategory.HARVEST,
        `Failed to refresh harvest session cache for ${state.sessionName}:`, error);
    }

    const streamingPayload = {
      farmId: config.farmId,
      sessionName: state.sessionName,
      agentCount: state.agents.size,
      windowName: state.windowName,
      status: 'ready',
      terminalLogsVerified: allTerminalLogsReady,
      timestamp: new Date()
    };

    // Notify clients that tmux session is ready
    websocketManager.broadcast('farm:tmux:ready', streamingPayload);
    websocketManager.broadcastToFarm(config.farmId, 'farm:tmux:ready', streamingPayload);
    websocketManager.broadcast('session:verified', streamingPayload);

    logger.info(LogCategory.FARM,
      `Terminal streaming setup complete for ${state.agents.size} agents in ${config.mode} farm ${config.farmId}`);
  }

  /**
   * Schedule farm shutdown based on timeout
   */
  private async scheduleShutdown(config: FarmLaunchConfig, harvestId?: string): Promise<void> {
    // CRITICAL FIX: config.timeout is in SECONDS (as per interface definition)
    // We need to convert to milliseconds for shutdownCoordinator
    let timeoutMs: number;

    if (!config.timeout || config.timeout <= 0) {
      logger.warn(LogCategory.FARM,
        `No valid timeout provided for ${config.mode}, using default`);

      // Use mode-specific defaults in SECONDS, then convert to ms
      const DEFAULT_FARM_TIMEOUT_S = 3600; // 1 hour in seconds
      const DEFAULT_GOWILD_TIMEOUT_S = 1800; // 30 minutes in seconds
      const DEFAULT_QUICKTASK_TIMEOUT_S = 300; // 5 minutes in seconds

      let timeoutSeconds: number;
      if (config.mode === FarmMode.QUICK_TASK) {
        timeoutSeconds = DEFAULT_QUICKTASK_TIMEOUT_S;
      } else if (config.mode === FarmMode.GO_WILD) {
        timeoutSeconds = DEFAULT_GOWILD_TIMEOUT_S;
      } else {
        timeoutSeconds = DEFAULT_FARM_TIMEOUT_S;
      }

      timeoutMs = timeoutSeconds * 1000; // Convert seconds to milliseconds
    } else {
      // config.timeout is in SECONDS - convert to milliseconds
      timeoutMs = config.timeout * 1000;
    }

    logger.info(LogCategory.FARM,
      `Scheduling ${config.mode} shutdown for ${config.farmId} at ${timeoutMs}ms (${Math.round(timeoutMs / 1000)}s = ${Math.round(timeoutMs / 60000)} minutes)`);

    await shutdownCoordinator.scheduleShutdown({
      mode: 'farm',
      farmId: config.farmId,
      userId: config.userId,
      reason: 'timeout',
      timeout: timeoutMs,  // Always in milliseconds
      ...(harvestId ? { harvestId } : {})
    });
  }

  /**
   * Enhance prompt for Go Wild mode
   */
  private enhancePromptForGoWild(prompt: string, creativityLevel?: number): string {
    const level = creativityLevel || 80;

    return `[GO WILD MODE - Creativity Level ${level}%]

You have been given creative freedom to explore and innovate beyond the initial request.
Feel free to:
- Add unexpected but delightful features
- Explore creative technical solutions
- Implement bonus functionality that enhances the user experience
- Think outside the box while maintaining code quality

Original request: ${prompt}

Remember: Be bold, be creative, but always maintain professional code quality and security standards.`;
  }

  /**
   * Update farm status in database
   */
  private async updateFarmDatabase(farmId: string, status: string, sessionName: string): Promise<void> {
    try {
      await db.query(
        `UPDATE farms
         SET status = $1, session_name = $2, updated_at = NOW()
         WHERE id = $3`,
        [status, sessionName, farmId]
      );

      // Emit WebSocket event
      websocketManager.broadcastToFarm(farmId, 'farm:status', {
        farmId,
        status,
        sessionName
      });
    } catch (error) {
      logger.error(LogCategory.FARM, `Failed to update farm database:`, error);
    }
  }

  /**
   * Broadcast agent registration to all clients with guaranteed delivery
   * This ensures the frontend updates immediately with agent names and states
   */
  private async broadcastAgentRegistration(farmId: string, state: LaunchState): Promise<void> {
    const agents = Array.from(state.agents.values()).map(agent => ({
      id: agent.id,
      name: agent.name,
      paneId: agent.paneId,
      status: agent.status,
      lastActivity: agent.lastActivity
    }));

    const eventData = {
      farmId,
      sessionName: state.sessionName,
      windowName: state.windowName,
      agents,
      agentCount: agents.length,
      timestamp: new Date()
    };

    // CRITICAL: Use broadcastWithAck for guaranteed delivery
    // This prevents the race condition where frontend misses agent registration
    try {
      const result = await websocketManager.broadcastWithAck(
        'farm:agents:registered',
        eventData,
        {
          farmId,
          retryAttempts: 3,
          timeout: 5000
        }
      );

      if (result.success) {
        logger.info(LogCategory.FARM,
          `Agent registration delivered to ${result.delivered} clients for farm ${farmId}: ${agents.length} agents`);
        logger.debug(LogCategory.FARM,
          `Agent names: ${agents.map(a => a.name).join(', ')}`);
      } else {
        logger.warn(LogCategory.FARM,
          `Agent registration partial delivery for farm ${farmId}: ${result.delivered} delivered, ${result.failed} failed`);
      }

      // Also send legacy compatibility event (without ACK since it's optional)
      websocketManager.broadcastToFarm(farmId, 'agents:registered', eventData);

    } catch (error) {
      logger.error(LogCategory.FARM,
        `Failed to broadcast agent registration for farm ${farmId}:`, error);
      // Don't throw - allow farm launch to continue even if broadcast fails
    }
  }

  /**
   * Cleanup failed launch
   */
  private async cleanupFailedLaunch(farmId: string): Promise<void> {
    const state = this.activeFarms.get(farmId);
    if (!state) return;

    // Cleanup orchestrator process and event listeners (CRITICAL: prevent memory leaks)
    this.cleanupOrchestratorProcess(farmId);

    // Stop health monitoring
    await farmHealthMonitor.stopMonitoring(farmId);
    orchestratorHealthMonitor.stopMonitoring(farmId);

    // Stop monitoring and terminal streams
    await xenoSyncMonitor.stopMonitoring(farmId);

    // Unregister agents from activity heartbeat service
    for (let i = 0; i < (state.agentCount || 0); i++) {
      agentActivityHeartbeatService.unregisterAgent(farmId, i);
    }

    // Stop unified terminal streaming
    await unifiedTerminalStreamService.stopFarmStreaming(farmId);

    // Kill tmux session
    if (state.sessionName) {
      await this.tmuxManager.killSession(state.sessionName).catch(() => {});
      try {
        await harvestSessionCache.invalidateSession(state.sessionName);
      } catch (error) {
        logger.warn(LogCategory.HARVEST, `Failed to invalidate harvest cache for ${state.sessionName}:`, error);
      }
    }

    // FIX: Cleanup workspace on failed launch to prevent orphaned directories
    try {
      await workspaceManager.cleanupWorkspace(farmId, false); // Don't archive failed workspaces
      logger.info(LogCategory.FARM, `Cleaned up workspace for failed farm ${farmId}`);
    } catch (workspaceError) {
      logger.warn(LogCategory.FARM, `Failed to cleanup workspace for farm ${farmId}:`, workspaceError);
      // Continue cleanup even if workspace cleanup fails
    }

    // Update database
    await this.updateFarmDatabase(farmId, 'failed', '');

    // Remove from active farms
    this.activeFarms.delete(farmId);

    logger.info(LogCategory.FARM, `Cleaned up failed launch for farm ${farmId}`);
  }

  /**
   * Cleanup orchestrator process and remove all event listeners
   * CRITICAL: Prevents memory leaks from accumulated event listeners
   */
  private cleanupOrchestratorProcess(farmId: string): void {
    const process = this.orchestratorProcesses.get(farmId);
    if (!process) return;

    try {
      // Remove all event listeners to prevent memory leaks
      process.removeAllListeners();
      if (process.stdout) process.stdout.removeAllListeners();
      if (process.stderr) process.stderr.removeAllListeners();

      // FIX: Clear any existing force-kill timeout to prevent duplicates
      const existingTimeout = this.forceKillTimeouts.get(farmId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        this.forceKillTimeouts.delete(farmId);
      }

      // Kill process if still running
      if (!process.killed) {
        process.kill('SIGTERM');
        // FIX: Track the force kill timeout to prevent duplicates and memory leaks
        const forceKillTimeout = setTimeout(() => {
          this.forceKillTimeouts.delete(farmId);
          if (!process.killed) {
            logger.warn(LogCategory.FARM, `Force killing orchestrator process for farm ${farmId}`);
            try {
              process.kill('SIGKILL');
            } catch (killError) {
              logger.debug(LogCategory.FARM, `SIGKILL failed (process may already be dead):`, killError);
            }
          }
        }, 5000);
        this.forceKillTimeouts.set(farmId, forceKillTimeout);
      }

      // Remove from tracking map
      this.orchestratorProcesses.delete(farmId);

      logger.debug(LogCategory.FARM, `Cleaned up orchestrator process for farm ${farmId}`);
    } catch (error) {
      logger.error(LogCategory.FARM, `Error cleaning up orchestrator process for farm ${farmId}:`, error);
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Guard against circular import issues - farmHealthMonitor may not be available yet
    if (!farmHealthMonitor) {
      logger.debug(LogCategory.FARM, 'FarmHealthMonitor not available, skipping event handler setup');
      return;
    }

    // Listen for health monitor recovery events
    farmHealthMonitor.on('orchestrator-restart-needed', async ({ farmId }) => {
      logger.warn(LogCategory.FARM, `Orchestrator restart requested for farm ${farmId}`);
      const state = this.activeFarms.get(farmId);
      if (state) {
        // Attempt to restart the orchestrator
        try {
          await this.restartOrchestrator(farmId, state);
        } catch (error) {
          logger.error(LogCategory.FARM, `Failed to restart orchestrator for farm ${farmId}:`, error);
        }
      }
    });

    farmHealthMonitor.on('health-update', ({ farmId, health }) => {
      if (health.overall === 'failed') {
        logger.error(LogCategory.FARM, `Farm ${farmId} health critical - ${health.components.filter(c => c.status === 'failed').map(c => c.name).join(', ')} failed`);
      } else if (health.overall === 'degraded') {
        logger.warn(LogCategory.FARM, `Farm ${farmId} health degraded - ${health.components.filter(c => c.status === 'degraded').map(c => c.name).join(', ')} degraded`);
      }
    });

    logger.info(LogCategory.SYSTEM, 'Health monitoring event handlers configured');
  }

  /**
   * Restart orchestrator for a farm
   * FIX: Use same argument format as original launch to prevent orchestrator failures
   */
  private async restartOrchestrator(farmId: string, state: LaunchState): Promise<void> {
    logger.info(LogCategory.FARM, `Restarting orchestrator for farm ${farmId}`);

    // Re-launch the orchestrator with the same configuration
    // CRITICAL FIX: Use getFarmWorkspacePath to ensure consistent path with 'active' subdirectory
    const workspacePath = pathConfig.getFarmWorkspacePath(farmId, false);
    const maibarnRoot = pathConfig.getMaibarnRoot();

    // Check for prompt.yaml first (preferred), then prompt.txt
    let promptPath = path.join(workspacePath, 'prompt.yaml');
    try {
      await fs.access(promptPath);
    } catch {
      promptPath = path.join(workspacePath, 'prompt.txt');
      try {
        await fs.access(promptPath);
      } catch {
        throw new Error('Prompt file not found for orchestrator restart');
      }
    }

    // FIXED: Use aiProviderManager to get properly validated/decrypted API keys
    const resolvedProvider = resolveProvider(state.provider);
    const providerEnum = mapToAiProvider(resolvedProvider);
    const providerEnv = aiProviderManager.getProviderEnvironment(providerEnum);

    // Launch orchestrator again with SAME ARGUMENTS as original launch
    const orchestratorPath = path.join(process.cwd(), 'scripts/python/orchestrator.py');
    const workspaceRoot = path.join(maibarnRoot, 'workspaces', 'active');

    // FIX: Use same argument names as original launch (lines 1521-1535)
    const orchestratorArgs = [
      orchestratorPath,
      '--prompt-file', promptPath,  // Use --prompt-file flag (not positional)
      '--num-agents', String(state.agentCount),  // Use --num-agents (not --agents)
      '--farm-id', farmId,
      '--session', state.sessionName,  // Use --session (not --session-name)
      '--workspace-dir', workspaceRoot,  // Use --workspace-dir (not --workspace)
      '--coordination-dir', path.join(maibarnRoot, 'coordination'),  // CRITICAL: Required for status file
      '--provider', mapToOrchestratorProvider(resolvedProvider),
      '--debug',
      '--no-kill-on-exit',  // CRITICAL: Prevent orchestrator from killing tmux sessions on exit
      '--fast-launch'  // PERFORMANCE: Skip checks and minimize delays
    ];

    if (state.timeout) {
      orchestratorArgs.push('--max-runtime', String(state.timeout));
    }

    logger.info(LogCategory.FARM, `Restarting orchestrator: python3 ${orchestratorArgs.join(' ')}`);

    const orchestratorProcess = spawn('python3', orchestratorArgs, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...providerEnv,  // Use validated provider environment from aiProviderManager
        TMUX_TMPDIR: tmuxTmpDir,
        MAIBARN_ROOT: maibarnRoot,
        MAIFARM_WORKSPACE: workspaceRoot,
        PYTHONUNBUFFERED: '1'
      }
    });

    // Update metadata with new PID
    if (state.metadata) {
      state.metadata.orchestratorPID = orchestratorProcess.pid;
    }

    // Track the process for cleanup
    this.orchestratorProcesses.set(farmId, orchestratorProcess);

    logger.info(LogCategory.FARM, `Orchestrator restarted with PID ${orchestratorProcess.pid} for farm ${farmId}`);
  }

  /**
   * Cleanup completed farm
   */
  private async cleanupCompletedFarm(farmId: string): Promise<void> {
    const state = this.activeFarms.get(farmId);
    if (!state) return;

    // Stop health monitoring
    await farmHealthMonitor.stopMonitoring(farmId);
    orchestratorHealthMonitor.stopMonitoring(farmId);

    // Stop monitoring and terminal streams
    await xenoSyncMonitor.stopMonitoring(farmId);

    // Unregister agents from activity heartbeat service
    for (let i = 0; i < (state.agentCount || 0); i++) {
      agentActivityHeartbeatService.unregisterAgent(farmId, i);
    }

    // Stop unified terminal streaming
    await unifiedTerminalStreamService.stopFarmStreaming(farmId);

    // Remove from active farms (keep tmux session for debugging)
    this.activeFarms.delete(farmId);

    logger.info(LogCategory.FARM, `Cleaned up completed ${state.mode} farm ${farmId}`);
  }

  /**
   * Get farm status
   */
  getFarmStatus(farmId: string): LaunchState | undefined {
    return this.activeFarms.get(farmId);
  }

  /**
   * Get all active farms
   */
  getActiveFarms(): Map<string, LaunchState> {
    return new Map(this.activeFarms);
  }

  /**
   * Stop a farm manually
   */
  async stopFarm(farmId: string, reason: string = 'manual'): Promise<void> {
    const state = this.activeFarms.get(farmId);
    if (!state) {
      throw new Error(`Farm ${farmId} not found`);
    }

    logger.info(LogCategory.FARM, `Stopping ${state.mode} farm ${farmId}: ${reason}`);

    // Trigger shutdown
    await shutdownCoordinator.triggerShutdown(farmId);

    // Update status
    state.status = 'completed';
    await this.updateFarmDatabase(farmId, 'completed', state.sessionName);

    // Cleanup
    await this.cleanupCompletedFarm(farmId);
  }

  /**
   * Generate unique agent names based on mode
   * Returns simple string names, NOT JSON objects
   */
  private generateAgentNames(mode: string, count: number): string[] {
    const farmAgentNames = [
      'Bessie the Cow',
      'Cluck the Chicken',
      'Wilbur the Pig',
      'Charlotte the Spider',
      'Babe the Sheep',
      'Donald the Duck',
      'Henrietta the Hen',
      'Ferdinand the Bull',
      'Peggy the Goat'
    ];

    if (mode === FarmMode.GO_WILD) {
      // For Go Wild mode, use more creative names
      return ['Explorer Alpha', 'Innovator Beta', 'Creator Gamma', 'Builder Delta', 'Architect Epsilon']
        .slice(0, count);
    }

    // For harvest and other modes, use farm-themed names
    return farmAgentNames.slice(0, count);
  }

  /**
   * Get agent role based on mode and index
   */
  private getAgentRole(mode: string, index: number): string {
    const roles: Record<string, string[]> = {
      [FarmMode.HARVEST]: ['Lead Coordinator', 'Technical Specialist', 'Quality Analyst', 'Documentation Expert', 'Integration Specialist'],
      [FarmMode.GO_WILD]: ['Exploration Lead', 'Innovation Specialist', 'Creative Designer', 'System Architect', 'Implementation Expert'],
      [FarmMode.QUICK_TASK]: ['Quick Executor']
    };

    const modeRoles = roles[mode] || roles[FarmMode.HARVEST];
    return modeRoles[index % modeRoles.length];
  }
}

export const unifiedFarmLaunchOrchestrator = UnifiedFarmLaunchOrchestrator.getInstance();
