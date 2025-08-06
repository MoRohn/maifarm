#!/usr/bin/env node

/**
 * Test script to verify farm status persistence
 */

const http = require('http');

// Configuration
const PORT = 4567;
const HOST = 'localhost';

// Helper function to make HTTP requests
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dev-token' // Bypass auth in dev mode
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, data: result });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
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

// Test farm status persistence
async function testFarmStatusPersistence() {
  console.log('=== Testing Farm Status Persistence ===\n');
  
  try {
    // 1. Create a quick task farm
    console.log('1. Creating Quick Task farm...');
    const createResponse = await makeRequest('POST', '/api/tasks/quick', {
      title: 'Test Farm Status Persistence',
      description: 'Testing if farm status is properly persisted',
      priority: 'medium',
      timeout: 10000,
      metadata: { test: true }
    });
    
    if (createResponse.status !== 200 && createResponse.status !== 201) {
      console.error('❌ Failed to create quick task:', createResponse.data);
      return;
    }
    
    console.log('Response data:', JSON.stringify(createResponse.data, null, 2));
    const taskId = createResponse.data.taskId || createResponse.data.data?.taskId;
    const farmId = createResponse.data.farmId || createResponse.data.data?.farmId;
    console.log(`✅ Created Quick Task - Task ID: ${taskId}, Farm ID: ${farmId}`);
    
    // 2. Check initial farm status
    console.log('\n2. Checking initial farm status...');
    const farmResponse = await makeRequest('GET', `/api/farms/${farmId}`);
    
    if (farmResponse.status === 200) {
      const farmData = farmResponse.data.data?.farm || farmResponse.data.farm || farmResponse.data;
      const farmStatus = farmData.status;
      console.log('Farm data:', JSON.stringify(farmData, null, 2));
      console.log(`✅ Initial farm status: ${farmStatus}`);
      
      if (farmStatus !== 'launching') {
        console.warn(`⚠️  Expected initial status 'launching', got '${farmStatus}'`);
      }
    } else {
      console.log(`ℹ️  Could not fetch farm details (status: ${farmResponse.status})`);
    }
    
    // 3. Wait a moment for processing
    console.log('\n3. Waiting for task to process...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 4. Check task status
    console.log('\n4. Checking task status...');
    const taskStatusResponse = await makeRequest('GET', `/api/tasks/${taskId}/status`);
    
    if (taskStatusResponse.status === 200) {
      const taskStatus = taskStatusResponse.data.status;
      console.log(`✅ Task status: ${taskStatus}`);
    } else {
      console.log(`ℹ️  Could not fetch task status (status: ${taskStatusResponse.status})`);
    }
    
    // 5. Check farm status after processing
    console.log('\n5. Checking farm status after processing...');
    const farmStatusResponse = await makeRequest('GET', `/api/farms/${farmId}`);
    
    if (farmStatusResponse.status === 200) {
      const farmStatus = farmStatusResponse.data.data?.farm?.status || farmStatusResponse.data.farm?.status;
      console.log(`✅ Farm status after processing: ${farmStatus}`);
      
      // The status should have changed from 'launching'
      if (farmStatus === 'launching') {
        console.warn('⚠️  Farm status still showing as launching - persistence may not be working');
      }
    } else {
      console.log(`ℹ️  Could not fetch farm details (status: ${farmStatusResponse.status})`);
    }
    
    // 6. Test updating farm status directly
    console.log('\n6. Testing direct farm status update...');
    const updateResponse = await makeRequest('PUT', `/api/farms/${farmId}/status`, {
      status: 'completed'
    });
    
    if (updateResponse.status === 200) {
      console.log('✅ Successfully updated farm status');
      
      // Verify the update persisted
      const verifyResponse = await makeRequest('GET', `/api/farms/${farmId}`);
      if (verifyResponse.status === 200) {
        const updatedStatus = verifyResponse.data.data?.farm?.status || verifyResponse.data.farm?.status;
        console.log(`✅ Verified farm status is now: ${updatedStatus}`);
        
        if (updatedStatus === 'completed') {
          console.log('✅ Farm status persistence is working correctly!');
        } else {
          console.error('❌ Farm status did not persist correctly');
        }
      }
    } else {
      console.log(`ℹ️  Could not update farm status directly (status: ${updateResponse.status})`);
    }
    
    console.log('\n=== Test Complete ===');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Check if server is running
async function checkServerHealth() {
  try {
    const response = await makeRequest('GET', '/api/health');
    if (response.status === 200 || response.status === 503) {
      console.log('✅ Server is running\n');
      return true;
    }
  } catch (error) {
    console.error('❌ Server is not running. Please start the server with: npm run dev:server\n');
    return false;
  }
}

// Main execution
async function main() {
  console.log('Farm Status Persistence Test\n');
  console.log('Testing server at http://' + HOST + ':' + PORT + '\n');
  
  const serverRunning = await checkServerHealth();
  if (!serverRunning) {
    process.exit(1);
  }
  
  await testFarmStatusPersistence();
}

// Run the test
main().catch(console.error);