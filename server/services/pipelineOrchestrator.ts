/**
 * Pipeline Orchestrator Service
 * Manages multi-agent pipelines with real-time coordination and state synchronization
 * Integrates specialized agent workflows with MaiFarm's core infrastructure
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { coordinationService } from './coordinationService';
import { workCoordinationService } from './workCoordination';

export interface PipelinePhase {
  id: string;
  name: string;
  agentId?: string;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'skipped';
  dependencies: string[];
  timeout?: number;
  retryCount?: number;
  maxRetries?: number;
  startTime?: Date;
  endTime?: Date;
  error?: string;
  progress?: number;
  outputs?: Record<string, any>;
}

export interface Pipeline {
  id: string;
  name: string;
  type: string;
  status: 'initializing' | 'running' | 'completed' | 'failed' | 'paused';
  phases: PipelinePhase[];
  config: {
    maxConcurrentPhases?: number;
    timeout?: number;
    retryPolicy?: 'none' | 'individual' | 'pipeline';
    failureMode?: 'stop' | 'continue' | 'retry';
    coordination?: 'sequential' | 'parallel' | 'hybrid';
  };
  startTime?: Date;
  endTime?: Date;
  progress: number;
  metrics: {
    totalPhases: number;
    completedPhases: number;
    failedPhases: number;
    avgPhaseTime: number;
    successRate: number;
  };
  sharedState: Record<string, any>;
  coordinationPath: string;
}

export interface PipelineEvent {
  pipelineId: string;
  phaseId?: string;
  agentId?: string;
  type: 'phase:started' | 'phase:completed' | 'phase:failed' | 'pipeline:completed' | 'pipeline:failed' | 'agent:assigned';
  data: any;
  timestamp: Date;
  source: string;
}

class PipelineOrchestrator extends EventEmitter {
  private pipelines: Map<string, Pipeline> = new Map();
  private phaseAgentMap: Map<string, string> = new Map(); // phase -> agent mapping
  private agentWorkloads: Map<string, Set<string>> = new Map(); // agent -> phases
  private coordinationDirs: Map<string, string> = new Map(); // pipeline -> coordination dir
  private isInitialized = false;

  constructor() {
    super();
    this.initialize();
  }

  private async initialize() {
    try {
      // Setup coordination directory
      await fs.mkdir('/tmp/claude_coordination/pipelines', { recursive: true });
      
      // Setup listeners for coordination events
      this.setupCoordinationListeners();
      
      // Setup health monitoring integration
      this.setupHealthMonitoring();
      
      this.isInitialized = true;
      console.log('[PipelineOrchestrator] Initialized successfully');
    } catch (error) {
      console.error('[PipelineOrchestrator] Failed to initialize:', error);
    }
  }

  private setupCoordinationListeners() {
    // Listen for work completion events
    coordinationService.on('work:completed', (event) => {
      this.handleWorkCompleted(event);
    });

    // Listen for agent status updates
    coordinationService.on('agent:status', (event) => {
      this.handleAgentStatusUpdate(event);
    });

    // Listen for work coordination events
    workCoordinationService.on('work:completed', (event) => {
      this.handleWorkCoordinationCompleted(event);
    });
  }

  private setupHealthMonitoring() {
    // Monitor pipeline health for active pipelines
    setInterval(async () => {
      for (const [pipelineId, pipeline] of this.pipelines) {
        if (pipeline.status === 'running') {
          await this.checkPipelineHealth(pipelineId);
        }
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Create a new pipeline from configuration
   */
  public async createPipeline(config: {
    name: string;
    type: string;
    phases: Omit<PipelinePhase, 'id' | 'status'>[];
    config?: Pipeline['config'];
    coordinationPath?: string;
  }): Promise<string> {
    const pipelineId = `pipeline_${config.type}_${Date.now()}`;
    const coordinationPath = config.coordinationPath || `/tmp/claude_coordination/pipelines/${pipelineId}`;
    
    // Create coordination directory
    await fs.mkdir(coordinationPath, { recursive: true });
    await fs.mkdir(path.join(coordinationPath, 'phases'), { recursive: true });
    await fs.mkdir(path.join(coordinationPath, 'shared_state'), { recursive: true });
    
    const pipeline: Pipeline = {
      id: pipelineId,
      name: config.name,
      type: config.type,
      status: 'initializing',
      phases: config.phases.map((phase, index) => ({
        ...phase,
        id: `${pipelineId}_phase_${index}`,
        status: 'pending',
        dependencies: phase.dependencies || [],
        retryCount: 0,
        maxRetries: phase.maxRetries || 3
      })),
      config: {
        maxConcurrentPhases: 1,
        timeout: 3600000, // 1 hour default
        retryPolicy: 'individual',
        failureMode: 'stop',
        coordination: 'sequential',
        ...config.config
      },
      progress: 0,
      metrics: {
        totalPhases: config.phases.length,
        completedPhases: 0,
        failedPhases: 0,
        avgPhaseTime: 0,
        successRate: 0
      },
      sharedState: {},
      coordinationPath
    };

    this.pipelines.set(pipelineId, pipeline);
    this.coordinationDirs.set(pipelineId, coordinationPath);

    // Save pipeline state
    await this.savePipelineState(pipelineId);

    // Emit pipeline created event
    this.emitPipelineEvent(pipelineId, {
      type: 'pipeline:created',
      data: { pipeline: this.sanitizePipelineForClient(pipeline) },
      timestamp: new Date(),
      source: 'orchestrator'
    });

    console.log(`[PipelineOrchestrator] Created pipeline: ${pipelineId}`);
    return pipelineId;
  }

  /**
   * Start pipeline execution
   */
  public async startPipeline(pipelineId: string): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline not found: ${pipelineId}`);
    }

    if (pipeline.status !== 'initializing') {
      throw new Error(`Pipeline ${pipelineId} is not in initializing state`);
    }

    pipeline.status = 'running';
    pipeline.startTime = new Date();
    
    await this.savePipelineState(pipelineId);

    // Start initial phases
    await this.scheduleReadyPhases(pipelineId);

    this.emitPipelineEvent(pipelineId, {
      type: 'pipeline:started',
      data: { pipeline: this.sanitizePipelineForClient(pipeline) },
      timestamp: new Date(),
      source: 'orchestrator'
    });

    console.log(`[PipelineOrchestrator] Started pipeline: ${pipelineId}`);
  }

  /**
   * Schedule phases that are ready to run
   */
  private async scheduleReadyPhases(pipelineId: string): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return;

    const readyPhases = pipeline.phases.filter(phase => 
      phase.status === 'pending' && 
      this.areDependenciesMet(phase, pipeline.phases)
    );

    const maxConcurrent = pipeline.config.maxConcurrentPhases || 1;
    const activePhases = pipeline.phases.filter(p => p.status === 'active').length;
    const availableSlots = maxConcurrent - activePhases;

    const phasesToStart = readyPhases.slice(0, availableSlots);

    for (const phase of phasesToStart) {
      await this.startPhase(pipelineId, phase.id);
    }
  }

  /**
   * Check if phase dependencies are met
   */
  private areDependenciesMet(phase: PipelinePhase, allPhases: PipelinePhase[]): boolean {
    return phase.dependencies.every(depId => {
      const depPhase = allPhases.find(p => p.id === depId);
      return depPhase?.status === 'completed';
    });
  }

  /**
   * Start a specific phase
   */
  private async startPhase(pipelineId: string, phaseId: string): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return;

    const phase = pipeline.phases.find(p => p.id === phaseId);
    if (!phase) return;

    phase.status = 'active';
    phase.startTime = new Date();
    phase.progress = 0;

    // Assign agent to phase if not already assigned
    if (!phase.agentId) {
      phase.agentId = await this.assignAgentToPhase(pipelineId, phaseId);
    }

    if (phase.agentId) {
      // Track agent workload
      if (!this.agentWorkloads.has(phase.agentId)) {
        this.agentWorkloads.set(phase.agentId, new Set());
      }
      this.agentWorkloads.get(phase.agentId)!.add(phaseId);
      this.phaseAgentMap.set(phaseId, phase.agentId);

      // Create work claim for the phase
      await this.createPhaseWorkClaim(pipelineId, phaseId, phase.agentId);
    }

    await this.savePipelineState(pipelineId);

    this.emitPipelineEvent(pipelineId, {
      type: 'phase:started',
      phaseId,
      agentId: phase.agentId,
      data: { phase: this.sanitizePhaseForClient(phase) },
      timestamp: new Date(),
      source: 'orchestrator'
    });

    console.log(`[PipelineOrchestrator] Started phase: ${phaseId} with agent: ${phase.agentId}`);
  }

  /**
   * Assign an agent to a phase based on availability and capabilities
   */
  private async assignAgentToPhase(pipelineId: string, phaseId: string): Promise<string | undefined> {
    // Get available agents from coordination service
    const activeAgents = await coordinationService.getActiveAgents();
    
    if (!activeAgents || activeAgents.length === 0) {
      console.warn(`[PipelineOrchestrator] No active agents available for phase: ${phaseId}`);
      return undefined;
    }

    // Find the least loaded agent
    let selectedAgent = activeAgents[0].agent_id;
    let minWorkload = this.agentWorkloads.get(selectedAgent)?.size || 0;

    for (const agent of activeAgents) {
      const workload = this.agentWorkloads.get(agent.agent_id)?.size || 0;
      if (workload < minWorkload) {
        selectedAgent = agent.agent_id;
        minWorkload = workload;
      }
    }

    return selectedAgent;
  }

  /**
   * Create work claim for a phase
   */
  private async createPhaseWorkClaim(pipelineId: string, phaseId: string, agentId: string): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId);
    const phase = pipeline?.phases.find(p => p.id === phaseId);
    
    if (!pipeline || !phase) return;

    try {
      await coordinationService.submitWorkClaim(agentId, {
        description: `Pipeline: ${pipeline.name} - Phase: ${phase.name}`,
        task: `${pipeline.type}_${phase.name}`,
        files: [], // Will be populated based on phase requirements
        type: 'pipeline_phase',
        priority: 'medium',
        pipelineId,
        phaseId,
        estimatedDuration: phase.timeout || 300000, // 5 minutes default
        agentUid: agentId
      });
    } catch (error) {
      console.error(`[PipelineOrchestrator] Failed to create work claim for phase ${phaseId}:`, error);
    }
  }

  /**
   * Handle work completion events
   */
  private async handleWorkCompleted(event: any): Promise<void> {
    // Find phase associated with this work
    const phaseId = this.findPhaseByAgent(event.agentId);
    if (!phaseId) return;

    const pipelineId = this.findPipelineByPhase(phaseId);
    if (!pipelineId) return;

    await this.completePhase(pipelineId, phaseId, true, event.data);
  }

  /**
   * Handle work coordination completion events
   */
  private async handleWorkCoordinationCompleted(event: any): Promise<void> {
    const { claim } = event;
    if (claim.type !== 'pipeline_phase') return;

    await this.completePhase(claim.pipelineId, claim.phaseId, event.success, event.data);
  }

  /**
   * Complete a phase
   */
  private async completePhase(pipelineId: string, phaseId: string, success: boolean, data?: any): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return;

    const phase = pipeline.phases.find(p => p.id === phaseId);
    if (!phase) return;

    phase.status = success ? 'completed' : 'failed';
    phase.endTime = new Date();
    phase.progress = 100;
    
    if (data) {
      phase.outputs = data;
    }

    if (!success && data?.error) {
      phase.error = data.error;
    }

    // Update pipeline metrics
    if (success) {
      pipeline.metrics.completedPhases++;
    } else {
      pipeline.metrics.failedPhases++;
    }

    // Calculate pipeline progress
    pipeline.progress = (pipeline.metrics.completedPhases / pipeline.metrics.totalPhases) * 100;
    pipeline.metrics.successRate = (pipeline.metrics.completedPhases / (pipeline.metrics.completedPhases + pipeline.metrics.failedPhases)) * 100;

    // Clean up agent workload tracking
    if (phase.agentId) {
      this.agentWorkloads.get(phase.agentId)?.delete(phaseId);
      this.phaseAgentMap.delete(phaseId);
    }

    await this.savePipelineState(pipelineId);

    this.emitPipelineEvent(pipelineId, {
      type: success ? 'phase:completed' : 'phase:failed',
      phaseId,
      agentId: phase.agentId,
      data: { phase: this.sanitizePhaseForClient(phase) },
      timestamp: new Date(),
      source: 'orchestrator'
    });

    // Handle phase failure
    if (!success) {
      await this.handlePhaseFailure(pipelineId, phaseId);
      return;
    }

    // Check if pipeline is complete
    if (this.isPipelineComplete(pipeline)) {
      await this.completePipeline(pipelineId);
      return;
    }

    // Schedule next phases
    await this.scheduleReadyPhases(pipelineId);
  }

  /**
   * Handle phase failure
   */
  private async handlePhaseFailure(pipelineId: string, phaseId: string): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId);
    const phase = pipeline?.phases.find(p => p.id === phaseId);
    
    if (!pipeline || !phase) return;

    // Check retry policy
    if (pipeline.config.retryPolicy === 'individual' && phase.retryCount! < phase.maxRetries!) {
      phase.retryCount!++;
      phase.status = 'pending';
      console.log(`[PipelineOrchestrator] Retrying phase ${phaseId} (attempt ${phase.retryCount})`);
      
      // Reschedule phase
      setTimeout(() => this.scheduleReadyPhases(pipelineId), 5000);
      return;
    }

    // Handle failure based on failure mode
    switch (pipeline.config.failureMode) {
      case 'stop':
        await this.failPipeline(pipelineId, `Phase ${phase.name} failed`);
        break;
      case 'continue':
        // Mark dependent phases as skipped
        this.skipDependentPhases(pipeline, phaseId);
        await this.scheduleReadyPhases(pipelineId);
        break;
      case 'retry':
        if (pipeline.config.retryPolicy === 'pipeline') {
          // Retry entire pipeline
          await this.retryPipeline(pipelineId);
        }
        break;
    }
  }

  /**
   * Skip phases that depend on a failed phase
   */
  private skipDependentPhases(pipeline: Pipeline, failedPhaseId: string): void {
    const toSkip = pipeline.phases.filter(phase => 
      phase.dependencies.includes(failedPhaseId) && 
      phase.status === 'pending'
    );

    for (const phase of toSkip) {
      phase.status = 'skipped';
      // Recursively skip dependent phases
      this.skipDependentPhases(pipeline, phase.id);
    }
  }

  /**
   * Check if pipeline is complete
   */
  private isPipelineComplete(pipeline: Pipeline): boolean {
    return pipeline.phases.every(phase => 
      ['completed', 'failed', 'skipped'].includes(phase.status)
    );
  }

  /**
   * Complete pipeline
   */
  private async completePipeline(pipelineId: string): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return;

    pipeline.status = 'completed';
    pipeline.endTime = new Date();
    pipeline.progress = 100;

    // Calculate final metrics
    const totalTime = pipeline.endTime.getTime() - (pipeline.startTime?.getTime() || 0);
    pipeline.metrics.avgPhaseTime = totalTime / pipeline.metrics.totalPhases;

    await this.savePipelineState(pipelineId);

    this.emitPipelineEvent(pipelineId, {
      type: 'pipeline:completed',
      data: { 
        pipeline: this.sanitizePipelineForClient(pipeline),
        metrics: pipeline.metrics
      },
      timestamp: new Date(),
      source: 'orchestrator'
    });

    console.log(`[PipelineOrchestrator] Completed pipeline: ${pipelineId}`);
  }

  /**
   * Fail pipeline
   */
  private async failPipeline(pipelineId: string, reason: string): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return;

    pipeline.status = 'failed';
    pipeline.endTime = new Date();

    await this.savePipelineState(pipelineId);

    this.emitPipelineEvent(pipelineId, {
      type: 'pipeline:failed',
      data: { 
        pipeline: this.sanitizePipelineForClient(pipeline),
        reason 
      },
      timestamp: new Date(),
      source: 'orchestrator'
    });

    console.log(`[PipelineOrchestrator] Failed pipeline: ${pipelineId} - ${reason}`);
  }

  /**
   * Retry pipeline
   */
  private async retryPipeline(pipelineId: string): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return;

    // Reset all phases to pending
    pipeline.phases.forEach(phase => {
      if (phase.status === 'failed') {
        phase.status = 'pending';
        phase.retryCount = 0;
        phase.error = undefined;
        phase.startTime = undefined;
        phase.endTime = undefined;
        phase.progress = 0;
      }
    });

    pipeline.status = 'running';
    pipeline.metrics.failedPhases = 0;

    await this.savePipelineState(pipelineId);
    await this.scheduleReadyPhases(pipelineId);

    console.log(`[PipelineOrchestrator] Retrying pipeline: ${pipelineId}`);
  }

  /**
   * Handle agent status updates
   */
  private async handleAgentStatusUpdate(event: any): Promise<void> {
    const { agentId, status } = event;
    
    if (status === 'error' || status === 'disabled') {
      // Handle agent failure - reassign phases
      await this.handleAgentFailure(agentId);
    }
  }

  /**
   * Handle agent failure by reassigning phases
   */
  private async handleAgentFailure(agentId: string): Promise<void> {
    const phases = this.agentWorkloads.get(agentId);
    if (!phases) return;

    for (const phaseId of phases) {
      const pipelineId = this.findPipelineByPhase(phaseId);
      if (!pipelineId) continue;

      const pipeline = this.pipelines.get(pipelineId);
      const phase = pipeline?.phases.find(p => p.id === phaseId);
      
      if (phase && phase.status === 'active') {
        // Reset phase and reassign
        phase.status = 'pending';
        phase.agentId = undefined;
        phase.startTime = undefined;
        phase.progress = 0;

        console.log(`[PipelineOrchestrator] Reassigning phase ${phaseId} due to agent ${agentId} failure`);
        
        // Try to reschedule
        setTimeout(() => this.scheduleReadyPhases(pipelineId), 2000);
      }
    }

    // Clear agent workload
    this.agentWorkloads.delete(agentId);
  }

  /**
   * Check pipeline health
   */
  private async checkPipelineHealth(pipelineId: string): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return;

    const now = Date.now();
    
    // Check for stuck phases
    for (const phase of pipeline.phases) {
      if (phase.status === 'active' && phase.startTime) {
        const elapsed = now - phase.startTime.getTime();
        const timeout = phase.timeout || pipeline.config.timeout || 3600000;
        
        if (elapsed > timeout) {
          console.warn(`[PipelineOrchestrator] Phase ${phase.id} timed out after ${elapsed}ms`);
          await this.completePhase(pipelineId, phase.id, false, { error: 'Phase timeout' });
        }
      }
    }
  }

  /**
   * Save pipeline state to disk
   */
  private async savePipelineState(pipelineId: string): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId);
    const coordDir = this.coordinationDirs.get(pipelineId);
    
    if (!pipeline || !coordDir) return;

    try {
      const stateFile = path.join(coordDir, 'pipeline_state.json');
      await fs.writeFile(stateFile, JSON.stringify(pipeline, null, 2));
    } catch (error) {
      console.error(`[PipelineOrchestrator] Failed to save pipeline state ${pipelineId}:`, error);
    }
  }

  /**
   * Emit pipeline event to coordination service
   */
  private emitPipelineEvent(pipelineId: string, event: Omit<PipelineEvent, 'pipelineId'>): void {
    const fullEvent: PipelineEvent = {
      pipelineId,
      ...event
    };

    // Emit to internal listeners
    this.emit('pipeline:event', fullEvent);

    // Forward to coordination service for WebSocket broadcast
    coordinationService.emit('pipeline:event', fullEvent);
  }

  /**
   * Utility methods
   */
  private findPhaseByAgent(agentId: string): string | undefined {
    for (const [phaseId, mappedAgentId] of this.phaseAgentMap) {
      if (mappedAgentId === agentId) {
        return phaseId;
      }
    }
    return undefined;
  }

  private findPipelineByPhase(phaseId: string): string | undefined {
    for (const [pipelineId, pipeline] of this.pipelines) {
      if (pipeline.phases.some(p => p.id === phaseId)) {
        return pipelineId;
      }
    }
    return undefined;
  }

  private sanitizePipelineForClient(pipeline: Pipeline): any {
    return {
      ...pipeline,
      phases: pipeline.phases.map(phase => this.sanitizePhaseForClient(phase))
    };
  }

  private sanitizePhaseForClient(phase: PipelinePhase): any {
    return {
      ...phase,
      // Remove sensitive data if needed
    };
  }

  /**
   * Public API methods
   */
  
  public getPipeline(pipelineId: string): Pipeline | undefined {
    return this.pipelines.get(pipelineId);
  }

  public getAllPipelines(): Pipeline[] {
    return Array.from(this.pipelines.values());
  }

  public async pausePipeline(pipelineId: string): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline || pipeline.status !== 'running') {
      throw new Error(`Cannot pause pipeline ${pipelineId}`);
    }

    pipeline.status = 'paused';
    await this.savePipelineState(pipelineId);

    this.emitPipelineEvent(pipelineId, {
      type: 'pipeline:paused',
      data: { pipeline: this.sanitizePipelineForClient(pipeline) },
      timestamp: new Date(),
      source: 'orchestrator'
    });
  }

  public async resumePipeline(pipelineId: string): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline || pipeline.status !== 'paused') {
      throw new Error(`Cannot resume pipeline ${pipelineId}`);
    }

    pipeline.status = 'running';
    await this.savePipelineState(pipelineId);
    await this.scheduleReadyPhases(pipelineId);

    this.emitPipelineEvent(pipelineId, {
      type: 'pipeline:resumed',
      data: { pipeline: this.sanitizePipelineForClient(pipeline) },
      timestamp: new Date(),
      source: 'orchestrator'
    });
  }

  public async cancelPipeline(pipelineId: string): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline not found: ${pipelineId}`);
    }

    pipeline.status = 'failed';
    pipeline.endTime = new Date();

    // Cancel active phases
    pipeline.phases.forEach(phase => {
      if (phase.status === 'active') {
        phase.status = 'failed';
        phase.error = 'Pipeline cancelled';
        phase.endTime = new Date();
      }
    });

    await this.savePipelineState(pipelineId);

    this.emitPipelineEvent(pipelineId, {
      type: 'pipeline:cancelled',
      data: { pipeline: this.sanitizePipelineForClient(pipeline) },
      timestamp: new Date(),
      source: 'orchestrator'
    });
  }

  public getPipelineMetrics(): any {
    const pipelines = Array.from(this.pipelines.values());
    
    return {
      total: pipelines.length,
      running: pipelines.filter(p => p.status === 'running').length,
      completed: pipelines.filter(p => p.status === 'completed').length,
      failed: pipelines.filter(p => p.status === 'failed').length,
      paused: pipelines.filter(p => p.status === 'paused').length,
      avgCompletionTime: this.calculateAvgCompletionTime(pipelines.filter(p => p.status === 'completed')),
      successRate: this.calculateSuccessRate(pipelines),
      activePhases: pipelines.reduce((sum, p) => sum + p.phases.filter(ph => ph.status === 'active').length, 0)
    };
  }

  private calculateAvgCompletionTime(completedPipelines: Pipeline[]): number {
    if (completedPipelines.length === 0) return 0;
    
    const totalTime = completedPipelines.reduce((sum, p) => {
      if (p.startTime && p.endTime) {
        return sum + (p.endTime.getTime() - p.startTime.getTime());
      }
      return sum;
    }, 0);
    
    return totalTime / completedPipelines.length;
  }

  private calculateSuccessRate(pipelines: Pipeline[]): number {
    const finishedPipelines = pipelines.filter(p => ['completed', 'failed'].includes(p.status));
    if (finishedPipelines.length === 0) return 100;
    
    const successful = finishedPipelines.filter(p => p.status === 'completed').length;
    return (successful / finishedPipelines.length) * 100;
  }

  public destroy(): void {
    this.removeAllListeners();
    this.pipelines.clear();
    this.phaseAgentMap.clear();
    this.agentWorkloads.clear();
    this.coordinationDirs.clear();
    console.log('[PipelineOrchestrator] Service destroyed');
  }
}

// Export singleton instance
export const pipelineOrchestrator = new PipelineOrchestrator();
export default pipelineOrchestrator;