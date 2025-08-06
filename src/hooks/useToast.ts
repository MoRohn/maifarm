import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  timestamp: Date;
}

interface ToastStore {
  toasts: Toast[];
  show: (message: string, type?: ToastType, options?: { duration?: number; action?: Toast['action'] }) => string;
  hide: (id: string) => void;
  clearAll: () => void;
}

const DEFAULT_DURATION = 4000;

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  
  show: (message, type = 'info', options = {}) => {
    const id = uuidv4();
    const toast: Toast = {
      id,
      message,
      type,
      duration: options.duration ?? DEFAULT_DURATION,
      action: options.action,
      timestamp: new Date(),
    };
    
    set((state) => ({
      toasts: [...state.toasts, toast],
    }));
    
    // Auto-hide after duration
    if (toast.duration && toast.duration > 0) {
      setTimeout(() => {
        get().hide(id);
      }, toast.duration);
    }
    
    return id;
  },
  
  hide: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },
  
  clearAll: () => {
    set({ toasts: [] });
  },
}));

// Hook for easier usage
export const useToast = () => {
  const { show, hide, clearAll } = useToastStore();
  
  return {
    showToast: (message: string, type: ToastType = 'info', options?: { duration?: number; action?: Toast['action'] }) => 
      show(message, type, options),
    success: (message: string, options?: { duration?: number; action?: Toast['action'] }) => 
      show(message, 'success', options),
    error: (message: string, options?: { duration?: number; action?: Toast['action'] }) => 
      show(message, 'error', options),
    warning: (message: string, options?: { duration?: number; action?: Toast['action'] }) => 
      show(message, 'warning', options),
    info: (message: string, options?: { duration?: number; action?: Toast['action'] }) => 
      show(message, 'info', options),
    hide,
    clearAll,
  };
};