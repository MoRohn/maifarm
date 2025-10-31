import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Sprout,
  Zap,
  Trees,
  Sparkles
} from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { QuickTaskModal } from '../Task/QuickTaskModal';
import { GoWildModal } from '../GoWild/GoWildModal';
import { FarmChatWizard } from '../Farm/FarmChatWizardSafe';
import { useFarmStore } from '@/store/farmStore';
import { AppleCard } from '../ui/AppleCard';
import { api } from '@/services/apiClient';

interface QuickAction {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
  accentColor: string;
  onClick: () => void;
}

export const QuickActions: React.FC = () => {
  const navigate = useNavigate();
  const [showQuickTaskWizard, setShowQuickTaskWizard] = useState(false);
  const [showGoWildWizard, setShowGoWildWizard] = useState(false);
  const [showFarmWizard, setShowFarmWizard] = useState(false);
  
  const { addFarm } = useFarmStore();

  const handleNewFarm = () => {
    setShowFarmWizard(true);
  };

  const handleGoWild = () => {
    setShowGoWildWizard(true);
  };

  const handleQuickTask = () => {
    setShowQuickTaskWizard(true);
  };

  const actions: QuickAction[] = [
    {
      id: 'new-farm',
      title: 'New Farm',
      subtitle: 'Start Growing',
      description: 'Launch a new AI farming project with multiple agents',
      icon: Sprout,
      gradient: 'from-leaf-400 to-leaf-800',
      accentColor: 'leaf',
      onClick: handleNewFarm,
    },
    {
      id: 'go-wild',
      title: 'Go Wild',
      subtitle: 'Autonomous Growth',
      description: 'Enable creative exploration with self-directed agents',
      icon: Trees,
      gradient: 'from-harvest-400 to-harvest-800',
      accentColor: 'harvest',
      onClick: handleGoWild,
    },
    {
      id: 'quick-task',
      title: 'Quick Task',
      subtitle: 'Lightning Fast',
      description: 'Execute a rapid task with a single focused agent',
      icon: Zap,
      gradient: 'from-sky-400 to-sky-800',
      accentColor: 'sky',
      onClick: handleQuickTask,
    },
  ];

  const getAccentClasses = (color: string) => {
    const colorMap: Record<string, string> = {
      leaf: 'text-leaf-600 dark:text-leaf-400 bg-leaf-100 dark:bg-leaf-900/30',
      sky: 'text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-900/30',
      harvest: 'text-harvest-600 dark:text-harvest-400 bg-harvest-100 dark:bg-harvest-900/30',
    };
    return colorMap[color] || colorMap.leaf;
  };

  return (
    <div className="w-full">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
      </motion.div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {actions.map((action, index) => {
          const Icon = action.icon;
          const accentClasses = getAccentClasses(action.accentColor);

          return (
            <motion.div
              key={action.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <AppleCard
                variant="glass"
                hover={true}
                padding="none"
                className="h-full cursor-pointer group"
                onClick={action.onClick}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {/* Gradient background */}
                <div className={clsx(
                  'absolute inset-0 opacity-10 dark:opacity-5 rounded-2xl',
                  'bg-gradient-to-br',
                  action.gradient
                )} />
                
                {/* Content */}
                <div className="relative p-8">
                  {/* Icon container */}
                  <motion.div
                    className="mb-6"
                    whileHover={{ rotate: [0, -5, 5, 0] }}
                    transition={{ duration: 0.5 }}
                  >
                    <div className={clsx(
                      'w-20 h-20 rounded-2xl flex items-center justify-center',
                      'bg-gradient-to-br shadow-lg',
                      action.gradient,
                      'group-hover:shadow-xl transition-shadow duration-300'
                    )}>
                      <Icon className="w-10 h-10 text-white" />
                    </div>
                  </motion.div>
                  
                  {/* Text content */}
                  <div className="space-y-3">
                    <div>
                      <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
                        {action.title}
                      </h4>
                      <p className={clsx(
                        'text-sm font-medium',
                        accentClasses.split(' ')[0] // Just the text color
                      )}>
                        {action.subtitle}
                      </p>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                      {action.description}
                    </p>
                  </div>
                  
                  {/* Hover indicator */}
                  <motion.div
                    className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity"
                    initial={{ x: -10 }}
                    whileHover={{ x: 0 }}
                  >
                  </motion.div>
                </div>
                
                {/* Animated border gradient on hover */}
                <motion.div
                  className={clsx(
                    'absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100',
                    'bg-gradient-to-br pointer-events-none',
                    action.gradient
                  )}
                  style={{ 
                    padding: '1px',
                    WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    WebkitMaskComposite: 'xor',
                    maskComposite: 'exclude'
                  }}
                />
              </AppleCard>
            </motion.div>
          );
        })}
      </div>

      {/* Modals - 3-step conversational flow */}
      <QuickTaskModal
        isOpen={showQuickTaskWizard}
        onClose={() => setShowQuickTaskWizard(false)}
      />

      <GoWildModal
        isOpen={showGoWildWizard}
        onClose={() => setShowGoWildWizard(false)}
      />

      <FarmChatWizard
        isOpen={showFarmWizard}
        onClose={() => setShowFarmWizard(false)}
      />
    </div>
  );
};