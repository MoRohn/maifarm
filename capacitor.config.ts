import type { CapacitorConfig } from '@capacitor/cli';

// CRITICAL FIX: Environment-aware server configuration
// Production builds MUST NOT allow cleartext HTTP (iOS App Store rejection)
const isDevelopment = process.env.NODE_ENV !== 'production';

const config: CapacitorConfig = {
  appId: 'app.maifarm.ios',
  appName: 'MaiFarm',
  webDir: 'dist/dashboard',
  // Server config only for development - production uses bundled assets
  ...(isDevelopment && {
    server: {
      // Development only: connect to local dev server
      url: 'http://localhost:3000',
      cleartext: true, // Only allowed in development
    },
  }),
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'MaiFarm',
    // Disable cleartext HTTP in production (required for App Store)
    allowsLinkPreview: true,
    // Enable Apple Sign-In capability - configured in Xcode
  },
  plugins: {
    // Sign in with Apple plugin config (when added)
    // SignInWithApple: {}
  },
};

export default config;
