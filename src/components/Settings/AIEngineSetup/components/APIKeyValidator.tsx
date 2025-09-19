import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EyeIcon, EyeSlashIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

interface APIKeyValidatorProps {
  provider: 'claude' | 'openai' | 'qwen';
  value: string;
  onChange: (value: string) => void;
  onValidate: () => Promise<boolean>;
  placeholder?: string;
  helpText?: string;
  farmTheme?: boolean;
}

export const APIKeyValidator: React.FC<APIKeyValidatorProps> = ({
  provider,
  value,
  onChange,
  onValidate,
  placeholder = 'Enter your API key',
  helpText,
  farmTheme = true
}) => {
  const [showKey, setShowKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [validationMessage, setValidationMessage] = useState('');

  const getProviderPrefix = () => {
    switch (provider) {
      case 'claude': return 'sk-ant-';
      case 'openai': return 'sk-';
      case 'qwen': return 'sk-';
      default: return '';
    }
  };

  const getFarmMetaphor = () => {
    switch (provider) {
      case 'claude': return { icon: '🌾', message: 'Plant your Claude seeds' };
      case 'openai': return { icon: '🚜', message: 'Fuel your GPT tractor' };
      case 'qwen': return { icon: '🌱', message: 'Cultivate your Qwen garden' };
      default: return { icon: '🔑', message: 'Enter your key' };
    }
  };

  const handleValidation = async () => {
    if (!value) {
      setValidationStatus('invalid');
      setValidationMessage('Please enter an API key');
      return;
    }

    const prefix = getProviderPrefix();
    if (prefix && !value.startsWith(prefix)) {
      setValidationStatus('invalid');
      setValidationMessage(`Key should start with "${prefix}"`);
      return;
    }

    setIsValidating(true);
    setValidationStatus('idle');
    
    try {
      const isValid = await onValidate();
      setValidationStatus(isValid ? 'valid' : 'invalid');
      
      if (isValid) {
        setValidationMessage(farmTheme ? '🎉 Your field is ready for planting!' : 'API key validated successfully');
      } else {
        setValidationMessage(farmTheme ? '🌾 Unable to connect to the field' : 'Invalid API key');
      }
    } catch (error) {
      setValidationStatus('invalid');
      setValidationMessage(farmTheme ? '⛈️ Storm prevented connection' : 'Validation failed');
    } finally {
      setIsValidating(false);
    }
  };

  const farmMetaphor = getFarmMetaphor();

  return (
    <div className="space-y-4">
      {farmTheme && (
        <div className="flex items-center gap-3 mb-4">
          <motion.span
            animate={{ rotate: [0, -10, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-3xl"
          >
            {farmMetaphor.icon}
          </motion.span>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {farmMetaphor.message}
          </p>
        </div>
      )}

      <div className="relative">
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setValidationStatus('idle');
            }}
            placeholder={placeholder}
            className={`
              w-full px-4 py-3 pr-24 rounded-lg
              bg-white dark:bg-gray-800
              border-2 transition-all duration-200
              ${validationStatus === 'valid' 
                ? 'border-green-400 focus:border-green-500' 
                : validationStatus === 'invalid'
                ? 'border-red-400 focus:border-red-500'
                : 'border-gray-300 dark:border-gray-600 focus:border-blue-400'
              }
              focus:outline-none focus:ring-2 focus:ring-opacity-50
              ${validationStatus === 'valid' 
                ? 'focus:ring-green-400' 
                : validationStatus === 'invalid'
                ? 'focus:ring-red-400'
                : 'focus:ring-blue-400'
              }
              text-gray-900 dark:text-white
              placeholder-gray-400 dark:placeholder-gray-500
            `}
          />

          {/* Eye icon to toggle visibility */}
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-12 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {showKey ? (
              <EyeSlashIcon className="w-5 h-5" />
            ) : (
              <EyeIcon className="w-5 h-5" />
            )}
          </button>

          {/* Status icon */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <AnimatePresence mode="wait">
              {isValidating ? (
                <motion.div
                  key="validating"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1, rotate: 360 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ rotate: { duration: 1, repeat: Infinity, ease: "linear" } }}
                >
                  <span className="text-xl">⚙️</span>
                </motion.div>
              ) : validationStatus === 'valid' ? (
                <motion.div
                  key="valid"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                >
                  <CheckCircleIcon className="w-6 h-6 text-green-500" />
                </motion.div>
              ) : validationStatus === 'invalid' ? (
                <motion.div
                  key="invalid"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                >
                  <XCircleIcon className="w-6 h-6 text-red-500" />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        {/* Help text */}
        {helpText && validationStatus === 'idle' && (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {helpText}
          </p>
        )}

        {/* Validation message */}
        <AnimatePresence>
          {validationMessage && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`
                mt-2 text-sm
                ${validationStatus === 'valid' 
                  ? 'text-green-600 dark:text-green-400' 
                  : 'text-red-600 dark:text-red-400'
                }
              `}
            >
              {validationMessage}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Validate button */}
      <button
        onClick={handleValidation}
        disabled={!value || isValidating}
        className={`
          w-full py-3 px-4 rounded-lg font-medium
          transition-all duration-200 transform
          ${!value || isValidating
            ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
            : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 hover:scale-[1.02] shadow-lg hover:shadow-xl'
          }
        `}
      >
        {isValidating ? (
          <span className="flex items-center justify-center gap-2">
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            >
              🌾
            </motion.span>
            Checking your field...
          </span>
        ) : farmTheme ? (
          'Test Connection to Field 🚜'
        ) : (
          'Validate API Key'
        )}
      </button>
    </div>
  );
};