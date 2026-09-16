import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
const rootDir = __dirname;

export default defineConfig({
  root: rootDir,
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4567',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:4567',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@services': path.resolve(__dirname, './src/services'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@types': path.resolve(__dirname, './src/types'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@store': path.resolve(__dirname, './src/store'),
      '@api': path.resolve(__dirname, './src/api'),
      '@assets': path.resolve(__dirname, './src/assets'),
      '@contexts': path.resolve(__dirname, './src/contexts'),
      '@styles': path.resolve(__dirname, './src/styles'),
      '@config': path.resolve(__dirname, './src/config'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
    // Ensure single React instance to prevent hook context errors (especially in Safari)
    dedupe: ['react', 'react-dom', 'react-router-dom', 'framer-motion'],
  },
  publicDir: path.resolve(__dirname, 'public'),
  build: {
    outDir: path.resolve(__dirname, '../../dist/dashboard'),
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            const reactCorePackages = [
              '/node_modules/react/',
              '/node_modules/react-dom/',
              '/node_modules/react-router/',
              '/node_modules/react-router-dom/',
              '/node_modules/@remix-run/router/',
              '/node_modules/history/'
            ];

            // React core ecosystem only (avoid matching packages that merely contain "react" in their name)
            if (reactCorePackages.some(pkg => id.includes(pkg))) {
              return 'react-vendor';
            }

            // UI libraries (load before generic react check to prevent chunk cycles)
            if (id.includes('/node_modules/framer-motion/') || id.includes('/node_modules/lucide-react/') || id.includes('/node_modules/@radix-ui/')) {
              return 'ui-vendor';
            }

            // Chart/visualization libraries
            if (id.includes('/node_modules/recharts/') || id.includes('/node_modules/d3') || id.includes('/node_modules/@visx/')) {
              return 'chart-vendor';
            }

            // Socket.io
            if (id.includes('/node_modules/socket.io')) {
              return 'socket-vendor';
            }

            // Utility libraries
            if (id.includes('/node_modules/lodash/') || id.includes('/node_modules/date-fns/') || id.includes('/node_modules/clsx/')) {
              return 'utils-vendor';
            }

            // All other vendor code
            return 'vendor';
          }
          // Application code splitting
          if (id.includes('/src/components/Analytics')) {
            return 'analytics';
          }
          if (id.includes('/src/components/Farm')) {
            return 'farm';
          }
          if (id.includes('/src/components/Harvest')) {
            return 'harvest';
          }
          if (id.includes('/src/components/Settings')) {
            return 'settings';
          }
        },
        // Optimize chunk size
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Increase chunk size warning limit slightly
    chunkSizeWarningLimit: 600,
    // Enable minification
    minify: 'esbuild',
    target: 'es2020',
    emptyOutDir: true,
    // PERFORMANCE FIX: Remove console.log and console.debug in production builds
    // Keeps console.warn and console.error for important runtime information
    esbuildOptions: {
      // Mark console.log and console.debug as pure (side-effect-free) so esbuild removes them
      pure: process.env.NODE_ENV === 'production' ? ['console.log', 'console.debug', 'console.info'] : [],
    }
  },
  optimizeDeps: {
    include: ['lucide-react', 'framer-motion', 'react', 'react-dom'],
    esbuildOptions: {
      target: 'esnext',
      jsx: 'automatic'
    },
    // force: true removed - causes unnecessary rebuilds on every dev server start
  },
});
