import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Terminal, Users, Code, AlertCircle, CheckCircle, RefreshCw, Copy } from 'lucide-react';
import { Farm } from '@/types';
import { claudeCodeService, ClaudeCodeFarmStatus } from '@/services/claudeCodeService';
import toast from 'react-hot-toast';

interface ClaudeCodeIntegrationProps {
  farm: Farm;
  onClose?: () => void;
}

export function ClaudeCodeIntegration({ farm, onClose }: ClaudeCodeIntegrationProps) {
  const [prompt, setPrompt] = useState('');
  const [steps, setSteps] = useState<string[]>(['']);
  const [collaborative, setCollaborative] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<ClaudeCodeFarmStatus | null>(null);
  const [sessionName, setSessionName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if farm already has Claude Code integration
    checkExistingStatus();
  }, [farm.id]);

  const checkExistingStatus = async () => {
    try {
      const farmStatus = await claudeCodeService.getClaudeCodeFarmStatus(farm.id);
      if (farmStatus.farm) {
        setStatus(farmStatus);
        setSessionName(farmStatus.tmuxInfo?.sessionName || '');
      }
    } catch (error) {
      // No existing Claude Code farm
    }
  };

  const handleCreateClaudeCodeFarm = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await claudeCodeService.startFarmWithClaudeCode(farm, {
        prompt: prompt || farm.config.yaml || 'Help with development tasks',
        steps: steps.filter(s => s.trim()),
        collaborative
      });

      setSessionName(result.sessionName);
      toast.success('Claude Code farm created successfully!');
      
      // Refresh status
      await checkExistingStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to create Claude Code farm');
      toast.error(err.message || 'Failed to create Claude Code farm');
    } finally {
      setLoading(false);
    }
  };

  const handleAddStep = () => {
    setSteps([...steps, '']);
  };

  const handleUpdateStep = (index: number, value: string) => {
    const newSteps = [...steps];
    newSteps[index] = value;
    setSteps(newSteps);
  };

  const handleRemoveStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const copyTmuxCommand = () => {
    const command = claudeCodeService.getTmuxAttachCommand(sessionName);
    navigator.clipboard.writeText(command);
    toast.success('Command copied to clipboard!');
  };

  const renderCoordinationStatus = () => {
    if (!status?.coordination) return null;

    const parsed = claudeCodeService.parseCoordinationData(status.coordination);
    if (!parsed) return null;

    return (
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
        <h4 className="font-medium text-gray-900 dark:text-white">Coordination Status</h4>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-gray-500 dark:text-gray-400">Active Agents</div>
            <div className="text-2xl font-semibold">{parsed.activeAgentCount}</div>
          </div>
          <div>
            <div className="text-gray-500 dark:text-gray-400">Work Claims</div>
            <div className="text-2xl font-semibold">{parsed.totalWorkClaims}</div>
          </div>
          <div>
            <div className="text-gray-500 dark:text-gray-400">Completed Tasks</div>
            <div className="text-2xl font-semibold">{parsed.totalCompleted}</div>
          </div>
        </div>
      </div>
    );
  };

  if (status?.farm) {
    // Show existing Claude Code farm status
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Claude Code Farm Status</h3>
          <button
            onClick={checkExistingStatus}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <CheckCircle className="h-5 w-5 text-emerald-500" />
            <span className="font-medium text-emerald-900 dark:text-emerald-100">
              Claude Code Farm Active
            </span>
          </div>
          <div className="text-sm text-emerald-700 dark:text-emerald-300">
            Session: {sessionName}
          </div>
        </div>

        {sessionName && (
          <div className="bg-gray-900 text-gray-100 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Attach to tmux session:</span>
              <button
                onClick={copyTmuxCommand}
                className="p-1 rounded hover:bg-gray-800"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <code className="text-xs font-mono text-emerald-400">
              {claudeCodeService.getTmuxAttachCommand(sessionName)}
            </code>
          </div>
        )}

        <div className="space-y-4">
          <h4 className="font-medium">Agents ({status.agents.length})</h4>
          {status.agents.map((agent) => (
            <div key={agent.id} className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full ${
                    agent.status === 'ready' ? 'bg-green-500' :
                    agent.status === 'working' ? 'bg-blue-500' :
                    agent.status === 'error' ? 'bg-red-500' :
                    'bg-gray-500'
                  }`} />
                  <span className="font-medium text-sm">{agent.id}</span>
                </div>
                <span className="text-sm text-gray-500">{agent.status}</span>
              </div>
              {agent.currentTask && (
                <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                  Task: {agent.currentTask}
                </div>
              )}
            </div>
          ))}
        </div>

        {renderCoordinationStatus()}

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Show creation form
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Create Claude Code Agent Farm</h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Initial Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            rows={3}
            placeholder={farm.config.yaml || "What should the agents work on?"}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Steps (Optional)
          </label>
          {steps.map((step, index) => (
            <div key={index} className="flex items-center space-x-2 mb-2">
              <input
                type="text"
                value={step}
                onChange={(e) => handleUpdateStep(index, e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder={`Step ${index + 1}`}
              />
              {steps.length > 1 && (
                <button
                  onClick={() => handleRemoveStep(index)}
                  className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            onClick={handleAddStep}
            className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
          >
            + Add Step
          </button>
        </div>

        <div className="flex items-center space-x-3">
          <input
            type="checkbox"
            id="collaborative"
            checked={collaborative}
            onChange={(e) => setCollaborative(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          />
          <label htmlFor="collaborative" className="text-sm text-gray-700 dark:text-gray-300">
            Enable collaborative mode (all agents see all steps)
          </label>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start space-x-2">
            <Terminal className="h-5 w-5 text-blue-500 mt-0.5" />
            <div className="text-sm text-blue-700 dark:text-blue-300">
              <p className="font-medium mb-1">This will create {farm.config.maxAgents || 3} Claude Code agents</p>
              <p>The agents will run in a tmux session that you can monitor in your terminal.</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end space-x-3">
        <button
          onClick={onClose}
          className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
        >
          Cancel
        </button>
        <button
          onClick={handleCreateClaudeCodeFarm}
          disabled={loading}
          className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
        >
          {loading ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Creating...</span>
            </>
          ) : (
            <>
              <Terminal className="h-4 w-4" />
              <span>Create Claude Code Farm</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}