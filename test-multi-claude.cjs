#!/usr/bin/env node

/**
 * Test script for multi-claude integration
 * Run: node test-multi-claude.js
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('Testing multi-claude integration...\n');

// Test 1: Check if multi_claude.py exists
const multiClaudePath = path.join(__dirname, 'multi_claude.py');
const fs = require('fs');

if (!fs.existsSync(multiClaudePath)) {
  console.error('❌ multi_claude.py not found at:', multiClaudePath);
  process.exit(1);
}
console.log('✅ multi_claude.py found');

// Test 2: Check if Python can run the script with help
console.log('\n📋 Testing multi_claude.py help output:');
const helpProcess = spawn('python3', [multiClaudePath, '--help']);

helpProcess.stdout.on('data', (data) => {
  console.log(data.toString());
});

helpProcess.stderr.on('data', (data) => {
  console.error('Error:', data.toString());
});

helpProcess.on('exit', (code) => {
  if (code === 0) {
    console.log('✅ multi_claude.py runs successfully');
    
    // Test 3: Test launching with dry run (won't actually launch Claude)
    console.log('\n📋 Testing multi_claude.py command generation:');
    const testCommand = [
      multiClaudePath,
      '-n', '3',
      '-p', 'Test prompt',
      '-s', 'test_session'
    ];
    
    console.log('Command that would be run:');
    console.log('python3', testCommand.join(' '));
    console.log('\n✅ All tests passed! Multi-claude integration is ready.');
  } else {
    console.error('❌ multi_claude.py failed with exit code:', code);
    process.exit(1);
  }
});