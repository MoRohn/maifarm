import { useToastStore } from './useToast';

export const useToast = () => {
  const { show, hide, clearAll } = useToastStore();
  
  return {
    success: (message: string, options?: { duration?: number; action?: any }) => 
      show(message, 'success', options),
    error: (message: string, options?: { duration?: number; action?: any }) => 
      show(message, 'error', options),
    warning: (message: string, options?: { duration?: number; action?: any }) => 
      show(message, 'warning', options),
    info: (message: string, options?: { duration?: number; action?: any }) => 
      show(message, 'info', options),
    show,
    hide,
    clearAll,
  };
};