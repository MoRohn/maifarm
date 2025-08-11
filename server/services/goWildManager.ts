import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { GoWildSession, GoWildConfig, Discovery, ExplorationNode } from '../../src/types/goWild';
import { agentManager } from './agentManager';
import { SafetyManager } from './safetyManager';
import { claudeCodeCoordinator } from './claudeCodeCoordinator';
import { harvestService } from './harvestService';
import TmuxHelper from './tmuxHelper';
import logger from '../utils/logger';
import { WebSocketManager } from '../websocket/websocketManager';
import { shutdownCoordinator } from './shutdownCoordinator';
import { calculateGracefulShutdownTime, DEFAULT_GOWILD_TIMEOUT } from '../constants/timing';
import { thinkingStrategyService } from './thinkingStrategyService';
import { ThinkingLevel, ThinkingConfig } from '../types/thinking';

export class GoWildManager extends EventEmitter {
  private sessions: Map<string, GoWildSession> = new Map();
  private farmSessions: Map<string, string> = new Map(); // farmId -> sessionId
  private safetyManager: SafetyManager;
  private explorationTimers: Map<string, NodeJS.Timeout> = new Map();
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
    this.safetyManager = new SafetyManager();
    
    // Listen for agent task completion events
    agentManager.on('agent:taskCompleted', this.handleAgentTaskCompleted.bind(this));
  }

  private async handleAgentTaskCompleted(agentId: string, taskId: string, result: any) {
    // Find session containing this task
    for (const [sessionId, session] of this.sessions) {
      const node = session.explorationPath.nodes.find(n => 
        n.data && n.data.taskId === taskId
      );
      
      if (node && session.status === 'exploring') {
        // Update node with results
        node.data = {
          ...node.data,
          completed: true,
          result: result,
          completedAt: new Date()
        };

        // Check if this produced a discovery
        if (result.success && Math.random() < 0.4) { // 40% chance of discovery
          const discovery = await this.createDiscoveryFromResult(session, node, result);
          if (discovery) {
            session.explorationPath.discoveries.push(discovery);
            session.stats.discoveriesMade++;
            this.broadcastUpdate(session, 'discovery-made', { discovery });
          }
        }

        // Continue exploration
        setTimeout(() => this.exploreNext(session), 1000);
        break;
      }
    }
  }

  private async createDiscoveryFromResult(session: GoWildSession, node: ExplorationNode, result: any): Promise<Discovery | null> {
    const impactLevels: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
    const impactIndex = Math.min(Math.floor(result.duration / 2000), 2); // Longer tasks = higher impact
    
    return {
      id: uuidv4(),
      nodeId: node.id,
      title: `${node.label} - ${node.data?.agentName || 'Agent'} Discovery`,
      description: `Agent discovered potential improvements in ${node.data?.category || 'system'}`,
      impact: impactLevels[impactIndex],
      category: node.data?.category || 'General',
      timestamp: new Date(),
      saved: false,
      metadata: {
        agentId: node.data?.agentId,
        taskDuration: result.duration,
        confidence: Math.round(Math.random() * 30 + 70) // 70-100% confidence
      }
    };
  }

  async startExploration(farmId: string, config: GoWildConfig): Promise<GoWildSession> {
    // Check if there's already an active session for this farm
    const existingSessionId = this.farmSessions.get(farmId);
    if (existingSessionId) {
      const existingSession = this.sessions.get(existingSessionId);
      if (existingSession && existingSession.status === 'exploring') {
        throw new Error('Farm already has an active exploration session');
      }
    }

    const session: GoWildSession = {
      id: uuidv4(),
      farmId,
      status: 'exploring',
      config,
      startTime: new Date(),
      explorationPath: {
        nodes: [],
        edges: [],
        discoveries: [],
        currentNodeId: null,
        results: []
      },
      stats: {
        nodesExplored: 0,
        discoveriesMade: 0,
        backtrackCount: 0,
        averageCreativity: config.creativityLevel
      }
    };

    this.sessions.set(session.id, session);
    this.farmSessions.set(farmId, session.id);

    // Start exploration process
    this.startExplorationProcess(session);

    // Set timeout for max duration using shutdown coordinator
    const timeoutSeconds = config.maxDuration * 60; // Convert minutes to seconds
    
    // Schedule graceful shutdown 30s before timeout
    shutdownCoordinator.scheduleShutdown({
      mode: 'gowild',
      farmId: farmId,
      userId: 'gowild-user', // GoWild sessions may not have specific user
      reason: 'timeout',
      timeout: timeoutSeconds, // Pass timeout in seconds (coordinator converts to ms)
      harvestId: session.harvestId
    });
    
    const timeoutMs = timeoutSeconds * 1000;
    const gracefulShutdownTime = calculateGracefulShutdownTime(timeoutMs);
    logger.info(`[GoWildManager] Scheduled graceful shutdown for session ${session.id} at ${gracefulShutdownTime / 1000}s (30s before ${config.maxDuration}min timeout)`);
    
    // Also set final timeout as failsafe
    const timeout = setTimeout(async () => {
      logger.warn(`[GoWildManager] Final timeout reached for session ${session.id} after ${config.maxDuration} minutes`);
      
      // Mark session as timed out if not already completed
      const timedOutSession = this.sessions.get(session.id);
      if (timedOutSession && timedOutSession.status !== 'completed') {
        timedOutSession.status = 'timeout';
        
        // Broadcast timeout event
        this.broadcastUpdate(timedOutSession, 'timeout', { 
          reason: `Session exceeded maximum duration of ${config.maxDuration} minutes`
        });
      }
      
      // Ensure exploration is stopped
      if (this.sessions.has(session.id)) {
        await this.stopExploration(session.id);
      }
    }, timeoutMs);

    this.explorationTimers.set(session.id, timeout);

    // Start real-time monitoring
    this.startExplorationMonitoring(session);

    logger.info(`Started Go Wild exploration for farm ${farmId}`, { sessionId: session.id });

    return session;
  }

  private async startExplorationProcess(session: GoWildSession) {
    try {
      // Launch actual agents using multiClaudeService for GoWild mode
      const multiClaudeModule = await import('./multiClaudeService');
      const multiClaudeService = multiClaudeModule.multiClaudeService;
      const agentCount = session.config.explorationDepth || 3;
      
      // Determine thinking level based on creativity and exploration depth
      const thinkingLevel = this.determineThinkingLevel(session.config);
      
      // Build base Go Wild prompt
      const basePrompt = `You are in Go Wild mode with creativity level ${session.config.creativityLevel}.
Explore and discover innovative solutions without strict boundaries.
Focus areas: ${session.config.focusAreas?.join(', ') || 'Open exploration'}
${session.config.seedPrompt || ''}`;

      // Enhance prompt with thinking strategy
      const thinkingConfig: ThinkingConfig = {
        level: thinkingLevel,
        taskType: 'exploration',
        context: `This is an exploratory session with creativity level ${session.config.creativityLevel}. Be innovative and thorough in discovering new possibilities.`,
        autoEscalate: true,
        maxLevel: ThinkingLevel.DEEP // Cap at DEEP for exploration to balance creativity with processing time
      };

      const enhancedPromptResult = thinkingStrategyService.enhancePrompt(
        basePrompt,
        thinkingConfig
      );

      const goWildPrompt = enhancedPromptResult.enhancedPrompt;
      
      logger.info(`[GoWild] Applied thinking level ${enhancedPromptResult.appliedLevel} to exploration prompt`);

      try {
        logger.info(`[GoWild] Attempting to launch ${agentCount} agents for session ${session.id}`);
        const processId = await multiClaudeService.launchFarm({
          farmId: session.farmId,
          name: `GoWild Exploration - ${session.farmId}`,
          description: 'Autonomous exploration and discovery',
          numberOfAgents: agentCount,
          prompt: goWildPrompt,
          collaborative: true, // GoWild agents should collaborate
          provider: 'claude' // Use Claude for GoWild by default
        });
        
        logger.info(`[GoWild] Successfully launched GoWild agents for session ${session.id}, process: ${processId}`);
        session.processId = processId;
        
        // Broadcast agent launch success
        this.broadcastUpdate(session, 'agents-launched', { 
          processId, 
          agentCount,
          timestamp: new Date() 
        });
      } catch (launchError) {
        logger.error('[GoWild] Failed to launch GoWild agents:', launchError);
        console.error('[GoWild] Agent launch error details:', launchError);
        // Fallback to tmux session creation if available
        const tmuxAvailable = await TmuxHelper.isAvailable();
        if (tmuxAvailable) {
          const tmuxCreated = await TmuxHelper.createGoWildSession(session.id, agentCount);
          
          if (tmuxCreated) {
            logger.info(`Created tmux session for Go Wild exploration: ${session.id}`);
            session.hasTmuxSession = true;
            
            // Create monitoring layout in separate window
            await TmuxHelper.createGoWildLayout(session.id);
          } else {
            logger.warn(`Failed to create tmux session for Go Wild exploration: ${session.id}`);
          }
        }
      }

      // Create initial exploration node
      const rootNode: ExplorationNode = {
        id: uuidv4(),
        type: 'idea',
        label: 'Start Exploration',
        position: { x: 0, y: 0, z: 0 },
        creativity: session.config.creativityLevel,
        timestamp: new Date(),
        agentId: 'system',
        children: [],
        content: 'Starting autonomous exploration',
        confidence: 100
      };

      session.explorationPath.nodes.push(rootNode);
      session.explorationPath.currentNodeId = rootNode.id;

      this.broadcastUpdate(session, 'node-added', { node: rootNode });

      // Start autonomous exploration
      this.exploreNext(session);
    } catch (error) {
      logger.error('Failed to start exploration process:', error);
      session.status = 'failed';
      this.broadcastUpdate(session, 'status-changed', { status: 'failed' });
    }
  }

  private async exploreNext(session: GoWildSession) {
    if (session.status !== 'exploring') {
      return;
    }

    try {
      // Check safety boundaries
      const safetyCheck = await this.safetyManager.checkCurrentState(session);
      if (!safetyCheck.isSafe) {
        logger.warn('Safety boundary reached', { 
          sessionId: session.id, 
          violation: safetyCheck.violation 
        });
        this.broadcastUpdate(session, 'boundary-reached', safetyCheck);
        return;
      }

      // Generate next exploration step based on creativity level
      const nextStep = await this.generateNextStep(session);
      
      if (nextStep) {
        // Create new node
        const newNode: ExplorationNode = {
          id: uuidv4(),
          type: nextStep.type,
          label: nextStep.label,
          position: this.calculateNodePosition(session),
          creativity: this.calculateCreativity(session),
          timestamp: new Date(),
          data: nextStep.data
        };

        // Add node and edge
        session.explorationPath.nodes.push(newNode);
        if (session.explorationPath.currentNodeId) {
          session.explorationPath.edges.push({
            id: uuidv4(),
            source: session.explorationPath.currentNodeId,
            target: newNode.id,
            animated: true
          });
        }
        session.explorationPath.currentNodeId = newNode.id;
        session.stats.nodesExplored++;

        this.broadcastUpdate(session, 'node-added', { 
          node: newNode,
          edges: session.explorationPath.edges.slice(-1)
        });

        // Check for discoveries
        const discovery = await this.checkForDiscovery(session, newNode);
        if (discovery) {
          session.explorationPath.discoveries.push(discovery);
          session.stats.discoveriesMade++;
          this.broadcastUpdate(session, 'discovery-made', { discovery });
        }

        // Continue exploration after a delay
        setTimeout(() => this.exploreNext(session), 2000);
      } else {
        // No more paths to explore
        session.status = 'completed';
        this.broadcastUpdate(session, 'status-changed', { status: 'completed' });
      }
    } catch (error) {
      logger.error('Error during exploration:', error);
      session.status = 'failed';
      this.broadcastUpdate(session, 'status-changed', { status: 'failed' });
    }
  }

  private async generateNextStep(session: GoWildSession): Promise<any> {
    // Get available agents for this farm
    const farmAgents = agentManager.getAgentsByFarm(session.farmId);
    const availableAgents = farmAgents.filter(agent => agent.status === 'running');

    // Define exploration tasks based on focus areas and boundaries
    const explorationTasks = this.generateExplorationTasks(session);
    
    // Select next task based on creativity level
    const randomValue = Math.random() * 100;
    const taskIndex = randomValue < session.config.creativityLevel 
      ? Math.floor(Math.random() * explorationTasks.length)
      : session.stats.nodesExplored % explorationTasks.length;
    
    const selectedTask = explorationTasks[taskIndex];

    // Send task to tmux session if available
    if (session.hasTmuxSession && selectedTask) {
      const agentIndex = session.stats.nodesExplored % (session.config.explorationDepth || 5);
      const tmuxSuccess = await TmuxHelper.sendExplorationTask(
        session.id,
        agentIndex,
        selectedTask
      );
      
      if (tmuxSuccess) {
        selectedTask.tmuxAgentIndex = agentIndex;
        
        // Capture output after a delay
        setTimeout(async () => {
          const output = await TmuxHelper.captureExplorationResults(session.id, agentIndex);
          if (output && output.includes('insights')) {
            // Parse discoveries from tmux output
            this.parseDiscoveriesFromOutput(session, output);
          }
        }, 3000);
      }
    }

    // Try to use Claude Code agents first
    const claudeAgents = claudeCodeCoordinator.getAgentsByFarm(session.farmId);
    if (claudeAgents.length > 0 && selectedTask) {
      // Create exploration task for Claude Code agent
      const coordinationTask = await claudeCodeCoordinator.createExplorationTask(
        session.farmId,
        selectedTask.type,
        selectedTask.label,
        {
          sessionId: session.id,
          boundaries: session.config.boundaries,
          category: selectedTask.category
        }
      );

      selectedTask.coordinationTaskId = coordinationTask.id;
      selectedTask.assignedTo = coordinationTask.assignedTo;
      
      // Simulate response for testing
      claudeCodeCoordinator.simulateAgentResponse(coordinationTask.id);
      
      logger.info(`Assigned exploration task to Claude Code agent: ${coordinationTask.assignedTo}`);
    } 
    // Fall back to internal agents if no Claude Code agents available
    else if (availableAgents.length > 0 && selectedTask) {
      const agent = availableAgents[Math.floor(Math.random() * availableAgents.length)];
      const taskId = uuidv4();
      
      await agentManager.assignTask(agent.id, taskId, {
        type: 'exploration',
        sessionId: session.id,
        task: selectedTask,
        boundaries: session.config.boundaries
      });

      // Add agent info to the task
      selectedTask.agentId = agent.id;
      selectedTask.agentName = agent.name;
      selectedTask.taskId = taskId;
    }

    return selectedTask;
  }

  private generateExplorationTasks(session: GoWildSession): any[] {
    const baseTasks = [
      { type: 'analysis', label: 'Analyzing patterns', category: 'Performance' },
      { type: 'optimization', label: 'Optimizing workflow', category: 'Architecture' },
      { type: 'integration', label: 'Finding integrations', category: 'Integration' },
      { type: 'innovation', label: 'Innovative solution', category: 'UX' },
      { type: 'refactor', label: 'Code improvement', category: 'Code Quality' },
      { type: 'security', label: 'Security analysis', category: 'Security' },
      { type: 'testing', label: 'Test coverage analysis', category: 'Testing' },
      { type: 'documentation', label: 'Documentation gaps', category: 'Documentation' },
      { type: 'improvement', label: 'General improvements', category: 'Improvement' },
      { type: 'exploration', label: 'Exploring new areas', category: 'Discovery' }
    ];

    // Filter tasks based on focus areas if specified
    if (session.config.focusAreas && session.config.focusAreas.length > 0) {
      const filteredTasks = baseTasks.filter(task => 
        session.config.focusAreas.some(area => {
          const areaLower = area.toLowerCase();
          return task.label.toLowerCase().includes(areaLower) ||
                 task.category.toLowerCase().includes(areaLower) ||
                 areaLower.includes(task.category.toLowerCase()) ||
                 areaLower.includes('test') && task.category === 'Testing' ||
                 areaLower.includes('improvement') && task.category === 'Improvement';
        })
      );
      
      // If no tasks match the focus areas, return all tasks to ensure exploration continues
      if (filteredTasks.length === 0) {
        logger.warn(`No tasks matched focus areas: ${session.config.focusAreas.join(', ')}. Using all tasks.`);
        return baseTasks;
      }
      
      return filteredTasks;
    }

    return baseTasks;
  }

  private calculateNodePosition(session: GoWildSession): { x: number; y: number } {
    const nodes = session.explorationPath.nodes;
    if (nodes.length === 0) return { x: 0, y: 0 };

    const lastNode = nodes[nodes.length - 1];
    const angle = (Math.random() * Math.PI * 2);
    const distance = 150 + Math.random() * 50;

    return {
      x: lastNode.position.x + Math.cos(angle) * distance,
      y: lastNode.position.y + Math.sin(angle) * distance
    };
  }

  private calculateCreativity(session: GoWildSession): number {
    // Vary creativity around the configured level
    const variance = 10;
    const min = Math.max(0, session.config.creativityLevel - variance);
    const max = Math.min(100, session.config.creativityLevel + variance);
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  private async checkForDiscovery(session: GoWildSession, node: ExplorationNode): Promise<Discovery | null> {
    // Simulate discovery detection
    const discoveryChance = session.config.creativityLevel / 100 * 0.3; // 30% max chance
    
    if (Math.random() < discoveryChance) {
      const impactLevels: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
      const categories = ['Performance', 'Architecture', 'Security', 'UX', 'Integration'];
      
      return {
        id: uuidv4(),
        nodeId: node.id,
        title: `${node.label} Discovery`,
        description: `Found a potential improvement in ${categories[Math.floor(Math.random() * categories.length)]}`,
        impact: impactLevels[Math.floor(Math.random() * impactLevels.length)],
        category: categories[Math.floor(Math.random() * categories.length)],
        timestamp: new Date(),
        saved: false
      };
    }

    return null;
  }

  private broadcastUpdate(session: GoWildSession, type: string, data: any) {
    WebSocketManager.broadcastToFarm(session.farmId, `goWild:${type}`, {
      sessionId: session.id,
      type,
      data
    });
  }

  async pauseExploration(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status !== 'exploring') {
      throw new Error('Session is not currently exploring');
    }

    session.status = 'paused';
    session.pausedAt = new Date(); // Track when paused for accurate resume timing
    
    // Clear exploration timer
    const timer = this.explorationTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.explorationTimers.delete(sessionId);
    }

    this.broadcastUpdate(session, 'status-changed', { status: 'paused' });
    logger.info(`Paused exploration session ${sessionId}`);
  }

  async resumeExploration(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status !== 'paused') {
      throw new Error('Session is not paused');
    }

    session.status = 'exploring';
    
    // Calculate actual elapsed time accounting for pauses
    let elapsed = 0;
    if (session.startTime) {
      if (session.pausedAt) {
        // Use pause time for calculation, not current time
        elapsed = session.pausedAt.getTime() - session.startTime.getTime();
      } else {
        elapsed = Date.now() - session.startTime.getTime();
      }
    }
    
    const remaining = (session.config.maxDuration * 60 * 1000) - elapsed;
    
    if (remaining > 0) {
      // Resume exploration
      this.exploreNext(session);
      
      // Set timer for remaining duration
      const timeout = setTimeout(() => {
        this.stopExploration(sessionId).catch(error => {
          logger.error(`Error stopping exploration ${sessionId}:`, error);
        });
      }, remaining);
      this.explorationTimers.set(sessionId, timeout);
      
      logger.info(`Resumed exploration session ${sessionId} with ${Math.round(remaining / 1000)}s remaining`);
    } else {
      // Time has already expired, stop the session
      logger.info(`Session ${sessionId} time expired during pause, stopping`);
      await this.stopExploration(sessionId);
      return;
    }

    this.broadcastUpdate(session, 'status-changed', { status: 'exploring' });
  }

  async stopExploration(sessionId: string): Promise<any> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Prevent duplicate stops
    if (session.status === 'completed' || session.status === 'failed') {
      logger.warn(`Session ${sessionId} already stopped with status: ${session.status}`);
      return session.summary || null;
    }

    // Use graceful shutdown for GoWild sessions to collect yields properly
    try {
      const { farmManager } = await import('./farmManager');
      
      // Determine shutdown reason based on current status
      let shutdownReason: 'timeout' | 'user_request' | 'completion' = 'completion';
      if (session.status === 'timeout') {
        shutdownReason = 'timeout';
      } else {
        shutdownReason = 'user_request'; // Manual stop
      }
      
      // Try graceful shutdown first to collect any pending yields
      logger.info(`[GoWild] Initiating graceful shutdown for session ${sessionId} farm ${session.farmId}`);
      
      try {
        // Use centralized shutdown coordinator
        const shutdownResult = await shutdownCoordinator.executeGracefulShutdown({
          mode: 'gowild',
          farmId: session.farmId,
          userId: 'dev-user',
          reason: shutdownReason,
          harvestId: session.harvestId
        });
        
        logger.info(`[GoWild] Graceful shutdown completed for session ${sessionId}`, {
          success: shutdownResult.success,
          filesCollected: shutdownResult.filesCollected,
          barnStored: shutdownResult.barnStored
        });
      } catch (gracefulError) {
        logger.warn(`[GoWild] Graceful shutdown failed for session ${sessionId}, continuing with standard cleanup:`, gracefulError);
      }
      
    } catch (error) {
      logger.warn(`[GoWild] Could not perform graceful shutdown for session ${sessionId}, continuing with standard cleanup:`, error);
    }

    // If not already set to timeout, mark as completed
    if (session.status !== 'timeout') {
      session.status = 'completed';
    }
    session.endTime = new Date();
    
    // Capture real agent output before stopping
    await this.captureAgentOutputs(session);

    // Clear timer
    const timer = this.explorationTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.explorationTimers.delete(sessionId);
    }

    // Generate summary
    const summary = {
      sessionId: session.id,
      farmId: session.farmId,
      duration: session.endTime.getTime() - session.startTime.getTime(),
      stats: session.stats,
      discoveries: session.explorationPath.discoveries.length,
      savedDiscoveries: session.explorationPath.discoveries.filter(d => d.saved).length,
      totalNodes: session.explorationPath.nodes.length,
      completedAt: session.endTime.toISOString()
    };

    // Store summary in session for later retrieval
    session.summary = summary;

    // Automatically create harvest record for Go Wild session
    try {
      const harvest = await harvestService.createGoWildHarvest({
        farmId: session.farmId,
        farmName: `Go Wild Exploration - ${session.id.slice(0, 8)}`,
        sessionId: session.id,
        discoveries: session.explorationPath.discoveries,
        nodes: session.explorationPath.nodes,
        stats: session.stats,
        duration: summary.duration,
        completedAt: session.endTime,
        results: session.explorationPath.results || [],
        userId: 'dev-user' // TODO: Get from actual user context
      });

      session.harvestId = harvest.id;
      logger.info(`Created harvest ${harvest.id} for Go Wild session ${sessionId}`);
      
      // Auto-save high-impact discoveries
      const highImpactDiscoveries = session.explorationPath.discoveries.filter(d => d.impact === 'high');
      for (const discovery of highImpactDiscoveries) {
        discovery.saved = true;
        await harvestService.addArtifact(harvest.id, {
          id: discovery.id,
          type: 'discovery',
          name: discovery.title,
          path: `discoveries/${discovery.id}`,
          size: JSON.stringify(discovery).length,
          content: discovery,
          createdAt: discovery.timestamp
        });
      }

      // Broadcast completion with harvest ID
      this.broadcastUpdate(session, 'status-changed', { 
        status: 'completed',
        harvestId: harvest.id 
      });
      
      // Emit harvest-ready event with harvest ID
      WebSocketManager.broadcastToFarm(session.farmId, 'harvest:ready', {
        farmId: session.farmId,
        sessionId: session.id,
        harvestId: harvest.id,
        type: 'goWild',
        summary: summary,
        artifacts: session.explorationPath.discoveries.filter(d => d.saved),
        completedAt: session.endTime
      });

    } catch (error) {
      logger.error(`Failed to create harvest for Go Wild session ${sessionId}:`, error);
      // Still complete the session even if harvest creation fails
      this.broadcastUpdate(session, 'status-changed', { status: 'completed' });
    }

    // Clean up tmux session if it exists
    if (session.hasTmuxSession) {
      try {
        await TmuxHelper.cleanupGoWildSession(session.id);
        logger.info(`Cleaned up tmux session for Go Wild exploration: ${session.id}`);
      } catch (error) {
        logger.error(`Failed to cleanup tmux session for ${session.id}:`, error);
      }
    }

    logger.info(`Stopped exploration session ${sessionId}, harvest ready`, summary);

    return summary;
  }

  private startExplorationMonitoring(session: GoWildSession): void {
    const interval = setInterval(async () => {
      try {
        // Calculate progress metrics
        const elapsedTime = Date.now() - session.startTime.getTime();
        const maxTime = session.config.maxDuration * 60 * 1000;
        const progressPercentage = Math.min((elapsedTime / maxTime) * 100, 100);

        // Monitor tmux sessions if available
        let tmuxStatus = null;
        if (session.hasTmuxSession) {
          const agentOutputs = await TmuxHelper.monitorGoWildAgents(session.id);
          
          for (const [agentIndex, output] of agentOutputs) {
            if (output && output.includes('insights')) {
              this.parseDiscoveriesFromOutput(session, output);
            }
          }

          tmuxStatus = {
            activeAgents: agentOutputs.size,
            latestOutputs: Array.from(agentOutputs.entries()).map(([index, output]) => ({
              agentIndex: index,
              lastLines: output.split('\n').slice(-3).join('\n')
            }))
          };
        }

        // Broadcast real-time progress update
        const progressUpdate = {
          sessionId: session.id,
          farmId: session.farmId,
          status: session.status,
          progress: {
            percentage: progressPercentage,
            elapsedTime: Math.floor(elapsedTime / 1000),
            remainingTime: Math.floor((maxTime - elapsedTime) / 1000),
            nodesExplored: session.stats.nodesExplored,
            discoveriesMade: session.stats.discoveriesMade,
            averageCreativity: session.stats.averageCreativity,
            recentNodes: session.explorationPath.nodes.slice(-3).map(n => ({
              id: n.id,
              label: n.label,
              type: n.type,
              creativity: n.creativity
            })),
            recentDiscoveries: session.explorationPath.discoveries.slice(-2).map(d => ({
              id: d.id,
              title: d.title,
              impact: d.impact,
              saved: d.saved
            }))
          },
          tmuxStatus
        };

        WebSocketManager.broadcastToFarm(session.farmId, 'goWild:progress', progressUpdate);
        
        // Auto-save progress checkpoint every minute
        const minutesPassed = Math.floor(elapsedTime / 60000);
        if (minutesPassed > 0 && minutesPassed % 1 === 0 && elapsedTime % 60000 < 5000) {
          this.saveProgressCheckpoint(session);
        }
        
        // Stop monitoring if session is no longer exploring
        if (session.status !== 'exploring') {
          clearInterval(interval);
          this.monitoringIntervals.delete(session.id);
          logger.info(`Stopped monitoring for Go Wild session ${session.id}`);
        }
      } catch (error) {
        logger.error(`Error monitoring Go Wild session ${session.id}:`, error);
      }
    }, 5000); // Check every 5 seconds
    
    this.monitoringIntervals.set(session.id, interval);
    logger.info(`Started real-time monitoring for Go Wild session ${session.id}`);
  }

  private async saveProgressCheckpoint(session: GoWildSession) {
    try {
      // Auto-save high-impact discoveries
      const unsavedHighImpact = session.explorationPath.discoveries.filter(
        d => !d.saved && d.impact === 'high'
      );
      
      for (const discovery of unsavedHighImpact) {
        discovery.saved = true;
        logger.info(`Auto-saved high-impact discovery: ${discovery.id}`);
      }

      // Broadcast checkpoint event
      WebSocketManager.broadcastToFarm(session.farmId, 'goWild:checkpoint', {
        sessionId: session.id,
        savedDiscoveries: unsavedHighImpact.length,
        totalDiscoveries: session.explorationPath.discoveries.length,
        nodesExplored: session.stats.nodesExplored
      });

    } catch (error) {
      logger.error(`Failed to save progress checkpoint for session ${session.id}:`, error);
    }
  }

  private parseDiscoveriesFromOutput(session: GoWildSession, output: string) {
    // Parse tmux output for discoveries
    const lines = output.split('\n');
    const insightLines = lines.filter(line => line.includes('→') || line.includes('insights'));
    
    if (insightLines.length > 0) {
      // Create a discovery from parsed output
      const discovery: Discovery = {
        id: uuidv4(),
        nodeId: session.explorationPath.currentNodeId || '',
        title: 'Tmux Agent Discovery',
        description: insightLines.join(' '),
        impact: Math.random() > 0.7 ? 'high' : Math.random() > 0.4 ? 'medium' : 'low',
        category: 'Exploration',
        timestamp: new Date(),
        saved: false,
        metadata: {
          source: 'tmux',
          rawOutput: output
        }
      };

      session.explorationPath.discoveries.push(discovery);
      session.stats.discoveriesMade++;
      this.broadcastUpdate(session, 'discovery-made', { discovery });
      
      logger.info(`Parsed discovery from tmux output: ${discovery.id}`);
    }
  }

  /**
   * Capture real agent outputs from tmux sessions
   */
  private async captureAgentOutputs(session: GoWildSession): Promise<void> {
    try {
      logger.info(`[GoWild] Capturing agent outputs for session ${session.id}`);
      
      // Check if we launched via multiClaudeService (farm- prefix)
      const farmSessionName = `farm-${session.farmId.substring(0, 8)}`;
      
      // Also check for goWild- prefix tmux sessions
      const goWildSessionName = session.hasTmuxSession ? `goWild-${session.id}` : null;
      
      // Try to capture from farm session first (real Claude agents)
      const outputs: Map<number, string> = new Map();
      
      try {
        // Get the number of agents from session config
        const agentCount = session.config.explorationDepth || 3;
        
        for (let i = 0; i < agentCount; i++) {
          try {
            const { spawn } = await import('child_process');
            const output = await new Promise<string>((resolve) => {
              const captureProcess = spawn('tmux', [
                'capture-pane',
                '-t', `${farmSessionName}:0.${i}`,
                '-p',
                '-S', '-1000'  // Capture last 1000 lines
              ]);
              
              let data = '';
              captureProcess.stdout.on('data', chunk => data += chunk);
              captureProcess.on('close', () => resolve(data));
              captureProcess.on('error', () => resolve(''));
              
              // Timeout after 2 seconds
              setTimeout(() => resolve(data || ''), 2000);
            });
            
            if (output && output.trim()) {
              outputs.set(i, output);
              logger.info(`[GoWild] Captured ${output.length} chars from agent ${i}`);
              
              // Create a real result from the captured output
              const result = {
                id: uuidv4(),
                agentId: `agent-${i}`,
                agentName: `Go Wild Agent ${i + 1}`,
                agentType: 'explorer' as const,
                content: output,
                timestamp: new Date(),
                artifacts: []
              };
              
              // Add to exploration path results if not already there
              if (!session.explorationPath.results) {
                session.explorationPath.results = [];
              }
              session.explorationPath.results.push(result);
            }
          } catch (err) {
            logger.debug(`[GoWild] Could not capture from agent ${i}: ${err.message}`);
          }
        }
      } catch (err) {
        logger.warn(`[GoWild] Could not capture from farm session: ${err.message}`);
      }
      
      // Try goWild session as fallback
      if (goWildSessionName && outputs.size === 0) {
        try {
          const tmuxOutputs = await TmuxHelper.monitorGoWildAgents(session.id);
          for (const [index, output] of tmuxOutputs) {
            outputs.set(index, output);
          }
        } catch (err) {
          logger.debug(`[GoWild] Could not capture from goWild session: ${err.message}`);
        }
      }
      
      // Process captured outputs
      if (outputs.size > 0) {
        logger.info(`[GoWild] Processing ${outputs.size} agent outputs`);
        
        for (const [index, output] of outputs) {
          // Parse any discoveries or insights from the output
          if (output.includes('discovery') || output.includes('insight') || output.includes('found') || output.includes('improvement')) {
            this.parseDiscoveriesFromOutput(session, output);
          }
        }
      } else {
        logger.warn(`[GoWild] No agent outputs captured for session ${session.id}`);
      }
      
    } catch (error) {
      logger.error(`[GoWild] Error capturing agent outputs:`, error);
    }
  }

  async updateConfig(sessionId: string, config: GoWildConfig): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.config = { ...session.config, ...config };
    logger.info(`Updated configuration for session ${sessionId}`);
  }

  async updateBoundaries(sessionId: string, boundaries: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.config.boundaries = boundaries;
    logger.info(`Updated boundaries for session ${sessionId}`);
  }

  async saveDiscovery(sessionId: string, discoveryId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const discovery = session.explorationPath.discoveries.find(d => d.id === discoveryId);
    if (!discovery) {
      throw new Error('Discovery not found');
    }

    discovery.saved = true;
    logger.info(`Saved discovery ${discoveryId} from session ${sessionId}`);
  }

  async getSession(farmId: string): Promise<GoWildSession | null> {
    const sessionId = this.farmSessions.get(farmId);
    if (!sessionId) return null;
    return this.sessions.get(sessionId) || null;
  }

  async getSessionById(sessionId: string): Promise<GoWildSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  async listSessions(): Promise<GoWildSession[]> {
    return Array.from(this.sessions.values());
  }

  async getDiscoveries(sessionId: string): Promise<Discovery[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    return session.explorationPath.discoveries;
  }

  async rollbackToCheckpoint(sessionId: string, checkpointId: string): Promise<any> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Find the checkpoint node
    const checkpointIndex = session.explorationPath.nodes.findIndex(n => n.id === checkpointId);
    if (checkpointIndex === -1) {
      throw new Error('Checkpoint not found');
    }

    // Remove nodes and edges after checkpoint
    session.explorationPath.nodes = session.explorationPath.nodes.slice(0, checkpointIndex + 1);
    session.explorationPath.edges = session.explorationPath.edges.filter(edge => {
      return session.explorationPath.nodes.some(n => n.id === edge.source) &&
             session.explorationPath.nodes.some(n => n.id === edge.target);
    });
    
    // Remove discoveries after checkpoint
    session.explorationPath.discoveries = session.explorationPath.discoveries.filter(d => {
      return session.explorationPath.nodes.some(n => n.id === d.nodeId);
    });

    session.explorationPath.currentNodeId = checkpointId;
    session.stats.backtrackCount++;

    this.broadcastUpdate(session, 'path-changed', { 
      path: session.explorationPath,
      isBacktrack: true 
    });

    logger.info(`Rolled back session ${sessionId} to checkpoint ${checkpointId}`);

    return {
      nodesRemoved: checkpointIndex + 1,
      currentNodeId: checkpointId
    };
  }

  async emergencyStopAll(): Promise<any[]> {
    const results = [];
    
    for (const [sessionId, session] of this.sessions) {
      if (session.status === 'exploring') {
        try {
          const summary = await this.stopExploration(sessionId);
          results.push({ sessionId, status: 'stopped', summary });
        } catch (error) {
          results.push({ sessionId, status: 'error', error: error.message });
        }
      }
    }

    logger.warn('Emergency stop executed for all sessions', { count: results.length });
    return results;
  }

  /**
   * Determine appropriate thinking level based on Go Wild configuration
   */
  private determineThinkingLevel(config: GoWildConfig): ThinkingLevel {
    const creativity = config.creativityLevel;
    const depth = config.explorationDepth || 3;
    
    // Calculate a composite score
    const score = (creativity / 100) * 50 + (depth / 10) * 50;
    
    // Map score to thinking levels
    if (score < 20) return ThinkingLevel.NONE;
    if (score < 40) return ThinkingLevel.BASIC;
    if (score < 60) return ThinkingLevel.MODERATE;
    if (score < 80) return ThinkingLevel.DEEP;
    
    // Only use ULTRA for very high creativity and deep exploration
    if (creativity >= 90 && depth >= 8) {
      return ThinkingLevel.ULTRA;
    }
    
    return ThinkingLevel.DEEP;
  }
}

// Export singleton instance
export const goWildManager = new GoWildManager();