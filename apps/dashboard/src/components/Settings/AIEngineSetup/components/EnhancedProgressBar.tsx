import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

interface ProgressStep {
  id: string;
  name: string;
  status: 'completed' | 'active' | 'pending';
}

interface EnhancedProgressBarProps {
  steps: ProgressStep[];
  currentStep: number;
  totalSteps: number;
}

export const EnhancedProgressBar: React.FC<EnhancedProgressBarProps> = ({
  steps,
  currentStep,
  totalSteps
}) => {
  const progressPercentage = (currentStep / totalSteps) * 100;

  return (
    <div className="relative">
      {/* Progress Bar Background */}
      <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200 dark:bg-gray-700" />
      
      {/* Animated Progress Bar */}
      <motion.div
        className="absolute top-5 left-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500"
        initial={{ width: 0 }}
        animate={{ width: `${progressPercentage}%` }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
      
      {/* Steps */}
      <div className="relative flex justify-between">
        {steps.map((step, index) => (
          <div key={step.id} className="flex flex-col items-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className={`
                relative z-10 w-10 h-10 rounded-full flex items-center justify-center
                transition-all duration-300
                ${step.status === 'completed' 
                  ? 'bg-gradient-to-br from-green-500 to-emerald-500 shadow-lg shadow-green-500/30' 
                  : step.status === 'active'
                  ? 'bg-gradient-to-br from-blue-500 to-purple-500 shadow-lg shadow-blue-500/30'
                  : 'bg-gray-200 dark:bg-gray-700'
                }
              `}
            >
              {step.status === 'completed' ? (
                <CheckCircleIcon className="w-5 h-5 text-white" />
              ) : (
                <span className={`text-sm font-semibold ${
                  step.status === 'active' ? 'text-white' : 'text-gray-500 dark:text-gray-400'
                }`}>
                  {index + 1}
                </span>
              )}
              
              {/* Pulse Animation for Active Step */}
              {step.status === 'active' && (
                <motion.div
                  className="absolute inset-0 rounded-full bg-blue-500"
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  style={{ opacity: 0.3 }}
                />
              )}
            </motion.div>
            
            {/* Step Label */}
            <span className={`
              mt-2 text-xs font-medium text-center max-w-[80px]
              ${step.status === 'completed' 
                ? 'text-green-600 dark:text-green-400' 
                : step.status === 'active'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400'
              }
            `}>
              {step.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};