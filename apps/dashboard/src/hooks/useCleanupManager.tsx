/**
 * useCleanupManager - React hook for automatic cleanup of resources
 * Prevents memory leaks by ensuring all resources are cleaned up on unmount
 */

import { useEffect, useRef, useCallback } from 'react';
import { CleanupManager } from '@/utils/CleanupManager';

interface UseCleanupManagerOptions {
  /**
   * Enable debug logging of cleanup operations
   */
  debug?: boolean;
  /**
   * Component name for debugging purposes
   */
  componentName?: string;
}

export function useCleanupManager(options: UseCleanupManagerOptions = {}) {
  const { debug = false, componentName = 'Component' } = options;
  const managerRef = useRef<CleanupManager | null>(null);

  // Create manager on first render
  if (!managerRef.current) {
    managerRef.current = new CleanupManager();
  }

  const manager = managerRef.current;

  /**
   * Safe addEventListener wrapper
   */
  const addEventListener = useCallback(
    (
      element: EventTarget,
      event: string,
      handler: EventListener,
      options?: AddEventListenerOptions
    ) => {
      if (debug) {
        console.log(`[${componentName}] Adding event listener: ${event}`);
      }
      manager.addEventListener(element, event, handler, options);
    },
    [manager, debug, componentName]
  );

  /**
   * Safe setTimeout wrapper
   */
  const setTimeout = useCallback(
    (callback: () => void, delay: number) => {
      if (debug) {
        console.log(`[${componentName}] Setting timeout: ${delay}ms`);
      }
      return manager.setTimeout(callback, delay);
    },
    [manager, debug, componentName]
  );

  /**
   * Safe setInterval wrapper
   */
  const setInterval = useCallback(
    (callback: () => void, delay: number) => {
      if (debug) {
        console.log(`[${componentName}] Setting interval: ${delay}ms`);
      }
      return manager.setInterval(callback, delay);
    },
    [manager, debug, componentName]
  );

  /**
   * Add a subscription
   */
  const addSubscription = useCallback(
    (subscription: { unsubscribe: () => void }, name?: string) => {
      if (debug) {
        console.log(`[${componentName}] Adding subscription: ${name || 'unnamed'}`);
      }
      manager.addSubscription(subscription, name);
    },
    [manager, debug, componentName]
  );

  /**
   * Add a custom cleanup function
   */
  const addCleanup = useCallback(
    (cleanupFn: () => void) => {
      if (debug) {
        console.log(`[${componentName}] Adding cleanup function`);
      }
      manager.addCleanup(cleanupFn);
    },
    [manager, debug, componentName]
  );

  /**
   * Create an AbortController for fetch requests
   */
  const createAbortController = useCallback(
    (name?: string) => {
      if (debug) {
        console.log(`[${componentName}] Creating AbortController: ${name || 'unnamed'}`);
      }
      return manager.createAbortController(name);
    },
    [manager, debug, componentName]
  );

  /**
   * Safe requestAnimationFrame wrapper
   */
  const requestAnimationFrame = useCallback(
    (callback: FrameRequestCallback) => {
      if (debug) {
        console.log(`[${componentName}] Requesting animation frame`);
      }
      return manager.requestAnimationFrame(callback);
    },
    [manager, debug, componentName]
  );

  /**
   * Clear a specific timer
   */
  const clearTimer = useCallback(
    (id: NodeJS.Timeout) => {
      if (debug) {
        console.log(`[${componentName}] Clearing timer`);
      }
      manager.clearTimer(id);
    },
    [manager, debug, componentName]
  );

  /**
   * Remove a specific event listener
   */
  const removeEventListener = useCallback(
    (element: EventTarget, event: string, handler: EventListener) => {
      if (debug) {
        console.log(`[${componentName}] Removing event listener: ${event}`);
      }
      manager.removeEventListener(element, event, handler);
    },
    [manager, debug, componentName]
  );

  /**
   * Get current resource statistics
   */
  const getStats = useCallback(() => {
    return manager.getStats();
  }, [manager]);

  /**
   * Manual cleanup trigger (useful for conditional cleanup)
   */
  const cleanup = useCallback(() => {
    if (debug) {
      const stats = manager.getStats();
      console.log(`[${componentName}] Manual cleanup triggered:`, stats);
    }
    manager.cleanup();
  }, [manager, debug, componentName]);

  // Automatic cleanup on unmount
  useEffect(() => {
    return () => {
      if (debug) {
        const stats = manager.getStats();
        console.log(`[${componentName}] Unmounting, cleaning up:`, stats);
      }
      manager.cleanup();
    };
  }, [manager, debug, componentName]);

  return {
    addEventListener,
    setTimeout,
    setInterval,
    addSubscription,
    addCleanup,
    createAbortController,
    requestAnimationFrame,
    clearTimer,
    removeEventListener,
    getStats,
    cleanup,
    manager,
  };
}

/**
 * Higher-order component that provides cleanup management
 */
export function withCleanupManager<P extends object>(
  Component: React.ComponentType<P & { cleanup: ReturnType<typeof useCleanupManager> }>,
  options?: UseCleanupManagerOptions
) {
  return function WithCleanupManagerComponent(props: P) {
    const cleanup = useCleanupManager(options);
    return <Component {...props} cleanup={cleanup} />;
  };
}