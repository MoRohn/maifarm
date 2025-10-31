/**
 * Handle Vite HMR (Hot Module Replacement) disconnection gracefully
 * This prevents error pages when the browser tab is suspended or HMR WebSocket disconnects
 */

// Only run in development mode
if (import.meta.env.DEV) {
  // Listen for Vite HMR connection events
  if (import.meta.hot) {
    // Handle HMR connection errors gracefully
    import.meta.hot.on('vite:ws:disconnect', () => {
      console.log('[HMR] WebSocket disconnected - this is normal when tab is suspended');
    });

    import.meta.hot.on('vite:ws:connect', () => {
      console.log('[HMR] WebSocket reconnected');
    });

    // Prevent default error handling for HMR disconnections
    import.meta.hot.on('vite:error', (data) => {
      // Check if it's a WebSocket error
      if (data.err?.message?.includes('WebSocket') || 
          data.err?.message?.includes('closed due to suspension')) {
        console.log('[HMR] Ignoring WebSocket suspension error');
        // Prevent the error from being shown by clearing the error details
        // Instead of setting to null, clear the error properties
        if (data.err) {
          data.err.message = '';
          data.err.stack = '';
        }
      }
    });

    // Override the default HMR error overlay behavior
    const originalError = console.error;
    console.error = (...args) => {
      // Filter out HMR WebSocket errors
      const errorStr = args.join(' ');
      if (errorStr.includes('WebSocket connection to') && 
          errorStr.includes('failed:') &&
          (errorStr.includes('closed due to suspension') || 
           errorStr.includes('token='))) {
        console.log('[HMR] Suppressed WebSocket suspension error');
        return;
      }
      originalError.apply(console, args);
    };
  }
}

export const setupHMRHandler = () => {
  // This function can be called to ensure the handler is loaded
  console.log('[HMR] Handler initialized');
};