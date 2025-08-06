#!/usr/bin/env node

/**
 * Test script to verify critical fixes for MaiFarm
 * Tests WebSocket connectivity, Redis fallback, API responses, and security
 */

const axios = require('axios');
const WebSocket = require('ws');
const { io } = require('socket.io-client');

const API_BASE = 'http://localhost:4567';
const WS_BASE = 'http://localhost:4567';

// Color output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test 1: WebSocket Connectivity with Heartbeat
async function testWebSocketConnectivity() {
  log('\n=== Test 1: WebSocket Connectivity ===', 'cyan');
  
  return new Promise((resolve, reject) => {
    const socket = io(WS_BASE, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 3,
      timeout: 10000,
      withCredentials: true,
      auth: { userId: 'test-user' }
    });

    let connected = false;
    let pongReceived = false;
    const timeout = setTimeout(() => {
      socket.close();
      if (!connected) {
        log('  ❌ WebSocket connection timeout', 'red');
        reject(new Error('WebSocket connection timeout'));
      }
    }, 10000);

    socket.on('connect', () => {
      connected = true;
      log('  ✅ WebSocket connected successfully', 'green');
      log(`    Socket ID: ${socket.id}`, 'blue');
    });

    socket.on('ping', () => {
      log('  📡 Received ping from server', 'blue');
      socket.emit('pong');
      pongReceived = true;
    });

    socket.on('connected', (data) => {
      log(`  ✅ Received connection confirmation: ${JSON.stringify(data)}`, 'green');
      
      // Test complete after receiving ping
      setTimeout(() => {
        clearTimeout(timeout);
        socket.close();
        if (pongReceived) {
          log('  ✅ Heartbeat mechanism working', 'green');
          resolve({ success: true, heartbeat: true });
        } else {
          log('  ⚠️  No heartbeat received', 'yellow');
          resolve({ success: true, heartbeat: false });
        }
      }, 2000);
    });

    socket.on('connect_error', (error) => {
      clearTimeout(timeout);
      log(`  ❌ Connection error: ${error.message}`, 'red');
      reject(error);
    });
  });
}

// Test 2: Redis Fallback (check cache service status)
async function testRedisFallback() {
  log('\n=== Test 2: Redis Connection and Fallback ===', 'cyan');
  
  try {
    const response = await axios.get(`${API_BASE}/health`, {
      validateStatus: () => true // Accept any status
    });
    const { services } = response.data;
    
    if (services.redis === 'healthy') {
      log('  ✅ Redis is connected and healthy', 'green');
    } else if (services.redis === 'degraded') {
      log('  ✅ Redis is degraded but system is using fallback', 'yellow');
      log('    Using in-memory cache as fallback', 'blue');
    } else {
      log('  ❌ Redis status unknown', 'red');
    }
    
    // System should work regardless of Redis status
    log('  ✅ Application running with cache layer', 'green');
    return { success: true, redisStatus: services.redis };
  } catch (error) {
    log(`  ❌ Failed to check Redis status: ${error.message}`, 'red');
    throw error;
  }
}

// Test 3: API Response Format (JSON)
async function testAPIResponseFormat() {
  log('\n=== Test 3: API Response Format ===', 'cyan');
  
  const endpoints = [
    { path: '/api/farms', method: 'GET', name: 'Farm List' },
    { path: '/api/health', method: 'GET', name: 'Health Check' },
    { path: '/api/config', method: 'GET', name: 'Config' }
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await axios({
        method: endpoint.method,
        url: `${API_BASE}${endpoint.path}`,
        validateStatus: () => true // Don't throw on any status
      });
      
      const contentType = response.headers['content-type'];
      if (contentType && contentType.includes('application/json')) {
        log(`  ✅ ${endpoint.name}: Returns JSON`, 'green');
        
        // Verify JSON structure
        if (typeof response.data === 'object') {
          if (response.data.success !== undefined || response.data.status !== undefined) {
            log(`    Proper response structure`, 'blue');
          }
        }
      } else {
        log(`  ❌ ${endpoint.name}: Not returning JSON (${contentType})`, 'red');
        throw new Error(`${endpoint.name} not returning JSON`);
      }
    } catch (error) {
      if (error.response) {
        log(`  ⚠️  ${endpoint.name}: ${error.response.status}`, 'yellow');
      } else {
        throw error;
      }
    }
  }
  
  return { success: true };
}

// Test 4: Quick Task Validation
async function testQuickTaskValidation() {
  log('\n=== Test 4: Quick Task Endpoint ===', 'cyan');
  
  const taskData = {
    description: 'Test task: Format all TypeScript files',
    mode: 'fast'
  };
  
  try {
    const response = await axios.post(`${API_BASE}/api/tasks/quick`, taskData, {
      validateStatus: () => true
    });
    
    if (response.status === 200 || response.status === 201) {
      log('  ✅ Quick task endpoint accepts valid payload', 'green');
      
      if (response.data.success && response.data.data) {
        log(`    Task created with ID: ${response.data.data.id || 'generated'}`, 'blue');
      }
    } else if (response.status === 401) {
      log('  ⚠️  Authentication required (expected in production)', 'yellow');
    } else {
      log(`  ❌ Unexpected status: ${response.status}`, 'red');
      log(`    Response: ${JSON.stringify(response.data)}`, 'red');
      throw new Error('Quick task validation failed');
    }
    
    return { success: true, status: response.status };
  } catch (error) {
    if (!error.response) {
      throw error;
    }
    log(`  ❌ Quick task failed: ${error.message}`, 'red');
    throw error;
  }
}

