/**
 * File-Based Coordination Service
 * Implements XenoSync-style JSON file coordination instead of database operations
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { pathConfig } from '../config/paths';
import chokidar from 'chokidar';

interface CoordinationMessage {
  id: string;
  from: string;
  to: string | 'all';
  type: 'task' | 'status' | 'claim' | 'release' | 'sync' | 'complete';
  content: any;
  timestamp: Date;
  processed: boolean;
}

interface AgentState {
  agentId: number;
  farmId: string;
  status: 'idle' | 'working' | 'completed' | 'error';
  currentTask?: string;
  claimedTasks: string[];
  completedTasks: string[];
  lastUpdate: Date;
  metadata?: any;
}

interface TaskClaim {
  taskId: string;
  agentId: number;
  claimedAt: Date;
  status: 'active' | 'completed' | 'abandoned';
}

interface SessionState {
  sessionId: string;
  farmId: string;
  agents: Map<number, AgentState>;
  tasks: Map<string, TaskClaim>;
  messages: CoordinationMessage[];
  startTime: Date;
  lastUpdate: Date;
}

export class FileBasedCoordination extends EventEmitter {
  private coordinationRoot: string;
  private sessions: Map<string, SessionState> = new Map();
  private watchers: Map<string, chokidar.FSWatcher> = new Map();
  private messageQueue: Map<string, CoordinationMessage[]> = new Map();
  private readonly MESSAGE_CHECK_INTERVAL = 1000; // 1 second
  private messageCheckTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    const paths = pathConfig.getPaths();
    this.coordinationRoot = path.join(paths.COORDINATION_DIR, 'sessions');
    this.initializeCoordination();
  }

  /**
   * Initialize coordination directories
   */
  private async initializeCoordination(): Promise<void> {
    try {
      await fs.mkdir(this.coordinationRoot, { recursive: true });
      await fs.mkdir(path.join(this.coordinationRoot, 'messages'), { recursive: true });
      await fs.mkdir(path.join(this.coordinationRoot, 'states'), { recursive: true });
      await fs.mkdir(path.join(this.coordinationRoot, 'claims'), { recursive: true });
      
      logger.info('[FileCoordination] Initialized coordination directories');
      
      // Start message processing loop
      this.startMessageProcessing();
    } catch (error) {
      logger.error('[FileCoordination] Failed to initialize:', error);
    }
  }

  /**
   * Initialize a coordination session
   */
  async initializeSession(farmId: string, numberOfAgents: number): Promise<string> {
    const sessionId = `session-${farmId}-${Date.now()}`;
    
    // Create session directories
    const sessionDir = path.join(this.coordinationRoot, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.mkdir(path.join(sessionDir, 'agents'), { recursive: true });
    await fs.mkdir(path.join(sessionDir, 'messages'), { recursive: true });
    await fs.mkdir(path.join(sessionDir, 'claims'), { recursive: true });
    
    // Initialize session state
    const sessionState: SessionState = {
      sessionId,
      farmId,
      agents: new Map(),
      tasks: new Map(),
      messages: [],
      startTime: new Date(),
      lastUpdate: new Date()
    };
    
    // Initialize agent states
    for (let i = 0; i < numberOfAgents; i++) {
      const agentState: AgentState = {
        agentId: i,
        farmId,
        status: 'idle',
        claimedTasks: [],
        completedTasks: [],
        lastUpdate: new Date()
      };
      
      sessionState.agents.set(i, agentState);
      
      // Write initial agent state file
      await this.writeAgentState(sessionId, i, agentState);
    }
    
    // Store session
    this.sessions.set(sessionId, sessionState);
    
    // Write session metadata
    await this.writeSessionMetadata(sessionId, sessionState);
    
    // Set up file watching for this session
    this.setupSessionWatcher(sessionId);
    
    logger.info(`[FileCoordination] Initialized session ${sessionId} with ${numberOfAgents} agents`);
    
    return sessionId;
  }

  /**
   * Write agent state to file
   */
  private async writeAgentState(sessionId: string, agentId: number, state: AgentState): Promise<void> {
    const statePath = path.join(this.coordinationRoot, sessionId, 'agents', `agent-${agentId}.json`);
    await fs.writeFile(statePath, JSON.stringify(state, null, 2));
  }

  /**
   * Read agent state from file
   */
  private async readAgentState(sessionId: string, agentId: number): Promise<AgentState | null> {
    try {
      const statePath = path.join(this.coordinationRoot, sessionId, 'agents', `agent-${agentId}.json`);
      const data = await fs.readFile(statePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      logger.error(`[FileCoordination] Failed to read agent ${agentId} state:`, error);
      return null;
    }
  }

  /**
   * Write session metadata
   */
  private async writeSessionMetadata(sessionId: string, state: SessionState): Promise<void> {
    const metadataPath = path.join(this.coordinationRoot, sessionId, 'session.json');
    const metadata = {
      sessionId: state.sessionId,
      farmId: state.farmId,
      agentCount: state.agents.size,
      taskCount: state.tasks.size,
      messageCount: state.messages.length,
      startTime: state.startTime,
      lastUpdate: state.lastUpdate
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Send a coordination message
   */
  async sendMessage(sessionId: string, message: Omit<CoordinationMessage, 'id' | 'timestamp' | 'processed'>): Promise<void> {
    const fullMessage: CoordinationMessage = {
      ...message,
      id: uuidv4(),
      timestamp: new Date(),
      processed: false
    };
    
    // Write message to file
    const messagePath = path.join(
      this.coordinationRoot,
      sessionId,
      'messages',
      `${Date.now()}-${fullMessage.id}.json`
    );
    
    await fs.writeFile(messagePath, JSON.stringify(fullMessage, null, 2));
    
    // Add to session messages
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages.push(fullMessage);
      session.lastUpdate = new Date();
    }
    
    // Add to message queue for processing
    const queue = this.messageQueue.get(sessionId) || [];
    queue.push(fullMessage);
    this.messageQueue.set(sessionId, queue);
    
    logger.debug(`[FileCoordination] Sent message ${fullMessage.type} from ${fullMessage.from} to ${fullMessage.to}`);
  }

  /**
   * Claim a task for an agent (conflict-free)
   */
  async claimTask(sessionId: string, agentId: number, taskId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    
    // Check if task is already claimed
    const existingClaim = session.tasks.get(taskId);
    if (existingClaim && existingClaim.status === 'active') {
      return false; // Already claimed by another agent
    }
    
    // Create claim file (atomic operation)
    const claimPath = path.join(this.coordinationRoot, sessionId, 'claims', `${taskId}.json`);
    
    try {
      // Try to create file exclusively (will fail if exists)
      await fs.writeFile(claimPath, JSON.stringify({
        taskId,
        agentId,
        claimedAt: new Date(),
        status: 'active'
      }, null, 2), { flag: 'wx' }); // 'wx' flag ensures exclusive creation
      
      // Update in-memory state
      const claim: TaskClaim = {
        taskId,
        agentId,
        claimedAt: new Date(),
        status: 'active'
      };
      
      session.tasks.set(taskId, claim);
      
      // Update agent state
      const agentState = session.agents.get(agentId);
      if (agentState) {
        agentState.currentTask = taskId;
        agentState.claimedTasks.push(taskId);
        agentState.status = 'working';
        agentState.lastUpdate = new Date();
        
        await this.writeAgentState(sessionId, agentId, agentState);
      }
      
      // Send claim message
      await this.sendMessage(sessionId, {
        from: `agent-${agentId}`,
        to: 'all',
        type: 'claim',
        content: { taskId, agentId }
      });
      
      logger.info(`[FileCoordination] Agent ${agentId} claimed task ${taskId}`);
      return true;
      
    } catch (error: any) {
      if (error.code === 'EEXIST') {
        logger.debug(`[FileCoordination] Task ${taskId} already claimed`);
        return false;
      }
      logger.error(`[FileCoordination] Error claiming task ${taskId}:`, error);
      return false;
    }
  }

  /**
   * Release a task claim
   */
  async releaseTask(sessionId: string, agentId: number, taskId: string, completed: boolean = false): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    const claim = session.tasks.get(taskId);
    if (!claim || claim.agentId !== agentId) return;
    
    // Update claim status
    claim.status = completed ? 'completed' : 'abandoned';
    
    // Update claim file
    const claimPath = path.join(this.coordinationRoot, sessionId, 'claims', `${taskId}.json`);
    await fs.writeFile(claimPath, JSON.stringify(claim, null, 2));
    
    // Update agent state
    const agentState = session.agents.get(agentId);
    if (agentState) {
      if (agentState.currentTask === taskId) {
        agentState.currentTask = undefined;
      }
      
      if (completed) {
        agentState.completedTasks.push(taskId);
      }
      
      agentState.status = agentState.completedTasks.length > 0 ? 'completed' : 'idle';
      agentState.lastUpdate = new Date();
      
      await this.writeAgentState(sessionId, agentId, agentState);
    }
    
    // Send release message
    await this.sendMessage(sessionId, {
      from: `agent-${agentId}`,
      to: 'all',
      type: 'release',
      content: { taskId, completed }
    });
    
    logger.info(`[FileCoordination] Agent ${agentId} released task ${taskId} (completed: ${completed})`);
  }

  /**
   * Get available tasks (not claimed)
   */
  async getAvailableTasks(sessionId: string, allTasks: string[]): Promise<string[]> {
    const session = this.sessions.get(sessionId);
    if (!session) return allTasks;
    
    const claimedTasks = new Set<string>();
    for (const [taskId, claim] of session.tasks) {
      if (claim.status === 'active') {
        claimedTasks.add(taskId);
      }
    }
    
    return allTasks.filter(task => !claimedTasks.has(task));
  }

  /**
   * Update agent status
   */
  async updateAgentStatus(sessionId: string, agentId: number, status: AgentState['status'], metadata?: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    const agentState = session.agents.get(agentId);
    if (!agentState) return;
    
    agentState.status = status;
    agentState.lastUpdate = new Date();
    if (metadata) {
      agentState.metadata = metadata;
    }
    
    await this.writeAgentState(sessionId, agentId, agentState);
    
    // Send status update message
    await this.sendMessage(sessionId, {
      from: `agent-${agentId}`,
      to: 'all',
      type: 'status',
      content: { status, metadata }
    });
    
    this.emit('agent:status:changed', {
      sessionId,
      agentId,
      status,
      metadata
    });
  }

  /**
   * Setup file watcher for a session
   */
  private setupSessionWatcher(sessionId: string): void {
    const sessionDir = path.join(this.coordinationRoot, sessionId);
    
    const watcher = chokidar.watch(sessionDir, {
      persistent: true,
      ignoreInitial: true,
      depth: 2
    });
    
    watcher.on('add', (filePath) => {
      this.handleFileAdded(sessionId, filePath);
    });
    
    watcher.on('change', (filePath) => {
      this.handleFileChanged(sessionId, filePath);
    });
    
    this.watchers.set(sessionId, watcher);
    
    logger.debug(`[FileCoordination] Set up file watcher for session ${sessionId}`);
  }

  /**
   * Handle new file added
   */
  private async handleFileAdded(sessionId: string, filePath: string): Promise<void> {
    if (filePath.includes('/messages/')) {
      // New message added
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const message = JSON.parse(content) as CoordinationMessage;
        
        this.emit('message:received', {
          sessionId,
          message
        });
        
        logger.debug(`[FileCoordination] New message detected: ${message.type} from ${message.from}`);
      } catch (error) {
        logger.error('[FileCoordination] Error reading new message:', error);
      }
    }
  }

  /**
   * Handle file changed
   */
  private async handleFileChanged(sessionId: string, filePath: string): Promise<void> {
    if (filePath.includes('/agents/')) {
      // Agent state changed
      const match = filePath.match(/agent-(\d+)\.json$/);
      if (match) {
        const agentId = parseInt(match[1]);
        const state = await this.readAgentState(sessionId, agentId);
        
        if (state) {
          const session = this.sessions.get(sessionId);
          if (session) {
            session.agents.set(agentId, state);
          }
          
          this.emit('agent:state:changed', {
            sessionId,
            agentId,
            state
          });
        }
      }
    }
  }

  /**
   * Start message processing loop
   */
  private startMessageProcessing(): void {
    this.messageCheckTimer = setInterval(() => {
      this.processMessageQueues();
    }, this.MESSAGE_CHECK_INTERVAL);
  }

  /**
   * Process message queues for all sessions
   */
  private async processMessageQueues(): Promise<void> {
    for (const [sessionId, messages] of this.messageQueue) {
      if (messages.length === 0) continue;
      
      // Process up to 10 messages at a time
      const toProcess = messages.splice(0, 10);
      
      for (const message of toProcess) {
        await this.processMessage(sessionId, message);
      }
      
      // Update queue
      if (messages.length === 0) {
        this.messageQueue.delete(sessionId);
      }
    }
  }

  /**
   * Process a single message
   */
  private async processMessage(sessionId: string, message: CoordinationMessage): Promise<void> {
    // Route message to appropriate agents
    if (message.to === 'all') {
      this.emit('broadcast:message', {
        sessionId,
        message
      });
    } else {
      this.emit('direct:message', {
        sessionId,
        to: message.to,
        message
      });
    }
    
    // Mark message as processed
    message.processed = true;
  }

  /**
   * Get session status
   */
  getSessionStatus(sessionId: string): any {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    
    const agents = Array.from(session.agents.values());
    const tasks = Array.from(session.tasks.values());
    
    return {
      sessionId,
      farmId: session.farmId,
      agentCount: agents.length,
      agents: agents.map(a => ({
        agentId: a.agentId,
        status: a.status,
        completedTasks: a.completedTasks.length,
        currentTask: a.currentTask
      })),
      taskStats: {
        total: tasks.length,
        active: tasks.filter(t => t.status === 'active').length,
        completed: tasks.filter(t => t.status === 'completed').length
      },
      messageCount: session.messages.length,
      startTime: session.startTime,
      uptime: Date.now() - session.startTime.getTime()
    };
  }

  /**
   * Clean up session
   */
  async cleanupSession(sessionId: string): Promise<void> {
    // Stop watcher
    const watcher = this.watchers.get(sessionId);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(sessionId);
    }
    
    // Remove from memory
    this.sessions.delete(sessionId);
    this.messageQueue.delete(sessionId);
    
    // Optionally remove files (keep for history)
    // const sessionDir = path.join(this.coordinationRoot, sessionId);
    // await fs.rm(sessionDir, { recursive: true, force: true });
    
    logger.info(`[FileCoordination] Cleaned up session ${sessionId}`);
  }

  /**
   * Stop all coordination
   */
  async shutdown(): Promise<void> {
    // Stop message processing
    if (this.messageCheckTimer) {
      clearInterval(this.messageCheckTimer);
      this.messageCheckTimer = null;
    }
    
    // Close all watchers
    for (const [sessionId, watcher] of this.watchers) {
      await watcher.close();
    }
    
    this.watchers.clear();
    this.sessions.clear();
    this.messageQueue.clear();
    
    logger.info('[FileCoordination] Shutdown complete');
  }
}

// Export singleton instance
export const fileCoordination = new FileBasedCoordination();