import { useState, useEffect, useCallback } from 'react';
import { getHAManager, HACluster, HANode, HAConfig } from '@/services/highAvailability/haManager';
import { getLoadBalancer, LoadMetrics } from '@/services/loadBalancer/loadBalancerService';

interface HANodeInfo {
  id: string;
  status: 'healthy' | 'unhealthy' | 'degraded' | 'initializing';
  endpoint: string;
  cpuUsage: number;
  memoryUsage: number;
  activeConnections: number;
  responseTime: number;
  taskQueue: number;
  lastHealthCheck: Date;
  metadata: {
    region: string;
    zone: string;
    version: string;
    capabilities: string[];
  };
}

interface FailoverEvent {
  fromNode: string;
  toNode: string;
  timestamp: Date;
}

export interface UseHighAvailabilityReturn {
  // State
  cluster: HACluster | null;
  isLeader: boolean;
  nodeHealth: number;
  isFailoverInProgress: boolean;
  metrics: {
    totalConnections: number;
    averageResponseTime: number;
    nodeUtilization: Record<string, number>;
    responseTimeHistory: { time: string; value: number }[];
    requestsPerSecond: number;
  } | null;
  
  // Additional state for HAStatus component
  nodes: HANodeInfo[];
  redundancyLevel: number;
  isHealthy: boolean;
  failoverHistory: FailoverEvent[];
  
  // Actions
  triggerFailover: () => Promise<void>;
  rebalance: () => Promise<void>;
  updateNodeWeight: (nodeId: string, weight: number) => void;
  registerNode: (node: HANode) => void;
  unregisterNode: (nodeId: string) => void;
  refreshNodes: () => void;
}

const DEFAULT_HA_CONFIG: HAConfig = {
  clusterId: 'maifarm-cluster',
  nodeId: `node-${crypto.randomUUID().split('-')[0]}`,
  heartbeatInterval: 5000,
  healthCheckTimeout: 3000,
  failoverDelay: 10000,
  maxFailoverAttempts: 3,
  enableAutoFailover: true,
};

