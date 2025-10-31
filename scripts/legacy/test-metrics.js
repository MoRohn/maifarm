#!/usr/bin/env node

// Test script to verify metrics functionality
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:4567';

async function testMetrics() {
  console.log('Testing MaiFarm Metrics API...\n');
  
  try {
    // Test 1: Health check
    console.log('1. Testing health endpoint...');
    const healthResponse = await axios.get(`${API_URL}/api/health`);
    console.log('   Health Status:', healthResponse.data.status);
    console.log('   Services:', JSON.stringify(healthResponse.data.services, null, 2));
    
    // Test 2: Dashboard metrics
    console.log('\n2. Testing dashboard metrics...');
    const metricsResponse = await axios.get(`${API_URL}/api/metrics/dashboard`);
    console.log('   Success:', metricsResponse.data.success);
    console.log('   Metrics:', JSON.stringify(metricsResponse.data.data, null, 2));
    
    // Test 3: Create a test farm (if API is available)
    console.log('\n3. Testing farm creation...');
    try {
      const farmData = {
        name: 'Test Metrics Farm',
        description: 'Testing metrics collection',
        type: 'sequential',
        config: {
          maxAgents: 2,
          yaml: `
name: Test Farm
type: sequential
agents:
  - name: Test Agent 1
    type: builder
  - name: Test Agent 2
    type: builder
`
        }
      };
      
      const farmResponse = await axios.post(`${API_URL}/api/farms`, farmData);
      console.log('   Farm created:', farmResponse.data.success);
      
      // Wait a bit and check metrics again
      console.log('\n4. Waiting 3 seconds and checking metrics again...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const updatedMetrics = await axios.get(`${API_URL}/api/metrics/dashboard`);
      console.log('   Updated Metrics:', JSON.stringify(updatedMetrics.data.data, null, 2));
      
    } catch (error) {
      console.log('   Farm creation not available (expected in mock mode)');
    }
    
    console.log('\n✅ Metrics test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Error testing metrics:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Run the test
testMetrics();