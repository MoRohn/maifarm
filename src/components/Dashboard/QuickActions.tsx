import React from 'react';
import { motion } from 'framer-motion';
import { 
  Plus, 
  FileText, 
  Sparkles, 
  Zap,
  Wand2,
  Rocket,
  Brain,
  Code2
} from 'lucide-react';
import { clsx } from 'clsx';

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: 'primary' | 'green' | 'purple' | 'orange';
  onClick: () => void;
}

export const QuickActions: React.FC = () => {
  const actions: QuickAction[] = [
    {
      id: 'new-farm',
      title: 'New Farm',
      description: 'Create a new agent farm',
      icon: Plus,
      color: 'primary',
      onClick: () => console.log('New Farm'),
    },
    {
      id: 'ai-yaml',
      title: 'AI YAML',
      description: 'Generate config from prompt',
      icon: Wand2,
      color: 'purple',
      onClick: () => console.log('AI YAML'),
    },
    {
      id: 'go-wild',
      title: 'Go Wild',
      description: 'Let agents explore freely',
      icon: Sparkles,
      color: 'green',
      onClick: () => console.log('Go Wild'),
    },
    {
      id: 'quick-task',
      title: 'Quick Task',
      description: 'Start a simple task',
      icon: Zap,
      color: 'orange',
      onClick: () => console.log('Quick Task'),
    },
  ];

  const colorClasses = {
    primary: {
      bg: 'bg-primary-100 dark:bg-primary-900/30',
      hover: 'hover:bg-primary-200 dark:hover:bg-primary-900/50',
      icon: 'text-primary-600 dark:text-primary-400',
      border: 'border-primary-200 dark:border-primary-800',
    },
    green: {
      bg: 'bg-green-100 dark:bg-green-900/30',
      hover: 'hover:bg-green-200 dark:hover:bg-green-900/50',
      icon: 'text-green-600 dark:text-green-400',
      border: 'border-green-200 dark:border-green-800',
    },
    purple: {
      bg: 'bg-purple-100 dark:bg-purple-900/30',
      hover: 'hover:bg-purple-200 dark:hover:bg-purple-900/50',
      icon: 'text-purple-600 dark:text-purple-400',
      border: 'border-purple-200 dark:border-purple-800',
    },
    orange: {
      bg: 'bg-orange-100 dark:bg-orange-900/30',
      hover: 'hover:bg-orange-200 dark:hover:bg-orange-900/50',
      icon: 'text-orange-600 dark:text-orange-400',
      border: 'border-orange-200 dark:border-orange-800',
    },
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Quick Actions
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {actions.map((action, index) => {
          const Icon = action.icon;
          const colors = colorClasses[action.color];

          return (
            <motion.button
              key={action.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={action.onClick}
              className={clsx(
                'relative p-4 rounded-apple-lg border transition-all duration-200',
                'text-left group overflow-hidden',
                colors.bg,
                colors.hover,
                colors.border
              )}
            >
              {/* Background decoration */}
              <motion.div
                className={clsx(
                  'absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-10',
                  colors.icon.replace('text-', 'bg-')
                )}
                whileHover={{ scale: 1.2, rotate: 15 }}
                transition={{ type: 'spring', stiffness: 200 }}
              />

              {/* Content */}
              <div className="relative z-10">
                <div className={clsx(
                  'w-10 h-10 rounded-apple flex items-center justify-center mb-3',
                  'bg-white dark:bg-gray-900',
                  'shadow-sm group-hover:shadow-md transition-shadow'
                )}>
                  <Icon className={clsx('w-5 h-5', colors.icon)} />
                </div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-1">
                  {action.title}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {action.description}
                </p>
              </div>

              {/* Hover effect */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-br from-white/0 to-white/10 dark:from-white/0 dark:to-white/5 opacity-0 group-hover:opacity-100 transition-opacity"
                initial={false}
              />
            </motion.button>
          );
        })}
      </div>

      {/* Featured Actions */}
      <div className="mt-6 p-4 bg-gradient-to-r from-primary-50 to-purple-50 dark:from-primary-900/20 dark:to-purple-900/20 rounded-apple-lg border border-primary-200 dark:border-primary-800">
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-white dark:bg-gray-900 rounded-apple shadow-sm">
            <Brain className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="flex-1">
            <h4 className="font-medium text-gray-900 dark:text-white mb-1">
              Pro Tip: Try the AI YAML Generator
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Simply describe what you want to build, and our AI will generate the perfect YAML configuration for your farm.
            </p>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="mt-3 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
            >
              Learn more →
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
};