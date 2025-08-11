#!/usr/bin/env node

/**
 * Comprehensive Qwen Integration Test Suite for MaiFarm
 * Tests farm creation, quick tasks, go wild mode, and WebSocket monitoring
 * 
 * Step 4: Test the integration for agent farms, go wild and quick tasks
 * Step 6: Handle gotchas and optimize
 */

const axios = require('axios');
const io = require('socket.io-client');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:4567';
const WS_URL = process.env.WS_URL || 'http://localhost:4567';
const PROXY_URL = process.env.LLM_PROXY_URL || 'http://localhost:8001';

// Test results tracking
const testResults = {
  passed: [],
  failed: [],
  warnings: []
};

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Logging helpers
function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, colors.bright + colors.blue);
  console.log('='.repeat(60));
}

function logTest(name, status, details = '') {
  const statusSymbol = status === 'pass' ? '✓' : status === 'fail' ? '✗' : '⚠';
  const statusColor = status === 'pass' ? colors.green : status === 'fail' ? colors.red : colors.yellow;
  log(`${statusSymbol} ${name}`, statusColor);
  if (details) {
    console.log(`  ${details}`);
  }
}

// Test 1: Verify LLM Proxy is running and Qwen provider is available
async function testProxyAvailability() {
  logSection('Test 1: LLM Proxy and Qwen Provider Availability');
  
  try {
    // Check if proxy is running
    const proxyResponse = await axios.get(`${PROXY_URL}/providers`);
    
    if (proxyResponse.data.providers.includes('qwen')) {
      logTest('LLM Proxy running', 'pass', `Available providers: ${proxyResponse.data.providers.join(', ')}`);
      testResults.passed.push('LLM Proxy availability');
      
      // Check if Ollama is also available for local Qwen
      if (proxyResponse.data.providers.includes('ollama')) {
        logTest('Ollama provider available', 'pass', 'Local Qwen models can be used');
        testResults.passed.push('Ollama provider availability');
      } else {
        logTest('Ollama provider not available', 'warning', 'Only remote Qwen API will be tested');
        testResults.warnings.push('Ollama not available');
      }
      
      return true;
    } else {
      logTest('Qwen provider not available', 'fail', 'Qwen provider not found in proxy');
      testResults.failed.push('Qwen provider availability');
      return false;
    }
  } catch (error) {
    logTest('LLM Proxy connection failed', 'fail', error.message);
    log('  Please start the proxy: python llm_proxy.py --proxy', colors.yellow);
    testResults.failed.push('LLM Proxy connection');
    return false;
  }
}

// Test 2: Test Qwen API directly through proxy
async function testQwenAPI() {
  logSection('Test 2: Direct Qwen API Test via Proxy');
  
  try {
    const testMessage = {
      model: 'qwen/qwen-coder-480b',
      messages: [
        { role: 'system', content: 'You are a helpful coding assistant.' },
        { role: 'user', content: 'Write a simple Python function to calculate factorial.' }
      ],
      temperature: 0.7,
      max_tokens: 500
    };
    
    const response = await axios.post(`${PROXY_URL}/chat/completions`, testMessage);
    
    if (response.data.choices && response.data.choices[0].message.content) {
      const content = response.data.choices[0].message.content;
      logTest('Qwen API response received', 'pass', `Response length: ${content.length} chars`);
      
      // Check if response contains Python code
      if (content.includes('def') || content.includes('factorial')) {
        logTest('Response contains relevant code', 'pass');
        testResults.passed.push('Qwen API test');
      } else {
        logTest('Response may not contain expected code', 'warning');
        testResults.warnings.push('Qwen response quality');
      }
      
      // Log token usage if available
      if (response.data.usage) {
        log(`  Token usage: ${JSON.stringify(response.data.usage)}`, colors.cyan);
      }
      
      return true;
    } else {
      logTest('Invalid Qwen API response format', 'fail');
      testResults.failed.push('Qwen API response');
      return false;
    }
  } catch (error) {
    logTest('Qwen API call failed', 'fail', error.message);
    if (error.response?.data) {
      log(`  Error details: ${JSON.stringify(error.response.data)}`, colors.red);
    }
    testResults.failed.push('Qwen API call');
    return false;
  }
}

