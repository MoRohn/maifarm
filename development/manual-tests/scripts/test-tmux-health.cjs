#!/usr/bin/env node

/**
 * Test script to verify tmux health check logic
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function testTmuxHealth() {
  console.log('Testing tmux health check logic...\n');

  // Test 1: Check if tmux is installed
  console.log('1. Checking if tmux is installed:');
  try {
    const { stdout } = await execAsync('which tmux');
    console.log(`   ✅ Tmux found at: ${stdout.trim()}`);
  } catch (error) {
    console.log('   ❌ Tmux not installed');
    console.log(`   Error: ${error.message}`);
  }

  // Test 2: List tmux sessions
  console.log('\n2. Listing tmux sessions:');
  try {
    const { stdout } = await execAsync('TMUX_TMPDIR=/tmp tmux list-sessions 2>&1');
    const sessions = stdout.trim().split('\n').filter(Boolean);
    console.log(`   ✅ Found ${sessions.length} session(s):`);
    sessions.forEach(s => console.log(`      - ${s}`));
  } catch (error) {
    if (error.message.includes('no server running') ||
        error.message.includes('no sessions') ||
        error.message.includes('error connecting to')) {
      console.log('   ✅ No tmux sessions (this is normal/healthy)');
    } else {
      console.log('   ⚠️  Error listing sessions:', error.message);
    }
  }

  // Test 3: Check tmux version
  console.log('\n3. Checking tmux version:');
  try {
    const { stdout } = await execAsync('tmux -V');
    console.log(`   ✅ ${stdout.trim()}`);
  } catch (error) {
    console.log('   ❌ Could not get tmux version:', error.message);
  }

  // Test 4: Test creating and killing a test session
  console.log('\n4. Testing session creation/deletion:');
  try {
    // Create a test session
    await execAsync('TMUX_TMPDIR=/tmp tmux new-session -d -s health_test_session');
    console.log('   ✅ Created test session');

    // List sessions to verify
    const { stdout } = await execAsync('TMUX_TMPDIR=/tmp tmux list-sessions 2>&1');
    if (stdout.includes('health_test_session')) {
      console.log('   ✅ Test session verified');
    }

    // Kill the test session
    await execAsync('TMUX_TMPDIR=/tmp tmux kill-session -t health_test_session');
    console.log('   ✅ Killed test session');
  } catch (error) {
    console.log('   ⚠️  Session test failed:', error.message);
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY:');
  console.log('If tmux is installed and you see mostly ✅ above,');
  console.log('the health check should report tmux as healthy.');
  console.log('Having no sessions is a normal, healthy state.');
  console.log('='.repeat(50));
}

// Run the tests
testTmuxHealth().catch(console.error);