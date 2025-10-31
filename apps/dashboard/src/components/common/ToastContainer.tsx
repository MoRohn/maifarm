import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { useToastStore } from '@/hooks/useToast';
import { Toast } from './Toast';

export const ToastContainer: React.FC = () => {
  const { toasts, hide } = useToastStore();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
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