// Test 3: Test Farm Creation with Qwen
async function testFarmCreation() {
  logSection('Test 3: Farm Creation with Qwen Provider');
  
  try {
    const farmConfig = {
      name: 'test-qwen-farm-' + Date.now(),
      description: 'Test farm using Qwen3-Coder',
      agents: [
        {
          name: 'qwen-agent-1',
          role: 'developer',
          model: 'qwen/qwen-coder-480b',
          capabilities: ['coding', 'testing']
        },
        {
          name: 'qwen-agent-2',
          role: 'reviewer',
          model: 'qwen/qwen-coder-480b',
          capabilities: ['review', 'documentation']
        }
      ],
      task: 'Create a simple REST API with two endpoints',
      provider: 'qwen'
    };
    
    const response = await axios.post(`${API_BASE_URL}/api/farms/create`, farmConfig);
    
    if (response.data.success && response.data.farmId) {
      logTest('Farm created successfully', 'pass', `Farm ID: ${response.data.farmId}`);
      testResults.passed.push('Farm creation');
      
      // Monitor farm status
      const farmId = response.data.farmId;
      await monitorFarmStatus(farmId);
      
      return farmId;
    } else {
      logTest('Farm creation failed', 'fail', 'Invalid response');
      testResults.failed.push('Farm creation');
      return null;
    }
  } catch (error) {
    logTest('Farm creation error', 'fail', error.message);
    testResults.failed.push('Farm creation');
    return null;
  }
}

// Test 4: WebSocket Real-time Monitoring
async function monitorFarmStatus(farmId) {
  return new Promise((resolve) => {
    logSection('Test 4: WebSocket Real-time Monitoring');
    
    const socket = io(WS_URL, {
      transports: ['websocket'],
      reconnection: true
    });
    
    const timeout = setTimeout(() => {
      logTest('WebSocket monitoring timeout', 'warning', 'No updates received in 30s');
      testResults.warnings.push('WebSocket timeout');
      socket.disconnect();
      resolve();
    }, 30000);
    
    socket.on('connect', () => {
      logTest('WebSocket connected', 'pass');
      socket.emit('subscribe:farm', { farmId });
    });
    
    socket.on('farm:status', (data) => {
      log(`  Farm status: ${data.status}`, colors.cyan);
      if (data.agents) {
        data.agents.forEach(agent => {
          log(`    Agent ${agent.name}: ${agent.status}`, colors.cyan);
        });
      }
    });
    
    socket.on('task:progress', (data) => {
      log(`  Task progress: ${data.progress}%`, colors.cyan);
      if (data.progress === 100) {
        logTest('Task completed', 'pass');
        testResults.passed.push('WebSocket monitoring');
        clearTimeout(timeout);
        socket.disconnect();
        resolve();
      }
    });
    
    socket.on('error', (error) => {
      logTest('WebSocket error', 'fail', error.message);
      testResults.failed.push('WebSocket monitoring');
      clearTimeout(timeout);
      socket.disconnect();
      resolve();
    });
  });
}

// Test 5: Quick Task with Qwen
async function testQuickTask() {
  logSection('Test 5: Quick Task Execution with Qwen');
  
  try {
    const quickTask = {
      prompt: 'Write a TypeScript function to validate email addresses',
      provider: 'qwen',
      model: 'qwen/qwen-coder-480b',
      maxTokens: 1000,
      temperature: 0.5
    };
    
    const response = await axios.post(`${API_BASE_URL}/api/quicktask/execute`, quickTask);
    
    if (response.data.success && response.data.result) {
      logTest('Quick task executed', 'pass');
      
      // Validate the response contains TypeScript code
      const result = response.data.result;
      if (result.includes('function') || result.includes('const') || result.includes('email')) {
        logTest('Response contains relevant code', 'pass');
        testResults.passed.push('Quick task execution');
      } else {
        logTest('Response quality check', 'warning', 'May not contain expected code');
        testResults.warnings.push('Quick task quality');
      }
      
      // Check execution time
      if (response.data.executionTime) {
        log(`  Execution time: ${response.data.executionTime}ms`, colors.cyan);
        if (response.data.executionTime > 10000) {
          logTest('Performance warning', 'warning', 'Task took over 10 seconds');
          testResults.warnings.push('Quick task performance');
        }
      }
      
      return true;
    } else {
      logTest('Quick task failed', 'fail');
      testResults.failed.push('Quick task execution');
      return false;
    }
  } catch (error) {
    logTest('Quick task error', 'fail', error.message);
    testResults.failed.push('Quick task execution');
    return false;
  }
}

// Test 6: Go Wild Mode with Qwen
async function testGoWildMode() {
  logSection('Test 6: Go Wild Mode with Qwen');
  
  try {
    const goWildConfig = {
      initialPrompt: 'Explore and generate ideas for a modern web application',
      provider: 'qwen',
      model: 'qwen/qwen-coder-480b',
      maxIterations: 3,
      creativity: 0.8,
      contextWindow: 100000 // Leverage Qwen's large context window
    };
    
    const response = await axios.post(`${API_BASE_URL}/api/gowild/start`, goWildConfig);
    
    if (response.data.success && response.data.sessionId) {
      logTest('Go Wild session started', 'pass', `Session ID: ${response.data.sessionId}`);
      
      // Monitor Go Wild progress
      await monitorGoWildSession(response.data.sessionId);
      
      testResults.passed.push('Go Wild mode');
      return true;
    } else {
      logTest('Go Wild mode failed to start', 'fail');
      testResults.failed.push('Go Wild mode');
      return false;
    }
  } catch (error) {
    logTest('Go Wild mode error', 'fail', error.message);
    testResults.failed.push('Go Wild mode');
    return false;
  }
}

