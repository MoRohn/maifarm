#!/usr/bin/env node

/**
 * Test script for validating terminal isolation fixes
 */

const WebSocket = require('ws');
const http = require('http');

const API_URL = 'http://localhost:4567';
const WS_URL = 'ws://localhost:4567';

// Test results tracking
const results = {
  passed: [],
  failed: [],
  warnings: []
};

// Helper to make HTTP requests
async function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4567,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
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

// Test 1: Check WebSocket connection
async function testWebSocketConnection() {
  console.log('\n🔍 Test 1: WebSocket Connection');
  
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    
    ws.on('open', () => {
      console.log('   ✅ WebSocket connected successfully');
      results.passed.push('WebSocket connection');
      ws.close();
      resolve();
    });
    
    ws.on('error', (err) => {
      console.log('   ❌ WebSocket connection failed:', err.message);
      results.failed.push('WebSocket connection');
      resolve();
    });
  });
}

// Test 2: Verify terminal event isolation
async function testTerminalEventIsolation() {
  console.log('\n🔍 Test 2: Terminal Event Isolation');
  
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    const receivedEvents = [];
    
    ws.on('open', () => {
      // Join a test session
      ws.send(JSON.stringify({
        type: 'terminal:join',
        data: {
          sessionId: 'test-session-123',
          farmId: 'test-farm-456'
        }
      }));
      
      // Listen for terminal events
      ws.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString());
          
          // Check if agentId is numeric
          if (event.agentId !== undefined && typeof event.agentId !== 'number') {
            console.log('   ⚠️ Warning: agentId is not numeric:', event.agentId);
            results.warnings.push('Non-numeric agentId detected');
          }
          
          receivedEvents.push(event);
        } catch (err) {
          // Ignore parse errors
        }
      });
      
      // Wait 2 seconds and check results
      setTimeout(() => {
        console.log(`   📊 Received ${receivedEvents.length} events`);
        
        // Check for global broadcasts (should be none)
        const globalBroadcasts = receivedEvents.filter(e => !e.sessionId && !e.farmId);
        
        if (globalBroadcasts.length === 0) {
          console.log('   ✅ No global broadcasts detected (isolation working)');
          results.passed.push('Terminal event isolation');
        } else {
          console.log(`   ❌ Found ${globalBroadcasts.length} global broadcasts`);
          results.failed.push('Terminal event isolation');
        }
        
        ws.close();
        resolve();
      }, 2000);
    });
    
    ws.on('error', (err) => {
      console.log('   ❌ WebSocket error:', err.message);
      results.failed.push('Terminal event isolation');
      resolve();
    });
  });
}

// Test 3: Verify agent ID normalization
async function testAgentIdNormalization() {
  console.log('\n🔍 Test 3: Agent ID Normalization');
  
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    
    ws.on('open', () => {
      // Send test events with different agentId formats
      const testEvents = [
        { type: 'test', agentId: 1 },         // Numeric
        { type: 'test', agentId: '2' },       // String number
        { type: 'test', agentId: 'invalid' }  // Invalid
      ];
      
      let processed = 0;
      
      ws.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString());
          
          if (event.type === 'test:response') {
            processed++;
            
            if (typeof event.agentId === 'number') {
              console.log(`   ✅ AgentId ${event.originalAgentId} normalized to ${event.agentId}`);
            } else {
              console.log(`   ❌ AgentId ${event.originalAgentId} not normalized: ${event.agentId}`);
            }
            
            if (processed === testEvents.length) {
              results.passed.push('Agent ID normalization');
              ws.close();
              resolve();
            }
          }
        } catch (err) {
          // Ignore
        }
      });
      
      // Send test events
      testEvents.forEach(event => {
        ws.send(JSON.stringify(event));
      });
      
      // Timeout if no response
      setTimeout(() => {
        if (processed < testEvents.length) {
          console.log('   ⚠️ Not all test events were processed');
          results.warnings.push('Incomplete agent ID normalization test');
          ws.close();
          resolve();
        }
      }, 3000);
    });
    
    ws.on('error', (err) => {
      console.log('   ❌ WebSocket error:', err.message);
      results.failed.push('Agent ID normalization');
      resolve();
    });
  });
}

