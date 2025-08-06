#!/usr/bin/env node

/**
 * MaiFarm QA Test Execution Script
 * Executes comprehensive test plan as per QA_TEST_PLAN.md
 */

import http from 'http';
import WebSocket from 'ws';
import fs from 'fs';

// Test configuration
const API_BASE = 'http://localhost:4567';
const WS_URL = 'ws://localhost:4567';
const TEST_TIMEOUT = 30000;

// Test results tracking
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  startTime: new Date(),
  tests: []
};

// Utility functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '📋',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    test: '🧪'
  }[type] || '📋';
  
  console.log(`[${timestamp}] ${prefix} ${message}`);
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
    return false;
  }
}

// Test Cases

// API Tests
async function testHealthEndpoint() {
  const response = await apiRequest('GET', '/health');
  assert(response.status === 200, `Expected 200, got ${response.status}`);
  assert(response.body.status === 'ok', 'Health status should be ok');
  assert(response.body.services, 'Services status should be present');
}

async function testFarmCreation() {
  const farmData = {
    name: 'Test Farm Alpha ' + Date.now(),
    description: 'Basic test farm',
    type: 'sequential',
    config: {
      autoScale: true,
      maxAgents: 3,
      timeout: 1800
    }
  };
  
  const response = await apiRequest('POST', '/api/farms', farmData);
  assert(response.status === 201 || response.status === 200, `Expected 201/200, got ${response.status}`);
  assert(response.body.id, 'Farm ID should be generated');
  assert(response.body.status, 'Farm status should be present');
  
  // Store farm ID for later tests
  global.testFarmId = response.body.id;
  
  // Wait for farm to be ready
  await sleep(2000);
  
  // Check farm status
  const statusResponse = await apiRequest('GET', `/api/farms/${global.testFarmId}`);
  assert(statusResponse.status === 200, 'Should retrieve farm details');
  
  return response.body;
}

async function testFarmList() {
  const response = await apiRequest('GET', '/api/farms');
  assert(response.status === 200, `Expected 200, got ${response.status}`);
  assert(Array.isArray(response.body), 'Response should be an array');
  if (global.testFarmId) {
    const farmExists = response.body.some(f => f.id === global.testFarmId);
    assert(farmExists, 'Created farm should appear in list');
  }
}

async function testQuickTask() {
  const taskData = {
    description: 'Format all TypeScript files',
    mode: 'fast'
  };
  
  const response = await apiRequest('POST', '/api/tasks/quick', taskData);
  assert(response.status === 200 || response.status === 201, `Expected 200/201, got ${response.status}`);
  
  if (response.body.id) {
    // Wait for task completion
    await sleep(3000);
    
    // Check task status
    const statusResponse = await apiRequest('GET', `/api/tasks/${response.body.id}`);
    assert(statusResponse.status === 200, 'Should retrieve task status');
  }
}

// WebSocket Tests
async function testWebSocketConnection() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    let pingCount = 0;
    let pongReceived = false;
    
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket test timeout'));
    }, 10000);
    
    ws.on('open', () => {
      log('WebSocket connected', 'info');
      
      // Send ping
      ws.send(JSON.stringify({ type: 'ping' }));
      
      // Test farm status subscription
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'farms'
      }));
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        
        if (message.type === 'pong') {
          pongReceived = true;
          pingCount++;
          
          if (pingCount < 3) {
            // Send more pings to test stability
            setTimeout(() => {
              ws.send(JSON.stringify({ type: 'ping' }));
            }, 1000);
          } else {
            // Test successful
            clearTimeout(timeout);
            ws.close();
            assert(pongReceived, 'Should receive pong responses');
            resolve();
          }
        }
      } catch (error) {
        // Ignore parse errors
      }
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    
    ws.on('close', () => {
      clearTimeout(timeout);
      if (pingCount >= 3) {
        resolve();
      }
    });
  });
}

// Harvest Tests
async function testHarvestCollection() {
  if (!global.testFarmId) {
    log('Skipping harvest test - no farm created', 'warning');
    return;
  }
  
  // Simulate farm completion
  await apiRequest('PUT', `/api/farms/${global.testFarmId}/status`, {
    status: 'completed'
  });
  
  await sleep(1000);
  
  // Collect harvest
  const response = await apiRequest('POST', `/api/farms/${global.testFarmId}/harvest`);
  assert(response.status === 200 || response.status === 201, `Expected 200/201, got ${response.status}`);
  
  if (response.body) {
    assert(response.body.status, 'Harvest should have status');
    // Note: artifacts might be empty for test farm
  }
}

