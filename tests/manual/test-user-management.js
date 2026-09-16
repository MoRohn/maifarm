#!/usr/bin/env node

/**
 * Test script for User Management API endpoints
 * Run with: node test-user-management.js
 */

const BASE_URL = 'http://localhost:4567';

// Mock authentication token (in dev mode with BYPASS_AUTH=true)
const AUTH_TOKEN = 'mock-token';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testEndpoint(name, method, path, body = null) {
  try {
    log(`\nTesting: ${name}`, 'blue');
    
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${BASE_URL}${path}`, options);
    const data = await response.json();
    
    if (response.ok) {
      log(`✓ ${name} - Status: ${response.status}`, 'green');
      console.log('Response:', JSON.stringify(data, null, 2));
      return { success: true, data };
    } else {
      log(`✗ ${name} - Status: ${response.status}`, 'red');
      console.log('Error:', JSON.stringify(data, null, 2));
      return { success: false, data };
    }
  } catch (error) {
    log(`✗ ${name} - Network Error: ${error.message}`, 'red');
    return { success: false, error: error.message };
  }
}

async function runTests() {
  log('Starting User Management API Tests', 'yellow');
  log('================================', 'yellow');
  
  // Test 1: List all users
  await testEndpoint(
    'List All Users',
    'GET',
    '/api/users?page=1&limit=10'
  );
  
  // Test 2: Get current user
  await testEndpoint(
    'Get Current User',
    'GET',
    '/api/users/me'
  );
  
  // Test 3: Create a new user
  const createResult = await testEndpoint(
    'Create New User',
    'POST',
    '/api/users',
    {
      email: 'test@example.com',
      username: 'testuser',
      password: 'TestPassword123!',
      roles: ['user']
    }
  );
  
  if (createResult.success && createResult.data.user) {
    const userId = createResult.data.user.id;
    
    // Test 4: Get specific user
    await testEndpoint(
      'Get Specific User',
      'GET',
      `/api/users/${userId}`
    );
    
    // Test 5: Update user
    await testEndpoint(
      'Update User',
      'PUT',
      `/api/users/${userId}`,
      {
        email: 'updated@example.com',
        mfa_enabled: true
      }
    );
    
    // Test 6: Get user sessions
    await testEndpoint(
      'Get User Sessions',
      'GET',
      `/api/users/${userId}/sessions`
    );
    
    // Test 7: Reset password
    await testEndpoint(
      'Reset User Password',
      'POST',
      `/api/users/${userId}/reset-password`,
      {
        password: 'NewPassword123!'
      }
    );
    
    // Test 8: Revoke sessions
    await testEndpoint(
      'Revoke User Sessions',
      'DELETE',
      `/api/users/${userId}/sessions`
    );
    
    // Test 9: Delete user
    await testEndpoint(
      'Delete User',
      'DELETE',
      `/api/users/${userId}`
    );
  }
  
  log('\n================================', 'yellow');
  log('User Management API Tests Complete', 'yellow');
}

// Check if server is running
async function checkServer() {
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    if (response.ok) {
      log('Server is running, starting tests...', 'green');
      await runTests();
    } else {
      log('Server returned non-OK status', 'red');
    }
  } catch (error) {
    log('Server is not running. Please start the server with:', 'red');
    log('  npm run dev', 'yellow');
    log('  or', 'yellow');
    log('  BYPASS_AUTH=true npm run dev:server', 'yellow');
    process.exit(1);
  }
}

// Run the tests
checkServer().catch(error => {
  log(`Unexpected error: ${error.message}`, 'red');
  process.exit(1);
});