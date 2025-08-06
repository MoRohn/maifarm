import React from 'react';
import { 
  Terminal, 
  RefreshCw, 
  Grid, 
  List, 
  Monitor, 
  Maximize2, 
  Minimize2, 
  Settings, 
  Users,
  Activity,
  Wifi,
  WifiOff
} from 'lucide-react';
import { TerminalSession, TerminalAgent, TerminalViewMode } from '../../types/terminal';

interface TerminalHeaderProps {
  sessions: TerminalSession[];
  activeSession: string | null;
  onSessionChange: (sessionId: string) => void;
  currentSession: TerminalSession | null;
  agents: TerminalAgent[];
  selectedAgent?: number;
  onAgentSelect: (agentId: number) => void;
  viewMode: TerminalViewMode['type'];
  onViewModeChange: (mode: TerminalViewMode['type']) => void;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  onToggleFullscreen: () => void;
  onToggleSettings: () => void;
  isFullscreen: boolean;
}

export const TerminalHeader: React.FC<TerminalHeaderProps> = ({
  sessions,
  activeSession,
  onSessionChange,
  currentSession,
  agents,
  selectedAgent,
  onAgentSelect,
  viewMode,
  onViewModeChange,
  isConnected,
  isLoading,
  error,
  onToggleFullscreen,
  onToggleSettings,
  isFullscreen
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-green-400 bg-green-400/10';
      case 'ready': return 'text-green-400 bg-green-400/10';
      case 'working': return 'text-blue-400 bg-blue-400/10';
      case 'paused': return 'text-yellow-400 bg-yellow-400/10';
      case 'stopped': return 'text-red-400 bg-red-400/10';
      case 'error': return 'text-red-400 bg-red-400/10';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  return (
    <div className="bg-gray-800 px-4 py-3 rounded-t-lg border-b border-gray-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4 min-w-0 flex-1">
          {/* Terminal icon and agent count */}
          <div className="flex items-center space-x-2">
            <Terminal className="w-5 h-5 text-green-400" />
            {currentSession && (
              <span className="text-white font-medium">
                {agents.length} Agent{agents.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Connection status */}
          <div className="flex items-center space-x-2">
            {isConnected ? (
              <Wifi className="w-4 h-4 text-green-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-400" />
            )}
            <span className={`text-xs ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {/* Session selector */}
          <div className="flex items-center space-x-2">
            {isLoading ? (
              <div className="flex items-center space-x-2 text-gray-400 text-sm">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Loading sessions...</span>
              </div>
            ) : sessions.length > 0 ? (
              <select
                value={activeSession || ''}
                onChange={(e) => onSessionChange(e.target.value)}
                className="bg-gray-700 text-white px-3 py-1 rounded text-sm border border-gray-600 focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select Session</option>
                {sessions.map(session => (
                  <option key={session.id} value={session.id}>
                    {session.sessionName} ({session.paneCount} agents)
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-gray-400 text-sm">No active sessions</span>
            )}
          </div>

          {/* Session info */}
          {currentSession && (
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-300">{agents.length} agents</span>
              </div>
              <div className={`flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs ${getStatusColor(currentSession.status)}`}>
                <Activity className="w-3 h-3" />
                <span className="capitalize">{currentSession.status}</span>
              </div>
            </div>
          )}

          {/* Agent selector for single/tabs view */}
          {(viewMode === 'single' || viewMode === 'tabs') && agents.length > 1 && (
            <select
              value={selectedAgent ?? 0}
              onChange={(e) => onAgentSelect(Number(e.target.value))}
              className="bg-gray-700 text-white px-3 py-1 rounded text-sm border border-gray-600 focus:border-blue-500 focus:outline-none"
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  Agent {agent.id} ({agent.status})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-2 ml-4">
          {/* View mode toggle */}
          {agents.length > 1 && (
            <div className="flex bg-gray-700 rounded-lg p-1 border border-gray-600">
              <button
                onClick={() => onViewModeChange('grid')}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'grid' 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-600'
                }`}
                title="Grid View"
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => onViewModeChange('tabs')}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'tabs' 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-600'
                }`}
                title="Tabbed View"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => onViewModeChange('single')}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'single' 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-600'
                }`}
                title="Single View"
              >
                <Monitor className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Settings */}
          <button
            onClick={onToggleSettings}
            className="p-2 hover:bg-gray-700 rounded transition-colors"
            title="Terminal Settings"
          >
            <Settings className="w-4 h-4 text-gray-400 hover:text-white" />
          </button>

          {/* Fullscreen toggle */}
          <button
            onClick={onToggleFullscreen}
            className="p-2 hover:bg-gray-700 rounded transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-gray-400 hover:text-white" />
            ) : (
              <Maximize2 className="w-4 h-4 text-gray-400 hover:text-white" />
            )}
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mt-2 px-3 py-1 bg-red-900/20 border border-red-700 rounded text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
};