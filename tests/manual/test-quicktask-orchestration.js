#!/usr/bin/env node

/**
 * Quick Task Orchestration Test
 * Tests the specific fix for Quick Task processing in the orchestrator
 */

import http from 'http';

const API_BASE = 'http://localhost:4567';

function log(message, level = 'info') {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const colors = {
    info: '\x1b[34m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warning: '\x1b[33m',
    reset: '\x1b[0m'
  };
  const color = colors[level] || colors.reset;
  console.log(`[${timestamp}] ${color}${message}${colors.reset}`);
}

async function apiRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: data ? JSON.parse(data) : null
          });
        } catch (error) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function testQuickTaskOrchestration() {
  try {
    log('=== QUICK TASK ORCHESTRATION TEST ===');
    
    // 1. Create Quick Task
    const taskData = {
      title: 'Orchestration Test Task',
      description: 'Test that Quick Tasks are properly processed by the orchestrator',
      priority: 'high',
      timeout: 180000,
      metadata: {
        testType: 'orchestration-validation'
      }
    };
    
    log('Creating Quick Task...', 'info');
    const createResponse = await apiRequest('POST', '/api/tasks/quick', taskData);
    
    if (!createResponse.body?.success) {
      throw new Error(`Failed to create task: ${JSON.stringify(createResponse.body)}`);
    }
    
    const taskId = createResponse.body.data.taskId;
    const farmId = createResponse.body.data.farmId;
    
    log(`✓ Quick Task created successfully`, 'success');
    log(`  Task ID: ${taskId}`, 'info');
    log(`  Farm ID: ${farmId}`, 'info');
    
    // 2. Monitor for 60 seconds to see if task gets processed
    log('Monitoring task status for 60 seconds...', 'info');
    
    let taskCompleted = false;
    let farmFound = false;
    
    for (let i = 0; i < 12; i++) { // 12 checks over 60 seconds
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const elapsed = (i + 1) * 5;
      log(`Check ${i + 1}/12 (${elapsed}s)`, 'info');
      
      // Check task status
      const taskResponse = await apiRequest('GET', `/api/tasks/${taskId}`);
      if (taskResponse.body?.data) {
        const status = taskResponse.body.data.status;
        log(`  Task Status: ${status}`, status === 'processing' || status === 'completed' ? 'success' : 'warning');
        
        if (status === 'completed') {
          log('✓ Task completed successfully!', 'success');
          taskCompleted = true;
          break;
        } else if (status === 'processing') {
          log('✓ Task is being processed by orchestrator!', 'success');
        } else if (status === 'failed') {
          log(`✗ Task failed: ${taskResponse.body.data.error}`, 'error');
          break;
        }
      } else {
        log(`  Task Status: API returned ${taskResponse.status}`, 'warning');
      }
      
      // Check farm status
      const farmResponse = await apiRequest('GET', `/api/farms/${farmId}`);
      if (farmResponse.body?.data) {
        const farmStatus = farmResponse.body.data.status;
        log(`  Farm Status: ${farmStatus}`, 'info');
        farmFound = true;
        
        if (farmStatus === 'running') {
          log('✓ Farm is running!', 'success');
        }
      } else {
        log(`  Farm Status: API returned ${farmResponse.status}`, 'warning');
      }
    }
    
    // 3. Generate test report
    log('\n=== TEST RESULTS ===', 'info');
    log(`Task Created: ✓`, 'success');
    log(`Task Processed: ${taskCompleted ? '✓' : '✗'}`, taskCompleted ? 'success' : 'error');
    log(`Farm Found: ${farmFound ? '✓' : '✗'}`, farmFound ? 'success' : 'error');
    
    if (taskCompleted && farmFound) {
      log('\n✓ ORCHESTRATION FIX SUCCESSFUL!', 'success');
      log('The orchestrator is now properly processing Quick Tasks.', 'success');
    } else {
      log('\n✗ ORCHESTRATION FIX INCOMPLETE', 'error');
      if (!taskCompleted) {
        log('- Task never progressed beyond queued status', 'error');
      }
      if (!farmFound) {
        log('- Farm API endpoint not working', 'error');
      }
    }
    
  } catch (error) {
    log(`Test failed: ${error.message}`, 'error');
    process.exit(1);
  }
}

// Run the test
testQuickTaskOrchestration();