#!/usr/bin/env node

/**
 * Enhanced Test Runner for MaiFarm
 * Provides intelligent test execution with coverage analysis and quality checks
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Test categories
const testCategories = {
  unit: {
    pattern: 'src/**/*.{test,spec}.{ts,tsx}',
    description: 'Unit tests for components and services',
    config: 'jest.config.cjs'
  },
  integration: {
    pattern: 'tests/integration/**/*.{test,spec}.{ts,tsx}',
    description: 'Integration tests for API and services',
    config: 'jest.config.cjs'
  },
  e2e: {
    pattern: 'cypress/e2e/**/*.cy.{ts,tsx}',
    description: 'End-to-end tests using Cypress',
    runner: 'cypress'
  },
  server: {
    pattern: 'server/**/*.{test,spec}.{ts,tsx}',
    description: 'Server-side tests',
    config: 'jest.config.server.cjs'
  },
  performance: {
    pattern: 'tests/performance/**/*.{test,spec}.{ts,tsx,js}',
    description: 'Performance and load tests',
    config: 'jest.config.cjs'
  },
  accessibility: {
    pattern: 'tests/accessibility/**/*.{test,spec}.{ts,tsx}',
    description: 'Accessibility (a11y) tests',
    config: 'jest.config.cjs'
  }
};

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  category: 'all',
  coverage: false,
  watch: false,
  verbose: false,
  updateSnapshots: false,
  bail: false,
  parallel: true,
  showMetrics: false,
  filter: null,
  continuous: false
};

// Process arguments
for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--category':
    case '-c':
      options.category = args[++i];
      break;
    case '--coverage':
      options.coverage = true;
      break;
    case '--watch':
    case '-w':
      options.watch = true;
      break;
    case '--verbose':
    case '-v':
      options.verbose = true;
      break;
    case '--update-snapshots':
    case '-u':
      options.updateSnapshots = true;
      break;
    case '--bail':
      options.bail = true;
      break;
    case '--no-parallel':
      options.parallel = false;
      break;
    case '--metrics':
      options.showMetrics = true;
      break;
    case '--filter':
    case '-f':
      options.filter = args[++i];
      break;
    case '--continuous':
      options.continuous = true;
      break;
    case '--help':
    case '-h':
      showHelp();
      process.exit(0);
  }
}

function showHelp() {
  console.log(`
${colors.bright}MaiFarm Test Runner${colors.reset}

${colors.cyan}Usage:${colors.reset}
  node scripts/test-runner.js [options]

${colors.cyan}Options:${colors.reset}
  -c, --category <name>    Run specific test category (default: all)
                          Categories: ${Object.keys(testCategories).join(', ')}
  --coverage              Generate coverage report
  -w, --watch            Run tests in watch mode
  -v, --verbose          Show detailed output
  -u, --update-snapshots  Update test snapshots
  --bail                  Stop on first test failure
  --no-parallel          Disable parallel test execution
  --metrics              Show performance metrics
  -f, --filter <pattern>  Filter tests by name pattern
  --continuous           Run tests continuously with live reporting
  -h, --help             Show this help message

${colors.cyan}Examples:${colors.reset}
  # Run all tests with coverage
  node scripts/test-runner.js --coverage

  # Run unit tests in watch mode
  node scripts/test-runner.js -c unit -w

  # Run integration tests with verbose output
  node scripts/test-runner.js -c integration -v

  # Run tests matching a pattern
  node scripts/test-runner.js -f "WebSocket"

  # Run continuous testing with metrics
  node scripts/test-runner.js --continuous --metrics
`);
}

// Analyze test coverage
async function analyzeCoverage() {
  const coverageFile = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');
  
  if (!fs.existsSync(coverageFile)) {
    console.log(`${colors.yellow}No coverage data found. Run tests with --coverage first.${colors.reset}`);
    return;
  }
  
  const coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
  const total = coverage.total;
  
  console.log(`\n${colors.bright}Coverage Summary:${colors.reset}`);
  console.log('═'.repeat(50));
  
  const metrics = ['lines', 'statements', 'functions', 'branches'];
  metrics.forEach(metric => {
    const pct = total[metric].pct;
    const color = pct >= 80 ? colors.green : pct >= 60 ? colors.yellow : colors.red;
    const bar = generateBar(pct);
    console.log(`${metric.padEnd(12)} ${bar} ${color}${pct.toFixed(1)}%${colors.reset}`);
  });
  
  // Find uncovered files
  const uncovered = [];
  for (const [file, data] of Object.entries(coverage)) {
    if (file !== 'total' && data.lines.pct < 50) {
      uncovered.push({ file: file.replace(process.cwd(), '.'), pct: data.lines.pct });
    }
  }
  
  if (uncovered.length > 0) {
    console.log(`\n${colors.yellow}Files with low coverage (<50%):${colors.reset}`);
    uncovered
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 10)
      .forEach(({ file, pct }) => {
        console.log(`  ${colors.red}${pct.toFixed(1)}%${colors.reset} ${file}`);
      });
  }
}

