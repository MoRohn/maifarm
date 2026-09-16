/**
 * Enhanced AI Engine Manager
 *
 * Advanced AI engine configuration with:
 * - Live model version display
 * - Easy engine switching
 * - Status monitoring
 * - GPT-OSS as default
 * - API key management
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Zap,
  Cpu,
  GitBranch,
  Settings,
  Check,
  X,
  AlertCircle,
  Key,
  Globe,
  Server,
  Activity,
  ChevronRight,
  Download,
  RefreshCw,
  Sparkles,
  Shield,
  Info
} from 'lucide-react';
import { useSettingsStore } from '@/store/settingsStore';
import { apiClient } from '@/services/apiClient';
import { cn } from '@/utils/cn';

// ============================================================================
// Types
// ============================================================================

interface AIEngine {
  provider: string;
  displayName: string;
  enabled: boolean;
  configured: boolean;
  model: string;
  version?: string;
  contextWindow: number;
  maxTokens: number;
  isDefault: boolean;
  isLocal: boolean;
  status: 'online' | 'offline' | 'checking' | 'error';
  apiKey?: string;
  endpoint?: string;
  temperature?: number;
  description: string;
  features: string[];
  requirements?: string[];
}

interface EngineStats {
  totalAgents: number;
  activeAgents: number;
  providers: Record<string, number>;
  uptime?: number;
  requestsProcessed?: number;
}

// ============================================================================
// Engine Cards Data
// ============================================================================

const ENGINE_DATA = {
  'gpt-oss': {
    displayName: 'GPT-OSS',
    icon: <Cpu className="w-6 h-6" />,
    color: 'blue',
    description: 'Local open-source LLM with privacy-first design. No API keys required.',
    features: [
      'Completely free & local',
      'No API keys needed',
      'Privacy-focused',
      'Customizable models',
      'Meta Llama 3.1 8B',
      '131K context window'
    ],
    requirements: [
      'Python 3.8+',
      '8GB RAM minimum',
      'GPU recommended for speed'
    ]
  },
  claude: {
    displayName: 'Claude',
    icon: <Zap className="w-6 h-6" />,
    color: 'purple',
    description: 'Anthropic\'s advanced AI with excellent coding capabilities.',
    features: [
      'Claude 3 Sonnet',
      '200K context window',
      'Superior reasoning',
      'Code generation expert',
      'Multi-turn conversations',
      'Constitutional AI'
    ],
    requirements: [
      'Anthropic API key',
      'Internet connection',
      'Usage-based billing'
    ]
  },
  openai: {
    displayName: 'OpenAI',
    icon: <Brain className="w-6 h-6" />,
    color: 'green',
    description: 'GPT-4 Turbo with cutting-edge capabilities.',
    features: [
      'GPT-4 Turbo',
      '128K context window',
      'Industry standard',
      'Vision capabilities',
      'Function calling',
      'JSON mode'
    ],
    requirements: [
      'OpenAI API key',
      'Internet connection',
      'Usage-based billing'
    ]
  },
  llama: {
    displayName: 'Llama',
    icon: <GitBranch className="w-6 h-6" />,
    color: 'orange',
    description: 'Alibaba\'s coding-focused model with strong performance.',
    features: [
      'Llama 2.5 Coder',
      '131K context window',
      'Code-optimized',
      'Multilingual support',
      'Local deployment',
      'Ollama integration'
    ],
    requirements: [
      'Ollama installed',
      '8GB RAM minimum',
      'Model download (~4GB)'
    ]
  }
};

// ============================================================================
// Engine Card Component
// ============================================================================

const EngineCard: React.FC<{
  engine: AIEngine;
  onSelect: () => void;
  onConfigure: () => void;
  isSelected: boolean;
}> = ({ engine, onSelect, onConfigure, isSelected }) => {
  const data = ENGINE_DATA[engine.provider];
  if (!data) return null;

  const colorStyles = {
    blue: {
      bg: 'bg-gradient-to-br from-blue-500/10 to-indigo-500/10',
      border: 'border-blue-500/30 hover:border-blue-500/50',
      icon: 'text-blue-400',
      badge: 'bg-blue-500/20 text-blue-300',
      button: 'bg-blue-500 hover:bg-blue-600'
    },
    purple: {
      bg: 'bg-gradient-to-br from-purple-500/10 to-pink-500/10',
      border: 'border-purple-500/30 hover:border-purple-500/50',
      icon: 'text-purple-400',
      badge: 'bg-purple-500/20 text-purple-300',
      button: 'bg-purple-500 hover:bg-purple-600'
    },
    green: {
      bg: 'bg-gradient-to-br from-green-500/10 to-emerald-500/10',
      border: 'border-green-500/30 hover:border-green-500/50',
      icon: 'text-green-400',
      badge: 'bg-green-500/20 text-green-300',
      button: 'bg-green-500 hover:bg-green-600'
    },
    orange: {
      bg: 'bg-gradient-to-br from-orange-500/10 to-amber-500/10',
      border: 'border-orange-500/30 hover:border-orange-500/50',
      icon: 'text-orange-400',
      badge: 'bg-orange-500/20 text-orange-300',
      button: 'bg-orange-500 hover:bg-orange-600'
    }
  };

  const style = colorStyles[data.color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'relative p-6 rounded-xl border-2 transition-all',
        style.bg,
        style.border,
        isSelected && 'ring-2 ring-offset-2 ring-offset-gray-900',
        isSelected && `ring-${data.color}-500`
      )}
    >
      {/* Default Badge */}
      {engine.isDefault && (
        <div className="absolute -top-3 -right-3">
          <div className="flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-yellow-500 to-orange-500
                          text-white text-xs font-bold rounded-full shadow-lg">
            <Sparkles className="w-3 h-3" />
            <span>DEFAULT</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg', style.badge)}>
            {data.icon}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{data.displayName}</h3>
            <div className="flex items-center gap-2 mt-1">
              {/* Status */}
              <div className="flex items-center gap-1">
                {engine.status === 'online' ? (
                  <>
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <span className="text-xs text-green-400">Online</span>
                  </>
                ) : engine.status === 'checking' ? (
                  <>
                    <RefreshCw className="w-3 h-3 text-yellow-400 animate-spin" />
                    <span className="text-xs text-yellow-400">Checking...</span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 bg-gray-400 rounded-full" />
                    <span className="text-xs text-gray-400">Offline</span>
                  </>
                )}
              </div>

              {/* Local Badge */}
              {engine.isLocal && (
                <div className="flex items-center gap-1 px-2 py-0.5 bg-green-500/20 text-green-300
                                text-xs rounded-full border border-green-500/30">
                  <Shield className="w-3 h-3" />
                  <span>Local</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Configuration Status */}
        <div className="flex items-center gap-2">
          {engine.configured ? (
            <Check className="w-5 h-5 text-green-400" />
          ) : (
            <AlertCircle className="w-5 h-5 text-yellow-400" />
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-400 mb-4">{data.description}</p>

      {/* Model Info */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Model:</span>
          <span className="text-gray-300 font-mono">{engine.model.split('/').pop()}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Context:</span>
          <span className="text-gray-300">{(engine.contextWindow / 1000).toFixed(0)}K tokens</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Max Output:</span>
          <span className="text-gray-300">{engine.maxTokens.toLocaleString()} tokens</span>
        </div>
      </div>

      {/* Features */}
      <div className="mb-4">
        <div className="text-xs text-gray-500 mb-2">Features:</div>
        <div className="flex flex-wrap gap-1">
          {data.features.slice(0, 3).map((feature, i) => (
            <span key={i} className={cn('text-xs px-2 py-0.5 rounded', style.badge)}>
              {feature}
            </span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {engine.configured ? (
          <button
            onClick={onSelect}
            disabled={engine.isDefault}
            className={cn(
              'flex-1 py-2 px-4 rounded-lg font-medium text-white transition-colors',
              engine.isDefault
                ? 'bg-gray-700 cursor-not-allowed opacity-50'
                : style.button
            )}
          >
            {engine.isDefault ? 'Active' : 'Set as Default'}
          </button>
        ) : (
          <button
            onClick={onConfigure}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-4
                       bg-gray-700 hover:bg-gray-600 text-white rounded-lg
                       font-medium transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span>Configure</span>
          </button>
        )}
      </div>
    </motion.div>
  );
};

// ============================================================================
// Configuration Modal
// ============================================================================

const ConfigurationModal: React.FC<{
  engine: AIEngine;
  onClose: () => void;
  onSave: (config: any) => void;
}> = ({ engine, onClose, onSave }) => {
  const [apiKey, setApiKey] = useState(engine.apiKey || '');
  const [endpoint, setEndpoint] = useState(engine.endpoint || '');
  const [temperature, setTemperature] = useState(engine.temperature || 0.7);

  const handleSave = () => {
    onSave({
      provider: engine.provider,
      apiKey,
      endpoint,
      temperature
    });
  };

  const data = ENGINE_DATA[engine.provider];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-gray-900 rounded-xl p-6 max-w-md w-full border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold mb-4 text-white">
          Configure {data?.displayName}
        </h2>

        {/* Requirements */}
        {data?.requirements && (
          <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-yellow-400 mt-0.5" />
              <div className="text-sm">
                <div className="text-yellow-400 font-medium mb-1">Requirements:</div>
                <ul className="text-yellow-300/80 space-y-0.5">
                  {data.requirements.map((req, i) => (
                    <li key={i}>• {req}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Configuration Fields */}
        <div className="space-y-4">
          {!engine.isLocal && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  API Key
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={`Enter ${engine.provider} API key`}
                    className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700
                             rounded-lg text-white placeholder-gray-500 focus:border-blue-500
                             focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  API Endpoint (Optional)
                </label>
                <div className="relative">
                  <Globe className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
                  <input
                    type="url"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    placeholder="Default endpoint will be used"
                    className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700
                             rounded-lg text-white placeholder-gray-500 focus:border-blue-500
                             focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Temperature: {temperature.toFixed(1)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Precise</span>
              <span>Creative</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600
                       text-white rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!engine.isLocal && !apiKey}
            className="flex-1 py-2 px-4 bg-blue-500 hover:bg-blue-600
                       text-white rounded-lg font-medium transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Configuration
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ============================================================================
// Enhanced AI Engine Manager Component
// ============================================================================

export const EnhancedAIEngineManager: React.FC = () => {
  const [engines, setEngines] = useState<AIEngine[]>([]);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [configuringEngine, setConfiguringEngine] = useState<AIEngine | null>(null);
  const { settings, updateSettings } = useSettingsStore();

  // Fetch engine data
  const fetchEngines = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/ai-engines/status');

      // Transform response to engine objects
      const engineList = response.data.engines || [];
      const formattedEngines: AIEngine[] = engineList.map((e: any) => ({
        provider: e.provider,
        displayName: ENGINE_DATA[e.provider]?.displayName || e.provider,
        enabled: e.enabled,
        configured: e.configured,
        model: e.model,
        version: e.version,
        contextWindow: e.contextWindow,
        maxTokens: e.maxTokens,
        isDefault: e.isDefault,
        isLocal: e.isLocal,
        status: e.status || 'offline',
        apiKey: e.apiKey,
        endpoint: e.endpoint,
        temperature: e.temperature,
        description: ENGINE_DATA[e.provider]?.description || '',
        features: ENGINE_DATA[e.provider]?.features || [],
        requirements: ENGINE_DATA[e.provider]?.requirements
      }));

      // Ensure GPT-OSS is always first and default if no other default
      const hasDefault = formattedEngines.some(e => e.isDefault);
      if (!hasDefault) {
        const gptOss = formattedEngines.find(e => e.provider === 'gpt-oss');
        if (gptOss) {
          gptOss.isDefault = true;
        }
      }

      // Sort: default first, then GPT-OSS, then others
      formattedEngines.sort((a, b) => {
        if (a.isDefault) return -1;
        if (b.isDefault) return 1;
        if (a.provider === 'gpt-oss') return -1;
        if (b.provider === 'gpt-oss') return 1;
        return 0;
      });

      setEngines(formattedEngines);
      setStats(response.data.stats);
    } catch (error) {
      console.error('Failed to fetch engines:', error);

      // Fallback data
      setEngines([
        {
          provider: 'gpt-oss',
          displayName: 'GPT-OSS',
          enabled: true,
          configured: true,
          model: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
          contextWindow: 131072,
          maxTokens: 8192,
          isDefault: true,
          isLocal: true,
          status: 'online',
          temperature: 0.6,
          description: ENGINE_DATA['gpt-oss'].description,
          features: ENGINE_DATA['gpt-oss'].features
        },
        {
          provider: 'claude',
          displayName: 'Claude',
          enabled: false,
          configured: false,
          model: 'claude-3-sonnet-20240229',
          contextWindow: 200000,
          maxTokens: 4096,
          isDefault: false,
          isLocal: false,
          status: 'offline',
          temperature: 0.7,
          description: ENGINE_DATA.claude.description,
          features: ENGINE_DATA.claude.features
        },
        {
          provider: 'openai',
          displayName: 'OpenAI',
          enabled: false,
          configured: false,
          model: 'gpt-4-turbo-preview',
          contextWindow: 128000,
          maxTokens: 8192,
          isDefault: false,
          isLocal: false,
          status: 'offline',
          temperature: 0.7,
          description: ENGINE_DATA.openai.description,
          features: ENGINE_DATA.openai.features
        },
        {
          provider: 'llama',
          displayName: 'Llama',
          enabled: true,
          configured: true,
          model: 'llama2.5-coder:7b',
          contextWindow: 131072,
          maxTokens: 8192,
          isDefault: false,
          isLocal: true,
          status: 'offline',
          temperature: 0.5,
          description: ENGINE_DATA.llama.description,
          features: ENGINE_DATA.llama.features
        }
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Set engine as default
  const setDefaultEngine = async (provider: string) => {
    try {
      await apiClient.post('/api/ai-engines/default', { provider });
      await fetchEngines();
    } catch (error) {
      console.error('Failed to set default engine:', error);
    }
  };

  // Save engine configuration
  const saveEngineConfig = async (config: any) => {
    try {
      await apiClient.post('/api/ai-engines/configure', config);
      setConfiguringEngine(null);
      await fetchEngines();
    } catch (error) {
      console.error('Failed to save engine configuration:', error);
    }
  };

  // Initialize GPT-OSS if needed
  const initializeGptOss = async () => {
    try {
      await apiClient.post('/api/ai-engines/gpt-oss/initialize');
      await fetchEngines();
    } catch (error) {
      console.error('Failed to initialize GPT-OSS:', error);
    }
  };

  // Fetch on mount
  useEffect(() => {
    fetchEngines();
  }, [fetchEngines]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">AI Engine Manager</h2>
          <p className="text-gray-400 mt-1">
            Configure and manage AI providers. GPT-OSS is pre-configured as the default.
          </p>
        </div>
        <button
          onClick={fetchEngines}
          className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
        >
          <RefreshCw className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="flex items-center gap-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-green-400" />
            <span className="text-sm text-gray-300">
              Active: <span className="text-white font-medium">{stats.activeAgents}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-gray-300">
              Total: <span className="text-white font-medium">{stats.totalAgents}</span>
            </span>
          </div>
          {Object.entries(stats.providers).map(([provider, count]) => (
            <div key={provider} className="flex items-center gap-2">
              <span className="text-sm text-gray-300">
                {provider}: <span className="text-white font-medium">{count}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Engine Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {engines.map((engine) => (
          <EngineCard
            key={engine.provider}
            engine={engine}
            isSelected={engine.isDefault}
            onSelect={() => setDefaultEngine(engine.provider)}
            onConfigure={() => setConfiguringEngine(engine)}
          />
        ))}
      </div>

      {/* Quick Setup for GPT-OSS */}
      <div className="p-6 bg-gradient-to-r from-blue-500/10 to-purple-500/10
                      border border-blue-500/30 rounded-xl">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-500/20 rounded-lg">
            <Sparkles className="w-6 h-6 text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-2">
              Quick Start with GPT-OSS
            </h3>
            <p className="text-sm text-gray-300 mb-4">
              GPT-OSS is pre-configured and ready to use. No API keys or complex setup required.
              Just click the button below to ensure the server is running.
            </p>
            <button
              onClick={initializeGptOss}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600
                         text-white rounded-lg font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Initialize GPT-OSS Server</span>
            </button>
          </div>
        </div>
      </div>

      {/* Configuration Modal */}
      <AnimatePresence>
        {configuringEngine && (
          <ConfigurationModal
            engine={configuringEngine}
            onClose={() => setConfiguringEngine(null)}
            onSave={saveEngineConfig}
          />
        )}
      </AnimatePresence>
    </div>
  );
};