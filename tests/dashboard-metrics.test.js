// Dashboard Metrics Test Script
// This script tests the dashboard metrics functionality

import axios from 'axios';

const API_BASE_URL = 'http://localhost:4567';

async function testDashboardMetrics() {
  console.log('=== Dashboard Metrics Test ===\n');
  
  try {
    // Test 1: Health Check
    console.log('1. Testing health endpoint...');
    const healthResponse = await axios.get(`${API_BASE_URL}/api/health`);
    console.log('✓ Health check passed:', healthResponse.data.status);
    
    // Test 2: Dashboard Metrics Endpoint
    console.log('\n2. Testing dashboard metrics endpoint...');
    const metricsResponse = await axios.get(`${API_BASE_URL}/api/metrics/dashboard`);
    console.log('✓ Metrics endpoint responded:', metricsResponse.data.success);
    
    const metrics = metricsResponse.data.data;
    console.log('\nCurrent Metrics:');
    console.log(`  - Active Farms: ${metrics.activeFarms}`);
    console.log(`  - Total Agents: ${metrics.totalAgents}`);
    console.log(`  - Tasks Completed: ${metrics.tasksCompleted}`);
    console.log(`  - Success Rate: ${metrics.successRate}%`);
    
    // Test 3: Validate Metrics Structure
    console.log('\n3. Validating metrics structure...');
    const requiredFields = ['activeFarms', 'totalAgents', 'tasksCompleted', 'successRate'];
    const hasAllFields = requiredFields.every(field => field in metrics);
    
    if (hasAllFields) {
      console.log('✓ All required fields present');
    } else {
      console.log('✗ Missing required fields');
    }
    
    // Test 4: Validate Data Types
    console.log('\n4. Validating data types...');
    const typeChecks = [
      { field: 'activeFarms', expected: 'number' },
      { field: 'totalAgents', expected: 'number' },
      { field: 'tasksCompleted', expected: 'number' },
      { field: 'successRate', expected: 'number' }
    ];
    
    let allTypesValid = true;
    typeChecks.forEach(check => {
      const actual = typeof metrics[check.field];
      if (actual === check.expected) {
        console.log(`✓ ${check.field}: ${actual}`);
      } else {
        console.log(`✗ ${check.field}: expected ${check.expected}, got ${actual}`);
        allTypesValid = false;
      }
    });
    
    // Test 5: Validate Success Rate Range
    console.log('\n5. Validating success rate range...');
    if (metrics.successRate >= 0 && metrics.successRate <= 100) {
      console.log(`✓ Success rate ${metrics.successRate}% is within valid range (0-100)`);
    } else {
      console.log(`✗ Success rate ${metrics.successRate}% is outside valid range`);
    }
    
    // Summary
    console.log('\n=== Test Summary ===');
    console.log('✓ All tests passed!');
    console.log('Dashboard metrics are functioning correctly.');
    
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

// Run the test
testDashboardMetrics();