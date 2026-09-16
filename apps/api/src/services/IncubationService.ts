/**
 * Incubation Service
 *
 * Provides optional automatic evolution of farm outputs through a 5-stage process:
 * 1. Contextual Grounding
 * 2. Gap & Potential Scan
 * 3. Evolutionary Leap
 * 4. Validation Simulation
 * 5. Deliverable Format
 *
 * Features:
 * - Optional auto-incubation after harvest
 * - User-guided evolution with context input
 * - Stop/Pause/Play controls
 * - Lineage tracking across generations
 * - Progressive farm creation for continuous enhancement
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/connection';
import { logger, LogCategory } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { harvestService, HarvestData, HarvestArtifact } from './unified/harvestService';
import { barnService } from './unified/barnService';
import { pathConfig } from '../config/paths';
import { TmuxManager } from '../utils/tmuxManager';
import type {
  IncubationSession,
  IncubationStatus,
  IncubationControlState,
  IncubationStage,
  IncubationLog,
  NextSteps,
  IncubationLineage,
  IncubationStats,
  IncubationAncestor,
  StartIncubationInput,
  CreateIncubationFarmInput,
  IncubationProgressEvent
} from '../types/incubation';
import type { Farm } from '../types/farm';

const INCUBATION_STAGES = [
  'Contextual Grounding',
  'Gap & Potential Scan',
  'Evolutionary Leap',
  'Validation Simulation',
  'Deliverable Format'
];

class IncubationService extends EventEmitter {
  private static instance: IncubationService;
  private tmuxManager: TmuxManager;
  private activeSessions = new Map<string, IncubationSession>();
  private monitoringIntervals = new Map<string, NodeJS.Timeout>();
  // RACE CONDITION FIX: Track sessions that are currently completing to prevent duplicate completions
  private completionInProgress = new Set<string>();

  private constructor() {
    super();
    this.tmuxManager = new TmuxManager();

    // Register graceful shutdown handler to clean up monitoring intervals
    this.registerShutdownHandler();

    logger.info(LogCategory.SYSTEM, 'IncubationService initialized');
  }

  /**
   * Register graceful shutdown handler to clean up all monitoring intervals
   * Prevents resource leaks on process restart
   */
  private registerShutdownHandler(): void {
    const cleanup = () => {
      logger.info(LogCategory.SYSTEM, `Cleaning up ${this.monitoringIntervals.size} incubation monitoring intervals...`);

      for (const [sessionId, interval] of this.monitoringIntervals.entries()) {
        clearInterval(interval);
        logger.debug(LogCategory.SYSTEM, `Cleared monitoring interval for session ${sessionId}`);
      }

      this.monitoringIntervals.clear();
      this.completionInProgress.clear();
      this.activeSessions.clear();

      logger.info(LogCategory.SYSTEM, 'Incubation service cleanup complete');
    };

    // Handle various termination signals
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
    process.on('beforeExit', cleanup);
  }

  public static getInstance(): IncubationService {
    if (!IncubationService.instance) {
      IncubationService.instance = new IncubationService();
    }
    return IncubationService.instance;
  }

  /**
   * Maybe start incubation if farm has auto-incubate enabled
   * Called automatically after harvest completion
   */
  async maybeStartIncubation(farmId: string, harvestId: string): Promise<string | null> {
    try {
      const farm = await this.getFarm(farmId);

      if (!farm.autoIncubate) {
        logger.info(LogCategory.FARM, `Auto-incubate disabled for farm ${farmId}, skipping`);
        return null;
      }

      logger.info(LogCategory.FARM, `Auto-incubate enabled for farm ${farmId}, starting incubation`);

      return await this.startIncubation({
        farmId,
        harvestId,
        userId: farm.createdBy
      });
    } catch (error) {
      logger.error(LogCategory.FARM, `Failed to check auto-incubate for farm ${farmId}:`, error);
      return null;
    }
  }

  /**
   * Start incubation session (auto or manual)
   */
  async startIncubation(input: StartIncubationInput): Promise<string> {
    const { farmId, harvestId, userContext, userId } = input;

    logger.info(LogCategory.FARM, `Starting incubation for farm ${farmId}, harvest ${harvestId}`);

    try {
      // Get harvest output
      const harvest = await harvestService.getHarvestById(harvestId);
      if (!harvest) {
        throw new Error(`Harvest ${harvestId} not found`);
      }

      const originalOutput = await this.extractHarvestOutput(harvest);

      // Get farm details
      const farm = await this.getFarm(farmId);

      // Create incubation session
      const sessionId = await this.createIncubationSession({
        farmId,
        harvestId,
        originalOutput,
        userContext,
        userId,
        farmVersion: farm.incubationVersion || 1
      });

      // Build incubation prompt
      const prompt = this.buildIncubationPrompt({
        originalOutput,
        version: (farm.incubationVersion || 1) + 1,
        userContext,
        farmName: farm.name,
        farmId
      });

      // Launch incubation agent
      await this.launchIncubationAgent(sessionId, prompt);

      // Start monitoring
      this.monitorIncubation(sessionId);

      // Broadcast start event
      websocketManager.broadcast('incubation:started', {
        farmId,
        sessionId,
        harvestId,
        version: (farm.incubationVersion || 1) + 1,
        trigger: userContext ? 'manual' : 'auto',
        timestamp: new Date()
      });

      logger.info(LogCategory.FARM, `Incubation session ${sessionId} started for farm ${farmId}`);

      return sessionId;
    } catch (error) {
      logger.error(LogCategory.FARM, `Failed to start incubation for farm ${farmId}:`, error);
      throw error;
    }
  }

  /**
   * Extract harvest output for incubation
   */
  private async extractHarvestOutput(harvest: any): Promise<any> {
    // Extract all collected artifacts
    const output: any = {
      files: harvest.artifacts || [],
      metadata: harvest.metadata || {},
      summary: harvest.yieldValue || 'No summary available',
      timestamp: harvest.completedAt || new Date()
    };

    // Include harvest directory contents if available
    if (harvest.id) {
      const harvestPath = pathConfig.getPath('HARVEST_DIR', harvest.farmId, harvest.id);
      // TODO: Read harvest directory contents
      output.harvestPath = harvestPath;
    }

    return output;
  }

  /**
   * Create incubation session record
   */
  private async createIncubationSession(params: {
    farmId: string;
    harvestId: string;
    originalOutput: any;
    userContext?: string;
    userId?: string;
    farmVersion: number;
  }): Promise<string> {
    const sessionId = uuidv4();

    const query = `
      INSERT INTO incubation_sessions (
        id, farm_id, harvest_id, status, current_stage, total_stages,
        control_state, original_output, user_context, user_id, metadata,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING id
    `;

    const values = [
      sessionId,
      params.farmId,
      params.harvestId,
      'pending',
      1,
      5,
      'running',
      JSON.stringify(params.originalOutput),
      params.userContext || null,
      params.userId || null,
      JSON.stringify({ farmVersion: params.farmVersion })
    ];

    await db.query(query, values);

    logger.info(LogCategory.FARM, `Created incubation session ${sessionId}`);

    return sessionId;
  }

  /**
   * Build incubation prompt with all context
   */
  private buildIncubationPrompt(params: {
    originalOutput: any;
    version: number;
    userContext?: string;
    farmName: string;
    farmId: string;
  }): string {
    const { originalOutput, version, userContext, farmName, farmId } = params;

    const userGuidance = userContext
      ? `\n### 🎯 USER GUIDANCE\n\nThe user has provided specific guidance for this incubation:\n\n"${userContext}"\n\nEnsure your evolution addresses this guidance.\n`
      : '';

    return `# 🌱 INCUBATION CYCLE - FARM OUTPUT EVOLUTION ENGINE

You are an **Idea Incubator Engine** within MaiFarm. Your mission is to transform this farm's output into a **prototype-ready, next-generation version**.

---

## ORIGINAL FARM OUTPUT (v${version - 1}.0)

**Farm**: ${farmName}
**Farm ID**: ${farmId}
**Version**: v${version - 1}.0

\`\`\`json
${JSON.stringify(originalOutput, null, 2)}
\`\`\`
${userGuidance}
---

## YOUR INCUBATION TASK

Execute the **5-Stage Incubation Process**:

### Stage 1: Contextual Grounding (20%)
Re-analyze the original goal, constraints, and output. Identify the **core essence** and **intended impact**.

**Output**: Write a clear analysis of what this farm was trying to achieve and what it actually produced.

---

### Stage 2: Gap & Potential Scan (40%)
Detect missing elements:
- Feasibility gaps
- Scalability blind spots
- User experience friction
- Innovation underutilization
- Technical debt or shortcuts

**Output**: List 5-10 specific gaps or opportunities for improvement.

---

### Stage 3: Evolutionary Leap (60%)
Transform into a **next-generation prototype**:
- Add **real-world integration points** (APIs, UI mockups, deployment paths)
- Inject **emergent features** (AI augmentation, personalization, analytics)
- Upgrade **fidelity** (concept → MVP → polished prototype)
- Apply **cross-domain pollination** (e.g., gamify a dashboard, add real-time collaboration)

**Output**: Provide the evolved version with all enhancements implemented.

---

### Stage 4: Validation Simulation (80%)
Run a **mental prototype test**:
- Simulate 3 user personas using it
- Stress-test edge cases
- Measure against success metrics (speed, delight, ROI)

**Output**: Document validation findings and any additional refinements.

---

### Stage 5: Deliverable Format (100%)

Provide your output in this EXACT format:

\`\`\`markdown
## 🌱 INCUBATION CYCLE COMPLETE

**Farm ID**: ${farmId}
**Farm Name**: ${farmName}
**Version**: v${version}.0
**Incubation Trigger**: ${userContext ? 'Manual (User-Guided)' : 'Auto'}

---

### v${version - 1}.0 — Original Result
[Copy the original output from above for reference]

---

### v${version}.0 — INCUBATED PROTOTYPE 🌟
[Your fully evolved version with all enhancements - this should be production-ready code, designs, or specifications]

---

### 🔬 Incubation Log
- **Elevated**: [List 3-5 major enhancements, e.g., "Added real-time sync + WebSocket infrastructure"]
- **Fixed**: [List 3-5 issues resolved, e.g., "Removed single-point failure in authentication"]
- **Innovated**: [List 2-3 innovations, e.g., "AI self-optimization loop for performance tuning"]

---

### 🚀 Next-Step Blueprint
1. **Build** → [Specific tech stack and implementation steps]
2. **Test** → [User testing script with scenarios]
3. **Launch** → [1-click deploy process or deployment checklist]

\`\`\`

---

**CRITICAL INSTRUCTIONS**:
1. Your output MUST follow this format exactly
2. Each stage must produce tangible improvements
3. The v${version}.0 output should be significantly better than v${version - 1}.0
4. Focus on practical, implementable enhancements
5. If user provided guidance, ensure you address it directly

Begin Stage 1 now.`;
  }

  /**
   * Launch incubation agent in tmux session
   */
  private async launchIncubationAgent(sessionId: string, prompt: string): Promise<void> {
    const session = await this.getIncubationSession(sessionId);
    if (!session) {
      throw new Error(`Incubation session ${sessionId} not found`);
    }

    const sessionName = `incubate-${sessionId.substring(0, 8)}`;

    try {
      // Create tmux session
      await this.tmuxManager.createSession(sessionName, {
        windowName: 'incubation',
        detached: true
      });

      // Launch Claude agent with incubation prompt
      const claudeCmd = `claude --dangerously-skip-permissions -p "${prompt.replace(/"/g, '\\"')}"`;

      await this.tmuxManager.sendCommand(sessionName, claudeCmd);

      // Update session with tmux info
      await db.query(
        `UPDATE incubation_sessions
         SET tmux_session_name = $1, status = $2, started_at = NOW(), prompt_used = $3
         WHERE id = $4`,
        [sessionName, 'incubating', prompt, sessionId]
      );

      logger.info(LogCategory.FARM, `Launched incubation agent in session ${sessionName}`);
    } catch (error) {
      logger.error(LogCategory.FARM, `Failed to launch incubation agent:`, error);
      await this.failIncubation(sessionId, `Failed to launch agent: ${error}`);
      throw error;
    }
  }

  /**
   * Monitor incubation progress with real stage detection
   * MEMORY LEAK FIX: Prevents duplicate intervals for the same session
   */
  private monitorIncubation(sessionId: string): void {
    // MEMORY LEAK FIX: Check if monitoring is already active for this session
    const existingInterval = this.monitoringIntervals.get(sessionId);
    if (existingInterval) {
      logger.warn(LogCategory.FARM, `Monitoring already active for session ${sessionId}, clearing old interval to prevent memory leak`);
      clearInterval(existingInterval);
      this.monitoringIntervals.delete(sessionId);
    }

    let lastOutputLength = 0;
    let lastDetectedStage = 1;

    const interval = setInterval(async () => {
      try {
        const session = await this.getIncubationSession(sessionId);
        if (!session) {
          clearInterval(interval);
          this.monitoringIntervals.delete(sessionId);
          return;
        }

        // Check if completed or failed
        if (session.status === 'completed' || session.status === 'failed' || session.status === 'stopped') {
          clearInterval(interval);
          this.monitoringIntervals.delete(sessionId);
          return;
        }

        // Check if paused
        if (session.controlState === 'paused') {
          return; // Skip monitoring while paused
        }

        // Read tmux output to parse stage progress
        if (session.tmuxSessionName) {
          const { stage, progress, isComplete, output, finalOutput } = await this.parseAgentOutput(
            session.tmuxSessionName,
            lastOutputLength,
            lastDetectedStage
          );

          lastOutputLength = output.length;

          // Update stage if changed
          if (stage > lastDetectedStage) {
            lastDetectedStage = stage;
            await this.updateSessionStage(sessionId, stage, progress);
          }

          // Check for completion
          if (isComplete && finalOutput) {
            await this.completeIncubation(sessionId, finalOutput);
            clearInterval(interval);
            this.monitoringIntervals.delete(sessionId);
            return;
          }

          // Check for failure indicators
          const failureMatch = output.match(/(?:error|failed|exception):\s*(.+)/i);
          if (failureMatch && output.includes('fatal')) {
            await this.failIncubation(sessionId, failureMatch[1] || 'Unknown error');
            clearInterval(interval);
            this.monitoringIntervals.delete(sessionId);
            return;
          }

          // Emit progress update with actual stage info
          this.emitProgressUpdate({
            ...session,
            currentStage: stage,
            stageProgress: this.buildStageProgress(stage)
          });
        } else {
          // No tmux session, just emit periodic updates
          this.emitProgressUpdate(session);
        }
      } catch (error) {
        logger.error(LogCategory.FARM, `Error monitoring incubation ${sessionId}:`, error);
      }
    }, 5000); // Check every 5 seconds

    this.monitoringIntervals.set(sessionId, interval);
  }

  /**
   * Parse agent output to detect stage progress
   */
  private async parseAgentOutput(
    tmuxSessionName: string,
    lastLength: number,
    currentStage: number
  ): Promise<{
    stage: number;
    progress: number;
    isComplete: boolean;
    output: string;
    finalOutput?: any;
  }> {
    try {
      // Capture tmux pane content
      const { execSync } = await import('child_process');
      const output = execSync(
        `TMUX_TMPDIR=/tmp tmux capture-pane -t ${tmuxSessionName}:0.0 -p -S -500`,
        { encoding: 'utf-8', timeout: 5000 }
      ).toString();

      // Detect stage markers in the output
      const stagePatterns = [
        { pattern: /Stage\s*1.*Contextual\s*Grounding/i, stage: 1 },
        { pattern: /Stage\s*2.*Gap.*Potential\s*Scan/i, stage: 2 },
        { pattern: /Stage\s*3.*Evolutionary\s*Leap/i, stage: 3 },
        { pattern: /Stage\s*4.*Validation\s*Simulation/i, stage: 4 },
        { pattern: /Stage\s*5.*Deliverable\s*Format/i, stage: 5 }
      ];

      let detectedStage = currentStage;

      // Find the highest stage mentioned in the output
      for (const { pattern, stage } of stagePatterns) {
        if (pattern.test(output)) {
          detectedStage = Math.max(detectedStage, stage);
        }
      }

      // Check for completion markers
      const completionPatterns = [
        /INCUBATION\s*CYCLE\s*COMPLETE/i,
        /v\d+\.0\s*—\s*INCUBATED\s*PROTOTYPE/i,
        /🌱\s*INCUBATION\s*CYCLE\s*COMPLETE/i,
        /Next-Step\s*Blueprint/i
      ];

      const isComplete = completionPatterns.some(pattern => pattern.test(output));

      // Try to extract final output if complete
      let finalOutput: any = undefined;
      if (isComplete) {
        finalOutput = this.extractFinalOutput(output);
      }

      // Calculate progress within current stage (0-100 for current stage)
      const progress = detectedStage * 20; // Each stage is 20%

      return {
        stage: detectedStage,
        progress,
        isComplete,
        output,
        finalOutput
      };
    } catch (error) {
      logger.warn(LogCategory.FARM, `Failed to parse agent output from ${tmuxSessionName}:`, error);
      return {
        stage: currentStage,
        progress: currentStage * 20,
        isComplete: false,
        output: ''
      };
    }
  }

  /**
   * Extract final output from completed incubation
   */
  private extractFinalOutput(output: string): any {
    try {
      // Extract the incubated prototype section
      const prototypeMatch = output.match(/v\d+\.0\s*—\s*INCUBATED\s*PROTOTYPE.*?(?=---|\n#{2,}|$)/is);

      // Extract incubation log
      const logMatch = output.match(/Incubation\s*Log.*?(?=---|\n#{2,}|$)/is);

      // Extract next steps
      const nextStepsMatch = output.match(/Next-Step\s*Blueprint.*?(?=---|\n#{2,}|$)/is);

      return {
        prototype: prototypeMatch?.[0] || '',
        incubationLog: this.parseIncubationLog(logMatch?.[0] || ''),
        nextSteps: this.parseNextSteps(nextStepsMatch?.[0] || ''),
        rawOutput: output.substring(Math.max(0, output.length - 5000)), // Last 5KB
        completedAt: new Date()
      };
    } catch {
      return {
        rawOutput: output.substring(Math.max(0, output.length - 5000)),
        completedAt: new Date()
      };
    }
  }

  /**
   * Parse incubation log from output
   */
  private parseIncubationLog(logText: string): any {
    const elevated = logText.match(/Elevated:\s*(.+?)(?=\n-|\n#|$)/is)?.[1]?.split(',').map(s => s.trim()) || [];
    const fixed = logText.match(/Fixed:\s*(.+?)(?=\n-|\n#|$)/is)?.[1]?.split(',').map(s => s.trim()) || [];
    const innovated = logText.match(/Innovated:\s*(.+?)(?=\n-|\n#|$)/is)?.[1]?.split(',').map(s => s.trim()) || [];

    return { elevated, fixed, innovated };
  }

  /**
   * Parse next steps from output
   */
  private parseNextSteps(nextStepsText: string): any {
    const build = nextStepsText.match(/Build.*?→\s*(.+?)(?=\n\d|\n#|$)/is)?.[1]?.trim() || '';
    const test = nextStepsText.match(/Test.*?→\s*(.+?)(?=\n\d|\n#|$)/is)?.[1]?.trim() || '';
    const launch = nextStepsText.match(/Launch.*?→\s*(.+?)(?=\n\d|\n#|$)/is)?.[1]?.trim() || '';

    return {
      build: build ? [build] : [],
      test: test ? [test] : [],
      launch: launch ? [launch] : []
    };
  }

  /**
   * Update session stage in database
   */
  private async updateSessionStage(sessionId: string, stage: number, progress: number): Promise<void> {
    await db.query(
      `UPDATE incubation_sessions
       SET current_stage = $1, metadata = jsonb_set(COALESCE(metadata, '{}'), '{progress}', $2::text::jsonb)
       WHERE id = $3`,
      [stage, progress, sessionId]
    );

    logger.info(LogCategory.FARM, `Incubation ${sessionId} progressed to stage ${stage} (${progress}%)`);
  }

  /**
   * Build stage progress array
   */
  private buildStageProgress(currentStage: number): any[] {
    return INCUBATION_STAGES.map((name, index) => ({
      number: index + 1,
      name,
      status: index + 1 < currentStage ? 'completed' :
              index + 1 === currentStage ? 'in_progress' : 'pending',
      progress: index + 1 < currentStage ? 100 :
                index + 1 === currentStage ? 50 : 0
    }));
  }

  /**
   * Emit progress update
   */
  private emitProgressUpdate(session: IncubationSession): void {
    const event: IncubationProgressEvent = {
      sessionId: session.id,
      farmId: session.farmId,
      stage: session.currentStage,
      stageName: INCUBATION_STAGES[session.currentStage - 1] || 'Unknown',
      progress: ((session.currentStage - 1) / session.totalStages) * 100,
      message: `Processing stage ${session.currentStage}/${session.totalStages}`,
      timestamp: new Date()
    };

    this.emit('incubation:progress', event);
    websocketManager.broadcast('incubation:stage-progress', event);
    websocketManager.broadcastToFarm(session.farmId, 'incubation:stage-progress', event);
  }

  /**
   * Pause incubation
   */
  async pauseIncubation(sessionId: string): Promise<void> {
    const session = await this.getIncubationSession(sessionId);
    if (!session) {
      throw new Error(`Incubation session ${sessionId} not found`);
    }

    await db.query(
      `UPDATE incubation_sessions
       SET control_state = $1, paused_at = NOW()
       WHERE id = $2`,
      ['paused', sessionId]
    );

    // Send pause signal to agent (if supported)
    if (session.tmuxSessionName) {
      await this.tmuxManager.sendCommand(session.tmuxSessionName, '\x03'); // Ctrl+C
    }

    websocketManager.broadcast('incubation:paused', {
      sessionId,
      farmId: session.farmId,
      pausedAt: new Date()
    });

    logger.info(LogCategory.FARM, `Incubation ${sessionId} paused`);
  }

  /**
   * Resume incubation
   */
  async resumeIncubation(sessionId: string): Promise<void> {
    const session = await this.getIncubationSession(sessionId);
    if (!session) {
      throw new Error(`Incubation session ${sessionId} not found`);
    }

    await db.query(
      `UPDATE incubation_sessions
       SET control_state = $1, resumed_at = NOW()
       WHERE id = $2`,
      ['running', sessionId]
    );

    // Resume monitoring
    this.monitorIncubation(sessionId);

    websocketManager.broadcast('incubation:resumed', {
      sessionId,
      farmId: session.farmId,
      resumedAt: new Date()
    });

    logger.info(LogCategory.FARM, `Incubation ${sessionId} resumed`);
  }

  /**
   * Stop incubation
   */
  async stopIncubation(sessionId: string, reason?: string): Promise<void> {
    const session = await this.getIncubationSession(sessionId);
    if (!session) {
      throw new Error(`Incubation session ${sessionId} not found`);
    }

    // Kill tmux session
    if (session.tmuxSessionName) {
      await this.tmuxManager.killSession(session.tmuxSessionName);
    }

    // Stop monitoring
    const interval = this.monitoringIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(sessionId);
    }

    await db.query(
      `UPDATE incubation_sessions
       SET control_state = $1, status = $2, stopped_at = NOW(), stopped_reason = $3
       WHERE id = $4`,
      ['stopped', 'stopped', reason || 'User stopped', sessionId]
    );

    websocketManager.broadcast('incubation:stopped', {
      sessionId,
      farmId: session.farmId,
      stoppedAt: new Date(),
      reason
    });

    logger.info(LogCategory.FARM, `Incubation ${sessionId} stopped: ${reason || 'User stopped'}`);
  }

  /**
   * Mark incubation as failed
   */
  private async failIncubation(sessionId: string, reason: string): Promise<void> {
    await db.query(
      `UPDATE incubation_sessions
       SET status = $1, stopped_at = NOW(), stopped_reason = $2
       WHERE id = $3`,
      ['failed', reason, sessionId]
    );

    const session = await this.getIncubationSession(sessionId);
    if (session) {
      websocketManager.broadcast('incubation:failed', {
        sessionId,
        farmId: session.farmId,
        reason,
        timestamp: new Date()
      });
    }
  }

  /**
   * Get incubation session
   */
  async getIncubationSession(sessionId: string): Promise<IncubationSession | null> {
    const result = await db.query(
      'SELECT * FROM incubation_sessions WHERE id = $1',
      [sessionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapIncubationSession(result.rows[0]);
  }

  /**
   * Get farm details
   */
  private async getFarm(farmId: string): Promise<Farm> {
    const result = await db.query(
      'SELECT * FROM farms WHERE id = $1',
      [farmId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Farm ${farmId} not found`);
    }

    return result.rows[0];
  }

  /**
   * Get farm's active incubation session
   */
  async getFarmIncubationSession(farmId: string): Promise<IncubationSession | null> {
    const result = await db.query(
      `SELECT * FROM incubation_sessions
       WHERE farm_id = $1
       AND status IN ('pending', 'incubating', 'paused')
       ORDER BY created_at DESC
       LIMIT 1`,
      [farmId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapIncubationSession(result.rows[0]);
  }

  /**
   * Get incubation lineage for a farm
   */
  async getIncubationLineage(farmId: string): Promise<IncubationLineage | null> {
    const result = await db.query(
      'SELECT * FROM incubation_lineage WHERE farm_id = $1',
      [farmId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Get incubation ancestors
   */
  async getIncubationAncestors(farmId: string): Promise<IncubationAncestor[]> {
    const result = await db.query(
      'SELECT * FROM get_incubation_ancestors($1)',
      [farmId]
    );

    return result.rows;
  }

  /**
   * Map database row to IncubationSession
   */
  private mapIncubationSession(row: any): IncubationSession {
    return {
      id: row.id,
      farmId: row.farm_id,
      harvestId: row.harvest_id,
      status: row.status,
      currentStage: row.current_stage,
      totalStages: row.total_stages,
      controlState: row.control_state,
      pausedAt: row.paused_at,
      resumedAt: row.resumed_at,
      stoppedAt: row.stopped_at,
      stoppedReason: row.stopped_reason,
      userContext: row.user_context,
      userId: row.user_id,
      originalOutput: row.original_output,
      stageOutputs: row.stage_outputs || [],
      finalOutput: row.final_output,
      incubationLog: row.incubation_log,
      nextSteps: row.next_steps,
      stageNames: row.stage_names || INCUBATION_STAGES,
      stageProgress: row.stage_progress || [],
      agentId: row.agent_id,
      tmuxSessionName: row.tmux_session_name,
      orchestratorPid: row.orchestrator_pid,
      promptUsed: row.prompt_used,
      tokenUsage: row.token_usage,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      durationMs: row.duration_ms,
      metadata: row.metadata || {}
    };
  }

  /**
   * Create a new farm from incubation - transforms parent farm into next version
   * This is the core "re-farming" functionality
   */
  async createIncubationFarm(input: CreateIncubationFarmInput): Promise<{
    farmId: string;
    sessionId: string;
    version: number;
  }> {
    const { parentFarmId, userContext, userId, customPrompt } = input;

    logger.info(LogCategory.FARM, `Creating incubation farm from parent ${parentFarmId}`);

    try {
      // Get parent farm details
      const parentFarm = await this.getFarm(parentFarmId);

      // Get the most recent completed harvest for the parent farm
      const harvestResult = await db.query(
        `SELECT * FROM harvests
         WHERE farm_id = $1 AND status = 'completed'
         ORDER BY completed_at DESC
         LIMIT 1`,
        [parentFarmId]
      );

      if (harvestResult.rows.length === 0) {
        throw new Error(`No completed harvest found for parent farm ${parentFarmId}. Cannot incubate.`);
      }

      const parentHarvest = harvestResult.rows[0];
      const newVersion = (parentFarm.incubationVersion || 1) + 1;

      // Create new farm record with parent linkage
      const newFarmId = uuidv4();
      const newFarmName = `${parentFarm.name} v${newVersion}.0`;

      const createFarmQuery = `
        INSERT INTO farms (
          id, name, description, mode, status, provider,
          created_by, created_at, updated_at,
          config, metadata,
          auto_incubate, parent_farm_id, incubation_version, incubation_lineage
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), $8, $9, $10, $11, $12, $13
        )
        RETURNING id
      `;

      // Build lineage array from parent
      const lineage = [...(parentFarm.incubation_lineage || []), parentFarmId];

      const farmValues = [
        newFarmId,
        newFarmName,
        `Incubated from ${parentFarm.name} (v${parentFarm.incubationVersion || 1}.0)${userContext ? ` - User guidance: ${userContext.substring(0, 100)}` : ''}`,
        parentFarm.mode || 'harvest',
        'idle',
        parentFarm.provider || 'claude',
        userId || parentFarm.createdBy,
        JSON.stringify(parentFarm.config || {}),
        JSON.stringify({
          ...parentFarm.metadata,
          incubatedFrom: parentFarmId,
          incubatedAt: new Date(),
          userContext
        }),
        parentFarm.autoIncubate !== false,
        parentFarmId,
        newVersion,
        lineage
      ];

      await db.query(createFarmQuery, farmValues);

      logger.info(LogCategory.FARM, `Created incubation farm ${newFarmId} (v${newVersion}.0) from parent ${parentFarmId}`);

      // Extract harvest content for incubation input
      const originalOutput = await this.extractHarvestOutput(parentHarvest);

      // Enhance with actual file contents from harvest directory
      const enhancedOutput = await this.enhanceHarvestContentWithFiles(parentHarvest, originalOutput);

      // Create incubation session for the new farm
      const sessionId = await this.createIncubationSession({
        farmId: newFarmId,
        harvestId: parentHarvest.id,
        originalOutput: enhancedOutput,
        userContext,
        userId,
        farmVersion: newVersion
      });

      // Build and launch incubation
      const prompt = customPrompt || this.buildIncubationPrompt({
        originalOutput: enhancedOutput,
        version: newVersion,
        userContext,
        farmName: newFarmName,
        farmId: newFarmId
      });

      await this.launchIncubationAgent(sessionId, prompt);
      this.monitorIncubation(sessionId);

      // Broadcast events
      websocketManager.broadcast('incubation:farm-created', {
        newFarmId,
        parentFarmId,
        sessionId,
        version: newVersion,
        name: newFarmName,
        trigger: userContext ? 'manual' : 'auto',
        timestamp: new Date()
      });

      websocketManager.broadcast('farm:created', {
        id: newFarmId,
        name: newFarmName,
        status: 'idle',
        parentFarmId,
        version: newVersion
      });

      return {
        farmId: newFarmId,
        sessionId,
        version: newVersion
      };
    } catch (error) {
      logger.error(LogCategory.FARM, `Failed to create incubation farm from ${parentFarmId}:`, error);
      throw error;
    }
  }

  /**
   * Get all incubation sessions for a farm (history)
   */
  async getAllIncubationSessions(farmId: string, options?: {
    limit?: number;
    offset?: number;
    status?: IncubationStatus;
  }): Promise<{
    sessions: IncubationSession[];
    total: number;
    stats: {
      completed: number;
      failed: number;
      stopped: number;
      avgDurationMs: number;
    };
  }> {
    // Sanitize and validate limit/offset to prevent SQL injection
    const limit = Math.max(1, Math.min(Number(options?.limit) || 50, 1000)); // Cap at 1000
    const offset = Math.max(0, Number(options?.offset) || 0);
    const statusFilter = options?.status;

    // Validate status filter against allowed values
    const allowedStatuses = ['pending', 'running', 'paused', 'completed', 'failed', 'stopped'];
    if (statusFilter && !allowedStatuses.includes(statusFilter)) {
      throw new Error(`Invalid status filter: ${statusFilter}`);
    }

    try {
      // Build query with optional status filter using parameterized queries
      let whereClause = 'WHERE farm_id = $1';
      const params: any[] = [farmId];
      let paramIndex = 2;

      if (statusFilter) {
        whereClause += ` AND status = $${paramIndex}`;
        params.push(statusFilter);
        paramIndex++;
      }

      // SECURITY FIX: Use parameterized LIMIT/OFFSET instead of string interpolation
      const sessionsQuery = `
        SELECT * FROM incubation_sessions
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      params.push(limit, offset);

      const sessionsResult = await db.query(sessionsQuery, params);
      const sessions = sessionsResult.rows.map(row => this.mapIncubationSession(row));

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total FROM incubation_sessions
        ${whereClause}
      `;
      const countResult = await db.query(countQuery, params);
      const total = parseInt(countResult.rows[0]?.total || '0', 10);

      // Get stats
      const statsQuery = `
        SELECT
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
          COUNT(CASE WHEN status = 'stopped' THEN 1 END) as stopped,
          AVG(duration_ms) as avg_duration
        FROM incubation_sessions
        WHERE farm_id = $1
      `;
      const statsResult = await db.query(statsQuery, [farmId]);
      const stats = {
        completed: parseInt(statsResult.rows[0]?.completed || '0', 10),
        failed: parseInt(statsResult.rows[0]?.failed || '0', 10),
        stopped: parseInt(statsResult.rows[0]?.stopped || '0', 10),
        avgDurationMs: parseFloat(statsResult.rows[0]?.avg_duration || '0')
      };

      return { sessions, total, stats };
    } catch (error) {
      logger.error(LogCategory.FARM, `Failed to get incubation history for farm ${farmId}:`, error);
      throw error;
    }
  }

  /**
   * Enhance harvest output with actual file contents from harvest directory
   * This fixes the TODO about reading harvest directory contents
   */
  private async enhanceHarvestContentWithFiles(harvest: any, baseOutput: any): Promise<any> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const harvestPath = pathConfig.getPath('HARVEST_DIR', harvest.farm_id, harvest.id);

      // Check if harvest directory exists
      try {
        await fs.access(harvestPath);
      } catch {
        logger.warn(LogCategory.HARVEST, `Harvest directory not found at ${harvestPath}`);
        return baseOutput;
      }

      // Read all files in harvest directory
      const files: Array<{name: string; content: string; type: string; size: number}> = [];
      const entries = await fs.readdir(harvestPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = path.join(harvestPath, entry.name);
          const stats = await fs.stat(filePath);

          // Skip very large files (>500KB) to avoid memory issues
          if (stats.size > 500 * 1024) {
            files.push({
              name: entry.name,
              content: `[File too large: ${Math.round(stats.size / 1024)}KB - content truncated]`,
              type: this.getFileType(entry.name),
              size: stats.size
            });
            continue;
          }

          try {
            const content = await fs.readFile(filePath, 'utf-8');
            files.push({
              name: entry.name,
              content,
              type: this.getFileType(entry.name),
              size: stats.size
            });
          } catch (readError) {
            // Binary file or encoding issue
            files.push({
              name: entry.name,
              content: `[Binary file: ${stats.size} bytes]`,
              type: 'binary',
              size: stats.size
            });
          }
        }
      }

      return {
        ...baseOutput,
        harvestFiles: files,
        harvestFileCount: files.length,
        harvestPath,
        enhancedAt: new Date()
      };
    } catch (error) {
      logger.warn(LogCategory.HARVEST, `Failed to enhance harvest content with files:`, error);
      return baseOutput;
    }
  }

  /**
   * Get file type from extension
   */
  private getFileType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const typeMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      md: 'markdown',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      html: 'html',
      css: 'css',
      sql: 'sql',
      sh: 'shell',
      log: 'log',
      txt: 'text'
    };
    return typeMap[ext] || 'unknown';
  }

  /**
   * Convert incubation output to HarvestData format for Barn storage
   * This ensures incubation results are persistently stored and accessible
   */
  private async convertIncubationToHarvest(session: IncubationSession, finalOutput: any): Promise<HarvestData> {
    // Get farm details for context
    const farmResult = await db.query('SELECT name, user_id FROM farms WHERE id = $1', [session.farmId]);
    const farm = farmResult.rows[0];

    const artifacts: HarvestArtifact[] = [];
    const yieldItems: any[] = [];

    // Create artifact from prototype (the main evolved output)
    if (finalOutput.prototype) {
      const prototypeArtifact: HarvestArtifact = {
        id: uuidv4(),
        harvestId: session.id,
        agentId: 'incubation-agent',
        agentName: 'Incubation Engine',
        type: 'document',
        path: 'incubation-prototype.md',
        content: finalOutput.prototype,
        size: finalOutput.prototype.length,
        mimeType: 'text/markdown'
      };
      artifacts.push(prototypeArtifact);

      // Create yield item for prototype
      yieldItems.push({
        id: uuidv4(),
        name: 'Evolved Prototype',
        type: 'prototype',
        content: finalOutput.prototype,
        description: 'The main evolved output from incubation process',
        confidence: 0.95,
        metadata: { stage: 'deliverable' }
      });
    }

    // Create artifact from incubation log
    if (finalOutput.incubationLog) {
      const log = finalOutput.incubationLog;
      const logContent = [
        '# Incubation Log\n',
        log.elevated ? `## Elevated\n${log.elevated}\n` : '',
        log.fixed ? `## Fixed\n${log.fixed}\n` : '',
        log.innovated ? `## Innovations\n${log.innovated}\n` : ''
      ].join('\n');

      const logArtifact: HarvestArtifact = {
        id: uuidv4(),
        harvestId: session.id,
        agentId: 'incubation-agent',
        agentName: 'Incubation Engine',
        type: 'document',
        path: 'incubation-log.md',
        content: logContent,
        size: logContent.length,
        mimeType: 'text/markdown'
      };
      artifacts.push(logArtifact);

      // Create yield items for each improvement type
      if (log.elevated) {
        yieldItems.push({
          id: uuidv4(),
          name: 'Elevated Features',
          type: 'improvement',
          content: log.elevated,
          description: 'Features that were enhanced during incubation',
          confidence: 0.9,
          metadata: { stage: 'gap-analysis' }
        });
      }
      if (log.fixed) {
        yieldItems.push({
          id: uuidv4(),
          name: 'Fixed Issues',
          type: 'bugfix',
          content: log.fixed,
          description: 'Issues that were resolved during incubation',
          confidence: 0.9,
          metadata: { stage: 'validation' }
        });
      }
      if (log.innovated) {
        yieldItems.push({
          id: uuidv4(),
          name: 'Innovations',
          type: 'innovation',
          content: log.innovated,
          description: 'New features or approaches introduced',
          confidence: 0.85,
          metadata: { stage: 'evolutionary-leap' }
        });
      }
    }

    // Create artifact from next steps
    if (finalOutput.nextSteps) {
      const steps = finalOutput.nextSteps;
      const stepsContent = [
        '# Next Steps Blueprint\n',
        steps.buildPlan ? `## Build Plan\n${Array.isArray(steps.buildPlan) ? steps.buildPlan.join('\n- ') : steps.buildPlan}\n` : '',
        steps.testPlan ? `## Test Plan\n${Array.isArray(steps.testPlan) ? steps.testPlan.join('\n- ') : steps.testPlan}\n` : '',
        steps.launchPlan ? `## Launch Plan\n${Array.isArray(steps.launchPlan) ? steps.launchPlan.join('\n- ') : steps.launchPlan}\n` : ''
      ].join('\n');

      const stepsArtifact: HarvestArtifact = {
        id: uuidv4(),
        harvestId: session.id,
        agentId: 'incubation-agent',
        agentName: 'Incubation Engine',
        type: 'document',
        path: 'next-steps.md',
        content: stepsContent,
        size: stepsContent.length,
        mimeType: 'text/markdown'
      };
      artifacts.push(stepsArtifact);

      // Create yield item for next steps
      yieldItems.push({
        id: uuidv4(),
        name: 'Next Steps Blueprint',
        type: 'plan',
        content: stepsContent,
        description: 'Recommended next steps for continued development',
        confidence: 0.85,
        metadata: { stage: 'deliverable' }
      });
    }

    // Create full raw output artifact as backup
    const rawArtifact: HarvestArtifact = {
      id: uuidv4(),
      harvestId: session.id,
      agentId: 'incubation-agent',
      agentName: 'Incubation Engine',
      type: 'data',
      path: 'incubation-raw.json',
      content: JSON.stringify(finalOutput, null, 2),
      size: JSON.stringify(finalOutput).length,
      mimeType: 'application/json'
    };
    artifacts.push(rawArtifact);

    // Build HarvestData object
    const harvestData: HarvestData = {
      id: session.id, // Use incubation session ID for traceability
      farmId: session.farmId,
      farmName: farm?.name || `Farm ${session.farmId.substring(0, 8)}`,
      userId: session.userId || farm?.user_id || 'system',
      status: 'ready',
      artifacts,
      metadata: {
        totalAgents: 1,
        completedAgents: 1,
        totalFiles: artifacts.length,
        totalSize: artifacts.reduce((sum, a) => sum + a.size, 0),
        duration: session.durationMs || 0
      },
      summary: {
        type: 'incubation',
        version: session.metadata?.farmVersion || 1,
        stagesCompleted: session.totalStages,
        hasPrototype: !!finalOutput.prototype,
        hasLog: !!finalOutput.incubationLog,
        hasNextSteps: !!finalOutput.nextSteps
      },
      yield: yieldItems,
      createdAt: new Date(session.startedAt),
      updatedAt: new Date(),
      completedAt: new Date()
    };

    return harvestData;
  }

  /**
   * Complete an incubation session with final output
   * RACE CONDITION FIX: Uses lock to prevent duplicate completions
   */
  async completeIncubation(sessionId: string, finalOutput: any): Promise<void> {
    // RACE CONDITION FIX: Check if completion is already in progress
    if (this.completionInProgress.has(sessionId)) {
      logger.warn(LogCategory.FARM, `Completion already in progress for session ${sessionId}, skipping duplicate call`);
      return;
    }

    // Acquire lock
    this.completionInProgress.add(sessionId);

    try {
      const session = await this.getIncubationSession(sessionId);
      if (!session) {
        throw new Error(`Incubation session ${sessionId} not found`);
      }

      // Check if already completed (another guard against race conditions)
      if (session.status === 'completed' || session.status === 'failed' || session.status === 'stopped') {
        logger.warn(LogCategory.FARM, `Session ${sessionId} already in terminal state: ${session.status}, skipping completion`);
        return;
      }

      // Stop monitoring
      const interval = this.monitoringIntervals.get(sessionId);
      if (interval) {
        clearInterval(interval);
        this.monitoringIntervals.delete(sessionId);
      }

      // Update database
      await db.query(
        `UPDATE incubation_sessions
         SET status = $1, final_output = $2, completed_at = NOW(),
             duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
             current_stage = total_stages
         WHERE id = $3 AND status NOT IN ('completed', 'failed', 'stopped')`,
        ['completed', JSON.stringify(finalOutput), sessionId]
      );

      // Update farm version if this was for a new farm
      if (session.metadata?.farmVersion) {
        await db.query(
          `UPDATE farms SET incubation_version = $1, updated_at = NOW() WHERE id = $2`,
          [session.metadata.farmVersion, session.farmId]
        );
      }

      // CRITICAL FIX: Store incubation output in Barn
      // This ensures incubation results are persisted and accessible in Barn pages
      try {
        const harvestData = await this.convertIncubationToHarvest(session, finalOutput);
        const barnItem = await barnService.storeHarvest(harvestData, {
          name: `Incubation v${session.metadata?.farmVersion || 1}.0 - ${session.farmId.substring(0, 8)}`,
          description: finalOutput.prototype ? 'Evolved prototype from incubation' : 'Incubation result',
          category: 'Incubations',
          tags: ['incubation', 'evolved', `v${session.metadata?.farmVersion || 1}`],
          extractYieldItems: true
        });
        logger.info(LogCategory.FARM, `Stored incubation output in Barn: ${barnItem.id}`);
      } catch (barnError) {
        // Log but don't fail the incubation completion
        logger.error(LogCategory.FARM, `Failed to store incubation in Barn (non-fatal):`, barnError);
      }

      // Broadcast completion
      websocketManager.broadcast('incubation:completed', {
        sessionId,
        farmId: session.farmId,
        finalOutput,
        duration: session.durationMs,
        timestamp: new Date()
      });

      websocketManager.broadcastToFarm(session.farmId, 'incubation:completed', {
        sessionId,
        finalOutput
      });

      logger.info(LogCategory.FARM, `Incubation ${sessionId} completed successfully`);
    } finally {
      // CRITICAL: Always release the lock
      this.completionInProgress.delete(sessionId);
    }
  }
}

export const incubationService = IncubationService.getInstance();
