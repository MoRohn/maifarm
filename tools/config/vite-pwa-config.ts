import { VitePWAOptions } from 'vite-plugin-pwa';

export const pwaConfig: VitePWAOptions = {
  registerType: 'autoUpdate',
  includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
  manifest: false, // We're using our own manifest.json
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-cache',
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'gstatic-fonts-cache',
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
    ],
  },
  devOptions: {
    enabled: false,
    type: 'module',
  },
  selfDestroying: false,
};