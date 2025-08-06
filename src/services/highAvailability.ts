import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export interface ClusterNode {
  id: string;
  host: string;
  port: number;
  status: 'active' | 'standby' | 'failed' | 'unknown';
  role: 'primary' | 'secondary';
  lastHeartbeat: number;
  load: number;
  capacity: number;
  version: string;
}

// Alias for backward compatibility
export type AgentNode = ClusterNode & {
  status: 'healthy' | 'unhealthy' | 'degraded' | 'initializing';
};

interface HealthCheckResult {
  healthy: boolean;
  latency: number;
  services: Record<string, boolean>;
  timestamp: number;
}

interface FailoverConfig {
  healthCheckInterval: number;
  failoverTimeout: number;
  minHealthyNodes: number;
  autoFailover: boolean;
}

class HighAvailabilityService extends EventEmitter {
  private nodes: Map<string, ClusterNode> = new Map();
  private currentPrimary: string | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private failoverInProgress = false;
  private config: FailoverConfig = {
    healthCheckInterval: 5000,
    failoverTimeout: 30000,
    minHealthyNodes: 1,
    autoFailover: true
  };

  constructor() {
    super();
    this.initialize();
  }

  private initialize(): void {
    // Start health monitoring
    this.startHealthMonitoring();

    // Listen for process signals (only in Node.js environment)
    // Browser environments will handle shutdown differently
    if (typeof window === 'undefined' && typeof process !== 'undefined') {
      process.on('SIGTERM', () => this.gracefulShutdown());
      process.on('SIGINT', () => this.gracefulShutdown());
    } else {
      // Browser environment - listen for page unload
      window.addEventListener('beforeunload', () => this.gracefulShutdown());
    }
  }

  async registerNode(node: Omit<ClusterNode, 'lastHeartbeat'>): Promise<void> {
    const nodeWithHeartbeat: ClusterNode = {
      ...node,
      lastHeartbeat: Date.now()
    };

    this.nodes.set(node.id, nodeWithHeartbeat);

    // If no primary exists and this is a primary role, set it
    if (node.role === 'primary' && !this.currentPrimary) {
      this.currentPrimary = node.id;
      this.emit('primary:elected', node.id);
    }

    this.emit('node:registered', node);
  }

  async unregisterNode(nodeId: string): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    this.nodes.delete(nodeId);
    this.emit('node:unregistered', nodeId);