export function useHighAvailability(farmId?: string, config?: Partial<HAConfig>): UseHighAvailabilityReturn {
  const [cluster, setCluster] = useState<HACluster | null>(null);
  const [isLeader, setIsLeader] = useState(false);
  const [nodeHealth, setNodeHealth] = useState(100);
  const [isFailoverInProgress, setIsFailoverInProgress] = useState(false);
  const [metrics, setMetrics] = useState<UseHighAvailabilityReturn['metrics']>(null);
  const [responseTimeHistory, setResponseTimeHistory] = useState<{ time: string; value: number }[]>([]);
  const [nodes, setNodes] = useState<HANodeInfo[]>([]);
  const [redundancyLevel, setRedundancyLevel] = useState(1);
  const [isHealthy, setIsHealthy] = useState(true);
  const [failoverHistory, setFailoverHistory] = useState<FailoverEvent[]>([]);

  // Initialize HA Manager
  useEffect(() => {
    const haConfig = { ...DEFAULT_HA_CONFIG, ...config };
    const haManager = getHAManager(haConfig);
    
    // Initialize load balancer
    const loadBalancer = getLoadBalancer({
      strategy: 'least-connections',
      healthCheckInterval: 5000,
      connectionTimeout: 5000,
      maxRetries: 3,
      stickySession: true,
      sessionTimeout: 300000, // 5 minutes
    });

    const initializeHA = async () => {
      try {
        await haManager.initialize();
        setCluster(haManager.getClusterStatus());
        setIsLeader(haManager.isPrimary());
        
        console.log('[HA] High Availability initialized');
      } catch (error) {
        console.error('Failed to initialize HA:', error);
      }
    };

    initializeHA();

    // Set up event listeners
    haManager.on('leaderElected', ({ nodeId }) => {
      setIsLeader(true);
      console.log(`[HA] This node (${nodeId}) is now the leader`);
    });

    haManager.on('followerMode', ({ leaderId }) => {
      setIsLeader(false);
      console.log(`[HA] Following leader: ${leaderId}`);
    });

    haManager.on('failoverStarted', () => {
      setIsFailoverInProgress(true);
      console.log('[HA] Failover in progress...');
    });

    haManager.on('failoverCompleted', ({ newPrimary }) => {
      setIsFailoverInProgress(false);
      console.log(`[HA] Failover completed. New primary: ${newPrimary}`);
      
      // Add to failover history
      setFailoverHistory(prev => [{
        fromNode: 'previous-primary',
        toNode: newPrimary,
        timestamp: new Date()
      }, ...prev].slice(0, 10)); // Keep last 10 events
    });

    haManager.on('healthCheckComplete', ({ cluster: updatedCluster }) => {
      setCluster(updatedCluster);
      
      // Calculate overall health
      const activeNodes = updatedCluster.nodes.filter((n: HANode) => n.status === 'active').length;
      const health = (activeNodes / updatedCluster.nodes.length) * 100;
      setNodeHealth(health);
      setIsHealthy(health >= 50);
      
      // Update nodes for HAStatus component
      const nodeInfos: HANodeInfo[] = updatedCluster.nodes.map((node: HANode) => ({
        id: node.id,
        status: node.status === 'active' ? 'healthy' : 
                node.status === 'failed' ? 'unhealthy' : 
                node.status === 'standby' ? 'degraded' : 'initializing',
        endpoint: `${node.host}:${node.port}`,
        cpuUsage: node.load * 100 / node.capacity,
        memoryUsage: Math.random() * 80 + 20, // Mock data
        activeConnections: Math.floor(Math.random() * 100),
        responseTime: Math.random() * 200 + 50,
        taskQueue: Math.floor(Math.random() * 20),
        lastHealthCheck: new Date(),
        metadata: {
          region: 'us-west-2',
          zone: `zone-${node.id.slice(-1)}`,
          version: node.version,
          capabilities: ['compute', 'storage', 'networking']
        }
      }));
      setNodes(nodeInfos);
      
      // Calculate redundancy level
      setRedundancyLevel(Math.floor(activeNodes / 2) || 1);
    });

    haManager.on('error', ({ type, error }) => {
      console.error(`HA error (${type}):`, error);
    });

    // Update metrics periodically
    const metricsInterval = setInterval(() => {
      const lbMetrics = loadBalancer.getMetrics();
      const now = new Date().toLocaleTimeString();
      
      setMetrics({
        ...lbMetrics,
        responseTimeHistory: responseTimeHistory.slice(-20).concat({
          time: now,
          value: lbMetrics.averageResponseTime,
        }),
        requestsPerSecond: Math.floor(Math.random() * 100), // Mock data
      });
      
      setResponseTimeHistory(prev => [...prev.slice(-20), {
        time: now,
        value: lbMetrics.averageResponseTime,
      }]);
    }, 5000);

    return () => {
      haManager.shutdown();
      loadBalancer.shutdown();
      clearInterval(metricsInterval);
    };
  }, [config]);

  const triggerFailover = useCallback(async () => {
    const haManager = getHAManager();
    
    if (!isLeader) {
      console.error('[HA] Only the leader can trigger failover');
      return;
    }

    try {
      await haManager.triggerFailover();
    } catch (error) {
      console.error('Failed to trigger failover:', error);
    }
  }, [isLeader]);

  const rebalance = useCallback(async () => {
    const haManager = getHAManager();
    const loadBalancer = getLoadBalancer();
    
    try {
      console.log('[HA] Rebalancing load...');
      
      await haManager.rebalanceLoad();
      loadBalancer.rebalance();
      
      console.log('[HA] Load rebalanced successfully');
    } catch (error) {
      console.error('Failed to rebalance:', error);
    }
  }, []);

  const updateNodeWeight = useCallback((nodeId: string, weight: number) => {
    const loadBalancer = getLoadBalancer();
    
    const node = cluster?.nodes.find(n => n.id === nodeId);
    if (node) {
      loadBalancer.unregisterNode(nodeId);
      loadBalancer.registerNode(node, weight);
      
      console.log(`[HA] Updated weight for ${nodeId} to ${weight}`);
    }
  }, [cluster]);

  const registerNode = useCallback((node: HANode) => {
    const loadBalancer = getLoadBalancer();
    loadBalancer.registerNode(node);
    
    console.log(`[HA] Registered node: ${node.id}`);
  }, []);

  const unregisterNode = useCallback((nodeId: string) => {
    const loadBalancer = getLoadBalancer();
    loadBalancer.unregisterNode(nodeId);
    
    console.log(`[HA] Unregistered node: ${nodeId}`);
  }, []);

  const refreshNodes = useCallback(() => {
    const haManager = getHAManager();
    haManager.performHealthCheck();
    console.log('[HA] Refreshing node status...');
  }, []);

  return {
    // State
    cluster,
    isLeader,
    nodeHealth,
    isFailoverInProgress,
    metrics: metrics ? {
      ...metrics,
      responseTimeHistory,
    } : null,
    
    // Additional state for HAStatus component
    nodes,
    redundancyLevel,
    isHealthy,
    failoverHistory,
    
    // Actions
    triggerFailover,
    rebalance,
    updateNodeWeight,
    registerNode,
    unregisterNode,
    refreshNodes,
  };
}