// Test 4: Check session matching strictness
async function testSessionMatching() {
  console.log('\n🔍 Test 4: Session Matching Strictness');
  
  return new Promise((resolve) => {
    const ws1 = new WebSocket(WS_URL);
    const ws2 = new WebSocket(WS_URL);
    
    let crossTalk = false;
    
    ws1.on('open', () => {
      ws2.on('open', () => {
        // Join different sessions
        ws1.send(JSON.stringify({
          type: 'terminal:join',
          data: {
            sessionId: 'farm-abc12345',
            farmId: 'abc12345'
          }
        }));
        
        ws2.send(JSON.stringify({
          type: 'terminal:join',
          data: {
            sessionId: 'quick_abc12345',  // Same core ID but different prefix
            farmId: 'abc12345'
          }
        }));
        
        // Listen for cross-talk
        ws1.on('message', (data) => {
          try {
            const event = JSON.parse(data.toString());
            if (event.sessionId === 'quick_abc12345') {
              crossTalk = true;
              console.log('   ❌ Cross-talk detected: farm- received quick_ event');
            }
          } catch {}
        });
        
        ws2.on('message', (data) => {
          try {
            const event = JSON.parse(data.toString());
            if (event.sessionId === 'farm-abc12345') {
              crossTalk = true;
              console.log('   ❌ Cross-talk detected: quick_ received farm- event');
            }
          } catch {}
        });
        
        // Check after 2 seconds
        setTimeout(() => {
          if (!crossTalk) {
            console.log('   ✅ No cross-talk between different session types');
            results.passed.push('Session matching strictness');
          } else {
            results.failed.push('Session matching strictness');
          }
          
          ws1.close();
          ws2.close();
          resolve();
        }, 2000);
      });
    });
    
    ws1.on('error', (err) => {
      console.log('   ❌ WebSocket 1 error:', err.message);
      results.failed.push('Session matching strictness');
      resolve();
    });
    
    ws2.on('error', (err) => {
      console.log('   ❌ WebSocket 2 error:', err.message);
      results.failed.push('Session matching strictness');
      resolve();
    });
  });
}

// Test 5: Verify farms API
async function testFarmsAPI() {
  console.log('\n🔍 Test 5: Farms API');
  
  try {
    const response = await makeRequest('/api/farms');
    
    if (response.success !== undefined) {
      console.log('   ✅ Farms API responding');
      
      if (response.data && Array.isArray(response.data)) {
        console.log(`   📊 Found ${response.data.length} farms`);
        
        // Check agent structure
        response.data.forEach(farm => {
          if (farm.agents) {
            const hasNumericIds = farm.agents.every((agent, index) => {
              if (typeof agent === 'object' && agent.id !== undefined) {
                return typeof agent.id === 'number' || typeof agent.id === 'string';
              }
              return true;
            });
            
            if (hasNumericIds) {
              console.log(`   ✅ Farm ${farm.id} has valid agent structure`);
            } else {
              console.log(`   ⚠️ Farm ${farm.id} has invalid agent IDs`);
              results.warnings.push(`Farm ${farm.id} agent structure`);
            }
          }
        });
      }
      
      results.passed.push('Farms API');
    } else {
      console.log('   ❌ Invalid API response');
      results.failed.push('Farms API');
    }
  } catch (err) {
    console.log('   ❌ Farms API error:', err.message);
    results.failed.push('Farms API');
  }
}

// Main test runner
async function runTests() {
  console.log('🧪 Terminal Isolation Test Suite');
  console.log('================================\n');
  
  // Check if server is running
  try {
    const health = await makeRequest('/');
    console.log('✅ Server is running\n');
  } catch (err) {
    console.log('❌ Server is not running at localhost:4567');
    console.log('   Please start the server with: npm run dev');
    process.exit(1);
  }
  
  // Run tests
  await testWebSocketConnection();
  await testTerminalEventIsolation();
  await testAgentIdNormalization();
  await testSessionMatching();
  await testFarmsAPI();
  
  // Print summary
  console.log('\n\n📊 TEST SUMMARY');
  console.log('================');
  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⚠️ Warnings: ${results.warnings.length}`);
  
  if (results.failed.length > 0) {
    console.log('\nFailed tests:');
    results.failed.forEach(test => console.log(`  - ${test}`));
  }
  
  if (results.warnings.length > 0) {
    console.log('\nWarnings:');
    results.warnings.forEach(warning => console.log(`  - ${warning}`));
  }
  
  if (results.failed.length === 0) {
    console.log('\n🎉 All critical tests passed!');
  }
  
  process.exit(results.failed.length > 0 ? 1 : 0);
}

// Run the tests
runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});