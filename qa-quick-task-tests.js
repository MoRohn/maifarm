#!/usr/bin/env node

/**
 * MaiFarm Quick Task QA Test Suite
 * Comprehensive testing for Quick Task mode farm creation and harvest completion
 */

import http from 'http';
import WebSocket from 'ws';
import { spawn } from 'child_process';

// Test configuration
const API_BASE = 'http://localhost:4567';
const WS_URL = 'ws://localhost:4567';
const TEST_TIMEOUT = 300000; // 5 minutes for quick tasks

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Test results tracking
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  bugs: [],
  startTime: new Date(),
  tests: []
};

// Utility functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: `${colors.blue}📋`,
    success: `${colors.green}✅`,
    error: `${colors.red}❌`,
    warning: `${colors.yellow}⚠️`,
    test: `${colors.magenta}🧪`,
    bug: `${colors.red}🐛`
  }[type] || '📋';
  
  console.log(`[${timestamp}] ${prefix} ${message}${colors.reset}`);
}

async function apiRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...headers
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = {
            status: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null
          };
          resolve(result);
        } catch (error) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// WebSocket connection manager
class WSManager {
  constructor() {
    this.ws = null;
    this.events = [];
    this.handlers = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_URL);
      
      this.ws.on('open', () => {
        log('WebSocket connected', 'success');
        resolve();
      });
      
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.events.push(message);
          
