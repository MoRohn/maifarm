import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircleIcon, 
  XCircleIcon, 
  CogIcon, 
  KeyIcon, 
  TrashIcon, 
  EyeIcon, 
  EyeSlashIcon, 
  ClipboardDocumentIcon, 
  CheckIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  SparklesIcon,
  CloudIcon,
  ServerStackIcon,
  ComputerDesktopIcon
} from '@heroicons/react/24/outline';
import { ClaudeSetupWizard } from './ClaudeSetupWizard';
import { OpenAISetupWizard } from './OpenAISetupWizard';
import { useToast } from '@/hooks/useToast';
import { useUserStore } from '@/store/userStore';

interface AIEngineConfig {
  id: string;
  name: string;
  icon: string;
  description: string;
  status: 'not-configured' | 'configured' | 'error';
  apiType: 'cloud' | 'local' | 'hybrid';
  features: string[];
  setupTime: string;
  costModel: string;
  apiKey?: string;
  lastConfigured?: Date;
}

const AI_ENGINES: AIEngineConfig[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    icon: '🧠',
    description: 'Anthropic\'s powerful AI for collaborative development',
    status: 'not-configured',
    apiType: 'cloud',
    features: ['200K token context', 'Advanced reasoning', 'Multi-agent support'],
    setupTime: '2 minutes',
    costModel: 'Pay per use'
  },
  {
    id: 'openai',
    name: 'OpenAI GPT-4',
    icon: '🧠',
    description: 'GPT-4 models with vision and function calling',
    status: 'not-configured',
    apiType: 'cloud',
    features: ['128K context', 'Vision capabilities', 'JSON mode'],
    setupTime: '3 minutes',
    costModel: 'Pay per use'
  }
];