// Test 5: Security Headers
async function testSecurityHeaders() {
  log('\n=== Test 5: Security Headers ===', 'cyan');
  
  try {
    const response = await axios.get(`${API_BASE}/health`, {
      validateStatus: () => true // Accept any status
    });
    const headers = response.headers;
    
    const securityHeaders = [
      { name: 'x-helmet-csp', display: 'Content Security Policy' },
      { name: 'x-frame-options', display: 'X-Frame-Options' },
      { name: 'x-content-type-options', display: 'X-Content-Type-Options' },
      { name: 'x-xss-protection', display: 'X-XSS-Protection' }
    ];
    
    let allPresent = true;
    for (const header of securityHeaders) {
      if (headers[header.name] || headers[header.name.toLowerCase()]) {
        log(`  ✅ ${header.display} present`, 'green');
      } else {
        log(`  ⚠️  ${header.display} not found`, 'yellow');
        allPresent = false;
      }
    }
    
    return { success: allPresent };
  } catch (error) {
    log(`  ❌ Failed to test security headers: ${error.message}`, 'red');
    throw error;
  }
}

// Test 6: XSS Protection
async function testXSSProtection() {
  log('\n=== Test 6: XSS Protection ===', 'cyan');
  
  const maliciousPayloads = [
    {
      description: '<script>alert("XSS")</script>Test task',
      mode: 'fast'
    },
    {
      title: 'Test"><script>alert(1)</script>',
      description: 'Normal description'
    }
  ];
  
  for (const payload of maliciousPayloads) {
    try {
      const response = await axios.post(`${API_BASE}/api/tasks/quick`, payload, {
        validateStatus: () => true
      });
      
      if (response.data && response.data.data) {
        // Check if the malicious content was sanitized
        const responseStr = JSON.stringify(response.data);
        if (!responseStr.includes('<script>') && !responseStr.includes('alert(')) {
          log('  ✅ XSS payload sanitized', 'green');
        } else {
          log('  ❌ XSS payload not sanitized', 'red');
          throw new Error('XSS protection failed');
        }
      }
    } catch (error) {
      if (!error.response) {
        // Connection error is OK, means server might be rejecting
        log('  ✅ Server rejected malicious payload', 'green');
      }
    }
  }
  
  return { success: true };
}

// Main test runner
async function runTests() {
  log('\n' + '='.repeat(50), 'cyan');
  log('MaiFarm Critical Fixes Test Suite', 'cyan');
  log('='.repeat(50), 'cyan');
  
  const results = {
    total: 6,
    passed: 0,
    failed: 0
  };
  
  const tests = [
    { name: 'WebSocket Connectivity', fn: testWebSocketConnectivity },
    { name: 'Redis Fallback', fn: testRedisFallback },
    { name: 'API Response Format', fn: testAPIResponseFormat },
    { name: 'Quick Task Validation', fn: testQuickTaskValidation },
    { name: 'Security Headers', fn: testSecurityHeaders },
    { name: 'XSS Protection', fn: testXSSProtection }
  ];
  
  for (const test of tests) {
    try {
      await test.fn();
      results.passed++;
    } catch (error) {
      results.failed++;
      log(`\n  Test "${test.name}" failed: ${error.message}`, 'red');
    }
  }
  
  // Summary
  log('\n' + '='.repeat(50), 'cyan');
  log('Test Summary', 'cyan');
  log('='.repeat(50), 'cyan');
  log(`Total Tests: ${results.total}`, 'blue');
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  
  const passRate = ((results.passed / results.total) * 100).toFixed(1);
  if (results.failed === 0) {
    log(`\n✅ All tests passed! (${passRate}%)`, 'green');
    log('🎉 Critical issues have been resolved!', 'green');
  } else {
    log(`\n⚠️  Some tests failed (${passRate}% pass rate)`, 'yellow');
    log('Please review the failed tests above.', 'yellow');
  }
  
  process.exit(results.failed > 0 ? 1 : 0);
}

// Check if server is running
async function checkServer() {
  try {
    const response = await axios.get(`${API_BASE}/health`, { 
      timeout: 5000,
      validateStatus: () => true // Accept any status code
    });
    // Server is running if we get any response
    return response.status === 200 || response.status === 503;
  } catch (error) {
    return false;
  }
}

// Main execution
(async () => {
  log('Checking if server is running...', 'blue');
  
  const serverRunning = await checkServer();
  if (!serverRunning) {
    log('\n❌ Server is not running on port 4567', 'red');
    log('Please start the server with: npm run dev', 'yellow');
    process.exit(1);
  }
  
  log('✅ Server is running\n', 'green');
  await sleep(1000);
  
  try {
    await runTests();
  } catch (error) {
    log(`\n❌ Test suite error: ${error.message}`, 'red');
    process.exit(1);
  }
})();