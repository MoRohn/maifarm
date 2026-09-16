/**
 * CleanupManager - Centralized cleanup utility for preventing memory leaks
 * Manages event listeners, timers, subscriptions, and other resources
 */

type CleanupFunction = () => void;
type TimerType = 'timeout' | 'interval';

interface ManagedListener {
  element: EventTarget;
  event: string;
  handler: EventListener;
  options?: AddEventListenerOptions;
}

interface ManagedTimer {
  id: NodeJS.Timeout;
  type: TimerType;
  callback: () => void;
}

interface ManagedSubscription {
  unsubscribe: () => void;
  name?: string;
}

interface ManagedAbortController {
  controller: AbortController;
  name?: string;
}

export class CleanupManager {
  private listeners: ManagedListener[] = [];
  private timers: ManagedTimer[] = [];
  private subscriptions: ManagedSubscription[] = [];
  private cleanupFunctions: CleanupFunction[] = [];
  private abortControllers: ManagedAbortController[] = [];
  private rafHandles: number[] = [];
  private disposed = false;

  /**
   * Add an event listener that will be automatically cleaned up
   */
  addEventListener(
    element: EventTarget,
    event: string,
    handler: EventListener,
    options?: AddEventListenerOptions
  ): void {
    if (this.disposed) {
      console.warn('CleanupManager: Cannot add listener after disposal');
      return;
    }

    element.addEventListener(event, handler, options);
    this.listeners.push({ element, event, handler, options });
  }

  /**
   * Create a managed setTimeout that will be automatically cleared
   */
  setTimeout(callback: () => void, delay: number): NodeJS.Timeout {
    if (this.disposed) {
      console.warn('CleanupManager: Cannot set timeout after disposal');
      return setTimeout(() => {}, 0);
    }

    const id = setTimeout(() => {
      callback();
      // Remove from tracked timers after execution
      this.timers = this.timers.filter(t => t.id !== id);
    }, delay);

    this.timers.push({ id, type: 'timeout', callback });
    return id;
  }

  /**
   * Create a managed setInterval that will be automatically cleared
   */
  setInterval(callback: () => void, delay: number): NodeJS.Timeout {
    if (this.disposed) {
      console.warn('CleanupManager: Cannot set interval after disposal');
      return setInterval(() => {}, delay);
    }

    const id = setInterval(callback, delay);
    this.timers.push({ id, type: 'interval', callback });
    return id;
  }

  /**
   * Add a subscription that will be automatically unsubscribed
   */
  addSubscription(subscription: { unsubscribe: () => void }, name?: string): void {
    if (this.disposed) {
      console.warn('CleanupManager: Cannot add subscription after disposal');
      return;
    }

    this.subscriptions.push({ unsubscribe: subscription.unsubscribe, name });
  }

  /**
   * Add a custom cleanup function
   */
  addCleanup(cleanupFn: CleanupFunction): void {
    if (this.disposed) {
      console.warn('CleanupManager: Cannot add cleanup function after disposal');
      return;
    }

    this.cleanupFunctions.push(cleanupFn);
  }

  /**
   * Create a managed AbortController for fetch requests
   */
  createAbortController(name?: string): AbortController {
    const controller = new AbortController();
    this.abortControllers.push({ controller, name });
    return controller;
  }

  /**
   * Create a managed requestAnimationFrame
   */
  requestAnimationFrame(callback: FrameRequestCallback): number {
    if (this.disposed) {
      console.warn('CleanupManager: Cannot request animation frame after disposal');
      return 0;
    }

    const handle = window.requestAnimationFrame((time) => {
      callback(time);
      // Remove from tracked handles after execution
      this.rafHandles = this.rafHandles.filter(h => h !== handle);
    });

    this.rafHandles.push(handle);
    return handle;
  }

  /**
   * Clear a specific timer manually
   */
  clearTimer(id: NodeJS.Timeout): void {
    const timerIndex = this.timers.findIndex(t => t.id === id);
    if (timerIndex !== -1) {
      const timer = this.timers[timerIndex];
      if (timer.type === 'timeout') {
        clearTimeout(id);
      } else {
        clearInterval(id);
      }
      this.timers.splice(timerIndex, 1);
    }
  }

  /**
   * Remove a specific event listener manually
   */
  removeEventListener(
    element: EventTarget,
    event: string,
    handler: EventListener
  ): void {
    const listenerIndex = this.listeners.findIndex(
      l => l.element === element && l.event === event && l.handler === handler
    );

    if (listenerIndex !== -1) {
      const listener = this.listeners[listenerIndex];
      element.removeEventListener(event, handler, listener.options);
      this.listeners.splice(listenerIndex, 1);
    }
  }

  /**
   * Get statistics about managed resources
   */
  getStats(): {
    listeners: number;
    timers: number;
    subscriptions: number;
    abortControllers: number;
    cleanupFunctions: number;
    rafHandles: number;
    total: number;
  } {
    return {
      listeners: this.listeners.length,
      timers: this.timers.length,
      subscriptions: this.subscriptions.length,
      abortControllers: this.abortControllers.length,
      cleanupFunctions: this.cleanupFunctions.length,
      rafHandles: this.rafHandles.length,
      total:
        this.listeners.length +
        this.timers.length +
        this.subscriptions.length +
        this.abortControllers.length +
        this.cleanupFunctions.length +
        this.rafHandles.length,
    };
  }

  /**
   * Cleanup all managed resources
   */
  cleanup(): void {
    if (this.disposed) {
      return;
    }

    // Remove all event listeners
    for (const listener of this.listeners) {
      try {
        listener.element.removeEventListener(
          listener.event,
          listener.handler,
          listener.options
        );
      } catch (error) {
        console.error('Error removing event listener:', error);
      }
    }

    // Clear all timers
    for (const timer of this.timers) {
      try {
        if (timer.type === 'timeout') {
          clearTimeout(timer.id);
        } else {
          clearInterval(timer.id);
        }
      } catch (error) {
        console.error('Error clearing timer:', error);
      }
    }

    // Unsubscribe all subscriptions
    for (const subscription of this.subscriptions) {
      try {
        subscription.unsubscribe();
      } catch (error) {
        console.error(`Error unsubscribing ${subscription.name || 'subscription'}:`, error);
      }
    }

    // Abort all fetch requests
    for (const { controller, name } of this.abortControllers) {
      try {
        if (!controller.signal.aborted) {
          controller.abort();
        }
      } catch (error) {
        console.error(`Error aborting ${name || 'request'}:`, error);
      }
    }

    // Cancel all animation frames
    for (const handle of this.rafHandles) {
      try {
        window.cancelAnimationFrame(handle);
      } catch (error) {
        console.error('Error canceling animation frame:', error);
      }
    }

    // Run custom cleanup functions
    for (const cleanupFn of this.cleanupFunctions) {
      try {
        cleanupFn();
      } catch (error) {
        console.error('Error running cleanup function:', error);
      }
    }

    // Clear all arrays
    this.listeners = [];
    this.timers = [];
    this.subscriptions = [];
    this.abortControllers = [];
    this.rafHandles = [];
    this.cleanupFunctions = [];

    this.disposed = true;
  }

  /**
   * Alias for cleanup
   */
  dispose(): void {
    this.cleanup();
  }

  /**
   * Check if the manager has been disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }
}

/**
 * Factory function to create a new CleanupManager instance
 */
export function createCleanupManager(): CleanupManager {
  return new CleanupManager();
}