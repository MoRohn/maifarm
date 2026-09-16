import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/utils/cn';
import { Loader2 } from 'lucide-react';

interface GlassButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  type?: 'button' | 'submit' | 'reset';
  fullWidth?: boolean;
  className?: string;
}

export const GlassButton: React.FC<GlassButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  disabled = false,
  loading = false,
  icon,
  type = 'button',
  fullWidth = false,
  className
}) => {
  const baseClasses = cn(
    'backdrop-blur-xl border rounded-xl',
    'font-medium transition-all duration-300',
    'flex items-center justify-center gap-2',
    'focus:outline-none focus:ring-4',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    fullWidth && 'w-full'
  );

  const variantClasses = {
    primary: cn(
      'bg-gradient-to-br from-blue-500 to-purple-600',
      'border-blue-400/30',
      'text-white shadow-lg shadow-blue-500/30',
      'hover:shadow-xl hover:shadow-blue-500/40',
      'focus:ring-blue-500/50'
    ),
    secondary: cn(
      'bg-white/10 border-white/20',
      'text-white shadow-lg shadow-gray-500/10',
      'hover:bg-white/20 hover:shadow-gray-500/20',
      'focus:ring-white/30'
    ),
    ghost: cn(
      'bg-white/10 border-white/20',
      '!text-gray-900 dark:!text-white font-medium shadow-md',
      'hover:bg-white/15 hover:border-white/30 hover:!text-gray-950 dark:hover:!text-white/90',
      'focus:ring-white/30'
    ),
    danger: cn(
      'bg-gradient-to-br from-red-500 to-pink-600',
      'border-red-400/30',
      'text-white shadow-lg shadow-red-500/30',
      'hover:shadow-xl hover:shadow-red-500/40',
      'focus:ring-red-500/50'
    ),
    success: cn(
      'bg-gradient-to-br from-green-500 to-emerald-600',
      'border-green-400/30',
      'text-white shadow-lg shadow-green-500/30',
      'hover:shadow-xl hover:shadow-green-500/40',
      'focus:ring-green-500/50'
    )
  };

  const sizeClasses = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg'
  };

  const isDisabled = disabled || loading;

  return (
    <motion.button
      type={type}
      className={cn(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      onClick={onClick}
      disabled={isDisabled}
      whileHover={!isDisabled ? { scale: 1.05 } : undefined}
      whileTap={!isDisabled ? { scale: 0.95 } : undefined}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading...</span>
        </>
      ) : (
        <>
          {icon && <span className="inline-flex">{icon}</span>}
          {children}
        </>
      )}
    </motion.button>
  );
};
