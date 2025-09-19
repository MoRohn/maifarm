import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Brain, Sparkles, Check, Server, Cloud, Info } from 'lucide-react';

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
  isLocal?: boolean;
}

export interface EnhancedAIProviderSelectorProps {
  value: AIProvider;
  onChange: (provider: AIProvider) => void;
  showDetails?: boolean;
  disabled?: boolean;
  className?: string;
}

const EnhancedAIProviderSelector: React.FC<EnhancedAIProviderSelectorProps> = ({
  value,
  onChange,
  showDetails = false,
  disabled = false,
  className = ''
}) => {

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
    openai: {
      id: 'openai',
      name: 'OpenAI GPT-4',
      description: 'State-of-the-art language model with function calling',
      icon: <Cloud className="w-5 h-5" />,
      features: [
        'Vision capabilities',
        'Large context window (128K)',
        'Function calling',
        'Multimodal support'
      ],
      enabled: true,
      contextWindow: '128K tokens',
      apiAvailability: 'Paid API',
      isLocal: false
    }
  };

  // Filter enabled providers
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
    </div>
  );
};

export default EnhancedAIProviderSelector;