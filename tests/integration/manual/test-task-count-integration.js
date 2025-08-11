#!/usr/bin/env node
/**
 * Test script to verify that task counts are based on files created by agents
 */

import path from 'path';
import fs from 'fs/promises';
import { taskCountService } from './server/services/taskCountService.js';
import { pathConfig } from './server/config/paths.js';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function createTestFarm() {
  const testFarmId = `test-farm-${Date.now()}`;
  const workspacePath = pathConfig.getFarmWorkspacePath(testFarmId, false);
  
  log(`\n=== Creating Test Farm: ${testFarmId} ===`, 'bright');
  log(`Workspace: ${workspacePath}`, 'cyan');
  
  // Create workspace directory
  await fs.mkdir(workspacePath, { recursive: true });
  
  // Create some test files to simulate agent work
  const testFiles = [
    'agent_0/feature.js',
    'agent_0/feature.test.js',
    'agent_0/README.md',
    'agent_1/bugfix.ts',
    'agent_1/bugfix.test.ts',
    'agent_2/config.yaml',
    'agent_2/data.json',
    'shared/utils.js',
    'shared/constants.ts'
  ];
  
  for (const file of testFiles) {
    const filePath = path.join(workspacePath, file);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `// Test file: ${file}\n// Created at: ${new Date().toISOString()}`);
    log(`✓ Created file: ${file}`, 'green');
  }
  
  return { farmId: testFarmId, fileCount: testFiles.length };
}

async function testTaskCounting(farmId, expectedCount) {
  log('\n=== Testing Task Count Service ===', 'bright');
  
  // Test 1: Count total tasks for farm
  const totalTasks = await taskCountService.countTasksForFarm(farmId);
  log(`Total tasks (files) for farm: ${totalTasks}`, 'blue');
  
  if (totalTasks === expectedCount) {
    log(`✓ Total task count matches expected: ${expectedCount}`, 'green');
  } else {
    log(`✗ Task count mismatch! Expected: ${expectedCount}, Got: ${totalTasks}`, 'red');
    return false;
  }
  
  // Test 2: Count tasks per agent
  const agent0Tasks = await taskCountService.countTasksForAgent(farmId, 0);
  const agent1Tasks = await taskCountService.countTasksForAgent(farmId, 1);
  const agent2Tasks = await taskCountService.countTasksForAgent(farmId, 2);
  
  log(`\nAgent 0 tasks: ${agent0Tasks}`, 'blue');
  log(`Agent 1 tasks: ${agent1Tasks}`, 'blue');
  log(`Agent 2 tasks: ${agent2Tasks}`, 'blue');
  
  // Test 3: Get detailed statistics
  const stats = await taskCountService.getTaskStatistics(farmId);
  log('\n=== Task Statistics ===', 'bright');
  log(`Total Tasks: ${stats.totalTasks}`, 'cyan');
  log(`Harvested Tasks: ${stats.harvestedTasks}`, 'cyan');
  log(`Pending Tasks: ${stats.pendingTasks}`, 'cyan');
  log('\nTasks by Type:', 'cyan');
  for (const [type, count] of Object.entries(stats.tasksByType)) {
    log(`  ${type}: ${count}`, 'cyan');
  }
  
  return true;
}

async function testFileWatching(farmId) {
  log('\n=== Testing File Watching ===', 'bright');
  
  let updateCount = 0;
  const cleanup = await taskCountService.watchTaskCompletion(farmId, (newCount) => {
    updateCount++;
    log(`File watcher triggered! New task count: ${newCount}`, 'yellow');
  });
  
  // Add a new file to trigger the watcher
  const workspacePath = pathConfig.getFarmWorkspacePath(farmId, false);
  const newFilePath = path.join(workspacePath, 'agent_0', 'new-feature.js');
  
  log('Adding new file to trigger watcher...', 'blue');
  await fs.writeFile(newFilePath, '// New feature added during watch test');
  
  // Wait for watcher to trigger
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  if (updateCount > 0) {
    log(`✓ File watcher triggered ${updateCount} time(s)`, 'green');
  } else {
    log('✗ File watcher did not trigger', 'red');
  }
  
  // Clean up watcher
  cleanup();
  
  return updateCount > 0;
}

