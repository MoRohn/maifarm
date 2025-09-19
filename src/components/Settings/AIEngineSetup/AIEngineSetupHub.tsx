import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircleIcon, 
  XCircleIcon, 
  CogIcon, 
  KeyIcon, 
  PlusIcon, 
  TrashIcon, 
  EyeIcon, 
  EyeSlashIcon, 
  ClipboardDocumentIcon, 
  CheckIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  SparklesIcon,
  ShieldCheckIcon,
  CloudIcon,
  ServerStackIcon,
  ComputerDesktopIcon
} from '@heroicons/react/24/outline';
import { ClaudeSetupWizard } from './ClaudeSetupWizard';
import { OpenAISetupWizard } from './OpenAISetupWizard';
import { QwenLocalSetupWizard } from './QwenLocalSetupWizard';
import { GptOssSetupWizard } from './GptOssSetupWizard';
import { useToast } from '@/hooks/useToast';
import { useUserStore } from '@/store/userStore';
import { Tooltip } from '../../common/Tooltip';

interface AIEngineConfig {
  id: string;
  name: string;
  icon: string;
  description: string;
  farmMetaphor: string;
  status: 'not-configured' | 'configured' | 'error';
  apiType: 'cloud' | 'local' | 'hybrid';
  features: string[];
  setupTime: string;
  costModel: string;
  apiKey?: string;
  lastConfigured?: Date;
}

interface ApiKey {
  id: string;
  name: string;
  key: string;
  service: string;
  permissions: string[];
  createdAt: Date;
  lastUsed?: Date;
}

const AI_ENGINES: AIEngineConfig[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    icon: '🧠',
    description: 'Anthropic\'s powerful AI for collaborative development',
    farmMetaphor: 'Your trusty farmhand that never gets tired',
    status: 'not-configured',
    apiType: 'cloud',
    features: [
      '200K token context',
      'Advanced reasoning',
      'Multi-agent support'
    ],
    setupTime: '2 minutes',
    costModel: 'Pay per use'
  },
  {
    id: 'openai',
    name: 'OpenAI GPT',
    icon: '🧠',
    description: 'GPT-4 models with vision and function calling',
    farmMetaphor: 'A powerful tractor for heavy lifting',
    status: 'not-configured',
    apiType: 'cloud',
    features: [
      '128K context',
      'Vision capabilities',
      'JSON mode'
    ],
    setupTime: '3 minutes',
    costModel: 'Pay per use'
  },
  {
    id: 'qwen',
    name: 'Qwen-Coder',
    icon: '🧠',
    description: 'Alibaba\'s code-focused model with local option',
    farmMetaphor: 'A garden that grows right in your backyard',
    status: 'not-configured',
    apiType: 'hybrid',
    features: [
      '128K context',
      'Local or cloud',
      'Code optimized'
    ],
    setupTime: '5 minutes',
    costModel: 'Free (local) or pay per use'
  },
  {
    id: 'gpt_oss',
    name: 'GPT-OSS',
    icon: '🧠',
    description: 'Open-source GPT running on your hardware',
    farmMetaphor: 'Your own AI barn that you control completely',
    status: 'not-configured',
    apiType: 'local',
    features: [
      '100% private',
      'No API costs',
      'GPU accelerated'
    ],
    setupTime: '10 minutes',
    costModel: 'Free forever'
  }
];

