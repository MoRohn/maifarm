#!/usr/bin/env node
/**
 * Simple Terminal Streaming Test
 * Tests basic terminal output streaming without external dependencies
 */

const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');

const execAsync = promisify(exec);

const TEST_CONFIG = {
  sessionName: `test-session-${Date.now()}`,
  outputDir: '/tmp/maifarm-test-terminals',
  testDuration: 10000 // 10 seconds
};

async function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

async function testTmuxSession() {
  await log('Testing Tmux Session Creation...');

  try {
    // Create tmux session
    await execAsync(`TMUX_TMPDIR=/tmp tmux new-session -d -s ${TEST_CONFIG.sessionName}`);

    // Verify session exists
    const { stdout } = await execAsync(`TMUX_TMPDIR=/tmp tmux list-sessions`);

    if (stdout.includes(TEST_CONFIG.sessionName)) {
      await log('✅ Tmux session created successfully', 'SUCCESS');

      // Create additional panes
      await execAsync(`TMUX_TMPDIR=/tmp tmux split-window -t ${TEST_CONFIG.sessionName} -h`);
      await execAsync(`TMUX_TMPDIR=/tmp tmux split-window -t ${TEST_CONFIG.sessionName} -v`);

      await log('✅ Created 3 panes', 'SUCCESS');
      return true;
    } else {
      throw new Error('Session not found');
    }
  } catch (error) {
    await log(`❌ Tmux session creation failed: ${error.message}`, 'ERROR');
    return false;
  }
}

async function testPipePane() {
  await log('Testing Pipe-Pane Setup...');

  try {
    // Create output directory
    await fs.mkdir(TEST_CONFIG.outputDir, { recursive: true });

    // Setup pipe-pane for each pane
    for (let i = 0; i < 3; i++) {
      const outputFile = path.join(TEST_CONFIG.outputDir, `pane-${i}.log`);
      const cmd = `TMUX_TMPDIR=/tmp tmux pipe-pane -t ${TEST_CONFIG.sessionName}:0.${i} -o "cat >> ${outputFile}"`;

      await execAsync(cmd);

      // Create empty file
      await fs.writeFile(outputFile, '', { flag: 'a' });

      await log(`✅ Pipe-pane setup for pane ${i}`, 'SUCCESS');
    }

    return true;
  } catch (error) {
    await log(`❌ Pipe-pane setup failed: ${error.message}`, 'ERROR');
    return false;
  }
}

async function testOutputCapture() {
  await log('Testing Output Capture...');

  try {
    // Send test commands to each pane
    for (let i = 0; i < 3; i++) {
      const testMessage = `Test output from pane ${i} at ${new Date().toISOString()}`;
      await execAsync(`TMUX_TMPDIR=/tmp tmux send-keys -t ${TEST_CONFIG.sessionName}:0.${i} "echo '${testMessage}'" Enter`);

      await log(`Sent test message to pane ${i}`);
    }

    // Wait for output to be captured
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check output files
    let capturedCount = 0;
    for (let i = 0; i < 3; i++) {
      const outputFile = path.join(TEST_CONFIG.outputDir, `pane-${i}.log`);
      try {
        const content = await fs.readFile(outputFile, 'utf-8');
        if (content.length > 0) {
          await log(`✅ Captured ${content.length} bytes from pane ${i}`, 'SUCCESS');
          capturedCount++;

          // Show first 100 chars of captured content
          const preview = content.substring(0, 100).replace(/\n/g, '\\n');
          await log(`   Preview: ${preview}`);
        } else {
          await log(`⚠️  No output captured from pane ${i}`, 'WARNING');
        }
      } catch (error) {
        await log(`❌ Failed to read output from pane ${i}: ${error.message}`, 'ERROR');
      }
    }

    return capturedCount === 3;
  } catch (error) {
    await log(`❌ Output capture test failed: ${error.message}`, 'ERROR');
    return false;
  }
}