    // If this was the primary, initiate failover
    if (nodeId === this.currentPrimary) {
      await this.initiateFailover();
    }
  }

  async updateNodeStatus(
    nodeId: string, 
    status: ClusterNode['status'], 
    load?: number
  ): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    node.status = status;
    node.lastHeartbeat = Date.now();
    
    if (load !== undefined) {
      node.load = load;
    }

    this.emit('node:updated', node);

    // Check if failover is needed
    if (nodeId === this.currentPrimary && status === 'failed') {
      await this.initiateFailover();
    }
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  private async performHealthChecks(): Promise<void> {
    const promises = Array.from(this.nodes.values()).map(async (node) => {
      try {
        const result = await this.checkNodeHealth(node);
        
        if (result.healthy) {
          await this.updateNodeStatus(node.id, 'active', node.load);
        } else {
          await this.updateNodeStatus(node.id, 'failed');
        }
        
        return { nodeId: node.id, result };
      } catch (error) {
        await this.updateNodeStatus(node.id, 'unknown');
        return { nodeId: node.id, error };
      }
    });

    const results = await Promise.all(promises);
    this.emit('health:checked', results);

    // Check cluster health
    await this.evaluateClusterHealth();
  }

  private async checkNodeHealth(node: ClusterNode): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(`http://${node.host}:${node.port}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });

      const health = await response.json();
      
      return {
        healthy: response.ok && health.status === 'healthy',
        latency: Date.now() - startTime,
        services: health.services || {},
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        services: {},
        timestamp: Date.now()
      };
    }
  }

  private async evaluateClusterHealth(): Promise<void> {
    const activeNodes = Array.from(this.nodes.values()).filter(
      node => node.status === 'active'
    );

    const clusterHealth = {
      totalNodes: this.nodes.size,
      activeNodes: activeNodes.length,
      healthPercentage: (activeNodes.length / this.nodes.size) * 100,
      primaryHealthy: this.currentPrimary ? 
        this.nodes.get(this.currentPrimary)?.status === 'active' : false
    };

    this.emit('cluster:health', clusterHealth);

    // Check if we need to trigger failover
    if (!clusterHealth.primaryHealthy && this.config.autoFailover) {
      await this.initiateFailover();
    }

    // Alert if cluster health is degraded
    if (activeNodes.length < this.config.minHealthyNodes) {
      this.emit('cluster:degraded', clusterHealth);
    }
  }

  async initiateFailover(): Promise<boolean> {
    if (this.failoverInProgress) {
      console.log('Failover already in progress');
      return false;
    }

    this.failoverInProgress = true;
    this.emit('failover:started');

    try {
      // Find best candidate for new primary
      const candidate = this.selectFailoverCandidate();
      
      if (!candidate) {
        throw new Error('No suitable failover candidate found');
      }

      // Promote candidate to primary
      await this.promoteNode(candidate.id);

      // Update old primary if it exists
      if (this.currentPrimary && this.nodes.has(this.currentPrimary)) {
        const oldPrimary = this.nodes.get(this.currentPrimary)!;
        oldPrimary.role = 'secondary';
      }

      // Update cluster state
      this.currentPrimary = candidate.id;
      candidate.role = 'primary';

      this.emit('failover:completed', {
        newPrimary: candidate.id,
        timestamp: Date.now()
      });

      return true;
    } catch (error) {
      this.emit('failover:failed', error);
      return false;
    } finally {
      this.failoverInProgress = false;
    }
  }

  private selectFailoverCandidate(): ClusterNode | null {
    const candidates = Array.from(this.nodes.values())
      .filter(node => 
        node.status === 'active' && 
        node.role === 'secondary' &&
        node.load < node.capacity * 0.8
      )
      .sort((a, b) => {
        // Prefer nodes with lower load
        const loadDiff = a.load / a.capacity - b.load / b.capacity;
        if (loadDiff !== 0) return loadDiff;
        
        // Then prefer nodes with more recent heartbeat
        return b.lastHeartbeat - a.lastHeartbeat;
      });

    return candidates[0] || null;
  }

  private async promoteNode(nodeId: string): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error('Node not found');

    // Send promotion request to node
    try {
      const response = await fetch(`http://${node.host}:${node.port}/api/cluster/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          nodeId,
          timestamp: Date.now()
        })
      });

      if (!response.ok) {
        throw new Error('Promotion request failed');
      }
    } catch (error) {
      throw new Error(`Failed to promote node ${nodeId}: ${error}`);
    }
  }

  async getClusterStatus(): Promise<{
    nodes: ClusterNode[];
    primary: string | null;
    health: {
      totalNodes: number;
      activeNodes: number;
      healthPercentage: number;
    };
    failoverReady: boolean;
  }> {
    const nodes = Array.from(this.nodes.values());
    const activeNodes = nodes.filter(n => n.status === 'active');

    return {
      nodes,
      primary: this.currentPrimary,
      health: {
        totalNodes: nodes.length,
        activeNodes: activeNodes.length,
        healthPercentage: nodes.length > 0 ? 
          (activeNodes.length / nodes.length) * 100 : 0
      },
      failoverReady: this.selectFailoverCandidate() !== null
    };
  }

  async performManualFailover(targetNodeId?: string): Promise<boolean> {
    if (targetNodeId) {
      const node = this.nodes.get(targetNodeId);
      if (!node || node.status !== 'active') {
        throw new Error('Target node is not available for failover');
      }
    }

    return await this.initiateFailover();
  }

  updateConfig(config: Partial<FailoverConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart health monitoring with new interval if changed
    if (config.healthCheckInterval !== undefined) {
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }
      this.startHealthMonitoring();
    }
  }

  private async gracefulShutdown(): Promise<void> {
    console.log('Initiating graceful shutdown...');
    
    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // If this is the primary, initiate failover
    const thisNodeId = import.meta.env.VITE_NODE_ID;
    if (thisNodeId === this.currentPrimary) {
      await this.initiateFailover();
    }

    // Unregister this node
    if (thisNodeId) {
      await this.unregisterNode(thisNodeId);
    }

    this.emit('shutdown');
  }

  // Session replication helpers
  async replicateSession(sessionId: string, data: any): Promise<void> {
    const secondaryNodes = Array.from(this.nodes.values()).filter(
      node => node.role === 'secondary' && node.status === 'active'
    );

    const replicationPromises = secondaryNodes.map(async (node) => {
      try {
        const response = await fetch(`http://${node.host}:${node.port}/api/session/replicate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, data, timestamp: Date.now() })
        });

        return { nodeId: node.id, success: response.ok };
      } catch (error) {
        return { nodeId: node.id, success: false, error };
      }
    });

    const results = await Promise.all(replicationPromises);
    
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      this.emit('replication:failed', { sessionId, failures });
    }
  }

  async getSessionFromReplica(sessionId: string): Promise<any> {
    const activeNodes = Array.from(this.nodes.values()).filter(
      node => node.status === 'active'
    );

    for (const node of activeNodes) {
      try {
        const response = await fetch(
          `http://${node.host}:${node.port}/api/session/${sessionId}`
        );
        
        if (response.ok) {
          return await response.json();
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }
}

export const highAvailability = new HighAvailabilityService();