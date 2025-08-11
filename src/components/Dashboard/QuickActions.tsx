import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  FileText, 
  Sparkles, 
  Zap,
  Wand2,
  Rocket,
  Brain,
  Code2,
  Terminal,
  Leaf
} from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { FarmCreator } from '../Farm/FarmCreator';
import { GoWildModal } from '../GoWild/GoWildModal';
import { QuickTaskModal } from '../Task/QuickTaskModal';
import { useFarmStore } from '../../store/farmStore';
import { api } from '../../services/apiClient';

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: 'blue' | 'green' | 'purple' | 'orange';
  onClick: () => void;
}

export const QuickActions: React.FC = () => {
  const navigate = useNavigate();
  const [showFarmCreator, setShowFarmCreator] = useState(false);
  const [showGoWild, setShowGoWild] = useState(false);
  const [showAIYAML, setShowAIYAML] = useState(false);
  const [showQuickTask, setShowQuickTask] = useState(false);
  
  const { addFarm } = useFarmStore();

  const handleNewFarm = () => {
    setShowFarmCreator(true);
  };

  const handleGoWild = () => {
    // Go Wild modal now handles its own farm creation
    setShowGoWild(true);
  };

  const handleAIYAML = () => {
    setShowAIYAML(true);
    // For now, redirect to farm creator with YAML tab selected
    setShowFarmCreator(true);
  };

  const handleQuickTask = () => {
    setShowQuickTask(true);
  };

  const actions: QuickAction[] = [
    {
      id: 'new-farm',
      title: 'New Farm',
      description: 'Create a new agent farm',
      icon: Plus,
      color: 'blue',
      onClick: handleNewFarm,
    },
    {
      id: 'seeds',
      title: 'Seeds',
      description: 'Start from a template',
      icon: Leaf,
      color: 'green',
      onClick: () => navigate('/farms/new'),
    },
    {
      id: 'go-wild',
      title: 'Go Wild',
      description: 'Let agents explore freely',
      icon: Sparkles,
      color: 'orange',
      onClick: handleGoWild,
    },
    {
      id: 'quick-task',
      title: 'Quick Task',
      description: 'Start a simple task',
      icon: Zap,
      color: 'purple',
      onClick: handleQuickTask,
    },
  ];

  const colorClasses = {
    blue: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      hover: 'hover:bg-blue-200 dark:hover:bg-blue-900/50',
      icon: 'text-blue-600 dark:text-blue-400',
      border: 'border-blue-200 dark:border-blue-800',
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

      {/* Modals */}
      <AnimatePresence>
        {showFarmCreator && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-900 rounded-apple-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            >
              <FarmCreator
                onClose={() => {
                  setShowFarmCreator(false);
                  setShowAIYAML(false);
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <GoWildModal
        isOpen={showGoWild}
        onClose={() => setShowGoWild(false)}
      />

      <QuickTaskModal
        isOpen={showQuickTask}
        onClose={() => setShowQuickTask(false)}
      />
    </div>
  );
};