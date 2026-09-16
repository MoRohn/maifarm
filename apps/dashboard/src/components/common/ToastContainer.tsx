import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { useToastStore } from '@/hooks/useToast';
import { Toast } from './Toast';

export const ToastContainer: React.FC = () => {
  const { toasts, hide } = useToastStore();

  return (
    // FIX: Add safe area padding for notched devices (iPhone X+, iPad Pro)
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)'
      }}
    >
      <AnimatePresence mode="sync">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            toast={toast}
            onClose={() => hide(toast.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};