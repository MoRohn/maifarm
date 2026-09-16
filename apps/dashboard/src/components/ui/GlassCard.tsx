import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/utils/cn';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className,
  hover = false,
  onClick
}) => {
  const isInteractive = onClick || hover;

  return (
    <motion.div
      className={cn(
        'backdrop-blur-xl',
        'bg-white/10 dark:bg-gray-800/10',
        'border border-white/20 dark:border-gray-700/20',
        'rounded-2xl p-6',
        isInteractive && 'cursor-pointer',
        hover && 'hover:bg-white/20 dark:hover:bg-gray-700/20',
        'transition-all duration-300',
        className
      )}
      onClick={onClick}
      whileHover={isInteractive ? { scale: 1.02 } : undefined}
      whileTap={isInteractive ? { scale: 0.98 } : undefined}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      {children}
    </motion.div>
  );
};