async function testCapturePane() {
  await log('Testing Capture-Pane Fallback...');

  try {
    // Send more test data
    for (let i = 0; i < 3; i++) {
      await execAsync(`TMUX_TMPDIR=/tmp tmux send-keys -t ${TEST_CONFIG.sessionName}:0.${i} "echo 'Capture test ${i}'" Enter`);
    }

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Use capture-pane to get output
    for (let i = 0; i < 3; i++) {
      const { stdout } = await execAsync(`TMUX_TMPDIR=/tmp tmux capture-pane -t ${TEST_CONFIG.sessionName}:0.${i} -p`);

      if (stdout.includes('Capture test')) {
        await log(`✅ Capture-pane working for pane ${i}`, 'SUCCESS');

        // Show captured content
        const lines = stdout.trim().split('\n').slice(-3);
        await log(`   Last 3 lines: ${lines.join(' | ')}`);
      } else {
        await log(`⚠️  No test output in capture from pane ${i}`, 'WARNING');
      }
    }

    return true;
  } catch (error) {
    await log(`❌ Capture-pane test failed: ${error.message}`, 'ERROR');
    return false;
  }
}

async function testFileWatching() {
  await log('Testing File Watching...');

  try {
    const watchResults = [];

    // Watch output files for changes
    for (let i = 0; i < 3; i++) {
      const outputFile = path.join(TEST_CONFIG.outputDir, `pane-${i}.log`);

      // Get initial size
      const statsBefore = await fs.stat(outputFile);

      // Send more data
      await execAsync(`TMUX_TMPDIR=/tmp tmux send-keys -t ${TEST_CONFIG.sessionName}:0.${i} "echo 'Watch test ${Date.now()}'" Enter`);

      // Wait for write
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check new size
      const statsAfter = await fs.stat(outputFile);

      if (statsAfter.size > statsBefore.size) {
        await log(`✅ File watch detected change in pane ${i} output (${statsBefore.size} → ${statsAfter.size} bytes)`, 'SUCCESS');
        watchResults.push(true);
      } else {
        await log(`⚠️  No change detected in pane ${i} output`, 'WARNING');
        watchResults.push(false);
      }
    }

    return watchResults.every(r => r);
  } catch (error) {
    await log(`❌ File watching test failed: ${error.message}`, 'ERROR');
    return false;
  }
}

async function cleanup() {
  await log('Cleaning up...');

  try {
    // Kill tmux session
    await execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t ${TEST_CONFIG.sessionName} 2>/dev/null`);
    await log('Killed tmux session');
  } catch (error) {
    // Session might not exist
  }

  try {
    // Remove test files
    await fs.rm(TEST_CONFIG.outputDir, { recursive: true, force: true });
    await log('Removed test files');
  } catch (error) {
    // Directory might not exist
  }
}

async function runTests() {
  await log('='.repeat(60));
  await log('TERMINAL STREAMING TEST SUITE');
  await log('='.repeat(60));

  const results = {
    tmuxSession: false,
    pipePane: false,
    outputCapture: false,
    capturePane: false,
    fileWatching: false
  };

  try {
    // Run tests
    results.tmuxSession = await testTmuxSession();

    if (results.tmuxSession) {
      results.pipePane = await testPipePane();

      if (results.pipePane) {
        results.outputCapture = await testOutputCapture();
        results.fileWatching = await testFileWatching();
      }

      results.capturePane = await testCapturePane();
    }

    // Report results
    await log('');
    await log('='.repeat(60));
    await log('TEST RESULTS');
    await log('='.repeat(60));

    Object.entries(results).forEach(([test, passed]) => {
      const status = passed ? '✅ PASSED' : '❌ FAILED';
      console.log(`  ${test}: ${status}`);
    });

    const passedCount = Object.values(results).filter(r => r).length;
    const totalCount = Object.keys(results).length;

    await log('');
    if (passedCount === totalCount) {
      await log(`✅ ALL TESTS PASSED (${passedCount}/${totalCount})`, 'SUCCESS');
    } else {
      await log(`⚠️  SOME TESTS FAILED (${passedCount}/${totalCount})`, 'WARNING');
    }

  } catch (error) {
    await log(`Fatal error: ${error.message}`, 'ERROR');
  } finally {
    await cleanup();
  }
}

// Run tests
runTests().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});