/**
 * Agent Handshake Service
 * 
 * Manages agent registration, connection state, and health monitoring.
 * Provides bidirectional communication between agents and orchestrator.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { pathConfig } from '../config/paths';
import { logger } from '../monitoring/logger';
import { WebSocketServer } from '../websocket/socketServer';

export enum AgentStatus {
  INITIALIZING = 'initializing',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  READY = 'ready',
  WORKING = 'working',
  IDLE = 'idle',
  ERROR = 'error',
  DISCONNECTED = 'disconnected',
  SHUTTING_DOWN = 'shutting_down'
}

export interface AgentInfo {
  agentId: string;
  agentName: string;
  agentIndex: number;
  farmId: string;
  sessionName: string;
  provider: string;
  status: AgentStatus;
  registeredAt: Date;
  lastHeartbeat: Date;
  currentTask?: any;
  completedTasks: number;
  capabilities?: {
    provider: string;
    model?: string;
    maxContext?: number;
  };
  error?: string;
}

export interface Task {
  taskId: string;
  prompt: string;
  context?: any;
  priority?: number;
  createdAt: Date;
  assignedAt?: Date;
  completedAt?: Date;
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed';
  assignedTo?: string;
  result?: string;
  error?: string;
}

class AgentHandshakeService extends EventEmitter {
  private agents: Map<string, AgentInfo> = new Map();
  private tasks: Map<string, Task> = new Map();
  private taskQueue: Task[] = [];
  private coordinationDir: string;
  private monitoringInterval: NodeJS.Timer | null = null;
  private readonly HEARTBEAT_TIMEOUT = 30000; // 30 seconds
  private readonly MONITORING_INTERVAL = 5000; // 5 seconds
  private wsServer: WebSocketServer | null = null;

  constructor() {
    super();
    const paths = pathConfig.getPaths();
    this.coordinationDir = paths.COORDINATION_DIR;
    this.initialize();
  }

  private async initialize() {
    // Ensure coordination directory exists
    await fs.mkdir(this.coordinationDir, { recursive: true });
    
    // Start monitoring agent registrations and health
    this.startMonitoring();
    
    // Watch for agent registrations
    this.watchRegistrations();
    
    // Watch for agent status updates
    this.watchStatusUpdates();
    
    // Watch for task responses
    this.watchResponses();
    
    logger.info('[AgentHandshake] Service initialized');
  }

  /**
   * Set WebSocket server for real-time communication
   */
  setWebSocketServer(wsServer: WebSocketServer) {
    this.wsServer = wsServer;
  }

  /**
   * Register a new agent
   */
  async registerAgent(agentInfo: Partial<AgentInfo>): Promise<void> {
    if (!agentInfo.agentId) {
      throw new Error('Agent ID is required');
    }

    const agent: AgentInfo = {
      agentId: agentInfo.agentId,
      agentName: agentInfo.agentName || `Agent ${agentInfo.agentIndex}`,
      agentIndex: agentInfo.agentIndex || 0,
      farmId: agentInfo.farmId || '',
      sessionName: agentInfo.sessionName || '',
      provider: agentInfo.provider || 'mock',
      status: agentInfo.status || AgentStatus.INITIALIZING,
      registeredAt: new Date(),
      lastHeartbeat: new Date(),
      completedTasks: 0,
      capabilities: agentInfo.capabilities
    };

    this.agents.set(agent.agentId, agent);
    
    // Emit registration event
    this.emit('agent:registered', agent);
    
    // Broadcast to WebSocket clients
    if (this.wsServer) {
      this.wsServer.broadcast('agent:registered', agent);
    }
    
    logger.info(`[AgentHandshake] Agent registered: ${agent.agentId} (${agent.agentName})`);
  }

  /**
   * Update agent status
   */
  async updateAgentStatus(agentId: string, status: AgentStatus, error?: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      logger.warn(`[AgentHandshake] Agent not found: ${agentId}`);
      return;
    }

    agent.status = status;
    agent.lastHeartbeat = new Date();
    
    if (error) {
      agent.error = error;
    }

    // Emit status update
    this.emit('agent:status', { agentId, status, error });
    
    // Broadcast to WebSocket clients
    if (this.wsServer) {
      this.wsServer.broadcast('agent:status', { agentId, status, error });
    }
    
    logger.debug(`[AgentHandshake] Agent ${agentId} status updated: ${status}`);
  }

  /**
   * Assign task to an available agent
   */
  async assignTask(task: Task): Promise<string | null> {
    // Find available agent
    const availableAgent = Array.from(this.agents.values()).find(
      agent => agent.status === AgentStatus.READY || agent.status === AgentStatus.IDLE
    );

    if (!availableAgent) {
      // Add to queue if no agent available
      this.taskQueue.push(task);
      logger.info(`[AgentHandshake] No available agent, task ${task.taskId} queued`);
      return null;
    }

    // Assign task to agent
    task.assignedTo = availableAgent.agentId;
    task.assignedAt = new Date();
    task.status = 'assigned';
    
    this.tasks.set(task.taskId, task);
    
    // Write task to agent's queue file
    const queueFile = path.join(this.coordinationDir, `agent_${availableAgent.agentId}_queue.json`);
    const existingQueue = await this.readJsonFile(queueFile) || [];
    existingQueue.push(task);
    await this.writeJsonFile(queueFile, existingQueue);
    
    // Update agent status
    await this.updateAgentStatus(availableAgent.agentId, AgentStatus.WORKING);
    availableAgent.currentTask = task;
    
    // Emit task assignment
    this.emit('task:assigned', { task, agentId: availableAgent.agentId });
    
    // Broadcast to WebSocket
    if (this.wsServer) {
      this.wsServer.broadcast('task:assigned', { task, agentId: availableAgent.agentId });
    }
    
    logger.info(`[AgentHandshake] Task ${task.taskId} assigned to agent ${availableAgent.agentId}`);
    
    return availableAgent.agentId;
  }

  /**
   * Get all connected agents
   */
  getConnectedAgents(): AgentInfo[] {
    return Array.from(this.agents.values()).filter(
      agent => agent.status !== AgentStatus.DISCONNECTED && 
               agent.status !== AgentStatus.ERROR
    );
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentInfo | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Check agent health
   */
  private checkAgentHealth(agent: AgentInfo): boolean {
    const now = Date.now();
    const lastHeartbeat = agent.lastHeartbeat.getTime();
    
    if (now - lastHeartbeat > this.HEARTBEAT_TIMEOUT) {
      // Agent is unresponsive
      return false;
    }
    
    return true;
  }

  /**
   * Start monitoring agents
   */
  private startMonitoring() {
    this.monitoringInterval = setInterval(() => {
      for (const agent of this.agents.values()) {
        if (!this.checkAgentHealth(agent)) {
          // Mark agent as disconnected
          this.updateAgentStatus(agent.agentId, AgentStatus.DISCONNECTED);
          logger.warn(`[AgentHandshake] Agent ${agent.agentId} marked as disconnected (no heartbeat)`);
        }
      }
      
      // Process queued tasks
      this.processQueuedTasks();
      
    }, this.MONITORING_INTERVAL);
  }

  /**
   * Process queued tasks
   */
  private async processQueuedTasks() {
    while (this.taskQueue.length > 0) {
      const task = this.taskQueue[0];
      const assigned = await this.assignTask(task);
      
      if (assigned) {
        this.taskQueue.shift(); // Remove from queue if assigned
      } else {
        break; // No available agents
      }
    }
  }

  /**
   * Watch for agent registrations
   */
  private async watchRegistrations() {
    const registrationFile = path.join(this.coordinationDir, 'agent_registrations.json');

    // Ensure the file exists before watching
    try {
      await fs.access(registrationFile);
    } catch {
      // Create the file if it doesn't exist
      try {
        await fs.writeFile(registrationFile, JSON.stringify({ agents: [] }, null, 2));
        logger.info('[AgentHandshake] Created default registration file');
      } catch (writeError) {
        logger.error('[AgentHandshake] Failed to create registration file:', writeError);
        return;
      }
    }

    // Initial load
    await this.loadRegistrations(registrationFile);

    // Watch for changes
    try {
      const watcher = fs.watch(registrationFile);

      for await (const event of watcher) {
        if (event.eventType === 'change') {
          await this.loadRegistrations(registrationFile);
        }
      }
    } catch (error) {
      logger.error('[AgentHandshake] Error watching registrations:', error);
      // Retry watching after a delay
      setTimeout(() => this.watchRegistrations(), 5000);
    }
  }

  /**
   * Load agent registrations from file
   */
  private async loadRegistrations(filePath: string) {
    try {
      const data = await this.readJsonFile(filePath);
      if (!data || !Array.isArray(data)) return;
      
      for (const registration of data) {
        if (!this.agents.has(registration.agent_id)) {
          await this.registerAgent({
            agentId: registration.agent_id,
            agentName: registration.agent_name,
            agentIndex: registration.agent_index,
            farmId: registration.farm_id,
            sessionName: registration.session_name,
            provider: registration.provider,
            status: registration.status as AgentStatus,
            capabilities: registration.capabilities
          });
        }
      }
    } catch (error) {
      // File might not exist yet
      if ((error as any).code !== 'ENOENT') {
        logger.error('[AgentHandshake] Error loading registrations:', error);
      }
    }
  }

  /**
   * Watch for agent status updates
   */
  private async watchStatusUpdates() {
    const statusPattern = path.join(this.coordinationDir, 'agent_*_status.json');
    
    // Watch coordination directory for status files
    try {
      const watcher = fs.watch(this.coordinationDir);
      
      for await (const event of watcher) {
        if (event.filename && event.filename.includes('_status.json')) {
          const filePath = path.join(this.coordinationDir, event.filename);
          await this.loadAgentStatus(filePath);
        }
      }
    } catch (error) {
      logger.error('[AgentHandshake] Error watching status updates:', error);
    }
  }

  /**
   * Load agent status from file
   */
  private async loadAgentStatus(filePath: string) {
    try {
      const data = await this.readJsonFile(filePath);
      if (!data) return;
      
      const agentId = data.agent_id;
      if (!agentId) return;
      
      const agent = this.agents.get(agentId);
      if (agent) {
        agent.status = data.status as AgentStatus;
        agent.lastHeartbeat = new Date(data.last_update);
        agent.currentTask = data.current_task;
        agent.completedTasks = data.completed_tasks || 0;
        agent.error = data.error;
        
        // Emit status update
        this.emit('agent:heartbeat', agent);
        
        // Broadcast heartbeat
        if (this.wsServer) {
          this.wsServer.broadcast('agent:heartbeat', {
            agentId: agent.agentId,
            status: agent.status,
            lastHeartbeat: agent.lastHeartbeat
          });
        }
      }
    } catch (error) {
      // File might not exist or be incomplete
      if ((error as any).code !== 'ENOENT') {
        logger.error('[AgentHandshake] Error loading agent status:', error);
      }
    }
  }

  /**
   * Watch for task responses
   */
  private async watchResponses() {
    const responseDir = path.join(this.coordinationDir, 'agent_responses');
    
    // Ensure directory exists
    await fs.mkdir(responseDir, { recursive: true });
    
    try {
      const watcher = fs.watch(responseDir);
      
      for await (const event of watcher) {
        if (event.filename && event.filename.endsWith('_response.json')) {
          const filePath = path.join(responseDir, event.filename);
          await this.loadTaskResponse(filePath);
        }
      }
    } catch (error) {
      logger.error('[AgentHandshake] Error watching responses:', error);
    }
  }

  /**
   * Load task response from file
   */
  private async loadTaskResponse(filePath: string) {
    try {
      const data = await this.readJsonFile(filePath);
      if (!data || !data.task) return;
      
      const task = data.task;
      const taskId = task.task_id;
      
      if (this.tasks.has(taskId)) {
        const storedTask = this.tasks.get(taskId)!;
        storedTask.status = task.status;
        storedTask.result = task.result;
        storedTask.error = task.error;
        storedTask.completedAt = new Date(task.completed_at);
        
        // Update agent status
        if (task.status === 'completed' && storedTask.assignedTo) {
          const agent = this.agents.get(storedTask.assignedTo);
          if (agent) {
            agent.completedTasks++;
            agent.currentTask = undefined;
            await this.updateAgentStatus(agent.agentId, AgentStatus.READY);
          }
        }
        
        // Emit task completion
        this.emit('task:completed', storedTask);
        
        // Broadcast to WebSocket
        if (this.wsServer) {
          this.wsServer.broadcast('task:completed', storedTask);
        }
        
        logger.info(`[AgentHandshake] Task ${taskId} completed`);
        
        // Remove response file after processing
        await fs.unlink(filePath).catch(() => {});
      }
    } catch (error) {
      logger.error('[AgentHandshake] Error loading task response:', error);
    }
  }

  /**
   * Read JSON file safely
   */
  private async readJsonFile(filePath: string): Promise<any> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  /**
   * Write JSON file atomically
   */
  private async writeJsonFile(filePath: string, data: any): Promise<void> {
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
    await fs.rename(tempPath, filePath);
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    // Mark all agents as disconnected
    for (const agent of this.agents.values()) {
      await this.updateAgentStatus(agent.agentId, AgentStatus.DISCONNECTED);
    }
    
    logger.info('[AgentHandshake] Service cleaned up');
  }
}

// Export singleton instance
export const agentHandshakeService = new AgentHandshakeService();

// Export types
export type { Task };