          // Call registered handlers
          if (this.handlers.has(message.type)) {
            this.handlers.get(message.type).forEach(handler => handler(message));
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      });
      
      this.ws.on('error', (error) => {
        log(`WebSocket error: ${error.message}`, 'error');
        reject(error);
      });
      
      this.ws.on('close', () => {
        log('WebSocket disconnected', 'warning');
      });
      
      // Timeout connection attempt
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
    });
  }

  on(eventType, handler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType).push(handler);
  }

  waitForEvent(eventType, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${eventType}`));
      }, timeout);
      
      const handler = (message) => {
        if (message.type === eventType) {
          clearTimeout(timer);
          resolve(message);
        }
      };
      
      this.on(eventType, handler);
    });
  }

  getEvents(type = null) {
    if (type) {
      return this.events.filter(e => e.type === type);
    }
    return this.events;
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Test execution wrapper
async function runTest(testName, testFunc) {
  testResults.total++;
  const startTime = Date.now();
  
  try {
    log(`Running: ${testName}`, 'test');
    await testFunc();
    const duration = Date.now() - startTime;
    
    testResults.passed++;
    testResults.tests.push({
      name: testName,
      status: 'passed',
      duration
    });
    
    log(`PASSED: ${testName} (${duration}ms)`, 'success');
    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    testResults.failed++;
    testResults.tests.push({
      name: testName,
      status: 'failed',
      duration,
      error: error.message
    });
    
    log(`FAILED: ${testName} - ${error.message}`, 'error');
    
    // Track as potential bug
    testResults.bugs.push({
      test: testName,
      error: error.message,
      timestamp: new Date()
    });
    
    return false;
  }
}

// Test Cases

// 1. Basic Quick Task Creation
async function testQuickTaskCreation(ws) {
  const taskData = {
    title: 'Test Quick Task',
    description: 'This is a test quick task for QA',
    priority: 'medium',
    metadata: {
      testId: 'qa-test-' + Date.now()
    }
  };
  
  const response = await apiRequest('POST', '/api/tasks/quick', taskData);
  
  assert(response.status === 201 || response.status === 200, 
    `Expected 201/200, got ${response.status}`);
  assert(response.body.success === true, 'Response should be successful');
  assert(response.body.data.taskId, 'Should return taskId');
  assert(response.body.data.farmId, 'Should return farmId');
  assert(response.body.data.farmId.startsWith('quick-task-'), 
    'Farm ID should have quick-task prefix');
  
  return response.body.data;
}

// 2. Test WebSocket Event Flow
async function testWebSocketEvents(ws) {
  const taskData = {
    title: 'WebSocket Event Test',
    description: 'Testing WebSocket event flow',
    priority: 'high'
  };
  
  // Set up event listeners
  const createdPromise = ws.waitForEvent('task:created', 10000);
  const queuedPromise = ws.waitForEvent('task:queued', 10000);
  
  // Create task
  const response = await apiRequest('POST', '/api/tasks/quick', taskData);
  const { taskId, farmId } = response.body.data;
  
  // Wait for events
  const createdEvent = await createdPromise;
  assert(createdEvent.taskId === taskId, 'Created event should have correct taskId');
  
  // Check if we get queued event
  try {
    await queuedPromise;
  } catch (error) {
    log('Warning: No task:queued event received', 'warning');
  }
  
  return { taskId, farmId };
}

// 3. Test 3-Minute Interval Quick Task
async function test3MinuteIntervalTask(ws) {
  log('Starting 3-minute interval test', 'info');
  
  const taskData = {
    title: '3-Minute Interval Test',
    description: 'Testing a task that runs for 3 minutes',
    priority: 'medium',
    timeout: 180000, // 3 minutes
    metadata: {
      interval: '3min',
      testType: 'duration'
    }
  };
  
  // Track events
  const events = [];
  ws.on('task:progress', (msg) => events.push({ type: 'progress', data: msg }));
  ws.on('task:completed', (msg) => events.push({ type: 'completed', data: msg }));
  ws.on('task:failed', (msg) => events.push({ type: 'failed', data: msg }));
  
  // Create task
  const response = await apiRequest('POST', '/api/tasks/quick', taskData);
  assert(response.body.success === true, 'Task creation should succeed');
  
  const { taskId, farmId } = response.body.data;
  log(`Created 3-min task: ${taskId} in farm: ${farmId}`, 'info');
  
  // Monitor for 3.5 minutes
  const startTime = Date.now();
  const maxWaitTime = 210000; // 3.5 minutes
  
  while (Date.now() - startTime < maxWaitTime) {
    // Check task status via API
    const statusResponse = await apiRequest('GET', `/api/tasks/${taskId}`);
    
    if (statusResponse.body?.data?.status === 'completed') {
      log('Task completed successfully', 'success');
      break;
    }
    
    if (statusResponse.body?.data?.status === 'failed') {
      throw new Error(`Task failed: ${statusResponse.body.data.error}`);
    }
    
    // Check harvest terminal
    const harvestResponse = await apiRequest('GET', '/api/harvest/terminal/sessions');
    if (harvestResponse.body?.data?.length > 0) {
      log(`Found ${harvestResponse.body.data.length} harvest sessions`, 'info');
    }
    
    await sleep(10000); // Check every 10 seconds
  }
  
  // Verify task completed within expected time
  const duration = Date.now() - startTime;
  assert(duration < maxWaitTime, `Task should complete within 3.5 minutes, took ${duration}ms`);
  
  return { taskId, farmId, events };
}

// 4. Test Harvest Terminal Display
async function testHarvestTerminal(ws) {
  // Create a quick task
  const taskData = {
    title: 'Harvest Terminal Test',
    description: 'Testing harvest terminal display',
    priority: 'high'
  };
  
  const response = await apiRequest('POST', '/api/tasks/quick', taskData);
  const { taskId, farmId } = response.body.data;
  
  // Wait for task to start processing
  await sleep(2000);
  
  // Check harvest terminal sessions
  const sessionsResponse = await apiRequest('GET', '/api/harvest/terminal/sessions');
  assert(sessionsResponse.status === 200, 'Should get terminal sessions');
  
  // Look for our quick task session
  const sessions = sessionsResponse.body.data || [];
  const quickTaskSession = sessions.find(s => 
    s.sessionName.includes(farmId) || 
    s.sessionName.includes('quick')
  );
  
  if (!quickTaskSession) {
    log('Bug: Quick task session not found in harvest terminal', 'bug');
    throw new Error('Quick task session not appearing in harvest terminal');
  }
  
  // Try to get terminal output
  if (quickTaskSession) {
    const outputResponse = await apiRequest('GET', 
      `/api/harvest/terminal/${quickTaskSession.sessionName}/0`);
    
    if (outputResponse.status === 200) {
      log('Successfully retrieved terminal output', 'success');
    } else {
      log('Warning: Could not retrieve terminal output', 'warning');
    }
  }
  
  return { taskId, farmId, session: quickTaskSession };
}

// 5. Test Task Completion and Cleanup
async function testTaskCompletionAndCleanup(ws) {
  const taskData = {
    title: 'Cleanup Test',
    description: 'Testing task completion and cleanup',
    priority: 'high',
    timeout: 30000 // 30 seconds
  };
  
  const response = await apiRequest('POST', '/api/tasks/quick', taskData);
  const { taskId, farmId } = response.body.data;
  
  // Wait for completion
  const completedEvent = await ws.waitForEvent('task:completed', 60000)
    .catch(() => null);
  
  if (!completedEvent) {
    log('Warning: Task did not complete within expected time', 'warning');
  }
  
  // Check if farm is cleaned up
  await sleep(2000);
  const farmResponse = await apiRequest('GET', `/api/farms/${farmId}`);
  
  if (farmResponse.status === 404) {
    log('Farm cleaned up successfully', 'success');
  } else if (farmResponse.body?.data?.status === 'completed') {
    log('Farm marked as completed', 'success');
  } else {
    log('Bug: Farm not properly cleaned up after task completion', 'bug');
  }
  
  return { taskId, farmId, cleaned: farmResponse.status === 404 };
}

// 6. Test Error Scenarios
async function testErrorScenarios(ws) {
  // Test invalid task data
  const invalidTask = {
    description: '' // Missing required description
  };
  
  const response1 = await apiRequest('POST', '/api/tasks/quick', invalidTask);
  assert(response1.status === 400, 'Should reject invalid task data');
  
  // Test task timeout
  const timeoutTask = {
    title: 'Timeout Test',
    description: 'This task should timeout',
    timeout: 1000 // 1 second timeout
  };
  
  const response2 = await apiRequest('POST', '/api/tasks/quick', timeoutTask);
  if (response2.body.success) {
    const { taskId } = response2.body.data;
    
    // Wait for timeout
    await sleep(2000);
    
    const statusResponse = await apiRequest('GET', `/api/tasks/${taskId}`);
    // Check if task is marked as failed or timed out
    if (statusResponse.body?.data?.status !== 'failed') {
      log('Bug: Task timeout not properly handled', 'bug');
    }
  }
  
  return true;
}

// 7. Test Multiple Concurrent Quick Tasks
async function testConcurrentQuickTasks(ws) {
  const tasks = [];
  
  // Create 3 concurrent quick tasks
  for (let i = 0; i < 3; i++) {
    const taskData = {
      title: `Concurrent Task ${i + 1}`,
      description: `Testing concurrent execution #${i + 1}`,
      priority: 'medium'
    };
    
    const response = await apiRequest('POST', '/api/tasks/quick', taskData);
    if (response.body.success) {
      tasks.push(response.body.data);
    }
  }
  
  assert(tasks.length === 3, 'Should create 3 concurrent tasks');
  
  // Monitor all tasks
  const startTime = Date.now();
  const maxWaitTime = 60000; // 1 minute
  
  while (Date.now() - startTime < maxWaitTime) {
    const allCompleted = await Promise.all(
      tasks.map(async (task) => {
        const response = await apiRequest('GET', `/api/tasks/${task.taskId}`);
        return response.body?.data?.status === 'completed';
      })
    );
    
    if (allCompleted.every(c => c)) {
      log('All concurrent tasks completed', 'success');
      break;
    }
    
    await sleep(5000);
  }
  
  return tasks;
}

