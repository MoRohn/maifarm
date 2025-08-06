import React, { useEffect, useState } from 'react';
import { useInfogWebSocket } from '../../hooks/useInfogWebSocket';
import { AgentStatus } from '../../types/monitoring';
import { formatDistanceToNow } from 'date-fns';

interface AgentCardProps {
  agentId: string;
  status: AgentStatus;
  agentType: string;
}

const AgentCard: React.FC<AgentCardProps> = ({ agentId, status, agentType }) => {
  const getStatusColor = (status: AgentStatus['status']) => {
    switch (status) {
      case 'working': return 'bg-green-500';
      case 'ready': return 'bg-blue-500';
      case 'idle': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      case 'disconnected': return 'bg-gray-500';
      default: return 'bg-gray-400';
    }
  };

  const getAgentIcon = (agentId: string) => {
    switch (agentId) {
      case 'agent_0': return '📰';
      case 'agent_1': return '🧠';
      case 'agent_2': return '🎨';
      case 'agent_3': return '🏭';
      default: return '🤖';
    }
  };

  const getAgentName = (agentId: string) => {
    switch (agentId) {
      case 'agent_0': return 'Data Collector';
      case 'agent_1': return 'Content Analyzer';
      case 'agent_2': return 'Design Generator';
      case 'agent_3': return 'Output Assembler';
      default: return agentId;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center">
          <span className="text-2xl mr-2">{getAgentIcon(agentId)}</span>
          <div>
            <h3 className="font-semibold text-gray-800">{getAgentName(agentId)}</h3>
            <p className="text-xs text-gray-500">{agentId}</p>
          </div>
        </div>
        <div className={`w-3 h-3 rounded-full ${getStatusColor(status.status)} animate-pulse`} />
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Status:</span>
          <span className="font-medium capitalize">{status.status}</span>
        </div>
        
        {status.currentTask && (
          <div className="flex justify-between">
            <span className="text-gray-600">Task:</span>
            <span className="font-medium text-right truncate max-w-[150px]">
              {status.currentTask}
            </span>
          </div>
        )}
        
        {status.progress !== undefined && status.progress > 0 && (
          <div className="mt-2">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-600">Progress</span>
              <span>{Math.round(status.progress)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${status.progress}%` }}
              />
            </div>
          </div>
        )}
        
        <div className="flex justify-between">
          <span className="text-gray-600">Last Update:</span>
          <span className="text-xs">
            {formatDistanceToNow(new Date(status.lastUpdate), { addSuffix: true })}
          </span>
        </div>
      </div>
    </div>
  );
};

export const AgentStatusBoard: React.FC = () => {
  const { agentStates, connectionState } = useInfogWebSocket();
  const [agentTypes, setAgentTypes] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    // Set default agent types
    setAgentTypes({
      agent_0: 'Data Collector',
      agent_1: 'Content Analyzer',
      agent_2: 'Design Generator',
      agent_3: 'Output Assembler'
    });
  }, []);

  const agents = Object.entries(agentStates);
  const connectedCount = agents.filter(([_, status]) => 
    status.status !== 'disconnected' && status.status !== 'shutdown'
  ).length;

  return (
    <div className="bg-gray-50 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Agent Status Board</h2>
          <p className="text-sm text-gray-600 mt-1">
            Real-time status of Trump Infographic agents
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <p className="text-sm text-gray-600">Connected Agents</p>
            <p className="text-2xl font-bold text-gray-800">{connectedCount} / {agents.length}</p>
          </div>
          
          <div className={`w-3 h-3 rounded-full ${
            connectionState.status === 'connected' ? 'bg-green-500' : 'bg-red-500'
          }`} />
        </div>
      </div>

      {connectionState.status !== 'connected' && (
        <div className="mb-4 p-3 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded-md">
          <p className="text-sm">
            WebSocket {connectionState.status}... 
            {connectionState.reconnectAttempts > 0 && 
              ` (Attempt ${connectionState.reconnectAttempts})`
            }
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {agents.map(([agentId, status]) => (
          <AgentCard
            key={agentId}
            agentId={agentId}
            status={status}
            agentType={agentTypes[agentId] || 'Unknown'}
          />
        ))}
      </div>

      {agents.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No agents connected yet...</p>
        </div>
      )}
    </div>
  );
};