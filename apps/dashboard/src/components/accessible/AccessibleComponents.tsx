/**
 * AccessibleComponents - WCAG 2.1 AA compliant components
 * Fully accessible UI components for iOS App Store requirements
 */

import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/utils/cn';
import {
  buildAriaAttributes,
  handleKeyboardNavigation,
  announcer,
  focusManager,
  generateAccessibleId,
  prefersReducedMotion,
  KEYS,
  type AriaAttributes,
} from '@/utils/accessibility';

/**
 * Accessible Button Component
 */
interface AccessibleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  ariaLabel?: string;
  ariaPressed?: boolean;
  ariaExpanded?: boolean;
  ariaControls?: string;
  announceOnClick?: string;
}

export const AccessibleButton = memo<AccessibleButtonProps>(({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  ariaLabel,
  ariaPressed,
  ariaExpanded,
  ariaControls,
  announceOnClick,
  disabled,
  onClick,
  className,
  ...props
}) => {
  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (announceOnClick) {
      announcer.announce(announceOnClick);
    }
    onClick?.(e);
  }, [onClick, announceOnClick]);

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg',
  };

  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500 dark:bg-gray-700 dark:text-white',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    ghost: 'bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 focus:ring-gray-500',
  };

  const ariaAttrs = buildAriaAttributes({
    label: ariaLabel || (typeof children === 'string' ? children : undefined),
    pressed: ariaPressed,
    expanded: ariaExpanded,
    controls: ariaControls,
    disabled: disabled || loading,
  });

  const reducedMotion = prefersReducedMotion();

  return (
    <motion.button
      whileHover={!reducedMotion && !disabled && !loading ? { scale: 1.02 } : {}}
      whileTap={!reducedMotion && !disabled && !loading ? { scale: 0.98 } : {}}
      className={cn(
        'relative inline-flex items-center justify-center font-medium rounded-lg',
        'transition-colors duration-200',
        'focus:outline-none focus:ring-2 focus:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
      disabled={disabled || loading}
      onClick={handleClick}
      {...ariaAttrs}
      {...props}
    >
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full"
            aria-label="Loading"
          />
        </span>
      )}
      <span className={cn('flex items-center gap-2', loading && 'opacity-0')}>
        {icon && <span aria-hidden="true">{icon}</span>}
        {children}
      </span>
    </motion.button>
  );
});

AccessibleButton.displayName = 'AccessibleButton';

/**
 * Accessible Modal/Dialog Component
 */
interface AccessibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnEscape?: boolean;
  closeOnOverlay?: boolean;
}