// Main test runner
async function runAllTests() {
  log('=== MaiFarm Quick Task QA Test Suite ===', 'info');
  log(`Starting at: ${new Date().toISOString()}`, 'info');
  
  // Check if server is running
  try {
    const healthResponse = await apiRequest('GET', '/health');
    assert(healthResponse.status === 200, 'Server should be healthy');
    log('Server is running and healthy', 'success');
  } catch (error) {
    log('Server is not running! Please start the server first.', 'error');
    process.exit(1);
  }
  
  // Connect WebSocket
  const ws = new WSManager();
  
  try {
    await ws.connect();
  } catch (error) {
    log(`Failed to connect WebSocket: ${error.message}`, 'error');
    log('Some tests may fail without WebSocket connection', 'warning');
  }
  
  // Run test suite
  await runTest('Quick Task Creation', () => testQuickTaskCreation(ws));
  await runTest('WebSocket Event Flow', () => testWebSocketEvents(ws));
  await runTest('Harvest Terminal Display', () => testHarvestTerminal(ws));
  await runTest('Task Completion and Cleanup', () => testTaskCompletionAndCleanup(ws));
  await runTest('Error Scenarios', () => testErrorScenarios(ws));
  await runTest('Concurrent Quick Tasks', () => testConcurrentQuickTasks(ws));
  
  // Run 3-minute test last (it takes time)
  log('Starting 3-minute interval test (this will take ~3 minutes)...', 'info');
  await runTest('3-Minute Interval Task', () => test3MinuteIntervalTask(ws));
  
  // Cleanup
  ws.disconnect();
  
  // Generate report
  const duration = Date.now() - testResults.startTime.getTime();
  const minutes = Math.floor(duration / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);
  
  console.log('\n' + '='.repeat(50));
  log('=== Test Results Summary ===', 'info');
  console.log('='.repeat(50));
  
  console.log(`Total Tests: ${testResults.total}`);
  console.log(`${colors.green}Passed: ${testResults.passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${testResults.failed}${colors.reset}`);
  console.log(`Duration: ${minutes}m ${seconds}s`);
  
  if (testResults.bugs.length > 0) {
    console.log('\n' + colors.red + '=== Bugs Found ===' + colors.reset);
    testResults.bugs.forEach((bug, index) => {
      console.log(`${index + 1}. ${bug.test}: ${bug.error}`);
    });
  }
  
  // Write detailed report to file
  const report = {
    summary: {
      total: testResults.total,
      passed: testResults.passed,
      failed: testResults.failed,
      duration: `${minutes}m ${seconds}s`,
      timestamp: new Date().toISOString()
    },
    tests: testResults.tests,
    bugs: testResults.bugs
  };
  
  require('fs').writeFileSync(
    'qa-quick-task-report.json',
    JSON.stringify(report, null, 2)
  );
  
  log('Detailed report saved to: qa-quick-task-report.json', 'info');
  
  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  console.error(error);
  process.exit(1);
});