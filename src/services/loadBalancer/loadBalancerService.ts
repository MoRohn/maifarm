import { Agent } from '../../types';
import { HANode } from '../highAvailability/haManager';

export interface LoadBalancerConfig {
  strategy: 'round-robin' | 'least-connections' | 'weighted' | 'response-time' | 'resource-based';
  healthCheckInterval: number;
  connectionTimeout: number;
  maxRetries: number;
  stickySession: boolean;
  sessionTimeout: number;
}

export interface LoadMetrics {
  connections: number;
  responseTime: number;
  cpuUsage: number;
  memoryUsage: number;
  requestsPerSecond: number;
  errorRate: number;
}

export interface LoadBalancerNode extends HANode {
  metrics: LoadMetrics;
  weight: number;
  activeConnections: Set<string>;
  lastUsed: number;
}

export class LoadBalancerService {
  private config: LoadBalancerConfig;
  private nodes: Map<string, LoadBalancerNode> = new Map();
  private currentIndex = 0;
  private sessionMap: Map<string, string> = new Map(); // sessionId -> nodeId
  private metricsInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: LoadBalancerConfig) {
    this.config = config;
    this.startMetricsCollection();
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.updateNodeMetrics();
    }, this.config.healthCheckInterval);
  }

  private async updateNodeMetrics(): Promise<void> {
    const promises = Array.from(this.nodes.values()).map(async (node) => {
      try {
        const response = await fetch(`${node.url}/api/metrics`, {
          timeout: this.config.connectionTimeout,
        } as any);

        if (response.ok) {
          const metrics = await response.json();
          node.metrics = metrics;
          node.status = 'active';
        } else {
          node.status = 'failed';
        }
      } catch (error) {
        node.status = 'failed';
        console.warn(`[LoadBalancer] Failed to get metrics from ${node.id}:`, error);
      }
    });

    await Promise.all(promises);
  }

  registerNode(node: HANode, weight: number = 1): void {
    const lbNode: LoadBalancerNode = {
      ...node,
      weight,
      metrics: {
        connections: 0,
        responseTime: 0,
        cpuUsage: 0,
        memoryUsage: 0,
        requestsPerSecond: 0,
        errorRate: 0,
      },
      activeConnections: new Set(),
      lastUsed: 0,
    };

    this.nodes.set(node.id, lbNode);
    console.log(`[LoadBalancer] Registered node ${node.id}`);
  }

  unregisterNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      // Migrate active connections
      if (node.activeConnections.size > 0) {
        this.migrateConnections(node);
      }
      
      this.nodes.delete(nodeId);
      console.log(`[LoadBalancer] Unregistered node ${nodeId}`);
    }
  }

  private migrateConnections(fromNode: LoadBalancerNode): void {
    const targetNode = this.selectNode();
    if (targetNode) {
      fromNode.activeConnections.forEach(connId => {
        targetNode.activeConnections.add(connId);
        
        // Update session mapping if using sticky sessions
        if (this.config.stickySession) {
          const sessionId = this.getSessionFromConnection(connId);
          if (sessionId) {
            this.sessionMap.set(sessionId, targetNode.id);
          }
        }
      });
      
      fromNode.activeConnections.clear();
      console.log(`[LoadBalancer] Migrated ${fromNode.activeConnections.size} connections from ${fromNode.id} to ${targetNode.id}`);
    }
  }

  selectNode(sessionId?: string): LoadBalancerNode | null {
    // Check sticky session first
    if (sessionId && this.config.stickySession) {
      const nodeId = this.sessionMap.get(sessionId);
      if (nodeId) {
        const node = this.nodes.get(nodeId);
        if (node && node.status === 'active') {
          return node;
        }
      }
    }

    // Get active nodes
    const activeNodes = Array.from(this.nodes.values())
      .filter(node => node.status === 'active');

    if (activeNodes.length === 0) {
      return null;
    }

    // Select based on strategy
    let selectedNode: LoadBalancerNode | null = null;

    switch (this.config.strategy) {
      case 'round-robin':
        selectedNode = this.roundRobinSelect(activeNodes);
        break;
        
      case 'least-connections':
        selectedNode = this.leastConnectionsSelect(activeNodes);
        break;
        
      case 'weighted':
        selectedNode = this.weightedSelect(activeNodes);
        break;
        
      case 'response-time':
        selectedNode = this.responseTimeSelect(activeNodes);
        break;
        
      case 'resource-based':
        selectedNode = this.resourceBasedSelect(activeNodes);
        break;
        
      default:
        selectedNode = activeNodes[0];
    }

    // Update session mapping
    if (sessionId && selectedNode && this.config.stickySession) {
      this.sessionMap.set(sessionId, selectedNode.id);
      
      // Clean up old sessions
      setTimeout(() => {
        this.sessionMap.delete(sessionId);
      }, this.config.sessionTimeout);
    }

    if (selectedNode) {
      selectedNode.lastUsed = Date.now();
    }

    return selectedNode;
  }

  private roundRobinSelect(nodes: LoadBalancerNode[]): LoadBalancerNode {
    const node = nodes[this.currentIndex % nodes.length];
    this.currentIndex++;
    return node;
  }

  private leastConnectionsSelect(nodes: LoadBalancerNode[]): LoadBalancerNode {
    return nodes.reduce((min, node) => 
      node.activeConnections.size < min.activeConnections.size ? node : min
    );
  }

  private weightedSelect(nodes: LoadBalancerNode[]): LoadBalancerNode {
    const totalWeight = nodes.reduce((sum, node) => sum + node.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const node of nodes) {
      random -= node.weight;
      if (random <= 0) {
        return node;
      }
    }
    
    return nodes[nodes.length - 1];
  }

  private responseTimeSelect(nodes: LoadBalancerNode[]): LoadBalancerNode {
    return nodes.reduce((fastest, node) => 
      node.metrics.responseTime < fastest.metrics.responseTime ? node : fastest
    );
  }

  private resourceBasedSelect(nodes: LoadBalancerNode[]): LoadBalancerNode {
    // Score based on multiple factors
    const scored = nodes.map(node => {
      const cpuScore = 100 - node.metrics.cpuUsage;
      const memScore = 100 - node.metrics.memoryUsage;
      const connScore = 100 - (node.activeConnections.size / 100 * 100);
      const errorScore = 100 - (node.metrics.errorRate * 100);
      
      const totalScore = (cpuScore + memScore + connScore + errorScore) / 4;
      
      return { node, score: totalScore };
    });
    
    scored.sort((a, b) => b.score - a.score);
    return scored[0].node;
  }

  async routeRequest(
    request: any,
    sessionId?: string,
    retryCount: number = 0
  ): Promise<any> {
    const node = this.selectNode(sessionId);
    
    if (!node) {
      throw new Error('No available nodes');
    }

    const connectionId = crypto.randomUUID();
    node.activeConnections.add(connectionId);

    try {
      // Route request to selected node
      const response = await this.forwardRequest(node, request);
      
      // Update metrics
      node.metrics.requestsPerSecond++;
      
      return response;
    } catch (error) {
      // Update error rate
      node.metrics.errorRate = (node.metrics.errorRate * 0.9) + 0.1;
      
      // Retry with different node
      if (retryCount < this.config.maxRetries) {
        console.warn(`[LoadBalancer] Request failed on ${node.id}, retrying...`);
        node.status = 'failed';
        return this.routeRequest(request, sessionId, retryCount + 1);
      }
      
      throw error;
    } finally {
      node.activeConnections.delete(connectionId);
    }
  }

  private async forwardRequest(node: LoadBalancerNode, request: any): Promise<any> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${node.url}${request.path}`, {
        method: request.method,
        headers: {
          ...request.headers,
          'X-Forwarded-For': request.ip,
          'X-Forwarded-Host': request.host,
          'X-Load-Balancer-Node': node.id,
        },
        body: request.body,
        timeout: this.config.connectionTimeout,
      } as any);

      // Update response time metric
      const responseTime = Date.now() - startTime;
      node.metrics.responseTime = (node.metrics.responseTime * 0.9) + (responseTime * 0.1);

      if (!response.ok) {
        throw new Error(`Node returned ${response.status}`);
      }

      return response;
    } catch (error) {
      console.error(`[LoadBalancer] Failed to forward request to ${node.id}:`, error);
      throw error;
    }
  }

  getNodeStatus(): Map<string, LoadBalancerNode> {
    return new Map(this.nodes);
  }

  getMetrics(): {
    totalConnections: number;
    averageResponseTime: number;
    nodeUtilization: Record<string, number>;
  } {
    const activeNodes = Array.from(this.nodes.values())
      .filter(node => node.status === 'active');

    const totalConnections = activeNodes.reduce(
      (sum, node) => sum + node.activeConnections.size,
      0
    );

    const averageResponseTime = activeNodes.reduce(
      (sum, node) => sum + node.metrics.responseTime,
      0
    ) / (activeNodes.length || 1);

    const nodeUtilization: Record<string, number> = {};
    activeNodes.forEach(node => {
      const utilization = (
        node.metrics.cpuUsage * 0.4 +
        node.metrics.memoryUsage * 0.4 +
        (node.activeConnections.size / 100) * 20
      );
      nodeUtilization[node.id] = utilization;
    });

    return {
      totalConnections,
      averageResponseTime,
      nodeUtilization,
    };
  }

  rebalance(): void {
    console.log('[LoadBalancer] Starting rebalance');
    
    const activeNodes = Array.from(this.nodes.values())
      .filter(node => node.status === 'active')
      .sort((a, b) => a.activeConnections.size - b.activeConnections.size);

    if (activeNodes.length < 2) return;

    // Find overloaded and underloaded nodes
    const avgConnections = activeNodes.reduce(
      (sum, node) => sum + node.activeConnections.size,
      0
    ) / activeNodes.length;

    const overloaded = activeNodes.filter(
      node => node.activeConnections.size > avgConnections * 1.5
    );
    const underloaded = activeNodes.filter(
      node => node.activeConnections.size < avgConnections * 0.5
    );

    // Migrate connections from overloaded to underloaded
    overloaded.forEach(source => {
      const target = underloaded[0];
      if (!target) return;

      const toMigrate = Math.floor(
        (source.activeConnections.size - avgConnections) / 2
      );
      
      const connections = Array.from(source.activeConnections).slice(0, toMigrate);
      connections.forEach(connId => {
        source.activeConnections.delete(connId);
        target.activeConnections.add(connId);
      });

      console.log(`[LoadBalancer] Migrated ${toMigrate} connections from ${source.id} to ${target.id}`);
    });
  }

  private getSessionFromConnection(connectionId: string): string | undefined {
    // In a real implementation, this would track session-connection mapping
    return undefined;
  }

  shutdown(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    this.nodes.clear();
    this.sessionMap.clear();
  }
}

// Singleton instance
let loadBalancerInstance: LoadBalancerService | null = null;

export function getLoadBalancer(config?: LoadBalancerConfig): LoadBalancerService {
  if (!loadBalancerInstance && config) {
    loadBalancerInstance = new LoadBalancerService(config);
  }
  
  if (!loadBalancerInstance) {
    throw new Error('LoadBalancer not initialized');
  }
  
  return loadBalancerInstance;
}