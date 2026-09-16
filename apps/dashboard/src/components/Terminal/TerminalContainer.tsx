import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Monitor, Grid, List, Settings, Maximize2, Minimize2 } from 'lucide-react';
import { TerminalHeader } from './TerminalHeader';
import { TerminalGrid } from './TerminalGrid';
import { TerminalPane } from './TerminalPane';
import { TerminalControls } from './TerminalControls';
import { useTerminalSession } from './hooks/useTerminalSession';
import { useTerminalOutput } from './hooks/useTerminalOutput';
import { useTerminalCommand } from './hooks/useTerminalCommand';
import { TerminalViewMode } from '@/types/terminal';

interface TerminalContainerProps {
  farmId?: string;
  className?: string;
  defaultViewMode?: TerminalViewMode['type'];
  showHeader?: boolean;
  showControls?: boolean;
  maxHeight?: string;
  autoConnect?: boolean;
}

export const TerminalContainer: React.FC<TerminalContainerProps> = ({
  farmId,
  className = '',
  defaultViewMode = 'grid',
  showHeader = true,
  showControls = true,
  // Responsive max height using clamp() with CSS viewport variable fallback
  // Mobile: min 200px, Desktop: max 600px, scales with viewport
  maxHeight = 'clamp(200px, calc(var(--full-vh, 60vh) * 0.5), 600px)',
  autoConnect = true
}) => {
  const [viewMode, setViewMode] = useState<TerminalViewMode>({
    type: defaultViewMode,
    selectedAgent: 0,
    layout: 'horizontal'
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Terminal session management
  const {
    sessions,
    activeSession,
    isLoading: sessionsLoading,
    error: sessionsError,
    isConnected,
    setActiveSession,
    getSession,
    getSessionAgents
  } = useTerminalSession({ farmId, autoConnect });

  // Get current session and agents
  const currentSession = activeSession ? getSession(activeSession) : null;
  const currentAgents = activeSession ? getSessionAgents(activeSession) : [];

  // Terminal output management
  const {
    getOutput,
    fetchMultipleOutputs,
    registerTerminalRef,
    hasOutput,
    scrollToBottom
  } = useTerminalOutput({
    sessionId: activeSession,
    agentId: viewMode.selectedAgent ?? null,
    autoRefresh: true
  });

  // Command management
  const {
    sendCommand,
    sendCommandToMultiple,
    currentCommand,
    setCurrentCommand,
    commandHistory,
    isExecuting,
    navigateHistory,
    getCommandSuggestions
  } = useTerminalCommand({
    sessionId: activeSession,
    agentId: viewMode.selectedAgent ?? null,
    onCommandSent: (command) => {
      console.log(`Command sent: ${command}`);
    }
  });

  // Load outputs for all agents when session changes
  useEffect(() => {
    if (activeSession && currentAgents.length > 0) {
      const agentIds = currentAgents.map(agent => agent.id);
      fetchMultipleOutputs(activeSession, agentIds);
    }
  }, [activeSession, currentAgents, fetchMultipleOutputs]);

  // Handle view mode changes
  const handleViewModeChange = (newViewMode: TerminalViewMode['type']) => {
    setViewMode(prev => ({
      ...prev,
      type: newViewMode,
      selectedAgent: newViewMode === 'single' ? (prev.selectedAgent ?? 0) : prev.selectedAgent
    }));
  };

  // Handle agent selection
  const handleAgentSelect = (agentId: number) => {
    setViewMode(prev => ({
      ...prev,
      selectedAgent: agentId
    }));
  };

  // Handle command sending
  const handleSendCommand = async (command: string, targetAgentId?: number): Promise<boolean> => {
    if (viewMode.type === 'grid' && !targetAgentId) {
      // Send to all agents in grid mode
      const agentIds = currentAgents.map(agent => agent.id);
      const results = await sendCommandToMultiple(command, agentIds);
      // Return true if at least one command succeeded
      return results.some(result => result.success);
    } else {
      return await sendCommand(command, targetAgentId);
    }
  };

  // Render content based on view mode
  const renderTerminalContent = () => {
    if (!currentSession || currentAgents.length === 0) {
      return (
        <div className="flex-1 bg-gray-900 rounded-lg flex items-center justify-center">
          <div className="text-center text-gray-400">
            <Terminal className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg mb-2">
              {sessionsLoading ? 'Loading terminal sessions...' : 'No active terminal sessions'}
            </p>
            <p className="text-sm">
              {farmId ? 'Launch a farm to see agent terminals' : 'Select a farm to view terminals'}
            </p>
          </div>
        </div>
      );
    }

    switch (viewMode.type) {
      case 'grid':
        return (
          <TerminalGrid
            session={currentSession}
            agents={currentAgents}
            getOutput={getOutput}
            onSendCommand={handleSendCommand}
            registerTerminalRef={registerTerminalRef}
            className="flex-1 overflow-auto"
          />
        );
      
      case 'single':
        const selectedAgent = currentAgents.find(agent => agent.id === viewMode.selectedAgent) || currentAgents[0];
        if (!selectedAgent) return null;
        
        return (
          <TerminalPane
            session={currentSession}
            agent={selectedAgent}
            output={getOutput(currentSession.id, selectedAgent.id)}
            onSendCommand={(command) => handleSendCommand(command, selectedAgent.id)}
            registerTerminalRef={(element) => registerTerminalRef(currentSession.id, selectedAgent.id, element)}
            className="flex-1"
            showCommandInput={showControls}
            expanded={isFullscreen}
          />
        );
      
      case 'tabs':
        return (
          <div className="flex-1 flex flex-col">
            {/* Tab headers */}
            <div className="bg-gray-800 border-b border-gray-700 px-2 py-1">
              <div className="flex space-x-1 overflow-x-auto">
                {currentAgents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => handleAgentSelect(agent.id)}
                    className={`px-3 py-1.5 rounded-t-lg text-sm font-mono whitespace-nowrap transition-colors ${
                      viewMode.selectedAgent === agent.id
                        ? 'bg-gray-900 text-white border-b-2 border-blue-500'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    Agent {agent.id}
                    <span className={`ml-1 w-2 h-2 rounded-full inline-block ${
                      agent.status === 'ready' ? 'bg-green-400' :
                      agent.status === 'working' ? 'bg-blue-400 animate-pulse' :
                      agent.status === 'error' ? 'bg-red-400' :
                      'bg-gray-400'
                    }`} />
                  </button>
                ))}
              </div>
            </div>
            
            {/* Tab content */}
            <AnimatePresence mode="wait">
              {currentAgents.map((agent) => (
                viewMode.selectedAgent === agent.id && (
                  <motion.div
                    key={agent.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="flex-1"
                  >
                    <TerminalPane
                      session={currentSession}
                      agent={agent}
                      output={getOutput(currentSession.id, agent.id)}
                      onSendCommand={(command) => handleSendCommand(command, agent.id)}
                      registerTerminalRef={(element) => registerTerminalRef(currentSession.id, agent.id, element)}
                      className="h-full"
                      showCommandInput={showControls}
                      expanded={isFullscreen}
                    />
                  </motion.div>
                )
              ))}
            </AnimatePresence>
          </div>
        );
      
      default:
        return null;
    }
  };

  const containerClasses = `
    ${isFullscreen 
      ? 'fixed inset-0 z-50 bg-gray-900' 
      : 'bg-gray-900 rounded-lg shadow-xl h-full'
    } 
    ${className}
    flex flex-col
  `;

  return (
    <div 
      className={containerClasses}
      style={{
        // CRITICAL FIX: Use CSS variable for accurate viewport height on iOS Safari
        height: isFullscreen ? 'var(--full-vh, 100vh)' : '100%',
        maxHeight: isFullscreen ? 'none' : '100%',
        minHeight: isFullscreen ? 'var(--full-vh, 100vh)' : '400px'
      }}
    >
      {/* Header */}
      {showHeader && (
        <TerminalHeader
          sessions={sessions}
          activeSession={activeSession}
          onSessionChange={setActiveSession}
          currentSession={currentSession}
          agents={currentAgents}
          selectedAgent={viewMode.selectedAgent}
          onAgentSelect={handleAgentSelect}
          viewMode={viewMode.type}
          onViewModeChange={handleViewModeChange}
          isConnected={isConnected}
          isLoading={sessionsLoading}
          error={sessionsError}
          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
          onToggleSettings={() => setShowSettings(!showSettings)}
          isFullscreen={isFullscreen}
        />
      )}

      {/* Error display */}
      {sessionsError && (
        <div className="bg-red-900/20 border border-red-700 text-red-400 px-4 py-2 text-sm">
          <strong>Error:</strong> {sessionsError}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {renderTerminalContent()}
      </div>

      {/* Global controls */}
      {showControls && viewMode.type === 'grid' && currentSession && (
        <TerminalControls
          onSendCommand={(command) => handleSendCommand(command)}
          currentCommand={currentCommand}
          onCommandChange={setCurrentCommand}
          commandHistory={commandHistory}
          onNavigateHistory={navigateHistory}
          suggestions={getCommandSuggestions(currentCommand)}
          isExecuting={isExecuting}
          placeholder={`Send command to all ${currentAgents.length} agents...`}
        />
      )}
    </div>
  );
};