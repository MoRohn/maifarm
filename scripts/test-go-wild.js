#!/usr/bin/env node

// Test script for Go Wild functionality
import http from 'http';

const API_BASE = 'http://localhost:4567/api';

// Test data
const testFarmId = 'test-farm-' + Date.now();
const goWildConfig = {
  creativityLevel: 70,
  explorationDepth: 5,
  maxDuration: 30,
  boundaries: {
    allowExternalAPIs: true,
    allowFileSystem: true,
    allowNetworkRequests: true,
    restrictedDomains: [],
    allowedPaths: ['/tmp', '/Users/rohnspringfield/maifarm'],
    maxRequestsPerMinute: 60
  },
  focusAreas: ['performance optimization', 'code quality']
};

// Helper function to make HTTP requests
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = {
            status: res.statusCode,
            headers: res.headers,
            body: body ? JSON.parse(body) : null
          };
          resolve(result);
        } catch (e) {
          resolve({ status: res.statusCode, body: body });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function testGoWild() {
  console.log('Testing Go Wild functionality...\n');

  try {
    // 1. Check server health
    console.log('1. Checking server health...');
    const healthResponse = await makeRequest({
      hostname: 'localhost',
      port: 4567,
      path: '/api/health',
      method: 'GET'
    });
    
    console.log('Health check:', healthResponse.status);
    if (healthResponse.body) {
      console.log('Services:', healthResponse.body.services);
    }
    
    // 2. Start Go Wild exploration
    console.log('\n2. Starting Go Wild exploration...');
    const startResponse = await makeRequest({
      hostname: 'localhost',
      port: 4567,
      path: '/api/go-wild/start',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, {
      farmId: testFarmId,
      config: goWildConfig
    });
    
    console.log('Start exploration response:', startResponse.status);
    if (startResponse.body) {
      console.log('Response:', JSON.stringify(startResponse.body, null, 2));
      
      if (startResponse.body.success && startResponse.body.data) {
        const sessionId = startResponse.body.data.id;
        console.log('Session ID:', sessionId);
        
        // 3. Get session status
        console.log('\n3. Getting session status...');
        const sessionResponse = await makeRequest({
          hostname: 'localhost',
          port: 4567,
          path: `/api/go-wild/session/${testFarmId}`,
          method: 'GET'
        });
        
        console.log('Session status:', sessionResponse.status);
        if (sessionResponse.body) {
          console.log('Session:', JSON.stringify(sessionResponse.body, null, 2));
        }
        
        // 4. Wait a bit for exploration to progress
        console.log('\n4. Waiting for exploration progress...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // 5. Pause exploration
        console.log('\n5. Pausing exploration...');
        const pauseResponse = await makeRequest({
          hostname: 'localhost',
          port: 4567,
          path: `/api/go-wild/${sessionId}/pause`,
          method: 'PUT'
        });
        
        console.log('Pause response:', pauseResponse.status);
        
        // 6. Stop exploration
        console.log('\n6. Stopping exploration...');
        const stopResponse = await makeRequest({
          hostname: 'localhost',
          port: 4567,
          path: `/api/go-wild/${sessionId}/stop`,
          method: 'PUT'
        });
        
        console.log('Stop response:', stopResponse.status);
        if (stopResponse.body) {
          console.log('Summary:', JSON.stringify(stopResponse.body, null, 2));
        }
      }
    }
    
    console.log('\nGo Wild test completed!');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
console.log('Go Wild API Test Script');
console.log('======================\n');

// Check if server is running
http.get('http://localhost:4567/api/health', (res) => {
  if (res.statusCode === 200 || res.statusCode === 503) {
    testGoWild();
  } else {
    console.error('Server not responding. Please start the server first.');
    console.log('Run: npm run dev');
  }
}).on('error', (err) => {
  console.error('Server not running. Please start the server first.');
  console.log('Run: npm run dev');
});