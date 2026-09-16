import { EventEmitter } from 'events';
import { Agent } from '@/types';

export interface HANode {
  id: string;
  url: string;
  status: 'active' | 'standby' | 'failed' | 'unknown';
  role: 'primary' | 'secondary';
  lastHeartbeat: number;
  load: number;
  capacity: number;
  region?: string;
  host: string;
  port: number;
  version: string;
}

export interface HACluster {
  id: string;
  name: string;
  nodes: HANode[];
  primaryNode: string | null;
  strategy: 'active-passive' | 'active-active' | 'multi-master';
  healthCheckInterval: number;
  failoverThreshold: number;
}

export interface HAConfig {
  clusterId: string;
  nodeId: string;
  heartbeatInterval: number;
  healthCheckTimeout: number;
  failoverDelay: number;
  maxFailoverAttempts: number;
  enableAutoFailover: boolean;
}

export class HAManager extends EventEmitter {
  private config: HAConfig;
  private cluster: HACluster | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private isLeader = false;
  private failoverInProgress = false;

  constructor(config: HAConfig) {
    super();
    this.config = config;
  }

  async initialize(): Promise<void> {
    console.log('[HAManager] Initializing high availability system');
    
    // Register this node
    await this.registerNode();
    
    // Start heartbeat
    this.startHeartbeat();
    
    // Start health checks
    this.startHealthChecks();
    
    // Participate in leader election
    await this.participateInLeaderElection();
  }

