const http = require('http');

const API_URL = 'http://localhost:4567';
let currentFarmId = null;
let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: []
};

function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (error) {
          resolve({ status: res.statusCode, data: { raw: data } });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function test1_HealthCheck() {
  log('Test 1: Health Check', 'info');
  testResults.total++;
  
  try {
    const response = await makeRequest(`${API_URL}/api/health`);
    
    if ((response.status === 200 || response.status === 201) && response.data.status === 'healthy') {
      log('✅ Backend is healthy', 'success');
      log(`Version: ${response.data.version}`, 'info');
      log(`Services: API=${response.data.services.api}, DB=${response.data.services.postgres}, Redis=${response.data.services.redis}`, 'info');
      testResults.passed++;
      return true;
    } else {
      throw new Error(`Health check failed: ${response.status}`);
    }
  } catch (error) {
    log(`❌ Health check failed: ${error.message}`, 'error');
    testResults.failed++;
    testResults.errors.push(`Health Check: ${error.message}`);
    return false;
  }
}

async function test2_FarmCreation() {
  log('Test 2: Farm Creation', 'info');
  testResults.total++;
  
  try {
    const farmData = {
      name: `Final Test Farm ${Date.now()}`,
      description: 'Phase 4 Final Validation Test',
      type: 'sequential',
      provider: 'claude',
      config: {
        maxAgents: 3,
        timeout: 300,
        autoScale: true
      }
    };

    const response = await makeRequest(`${API_URL}/api/farms`, {
      method: 'POST',
      body: farmData
    });

    if ((response.status === 200 || response.status === 201) && response.data.success) {
      currentFarmId = response.data.data.id;
      log(`✅ Farm created successfully! ID: ${currentFarmId}`, 'success');
      log(`Name: ${response.data.data.name}`, 'info');
      log(`Status: ${response.data.data.status}`, 'info');
      testResults.passed++;
      return true;
    } else {
      throw new Error(`Farm creation failed: ${response.data.error?.message || 'Unknown error'}`);
    }
  } catch (error) {
    log(`❌ Farm creation failed: ${error.message}`, 'error');
    testResults.failed++;
    testResults.errors.push(`Farm Creation: ${error.message}`);
    return false;
  }
}

async function test3_AgentLaunch() {
  log('Test 3: Agent Launch', 'info');
  testResults.total++;
  
  if (!currentFarmId) {
    log('❌ No farm ID available. Skipping agent launch test.', 'error');
    testResults.failed++;
    testResults.errors.push('Agent Launch: No farm ID available');
    return false;
  }

  try {
    const response = await makeRequest(`${API_URL}/api/farms/${currentFarmId}/launch`, {
      method: 'POST'
    });

    if ((response.status === 200 || response.status === 201) && response.data.success) {
      log('✅ Agent launch initiated successfully!', 'success');
      log(`Process ID: ${response.data.data.processId}`, 'info');
      log(`Harvest ID: ${response.data.data.harvestId}`, 'info');
      log(`Number of Agents: ${response.data.data.numberOfAgents}`, 'info');
      testResults.passed++;
      return true;
    } else {
      throw new Error(`Agent launch failed: ${response.data.error?.message || 'Unknown error'}`);
    }
  } catch (error) {
    log(`❌ Agent launch failed: ${error.message}`, 'error');
    testResults.failed++;
    testResults.errors.push(`Agent Launch: ${error.message}`);
    return false;
  }
}

async function test4_FarmStatus() {
  log('Test 4: Farm Status Monitoring', 'info');
  testResults.total++;
  
  if (!currentFarmId) {
    log('❌ No farm ID available. Skipping status test.', 'error');
    testResults.failed++;
    testResults.errors.push('Farm Status: No farm ID available');
    return false;
  }

  try {
    // Wait for farm to potentially change status
    await sleep(2000);
    
    const response = await makeRequest(`${API_URL}/api/farms/${currentFarmId}`);

    if ((response.status === 200 || response.status === 201) && response.data.success) {
      const farm = response.data.data;
      log('✅ Farm status retrieved successfully!', 'success');
      log(`Farm ID: ${farm.id}`, 'info');
      log(`Status: ${farm.status}`, 'info');
      log(`Agent Count: ${farm.agents ? farm.agents.length : 0}`, 'info');
      
      testResults.passed++;
      return true;
    } else {
      throw new Error(`Farm status check failed: ${response.data.error?.message || 'Unknown error'}`);
    }
  } catch (error) {
    log(`❌ Farm status check failed: ${error.message}`, 'error');
    testResults.failed++;
    testResults.errors.push(`Farm Status: ${error.message}`);
    return false;
  }
}

async function test5_HarvestsList() {
  log('Test 5: Harvests List', 'info');
  testResults.total++;
  
  try {
    const response = await makeRequest(`${API_URL}/api/harvests`);

    if ((response.status === 200 || response.status === 201) && response.data.success) {
      log('✅ Harvests list retrieved successfully!', 'success');
      log(`Total Harvests: ${response.data.meta.total}`, 'info');
      log(`Harvests Data: ${Array.isArray(response.data.data) ? response.data.data.length : 0} items`, 'info');
      
      testResults.passed++;
      return true;
    } else {
      throw new Error(`Harvests list failed: ${response.data.error?.message || 'Unknown error'}`);
    }
  } catch (error) {
    log(`❌ Harvests list failed: ${error.message}`, 'error');
    testResults.failed++;
    testResults.errors.push(`Harvests List: ${error.message}`);
    return false;
  }
}

async function test6_BarnItems() {
  log('Test 6: Barn Items', 'info');
  testResults.total++;
  
  try {
    // Try multiple barn-related endpoints
    const endpoints = [
      '/api/barn',
      '/api/barn/items',
      '/api/maibarn/items'
    ];
    
    let success = false;
    let lastError = null;
    
    for (const endpoint of endpoints) {
      try {
        const response = await makeRequest(`${API_URL}${endpoint}`);
        
        if (response.status === 200 || response.status === 201) {
          log(`✅ Barn endpoint ${endpoint} responded successfully!`, 'success');
          log(`Response: ${JSON.stringify(response.data).substring(0, 100)}...`, 'info');
          success = true;
          break;
        }
      } catch (error) {
        lastError = error;
        continue;
      }
    }
    
    if (success) {
      testResults.passed++;
      return true;
    } else {
      throw lastError || new Error('All barn endpoints failed');
    }
  } catch (error) {
    log(`❌ Barn items test failed: ${error.message}`, 'error');
    testResults.failed++;
    testResults.errors.push(`Barn Items: ${error.message}`);
    return false;
  }
}

async function runAllTests() {
  const startTime = Date.now();
  
  log('🚀 Starting Phase 4 Final Validation Tests', 'info');
  log('========================================', 'info');
  
  const tests = [
    { name: 'Health Check', fn: test1_HealthCheck },
    { name: 'Farm Creation', fn: test2_FarmCreation },
    { name: 'Agent Launch', fn: test3_AgentLaunch },
    { name: 'Farm Status', fn: test4_FarmStatus },
    { name: 'Harvests List', fn: test5_HarvestsList },
    { name: 'Barn Items', fn: test6_BarnItems }
  ];

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    log(`\n--- Running Test ${i + 1}/${tests.length}: ${test.name} ---`, 'info');
    
    try {
      await test.fn();
    } catch (error) {
      log(`❌ Test ${test.name} crashed: ${error.message}`, 'error');
      testResults.failed++;
      testResults.errors.push(`${test.name}: ${error.message}`);
    }
    
    // Small delay between tests
    if (i < tests.length - 1) {
      await sleep(500);
    }
  }

  const endTime = Date.now();
  const duration = Math.floor((endTime - startTime) / 1000);

  log('\n========================================', 'info');
  log('🏁 PHASE 4 FINAL VALIDATION COMPLETE', 'info');
  log('========================================', 'info');
  log(`Total Tests: ${testResults.total}`, 'info');
  log(`Passed: ${testResults.passed}`, testResults.passed > 0 ? 'success' : 'info');
  log(`Failed: ${testResults.failed}`, testResults.failed > 0 ? 'error' : 'info');
  log(`Duration: ${duration} seconds`, 'info');
  
  if (testResults.errors.length > 0) {
    log('\n❌ Errors Found:', 'error');
    testResults.errors.forEach((error, index) => {
      log(`${index + 1}. ${error}`, 'error');
    });
  }

  const successRate = Math.round((testResults.passed / testResults.total) * 100);
  log(`\nSuccess Rate: ${successRate}%`, successRate === 100 ? 'success' : 'error');
  
  if (successRate === 100) {
    log('\n🎉 ALL TESTS PASSED! MaiFarm is 100% operational!', 'success');
  } else {
    log(`\n⚠️ ${testResults.failed} test(s) failed. MaiFarm needs fixes.`, 'error');
  }

  // Create test report
  const report = {
    timestamp: new Date().toISOString(),
    duration: duration,
    results: testResults,
    successRate: successRate,
    status: successRate === 100 ? 'PASS' : 'FAIL',
    farmId: currentFarmId
  };

  require('fs').writeFileSync('/tmp/phase4-final-validation-report.json', JSON.stringify(report, null, 2));
  log(`\nTest report saved to: /tmp/phase4-final-validation-report.json`, 'info');
  
  return successRate === 100;
}

// Run tests
if (require.main === module) {
  runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      log(`❌ Test runner crashed: ${error.message}`, 'error');
      process.exit(1);
    });
}

module.exports = { runAllTests };