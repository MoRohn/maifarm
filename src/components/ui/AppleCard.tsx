import React, { forwardRef } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { clsx } from 'clsx';

interface AppleCardProps extends HTMLMotionProps<"div"> {
  variant?: 'default' | 'elevated' | 'inset' | 'glass';
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  className?: string;
}

export const AppleCard = forwardRef<HTMLDivElement, AppleCardProps>(({
  variant = 'default',
  hover = true,
  padding = 'lg',
  children,
  className,
  ...motionProps
}, ref) => {
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
    xl: 'p-10'
  };

  const variantClasses = {
    default: `
      bg-white dark:bg-gray-900 
      border border-gray-200 dark:border-gray-800
      shadow-sm
    `,
    elevated: `
      bg-white dark:bg-gray-900 
      border border-gray-200 dark:border-gray-800
      shadow-lg
    `,
    inset: `
      bg-gray-50 dark:bg-gray-950
      border border-gray-200 dark:border-gray-800
      shadow-inner
    `,
    glass: `
      bg-white/70 dark:bg-gray-900/70
      backdrop-blur-xl backdrop-saturate-150
      border border-gray-200/50 dark:border-gray-700/50
      shadow-sm
    `
  };

  const hoverClasses = hover ? `
    hover:shadow-lg dark:hover:shadow-2xl
    hover:border-gray-300 dark:hover:border-gray-700
    hover:-translate-y-0.5
    transition-all duration-200 ease-out
  ` : '';

  return (
    <motion.div
      ref={ref}
      className={clsx(
        'rounded-2xl',
        paddingClasses[padding],
        variantClasses[variant],
        hoverClasses,
        className
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      {...motionProps}
    >
      {children}
    </motion.div>
  );
});

AppleCard.displayName = 'AppleCard';

// Specialized card components
export const AppleCardHeader: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, icon, action, className }) => {
  return (
    <div className={clsx('flex items-start justify-between mb-6', className)}>
      <div className="flex items-start space-x-3">
        {icon && (
          <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-xl">
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {title}
          </h3>
          {subtitle && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && (
        <div className="flex-shrink-0">
          {action}
        </div>
      )}
    </div>
  );
};

export const AppleCardContent: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => {
  return (
    <div className={clsx('', className)}>
      {children}
    </div>
  );
};

export const AppleCardFooter: React.FC<{
  children: React.ReactNode;
  className?: string;
  border?: boolean;
}> = ({ children, className, border = true }) => {
  return (
    <div className={clsx(
      'mt-6 pt-6',
      border && 'border-t border-gray-200 dark:border-gray-800',
      className
    )}>
      {children}
    </div>
  );
};