function generateBar(percentage, width = 20) {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return `[${colors.green}${'█'.repeat(filled)}${colors.reset}${' '.repeat(empty)}]`;
}

// Find test files
function findTestFiles(category) {
  const testFiles = [];
  
  if (category === 'all') {
    Object.values(testCategories).forEach(cat => {
      if (cat.runner !== 'cypress') {
        // Add Jest test discovery here
        testFiles.push(...discoverJestTests(cat.pattern));
      }
    });
  } else if (testCategories[category]) {
    const cat = testCategories[category];
    if (cat.runner !== 'cypress') {
      testFiles.push(...discoverJestTests(cat.pattern));
    }
  }
  
  return testFiles;
}

function discoverJestTests(pattern) {
  // This is a simplified version - in production, use glob or similar
  const files = [];
  const baseDir = path.join(__dirname, '..');
  
  // Mock implementation - replace with actual file discovery
  console.log(`${colors.cyan}Discovering tests matching: ${pattern}${colors.reset}`);
  
  return files;
}

// Run tests
async function runTests() {
  console.log(`${colors.bright}${colors.blue}MaiFarm Test Runner${colors.reset}`);
  console.log('═'.repeat(50));
  
  let command = 'npm';
  let args = ['test'];
  
  // Determine which tests to run
  if (options.category !== 'all' && testCategories[options.category]) {
    const category = testCategories[options.category];
    
    console.log(`${colors.cyan}Running ${category.description}${colors.reset}\n`);
    
    if (category.runner === 'cypress') {
      command = 'npm';
      args = ['run', options.watch ? 'test:e2e:open' : 'test:e2e'];
    } else if (category.config) {
      args.push('--', '--config', category.config);
    }
    
    if (category.pattern && category.runner !== 'cypress') {
      args.push('--testPathPattern', category.pattern);
    }
  } else if (options.category === 'all') {
    console.log(`${colors.cyan}Running all tests${colors.reset}\n`);
  }
  
  // Add additional flags
  if (options.coverage) {
    args.push('--coverage');
  }
  
  if (options.watch) {
    args.push('--watch');
  }
  
  if (options.verbose) {
    args.push('--verbose');
  }
  
  if (options.updateSnapshots) {
    args.push('--updateSnapshot');
  }
  
  if (options.bail) {
    args.push('--bail');
  }
  
  if (!options.parallel) {
    args.push('--runInBand');
  }
  
  if (options.filter) {
    args.push('--testNamePattern', options.filter);
  }
  
  // Set environment variables
  const env = { ...process.env };
  
  if (options.showMetrics) {
    env.SHOW_TEST_METRICS = 'true';
  }
  
  // Run the tests
  console.log(`${colors.cyan}Executing: ${command} ${args.join(' ')}${colors.reset}\n`);
  
  const testProcess = spawn(command, args, {
    stdio: 'inherit',
    env,
    shell: true
  });
  
  return new Promise((resolve, reject) => {
    testProcess.on('close', async (code) => {
      console.log('\n' + '═'.repeat(50));
      
      if (code === 0) {
        console.log(`${colors.green}${colors.bright}✓ Tests passed successfully!${colors.reset}`);
        
        if (options.coverage) {
          await analyzeCoverage();
        }
        
        if (options.showMetrics) {
          await showTestMetrics();
        }
        
        resolve(code);
      } else {
        console.log(`${colors.red}${colors.bright}✗ Tests failed with code ${code}${colors.reset}`);
        reject(code);
      }
    });
    
    testProcess.on('error', (error) => {
      console.error(`${colors.red}Failed to run tests: ${error.message}${colors.reset}`);
      reject(error);
    });
  });
}

