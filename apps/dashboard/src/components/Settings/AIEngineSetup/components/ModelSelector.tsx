import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircleIcon, InformationCircleIcon } from '@heroicons/react/24/solid';
import { SparklesIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import type { ModelOption } from '../wizardTypes';

interface ModelSelectorProps {
  /**
   * Available model options
   */
  options: ModelOption[];

  /**
   * Currently selected model ID
   */
  value: string;

  /**
   * Callback when selection changes
   */
  onChange: (modelId: string) => void;

  /**
   * Optional label for the selector
   */
  label?: string;

  /**
   * Optional description text
   */
  description?: string;

  /**
   * Color theme (matches provider colors)
   */
  colorScheme?: 'purple' | 'blue' | 'emerald' | 'orange';

  /**
   * Whether the selector is disabled
   */
  disabled?: boolean;

  /**
   * Show features list for each option
   */
  showFeatures?: boolean;

  /**
   * Show context window information
   */
  showContextWindow?: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  options,
  value,
  onChange,
  label = 'Select Model',
  description,
  colorScheme = 'purple',
  disabled = false,
  showFeatures = true,
  showContextWindow = false,
}) => {
  const colorClasses = {
    purple: {
      selected: 'border-purple-500 bg-purple-50 text-purple-900 dark:border-purple-400 dark:bg-purple-900/20 dark:text-purple-100',
      unselected: 'border-gray-300 bg-white text-gray-800 hover:border-purple-300 hover:bg-purple-50/40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:border-purple-400 dark:hover:bg-purple-900/10',
      badge: 'bg-purple-500 text-white',
      recommended: 'text-purple-600 dark:text-purple-400',
      focus: 'focus-visible:ring-purple-500',
    },
    blue: {
      selected: 'border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-100',
      unselected: 'border-gray-300 bg-white text-gray-800 hover:border-blue-300 hover:bg-blue-50/40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:border-blue-400 dark:hover:bg-blue-900/10',
      badge: 'bg-blue-500 text-white',
      recommended: 'text-blue-600 dark:text-blue-400',
      focus: 'focus-visible:ring-blue-500',
    },
    emerald: {
      selected: 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-900/20 dark:text-emerald-100',
      unselected: 'border-gray-300 bg-white text-gray-800 hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:border-emerald-400 dark:hover:bg-emerald-900/10',
      badge: 'bg-emerald-500 text-white',
      recommended: 'text-emerald-600 dark:text-emerald-400',
      focus: 'focus-visible:ring-emerald-500',
    },
    orange: {
      selected: 'border-orange-500 bg-orange-50 text-orange-900 dark:border-orange-400 dark:bg-orange-900/20 dark:text-orange-100',
      unselected: 'border-gray-300 bg-white text-gray-800 hover:border-orange-300 hover:bg-orange-50/40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:border-orange-400 dark:hover:bg-orange-900/10',
      badge: 'bg-orange-500 text-white',
      recommended: 'text-orange-600 dark:text-orange-400',
      focus: 'focus-visible:ring-orange-500',
    },
  };

  const colors = colorClasses[colorScheme];

  return (
    <div className="space-y-4">
      {label && (
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {label}
          </h3>
          {description && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {description}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        {options.map((option) => {
          const isSelected = value === option.id;

          return (
            <motion.button
              key={option.id}
              type="button"
              onClick={() => !disabled && onChange(option.id)}
              disabled={disabled}
              className={clsx(
                'w-full rounded-xl border px-4 py-3 text-left text-sm transition',
                'focus-visible:outline-none focus-visible:ring-2',
                colors.focus,
                'disabled:opacity-50 disabled:cursor-not-allowed',
                isSelected ? colors.selected : colors.unselected
              )}
              whileHover={!disabled ? { scale: 1.01 } : undefined}
              whileTap={!disabled ? { scale: 0.99 } : undefined}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Model name with recommended badge */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">
                      {option.label}
                    </span>

                    {option.recommended && (
                      <span className={clsx(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                        colors.recommended,
                        'bg-current/10'
                      )}>
                        <SparklesIcon className="h-3 w-3" />
                        Recommended
                      </span>
                    )}

                    {isSelected && (
                      <span className={clsx(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                        colors.badge
                      )}>
                        <CheckCircleIcon className="h-3 w-3" />
                        Selected
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  {option.description && (
                    <p className="mt-1 text-xs opacity-80">
                      {option.description}
                    </p>
                  )}

                  {/* Context window */}
                  {showContextWindow && option.contextWindow && (
                    <div className="mt-2 flex items-center gap-1 text-xs opacity-70">
                      <InformationCircleIcon className="h-3.5 w-3.5" />
                      <span>{option.contextWindow.toLocaleString()} token context window</span>
                    </div>
                  )}

                  {/* Features */}
                  {showFeatures && option.features && option.features.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {option.features.map((feature) => (
                        <span
                          key={feature}
                          className="inline-flex items-center rounded-md bg-gray-900/5 px-2 py-0.5 text-xs text-gray-600 dark:bg-white/5 dark:text-gray-300"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Helper text */}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        You can change the model later from the AI Engine settings.
      </p>
    </div>
  );
};
