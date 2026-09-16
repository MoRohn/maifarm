/**
 * AI Engine Status Indicator
 *
 * Shows the currently active AI Engine prominently with visual indicators
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Cpu,
  Brain,
  Zap,
  GitBranch,
  CheckCircle,
  AlertCircle,
  Loader,
  ChevronRight
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';

interface AIEngineStatusIndicatorProps {
  currentProvider?: string;
  onChangeEngine?: () => void;
  className?: string;
}

const ENGINE_INFO: Record<string, {
  name: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
  isLocal: boolean;
}> = {
  'gpt-oss': {
    name: 'GPT-OSS (Local)',
    icon: <Cpu className="w-5 h-5" />,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-200 dark:border-blue-800',
    description: 'Running locally on your machine',
    isLocal: true
  },
  'claude': {
    name: 'Claude (Anthropic)',
    icon: <Zap className="w-5 h-5" />,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    borderColor: 'border-purple-200 dark:border-purple-800',
    description: 'Cloud-based AI with 200K context',
    isLocal: false
  },
  'openai': {
    name: 'OpenAI GPT-4',
    icon: <Brain className="w-5 h-5" />,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    borderColor: 'border-green-200 dark:border-green-800',
    description: 'Cloud-based GPT-4 Turbo',
    isLocal: false
  },
  'llama': {
    name: 'Llama Local',
    icon: <GitBranch className="w-5 h-5" />,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    borderColor: 'border-orange-200 dark:border-orange-800',
    description: 'Local Llama via Ollama',
    isLocal: true
  }
};

export const AIEngineStatusIndicator: React.FC<AIEngineStatusIndicatorProps> = ({
  currentProvider,
  onChangeEngine,
  className = ''
}) => {
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<string | null>(null);

  useEffect(() => {
    // Fetch current AI provider from backend
    const fetchProvider = async () => {
      try {
        setLoading(true);

        // Get current provider from backend
        const response = await fetch('/api/engines/current');
        if (response.ok) {
          const data = await response.json();
          setProvider(data.provider || 'gpt-oss');
        } else {
          // Fallback to provided prop or default
          setProvider(currentProvider || 'gpt-oss');
        }
      } catch (error) {
        console.error('Failed to fetch AI provider:', error);
        setProvider(currentProvider || 'gpt-oss');
      } finally {
        setLoading(false);
      }
    };

    fetchProvider();
  }, [currentProvider]);

  if (loading) {
    return (
      <GlassCard className={`p-4 ${className}`}>
        <div className="flex items-center gap-3">
          <Loader className="w-5 h-5 animate-spin text-gray-500" />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Detecting active AI engine...
          </span>
        </div>
      </GlassCard>
    );
  }

  const engineInfo = provider ? ENGINE_INFO[provider] : null;

  if (!engineInfo) {
    return (
      <GlassCard className={`p-4 border-yellow-200 dark:border-yellow-800 ${className}`}>
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          <div className="flex-1">
            <div className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
              No AI Engine Configured
            </div>
            <div className="text-xs text-yellow-700 dark:text-yellow-300">
              Please configure an AI engine to use MaiFarm
            </div>
          </div>
          {onChangeEngine && (
            <button
              onClick={onChangeEngine}
              className="text-sm font-medium text-yellow-600 hover:text-yellow-700 dark:text-yellow-400 dark:hover:text-yellow-300 flex items-center gap-1"
            >
              Configure
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </GlassCard>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={className}
    >
      <GlassCard
        className={`p-4 border-2 ${engineInfo.borderColor} ${engineInfo.bgColor} transition-all duration-200`}
      >
        <div className="flex items-center gap-4">
          {/* Icon */}
          <div className={`${engineInfo.color} flex-shrink-0`}>
            {engineInfo.icon}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                {engineInfo.name}
              </span>
              <div className="flex items-center gap-1">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-xs font-medium text-green-600 dark:text-green-400">
                  ACTIVE
                </span>
              </div>
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {engineInfo.description}
            </div>
            {engineInfo.isLocal && (
              <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-xs font-medium text-blue-700 dark:text-blue-300">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                Local & Private
              </div>
            )}
          </div>

          {/* Change button */}
          {onChangeEngine && (
            <button
              onClick={onChangeEngine}
              className="flex-shrink-0 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
            >
              Change
            </button>
          )}
        </div>
      </GlassCard>
    </motion.div>
  );
};

export default AIEngineStatusIndicator;
