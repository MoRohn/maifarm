#!/usr/bin/env node
/**
 * Qwen3-Coder Integration Test Script
 * 
 * This script validates the Qwen integration setup and runs basic tests
 * to ensure everything is working correctly.
 * 
 * Usage: node scripts/test-qwen-integration.js [options]
 * Options:
 *   --full    Run full integration tests
 *   --quick   Run quick validation only
 *   --debug   Enable debug output
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');

// Test configuration
const config = {
  debug: process.argv.includes('--debug'),
  quick: process.argv.includes('--quick'),
  full: process.argv.includes('--full'),
  timeout: 30000, // 30 seconds default timeout
};

// Test results
const results = {
  passed: [],
  failed: [],
  warnings: [],
  skipped: []
};

// Utility functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const prefix = `[${timestamp}]`;
  
  switch (type) {
    case 'success':
      console.log(chalk.green(`${prefix} ✓ ${message}`));
      break;
    case 'error':
      console.error(chalk.red(`${prefix} ✗ ${message}`));
      break;
    case 'warning':
      console.warn(chalk.yellow(`${prefix} ⚠ ${message}`));
      break;
    case 'info':
      console.log(chalk.cyan(`${prefix} ℹ ${message}`));
      break;
    case 'debug':
      if (config.debug) {
        console.log(chalk.gray(`${prefix} 🐛 ${message}`));
      }
      break;
    default:
      console.log(`${prefix} ${message}`);
  }
}

async function executeCommand(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const proc = spawn(command, args, {
      stdio: config.debug ? 'inherit' : 'pipe',
      ...options
    });

    let stdout = '';
    let stderr = '';

    if (!config.debug) {
      proc.stdout?.on('data', (data) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data) => { stderr += data.toString(); });
    }

    proc.on('exit', (code) => {
      resolve({
        success: code === 0,
        code,
        stdout,
        stderr,
        duration: Date.now() - startTime
      });
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        code: -1,
        stdout,
        stderr: err.message,
        duration: Date.now() - startTime
      });
    });

    // Timeout handling
    setTimeout(() => {
      proc.kill('SIGTERM');
      resolve({
        success: false,
        code: -1,
        stdout,
        stderr: 'Command timed out',
        duration: config.timeout
      });
    }, config.timeout);
  });
}

// Test functions
async function testEnvironmentSetup() {
  log('Checking environment setup...', 'info');
  
  // Check Node.js version
  const nodeVersion = process.version;
  if (nodeVersion.match(/^v(\d+)/)[1] < 18) {
    results.failed.push('Node.js version must be 18 or higher');
    return false;
  }
  log(`Node.js version: ${nodeVersion}`, 'success');

  // Check if .env file exists
  try {
    await fs.access('.env');
    log('.env file found', 'success');
  } catch {
    results.warnings.push('.env file not found - using defaults');
    log('.env file not found - using defaults', 'warning');
  }

  // Check AI provider environment
  const aiProvider = process.env.AI_PROVIDER || 'claude';
  log(`AI Provider: ${aiProvider}`, 'info');

  if (aiProvider === 'qwen') {
    // Check Qwen-specific environment
    if (!process.env.QWEN_API_KEY) {
      results.warnings.push('QWEN_API_KEY not set - API calls will fail');
      log('QWEN_API_KEY not set', 'warning');
    } else {
      log('QWEN_API_KEY configured', 'success');
    }
  }

  results.passed.push('Environment setup');
  return true;
}

async function testQwenCLI() {
  log('Checking Qwen CLI installation...', 'info');

  // First check for native qwen-code command
  let result = await executeCommand('qwen-code', ['--version']);
  
  if (result.success) {
    log('Native Qwen CLI installed', 'success');
    results.passed.push('Qwen CLI (native)');
    return true;
  }

  // Check for Claude proxy with Qwen
  result = await executeCommand('claude', ['--version'], {
    env: { ...process.env, AI_PROVIDER: 'qwen' }
  });

  if (result.success) {
    log('Claude-to-Qwen proxy configured', 'success');
    results.passed.push('Qwen CLI (proxy)');
    return true;
  }

  results.failed.push('Qwen CLI not available');
  log('Neither native Qwen CLI nor proxy is configured', 'error');
  log('Install with: npm install -g @qwen/qwen-code', 'info');
  return false;
}

async function testCoordinationDirectory() {
  log('Checking coordination directory...', 'info');
  
  const coordPath = '/tmp/claude_coordination';
  try {
    await fs.access(coordPath, fs.constants.W_OK);
    log(`Coordination directory accessible: ${coordPath}`, 'success');
    
    // Create test subdirectories
    await fs.mkdir(`${coordPath}/qwen_test`, { recursive: true });
    await fs.mkdir(`${coordPath}/work_claims`, { recursive: true });
    
    results.passed.push('Coordination directory');
    return true;
  } catch (error) {
    results.failed.push(`Coordination directory not writable: ${coordPath}`);
    log(`Cannot access coordination directory: ${error.message}`, 'error');
    return false;
  }
}

async function testMultiClaudeScript() {
  log('Checking multi_claude.py availability...', 'info');
  
  const scriptPath = path.join(process.cwd(), 'multi_claude.py');
  try {
    await fs.access(scriptPath);
    log('multi_claude.py found', 'success');
    
    // Check if it supports --provider flag
    const result = await executeCommand('python3', [scriptPath, '--help']);
    if (result.success && result.stdout.includes('--provider')) {
      log('multi_claude.py supports provider selection', 'success');
      results.passed.push('multi_claude.py with provider support');
    } else {
      results.warnings.push('multi_claude.py may need updates for provider support');
      log('multi_claude.py may need provider flag support', 'warning');
    }
    
    return true;
  } catch {
    results.failed.push('multi_claude.py not found');
    log('multi_claude.py script not found', 'error');
    return false;
  }
}

async function testQwenAPI() {
  log('Testing Qwen API connectivity...', 'info');
  
  if (!process.env.QWEN_API_KEY) {
    results.skipped.push('Qwen API test (no API key)');
    log('Skipping API test - QWEN_API_KEY not set', 'warning');
    return false;
  }

  const endpoint = process.env.QWEN_API_ENDPOINT || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.QWEN_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen-coder-turbo',
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 10
      })
    });

    if (response.ok) {
      log('Qwen API accessible', 'success');
      results.passed.push('Qwen API connectivity');
      return true;
    } else {
      const error = await response.text();
      results.failed.push(`Qwen API error: ${response.status}`);
      log(`API returned error ${response.status}: ${error}`, 'error');
      return false;
    }
  } catch (error) {
    results.failed.push(`Qwen API connection failed: ${error.message}`);
    log(`Cannot connect to Qwen API: ${error.message}`, 'error');
    return false;
  }
}

async function testBasicFarmCreation() {
  if (config.quick) {
    results.skipped.push('Basic farm creation test');
    return;
  }

  log('Testing basic farm creation with Qwen...', 'info');
  
  const testCommand = [
    'multi_claude.py',
    '-n', '2',
    '-p', 'Create a hello world function',
    '--provider', 'qwen',
    '-s', 'qwen_test_session'
  ];

  log(`Running: python3 ${testCommand.join(' ')}`, 'debug');
  
  const result = await executeCommand('python3', testCommand, {
    env: { ...process.env, AI_PROVIDER: 'qwen' },
    timeout: 60000 // 60 second timeout for farm creation
  });

  if (result.success) {
    log('Successfully created test farm with Qwen', 'success');
    results.passed.push('Basic farm creation');
    
    // Clean up test session
    await executeCommand('tmux', ['kill-session', '-t', 'qwen_test_session']);
  } else {
    results.failed.push('Basic farm creation failed');
    log(`Farm creation failed: ${result.stderr}`, 'error');
  }
}

async function runJestTests() {
  if (config.quick) {
    results.skipped.push('Jest integration tests');
    return;
  }

  log('Running Jest integration tests...', 'info');
  
  const testFiles = [
    'tests/integration/qwen-integration.test.ts',
    'tests/integration/qwen-farm-creation.test.ts',
    'tests/integration/qwen-websocket.test.ts'
  ];

  for (const testFile of testFiles) {
    try {
      await fs.access(testFile);
      log(`Running ${path.basename(testFile)}...`, 'info');
      
      const result = await executeCommand('npm', ['test', '--', testFile], {
        env: { ...process.env, AI_PROVIDER: 'qwen' }
      });

      if (result.success) {
        results.passed.push(path.basename(testFile));
        log(`${path.basename(testFile)} passed`, 'success');
      } else {
        results.failed.push(path.basename(testFile));
        log(`${path.basename(testFile)} failed`, 'error');
        if (config.debug) {
          console.log(result.stderr);
        }
      }
    } catch {
      results.skipped.push(path.basename(testFile));
      log(`${testFile} not found`, 'warning');
    }
  }
}

// Main test runner
async function runTests() {
  console.log(chalk.bold.cyan('\n🧪 Qwen3-Coder Integration Test Suite\n'));
  
  const tests = [
    testEnvironmentSetup,
    testQwenCLI,
    testCoordinationDirectory,
    testMultiClaudeScript,
    testQwenAPI,
    testBasicFarmCreation,
    runJestTests
  ];

  for (const test of tests) {
    try {
      await test();
    } catch (error) {
      log(`Test error: ${error.message}`, 'error');
      results.failed.push(test.name);
    }
    console.log(''); // Add spacing between tests
  }

  // Generate report
  generateReport();
}

function generateReport() {
  console.log(chalk.bold.cyan('\n📊 Test Results Summary\n'));
  
  console.log(chalk.green(`✓ Passed: ${results.passed.length}`));
  results.passed.forEach(test => console.log(chalk.green(`  - ${test}`)));
  
  if (results.failed.length > 0) {
    console.log(chalk.red(`\n✗ Failed: ${results.failed.length}`));
    results.failed.forEach(test => console.log(chalk.red(`  - ${test}`)));
  }
  
  if (results.warnings.length > 0) {
    console.log(chalk.yellow(`\n⚠ Warnings: ${results.warnings.length}`));
    results.warnings.forEach(warning => console.log(chalk.yellow(`  - ${warning}`)));
  }
  
  if (results.skipped.length > 0) {
    console.log(chalk.gray(`\n⊘ Skipped: ${results.skipped.length}`));
    results.skipped.forEach(test => console.log(chalk.gray(`  - ${test}`)));
  }

  const totalTests = results.passed.length + results.failed.length + results.skipped.length;
  const successRate = totalTests > 0 ? (results.passed.length / totalTests * 100).toFixed(1) : 0;
  
  console.log(chalk.bold.cyan(`\n📈 Success Rate: ${successRate}%\n`));
  
  // Save report to file
  const reportPath = `test-reports/qwen-integration-${Date.now()}.json`;
  const report = {
    timestamp: new Date().toISOString(),
    results,
    config,
    successRate: parseFloat(successRate),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      aiProvider: process.env.AI_PROVIDER || 'claude'
    }
  };
  
  fs.mkdir('test-reports', { recursive: true })
    .then(() => fs.writeFile(reportPath, JSON.stringify(report, null, 2)))
    .then(() => log(`Report saved to ${reportPath}`, 'info'))
    .catch(err => log(`Failed to save report: ${err.message}`, 'warning'));

  // Exit code based on failures
  process.exit(results.failed.length > 0 ? 1 : 0);
}

// Run the tests
runTests().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  process.exit(1);
});