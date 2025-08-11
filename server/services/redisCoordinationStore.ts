/**
 * Redis Coordination Store
 * Replaces file-based coordination with Redis-backed state management
 * Eliminates race conditions and provides atomic operations
 */

import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export interface AgentState {
  id: string;
  farmId: string;
  sessionId: string;
  status: 'initializing' | 'ready' | 'working' | 'idle' | 'error' | 'timeout' | 'stopped';
  tmuxPane: string;
  startTime: Date;
  lastHeartbeat: Date;
  currentTask?: string;
  metadata: Record<string, any>;
}

export interface FarmState {
  id: string;
  status: 'launching' | 'running' | 'stopping' | 'stopped' | 'error' | 'timeout';
  sessionId: string;
  agentCount: number;
  startTime: Date;
  lastUpdate: Date;
  config: Record<string, any>;
  agents: string[]; // Agent IDs
}

export interface WorkClaim {
  id: string;
  agentId: string;
  farmId: string;
  description: string;
  files: string[];
  priority: 'high' | 'medium' | 'low';
  status: 'claimed' | 'active' | 'completed' | 'failed';
  claimedAt: Date;
  estimatedDuration?: number;
}

/**
 * Redis keys structure:
 * - farm:{farmId} -> FarmState
 * - agent:{agentId} -> AgentState 
 * - farm:{farmId}:agents -> Set of agent IDs
 * - claim:{claimId} -> WorkClaim
 * - agent:{agentId}:claims -> Set of claim IDs
 * - events:{farmId} -> Stream of farm events
 */
export class RedisCoordinationStore extends EventEmitter {
  private redis: Redis;
  private subscriber: Redis;
  private readonly keyPrefix = 'maifarm:coordination:';
  private readonly eventChannels = {
    farmUpdates: 'farm:updates',
    agentUpdates: 'agent:updates', 
    claimUpdates: 'claim:updates',
    systemEvents: 'system:events'
  };
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(redis: Redis) {
    super();
    this.redis = redis;
    this.subscriber = redis.duplicate();
    this.setupEventSubscriptions();
    this.startHeartbeatMonitoring();
  }

  /**
   * Farm State Management
   */
  
  async createFarm(farmState: Omit<FarmState, 'id'>): Promise<FarmState> {
    const farmId = uuidv4();
    const farm: FarmState = {
      id: farmId,
      ...farmState,
      lastUpdate: new Date()
    };

    const key = this.getFarmKey(farmId);
    const agentsKey = this.getFarmAgentsKey(farmId);
    
    // Atomic transaction to create farm
    const multi = this.redis.multi();
    multi.hset(key, this.serializeObject(farm));
    multi.sadd(agentsKey, ...farm.agents);
    multi.expire(key, 3600); // 1 hour TTL
    multi.expire(agentsKey, 3600);
    
    await multi.exec();

    // Publish farm created event
    await this.publishEvent('farmUpdates', {
      type: 'farm:created',
      farmId,
      data: farm,
      timestamp: new Date()
    });

    return farm;
  }

  async updateFarmState(farmId: string, updates: Partial<FarmState>): Promise<FarmState | null> {
    const key = this.getFarmKey(farmId);
    
    // Get current state first
    const current = await this.getFarmState(farmId);
    if (!current) return null;

    const updated: FarmState = {
      ...current,
      ...updates,
      lastUpdate: new Date()
    };

    // Atomic update
    await this.redis.hset(key, this.serializeObject(updated));
    await this.redis.expire(key, 3600);

    // Publish update event
    await this.publishEvent('farmUpdates', {
      type: 'farm:updated',
      farmId,
      data: updated,
      changes: updates,
      timestamp: new Date()
    });

    return updated;
  }

  async getFarmState(farmId: string): Promise<FarmState | null> {
    const key = this.getFarmKey(farmId);
    const data = await this.redis.hgetall(key);
    
    if (!data || Object.keys(data).length === 0) return null;
    return this.deserializeObject(data) as FarmState;
  }

