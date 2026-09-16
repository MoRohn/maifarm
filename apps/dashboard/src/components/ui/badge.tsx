import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'info' | 'warning';
  size?: 'default' | 'sm' | 'lg';
  children?: React.ReactNode;
}

const badgeVariants = {
  default: 'bg-primary text-primary-foreground shadow hover:bg-primary/80',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  destructive: 'bg-destructive text-destructive-foreground shadow hover:bg-destructive/80',
  outline: 'text-foreground border border-input',
  success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
};

const badgeSizes = {
  default: 'px-2.5 py-0.5 text-xs',
  sm: 'px-2 py-0.5 text-xs',
  lg: 'px-3 py-1 text-sm',
};

export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className = '', variant = 'default', size = 'default', ...props }, ref) => (
    <div
      ref={ref}
      className={`inline-flex items-center rounded-md font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${badgeVariants[variant]} ${badgeSizes[size]} ${className}`}
      {...props}
    />
  )
);
Badge.displayName = 'Badge';