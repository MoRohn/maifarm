// Polyfills for better browser compatibility
// Helps resolve WebKit internal errors with ES modules

// Ensure global is defined (for Node.js compatibility in browser)
if (typeof global === 'undefined') {
  (window as any).global = window;
}

// Ensure process is defined (some packages expect it)
if (typeof process === 'undefined') {
  (window as any).process = { 
    env: { 
      NODE_ENV: import.meta.env.MODE 
    } 
  };
}

// Export to make TypeScript happy
export {};