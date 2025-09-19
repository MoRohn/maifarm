module.exports = {
  ci: {
    collect: {
      numberOfRuns: 3,
      startServerCommand: 'npm run preview',
      startServerReadyPattern: 'Local:',
      startServerReadyTimeout: 30000,
      settings: {
        preset: 'desktop',
        throttling: {
          cpuSlowdownMultiplier: 1,
          requestLatencyMs: 0,
          downloadThroughputKbps: 0,
          uploadThroughputKbps: 0,
        },
        screenEmulation: {
          mobile: false,
          width: 1920,
          height: 1080,
          deviceScaleFactor: 1,
          disabled: false,
        },
      },
      urls: [
        'http://localhost:4173/',
        'http://localhost:4173/dashboard',
        'http://localhost:4173/settings',
        'http://localhost:4173/monitoring',
        'http://localhost:4173/yaml-generator',
      ],
    },
    assert: {
      preset: 'lighthouse:recommended',
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 0.9 }],
        'first-contentful-paint': ['error', { maxNumericValue: 1500 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'total-blocking-time': ['error', { maxNumericValue: 300 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'interactive': ['error', { maxNumericValue: 3000 }],
        'max-potential-fid': ['error', { maxNumericValue: 130 }],
        'server-response-time': ['error', { maxNumericValue: 600 }],
        // Bundle size assertions
        'resource-summary:script:size': ['error', { maxNumericValue: 500000 }], // 500KB
        'resource-summary:total:size': ['error', { maxNumericValue: 2000000 }], // 2MB
        // Network assertions
        'network-requests': ['warn', { maxNumericValue: 50 }],
        'network-rtt': ['warn', { maxNumericValue: 100 }],
        // Image optimization
        'uses-optimized-images': 'error',
        'uses-webp-images': 'warn',
        'uses-responsive-images': 'error',
        // Caching
        'uses-long-cache-ttl': 'warn',
        // Security
        'is-on-https': 'error',
        'no-vulnerable-libraries': 'error',
      },
    },
    upload: {
      target: 'temporary-public-storage',
      reportFilenamePattern: 'maifarm-lighthouse-%%PATHNAME%%-%%DATETIME%%.report.%%EXTENSION%%',
    },
  },
};