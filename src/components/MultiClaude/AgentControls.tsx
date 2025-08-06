import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  X, 
  Save, 
  Settings2, 
  Users, 
  Clock, 
  FolderOpen,
  ToggleLeft,
  ToggleRight,
  AlertCircle
} from 'lucide-react';
import { MultiClaudeConfig } from '../../types/multiClaude';

interface AgentControlsProps {
  config: MultiClaudeConfig;
  onUpdateConfig: (config: Partial<MultiClaudeConfig>) => void;
  onClose: () => void;
}

export const AgentControls: React.FC<AgentControlsProps> = ({
  config,
  onUpdateConfig,
  onClose
}) => {
  const [localConfig, setLocalConfig] = useState(config);
  const [hasChanges, setHasChanges] = useState(false);

  const handleChange = (key: keyof MultiClaudeConfig, value: any) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    onUpdateConfig(localConfig);
    setHasChanges(false);
    onClose();
  };

  const handleReset = () => {
    setLocalConfig(config);
    setHasChanges(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <Settings2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Multi-Claude Settings
          </h2>
        </div>
        
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Max Agents */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Users className="w-4 h-4" />
            Maximum Agents
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="1"
              max="12"
              value={localConfig.maxAgents}
              onChange={(e) => handleChange('maxAgents', parseInt(e.target.value))}
              className="flex-1"
            />
            <span className="w-12 text-center font-mono text-lg font-semibold text-gray-900 dark:text-gray-100">
              {localConfig.maxAgents}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Maximum number of concurrent agents that can run
          </p>
        </div>

        {/* Stagger Delay */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Clock className="w-4 h-4" />
            Stagger Delay (seconds)
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={localConfig.staggerDelay}
              onChange={(e) => handleChange('staggerDelay', parseFloat(e.target.value))}
              className="flex-1"
            />
            <span className="w-12 text-center font-mono text-lg font-semibold text-gray-900 dark:text-gray-100">
              {localConfig.staggerDelay}s
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Delay between starting each agent to prevent overload
          </p>
        </div>

        {/* Session Name */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <FolderOpen className="w-4 h-4" />
            Session Name
          </label>
          <input
            type="text"
            value={localConfig.sessionName}
            onChange={(e) => handleChange('sessionName', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="claude_agents"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Tmux session name for agent management
          </p>
        </div>

        {/* Coordination Directory */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <FolderOpen className="w-4 h-4" />
            Coordination Directory
          </label>
          <input
            type="text"
            value={localConfig.coordintionDir}
            onChange={(e) => handleChange('coordintionDir', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            placeholder="/tmp/claude_coordination"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Directory for agent coordination files
          </p>
        </div>

        {/* Toggle Options */}
        <div className="space-y-4">
          {/* Enable Logging */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Enable Logging
              </span>
              <AlertCircle className="w-3 h-3 text-gray-400" />
            </div>
            <button
              onClick={() => handleChange('enableLogging', !localConfig.enableLogging)}
              className="relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              style={{
                backgroundColor: localConfig.enableLogging ? '#3B82F6' : '#9CA3AF'
              }}
            >
              <span
                className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
                  localConfig.enableLogging ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Auto Restart */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Auto Restart Failed Agents
              </span>
              <AlertCircle className="w-3 h-3 text-gray-400" />
            </div>
            <button
              onClick={() => handleChange('autoRestart', !localConfig.autoRestart)}
              className="relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              style={{
                backgroundColor: localConfig.autoRestart ? '#3B82F6' : '#9CA3AF'
              }}
            >
              <span
                className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
                  localConfig.autoRestart ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl">
        <div>
          {hasChanges && (
            <span className="text-sm text-amber-600 dark:text-amber-400">
              You have unsaved changes
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleReset}
            disabled={!hasChanges}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Reset
          </button>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSave}
            disabled={!hasChanges}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
          >
            <Save className="w-4 h-4" />
            <span className="font-medium">Save Changes</span>
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
};