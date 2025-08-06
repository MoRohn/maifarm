import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { GoWildSession, GoWildConfig, Discovery, ExplorationNode } from '../../src/types/goWild';
import { agentManager } from './agentManager';
import { SafetyManager } from './safetyManager';
import { claudeCodeCoordinator } from './claudeCodeCoordinator';
import { harvestService } from './harvestService';
import logger from '../utils/logger';
import { WebSocketManager } from '../websocket/websocketManager';

export class GoWildManager extends EventEmitter {
  private sessions: Map<string, GoWildSession> = new Map();
  private farmSessions: Map<string, string> = new Map(); // farmId -> sessionId
  private safetyManager: SafetyManager;
  private explorationTimers: Map<string, NodeJS.Timeout> = new Map();

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
        currentNodeId: null
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

    // Set timeout for max duration
    const timeout = setTimeout(() => {
      this.stopExploration(session.id);
    }, config.maxDuration * 60 * 1000);

    this.explorationTimers.set(session.id, timeout);

    logger.info(`Started Go Wild exploration for farm ${farmId}`, { sessionId: session.id });

    return session;
  }

  private async startExplorationProcess(session: GoWildSession) {
    try {
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
      { type: 'documentation', label: 'Documentation gaps', category: 'Documentation' }
    ];

    // Filter tasks based on focus areas if specified
    if (session.config.focusAreas && session.config.focusAreas.length > 0) {
      return baseTasks.filter(task => 
        session.config.focusAreas.some(area => 
          task.label.toLowerCase().includes(area.toLowerCase()) ||
          task.category.toLowerCase().includes(area.toLowerCase())
        )
      );
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

    session.status = 'completed';
    session.endTime = new Date();

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
        completedAt: session.endTime
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

    logger.info(`Stopped exploration session ${sessionId}, harvest ready`, summary);

    return summary;
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
}

// Export singleton instance
export const goWildManager = new GoWildManager();