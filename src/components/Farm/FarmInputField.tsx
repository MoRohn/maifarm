import React, { useState, useRef, KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { clsx } from 'clsx';

interface FarmInputFieldProps {
  placeholder?: string;
  onSubmit: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  minLength?: number;
  showCharacterCount?: boolean;
  submitButtonText?: string;
  variant?: 'inline' | 'textarea';
  className?: string;
}

export const FarmInputField: React.FC<FarmInputFieldProps> = ({
  placeholder = "Describe what you want to task the AI agent farm with...",
  onSubmit,
  disabled = false,
  autoFocus = true,
  minLength = 5,
  showCharacterCount = true,
  submitButtonText = "Send",
  variant = 'inline',
  className = ""
}) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const trimmedLength = value.trim().length;
  const isValid = trimmedLength >= minLength;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (!isValid || disabled) return;
    
    onSubmit(value.trim());
    setValue('');
    
    // Refocus after submit
    if (variant === 'inline') {
      inputRef.current?.focus();
    } else {
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // Only handle Enter for inline variant, textarea uses Shift+Enter
    if (variant === 'inline' && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (variant === 'textarea' && e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const baseInputStyles = "w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-all duration-200";

  if (variant === 'textarea') {
    return (
      <div className={clsx("space-y-2", className)}>
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            autoFocus={autoFocus}
            rows={3}
            className={clsx(
              baseInputStyles,
              "resize-none pr-12",
              !isValid && trimmedLength > 0 && "border-yellow-500 dark:border-yellow-400"
            )}
          />
          {showCharacterCount && trimmedLength > 0 && (
            <div className="absolute bottom-2 right-2 text-xs">
              <span className={clsx(
                "font-medium",
                !isValid 
                  ? "text-yellow-600 dark:text-yellow-400" 
                  : "text-gray-500 dark:text-gray-400"
              )}>
                {trimmedLength}/{minLength}
              </span>
            </div>
          )}
        </div>
        
        {trimmedLength > 0 && !isValid && (
          <p className="text-xs text-yellow-600 dark:text-yellow-400">
            Please add {minLength - trimmedLength} more character{minLength - trimmedLength !== 1 ? 's' : ''} for a better description
          </p>
        )}
        
        <button
          onClick={handleSubmit}
          disabled={!isValid || disabled}
          className={clsx(
            "w-full px-6 py-3 rounded-lg font-medium transition-all duration-200",
            "flex items-center justify-center space-x-2",
            isValid && !disabled
              ? "bg-blue-600 dark:bg-blue-500 text-white hover:bg-blue-700 dark:hover:bg-blue-600 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
              : "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
          )}
        >
          <Send className="w-4 h-4" />
          <span>Continue</span>
        </button>
      </div>
    );
  }

  // Inline variant (for chat-style input)
  return (
    <form onSubmit={handleSubmit} className={clsx("flex items-center space-x-2", className)}>
      <div className="relative flex-1">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className={clsx(
            baseInputStyles,
            "pr-20",
            !isValid && trimmedLength > 0 && "border-yellow-500 dark:border-yellow-400"
          )}
        />
        {showCharacterCount && trimmedLength > 0 && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
            <span className={clsx(
              "text-xs font-medium",
              !isValid 
                ? "text-yellow-600 dark:text-yellow-400" 
                : "text-gray-500 dark:text-gray-400"
            )}>
              {trimmedLength}/{minLength}
            </span>
          </div>
        )}
      </div>
      
      <button
        type="submit"
        disabled={!isValid || disabled}
        className={clsx(
          "px-6 py-3 rounded-lg font-medium transition-all duration-200",
          "flex items-center space-x-2 whitespace-nowrap",
          isValid && !disabled
            ? "bg-green-600 dark:bg-green-500 text-white hover:bg-green-700 dark:hover:bg-green-600 shadow-lg transform hover:scale-105"
            : "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
        )}
      >
        <Send className="w-4 h-4" />
        <span>{submitButtonText}</span>
      </button>
    </form>
  );
};