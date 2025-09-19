import { EventEmitter } from 'events';
import { logger, LogCategory } from '../utils/logger';

interface AgentStatus {
  agentId: string;
  farmId: string;
  status: 'idle' | 'busy' | 'error';
  lastActivity: Date;
}

class AgentCoordinatorV2 extends EventEmitter {
  private static instance: AgentCoordinatorV2;
  private agents = new Map<string, AgentStatus>();
  private redis: any = null;
  private running = false;

  private constructor() {
    super();
  }

  static getInstance(): AgentCoordinatorV2 {
    if (!this.instance) {
      this.instance = new AgentCoordinatorV2();
    }
    return this.instance;
  }

  setRedis(redis: any): void {
    this.redis = redis;
    logger.info(LogCategory.AGENT, 'Redis connection set for AgentCoordinatorV2');
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    logger.info(LogCategory.AGENT, 'AgentCoordinatorV2 started');

    // Emit periodic metrics for testing
    setInterval(() => {
      if (this.running) {
        this.emit('farm:metrics', {
          timestamp: new Date(),
          activeAgents: this.agents.size,
          totalTasks: 0
        });
      }
    }, 30000);
  }

  stop(): void {
    this.running = false;
    this.agents.clear();
    logger.info(LogCategory.AGENT, 'AgentCoordinatorV2 stopped');
  }

  registerAgent(agentId: string, farmId: string): void {
    this.agents.set(agentId, {
      agentId,
      farmId,
      status: 'idle',
      lastActivity: new Date()
    });

    logger.info(LogCategory.AGENT, `Agent ${agentId} registered for farm ${farmId}`);
  }

  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
    logger.info(LogCategory.AGENT, `Agent ${agentId} unregistered`);
  }

  updateAgentStatus(agentId: string, status: 'idle' | 'busy' | 'error'): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status;
      agent.lastActivity = new Date();
    }
  }

  getAgentStatus(agentId: string): AgentStatus | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): AgentStatus[] {
    return Array.from(this.agents.values());
  }

  completeTask(agentId: string, taskId: string, result: any): void {
    this.emit('task:completed', {
      agentId,
      taskId,
      result,
      timestamp: new Date()
    });

    logger.info(LogCategory.AGENT, `Task ${taskId} completed by agent ${agentId}`);
  }
}

export const agentCoordinatorV2 = AgentCoordinatorV2.getInstance();
export { AgentCoordinatorV2 };