  async deleteFarm(farmId: string): Promise<void> {
    const key = this.getFarmKey(farmId);
    const agentsKey = this.getFarmAgentsKey(farmId);
    const eventsKey = this.getFarmEventsKey(farmId);

    // Get agents to clean up
    const agentIds = await this.redis.smembers(agentsKey);
    
    // Atomic cleanup
    const multi = this.redis.multi();
    multi.del(key, agentsKey, eventsKey);
    
    // Clean up agent states
    for (const agentId of agentIds) {
      multi.del(this.getAgentKey(agentId));
      multi.del(this.getAgentClaimsKey(agentId));
    }
    
    await multi.exec();

    // Publish deletion event
    await this.publishEvent('farmUpdates', {
      type: 'farm:deleted',
      farmId,
      timestamp: new Date()
    });
  }

  /**
   * Agent State Management
   */
  
  async createAgent(agentState: Omit<AgentState, 'id'>): Promise<AgentState> {
    const agentId = uuidv4();
    const agent: AgentState = {
      id: agentId,
      ...agentState,
      lastHeartbeat: new Date()
    };

    const agentKey = this.getAgentKey(agentId);
    const farmAgentsKey = this.getFarmAgentsKey(agent.farmId);
    
    // Atomic transaction
    const multi = this.redis.multi();
    multi.hset(agentKey, this.serializeObject(agent));
    multi.sadd(farmAgentsKey, agentId);
    multi.expire(agentKey, 3600);
    
    await multi.exec();

    // Publish agent created event
    await this.publishEvent('agentUpdates', {
      type: 'agent:created',
      agentId,
      farmId: agent.farmId,
      data: agent,
      timestamp: new Date()
    });

    return agent;
  }

  async updateAgentState(agentId: string, updates: Partial<AgentState>): Promise<AgentState | null> {
    const key = this.getAgentKey(agentId);
    
    // Get current state first
    const current = await this.getAgentState(agentId);
    if (!current) return null;

    const updated: AgentState = {
      ...current,
      ...updates,
      lastHeartbeat: new Date()
    };

    // Atomic update
    await this.redis.hset(key, this.serializeObject(updated));
    await this.redis.expire(key, 3600);

    // Publish update event
    await this.publishEvent('agentUpdates', {
      type: 'agent:updated',
      agentId,
      farmId: updated.farmId,
      data: updated,
      changes: updates,
      timestamp: new Date()
    });

    return updated;
  }

  async getAgentState(agentId: string): Promise<AgentState | null> {
    const key = this.getAgentKey(agentId);
    const data = await this.redis.hgetall(key);
    
    if (!data || Object.keys(data).length === 0) return null;
    return this.deserializeObject(data) as AgentState;
  }

  async getFarmAgents(farmId: string): Promise<AgentState[]> {
    const agentsKey = this.getFarmAgentsKey(farmId);
    const agentIds = await this.redis.smembers(agentsKey);
    
    if (agentIds.length === 0) return [];
    
    // Batch get all agent states
    const pipeline = this.redis.pipeline();
    for (const agentId of agentIds) {
      pipeline.hgetall(this.getAgentKey(agentId));
    }
    
    const results = await pipeline.exec();
    const agents: AgentState[] = [];
    
    for (let i = 0; i < results.length; i++) {
      const [err, data] = results[i];
      if (!err && data && Object.keys(data).length > 0) {
        agents.push(this.deserializeObject(data) as AgentState);
      }
    }
    
    return agents;
  }

  async deleteAgent(agentId: string): Promise<void> {
    const agent = await this.getAgentState(agentId);
    if (!agent) return;

    const agentKey = this.getAgentKey(agentId);
    const farmAgentsKey = this.getFarmAgentsKey(agent.farmId);
    const claimsKey = this.getAgentClaimsKey(agentId);
    
    // Get claims to clean up
    const claimIds = await this.redis.smembers(claimsKey);
    
    // Atomic cleanup
    const multi = this.redis.multi();
    multi.del(agentKey, claimsKey);
    multi.srem(farmAgentsKey, agentId);
    
    // Clean up work claims
    for (const claimId of claimIds) {
      multi.del(this.getClaimKey(claimId));
    }
    
    await multi.exec();

    // Publish deletion event
    await this.publishEvent('agentUpdates', {
      type: 'agent:deleted',
      agentId,
      farmId: agent.farmId,
      timestamp: new Date()
    });
  }

