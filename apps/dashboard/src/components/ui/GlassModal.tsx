import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { GlassButton } from './GlassButton';

interface GlassModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showCloseButton?: boolean;
  className?: string;
}

export const GlassModal: React.FC<GlassModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  className
}) => {
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal - with safe area support for notched devices */}
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{
              paddingTop: 'max(env(safe-area-inset-top), 16px)',
              paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
              paddingLeft: 'max(env(safe-area-inset-left), 16px)',
              paddingRight: 'max(env(safe-area-inset-right), 16px)'
            }}
          >
            <motion.div
              className={cn(
                'w-full',
                sizeClasses[size],
                'backdrop-blur-xl bg-gradient-to-br from-gray-900/90 to-gray-800/90',
                'border border-white/20 rounded-3xl',
                'shadow-2xl shadow-blue-500/20',
                'overflow-hidden',
                className
              )}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="relative px-6 py-4 border-b border-white/10">
                <h2 className="text-2xl font-bold text-white pr-10">
                  {title}
                </h2>
                {showCloseButton && (
                  <button
                    onClick={onClose}
                    className={cn(
                      'absolute top-4 right-4',
                      'w-10 h-10 rounded-full',
                      'backdrop-blur-xl bg-white/10 border border-white/20',
                      'flex items-center justify-center',
                      'text-white hover:bg-white/20',
                      'transition-all duration-300',
                      'focus:outline-none focus:ring-4 focus:ring-blue-500/50'
                    )}
                    aria-label="Close modal"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* Content - uses dynamic viewport height for iOS compatibility */}
              <div
                className="px-6 py-6 overflow-y-auto"
                style={{
                  maxHeight: 'calc(var(--full-vh, 90vh) - 120px - env(safe-area-inset-bottom, 0px) - env(safe-area-inset-top, 0px))'
                }}
              >
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};
