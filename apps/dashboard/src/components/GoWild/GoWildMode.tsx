import React, { useState, useEffect, useCallback } from 'react';
import { Play, Pause, RotateCcw, Save, Settings, Zap } from 'lucide-react';
import { GoWildSession, GoWildConfig, Discovery } from '@/types/goWild';
import ExplorationGraph from './ExplorationGraph';
import CreativityControls from './CreativityControls';
import { useGoWild } from '@/hooks/useGoWild';

interface GoWildModeProps {
  farmId: string;
  onDiscoverySaved?: (discovery: Discovery) => void;
}

const GoWildMode: React.FC<GoWildModeProps> = ({ farmId, onDiscoverySaved }) => {
  const {
    session,
    isConnected,
    startExploration,
    pauseExploration,
    resumeExploration,
    stopExploration,
    updateConfig,
    saveDiscovery
  } = useGoWild(farmId);

  const [showSettings, setShowSettings] = useState(false);
  const [selectedDiscovery, setSelectedDiscovery] = useState<Discovery | null>(null);

  const handleStart = useCallback(async () => {
    const defaultConfig: GoWildConfig = {
      creativityLevel: 70,
      explorationDepth: 5,
      maxDuration: 30,
      boundaries: {
        allowExternalAPIs: true,
        allowFileSystem: true,
        allowNetworkRequests: true,
        restrictedDomains: []
      },
      focusAreas: []
    };
    await startExploration(defaultConfig);
  }, [startExploration]);

  const handleSaveDiscovery = useCallback(async (discovery: Discovery) => {
    await saveDiscovery(discovery.id);
    onDiscoverySaved?.(discovery);
    setSelectedDiscovery(null);
  }, [saveDiscovery, onDiscoverySaved]);

  const renderStatus = () => {
    if (!session) return 'Ready to explore';
    switch (session.status) {
      case 'exploring':
        return 'Exploring new possibilities...';
      case 'paused':
        return 'Exploration paused';
      case 'completed':
        return 'Exploration completed';
      default:
        return 'Ready to explore';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Go Wild Mode
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {renderStatus()}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* Connection Status */}
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            } animate-pulse`} />
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          
          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Settings className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      </div>

      {/* Creativity Controls */}
      {showSettings && session && (
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
          <CreativityControls
            config={session.config}
            onUpdate={updateConfig}
            disabled={session.status === 'exploring'}
          />
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex items-center justify-center space-x-4">
        {(!session || session.status === 'idle' || session.status === 'completed') && (
          <button
            onClick={handleStart}
            className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all transform hover:scale-105"
          >
            <Play className="w-5 h-5" />
            <span>Start Exploration</span>
          </button>
        )}
        
        {session?.status === 'exploring' && (
          <button
            onClick={pauseExploration}
            className="flex items-center space-x-2 px-6 py-3 bg-yellow-500 text-white rounded-xl hover:bg-yellow-600 transition-all"
          >
            <Pause className="w-5 h-5" />
            <span>Pause</span>
          </button>
        )}
        
        {session?.status === 'paused' && (
          <>
            <button
              onClick={resumeExploration}
              className="flex items-center space-x-2 px-6 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all"
            >
              <Play className="w-5 h-5" />
              <span>Resume</span>
            </button>
            <button
              onClick={stopExploration}
              className="flex items-center space-x-2 px-6 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all"
            >
              <RotateCcw className="w-5 h-5" />
              <span>Stop</span>
            </button>
          </>
        )}
      </div>

      {/* Exploration Visualization */}
      {session && session.explorationPath.nodes.length > 0 && (
        <div className="h-96 bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
          <ExplorationGraph
            path={{ ...session.explorationPath, startTime: session.startTime, currentNodeId: session.explorationPath.currentNodeId || '' }}
            onNodeClick={(node) => {
              const discovery = session.explorationPath.discoveries.find(
                d => d.nodeId === node.id
              );
              if (discovery) {
                setSelectedDiscovery(discovery);
              }
            }}
          />
        </div>
      )}

      {/* Statistics */}
      {session && session.stats.nodesExplored > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Nodes Explored</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {session.stats.nodesExplored}
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Discoveries</p>
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {session.stats.discoveriesMade}
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Backtracks</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {session.stats.backtrackCount}
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Avg Creativity</p>
            <p className="text-2xl font-bold text-pink-600 dark:text-pink-400">
              {Math.round(session.stats.averageCreativity)}%
            </p>
          </div>
        </div>
      )}

      {/* Discoveries List */}
      {session && session.explorationPath.discoveries.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Discoveries ({session.explorationPath.discoveries.length})
          </h3>
          <div className="space-y-2">
            {session.explorationPath.discoveries.map((discovery) => (
              <div
                key={discovery.id}
                className={`p-4 rounded-xl cursor-pointer transition-all ${
                  discovery.saved
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                    : 'bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                onClick={() => setSelectedDiscovery(discovery)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      {discovery.title}
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {discovery.description}
                    </p>
                    <div className="flex items-center space-x-4 mt-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        discovery.impact === 'high'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                          : discovery.impact === 'medium'
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {discovery.impact} impact
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {discovery.category}
                      </span>
                    </div>
                  </div>
                  {!discovery.saved && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSaveDiscovery(discovery);
                      }}
                      className="ml-4 p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <Save className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Discovery Modal */}
      {selectedDiscovery && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-lg w-full">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              {selectedDiscovery.title}
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              {selectedDiscovery.description}
            </p>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className={`text-sm px-3 py-1 rounded-full ${
                  selectedDiscovery.impact === 'high'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                    : selectedDiscovery.impact === 'medium'
                    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                }`}>
                  {selectedDiscovery.impact} impact
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {selectedDiscovery.category}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                {!selectedDiscovery.saved && (
                  <button
                    onClick={() => handleSaveDiscovery(selectedDiscovery)}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                  >
                    Save Discovery
                  </button>
                )}
                <button
                  onClick={() => setSelectedDiscovery(null)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoWildMode;