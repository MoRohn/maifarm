import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Brain, Sparkles, Check, Server, Cloud, Info } from 'lucide-react';

export type AIProvider = 'claude' | 'qwen' | 'qwen_local';

export interface AIProviderConfig {
  id: AIProvider;
  name: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
  enabled: boolean;
  contextWindow?: string;
  apiAvailability?: string;
  isLocal?: boolean;
}

export interface EnhancedAIProviderSelectorProps {
  value: AIProvider;
  onChange: (provider: AIProvider) => void;
  showDetails?: boolean;
  disabled?: boolean;
  className?: string;
  localQwenAvailable?: boolean;
  localQwenModel?: string;
}

const EnhancedAIProviderSelector: React.FC<EnhancedAIProviderSelectorProps> = ({
  value,
  onChange,
  showDetails = false,
  disabled = false,
  className = '',
  localQwenAvailable = false,
  localQwenModel
}) => {
  const [showLocalOption, setShowLocalOption] = useState(false);

  // Provider configurations
  const providerConfigs: Record<string, AIProviderConfig> = {
    claude: {
      id: 'claude',
      name: 'Claude Code',
      description: 'Anthropic\'s Claude AI for collaborative development',
      icon: <Brain className="w-5 h-5" />,
      features: [
        'Advanced code understanding',
        'Multi-agent orchestration',
        'Proven reliability',
        'Premium API'
      ],
      enabled: true,
      contextWindow: '200K tokens',
      apiAvailability: 'Paid API',
      isLocal: false
    },
    qwen: {
      id: 'qwen',
      name: 'Qwen3-Coder (API)',
      description: 'Alibaba\'s 480B parameter model via API',
      icon: <Cloud className="w-5 h-5" />,
      features: [
        'Large context (256K tokens)',
        'Free API access',
        '35B active parameters',
        'Cloud-based processing'
      ],
      enabled: true,
      contextWindow: '256K tokens',
      apiAvailability: 'Free API',
      isLocal: false
    },
    qwen_local: {
      id: 'qwen_local',
      name: `Qwen3-Coder (Local)`,
      description: localQwenModel ? `Running ${localQwenModel} locally` : 'Run Qwen locally via Ollama',
      icon: <Server className="w-5 h-5" />,
      features: [
        'Zero latency',
        'Complete privacy',
        'No API costs',
        'Offline capable'
      ],
      enabled: localQwenAvailable,
      contextWindow: 'Model dependent',
      apiAvailability: 'Free (Local)',
      isLocal: true
    }
  };

  // Filter enabled providers
  const providers = Object.values(providerConfigs).filter(p => p.enabled);

  // Auto-switch to local if available and currently on qwen API
  useEffect(() => {
    if (localQwenAvailable && value === 'qwen') {
      setShowLocalOption(true);
    }
  }, [localQwenAvailable, value]);

  if (!showDetails) {
    // Compact dropdown view
    return (
      <div className={`relative ${className}`}>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          AI Engine
        </label>
        <div className="flex gap-2">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value as AIProvider)}
            disabled={disabled}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name} {provider.apiAvailability && `(${provider.apiAvailability})`}
              </option>
            ))}
          </select>
          
          {localQwenAvailable && value.includes('qwen') && (
            <button
              type="button"
              onClick={() => {
                onChange(value === 'qwen_local' ? 'qwen' : 'qwen_local');
              }}
              className="px-3 py-2 text-sm font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded-md hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
              title={value === 'qwen_local' ? 'Switch to API' : 'Switch to Local'}
            >
              {value === 'qwen_local' ? (
                <>
                  <Cloud className="w-4 h-4 inline mr-1" />
                  Use API
                </>
              ) : (
                <>
                  <Server className="w-4 h-4 inline mr-1" />
                  Use Local
                </>
              )}
            </button>
          )}
        </div>
        
        {showLocalOption && !localQwenAvailable && (
          <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-md">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              <Info className="w-3 h-3 inline mr-1" />
              Local Qwen model available! Switch to use it for free, offline access.
            </p>
          </div>
        )}
      </div>
    );
  }

  // Detailed card view
  return (
    <div className={`space-y-3 ${className}`}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Select AI Engine
      </label>
      
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((provider) => {
          const isSelected = value === provider.id;
          
          return (
            <motion.div
              key={provider.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <button
                type="button"
                onClick={() => !disabled && onChange(provider.id)}
                disabled={disabled}
                className={`
                  relative w-full p-4 text-left rounded-lg border-2 transition-all
                  ${isSelected 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }
                  ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3">
                    <Check className="w-5 h-5 text-blue-500" />
                  </div>
                )}
                
                <div className="flex items-start gap-3">
                  <div className={`
                    p-2 rounded-lg
                    ${isSelected 
                      ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600' 
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }
                  `}>
                    {provider.icon}
                  </div>
                  
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {provider.name}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {provider.description}
                    </p>
                    
                    {provider.isLocal && localQwenModel && (
                      <div className="mt-2 px-2 py-1 bg-green-100 dark:bg-green-900/30 rounded inline-block">
                        <span className="text-xs font-medium text-green-700 dark:text-green-300">
                          {localQwenModel}
                        </span>
                      </div>
                    )}
                    
                    <div className="mt-3 space-y-1">
                      {provider.features.slice(0, 3).map((feature, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <div className="w-1 h-1 bg-gray-400 dark:bg-gray-600 rounded-full" />
                          <span className="text-xs text-gray-600 dark:text-gray-400">
                            {feature}
                          </span>
                        </div>
                      ))}
                    </div>
                    
                    {provider.contextWindow && (
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                        Context: {provider.contextWindow}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            </motion.div>
          );
        })}
      </div>
      
      {localQwenAvailable && value === 'qwen' && (
        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <p className="text-sm text-green-700 dark:text-green-300">
            <Info className="w-4 h-4 inline mr-1" />
            Local Qwen model detected! Consider switching to "Qwen3-Coder (Local)" for free, offline usage.
          </p>
        </div>
      )}
      
      {value === 'qwen_local' && !localQwenAvailable && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            <Info className="w-4 h-4 inline mr-1" />
            No local Qwen model detected. Click "Setup" in the settings to install one via Ollama.
          </p>
        </div>
      )}
    </div>
  );
};

export default EnhancedAIProviderSelector;