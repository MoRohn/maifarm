import React from 'react';
import { Cpu, HardDrive, Network, Database, AlertTriangle } from 'lucide-react';
import { ResourceUtilization as ResourceUtilizationType, AgentPerformanceMetric } from '@/types/analytics';

interface ResourceUtilizationProps {
  utilization?: ResourceUtilizationType;
  agents: AgentPerformanceMetric[];
}

export const ResourceUtilization: React.FC<ResourceUtilizationProps> = ({
  utilization,
  agents
}) => {
  const getUtilizationColor = (value: number): string => {
    if (value < 50) return 'text-green-600';
    if (value < 75) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getUtilizationBgColor = (value: number): string => {
    if (value < 50) return 'bg-green-100 dark:bg-green-900/20';
    if (value < 75) return 'bg-yellow-100 dark:bg-yellow-900/20';
    return 'bg-red-100 dark:bg-red-900/20';
  };

  const ResourceGauge = ({ 
    label, 
    value, 
    icon,
    threshold = 75 
  }: { 
    label: string; 
    value: number; 
    icon: React.ReactNode;
    threshold?: number;
  }) => {
    const isWarning = value > threshold;
    
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-sm font-medium">{label}</span>
          </div>
          {isWarning && <AlertTriangle className="w-4 h-4 text-yellow-500" />}
        </div>
        
        <div className="mb-2">
          <div className="flex items-end justify-between mb-1">
            <span className={`text-2xl font-bold ${getUtilizationColor(value)}`}>
              {value.toFixed(1)}%
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              of capacity
            </span>
          </div>
        </div>
        
        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              value < 50 ? 'bg-green-500' :
              value < 75 ? 'bg-yellow-500' :
              'bg-red-500'
            }`}
            style={{ width: `${Math.min(value, 100)}%` }}
          />
        </div>
        
        {isWarning && (
          <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
            Above {threshold}% threshold
          </p>
        )}
      </div>
    );
  };

  // Calculate agent-level resource stats
  const agentResourceStats = agents.reduce((acc, agent) => {
    acc.highCpu += agent.resourceUsage.cpu > 80 ? 1 : 0;
    acc.highMemory += agent.resourceUsage.memory > 80 ? 1 : 0;
    acc.totalCpu += agent.resourceUsage.cpu;
    acc.totalMemory += agent.resourceUsage.memory;
    return acc;
  }, { highCpu: 0, highMemory: 0, totalCpu: 0, totalMemory: 0 });

  const avgAgentCpu = agents.length > 0 ? agentResourceStats.totalCpu / agents.length : 0;
  const avgAgentMemory = agents.length > 0 ? agentResourceStats.totalMemory / agents.length : 0;

  return (
    <div className="space-y-6">
      {/* System Resources */}
      {utilization && (
        <div>
          <h3 className="text-lg font-semibold mb-4">System Resources</h3>
          <div className="grid grid-cols-2 gap-4">
            <ResourceGauge
              label="CPU"
              value={utilization.cpu}
              icon={<Cpu className="w-5 h-5 text-blue-500" />}
            />
            <ResourceGauge
              label="Memory"
              value={utilization.memory}
              icon={<HardDrive className="w-5 h-5 text-purple-500" />}
            />
            <ResourceGauge
              label="Storage"
              value={utilization.storage}
              icon={<Database className="w-5 h-5 text-green-500" />}
              threshold={85}
            />
            <ResourceGauge
              label="Network"
              value={utilization.network}
              icon={<Network className="w-5 h-5 text-orange-500" />}
              threshold={90}
            />
          </div>
        </div>
      )}

      {/* Agent Resource Summary */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Agent Resource Usage</h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Average CPU</span>
            <span className={`font-medium ${getUtilizationColor(avgAgentCpu)}`}>
              {avgAgentCpu.toFixed(1)}%
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Average Memory</span>
            <span className={`font-medium ${getUtilizationColor(avgAgentMemory)}`}>
              {avgAgentMemory.toFixed(1)}%
            </span>
          </div>
          
          {agentResourceStats.highCpu > 0 && (
            <div className={`p-3 rounded-lg ${getUtilizationBgColor(90)}`}>
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                {agentResourceStats.highCpu} agents with high CPU usage (&gt;80%)
              </p>
            </div>
          )}
          
          {agentResourceStats.highMemory > 0 && (
            <div className={`p-3 rounded-lg ${getUtilizationBgColor(90)}`}>
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                {agentResourceStats.highMemory} agents with high memory usage (&gt;80%)
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Resource Distribution */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Resource Distribution</h3>
        <div className="space-y-3">
          {agents
            .sort((a, b) => (b.resourceUsage.cpu + b.resourceUsage.memory) - (a.resourceUsage.cpu + a.resourceUsage.memory))
            .slice(0, 5)
            .map((agent) => {
              const totalUsage = (agent.resourceUsage.cpu + agent.resourceUsage.memory) / 2;
              return (
                <div key={agent.agentId} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{agent.agentName}</span>
                      <span className={`text-sm ${getUtilizationColor(totalUsage)}`}>
                        {totalUsage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500"
                            style={{ width: `${agent.resourceUsage.cpu}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">CPU</span>
                      </div>
                      <div className="flex-1">
                        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500"
                            style={{ width: `${agent.resourceUsage.memory}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">Mem</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};