  /**
   * Work Claim Management
   */
  
  async createWorkClaim(claim: Omit<WorkClaim, 'id' | 'claimedAt'>): Promise<WorkClaim | null> {
    // Check for conflicts on claimed files
    const conflictingClaim = await this.findConflictingClaim(claim.files, claim.farmId);
    if (conflictingClaim) {
      return null; // Conflict detected
    }

    const claimId = uuidv4();
    const workClaim: WorkClaim = {
      id: claimId,
      ...claim,
      claimedAt: new Date()
    };

    const claimKey = this.getClaimKey(claimId);
    const agentClaimsKey = this.getAgentClaimsKey(claim.agentId);
    
    // Atomic transaction
    const multi = this.redis.multi();
    multi.hset(claimKey, this.serializeObject(workClaim));
    multi.sadd(agentClaimsKey, claimId);
    multi.expire(claimKey, 7200); // 2 hours TTL
    
    await multi.exec();

    // Publish claim event
    await this.publishEvent('claimUpdates', {
      type: 'claim:created',
      claimId,
      agentId: claim.agentId,
      farmId: claim.farmId,
      data: workClaim,
      timestamp: new Date()
    });

    return workClaim;
  }

  async updateWorkClaim(claimId: string, updates: Partial<WorkClaim>): Promise<WorkClaim | null> {
    const key = this.getClaimKey(claimId);
    
    const current = await this.getWorkClaim(claimId);
    if (!current) return null;

    const updated: WorkClaim = { ...current, ...updates };
    
    await this.redis.hset(key, this.serializeObject(updated));
    await this.redis.expire(key, 7200);

    // Publish update event
    await this.publishEvent('claimUpdates', {
      type: 'claim:updated',
      claimId,
      agentId: updated.agentId,
      farmId: updated.farmId,
      data: updated,
      changes: updates,
      timestamp: new Date()
    });

    return updated;
  }

  async getWorkClaim(claimId: string): Promise<WorkClaim | null> {
    const key = this.getClaimKey(claimId);
    const data = await this.redis.hgetall(key);
    
    if (!data || Object.keys(data).length === 0) return null;
    return this.deserializeObject(data) as WorkClaim;
  }

  async getAgentClaims(agentId: string): Promise<WorkClaim[]> {
    const claimsKey = this.getAgentClaimsKey(agentId);
    const claimIds = await this.redis.smembers(claimsKey);
    
    if (claimIds.length === 0) return [];
    
    const pipeline = this.redis.pipeline();
    for (const claimId of claimIds) {
      pipeline.hgetall(this.getClaimKey(claimId));
    }
    
    const results = await pipeline.exec();
    const claims: WorkClaim[] = [];
    
    for (let i = 0; i < results.length; i++) {
      const [err, data] = results[i];
      if (!err && data && Object.keys(data).length > 0) {
        claims.push(this.deserializeObject(data) as WorkClaim);
      }
    }
    
    return claims;
  }

  /**
   * Health Monitoring & Heartbeats
   */
  
  async recordHeartbeat(agentId: string, metadata?: Record<string, any>): Promise<void> {
    const updates: Partial<AgentState> = {
      lastHeartbeat: new Date()
    };
    
    if (metadata) {
      updates.metadata = { ...metadata };
    }
    
    await this.updateAgentState(agentId, updates);
  }

  async getHealthStatus(farmId: string): Promise<{
    healthy: AgentState[];
    stale: AgentState[];
    failed: AgentState[];
  }> {
    const agents = await this.getFarmAgents(farmId);
    const now = Date.now();
    const staleThreshold = 60000; // 1 minute
    const failedThreshold = 300000; // 5 minutes
    
    const healthy: AgentState[] = [];
    const stale: AgentState[] = [];
    const failed: AgentState[] = [];
    
    for (const agent of agents) {
      const lastHeartbeat = new Date(agent.lastHeartbeat).getTime();
      const timeSince = now - lastHeartbeat;
      
      if (agent.status === 'error' || agent.status === 'timeout') {
        failed.push(agent);
      } else if (timeSince > failedThreshold) {
        failed.push(agent);
      } else if (timeSince > staleThreshold) {
        stale.push(agent);
      } else {
        healthy.push(agent);
      }
    }
    
    return { healthy, stale, failed };
  }

  /**
   * Event System
   */
  
  private async publishEvent(channel: keyof typeof this.eventChannels, event: any): Promise<void> {
    const channelName = `${this.keyPrefix}${this.eventChannels[channel]}`;
    await this.redis.publish(channelName, JSON.stringify(event));
  }

  private setupEventSubscriptions(): void {
    // Subscribe to all coordination events
    Object.values(this.eventChannels).forEach(channel => {
      this.subscriber.subscribe(`${this.keyPrefix}${channel}`);
    });

    this.subscriber.on('message', (channel: string, message: string) => {
      try {
        const event = JSON.parse(message);
        const eventType = channel.split(':').pop();
        this.emit(`redis:${eventType}`, event);
      } catch (error) {
        console.error('[RedisCoordinationStore] Failed to parse event:', error);
      }
    });
  }

  /**
   * Heartbeat Monitoring
   */
  
  private startHeartbeatMonitoring(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        // Find all farms and check agent health
        const farmPattern = `${this.keyPrefix}farm:*`;
        const farmKeys = await this.redis.keys(farmPattern);
        
        for (const farmKey of farmKeys) {
          const farmId = farmKey.split(':').pop();
          if (!farmId) continue;
          
          const health = await this.getHealthStatus(farmId);
          
          // Emit health warnings for stale/failed agents
          if (health.stale.length > 0 || health.failed.length > 0) {
            await this.publishEvent('systemEvents', {
              type: 'health:warning',
              farmId,
              staleAgents: health.stale.length,
              failedAgents: health.failed.length,
              timestamp: new Date()
            });
          }
        }
      } catch (error) {
        console.error('[RedisCoordinationStore] Health monitoring error:', error);
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Helper Methods
   */
  
  private async findConflictingClaim(files: string[], farmId: string): Promise<WorkClaim | null> {
    // Get all agents in farm
    const agents = await this.getFarmAgents(farmId);
    
    // Check each agent's active claims
    for (const agent of agents) {
      const claims = await this.getAgentClaims(agent.id);
      
      for (const claim of claims) {
        if (claim.status === 'active' || claim.status === 'claimed') {
          // Check for file conflicts
          const hasConflict = claim.files.some(file => files.includes(file));
          if (hasConflict) {
            return claim;
          }
        }
      }
    }
    
    return null;
  }

  private getFarmKey(farmId: string): string {
    return `${this.keyPrefix}farm:${farmId}`;
  }

  private getFarmAgentsKey(farmId: string): string {
    return `${this.keyPrefix}farm:${farmId}:agents`;
  }

  private getFarmEventsKey(farmId: string): string {
    return `${this.keyPrefix}farm:${farmId}:events`;
  }

  private getAgentKey(agentId: string): string {
    return `${this.keyPrefix}agent:${agentId}`;
  }

  private getAgentClaimsKey(agentId: string): string {
    return `${this.keyPrefix}agent:${agentId}:claims`;
  }

  private getClaimKey(claimId: string): string {
    return `${this.keyPrefix}claim:${claimId}`;
  }

  private serializeObject(obj: any): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        result[key] = JSON.stringify(value);
      } else if (value instanceof Date) {
        result[key] = value.toISOString();
      } else {
        result[key] = String(value);
      }
    }
    return result;
  }

  private deserializeObject(data: Record<string, string>): any {
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      // Try to parse as JSON first
      try {
        result[key] = JSON.parse(value);
      } catch {
        // Try to parse as Date
        if (value.includes('T') && value.includes('Z')) {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            result[key] = date;
            continue;
          }
        }
        // Keep as string
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Cleanup
   */
  
  async destroy(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    await this.subscriber.disconnect();
    this.removeAllListeners();
    
    console.log('[RedisCoordinationStore] Destroyed');
  }
}