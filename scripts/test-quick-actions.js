#!/usr/bin/env node

const axios = require('axios');
const colors = require('colors');

const API_BASE = process.env.API_URL || 'http://localhost:4567/api';

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

async function test(name, testFn) {
  try {
    console.log(`\n🧪 Testing: ${name}`.cyan);
    await testFn();
    console.log(`✅ ${name} - PASSED`.green);
    results.passed++;
    results.tests.push({ name, status: 'passed' });
  } catch (error) {
    console.log(`❌ ${name} - FAILED`.red);
    console.log(`   Error: ${error.message}`.yellow);
    if (error.response?.data) {
      console.log(`   Response:`, error.response.data);
    }
    results.failed++;
    results.tests.push({ name, status: 'failed', error: error.message });
  }
}

async function main() {
  console.log('🚀 MaiFarm Quick Actions Test Suite'.bold.blue);
  console.log(`📍 Testing API at: ${API_BASE}`.gray);
  console.log(`🔐 Auth Bypass: ${process.env.BYPASS_AUTH || 'true'}`.gray);
  
  // Test 1: Health Check
  await test('Health Check', async () => {
    const response = await axios.get(`${API_BASE.replace('/api', '')}/health`);
    if (!response.data.status === 'healthy') {
      throw new Error('Health check failed');
    }
  });

  // Test 2: Get Seeds (for New Farm)
  let seedId;
  await test('Get Seeds', async () => {
    const response = await axios.get(`${API_BASE}/seeds`);
    if (!response.data.success || !Array.isArray(response.data.data)) {
      throw new Error('Seeds endpoint returned invalid data');
    }
    if (response.data.data.length > 0) {
      seedId = response.data.data[0].id;
      console.log(`   Found ${response.data.data.length} seeds`.gray);
    }
  });

  // Test 3: Create New Farm
  let farmId;
  await test('Create New Farm', async () => {
    const farmData = {
      name: 'Test Farm ' + Date.now(),
      description: 'Created by Quick Actions test',
      config: {
        maxAgents: 3,
        orchestrationStrategy: 'round-robin'
      },
      tags: ['test', 'quick-action']
    };
    
    const response = await axios.post(`${API_BASE}/farms`, farmData);
    if (!response.data.success || !response.data.data?.id) {
      throw new Error('Failed to create farm');
    }
    farmId = response.data.data.id;
    console.log(`   Created farm: ${farmId}`.gray);
  });

  // Test 4: Create Farm from Seed
  if (seedId) {
    await test('Create Farm from Seed', async () => {
      const farmData = {
        seedId: seedId,
        name: 'Seeded Farm ' + Date.now(),
        description: 'Created from seed template'
      };
      
      const response = await axios.post(`${API_BASE}/farms/from-seed`, farmData);
      if (!response.data.success || !response.data.data?.farm?.id) {
        throw new Error('Failed to create farm from seed');
      }
      console.log(`   Created farm from seed: ${response.data.data.farm.id}`.gray);
    });
  }

  // Test 5: Start Go Wild Session
  let goWildSessionId;
  await test('Start Go Wild Session', async () => {
    const goWildData = {
      prompt: 'Explore code optimization opportunities',
      boundaries: {
        maxAgents: 3,
        maxIterations: 10,
        timeLimit: 300
      },
      creativity: {
        level: 0.7,
        allowExperimentation: true
      }
    };
    
    const response = await axios.post(`${API_BASE}/go-wild/sessions`, goWildData);
    if (!response.data.success || !response.data.data?.id) {
      throw new Error('Failed to start Go Wild session');
    }
    goWildSessionId = response.data.data.id;
    console.log(`   Started Go Wild session: ${goWildSessionId}`.gray);
  });

  // Test 6: Submit Quick Task
  await test('Submit Quick Task', async () => {
    const taskData = {
      name: 'Quick test task',
      description: 'Test task for Quick Actions',
      type: 'simple',
      priority: 'medium',
      config: {
        timeout: 60
      }
    };
    
    const response = await axios.post(`${API_BASE}/tasks`, taskData);
    if (!response.data.success || !response.data.data?.id) {
      throw new Error('Failed to submit quick task');
    }
    console.log(`   Created task: ${response.data.data.id}`.gray);
  });

  // Test 7: Get Harvest Data
  await test('Get Harvest Data', async () => {
    const response = await axios.get(`${API_BASE}/harvest`);
    if (!response.data.success) {
      throw new Error('Failed to get harvest data');
    }
    console.log(`   Found ${response.data.data?.length || 0} harvest items`.gray);
  });

  // Test 8: Get Barn Items
  await test('Get Barn Items', async () => {
    const response = await axios.get(`${API_BASE}/barn/items`);
    if (!response.data.success) {
      throw new Error('Failed to get barn items');
    }
    console.log(`   Found ${response.data.data?.length || 0} barn items`.gray);
  });

  // Test 9: Get Farm Status
  if (farmId) {
    await test('Get Farm Status', async () => {
      const response = await axios.get(`${API_BASE}/farms/${farmId}`);
      if (!response.data.success || !response.data.data?.farm) {
        throw new Error('Failed to get farm status');
      }
      console.log(`   Farm status: ${response.data.data.farm.status}`.gray);
    });
  }

  // Print summary
  console.log('\n📊 Test Summary'.bold.blue);
  console.log(`✅ Passed: ${results.passed}`.green);
  console.log(`❌ Failed: ${results.failed}`.red);
  console.log(`📝 Total: ${results.tests.length}`.gray);

  if (results.failed > 0) {
    console.log('\n❌ Failed Tests:'.red);
    results.tests.filter(t => t.status === 'failed').forEach(t => {
      console.log(`   - ${t.name}: ${t.error}`.yellow);
    });
  }

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
main().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});