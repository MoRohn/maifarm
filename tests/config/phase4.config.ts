/**
 * Phase 4 End-to-End Testing Configuration
 * Complete workflow validation from farm creation to barn storage
 */

export const phase4Config = {
  // Test environment
  environment: {
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    apiUrl: process.env.API_URL || 'http://localhost:4567',
    wsUrl: process.env.WS_URL || 'ws://localhost:4567',
    headless: process.env.HEADLESS !== 'false',
    slowMo: parseInt(process.env.SLOW_MO || '0'),
    timeout: parseInt(process.env.TEST_TIMEOUT || '300000'), // 5 minutes
  },

  // Test data
  testData: {
    farmName: `Phase4 Test Farm ${Date.now()}`,
    farmDescription: 'Comprehensive end-to-end validation test',
    agentCount: 3,
    provider: 'claude',
    taskPrompt: 'Create a simple hello world program in Python',
    expectedTimeout: 300000, // 5 minutes
  },

  // Recording settings
  recording: {
    enabled: true,
    videoDir: './tests/recordings',
    screenshotDir: './tests/screenshots',
    logDir: './tests/logs',
    reportDir: './tests/reports',
    captureConsole: true,
    captureNetwork: true,
  },

  // Monitoring settings
  monitoring: {
    checkInterval: 1000, // Check every second
    errorPatterns: [
      /error/i,
      /failed/i,
      /exception/i,
      /rejected/i,
      /timeout/i,
      /disconnected/i,
    ],
    warningPatterns: [
      /warning/i,
      /deprecated/i,
      /slow/i,
    ],
    successPatterns: [
      /success/i,
      /completed/i,
      /connected/i,
      /ready/i,
      /active/i,
    ],
  },

  // Success criteria
  successCriteria: {
    farmCreated: false,
    agentsLaunched: false,
    terminalOutputReceived: false,
    harvestCompleted: false,
    barnItemsCreated: false,
    noErrors: false,
    performanceMetrics: {
      farmCreationTime: 10000, // Max 10 seconds
      agentLaunchTime: 30000, // Max 30 seconds
      harvestTime: 300000, // Max 5 minutes
      totalTime: 360000, // Max 6 minutes
    },
  },

  // Auto-fix strategies
  autoFix: {
    enabled: true,
    strategies: {
      'connection-refused': 'restart-services',
      'database-locked': 'clear-locks',
      'tmux-orphaned': 'cleanup-sessions',
      'websocket-disconnected': 'reconnect',
      'agent-stuck': 'restart-agent',
    },
    maxRetries: 3,
    retryDelay: 5000,
  },

  // Service health checks
  healthChecks: {
    backend: {
      url: 'http://localhost:4567/api/health',
      expectedStatus: 200,
    },
    frontend: {
      url: 'http://localhost:3000',
      expectedStatus: 200,
    },
    database: {
      host: 'localhost',
      port: 5432,
      database: 'maifarm_dev',
    },
    redis: {
      host: 'localhost',
      port: 6379,
    },
  },

  // Cleanup settings
  cleanup: {
    afterEach: true,
    killOrphanedProcesses: true,
    clearTestData: true,
    resetDatabase: false,
  },
};

// Test phases with expected durations
export const testPhases = [
  {
    name: 'Setup',
    duration: 10000,
    steps: [
      'Start services',
      'Verify health',
      'Clear test data',
    ],
  },
  {
    name: 'Farm Creation',
    duration: 15000,
    steps: [
      'Navigate to dashboard',
      'Click Quick Action',
      'Fill farm details',
      'Submit creation',
      'Verify farm created',
    ],
  },
  {
    name: 'Agent Launch',
    duration: 30000,
    steps: [
      'Launch agents',
      'Verify tmux sessions',
      'Check agent status',
      'Monitor terminal output',
    ],
  },
  {
    name: 'Task Execution',
    duration: 180000,
    steps: [
      'Agents process tasks',
      'Monitor progress',
      'Collect outputs',
      'Verify completion',
    ],
  },
  {
    name: 'Harvest Collection',
    duration: 30000,
    steps: [
      'Trigger harvest',
      'Collect files',
      'Process outputs',
      'Store in barn',
    ],
  },
  {
    name: 'Validation',
    duration: 10000,
    steps: [
      'Check barn items',
      'Verify no errors',
      'Collect metrics',
      'Generate report',
    ],
  },
];

// Error recovery actions
export const recoveryActions = {
  'restart-services': async () => {
    console.log('🔄 Restarting services...');
    // Implementation will be in auto-fix.js
  },
  'clear-locks': async () => {
    console.log('🔓 Clearing database locks...');
    // Implementation will be in auto-fix.js
  },
  'cleanup-sessions': async () => {
    console.log('🧹 Cleaning up tmux sessions...');
    // Implementation will be in auto-fix.js
  },
  'reconnect': async () => {
    console.log('🔌 Reconnecting WebSocket...');
    // Implementation will be in auto-fix.js
  },
  'restart-agent': async () => {
    console.log('🤖 Restarting stuck agent...');
    // Implementation will be in auto-fix.js
  },
};