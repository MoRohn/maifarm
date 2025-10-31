import React from 'react';
import { motion } from 'framer-motion';
import { Brain, Sparkles, Check } from 'lucide-react';
import { SparklesIcon } from '@heroicons/react/24/outline';

export type AIProvider = 'claude' | 'openai';

export interface AIProviderConfig {
  id: AIProvider;
  name: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
  enabled: boolean;
  contextWindow?: string;
  apiAvailability?: string;
}

export interface AIProviderSelectorProps {
  value: AIProvider;
  onChange: (provider: AIProvider) => void;
  showDetails?: boolean;
  disabled?: boolean;
  className?: string;
}

const providerConfigs: Record<AIProvider, AIProviderConfig> = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    description: 'Anthropic\'s Claude AI for collaborative development',
    icon: <Brain className="w-5 h-5 text-orange-500" />,
    features: [
      'Advanced code understanding',
      'Multi-agent orchestration'
    ],
    enabled: true,
    contextWindow: '200K tokens',
    apiAvailability: 'Paid API'
  },
  openai: {
    id: 'openai',
    name: 'OpenAI GPT-4',
    description: 'State-of-the-art language model with function calling',
    icon: <Brain className="w-5 h-5 text-blue-500" />,
    features: [
      'Vision capabilities',
      'Large context window'
    ],
    enabled: true,
    contextWindow: '128K tokens',
    apiAvailability: 'Paid API'
  }
};

const AIProviderSelector: React.FC<AIProviderSelectorProps> = ({
  value,
  onChange,
  showDetails = false,
  disabled = false,
  className = ''
}) => {
  const providers = Object.values(providerConfigs).filter(p => p.enabled);

  if (!showDetails) {
    // Compact dropdown view
    return (
      <div className={`relative ${className}`}>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          AI Engine
        </label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as AIProvider)}
          disabled={disabled}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name} {provider.apiAvailability && `(${provider.apiAvailability})`}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Detailed card view
  return (
    <div className={`space-y-3 ${className}`}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Select AI Engine
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        {providers.map((provider) => {
          const isSelected = value === provider.id;
          
          return (
            <motion.button
              key={provider.id}
              onClick={() => !disabled && onChange(provider.id)}
              disabled={disabled}
              whileHover={!disabled ? { scale: 1.02 } : {}}
              whileTap={!disabled ? { scale: 0.98 } : {}}
              className={`
                relative p-4 rounded-lg border-2 transition-all text-left
                ${isSelected 
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              {isSelected && (
                <div className="absolute top-2 right-2">
                  <Check className="w-5 h-5 text-blue-500" />
                </div>
              )}
              
              <div className="flex items-start gap-3">
                <div className={`
                  p-2 rounded-lg
                  ${isSelected 
                    ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-400' 
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }
                `}>
                  {provider.icon}
                </div>
                
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    {provider.name}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {provider.description}
                  </p>
                  
                  {provider.contextWindow && (
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                      Context: {provider.contextWindow}
                    </p>
                  )}
                  
                  <div className="mt-3 space-y-1">
                    {provider.features.slice(0, 2).map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                        <div className="w-1 h-1 bg-gray-400 rounded-full" />
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>
                  
                  {provider.apiAvailability && (
                    <div className={`
                      inline-flex items-center gap-1 mt-2 px-2 py-1 rounded-full text-xs font-medium
                      ${provider.apiAvailability === 'Free API' 
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                      }
                    `}>
                      {provider.apiAvailability}
                    </div>
                  )}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default AIProviderSelector;