  private async registerNode(): Promise<void> {
    try {
      const response = await fetch('/api/ha/nodes/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId: this.config.nodeId,
          clusterId: this.config.clusterId,
          url: window.location.origin,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to register node');
      }

      this.cluster = await response.json();
      this.emit('nodeRegistered', { nodeId: this.config.nodeId, cluster: this.cluster });
    } catch (error) {
      console.error('[HAManager] Failed to register node:', error);
      this.emit('error', { type: 'registration', error });
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/ha/nodes/${this.config.nodeId}/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            load: await this.getNodeLoad(),
            timestamp: Date.now(),
          }),
        });

        if (!response.ok) {
          this.handleHeartbeatFailure();
        }
      } catch (error) {
        this.handleHeartbeatFailure();
      }
    }, this.config.heartbeatInterval);
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      if (!this.cluster) return;

      const healthChecks = await Promise.all(
        this.cluster.nodes.map(node => this.checkNodeHealth(node))
      );

      // Update cluster state
      this.cluster.nodes = this.cluster.nodes.map((node, index) => ({
        ...node,
        status: healthChecks[index] ? 'active' : 'failed',
      }));

      // Check if failover is needed
      if (this.config.enableAutoFailover) {
        await this.checkFailoverNeeded();
      }

      this.emit('healthCheckComplete', { cluster: this.cluster });
    }, this.cluster?.healthCheckInterval || 5000);
  }

  private async checkNodeHealth(node: HANode): Promise<boolean> {
    if (node.id === this.config.nodeId) {
      return true; // Self is always healthy
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.healthCheckTimeout
      );

      const response = await fetch(`${node.url}/api/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.warn(`[HAManager] Health check failed for node ${node.id}:`, error);
      return false;
    }
  }

  private async participateInLeaderElection(): Promise<void> {
    if (!this.cluster || this.cluster.strategy === 'multi-master') {
      return; // No leader election needed for multi-master
    }

    try {
      const response = await fetch('/api/ha/election/participate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId: this.config.nodeId,
          clusterId: this.config.clusterId,
        }),
      });

      const result = await response.json();
      this.isLeader = result.elected;
      
      if (this.isLeader) {
        this.cluster.primaryNode = this.config.nodeId;
        this.emit('leaderElected', { nodeId: this.config.nodeId });
        console.log('[HAManager] This node has been elected as leader');
      } else {
        this.cluster.primaryNode = result.leaderId;
        this.emit('followerMode', { leaderId: result.leaderId });
        console.log(`[HAManager] Following leader: ${result.leaderId}`);
      }
    } catch (error) {
      console.error('[HAManager] Leader election failed:', error);
      this.emit('error', { type: 'election', error });
    }
  }

  private async checkFailoverNeeded(): Promise<void> {
    if (!this.cluster || this.failoverInProgress) return;

    const primaryNode = this.cluster.nodes.find(n => n.id === this.cluster!.primaryNode);
    
    if (primaryNode && primaryNode.status === 'failed') {
      const failedDuration = Date.now() - primaryNode.lastHeartbeat;
      
      if (failedDuration > this.config.failoverDelay) {
        await this.initiateFailover();
      }
    }
  }

  private async initiateFailover(): Promise<void> {
    if (this.failoverInProgress) return;

    this.failoverInProgress = true;
    this.emit('failoverStarted', { cluster: this.cluster });

    try {
      console.log('[HAManager] Initiating failover');

      // Find best candidate for new primary
      const candidates = this.cluster!.nodes
        .filter(n => n.status === 'active' && n.role === 'secondary')
        .sort((a, b) => {
          // Prefer nodes with lower load and higher capacity
          const scoreA = (a.capacity - a.load) / a.capacity;
          const scoreB = (b.capacity - b.load) / b.capacity;
          return scoreB - scoreA;
        });

      if (candidates.length === 0) {
        throw new Error('No suitable candidates for failover');
      }

      const newPrimary = candidates[0];
      
      // Promote new primary
      const response = await fetch('/api/ha/failover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusterId: this.config.clusterId,
          newPrimaryId: newPrimary.id,
          oldPrimaryId: this.cluster!.primaryNode,
        }),
      });

      if (!response.ok) {
        throw new Error('Failover request failed');
      }

      // Update cluster state
      this.cluster!.primaryNode = newPrimary.id;
      newPrimary.role = 'primary';
      
      // Re-participate in election if this node is the new primary
      if (newPrimary.id === this.config.nodeId) {
        this.isLeader = true;
        this.emit('leaderElected', { nodeId: this.config.nodeId });
      }

      this.emit('failoverCompleted', { 
        cluster: this.cluster,
        newPrimary: newPrimary.id,
      });
      
      console.log(`[HAManager] Failover completed. New primary: ${newPrimary.id}`);
    } catch (error) {
      console.error('[HAManager] Failover failed:', error);
      this.emit('error', { type: 'failover', error });
    } finally {
      this.failoverInProgress = false;
    }
  }

  private handleHeartbeatFailure(): void {
    console.warn('[HAManager] Heartbeat failed');
    this.emit('heartbeatFailed', { nodeId: this.config.nodeId });
    
    // If we're the leader and heartbeat fails, step down
    if (this.isLeader) {
      this.stepDown();
    }
  }

  private async stepDown(): Promise<void> {
    console.log('[HAManager] Stepping down as leader');
    this.isLeader = false;
    
    try {
      await fetch('/api/ha/stepdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId: this.config.nodeId,
          clusterId: this.config.clusterId,
        }),
      });
    } catch (error) {
      console.error('[HAManager] Failed to notify step down:', error);
    }
    
    this.emit('steppedDown', { nodeId: this.config.nodeId });
  }

  private async getNodeLoad(): Promise<number> {
    // Calculate current node load (0-100)
    // This is a simplified implementation
    try {
      const agents = await this.getActiveAgents();
      const maxAgents = 100; // Configurable max agents per node
      return Math.min((agents.length / maxAgents) * 100, 100);
    } catch {
      return 0;
    }
  }

  private async getActiveAgents(): Promise<Agent[]> {
    // In a real implementation, this would query the actual agents
    return [];
  }

  // Public API

  isHealthy(): boolean {
    if (!this.cluster) return false;
    
    const thisNode = this.cluster.nodes.find(n => n.id === this.config.nodeId);
    return thisNode?.status === 'active';
  }

  isPrimary(): boolean {
    return this.isLeader;
  }

  getClusterStatus(): HACluster | null {
    return this.cluster;
  }

  async triggerFailover(): Promise<void> {
    if (!this.isLeader) {
      throw new Error('Only the primary node can trigger failover');
    }
    
    await this.stepDown();
    await this.initiateFailover();
  }

  async rebalanceLoad(): Promise<void> {
    if (!this.cluster || this.cluster.strategy !== 'active-active') {
      return;
    }

    try {
      const response = await fetch('/api/ha/rebalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusterId: this.config.clusterId,
        }),
      });

      if (!response.ok) {
        throw new Error('Rebalance request failed');
      }

      const result = await response.json();
      this.emit('rebalanceCompleted', result);
    } catch (error) {
      console.error('[HAManager] Rebalance failed:', error);
      this.emit('error', { type: 'rebalance', error });
    }
  }

  performHealthCheck(): void {
    if (!this.cluster) return;

    try {
      // Trigger health check event with current cluster state
      this.emit('healthCheckComplete', { cluster: this.cluster });
      console.log('[HAManager] Health check completed');
    } catch (error) {
      console.error('[HAManager] Health check failed:', error);
      this.emit('error', { type: 'healthCheck', error });
    }
  }

  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Deregister node
    fetch(`/api/ha/nodes/${this.config.nodeId}/deregister`, {
      method: 'DELETE',
    }).catch(error => {
      console.error('[HAManager] Failed to deregister node:', error);
    });

    this.removeAllListeners();
  }
}

// Singleton instance factory
let haManagerInstance: HAManager | null = null;

export function getHAManager(config?: HAConfig): HAManager {
  if (!haManagerInstance && config) {
    haManagerInstance = new HAManager(config);
  }
  
  if (!haManagerInstance) {
    throw new Error('HAManager not initialized');
  }
  
  return haManagerInstance;
}