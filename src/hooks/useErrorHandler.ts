import { useCallback, useEffect, useState } from 'react';
import { errorHandler, ErrorReport } from '../services/errorHandler';
import { logger } from '../services/monitoring/logger';

interface UseErrorHandlerOptions {
  component?: string;
  autoRecover?: boolean;
  maxRetries?: number;
}

export const useErrorHandler = (options?: UseErrorHandlerOptions) => {
  const [errors, setErrors] = useState<ErrorReport[]>([]);
  const [isRecovering, setIsRecovering] = useState(false);

  useEffect(() => {
    // Subscribe to error updates
    const unsubscribe = errorHandler.subscribe((error) => {
      setErrors(prev => [...prev, error]);
    });

    return unsubscribe;
  }, []);

  const logError = useCallback((
    error: Error | string,
    action?: string,
    severity?: ErrorReport['severity']
  ) => {
    const errorId = errorHandler.logError(
      error,
      {
        component: options?.component,
        action,
      },
      severity
    );

    logger.error(
      options?.component || 'Component',
      typeof error === 'string' ? error : error.message,
      { action }
    );

    return errorId;
  }, [options?.component]);

  const handleAsyncError = useCallback(async <T,>(
    asyncFn: () => Promise<T>,
    errorMessage?: string
  ): Promise<T | null> => {
    try {
      return await asyncFn();
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(errorMessage || 'Async operation failed'),
        'async-operation'
      );
      return null;
    }
  }, [logError]);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const retryWithErrorHandling = useCallback(async <T,>(
    fn: () => Promise<T>,
    retries = options?.maxRetries || 3
  ): Promise<T | null> => {
    setIsRecovering(true);
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        const result = await fn();
        setIsRecovering(false);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        logger.warn(
          options?.component || 'Component',
          `Retry attempt ${i + 1}/${retries} failed`,
          { error: lastError.message }
        );
        
        if (i < retries - 1) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
      }
    }

    setIsRecovering(false);
    if (lastError) {
      logError(lastError, 'retry-failed', 'high');
    }
    return null;
  }, [options?.component, options?.maxRetries, logError]);

  return {
    errors,
    isRecovering,
    logError,
    handleAsyncError,
    clearErrors,
    retryWithErrorHandling,
    errorCount: errors.length,
    hasErrors: errors.length > 0,
    latestError: errors[errors.length - 1]
  };
};

// Hook for handling specific error types
export const useAPIErrorHandler = () => {
  const { logError, retryWithErrorHandling } = useErrorHandler({
    component: 'API',
    maxRetries: 3
  });

  const handleAPIError = useCallback((
    error: any,
    endpoint: string,
    method: string
  ) => {
    errorHandler.handleAPIError(error, endpoint, method);
  }, []);

  const fetchWithErrorHandling = useCallback(async <T,>(
    url: string,
    options?: RequestInit
  ): Promise<T | null> => {
    return retryWithErrorHandling(async () => {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const error = new Error(`API Error: ${response.status} ${response.statusText}`);
        (error as any).status = response.status;
        (error as any).statusText = response.statusText;
        throw error;
      }

      return response.json();
    });
  }, [retryWithErrorHandling]);

  return {
    handleAPIError,
    fetchWithErrorHandling
  };
};

// Hook for handling WebSocket errors
export const useWebSocketErrorHandler = () => {
  const { logError } = useErrorHandler({
    component: 'WebSocket'
  });

  const handleWebSocketError = useCallback((
    error: Error | Event,
    retryCallback?: () => void
  ) => {
    errorHandler.handleWebSocketError(error, retryCallback);
  }, []);

  return {
    handleWebSocketError
  };
};