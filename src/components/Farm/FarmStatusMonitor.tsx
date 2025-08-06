import React from 'react';
import { Activity, Cpu, HardDrive, Users, AlertTriangle, CheckCircle } from 'lucide-react';
import { Farm } from '../../types';

interface FarmStatusMonitorProps {
  farm: Farm;
}

const FarmStatusMonitor: React.FC<FarmStatusMonitorProps> = ({ farm }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'text-green-500';
      case 'creating':
      case 'paused':
        return 'text-yellow-500';
      case 'failed':
      case 'stopped':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <CheckCircle className="h-5 w-5" />;
      case 'failed':
        return <AlertTriangle className="h-5 w-5" />;
      default:
        return <Activity className="h-5 w-5" />;
    }
  };

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const calculateAverageUptime = () => {
    if (farm.agents.length === 0) return 0;
    const totalUptime = farm.agents.reduce((sum, agent) => sum + (agent.metrics?.uptime || 0), 0);
    return totalUptime / farm.agents.length;
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">{farm.name}</h2>
          {farm.description && (
            <p className="text-gray-600 mt-1">{farm.description}</p>
          )}
        </div>
        <div className={`flex items-center space-x-2 ${getStatusColor(farm.status)}`}>
          {getStatusIcon(farm.status)}
          <span className="font-medium capitalize">{farm.status}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Users className="h-5 w-5 text-blue-500" />
            <span className="text-sm font-medium text-gray-700">Agents</span>
          </div>
          <div className="text-2xl font-bold">{farm.agents.length}</div>
          <div className="text-sm text-gray-600">
            {farm.agents.filter(a => a.status === 'running' || a.status === 'busy').length} active
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Cpu className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-gray-700">CPU Usage</span>
          </div>
          <div className="text-2xl font-bold">{(typeof farm.resources?.cpu === 'object' ? farm.resources.cpu.percentage : farm.resources?.cpu)?.toFixed(1) || 0}%</div>
          <div className="text-sm text-gray-600">
            CPU Utilization
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <HardDrive className="h-5 w-5 text-purple-500" />
            <span className="text-sm font-medium text-gray-700">Memory</span>
          </div>
          <div className="text-2xl font-bold">{(typeof farm.resources?.memory === 'object' ? farm.resources.memory.percentage : farm.resources?.memory)?.toFixed(1) || 0}%</div>
          <div className="text-sm text-gray-600">
            Memory Utilization
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Activity className="h-5 w-5 text-orange-500" />
            <span className="text-sm font-medium text-gray-700">Uptime</span>
          </div>
          <div className="text-2xl font-bold">{formatUptime(calculateAverageUptime())}</div>
          <div className="text-sm text-gray-600">Average agent uptime</div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Resource Utilization</h3>
        
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">CPU</span>
              <span className="font-medium">{(typeof farm.resources?.cpu === 'object' ? farm.resources.cpu.percentage : farm.resources?.cpu)?.toFixed(1) || 0}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${
                  ((typeof farm.resources?.cpu === 'object' ? farm.resources.cpu.percentage : farm.resources?.cpu) || 0) > 80 ? 'bg-red-500' : 
                  ((typeof farm.resources?.cpu === 'object' ? farm.resources.cpu.percentage : farm.resources?.cpu) || 0) > 60 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${(typeof farm.resources?.cpu === 'object' ? farm.resources.cpu.percentage : farm.resources?.cpu) || 0}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Memory</span>
              <span className="font-medium">{(typeof farm.resources?.memory === 'object' ? farm.resources.memory.percentage : farm.resources?.memory)?.toFixed(1) || 0}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${
                  ((typeof farm.resources?.memory === 'object' ? farm.resources.memory.percentage : farm.resources?.memory) || 0) > 80 ? 'bg-red-500' : 
                  ((typeof farm.resources?.memory === 'object' ? farm.resources.memory.percentage : farm.resources?.memory) || 0) > 60 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${(typeof farm.resources?.memory === 'object' ? farm.resources.memory.percentage : farm.resources?.memory) || 0}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Storage</span>
              <span className="font-medium">{(typeof farm.resources?.disk === 'object' ? farm.resources.disk.percentage : farm.resources?.disk)?.toFixed(1) || 0}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${
                  ((typeof farm.resources?.disk === 'object' ? farm.resources.disk.percentage : farm.resources?.disk) || 0) > 80 ? 'bg-red-500' : 
                  ((typeof farm.resources?.disk === 'object' ? farm.resources.disk.percentage : farm.resources?.disk) || 0) > 60 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${(typeof farm.resources?.disk === 'object' ? farm.resources.disk.percentage : farm.resources?.disk) || 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {farm.template && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Template: <span className="font-medium">{farm.template}</span>
            </div>
            <div className="text-sm text-gray-600">
              Created: <span className="font-medium">
                {new Date(farm.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FarmStatusMonitor;