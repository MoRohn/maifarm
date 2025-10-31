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
  },
  publicDir: path.resolve(__dirname, 'public'),
  build: {
    outDir: path.resolve(__dirname, '../../dist/dashboard'),
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vendor chunking strategy
          if (id.includes('node_modules')) {
            // React ecosystem
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor';
            }
            // UI libraries
            if (id.includes('framer-motion') || id.includes('lucide-react') || id.includes('@radix-ui')) {
              return 'ui-vendor';
            }
            // Chart/visualization libraries
            if (id.includes('recharts') || id.includes('d3') || id.includes('visx')) {
              return 'chart-vendor';
            }
            // Socket.io
            if (id.includes('socket.io')) {
              return 'socket-vendor';
            }
            // Utility libraries
            if (id.includes('lodash') || id.includes('date-fns') || id.includes('clsx')) {
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
  },
  optimizeDeps: {
    include: ['lucide-react'],
    esbuildOptions: {
      target: 'esnext',
      jsx: 'automatic'
    },
    force: true
  },
});