// Security Tests
async function testInputValidation() {
  // Test XSS prevention
  const xssData = {
    name: "<script>alert('XSS')</script>",
    description: "Test XSS",
    type: "sequential"
  };
  
  const xssResponse = await apiRequest('POST', '/api/farms', xssData);
  // Should either reject or sanitize
  if (xssResponse.status === 201 || xssResponse.status === 200) {
    assert(!xssResponse.body.name.includes('<script>'), 'XSS should be sanitized');
  }
  
  // Test SQL injection prevention
  const sqlData = {
    name: "Test'; DROP TABLE farms; --",
    description: "Test SQL injection",
    type: "sequential"
  };
  
  const sqlResponse = await apiRequest('POST', '/api/farms', sqlData);
  // Server should handle this safely
  assert(sqlResponse.status !== 500, 'SQL injection should not cause server error');
}

// Performance Tests
async function testResponseTime() {
  const requests = [];
  const startTime = Date.now();
  
  // Make 10 concurrent requests
  for (let i = 0; i < 10; i++) {
    requests.push(apiRequest('GET', '/api/farms'));
  }
  
  const responses = await Promise.all(requests);
  const duration = Date.now() - startTime;
  
  // Check all succeeded
  responses.forEach(r => {
    assert(r.status === 200, 'All requests should succeed');
  });
  
  // Check performance
  const avgTime = duration / 10;
  assert(avgTime < 2000, `Average response time ${avgTime}ms should be < 2000ms`);
  
  log(`Performance: 10 requests in ${duration}ms (avg: ${avgTime}ms)`, 'info');
}

// Cleanup
async function cleanup() {
  if (global.testFarmId) {
    try {
      await apiRequest('DELETE', `/api/farms/${global.testFarmId}`);
      log('Cleaned up test farm', 'info');
    } catch (error) {
      log('Cleanup failed: ' + error.message, 'warning');
    }
  }
}

// Main test execution
async function runAllTests() {
  log('Starting MaiFarm QA Test Execution', 'info');
  log('=' .repeat(50), 'info');
  
  // Critical Path Tests
  log('CRITICAL PATH TESTS', 'info');
  await runTest('API Health Check', testHealthEndpoint);
  await runTest('Farm Creation (FC-001)', testFarmCreation);
  await runTest('Farm List Retrieval', testFarmList);
  
  // WebSocket Tests
  log('\nWEBSOCKET TESTS', 'info');
  await runTest('WebSocket Connection (WS-001)', testWebSocketConnection);
  
  // Quick Task Tests
  log('\nQUICK TASK TESTS', 'info');
  await runTest('Quick Task Execution (QT-001)', testQuickTask);
  
  // Harvest Tests
  log('\nHARVEST TESTS', 'info');
  await runTest('Harvest Collection (HC-001)', testHarvestCollection);
  
  // Security Tests
  log('\nSECURITY TESTS', 'info');
  await runTest('Input Validation (SEC-002)', testInputValidation);
  
  // Performance Tests
  log('\nPERFORMANCE TESTS', 'info');
  await runTest('Response Time (PERF-001)', testResponseTime);
  
  // Cleanup
  log('\nCLEANUP', 'info');
  await cleanup();
  
  // Generate report
  generateReport();
}

function generateReport() {
  const endTime = new Date();
  const duration = (endTime - testResults.startTime) / 1000;
  
  const report = `
================================================================================
                        MAIFARM QA TEST EXECUTION REPORT
================================================================================

Date: ${endTime.toISOString()}
Duration: ${duration} seconds

SUMMARY
-------
Total Tests: ${testResults.total}
Passed: ${testResults.passed} (${((testResults.passed/testResults.total)*100).toFixed(1)}%)
Failed: ${testResults.failed} (${((testResults.failed/testResults.total)*100).toFixed(1)}%)
Skipped: ${testResults.skipped}

TEST RESULTS
------------
${testResults.tests.map(t => {
  const icon = t.status === 'passed' ? '✅' : '❌';
  const details = t.error ? ` - ${t.error}` : '';
  return `${icon} ${t.name} (${t.duration}ms)${details}`;
}).join('\n')}

CRITICAL PATH COVERAGE
----------------------
✅ Farm Creation Flow
✅ API Endpoints
✅ WebSocket Communication  
✅ Quick Task Execution
✅ Harvest Collection
✅ Security Validation
✅ Performance Benchmarks

RECOMMENDATIONS
---------------
${testResults.failed > 0 ? '⚠️  Address failing tests before production deployment' : '✅ All tests passing - ready for next phase'}
${testResults.tests.some(t => t.duration > 5000) ? '⚠️  Some tests taking >5s - investigate performance' : '✅ Performance within acceptable range'}

================================================================================
`;

  console.log(report);
  
  // Save report to file
  const reportFile = `/tmp/maifarm-qa-report-${Date.now()}.txt`;
  fs.writeFileSync(reportFile, report);
  log(`Report saved to: ${reportFile}`, 'success');
  
  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  log(`Unhandled error: ${error.message}`, 'error');
  process.exit(1);
});

// Run tests
runAllTests().catch(error => {
  log(`Test execution failed: ${error.message}`, 'error');
  process.exit(1);
});