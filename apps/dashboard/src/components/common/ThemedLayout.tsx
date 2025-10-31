import React from 'react';
import { clsx } from 'clsx';

interface ThemedLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export const ThemedLayout: React.FC<ThemedLayoutProps> = ({ children, className }) => {
  return (
    <div className={clsx(
      'min-h-screen transition-colors duration-300',
      'bg-gradient-to-br from-gray-50 via-gray-50 to-[rgba(var(--color-primary-rgb),0.05)]',
      'dark:from-gray-950 dark:via-gray-950 dark:to-[rgba(var(--color-primary-rgb),0.02)]',
      className
    )}>
      {children}
    </div>
  );
};

export const ThemedHeader: React.FC<ThemedLayoutProps> = ({ children, className }) => {
  return (
    <header className={clsx(
      'sticky top-0 z-50 backdrop-blur-xl transition-colors duration-300',
      'bg-white/80 dark:bg-gray-900/80',
      'border-b border-gray-200 dark:border-gray-800',
      'shadow-sm',
      className
    )}>
      {children}
    </header>
  );
};

export const ThemedCard: React.FC<ThemedLayoutProps> = ({ children, className }) => {
  return (
    <div className={clsx(
      'rounded-lg transition-all duration-300',
      'bg-white dark:bg-gray-900',
      'border border-gray-200 dark:border-gray-800',
      'shadow-sm hover:shadow-md',
      'hover:border-[var(--color-primary)] dark:hover:border-[var(--color-primary)]',
      className
    )}>
      {children}
    </div>
  );
};

export const ThemedButton: React.FC<ThemedLayoutProps & { variant?: 'primary' | 'secondary' }> = ({ 
  children, 
  className, 
  variant = 'primary' 
}) => {
  const baseClasses = 'px-4 py-2 rounded-lg font-medium transition-all duration-200';
  
  const variantClasses = {
    primary: clsx(
      'bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)]',
      'text-white',
      'shadow-sm hover:shadow-lg',
      'hover:shadow-[rgba(var(--color-primary-rgb),0.25)]'
    ),
    secondary: clsx(
      'bg-[rgba(var(--color-primary-rgb),0.1)]',
      'hover:bg-[rgba(var(--color-primary-rgb),0.2)]',
      'text-[var(--color-primary)] dark:text-[var(--color-primary-light)]',
      'border border-[rgba(var(--color-primary-rgb),0.3)]'
    )
  };
  
  return (
    <button className={clsx(baseClasses, variantClasses[variant], className)}>
      {children}
    </button>
  );
};

export const ThemedAccent: React.FC<ThemedLayoutProps> = ({ children, className }) => {
  return (
    <span className={clsx(
      'text-[var(--color-primary)]',
      'dark:text-[var(--color-primary-light)]',
      className
    )}>
      {children}
    </span>
  );
};