export const AccessibleModal: React.FC<AccessibleModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  closeOnEscape = true,
  closeOnOverlay = true,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(generateAccessibleId('modal-title')).current;
  const descId = useRef(generateAccessibleId('modal-desc')).current;
  const [cleanupFocus, setCleanupFocus] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (isOpen && modalRef.current) {
      // Save and trap focus
      focusManager.saveFocus();
      const cleanup = focusManager.trapFocus(modalRef.current);
      setCleanupFocus(() => cleanup);

      // Announce modal opening
      announcer.announce(`${title} dialog opened`);

      // Handle escape key
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === KEYS.ESCAPE && closeOnEscape) {
          onClose();
        }
      };

      document.addEventListener('keydown', handleEscape);

      return () => {
        document.removeEventListener('keydown', handleEscape);
        cleanup();
        focusManager.restoreFocus();
      };
    }
  }, [isOpen, title, onClose, closeOnEscape]);

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  const reducedMotion = prefersReducedMotion();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={closeOnOverlay ? onClose : undefined}
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            ref={modalRef}
            initial={reducedMotion ? {} : { opacity: 0, scale: 0.95, y: 20 }}
            animate={reducedMotion ? {} : { opacity: 1, scale: 1, y: 0 }}
            exit={reducedMotion ? {} : { opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
            className={cn(
              'fixed left-1/2 top-1/2 z-50',
              '-translate-x-1/2 -translate-y-1/2',
              'w-full p-4',
              sizeClasses[size]
            )}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 id={titleId} className="text-xl font-semibold text-gray-900 dark:text-white">
                  {title}
                </h2>
                <AccessibleButton
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  ariaLabel="Close dialog"
                  className="rounded-full p-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </AccessibleButton>
              </div>

              {/* Description */}
              {description && (
                <p id={descId} className="px-6 pt-4 text-sm text-gray-600 dark:text-gray-400">
                  {description}
                </p>
              )}

              {/* Content */}
              <div className="p-6">
                {children}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

/**
 * Accessible Form Input Component
 */
interface AccessibleInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
  required?: boolean;
}

export const AccessibleInput = memo<AccessibleInputProps>(({
  label,
  error,
  helperText,
  required,
  id,
  className,
  ...props
}) => {
  const inputId = id || generateAccessibleId('input');
  const errorId = error ? generateAccessibleId('error') : undefined;
  const helperId = helperText ? generateAccessibleId('helper') : undefined;

  const ariaAttrs = buildAriaAttributes({
    invalid: !!error,
    describedBy: [errorId, helperId].filter(Boolean).join(' ') || undefined,
  });

  return (
    <div className="space-y-1">
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        {label}
        {required && (
          <span className="ml-1 text-red-500" aria-label="required">
            *
          </span>
        )}
      </label>

      <input
        id={inputId}
        className={cn(
          'w-full px-3 py-2 border rounded-lg',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
          'disabled:bg-gray-100 disabled:cursor-not-allowed dark:disabled:bg-gray-800',
          error
            ? 'border-red-500 text-red-900 dark:text-red-400'
            : 'border-gray-300 dark:border-gray-600',
          'bg-white dark:bg-gray-900 text-gray-900 dark:text-white',
          className
        )}
        required={required}
        {...ariaAttrs}
        {...props}
      />

      {helperText && !error && (
        <p id={helperId} className="text-sm text-gray-600 dark:text-gray-400">
          {helperText}
        </p>
      )}

      {error && (
        <p id={errorId} className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

AccessibleInput.displayName = 'AccessibleInput';

/**
 * Accessible Navigation Menu
 */
interface NavItem {
  id: string;
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  badge?: string | number;
}

interface AccessibleNavProps {
  items: NavItem[];
  activeId?: string;
  orientation?: 'horizontal' | 'vertical';
  ariaLabel?: string;
}

export const AccessibleNav: React.FC<AccessibleNavProps> = ({
  items,
  activeId,
  orientation = 'horizontal',
  ariaLabel = 'Main navigation',
}) => {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const currentIndex = focusedIndex === -1 ? 0 : focusedIndex;

    handleKeyboardNavigation(e, {
      onArrowLeft: orientation === 'horizontal' ? () => {
        const newIndex = currentIndex === 0 ? items.length - 1 : currentIndex - 1;
        setFocusedIndex(newIndex);
      } : undefined,
      onArrowRight: orientation === 'horizontal' ? () => {
        const newIndex = (currentIndex + 1) % items.length;
        setFocusedIndex(newIndex);
      } : undefined,
      onArrowUp: orientation === 'vertical' ? () => {
        const newIndex = currentIndex === 0 ? items.length - 1 : currentIndex - 1;
        setFocusedIndex(newIndex);
      } : undefined,
      onArrowDown: orientation === 'vertical' ? () => {
        const newIndex = (currentIndex + 1) % items.length;
        setFocusedIndex(newIndex);
      } : undefined,
      onHome: () => setFocusedIndex(0),
      onEnd: () => setFocusedIndex(items.length - 1),
    });
  }, [focusedIndex, items.length, orientation]);

  return (
    <nav
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex',
        orientation === 'horizontal' ? 'flex-row space-x-1' : 'flex-col space-y-1'
      )}
    >
      {items.map((item, index) => {
        const isActive = item.id === activeId;
        const isFocused = index === focusedIndex;

        return (
          <a
            key={item.id}
            href={item.href}
            onClick={item.onClick}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-blue-500',
              isActive
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800',
              'text-gray-700 dark:text-gray-300'
            )}
            aria-current={isActive ? 'page' : undefined}
            tabIndex={isFocused ? 0 : -1}
            onFocus={() => setFocusedIndex(index)}
          >
            {item.icon && <span aria-hidden="true">{item.icon}</span>}
            <span>{item.label}</span>
            {item.badge && (
              <span className="ml-auto px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                {item.badge}
              </span>
            )}
          </a>
        );
      })}
    </nav>
  );
};

/**
 * Accessible Loading Spinner
 */
interface AccessibleSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

export const AccessibleSpinner: React.FC<AccessibleSpinnerProps> = ({
  size = 'md',
  label = 'Loading',
  className,
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn('flex items-center justify-center', className)}
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className={cn(
          'border-2 border-blue-600 border-t-transparent rounded-full',
          sizeClasses[size]
        )}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
};

/**
 * Skip to main content link
 */
export const SkipToContent: React.FC<{ href?: string }> = ({ href = '#main' }) => {
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded"
    >
      Skip to main content
    </a>
  );
};