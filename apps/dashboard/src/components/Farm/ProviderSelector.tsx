import React from 'react';
import { motion } from 'framer-motion';
import { Cpu, Sparkles, Info, Brain, Server } from 'lucide-react';
import { clsx } from 'clsx';

export type AIProvider = 'claude' | 'openai';

interface ProviderOption {
  id: AIProvider;
  name: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
  badge?: string;
}

const providers: ProviderOption[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    description: 'Anthropic\'s powerful AI coding assistant',
    icon: <Cpu className="w-8 h-8" />,
    features: [
      'Advanced code understanding',
      'Multi-file editing',
      'Proven reliability',
      'Official CLI integration'
    ]
  },
  {
    id: 'openai',
    name: 'OpenAI GPT-4',
    description: 'Industry-leading AI with 128K context window',
    icon: <Brain className="w-8 h-8" />,
    features: [
      'GPT-4 Turbo with 128K context',
      'Function calling capabilities',
      'Vision & multimodal support',
      'Advanced reasoning & analysis'
    ]
  }
];

interface ProviderSelectorProps {
  value: AIProvider;
  onChange: (provider: AIProvider) => void;
  className?: string;
  disabled?: boolean;
}

export const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  value,
  onChange,
  className,
  disabled = false
}) => {
  return (
    <div className={clsx('space-y-4', className)}>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Select AI Engine
        </h3>
        <div className="group relative">
          <Info className="w-4 h-4 text-gray-400 cursor-help" />
          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10">
            <div className="bg-gray-900 text-white text-sm rounded-lg p-3 w-64">
              <p>Choose between Claude Code and OpenAI GPT-4 for your agent farm.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
        {providers.map((provider) => (
          <motion.button
            key={provider.id}
            whileHover={{ scale: disabled ? 1 : 1.02 }}
            whileTap={{ scale: disabled ? 1 : 0.98 }}
            onClick={() => !disabled && onChange(provider.id)}
            disabled={disabled}
            className={clsx(
              'relative p-6 rounded-xl border-2 transition-all text-left',
              'focus:outline-none focus:ring-2 focus:ring-offset-2',
              value === provider.id
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            {provider.badge && (
              <span className="absolute top-2 right-2 px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                {provider.badge}
              </span>
            )}

            <div className="flex items-start gap-4">
              <div className={clsx(
                'p-3 rounded-lg',
                value === provider.id
                  ? 'bg-blue-100 text-blue-600 dark:bg-blue-800 dark:text-blue-300'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
              )}>
                {provider.icon}
              </div>

              <div className="flex-1">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {provider.name}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {provider.description}
                </p>

                <ul className="mt-3 space-y-1">
                  {provider.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm">
                      <div className={clsx(
                        'w-1.5 h-1.5 rounded-full',
                        value === provider.id
                          ? 'bg-blue-500'
                          : 'bg-gray-400'
                      )} />
                      <span className="text-gray-700 dark:text-gray-300">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {value === provider.id && (
              <motion.div
                layoutId="provider-selected"
                className="absolute inset-0 border-2 border-blue-500 rounded-xl pointer-events-none"
                initial={false}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
          </motion.button>
        ))}
      </div>

      {value === 'openai' && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
        >
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Note:</strong> OpenAI GPT-4 requires an API key from OpenAI. 
            Make sure you have configured your OPENAI_API_KEY in the environment settings.
            GPT-4 Turbo supports up to 128K tokens context window.
          </p>
        </motion.div>
      )}
    </div>
  );
};