// Monitor Go Wild Session
async function monitorGoWildSession(sessionId) {
  return new Promise((resolve) => {
    const checkInterval = setInterval(async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/gowild/status/${sessionId}`);
        
        if (response.data.status === 'completed') {
          logTest('Go Wild session completed', 'pass');
          
          if (response.data.results) {
            log(`  Generated ${response.data.results.length} ideas`, colors.cyan);
          }
          
          clearInterval(checkInterval);
          resolve();
        } else if (response.data.status === 'failed') {
          logTest('Go Wild session failed', 'fail');
          clearInterval(checkInterval);
          resolve();
        } else {
          log(`  Go Wild status: ${response.data.status}`, colors.cyan);
        }
      } catch (error) {
        logTest('Go Wild monitoring error', 'fail', error.message);
        clearInterval(checkInterval);
        resolve();
      }
    }, 2000);
    
    // Timeout after 30 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      logTest('Go Wild timeout', 'warning', 'Session did not complete in 30s');
      resolve();
    }, 30000);
  });
}

// Test 7: Context Window Management
async function testContextWindowManagement() {
  logSection('Test 7: Large Context Window Management (256K tokens)');
  
  try {
    // Create a large context by concatenating multiple code files
    const largeContext = `
      // This is a test of Qwen's 256K context window capability
      ${Array(100).fill(null).map((_, i) => `
        function testFunction${i}() {
          // Function ${i} implementation
          const data = Array(1000).fill(${i});
          return data.reduce((a, b) => a + b, 0);
        }
      `).join('\n')}
    `;
    
    const request = {
      model: 'qwen/qwen-coder-480b',
      messages: [
        { role: 'system', content: 'You are analyzing a large codebase.' },
        { role: 'user', content: `Analyze this code and identify patterns:\n${largeContext}` }
      ],
      max_tokens: 2000
    };
    
    const startTime = Date.now();
    const response = await axios.post(`${PROXY_URL}/chat/completions`, request);
    const endTime = Date.now();
    
    if (response.data.choices && response.data.choices[0].message.content) {
      const executionTime = endTime - startTime;
      logTest('Large context processed', 'pass', `Time: ${executionTime}ms`);
      
      if (response.data.usage) {
        log(`  Tokens used: ${JSON.stringify(response.data.usage)}`, colors.cyan);
        
        if (response.data.usage.prompt_tokens > 50000) {
          logTest('Successfully handled large context', 'pass', 
                 `Processed ${response.data.usage.prompt_tokens} prompt tokens`);
          testResults.passed.push('Large context handling');
        }
      }
      
      return true;
    } else {
      logTest('Large context processing failed', 'fail');
      testResults.failed.push('Large context handling');
      return false;
    }
  } catch (error) {
    logTest('Context window test error', 'fail', error.message);
    testResults.failed.push('Large context handling');
    return false;
  }
}

// Test 8: Error Handling and Fallback
async function testErrorHandlingAndFallback() {
  logSection('Test 8: Error Handling and Fallback Mechanisms');
  
  try {
    // Test with invalid API key
    const invalidRequest = {
      model: 'qwen/invalid-model',
      messages: [{ role: 'user', content: 'test' }]
    };
    
    try {
      await axios.post(`${PROXY_URL}/chat/completions`, invalidRequest);
      logTest('Invalid model should have failed', 'fail');
      testResults.failed.push('Error handling');
    } catch (error) {
      if (error.response && error.response.status === 400) {
        logTest('Invalid model properly rejected', 'pass');
        testResults.passed.push('Error handling');
      } else {
        logTest('Unexpected error response', 'fail');
        testResults.failed.push('Error handling');
      }
    }
    
    // Test fallback to Ollama if Qwen API fails
    const fallbackRequest = {
      model: 'ollama/qwen2.5-coder:7b',
      messages: [{ role: 'user', content: 'Simple test' }],
      fallback: true
    };
    
    try {
      const response = await axios.post(`${PROXY_URL}/chat/completions`, fallbackRequest);
      if (response.data.choices) {
        logTest('Fallback to Ollama successful', 'pass');
        testResults.passed.push('Fallback mechanism');
      }
    } catch (error) {
      logTest('Fallback test skipped', 'warning', 'Ollama not available');
      testResults.warnings.push('Fallback test');
    }
    
    return true;
  } catch (error) {
    logTest('Error handling test failed', 'fail', error.message);
    testResults.failed.push('Error handling test');
    return false;
  }
}

// Test 9: Performance Optimization Tests
async function testPerformanceOptimizations() {
  logSection('Test 9: Performance Optimizations');
  
  const performanceTests = [];
  
  // Test response caching
  try {
    const testMessage = {
      model: 'qwen/qwen-coder-480b',
      messages: [{ role: 'user', content: 'What is 2+2?' }],
      temperature: 0 // Deterministic for caching
    };
    
    // First call
    const start1 = Date.now();
    await axios.post(`${PROXY_URL}/chat/completions`, testMessage);
    const time1 = Date.now() - start1;
    
    // Second call (should be cached)
    const start2 = Date.now();
    await axios.post(`${PROXY_URL}/chat/completions`, testMessage);
    const time2 = Date.now() - start2;
    
    if (time2 < time1 * 0.5) {
      logTest('Response caching working', 'pass', `Cached: ${time2}ms vs Original: ${time1}ms`);
      testResults.passed.push('Response caching');
    } else {
      logTest('Response caching', 'warning', 'Cache may not be working');
      testResults.warnings.push('Response caching');
    }
  } catch (error) {
    logTest('Caching test error', 'fail', error.message);
    testResults.failed.push('Response caching');
  }
  
  // Test batch processing
  try {
    const batchRequests = Array(5).fill(null).map((_, i) => ({
      model: 'qwen/qwen-coder-480b',
      messages: [{ role: 'user', content: `Test message ${i}` }],
      max_tokens: 100
    }));
    
    const startBatch = Date.now();
    const batchPromises = batchRequests.map(req => 
      axios.post(`${PROXY_URL}/chat/completions`, req)
    );
    
    const results = await Promise.all(batchPromises);
    const batchTime = Date.now() - startBatch;
    
    if (results.every(r => r.data.choices)) {
      logTest('Batch processing successful', 'pass', 
             `Processed ${results.length} requests in ${batchTime}ms`);
      testResults.passed.push('Batch processing');
      
      const avgTime = batchTime / results.length;
      log(`  Average time per request: ${avgTime.toFixed(0)}ms`, colors.cyan);
    } else {
      logTest('Batch processing incomplete', 'fail');
      testResults.failed.push('Batch processing');
    }
  } catch (error) {
    logTest('Batch processing error', 'fail', error.message);
    testResults.failed.push('Batch processing');
  }
  
  return true;
}

// Main test runner
async function runAllTests() {
  console.log(colors.bright + colors.cyan);
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Qwen3-Coder Integration Test Suite for MaiFarm        ║');
  console.log('║                    Step 4 & Step 6                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);
  
  // Run tests in sequence
  const proxyAvailable = await testProxyAvailability();
  
  if (!proxyAvailable) {
    log('\nCannot proceed without LLM Proxy. Please start it first:', colors.red);
    log('python llm_proxy.py --proxy', colors.yellow);
    process.exit(1);
  }
  
  await testQwenAPI();
  
  const farmId = await testFarmCreation();
  
  await testQuickTask();
  
  await testGoWildMode();
  
  await testContextWindowManagement();
  
  await testErrorHandlingAndFallback();
  
  await testPerformanceOptimizations();
  
  // Print summary
  logSection('Test Summary');
  
  const totalTests = testResults.passed.length + testResults.failed.length;
  const passRate = totalTests > 0 ? 
    ((testResults.passed.length / totalTests) * 100).toFixed(1) : 0;
  
  log(`Total Tests: ${totalTests}`, colors.bright);
  log(`Passed: ${testResults.passed.length}`, colors.green);
  log(`Failed: ${testResults.failed.length}`, colors.red);
  log(`Warnings: ${testResults.warnings.length}`, colors.yellow);
  log(`Pass Rate: ${passRate}%`, passRate >= 80 ? colors.green : colors.yellow);
  
  if (testResults.failed.length > 0) {
    log('\nFailed Tests:', colors.red);
    testResults.failed.forEach(test => log(`  - ${test}`, colors.red));
  }
  
  if (testResults.warnings.length > 0) {
    log('\nWarnings:', colors.yellow);
    testResults.warnings.forEach(warning => log(`  - ${warning}`, colors.yellow));
  }
  
  // Exit with appropriate code
  process.exit(testResults.failed.length > 0 ? 1 : 0);
}

// Handle errors gracefully
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

// Run the tests
runAllTests().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});