export const AIEngineSetupHub: React.FC = () => {
  const { preferences, updatePreferences } = useUserStore();
  const [engines, setEngines] = useState<AIEngineConfig[]>(AI_ENGINES);
  const [activeWizard, setActiveWizard] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [showKeys, setShowKeys] = useState<{ [key: string]: boolean }>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { success: showSuccess, error: showError } = useToast();

  // Load saved configurations on mount
  useEffect(() => {
    loadSavedConfigurations();
  }, []);

  const loadSavedConfigurations = async () => {
    try {
      // First, load from database
      const dbResponse = await fetch('/api/apikeys');
      if (dbResponse.ok) {
        const data = await dbResponse.json();
        if (data.success && data.keys) {
          // Convert database keys to our format
          const dbKeys: ApiKey[] = data.keys.map((key: any) => ({
            id: key.id.toString(),
            name: key.name,
            key: key.key, // This will be masked from server
            service: key.service,
            permissions: key.permissions || ['read', 'write'],
            createdAt: new Date(key.createdAt),
            lastUsed: key.lastUsed ? new Date(key.lastUsed) : undefined
          }));
          
          // Merge with localStorage keys (localStorage takes precedence for actual key values)
          const localKeys = localStorage.getItem('maifarm_api_keys');
          let mergedKeys = dbKeys;
          
          if (localKeys) {
            try {
              const parsed = JSON.parse(localKeys);
              // Merge: use local key values but database metadata
              mergedKeys = dbKeys.map(dbKey => {
                const localKey = parsed.find((k: ApiKey) => 
                  k.service.toLowerCase() === dbKey.service.toLowerCase()
                );
                return localKey ? { ...dbKey, key: localKey.key } : dbKey;
              });
              
              // Add any local-only keys
              parsed.forEach((localKey: ApiKey) => {
                if (!mergedKeys.find(k => k.service.toLowerCase() === localKey.service.toLowerCase())) {
                  mergedKeys.push(localKey);
                }
              });
            } catch (error) {
              console.error('Error parsing localStorage keys:', error);
            }
          }
          
          setApiKeys(mergedKeys);
          
          // Don't update engine status based on keys alone - wait for server status check
          // The server is the source of truth for whether providers are properly configured
        }
      }
    } catch (error) {
      console.error('Error loading from database:', error);
      
      // Fallback to localStorage only
      const savedApiKeys = localStorage.getItem('maifarm_api_keys');
      if (savedApiKeys) {
        try {
          const parsed = JSON.parse(savedApiKeys);
          setApiKeys(parsed);
          
          // Don't update engine status based on localStorage keys
          // The server status check will determine the actual configuration state
        } catch (error) {
          console.error('Error loading saved API keys:', error);
        }
      }
    }
    
    // Don't load engine states from localStorage - let server status check be the source of truth
    // This prevents incorrect status display from stale localStorage data

    // Check server status for each engine
    await checkEngineStatuses();
  };


  const checkEngineStatuses = async () => {
    // Check provider status from the unified endpoint
    try {
      const response = await fetch('/api/providers/status');
      if (response.ok) {
        const data = await response.json();
        
        // Check Claude status
        if (data.providers?.claude) {
          updateEngineStatus('claude', data.providers.claude.configured ? 'configured' : 'not-configured');
        }
        
        // Check OpenAI status
        if (data.providers?.openai) {
          updateEngineStatus('openai', data.providers.openai.configured ? 'configured' : 'not-configured');
        }
        
        // Check Qwen status
        if (data.providers?.qwen) {
          updateEngineStatus('qwen', data.providers.qwen.configured ? 'configured' : 'not-configured');
        }
      }
    } catch (error) {
      console.error('Error checking provider statuses:', error);
      
      // Fallback to individual checks
      try {
        const claudeResponse = await fetch('/api/apikeys/claude/status');
        if (claudeResponse.ok) {
          const data = await claudeResponse.json();
          updateEngineStatus('claude', data.configured ? 'configured' : 'not-configured');
        }
      } catch (error) {
        console.error('Error checking Claude status:', error);
      }

      try {
        const openaiResponse = await fetch('/api/openai/status');
        if (openaiResponse.ok) {
          const data = await openaiResponse.json();
          updateEngineStatus('openai', data.configured ? 'configured' : 'not-configured');
        }
      } catch (error) {
        console.error('Error checking OpenAI status:', error);
      }
    }
  };

  const updateEngineStatus = (engineId: string, status: 'not-configured' | 'configured' | 'error') => {
    setEngines(prev => {
      const updated = prev.map(engine => 
        engine.id === engineId ? { ...engine, status } : engine
      );
      // Don't save engine status to localStorage - server is source of truth
      return updated;
    });
  };

  const handleEngineSetupComplete = async (engineId: string, apiKey?: string) => {
    const engine = engines.find(e => e.id === engineId);
    if (!engine) return;

    // Update engine status
    const updatedEngines = engines.map(e => 
      e.id === engineId 
        ? { ...e, status: 'configured' as const, apiKey, lastConfigured: new Date() }
        : e
    );
    setEngines(updatedEngines);

    // Create or update API key entry
    if (apiKey) {
      // Determine the service name for the database
      let serviceName = engineId;
      if (engine.name === 'Claude Code' || engineId === 'claude') {
        serviceName = 'claude';
      } else if (engine.name === 'OpenAI GPT' || engineId === 'openai') {
        serviceName = 'openai';
      } else if (engineId === 'qwen') {
        serviceName = 'qwen';
      }

      // Save to database
      try {
        const response = await fetch('/api/apikeys', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            service: serviceName,
            apiKey: apiKey,
            name: `${engine.name} API Key`
          })
        });

        if (!response.ok) {
          console.error('Failed to save API key to database');
        }
      } catch (error) {
        console.error('Error saving API key to database:', error);
      }

      const newApiKey: ApiKey = {
        id: Date.now().toString(),
        name: `${engine.name} API Key`,
        key: apiKey,
        service: serviceName,
        permissions: ['read', 'write'],
        createdAt: new Date()
      };

      const existingKeyIndex = apiKeys.findIndex(k => 
        k.service.toLowerCase() === serviceName.toLowerCase()
      );

      let updatedKeys: ApiKey[];
      if (existingKeyIndex >= 0) {
        // Update existing key
        updatedKeys = [...apiKeys];
        updatedKeys[existingKeyIndex] = { ...updatedKeys[existingKeyIndex], key: apiKey };
      } else {
        // Add new key
        updatedKeys = [...apiKeys, newApiKey];
      }
      
      setApiKeys(updatedKeys);
      localStorage.setItem('maifarm_api_keys', JSON.stringify(updatedKeys));
      
      // Update user preferences
      updatePreferences({ apiKeys: updatedKeys });
    }

    setActiveWizard(null);
    showSuccess(`✅ ${engine.name} configured successfully`);
  };

  const handleDeleteApiKey = async (keyId: string) => {
    const keyToDelete = apiKeys.find(k => k.id === keyId);
    if (!keyToDelete) return;

    // Delete from database
    try {
      const response = await fetch(`/api/apikeys/${keyId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        console.error('Failed to delete API key from database');
      }
    } catch (error) {
      console.error('Error deleting API key from database:', error);
    }

    const updatedKeys = apiKeys.filter(k => k.id !== keyId);
    setApiKeys(updatedKeys);
    localStorage.setItem('maifarm_api_keys', JSON.stringify(updatedKeys));
    updatePreferences({ apiKeys: updatedKeys });

    // Update engine status if key was deleted
    const engineId = keyToDelete.service.toLowerCase() === 'claude' ? 'claude' : 
                     keyToDelete.service.toLowerCase() === 'openai' ? 'openai' : 
                     keyToDelete.service.toLowerCase() === 'qwen' ? 'qwen' : null;
    if (engineId) {
      updateEngineStatus(engineId, 'not-configured');
    }

    showSuccess('API key deleted');
  };

  const toggleShowKey = (id: string) => {
    setShowKeys({ ...showKeys, [id]: !showKeys[id] });
  };

  const copyToClipboard = async (key: string, id: string) => {
    await navigator.clipboard.writeText(key);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const maskApiKey = (key: string) => {
    if (!key || key.length < 11) return key;
    return `${key.substring(0, 7)}${'•'.repeat(8)}${key.substring(key.length - 4)}`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'configured':
        return (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="relative"
          >
            <div className="absolute inset-0 bg-green-500/20 rounded-full blur-lg" />
            <CheckCircleIcon className="w-6 h-6 text-green-500 relative" />
          </motion.div>
        );
      case 'error':
        return (
          <motion.div
            animate={{ rotate: [0, -5, 5, -5, 0] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 3 }}
            className="relative"
          >
            <XCircleIcon className="w-6 h-6 text-red-500" />
          </motion.div>
        );
      default:
        return (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          >
            <CogIcon className="w-6 h-6 text-gray-400" />
          </motion.div>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { icon: JSX.Element; text: string; className: string }> = {
      configured: {
        icon: <CheckIcon className="w-3 h-3" />,
        text: 'Ready to Farm',
        className: 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 text-green-700 dark:text-green-400 border border-green-500/20'
      },
      error: {
        icon: <ExclamationTriangleIcon className="w-3 h-3" />,
        text: 'Needs Attention',
        className: 'bg-gradient-to-r from-red-500/10 to-orange-500/10 text-red-700 dark:text-red-400 border border-red-500/20'
      },
      default: {
        icon: <InformationCircleIcon className="w-3 h-3" />,
        text: 'Not Set Up',
        className: 'bg-gradient-to-r from-gray-500/10 to-slate-500/10 text-gray-700 dark:text-gray-400 border border-gray-500/20'
      }
    };

    const badge = badges[status] || badges['default'];
    
    return (
      <motion.span 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${badge.className} backdrop-blur-sm`}
      >
        {badge.icon}
        {badge.text}
      </motion.span>
    );
  };

  const getApiTypeBadge = (apiType: string) => {
    const types = {
      cloud: {
        icon: <CloudIcon className="w-3 h-3" />,
        text: 'Cloud',
        className: 'bg-gradient-to-r from-blue-500/10 to-sky-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20'
      },
      local: {
        icon: <ComputerDesktopIcon className="w-3 h-3" />,
        text: 'Local',
        className: 'bg-gradient-to-r from-purple-500/10 to-violet-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20'
      },
      hybrid: {
        icon: <ServerStackIcon className="w-3 h-3" />,
        text: 'Hybrid',
        className: 'bg-gradient-to-r from-amber-500/10 to-yellow-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
      }
    };

    const type = types[apiType as keyof typeof types];
    
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${type.className} backdrop-blur-sm`}>
        {type.icon}
        {type.text}
      </span>
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Enhanced Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-4">
            <motion.div 
              className="relative"
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity, repeatDelay: 2 }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-full blur-xl" />
              <div className="relative text-5xl bg-white dark:bg-gray-800 rounded-2xl p-3 shadow-lg border border-gray-200 dark:border-gray-700">
                <SparklesIcon className="w-10 h-10 text-green-600 dark:text-green-400" />
              </div>
            </motion.div>
            <div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                AI Engine Configuration Hub
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Power up your MaiFarm with cutting-edge AI capabilities
              </p>
            </div>
          </div>
        </motion.div>

      {/* Enhanced Status Bar */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 p-6 shadow-lg border border-gray-200 dark:border-gray-700"
      >
        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-full blur-2xl" />
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheckIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
              <span className="text-lg font-semibold text-gray-900 dark:text-white">
                Setup Progress
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {engines.filter(e => e.status === 'configured').length === engines.length 
                ? "All engines configured and ready!" 
                : `${engines.filter(e => e.status === 'configured').length} of ${engines.length} engines configured`
              }
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 dark:from-green-400 dark:to-emerald-400 bg-clip-text text-transparent">
              {Math.round((engines.filter(e => e.status === 'configured').length / engines.length) * 100)}%
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Complete</p>
          </div>
        </div>
        <div className="mt-4">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full relative"
              initial={{ width: 0 }}
              animate={{ width: `${(engines.filter(e => e.status === 'configured').length / engines.length) * 100}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
            </motion.div>
          </div>
          <div className="flex justify-between mt-2">
            {engines.map((engine, idx) => (
              <Tooltip key={engine.id} content={`${engine.name}: ${engine.status === 'configured' ? 'Configured' : 'Not configured'}`}>
                <div 
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    engine.status === 'configured' 
                      ? 'bg-green-500 shadow-lg shadow-green-500/50' 
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                />
              </Tooltip>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Enhanced Engine Cards */}
      <div className="grid gap-4">
        {engines.map((engine, index) => {
          const relatedKey = apiKeys.find(k => 
            (k.service === 'Claude' && engine.id === 'claude') ||
            (k.service === 'OpenAI' && engine.id === 'openai')
          );
          
          return (
            <motion.div
              key={engine.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.01 }}
              className={`
                relative rounded-2xl transition-all overflow-hidden
                ${engine.status === 'configured' 
                  ? 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-500/30' 
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                }
                shadow-lg hover:shadow-xl
              `}
            >
              {/* Background Pattern */}
              <div className="absolute inset-0 opacity-5">
                <div className="absolute inset-0" style={{
                  backgroundImage: `radial-gradient(circle at 2px 2px, currentColor 1px, transparent 1px)`,
                  backgroundSize: '20px 20px'
                }} />
              </div>
              <div className="relative p-6 space-y-4">
                {/* Header Section */}
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    {/* Enhanced Icon Container */}
                    <div className="relative">
                      <div className={`
                        w-16 h-16 rounded-xl flex items-center justify-center
                        ${engine.status === 'configured' 
                          ? 'bg-gradient-to-br from-green-500/20 to-emerald-500/20' 
                          : 'bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600'
                        }
                      `}>
                        <span className="text-3xl">{engine.icon}</span>
                      </div>
                      {engine.status === 'configured' && (
                        <motion.div 
                          className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 500 }}
                        >
                          <CheckIcon className="w-3 h-3 text-white" />
                        </motion.div>
                      )}
                    </div>
                    
                    {/* Info Section */}
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                            {engine.name}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                            {engine.description}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            {getStatusBadge(engine.status)}
                            {getApiTypeBadge(engine.apiType)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="flex items-center gap-3">
                    {getStatusIcon(engine.status)}
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setActiveWizard(engine.id)}
                      className={`
                        relative px-6 py-2.5 rounded-xl font-medium text-sm
                        transition-all duration-200 shadow-md hover:shadow-lg
                        ${engine.status === 'configured' 
                          ? 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600' 
                          : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700'
                        }
                      `}
                    >
                      <span className="relative z-10">
                        {engine.status === 'configured' ? 'Reconfigure' : 'Set Up'}
                      </span>
                      {engine.status !== 'configured' && (
                        <div className="absolute inset-0 bg-white/20 rounded-xl animate-pulse" />
                      )}
                    </motion.button>
                  </div>
                </div>

                {/* Features and Info Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  {/* Features */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Features</h4>
                    <ul className="space-y-1">
                      {engine.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                          <CheckIcon className="w-3 h-3 text-green-500" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  {/* Setup Info */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Setup Info</h4>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <CogIcon className="w-3 h-3" />
                        Setup time: {engine.setupTime}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <span className="text-xs">💵</span>
                        {engine.costModel}
                      </div>
                    </div>
                  </div>
                  
                  {/* Farm Metaphor */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Farm Metaphor</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 italic">
                      "{engine.farmMetaphor}"
                    </p>
                  </div>
                </div>

                {/* Enhanced API Key Display */}
                {relatedKey && (
                  <AnimatePresence>
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-t border-gray-200 dark:border-gray-700 pt-4"
                    >
                      <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900/50 dark:to-gray-800/50 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-3">
                              <div className="p-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg">
                                <KeyIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                              </div>
                              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                API Key Configuration
                              </span>
                              {relatedKey.lastUsed && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  Last used: {new Date(relatedKey.lastUsed).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            
                            {/* API Key Input Field */}
                            <div className="relative">
                              <input
                                type={showKeys[relatedKey.id] ? "text" : "password"}
                                value={relatedKey.key}
                                readOnly
                                className="
                                  w-full px-4 py-2.5 pr-32
                                  bg-white dark:bg-gray-800 
                                  border border-gray-300 dark:border-gray-600
                                  rounded-lg font-mono text-sm
                                  text-gray-700 dark:text-gray-300
                                  focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                                  transition-all duration-200
                                "
                              />
                              
                              {/* Action Buttons */}
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                <Tooltip content={showKeys[relatedKey.id] ? "Hide key" : "Show key"}>
                                  <button
                                    onClick={() => toggleShowKey(relatedKey.id)}
                                    className="
                                      p-2 rounded-lg
                                      text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200
                                      hover:bg-gray-100 dark:hover:bg-gray-700
                                      transition-all duration-200
                                    "
                                  >
                                    {showKeys[relatedKey.id] ? (
                                      <EyeSlashIcon className="w-4 h-4" />
                                    ) : (
                                      <EyeIcon className="w-4 h-4" />
                                    )}
                                  </button>
                                </Tooltip>
                                
                                <Tooltip content="Copy to clipboard">
                                  <button
                                    onClick={() => copyToClipboard(relatedKey.key, relatedKey.id)}
                                    className="
                                      p-2 rounded-lg
                                      text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200
                                      hover:bg-gray-100 dark:hover:bg-gray-700
                                      transition-all duration-200
                                    "
                                  >
                                    <AnimatePresence mode="wait">
                                      {copiedKey === relatedKey.id ? (
                                        <motion.div
                                          key="check"
                                          initial={{ scale: 0 }}
                                          animate={{ scale: 1 }}
                                          exit={{ scale: 0 }}
                                        >
                                          <CheckIcon className="w-4 h-4 text-green-500" />
                                        </motion.div>
                                      ) : (
                                        <motion.div key="clipboard">
                                          <ClipboardDocumentIcon className="w-4 h-4" />
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </button>
                                </Tooltip>
                                
                                <Tooltip content="Delete API key">
                                  <button
                                    onClick={() => handleDeleteApiKey(relatedKey.id)}
                                    className="
                                      p-2 rounded-lg
                                      text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300
                                      hover:bg-red-50 dark:hover:bg-red-900/20
                                      transition-all duration-200
                                    "
                                  >
                                    <TrashIcon className="w-4 h-4" />
                                  </button>
                                </Tooltip>
                              </div>
                            </div>
                            
                            {/* Key Permissions */}
                            {relatedKey.permissions && relatedKey.permissions.length > 0 && (
                              <div className="flex items-center gap-2 mt-3">
                                <span className="text-xs text-gray-500 dark:text-gray-400">Permissions:</span>
                                {relatedKey.permissions.map(perm => (
                                  <span key={perm} className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full">
                                    {perm}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>



      {/* Enhanced Additional API Keys Section */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-8 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        <div className="p-6 bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
                <KeyIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Additional Service Keys
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Manage API keys for external services and integrations
                </p>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                // TODO: Replace with proper modal
                const service = prompt('Enter service name (e.g., GitHub, GitLab, Slack):');
                if (service) {
                  const key = prompt('Enter API key:');
                  if (key) {
                    const newKey: ApiKey = {
                      id: Date.now().toString(),
                      name: `${service} API Key`,
                      key,
                      service,
                      permissions: ['read', 'write'],
                      createdAt: new Date()
                    };
                    const updatedKeys = [...apiKeys, newKey];
                    setApiKeys(updatedKeys);
                    localStorage.setItem('maifarm_api_keys', JSON.stringify(updatedKeys));
                    updatePreferences({ apiKeys: updatedKeys });
                    showSuccess(`${service} API key added`);
                  }
                }
              }}
              className="
                inline-flex items-center gap-2 px-4 py-2.5
                bg-gradient-to-r from-purple-500 to-violet-500
                hover:from-purple-600 hover:to-violet-600
                text-white text-sm font-medium rounded-xl
                shadow-md hover:shadow-lg
                transition-all duration-200
              "
            >
              <PlusIcon className="w-4 h-4" />
              Add New Key
            </motion.button>
          </div>
        </div>
        
        <div className="p-6">
          {apiKeys.filter(k => 
            k.service !== 'Claude' && k.service !== 'OpenAI'
          ).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
                <KeyIcon className="w-8 h-8 text-gray-400 dark:text-gray-500" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                No additional API keys configured
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Add keys for GitHub, GitLab, Slack, and other services
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {apiKeys.filter(k => 
                k.service !== 'Claude' && k.service !== 'OpenAI'
              ).map((apiKey, index) => (
                <motion.div
                  key={apiKey.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="
                    group relative rounded-xl border border-gray-200 dark:border-gray-700
                    bg-gradient-to-r from-white to-gray-50 dark:from-gray-800 dark:to-gray-900
                    hover:shadow-md transition-all duration-200
                  "
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        {/* Service Header */}
                        <div className="flex items-center gap-3 mb-3">
                          <div className="p-1.5 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 rounded-lg">
                            <KeyIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 dark:text-white">
                                {apiKey.service}
                              </span>
                              <span className="px-2 py-0.5 text-xs bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-700 dark:text-blue-400 rounded-full border border-blue-500/20">
                                External Service
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              Added {new Date(apiKey.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        
                        {/* Key Display */}
                        <div className="relative">
                          <div className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                            <input
                              type={showKeys[apiKey.id] ? "text" : "password"}
                              value={apiKey.key}
                              readOnly
                              className="
                                flex-1 bg-transparent
                                font-mono text-sm text-gray-700 dark:text-gray-300
                                focus:outline-none
                              "
                            />
                            <div className="flex items-center gap-1">
                              <Tooltip content={showKeys[apiKey.id] ? "Hide" : "Show"}>
                                <button
                                  onClick={() => toggleShowKey(apiKey.id)}
                                  className="
                                    p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700
                                    text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200
                                    transition-colors
                                  "
                                >
                                  {showKeys[apiKey.id] ? (
                                    <EyeSlashIcon className="w-3.5 h-3.5" />
                                  ) : (
                                    <EyeIcon className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </Tooltip>
                              
                              <Tooltip content="Copy">
                                <button
                                  onClick={() => copyToClipboard(apiKey.key, apiKey.id)}
                                  className="
                                    p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700
                                    text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200
                                    transition-colors
                                  "
                                >
                                  {copiedKey === apiKey.id ? (
                                    <CheckIcon className="w-3.5 h-3.5 text-green-500" />
                                  ) : (
                                    <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </Tooltip>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Delete Button */}
                      <Tooltip content="Delete key">
                        <button
                          onClick={() => handleDeleteApiKey(apiKey.id)}
                          className="
                            opacity-0 group-hover:opacity-100
                            p-2 rounded-lg
                            text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300
                            hover:bg-red-50 dark:hover:bg-red-900/20
                            transition-all duration-200
                          "
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* Wizards */}
      <ClaudeSetupWizard
        isOpen={activeWizard === 'claude'}
        onClose={() => setActiveWizard(null)}
        onComplete={(apiKey) => {
          handleEngineSetupComplete('claude', apiKey);
        }}
      />

      <OpenAISetupWizard
        isOpen={activeWizard === 'openai'}
        onClose={() => setActiveWizard(null)}
        onComplete={(apiKey, model) => {
          handleEngineSetupComplete('openai', apiKey);
        }}
      />

      <QwenLocalSetupWizard
        isOpen={activeWizard === 'qwen'}
        onClose={() => setActiveWizard(null)}
        onComplete={(config: any) => {
          handleEngineSetupComplete('qwen', config.apiKey);
        }}
      />

      {/* GPT-OSS Setup Wizard - TODO: Implement
      <GptOssSetupWizard
        isOpen={activeWizard === 'gpt_oss'}
        onClose={() => setActiveWizard(null)}
        onComplete={(config: any) => {
          handleEngineSetupComplete('gpt_oss');
        }}
      /> */}
      </div>
    </div>
  );
};