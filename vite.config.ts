import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'
import { pwaConfig } from './vite-pwa-config'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // VitePWA(pwaConfig) // Temporarily disabled to fix reload loop
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@services': path.resolve(__dirname, 'src/services'),
      '@hooks': path.resolve(__dirname, 'src/hooks'),
      '@types': path.resolve(__dirname, 'src/types'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@store': path.resolve(__dirname, 'src/store'),
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    'process.env': {},
    global: 'globalThis',
  },
  optimizeDeps: {
    exclude: ['zlib'],
  },
  build: {
    rollupOptions: {
      external: ['zlib'],
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/ws': {
        target: 'ws://localhost:4567',
        ws: true,
        changeOrigin: true,
      },
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
})