export const AIEngineSetupHubSimple: React.FC = () => {
  const [engines, setEngines] = useState<AIEngineConfig[]>(AI_ENGINES);
  const [activeWizard, setActiveWizard] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState<{ [key: string]: boolean }>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { success: showSuccess, error: showError } = useToast();

  // Load saved configurations on mount
  useEffect(() => {
    loadSavedConfigurations();
  }, []);

  const loadSavedConfigurations = async () => {
    const savedEngines = localStorage.getItem('maifarm_ai_engines');
    
    if (savedEngines) {
      try {
        const parsed = JSON.parse(savedEngines);
        setEngines(parsed);
      } catch (error) {
        console.error('Error loading saved engines:', error);
      }
    }

    // Check server status for each engine
    await checkEngineStatuses();
  };

  const checkEngineStatuses = async () => {
    // Check Claude status
    try {
      const claudeResponse = await fetch('/api/apikeys/claude/status');
      if (claudeResponse.ok) {
        const data = await claudeResponse.json();
        updateEngineStatus('claude', data.configured ? 'configured' : 'not-configured');
      }
    } catch (error) {
      console.error('Error checking Claude status:', error);
    }

    // Check OpenAI status
    try {
      const openaiResponse = await fetch('/api/openai/status');
      if (openaiResponse.ok) {
        const data = await openaiResponse.json();
        updateEngineStatus('openai', data.configured ? 'configured' : 'not-configured');
      }
    } catch (error) {
      console.error('Error checking OpenAI status:', error);
    }
  };

  const updateEngineStatus = (engineId: string, status: 'not-configured' | 'configured' | 'error') => {
    setEngines(prev => {
      const updated = prev.map(engine => 
        engine.id === engineId ? { ...engine, status } : engine
      );
      localStorage.setItem('maifarm_ai_engines', JSON.stringify(updated));
      return updated;
    });
  };

  const handleEngineSetupComplete = async (engineId: string, apiKey?: string) => {
    const engine = engines.find(e => e.id === engineId);
    if (!engine) return;

    const updatedEngines = engines.map(e => 
      e.id === engineId 
        ? { ...e, status: 'configured' as const, apiKey, lastConfigured: new Date() }
        : e
    );
    setEngines(updatedEngines);
    localStorage.setItem('maifarm_ai_engines', JSON.stringify(updatedEngines));

    setActiveWizard(null);
    showSuccess(`✅ ${engine.name} configured successfully`);
  };

  const handleDeleteApiKey = (engineId: string) => {
    updateEngineStatus(engineId, 'not-configured');
    showSuccess('API key removed');
  };

  const toggleShowKey = (id: string) => {
    setShowKeys({ ...showKeys, [id]: !showKeys[id] });
  };

  const copyToClipboard = async (key: string, id: string) => {
    await navigator.clipboard.writeText(key);
    setCopiedKey(id);
    showSuccess('API key copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const maskApiKey = (key: string) => {
    if (!key || key.length < 11) return key;
    return `${key.substring(0, 7)}${'•'.repeat(Math.min(key.length - 11, 30))}${key.substring(key.length - 4)}`;
  };

  const getApiTypeBadge = (apiType: string) => {
    const types = {
      cloud: { icon: CloudIcon, text: 'Cloud', color: 'blue' },
      local: { icon: ComputerDesktopIcon, text: 'Local', color: 'purple' },
      hybrid: { icon: ServerStackIcon, text: 'Hybrid', color: 'amber' }
    };

    const type = types[apiType as keyof typeof types];
    const Icon = type.icon;
    
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full 
        bg-${type.color}-100 dark:bg-${type.color}-900/30 text-${type.color}-700 dark:text-${type.color}-400`}>
        <Icon className="w-3 h-3" />
        {type.text}
      </span>
    );
  };

  const configuredCount = engines.filter(e => e.status === 'configured').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              AI Engine Setup
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Choose one AI engine to power your MaiFarm agents
            </p>
          </div>
          {configuredCount > 0 && (
            <div className="flex items-center px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg">
              <CheckCircleIcon className="w-4 h-4 mr-1.5" />
              <span className="text-sm font-medium">{configuredCount} configured</span>
            </div>
          )}
        </div>
      </div>

      {/* Engine Cards Grid - Responsive */}
      <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
          {engines.map((engine, index) => (
            <motion.div
              key={engine.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`relative rounded-lg border transition-all h-full flex flex-col ${
                engine.status === 'configured' 
                  ? 'bg-green-50 dark:bg-green-900/10 border-green-500 dark:border-green-600' 
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="p-4 flex flex-col h-full">
                {/* Header */}
                <div className="mb-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="text-xl">{engine.icon}</div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {engine.name}
                      </h3>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {getApiTypeBadge(engine.apiType)}
                      {engine.status === 'configured' && (
                        <CheckCircleIcon className="w-5 h-5 text-green-500" />
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {engine.description}
                  </p>
                </div>

                {/* Features */}
                <div className="mb-3 flex-grow">
                  <div className="flex flex-wrap gap-1.5">
                    {engine.features.map((feature, i) => (
                      <span key={i} className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Setup Info */}
                <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-3">
                  <span>⏱ {engine.setupTime}</span>
                  <span>💰 {engine.costModel}</span>
                </div>

                {/* API Key Management */}
                <div className="mt-auto">
                  {engine.status === 'configured' && engine.apiKey ? (
                    <div className="space-y-2">
                      <div className="flex items-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <KeyIcon className="w-3 h-3 text-gray-500 flex-shrink-0" />
                            <code className="text-xs font-mono truncate">
                              {showKeys[engine.id] ? engine.apiKey : maskApiKey(engine.apiKey)}
                            </code>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 ml-2">
                          <button
                            onClick={() => toggleShowKey(engine.id)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                            title={showKeys[engine.id] ? "Hide" : "Show"}
                          >
                            {showKeys[engine.id] ? (
                              <EyeSlashIcon className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                            ) : (
                              <EyeIcon className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                            )}
                          </button>
                          <button
                            onClick={() => copyToClipboard(engine.apiKey!, engine.id)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                            title="Copy"
                          >
                            {copiedKey === engine.id ? (
                              <CheckIcon className="w-3 h-3 text-green-500" />
                            ) : (
                              <ClipboardDocumentIcon className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteApiKey(engine.id)}
                            className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                            title="Delete"
                          >
                            <TrashIcon className="w-3 h-3 text-red-500" />
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => setActiveWizard(engine.id)}
                        className="w-full px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 
                          bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 
                          rounded transition-colors"
                      >
                        Reconfigure
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setActiveWizard(engine.id)}
                      className="w-full px-3 py-2 text-sm font-medium text-white 
                        bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 
                        rounded transition-colors"
                    >
                      Setup {engine.name}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
      </div>

      {/* Wizards */}
      <AnimatePresence>
        {activeWizard === 'claude' && (
          <ClaudeSetupWizard
            isOpen={true}
            onClose={() => setActiveWizard(null)}
            onComplete={(apiKey) => handleEngineSetupComplete('claude', apiKey)}
          />
        )}
        {activeWizard === 'openai' && (
          <OpenAISetupWizard
            isOpen={true}
            onClose={() => setActiveWizard(null)}
            onComplete={(apiKey, model) => handleEngineSetupComplete('openai', apiKey)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};