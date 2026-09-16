import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  EyeIcon,
  EyeSlashIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  KeyIcon,
  LockClosedIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

interface SecureApiKeyInputProps {
  value: string;
  onChange?: (value: string) => void;
  onValidate?: (value: string) => Promise<boolean>;
  placeholder?: string;
  label?: string;
  helperText?: string;
  error?: string;
  readOnly?: boolean;
  showStrengthIndicator?: boolean;
  autoFocus?: boolean;
  className?: string;
}

export const SecureApiKeyInput: React.FC<SecureApiKeyInputProps> = ({
  value,
  onChange,
  onValidate,
  placeholder = 'sk-...',
  label = 'API Key',
  helperText,
  error,
  readOnly = false,
  showStrengthIndicator = false,
  autoFocus = false,
  className = ''
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  const copyToClipboard = async () => {
    if (!value) return;
    
    try {
      await navigator.clipboard.writeText(value);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange && !readOnly) {
      onChange(e.target.value);
      setIsValid(null); // Reset validation state on change
    }
  };

  const handleBlur = async () => {
    setIsFocused(false);
    
    if (onValidate && value) {
      setIsValidating(true);
      try {
        const valid = await onValidate(value);
        setIsValid(valid);
      } catch (err) {
        setIsValid(false);
      } finally {
        setIsValidating(false);
      }
    }
  };

  const getKeyStrength = () => {
    if (!value) return 0;
    if (value.length < 20) return 25;
    if (value.length < 30) return 50;
    if (value.length < 40) return 75;
    return 100;
  };

  const getStrengthColor = (strength: number) => {
    if (strength <= 25) return 'bg-red-500';
    if (strength <= 50) return 'bg-orange-500';
    if (strength <= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const maskValue = (val: string) => {
    if (!val || val.length < 11) return val;
    return `${val.substring(0, 7)}${'•'.repeat(Math.min(20, val.length - 11))}${val.substring(val.length - 4)}`;
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          <div className="flex items-center gap-2">
            <KeyIcon className="w-4 h-4" />
            {label}
            {isValidating && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"
              />
            )}
            {isValid === true && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-1 text-green-600 dark:text-green-400"
              >
                <LockClosedIcon className="w-4 h-4" />
                <span className="text-xs">Verified</span>
              </motion.div>
            )}
            {isValid === false && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-1 text-red-600 dark:text-red-400"
              >
                <ExclamationTriangleIcon className="w-4 h-4" />
                <span className="text-xs">Invalid</span>
              </motion.div>
            )}
          </div>
        </label>
      )}

      {/* Input Container */}
      <div className="relative">
        <motion.div
          className={`
            relative rounded-xl overflow-hidden
            ${isFocused ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''}
            ${error ? 'ring-2 ring-red-500 dark:ring-red-400' : ''}
            ${isValid === true ? 'ring-2 ring-green-500 dark:ring-green-400' : ''}
          `}
          animate={{
            boxShadow: isFocused 
              ? '0 0 0 4px rgba(59, 130, 246, 0.1)' 
              : '0 0 0 0px rgba(59, 130, 246, 0)'
          }}
        >
          <input
            ref={inputRef}
            type={isVisible ? 'text' : 'password'}
            value={isVisible ? value : maskValue(value)}
            onChange={handleChange}
            onFocus={() => setIsFocused(true)}
            onBlur={handleBlur}
            placeholder={placeholder}
            readOnly={readOnly}
            className={`
              w-full px-4 py-3 pr-24
              bg-white dark:bg-gray-800
              border border-gray-300 dark:border-gray-600
              rounded-xl
              font-mono text-sm
              text-gray-900 dark:text-gray-100
              placeholder-gray-400 dark:placeholder-gray-500
              focus:outline-none
              transition-all duration-200
              ${readOnly ? 'cursor-default bg-gray-50 dark:bg-gray-900' : ''}
            `}
          />

          {/* Action Buttons */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {/* Visibility Toggle */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={toggleVisibility}
              type="button"
              className={`
                p-2 rounded-lg
                text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200
                hover:bg-gray-100 dark:hover:bg-gray-700
                transition-all duration-200
              `}
            >
              <AnimatePresence mode="wait">
                {isVisible ? (
                  <motion.div
                    key="hide"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <EyeSlashIcon className="w-4 h-4" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="show"
                    initial={{ rotate: 90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <EyeIcon className="w-4 h-4" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>

            {/* Copy Button */}
            {value && (
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={copyToClipboard}
                type="button"
                className={`
                  p-2 rounded-lg
                  text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200
                  hover:bg-gray-100 dark:hover:bg-gray-700
                  transition-all duration-200
                `}
              >
                <AnimatePresence mode="wait">
                  {isCopied ? (
                    <motion.div
                      key="check"
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0, rotate: 180 }}
                      transition={{ duration: 0.2 }}
                    >
                      <CheckIcon className="w-4 h-4 text-green-500" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="clipboard"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ClipboardDocumentIcon className="w-4 h-4" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            )}
          </div>
        </motion.div>

        {/* Strength Indicator */}
        {showStrengthIndicator && value && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">Key Strength</span>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                {getKeyStrength()}%
              </span>
            </div>
            <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                className={`h-full ${getStrengthColor(getKeyStrength())} rounded-full`}
                initial={{ width: 0 }}
                animate={{ width: `${getKeyStrength()}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </motion.div>
        )}
      </div>

      {/* Helper Text or Error */}
      <AnimatePresence mode="wait">
        {error ? (
          <motion.p
            key="error"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1"
          >
            <ExclamationTriangleIcon className="w-4 h-4" />
            {error}
          </motion.p>
        ) : helperText ? (
          <motion.p
            key="helper"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="text-sm text-gray-500 dark:text-gray-400"
          >
            {helperText}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
};