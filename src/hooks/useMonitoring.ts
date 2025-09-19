import { useState, useEffect, useCallback } from 'react';
import { 
  MonitoringData, 
  AgentMonitoringData,
  ResourceMetrics,
  ErrorPrediction,
  MonitoringControl,
  MonitoringAlert
} from '@/types/monitoring';
import { monitoringService } from '@/services/monitoringService';
import { toast } from 'react-hot-toast';

export function useMonitoring(farmId: string) {
  const [monitoringData, setMonitoringData] = useState<MonitoringData | null>(null);
  const [agents, setAgents] = useState<AgentMonitoringData[]>([]);
  const [resources, setResources] = useState<ResourceMetrics | null>(null);
  const [predictions, setPredictions] = useState<ErrorPrediction[]>([]);
  const [alerts, setAlerts] = useState<MonitoringAlert[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Subscribe to monitoring updates
    const unsubscribeData = monitoringService.subscribeToFarm(farmId, (data) => {
      setMonitoringData(data);
      setAgents(data.agents);
      setResources(data.resources);
      setPredictions(data.predictions);
      setIsConnected(true);
    });

    // Subscribe to alerts
    const unsubscribeAlerts = monitoringService.subscribeToAlerts((alert) => {
      if (alert.farmId === farmId) {
        setAlerts(prev => [...prev, alert]);
        
        // Show toast notification for critical alerts
        if (alert.severity === 'critical') {
          toast.error(alert.message, {
            duration: 5000,
            icon: '🚨'
          });
        } else if (alert.severity === 'warning') {
          toast(alert.message, {
            duration: 4000,
            icon: '⚠️'
          });
        }
      }
    });

    // Get initial data
    const initialData = monitoringService.getMonitoringData(farmId);
    if (initialData) {
      setMonitoringData(initialData);
      setAgents(initialData.agents);
      setResources(initialData.resources);
      setPredictions(initialData.predictions);
    }

    return () => {
      unsubscribeData();
      unsubscribeAlerts();
    };
  }, [farmId]);

  const subscribeToAgentUpdates = useCallback(() => {
    // This is handled by the main subscription
    // Return a no-op unsubscribe function
    return () => {};
  }, []);

  const sendControl = useCallback((control: MonitoringControl) => {
    monitoringService.sendControl(control);
    
    // Show feedback
    toast.success(`${control.type} command sent to agent`, {
      duration: 2000
    });
  }, []);

  const acknowledgeAlert = useCallback((alertId: string) => {
    monitoringService.acknowledgeAlert(alertId);
    setAlerts(prev => 
      prev.map(alert => 
        alert.id === alertId 
          ? { ...alert, acknowledged: true } 
          : alert
      )
    );
  }, []);

  const getAgentById = useCallback((agentId: string) => {
    return agents.find(agent => agent.id === agentId);
  }, [agents]);

  const getResourceTrends = useCallback(() => {
    if (!resources) return null;
    
    return {
      cpu: resources.predictions.cpuTrend,
      memory: resources.predictions.memoryTrend,
      timeToLimit: resources.predictions.estimatedTimeToLimit
    };
  }, [resources]);

  const getHighRiskAgents = useCallback(() => {
    return agents.filter(agent => {
      const agentPredictions = predictions.filter(p => p.agentId === agent.id);
      return agentPredictions.some(p => p.probability > 0.7);
    });
  }, [agents, predictions]);

  const getCommunicationStats = useCallback(() => {
    if (!monitoringData?.communication) return null;
    
    const { nodes, edges } = monitoringData.communication;
    const activeNodes = nodes.filter(n => n.status === 'active').length;
    const totalMessages = edges.reduce((sum, edge) => sum + edge.weight, 0);
    const avgLatency = edges.reduce((sum, edge) => sum + edge.latency, 0) / edges.length;
    
    return {
      activeNodes,
      totalNodes: nodes.length,
      totalMessages,
      avgLatency: Math.round(avgLatency)
    };
  }, [monitoringData]);

  return {
    // Data
    monitoringData,
    agents,
    resources,
    predictions,
    alerts,
    isConnected,
    
    // Methods
    subscribeToAgentUpdates,
    sendControl,
    acknowledgeAlert,
    getAgentById,
    getResourceTrends,
    getHighRiskAgents,
    getCommunicationStats
  };
}

// Hook for monitoring preferences
export function useMonitoringPreferences() {
  const [preferences, setPreferences] = useState({
    refreshInterval: 5000,
    alertThresholds: {
      cpu: 80,
      memory: 85,
      errorRate: 0.1,
      responseTime: 1000
    },
    visualizations: {
      enable3D: true,
      particleEffects: true,
      animationSpeed: 1
    },
    notifications: {
      enableSound: true,
      enableDesktop: true,
      severityFilter: ['warning', 'error', 'critical'] as const
    }
  });

  const updatePreferences = useCallback((updates: Partial<typeof preferences>) => {
    setPreferences(prev => ({
      ...prev,
      ...updates
    }));
    
    // Save to localStorage
    localStorage.setItem('monitoringPreferences', JSON.stringify({
      ...preferences,
      ...updates
    }));
  }, [preferences]);

  useEffect(() => {
    // Load from localStorage
    const saved = localStorage.getItem('monitoringPreferences');
    if (saved) {
      try {
        setPreferences(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load monitoring preferences:', e);
      }
    }
  }, []);

  return {
    preferences,
    updatePreferences
  };
}