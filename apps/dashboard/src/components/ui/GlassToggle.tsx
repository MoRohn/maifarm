import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/utils/cn';

interface GlassToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const GlassToggle: React.FC<GlassToggleProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
  size = 'md',
  className
}) => {
  const sizeClasses = {
    sm: {
      track: 'w-10 h-6',
      thumb: 'w-4 h-4',
      translate: 'translate-x-4'
    },
    md: {
      track: 'w-14 h-7',
      thumb: 'w-5 h-5',
      translate: 'translate-x-7'
    },
    lg: {
      track: 'w-16 h-8',
      thumb: 'w-6 h-6',
      translate: 'translate-x-8'
    }
  };

  const { track, thumb, translate } = sizeClasses[size];

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {label && (
        <label
          className={cn(
            'text-white font-medium select-none',
            disabled && 'opacity-50 cursor-not-allowed',
            !disabled && 'cursor-pointer'
          )}
          onClick={() => !disabled && onChange(!checked)}
        >
          {label}
        </label>
      )}

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          track,
          'relative inline-flex items-center rounded-full',
          'backdrop-blur-xl border transition-all duration-300',
          'focus:outline-none focus:ring-4 focus:ring-blue-500/50',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          checked
            ? 'bg-gradient-to-br from-blue-500 to-purple-600 border-blue-400/30 shadow-lg shadow-blue-500/30'
            : 'bg-white/10 border-white/20 shadow-inner',
          !disabled && 'cursor-pointer'
        )}
      >
        <motion.span
          className={cn(
            thumb,
            'inline-block rounded-full bg-white shadow-lg',
            'ml-1'
          )}
          layout
          transition={{
            type: 'spring',
            stiffness: 700,
            damping: 30
          }}
          animate={{
            x: checked ? `calc(100% + 0.25rem)` : 0
          }}
        />
      </button>
    </div>
  );
};
