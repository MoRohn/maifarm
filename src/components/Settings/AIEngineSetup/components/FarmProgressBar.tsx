import React from 'react';
import { motion } from 'framer-motion';

interface FarmProgressBarProps {
  currentStep: number;
  totalSteps: number;
  steps: {
    id: string;
    title: string;
    icon: string;
    description?: string;
  }[];
  variant?: 'planting' | 'growing' | 'harvesting';
}

export const FarmProgressBar: React.FC<FarmProgressBarProps> = ({
  currentStep,
  totalSteps,
  steps,
  variant = 'planting'
}) => {
  const progress = (currentStep / totalSteps) * 100;

  const getStepStatus = (index: number) => {
    if (index < currentStep) return 'completed';
    if (index === currentStep) return 'active';
    return 'pending';
  };

  const getProgressColor = () => {
    switch (variant) {
      case 'planting': return 'from-green-400 to-emerald-600';
      case 'growing': return 'from-yellow-400 to-orange-500';
      case 'harvesting': return 'from-purple-400 to-pink-600';
      default: return 'from-blue-400 to-indigo-600';
    }
  };

  return (
    <div className="w-full">
      {/* Progress Bar */}
      <div className="relative mb-8">
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <motion.div
            className={`h-full bg-gradient-to-r ${getProgressColor()} relative`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          >
            {/* Animated sparkles on progress */}
            <div className="absolute inset-0 flex items-center justify-end pr-1">
              <motion.div
                animate={{ 
                  scale: [1, 1.2, 1],
                  opacity: [0.5, 1, 0.5]
                }}
                transition={{ 
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="w-2 h-2 bg-white rounded-full"
              />
            </div>
          </motion.div>
        </div>

        {/* Growing plants animation */}
        {variant === 'growing' && progress > 0 && (
          <motion.div
            className="absolute top-0 left-0 h-full flex items-center"
            style={{ width: `${progress}%` }}
          >
            <div className="flex justify-around w-full">
              {[...Array(Math.floor(progress / 20))].map((_, i) => (
                <motion.span
                  key={i}
                  initial={{ scale: 0, rotate: 0 }}
                  animate={{ 
                    scale: [0, 1, 1],
                    rotate: [0, -5, 5, 0]
                  }}
                  transition={{ 
                    delay: i * 0.1,
                    duration: 0.5,
                    rotate: {
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }
                  }}
                  className="text-2xl"
                >
                  🌱
                </motion.span>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Steps */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {steps.map((step, index) => {
          const status = getStepStatus(index);
          
          return (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`
                relative p-4 rounded-lg text-center transition-all duration-300
                ${status === 'completed' 
                  ? 'bg-green-50 dark:bg-green-900/20 border-2 border-green-400' 
                  : status === 'active'
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-400 shadow-lg'
                  : 'bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700'
                }
              `}
            >
              {/* Step Icon */}
              <motion.div
                className="text-4xl mb-2"
                animate={status === 'active' ? {
                  scale: [1, 1.1, 1],
                  rotate: [0, -5, 5, 0]
                } : {}}
                transition={{
                  duration: 2,
                  repeat: status === 'active' ? Infinity : 0,
                  ease: "easeInOut"
                }}
              >
                {step.icon}
              </motion.div>

              {/* Step Title */}
              <h4 className={`
                text-sm font-medium mb-1
                ${status === 'completed' 
                  ? 'text-green-700 dark:text-green-300' 
                  : status === 'active'
                  ? 'text-blue-700 dark:text-blue-300'
                  : 'text-gray-600 dark:text-gray-400'
                }
              `}>
                {step.title}
              </h4>

              {/* Step Description */}
              {step.description && (
                <p className={`
                  text-xs
                  ${status === 'completed' 
                    ? 'text-green-600 dark:text-green-400' 
                    : status === 'active'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-500 dark:text-gray-500'
                  }
                `}>
                  {step.description}
                </p>
              )}

              {/* Status Indicator */}
              {status === 'completed' && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center"
                >
                  <span className="text-white text-xs">✓</span>
                </motion.div>
              )}

              {status === 'active' && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="absolute -top-2 -right-2 w-6 h-6"
                >
                  <span className="text-2xl">⚙️</span>
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};