async function simulateHarvest(farmId) {
  log('\n=== Simulating Harvest ===', 'bright');
  
  const harvestPath = pathConfig.getHarvestPath(farmId, false);
  const yieldPath = path.join(harvestPath, 'yield');
  
  // Create harvest directories
  await fs.mkdir(path.join(yieldPath, 'code'), { recursive: true });
  await fs.mkdir(path.join(yieldPath, 'docs'), { recursive: true });
  
  // Add some harvest files
  await fs.writeFile(path.join(yieldPath, 'code', 'compiled.js'), '// Harvested code');
  await fs.writeFile(path.join(yieldPath, 'docs', 'summary.md'), '# Harvest Summary');
  
  log('✓ Created harvest files', 'green');
  
  // Count harvested tasks
  const harvestedCount = await taskCountService.countHarvestedTasks(farmId);
  log(`Harvested task count: ${harvestedCount}`, 'blue');
  
  return harvestedCount > 0;
}

async function cleanup(farmId) {
  log('\n=== Cleanup ===', 'bright');
  
  try {
    const workspacePath = pathConfig.getFarmWorkspacePath(farmId, false);
    const harvestPath = pathConfig.getHarvestPath(farmId, false);
    
    // Remove test directories
    await fs.rm(workspacePath, { recursive: true, force: true });
    await fs.rm(harvestPath, { recursive: true, force: true });
    
    log('✓ Cleaned up test files', 'green');
    return true;
  } catch (error) {
    log(`⚠ Cleanup warning: ${error.message}`, 'yellow');
    return true; // Don't fail on cleanup
  }
}

async function runAllTests() {
  log('\n' + '='.repeat(60), 'bright');
  log('Task Count Integration Test Suite', 'bright');
  log('Testing: Files Created = Tasks Completed', 'bright');
  log('='.repeat(60), 'bright');
  
  let allPassed = true;
  let testFarmId = null;
  
  try {
    // Create test farm with files
    const { farmId, fileCount } = await createTestFarm();
    testFarmId = farmId;
    
    // Test task counting
    const countingPassed = await testTaskCounting(farmId, fileCount);
    allPassed = allPassed && countingPassed;
    
    // Test file watching
    const watchingPassed = await testFileWatching(farmId);
    allPassed = allPassed && watchingPassed;
    
    // Test harvest counting
    const harvestPassed = await simulateHarvest(farmId);
    allPassed = allPassed && harvestPassed;
    
    // Final statistics
    const finalStats = await taskCountService.getTaskStatistics(farmId);
    log('\n=== Final Statistics ===', 'bright');
    log(`Total Files Created (Tasks): ${finalStats.totalTasks}`, 'cyan');
    log(`Harvested Files: ${finalStats.harvestedTasks}`, 'cyan');
    
  } catch (error) {
    log(`\n✗ Test failed with error: ${error.message}`, 'red');
    console.error(error);
    allPassed = false;
  } finally {
    // Clean up test files
    if (testFarmId) {
      await cleanup(testFarmId);
    }
  }
  
  // Summary
  log('\n' + '='.repeat(60), 'bright');
  if (allPassed) {
    log('✓ All tests PASSED!', 'green');
    log('\nKey Implementation:', 'bright');
    log('• Tasks Completed = Number of files created by agents', 'green');
    log('• Each file in farm workspace counts as 1 task', 'green');
    log('• Files are categorized by type (code, docs, data, config)', 'green');
    log('• Agent-specific task counts based on their subdirectories', 'green');
    log('• Real-time updates via file watching', 'green');
  } else {
    log('✗ Some tests FAILED. Please review the output above.', 'red');
  }
  
  process.exit(allPassed ? 0 : 1);
}

// Run the tests
runAllTests().catch((error) => {
  log(`\nUnexpected error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});