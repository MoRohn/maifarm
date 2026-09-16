#!/usr/bin/env node

/**
 * Test script to validate YAML generation for all three farm modes
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:4567/api';

async function testHarvestMode() {
  console.log('\n=== Testing HARVEST Mode with YAML ===');

  const response = await fetch(`${API_BASE}/farms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Test Harvest Farm',
      prompt: 'Create a simple React component that displays "Hello World"',
      mode: 'harvest',
      provider: 'claude',
      agentCount: 2,
      useXenoSync: false,
      timeout: 60 // 1 minute for testing
    })
  });

  const result = await response.json();
  console.log('Harvest Farm created:', {
    id: result.id,
    status: result.status,
    hasYaml: !!result.yamlContent
  });

  // Check if YAML was written to workspace
  const fs = await import('fs').then(m => m.promises);
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const workspacePath = path.join(__dirname, '../../var/maibarn/workspaces', result.id, 'farm.yaml');

  try {
    const yamlContent = await fs.readFile(workspacePath, 'utf-8');
    console.log('✅ YAML file found in workspace');
    console.log('YAML Preview:', yamlContent.substring(0, 200) + '...');
  } catch (error) {
    console.log('❌ YAML file not found in workspace');
  }

  return result.id;
}

async function testQuickTaskMode() {
  console.log('\n=== Testing QUICK TASK Mode with YAML ===');

  const response = await fetch(`${API_BASE}/farms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'Write a fibonacci function in JavaScript',
      mode: 'quick_task',
      provider: 'claude'
    })
  });

  const result = await response.json();
  console.log('Quick Task created:', {
    id: result.id,
    status: result.status,
    hasYaml: !!result.yamlContent
  });

  // Check if YAML was written to workspace
  const fs = await import('fs').then(m => m.promises);
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const workspacePath = path.join(__dirname, '../../var/maibarn/workspaces', result.id, 'farm.yaml');

  try {
    const yamlContent = await fs.readFile(workspacePath, 'utf-8');
    console.log('✅ YAML file found in workspace');
    console.log('YAML Preview:', yamlContent.substring(0, 200) + '...');
  } catch (error) {
    console.log('❌ YAML file not found in workspace');
  }

  return result.id;
}

async function testGoWildMode() {
  console.log('\n=== Testing GO WILD Mode with YAML ===');

  const response = await fetch(`${API_BASE}/farms/go-wild`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'Build a simple todo list app',
      provider: 'claude',
      agentCount: 3,
      creativityLevel: 75,
      timeout: 120 // 2 minutes for testing
    })
  });

  const result = await response.json();
  console.log('Go Wild Farm created:', {
    id: result.farm?.id,
    status: result.farm?.status,
    hasYaml: !!result.farm?.yamlContent
  });

  // Check if YAML was written to workspace
  if (result.farm?.id) {
    const fs = require('fs').promises;
    const path = require('path');
    const workspacePath = path.join(__dirname, '../../var/maibarn/workspaces', result.farm.id, 'farm.yaml');

    try {
      const yamlContent = await fs.readFile(workspacePath, 'utf-8');
      console.log('✅ YAML file found in workspace');
      console.log('YAML Preview:', yamlContent.substring(0, 200) + '...');
    } catch (error) {
      console.log('❌ YAML file not found in workspace');
    }
  }

  return result.farm?.id;
}

async function main() {
  console.log('Starting YAML generation tests for all modes...');

  try {
    // Test all three modes
    const harvestId = await testHarvestMode();
    console.log('Harvest Farm ID:', harvestId);

    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 2000));

    const quickTaskId = await testQuickTaskMode();
    console.log('Quick Task ID:', quickTaskId);

    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 2000));

    const goWildId = await testGoWildMode();
    console.log('Go Wild Farm ID:', goWildId);

    console.log('\n✅ All tests completed!');
    console.log('Check the farms at http://localhost:3000');

  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run tests
main().catch(console.error);