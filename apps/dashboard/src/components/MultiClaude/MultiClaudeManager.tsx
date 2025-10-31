import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AgentGrid } from './AgentGrid';
import { AgentControls } from './AgentControls';
import { useMultiClaude } from '@/hooks/useMultiClaude';
import { useToast } from '@/hooks/useToast';
import { 
  Settings, 
  Zap, 
  AlertTriangle, 
  CheckCircle2,
  Loader2,
  Terminal,
  Play,
  StopCircle
} from 'lucide-react';

export const MultiClaudeManager: React.FC = () => {
  const {
    agents,
    config,
    isConnected,
    addAgent,
    removeAgent,
    sendCommand,
    sendPrompt,
    updateConfig,
    startSession,
    stopSession
  } = useMultiClaude();

  const { showToast } = useToast();
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (isConnected) {
      showToast('Connected to Multi-Claude orchestrator', 'success');
    }
  }, [isConnected]);

  const handleStartSession = async () => {
    setIsStarting(true);
    try {
      await startSession(config.sessionName);
      setIsSessionActive(true);
      showToast('Multi-Claude session started successfully', 'success');
    } catch (error) {
      showToast('Failed to start session: ' + (error as Error).message, 'error');
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopSession = async () => {
    try {
      await stopSession();
      setIsSessionActive(false);
      showToast('Session stopped', 'info');
    } catch (error) {
      showToast('Failed to stop session: ' + (error as Error).message, 'error');
    }
  };

  const handleAddAgent = async () => {
    if (agents.length >= config.maxAgents) {
      showToast(`Maximum of ${config.maxAgents} agents reached`, 'warning');
      return;
    }

    try {
      await addAgent();
      showToast('New agent added', 'success');
    } catch (error) {
      showToast('Failed to add agent: ' + (error as Error).message, 'error');
    }
  };

  const handleRemoveAgent = async (agentId: string) => {
    try {
      await removeAgent(agentId);
      showToast('Agent removed', 'info');
    } catch (error) {
      showToast('Failed to remove agent: ' + (error as Error).message, 'error');
    }
  };

  const handleAgentCommand = async (agentId: string, command: string) => {
    try {
      await sendCommand(agentId, command);
    } catch (error) {
      showToast('Failed to send command: ' + (error as Error).message, 'error');
    }
  };

  const handleAgentPrompt = async (agentId: string, prompt: string) => {
    try {
      await sendPrompt(agentId, prompt);
      showToast('Prompt sent to agent', 'success');
    } catch (error) {
      showToast('Failed to send prompt: ' + (error as Error).message, 'error');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-4">
              <Terminal className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Multi-Claude Manager
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Orchestrate multiple AI agents for collaborative problem-solving
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Connection Status */}
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="text-sm font-medium text-green-600 dark:text-green-400">
                      Connected
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-5 h-5 text-yellow-500" />
                    <span className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                      Disconnected
                    </span>
                  </>
                )}
              </div>

              {/* Session Controls */}
              {!isSessionActive ? (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleStartSession}
                  disabled={isStarting}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isStarting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Play className="w-5 h-5" />
                  )}
                  <span className="font-medium">
                    {isStarting ? 'Starting...' : 'Start Session'}
                  </span>
                </motion.button>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleStopSession}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  <StopCircle className="w-5 h-5" />
                  <span className="font-medium">Stop Session</span>
                </motion.button>
              )}

              {/* Settings Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                <Settings className="w-6 h-6" />
              </motion.button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Settings Panel */}
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mb-8"
          >
            <AgentControls
              config={config}
              onUpdateConfig={updateConfig}
              onClose={() => setShowSettings(false)}
            />
          </motion.div>
        )}

        {/* Agent Grid */}
        {isSessionActive ? (
          <AgentGrid
            agents={agents}
            onAgentCommand={handleAgentCommand}
            onAgentPrompt={handleAgentPrompt}
            onAddAgent={handleAddAgent}
            onRemoveAgent={handleRemoveAgent}
            maxAgents={config.maxAgents}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="p-6 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/20 dark:to-purple-900/20 rounded-full mb-6">
              <Zap className="w-16 h-16 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Ready to Orchestrate
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 text-center max-w-md mb-8">
              Start a Multi-Claude session to begin running multiple AI agents in parallel for collaborative problem-solving.
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleStartSession}
              disabled={isStarting}
              className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-xl shadow-xl hover:shadow-2xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-lg font-semibold"
            >
              {isStarting ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <Play className="w-6 h-6" />
              )}
              {isStarting ? 'Initializing...' : 'Start Multi-Claude Session'}
            </motion.button>
          </div>
        )}
      </div>
    </div>
  );
};