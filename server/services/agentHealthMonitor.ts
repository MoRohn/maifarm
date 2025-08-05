import { promises as fs } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import type { 
  AgentHealth, 
  AgentHealthStatus, 
  HeartbeatData, 
  AgentHealthConfig,
  AgentHealthSummary,
  AdaptiveTimeoutConfig
} from '../types/agentHealth.js';
import { logger } from '../utils/logger.js';

export class AgentHealthMonitor extends EventEmitter {
  private agents: Map<string, AgentHealth> = new Map();
  private heartbeatDir: string;
  private checkInterval: NodeJS.Timeout | null = null;
  
  private config: AgentHealthConfig = {
    heartbeatInterval: 30000, // 30 seconds
    timeoutMultiplier: 3,
    maxContextPercentage: 85,
    staleHeartbeatMinutes: 5,
    errorCountThreshold: 3
  };
  
  private adaptiveConfig: AdaptiveTimeoutConfig = {
    minTimeout: 10000, // 10 seconds
    maxTimeout: 300000, // 5 minutes
    windowSize: 10
  };
  
  private cycleTimes: Map<string, number[]> = new Map();

  constructor(heartbeatDir: string = '/tmp/claude_coordination/heartbeats') {
    super();
    this.heartbeatDir = heartbeatDir;
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.heartbeatDir, { recursive: true });
      await this.loadExistingHeartbeats();
      this.startMonitoring();
      logger.info('Agent health monitor initialized', { heartbeatDir: this.heartbeatDir });
    } catch (error) {
      logger.error('Failed to initialize agent health monitor', { error });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.removeAllListeners();
    logger.info('Agent health monitor shut down');
  }

  async updateHeartbeat(data: HeartbeatData): Promise<void> {
    const { agentId, timestamp, contextPercentage, currentTask, error } = data;
    
    try {
      const agent = this.agents.get(agentId) || this.createNewAgent(agentId);
      
      // Calculate cycle time
      const cycleTime = timestamp.getTime() - agent.lastHeartbeat.getTime();
      if (cycleTime > 0 && cycleTime < this.adaptiveConfig.maxTimeout) {
        this.updateCycleTimes(agentId, cycleTime);
      }
      
      // Update agent data
      agent.lastHeartbeat = timestamp;
      agent.totalCycles++;
      
      if (contextPercentage !== undefined) {
        agent.contextPercentage = contextPercentage;
      }
      
      if (error) {
        agent.errorCount++;
        agent.lastError = error;
        agent.status = agent.errorCount >= this.config.errorCountThreshold ? 'error' : agent.status;
      } else {
        agent.status = 'working';
        agent.errorCount = Math.max(0, agent.errorCount - 1); // Decay error count
      }
      
      if (currentTask) {
        agent.metadata = { ...agent.metadata, currentTask };
      }
      
      // Calculate average cycle time
      const cycles = this.cycleTimes.get(agentId) || [];
      agent.cycleTime = cycles.length > 0 
        ? cycles.reduce((a, b) => a + b, 0) / cycles.length 
        : this.config.heartbeatInterval;
      
      this.agents.set(agentId, agent);
      
      // Write heartbeat file
      await this.writeHeartbeatFile(agent);
      
      // Emit events
      this.emit('heartbeat', agent);
      
      if (agent.contextPercentage >= this.config.maxContextPercentage) {
        this.emit('contextWarning', agent);
      }
      
    } catch (error) {
      logger.error('Failed to update heartbeat', { agentId, error });
      throw error;
    }
  }

  getAgentHealth(agentId: string): AgentHealth | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): AgentHealth[] {
    return Array.from(this.agents.values());
  }

  detectHealthStatus(): AgentHealth[] {
    const now = new Date();
    const agents = this.getAllAgents();
    
    agents.forEach(agent => {
      const timeSinceLastHeartbeat = now.getTime() - agent.lastHeartbeat.getTime();
      const adaptiveTimeout = this.calculateAdaptiveTimeout(agent.agentId);
      
      if (timeSinceLastHeartbeat > adaptiveTimeout) {
        if (timeSinceLastHeartbeat > this.config.staleHeartbeatMinutes * 60 * 1000) {
          agent.status = 'disabled';
        } else {
          agent.status = 'idle';
        }
      }
    });
    
    return agents;
  }

  calculateAdaptiveTimeout(agentId: string): number {
    const agent = this.agents.get(agentId);
    if (!agent) return this.config.heartbeatInterval * this.config.timeoutMultiplier;
    
    const cycles = this.cycleTimes.get(agentId) || [];
    if (cycles.length === 0) {
      return this.config.heartbeatInterval * this.config.timeoutMultiplier;
    }
    
    // Calculate standard deviation
    const mean = cycles.reduce((a, b) => a + b, 0) / cycles.length;
    const variance = cycles.reduce((sum, time) => sum + Math.pow(time - mean, 2), 0) / cycles.length;
    const stdDev = Math.sqrt(variance);
    
    // Adaptive timeout = mean + (multiplier * stdDev)
    const adaptiveTimeout = mean + (this.config.timeoutMultiplier * stdDev);
    
    // Clamp between min and max
    return Math.max(
      this.adaptiveConfig.minTimeout,
      Math.min(this.adaptiveConfig.maxTimeout, adaptiveTimeout)
    );
  }

  getSummary(): AgentHealthSummary {
    const agents = this.detectHealthStatus();
    
    const summary: AgentHealthSummary = {
      totalAgents: agents.length,
      workingAgents: agents.filter(a => a.status === 'working').length,
      idleAgents: agents.filter(a => a.status === 'idle').length,
      errorAgents: agents.filter(a => a.status === 'error').length,
      disabledAgents: agents.filter(a => a.status === 'disabled').length,
      averageContextUsage: 0,
      averageCycleTime: 0
    };
    
    if (agents.length > 0) {
      summary.averageContextUsage = agents.reduce((sum, a) => sum + a.contextPercentage, 0) / agents.length;
      summary.averageCycleTime = agents.reduce((sum, a) => sum + a.cycleTime, 0) / agents.length;
    }
    
    return summary;
  }

  private createNewAgent(agentId: string): AgentHealth {
    const now = new Date();
    return {
      agentId,
      status: 'idle',
      lastHeartbeat: now,
      contextPercentage: 0,
      cycleTime: this.config.heartbeatInterval,
      errorCount: 0,
      startTime: now,
      totalCycles: 0,
      metadata: {}
    };
  }

  private updateCycleTimes(agentId: string, cycleTime: number): void {
    const times = this.cycleTimes.get(agentId) || [];
    times.push(cycleTime);
    
    // Keep only the last windowSize cycles
    if (times.length > this.adaptiveConfig.windowSize) {
      times.shift();
    }
    
    this.cycleTimes.set(agentId, times);
  }

  private async writeHeartbeatFile(agent: AgentHealth): Promise<void> {
    const filename = path.join(this.heartbeatDir, `${agent.agentId}.json`);
    const data = {
      ...agent,
      lastHeartbeat: agent.lastHeartbeat.toISOString(),
      startTime: agent.startTime.toISOString()
    };
    
    await fs.writeFile(filename, JSON.stringify(data, null, 2), 'utf-8');
  }

  private async loadExistingHeartbeats(): Promise<void> {
    try {
      const files = await fs.readdir(this.heartbeatDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(this.heartbeatDir, file), 'utf-8');
            const data = JSON.parse(content);
            
            const agent: AgentHealth = {
              ...data,
              lastHeartbeat: new Date(data.lastHeartbeat),
              startTime: new Date(data.startTime)
            };
            
            this.agents.set(agent.agentId, agent);
          } catch (error) {
            logger.warn('Failed to load heartbeat file', { file, error });
          }
        }
      }
      
      logger.info('Loaded existing heartbeats', { count: this.agents.size });
    } catch (error) {
      logger.warn('Failed to load existing heartbeats', { error });
    }
  }

  private startMonitoring(): void {
    // Check agent health every 10 seconds
    this.checkInterval = setInterval(() => {
      this.detectHealthStatus();
      this.emit('healthCheck', this.getSummary());
      this.cleanupStaleAgents();
    }, 10000);
  }

  private async cleanupStaleAgents(): Promise<void> {
    const now = new Date();
    const staleThreshold = this.config.staleHeartbeatMinutes * 60 * 1000 * 2; // 2x stale threshold
    
    for (const [agentId, agent] of this.agents) {
      if (now.getTime() - agent.lastHeartbeat.getTime() > staleThreshold) {
        this.agents.delete(agentId);
        this.cycleTimes.delete(agentId);
        
        try {
          await fs.unlink(path.join(this.heartbeatDir, `${agentId}.json`));
        } catch (error) {
          // File might not exist
        }
        
        logger.info('Cleaned up stale agent', { agentId });
      }
    }
  }
}

// Singleton instance
let instance: AgentHealthMonitor | null = null;

export function getAgentHealthMonitor(heartbeatDir?: string): AgentHealthMonitor {
  if (!instance) {
    instance = new AgentHealthMonitor(heartbeatDir);
  }
  return instance;
}