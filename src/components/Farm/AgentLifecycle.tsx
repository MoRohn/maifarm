import { useState } from 'react';
import { Plus, Minus, RefreshCw, Activity, AlertCircle, CheckCircle } from 'lucide-react';
import { Farm, Agent } from '../../types';

interface AgentLifecycleProps {
  farm: Farm;
  onScaleAgents: (count: number) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function AgentLifecycle({ farm, onScaleAgents, onRefresh }: AgentLifecycleProps) {
  const [isScaling, setIsScaling] = useState(false);
  const [targetCount, setTargetCount] = useState(farm.agents.length);

  // Helper to safely get autoScaling config
  const getAutoScalingConfig = () => {
    const { autoScaling } = farm.config;
    if (typeof autoScaling === 'object' && autoScaling !== null) {
      return autoScaling;
    }
    return {
      enabled: !!autoScaling,
      minAgents: 1,
      maxAgents: 10
    };
  };

  const autoScalingConfig = getAutoScalingConfig();

  const handleScale = async () => {
    if (targetCount === farm.agents.length) return;
    
    setIsScaling(true);
    try {
      await onScaleAgents(targetCount);
      await onRefresh();
    } catch (error) {
      console.error('Failed to scale agents:', error);
    } finally {
      setIsScaling(false);
    }
  };

  const getAgentStatusIcon = (status: Agent['status']) => {
    switch (status) {
      case 'idle':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'busy':
        return <Activity className="h-4 w-4 text-blue-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <RefreshCw className="h-4 w-4 text-gray-500 animate-spin" />;
    }
  };

  const getAgentStatusColor = (status: Agent['status']) => {
    switch (status) {
      case 'idle':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'busy':
      case 'running':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case 'provisioning':
      case 'starting':
      case 'stopping':
      case 'stopped':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  const agentsByStatus = farm.agents.reduce((acc, agent) => {
    acc[agent.status] = (acc[agent.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Scaling Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-medium mb-4">Agent Scaling</h3>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setTargetCount(Math.max(autoScalingConfig.minAgents, targetCount - 1))}
              disabled={targetCount <= autoScalingConfig.minAgents || isScaling}
              className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Minus className="h-4 w-4" />
            </button>
            
            <div className="text-center">
              <div className="text-2xl font-semibold">{targetCount}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">agents</div>
            </div>
            
            <button
              onClick={() => setTargetCount(Math.min(autoScalingConfig.maxAgents, targetCount + 1))}
              disabled={targetCount >= autoScalingConfig.maxAgents || isScaling}
              className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Current: {farm.agents.length} | Min: {autoScalingConfig.minAgents} | Max: {autoScalingConfig.maxAgents}
            </div>
            
            <button
              onClick={handleScale}
              disabled={targetCount === farm.agents.length || isScaling}
              className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isScaling ? (
                <>
                  <RefreshCw className="inline-block h-4 w-4 mr-2 animate-spin" />
                  Scaling...
                </>
              ) : (
                'Apply Scaling'
              )}
            </button>
          </div>
        </div>

        {/* Status Summary */}
        <div className="mt-6 grid grid-cols-5 gap-4">
          {Object.entries(agentsByStatus).map(([status, count]) => (
            <div key={status} className="text-center">
              <div className="text-2xl font-semibold">{count}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400 capitalize">{status}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Agent List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium">Agent Details</h3>
        </div>
        
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {farm.agents.map((agent) => (
            <div key={agent.id} className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    {getAgentStatusIcon(agent.status)}
                    <div>
                      <h4 className="font-medium">Agent {agent.id.slice(0, 8)}</h4>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getAgentStatusColor(agent.status)}`}>
                        {agent.status}
                      </span>
                    </div>
                  </div>
                  
                  <div className="mt-4 grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Type</div>
                      <div className="font-medium capitalize">{agent.type}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Tasks Completed</div>
                      <div className="font-medium">{agent.metrics?.tasksCompleted || 0}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Success Rate</div>
                      <div className="font-medium">{agent.metrics?.successRate || 0}%</div>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Resource Usage</div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">CPU</span>
                          <span className="text-xs font-medium">{agent.resources?.cpuUsage || agent.resources?.cpu?.usage || 0}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                          <div 
                            className="bg-emerald-500 h-1.5 rounded-full"
                            style={{ width: `${agent.resources?.cpuUsage || agent.resources?.cpu?.usage || 0}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Memory</span>
                          <span className="text-xs font-medium">{agent.resources?.memoryUsage || agent.resources?.memory?.usage || 0}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                          <div 
                            className="bg-emerald-500 h-1.5 rounded-full"
                            style={{ width: `${agent.resources?.memoryUsage || agent.resources?.memory?.usage || 0}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Task Queue</span>
                          <span className="text-xs font-medium">{agent.tasks?.length || 0}</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                          <div 
                            className="bg-emerald-500 h-1.5 rounded-full"
                            style={{ width: `${Math.min(100, (agent.tasks?.length || 0) * 20)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Capabilities</div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {agent.capabilities.map((capability, idx) => (
                        <span 
                          key={idx}
                          className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                        >
                          {capability}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="ml-6 text-right">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Last Heartbeat
                  </div>
                  <div className="text-sm font-medium">
                    {agent.lastHeartbeat ? new Date(agent.lastHeartbeat).toLocaleTimeString() : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}