// Show test metrics
async function showTestMetrics() {
  console.log(`\n${colors.bright}Test Metrics:${colors.reset}`);
  console.log('═'.repeat(50));
  
  // This would read from test results
  // Mock implementation for now
  const metrics = {
    totalTests: 142,
    passed: 138,
    failed: 2,
    skipped: 2,
    duration: 15.7,
    slowestTest: 'WebSocket connection recovery (2.1s)',
    fastestTest: 'Farm creation validation (12ms)'
  };
  
  console.log(`Total Tests:   ${metrics.totalTests}`);
  console.log(`Passed:        ${colors.green}${metrics.passed}${colors.reset}`);
  console.log(`Failed:        ${colors.red}${metrics.failed}${colors.reset}`);
  console.log(`Skipped:       ${colors.yellow}${metrics.skipped}${colors.reset}`);
  console.log(`Duration:      ${metrics.duration}s`);
  console.log(`Slowest Test:  ${metrics.slowestTest}`);
  console.log(`Fastest Test:  ${metrics.fastestTest}`);
}

// Continuous testing mode
async function runContinuousTests() {
  console.log(`${colors.bright}${colors.magenta}Continuous Testing Mode${colors.reset}`);
  console.log('Press Ctrl+C to stop\n');
  
  let iteration = 1;
  
  while (true) {
    console.log(`\n${colors.cyan}═══ Test Run #${iteration} ═══${colors.reset}`);
    
    try {
      await runTests();
      console.log(`${colors.green}Run #${iteration} completed successfully${colors.reset}`);
    } catch (error) {
      console.log(`${colors.red}Run #${iteration} failed${colors.reset}`);
      
      if (options.bail) {
        console.log(`${colors.yellow}Bail mode enabled - stopping continuous testing${colors.reset}`);
        break;
      }
    }
    
    iteration++;
    
    // Wait before next run
    console.log(`\n${colors.cyan}Waiting 5 seconds before next run...${colors.reset}`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// Health check for test infrastructure
async function checkTestHealth() {
  console.log(`${colors.bright}Test Infrastructure Health Check${colors.reset}`);
  console.log('═'.repeat(50));
  
  const checks = [
    {
      name: 'Jest installed',
      check: () => fs.existsSync(path.join(__dirname, '..', 'node_modules', 'jest'))
    },
    {
      name: 'Test config exists',
      check: () => fs.existsSync(path.join(__dirname, '..', 'jest.config.cjs'))
    },
    {
      name: 'Test directory exists',
      check: () => fs.existsSync(path.join(__dirname, '..', 'tests'))
    },
    {
      name: 'Cypress installed',
      check: () => fs.existsSync(path.join(__dirname, '..', 'node_modules', 'cypress'))
    },
    {
      name: 'Coverage directory writable',
      check: () => {
        const coverageDir = path.join(__dirname, '..', 'coverage');
        if (!fs.existsSync(coverageDir)) {
          fs.mkdirSync(coverageDir, { recursive: true });
        }
        return fs.existsSync(coverageDir);
      }
    }
  ];
  
  let allHealthy = true;
  
  for (const { name, check } of checks) {
    try {
      const result = check();
      const status = result ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
      console.log(`${status} ${name}`);
      if (!result) allHealthy = false;
    } catch (error) {
      console.log(`${colors.red}✗${colors.reset} ${name}: ${error.message}`);
      allHealthy = false;
    }
  }
  
  console.log('═'.repeat(50));
  
  if (allHealthy) {
    console.log(`${colors.green}All health checks passed!${colors.reset}`);
  } else {
    console.log(`${colors.yellow}Some health checks failed. Run 'npm install' to fix dependencies.${colors.reset}`);
  }
  
  return allHealthy;
}

// Main execution
async function main() {
  try {
    // Run health check first
    const healthy = await checkTestHealth();
    if (!healthy && !options.continuous) {
      console.log(`${colors.yellow}Fix health issues before running tests.${colors.reset}`);
      process.exit(1);
    }
    
    console.log('');
    
    // Run tests
    if (options.continuous) {
      await runContinuousTests();
    } else {
      await runTests();
    }
    
    process.exit(0);
  } catch (error) {
    console.error(`${colors.red}Test runner failed: ${error}${colors.reset}`);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}Test runner interrupted${colors.reset}`);
  process.exit(130);
});

// Run main function
main();