import React, { useState } from 'react';
import { Plus, Minus, Activity, Cpu, AlertCircle, CheckCircle, Pause } from 'lucide-react';
import { Farm, Agent } from '@/types';
import { getAgentsFromFarm, getAgentCount } from '@/utils/farmHelpers';
import { useFarmOrchestration } from '@/hooks/useFarmOrchestration';

interface AgentPoolManagerProps {
  farm: Farm;
}

const AgentPoolManager: React.FC<AgentPoolManagerProps> = ({ farm }) => {
  const { scaleAgents } = useFarmOrchestration();
  const [scaling, setScaling] = useState<string | null>(null);

  const groupAgentsByType = () => {
    const groups: { [key: string]: Agent[] } = {};
    const agents = getAgentsFromFarm(farm);
    agents.forEach(agent => {
      if (!groups[agent.type]) {
        groups[agent.type] = [];
      }
      groups[agent.type].push(agent);
    });
    return groups;
  };

  const getAgentStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
      case 'idle':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'busy':
        return <Activity className="h-4 w-4 text-blue-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'stopping':
      case 'stopped':
        return <Pause className="h-4 w-4 text-gray-500" />;
      default:
        return <div className="h-4 w-4 rounded-full bg-gray-300" />;
    }
  };

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600';
      case 'degraded':
        return 'text-yellow-600';
      case 'unhealthy':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const handleScale = async (agentType: string, delta: number) => {
    setScaling(agentType);
    try {
      await scaleAgents(farm.id, agentType, delta);
    } catch (error) {
      console.error('Failed to scale agents:', error);
    } finally {
      setScaling(null);
    }
  };

  const agentGroups = groupAgentsByType();

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Agent Pool Management</h3>

      <div className="space-y-6">
        {Object.entries(agentGroups).map(([type, agents]) => (
          <div key={type} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="font-medium capitalize">{type} Agents</h4>
                <p className="text-sm text-gray-600">
                  {agents.length} agents ({agents.filter(a => a.status === 'working').length} working)
                </p>
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleScale(type, -1)}
                  disabled={scaling === type || agents.filter(a => a.status === 'idle').length === 0}
                  className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Scale down"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="font-medium px-2">{agents.length}</span>
                <button
                  onClick={() => handleScale(type, 1)}
                  disabled={scaling === type}
                  className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Scale up"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {agents.map(agent => (
                <div 
                  key={agent.id} 
                  className="border border-gray-200 rounded-md p-3 text-sm"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      {getAgentStatusIcon(agent.status)}
                      <span className="font-medium">
                        Agent {agent.id.slice(0, 8)}
                      </span>
                    </div>
                    <span className={`text-xs ${getHealthColor(agent.lifecycle?.health?.status || 'healthy')}`}>
                      {agent.lifecycle?.health?.status || 'healthy'}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">CPU:</span>
                      <span>{(agent.resources?.cpu || 0).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Memory:</span>
                      <span>{(agent.resources?.memory || 0).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Tasks:</span>
                      <span>{agent.currentTask ? '1' : '0'} active</span>
                    </div>
                  </div>

                  {(agent.metrics?.tasksCompleted || 0) > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Completed:</span>
                        <span className="text-green-600">{agent.metrics?.tasksCompleted || 0}</span>
                      </div>
                      {(agent.metrics?.tasksFailed || 0) > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Failed:</span>
                          <span className="text-red-600">{agent.metrics?.tasksFailed || 0}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Agent type aggregate metrics */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Avg CPU:</span>
                  <span className="ml-2 font-medium">
                    {(agents.reduce((sum, a) => sum + (a.resources?.cpu || 0), 0) / agents.length).toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Total Tasks:</span>
                  <span className="ml-2 font-medium">
                    {agents.reduce((sum, a) => sum + (a.metrics?.tasksCompleted || 0), 0)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Success Rate:</span>
                  <span className="ml-2 font-medium">
                    {agents.length > 0 ? (
                      agents.reduce((sum, a) => {
                        const total = (a.metrics?.tasksCompleted || 0) + (a.metrics?.tasksFailed || 0);
                        return sum + (total > 0 ? ((a.metrics?.tasksCompleted || 0) / total) : 1);
                      }, 0) / agents.length * 100
                    ).toFixed(1) : 0}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Overall pool statistics */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <h4 className="font-medium mb-3">Pool Statistics</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Total Agents:</span>
            <span className="ml-2 font-medium">{getAgentCount(farm)}</span>
          </div>
          <div>
            <span className="text-gray-500">Active:</span>
            <span className="ml-2 font-medium text-green-600">
              {getAgentsFromFarm(farm).filter(a => ['active', 'busy'].includes(a.status)).length}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Idle:</span>
            <span className="ml-2 font-medium text-blue-600">
              {getAgentsFromFarm(farm).filter(a => a.status === 'idle').length}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Failed:</span>
            <span className="ml-2 font-medium text-red-600">
              {getAgentsFromFarm(farm).filter(a => a.status === 'error').length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentPoolManager;