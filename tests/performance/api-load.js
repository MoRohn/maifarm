import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Define custom metrics
export const errorRate = new Rate('errors');
export const farmCreationDuration = new Trend('farm_creation_duration');
export const harvestFetchDuration = new Trend('harvest_fetch_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 20 },   // Stay at 20 users
    { duration: '30s', target: 50 },  // Ramp up to 50 users
    { duration: '2m', target: 50 },   // Stay at 50 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests under 2s
    http_req_failed: ['rate<0.1'],     // Error rate under 10%
    errors: ['rate<0.05'],             // Custom error rate under 5%
  },
};

const BASE_URL = 'http://localhost:4567';

// Test data
const testFarms = [
  {
    name: 'Load Test Farm 1',
    description: 'Performance testing farm',
    type: 'sequential',
    config: { maxAgents: 3, autoScale: false }
  },
  {
    name: 'Load Test Farm 2', 
    description: 'Collaborative testing farm',
    type: 'collaborative',
    config: { maxAgents: 5, autoScale: true }
  },
  {
    name: 'Load Test Farm 3',
    description: 'Autonomous testing farm', 
    type: 'autonomous',
    config: { maxAgents: 2, autoScale: false }
  }
];

// Helper function to get auth token
function getAuthToken() {
  const authResponse = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    username: 'test_user',
    password: 'test_password'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (authResponse.status === 200) {
    return JSON.parse(authResponse.body).token;
  }
  return null;
}

export function setup() {
  console.log('Setting up load test environment...');
  
  // Health check
  const healthCheck = http.get(`${BASE_URL}/api/health`);
  check(healthCheck, {
    'Health check passed': (r) => r.status === 200,
  });
  
  return { baseUrl: BASE_URL };
}

export default function(data) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getAuthToken()}`
  };

  // Test 1: Farm Creation API
  const farmData = testFarms[Math.floor(Math.random() * testFarms.length)];
  farmData.name = `${farmData.name} ${Date.now()}`;
  
  const farmCreationStart = Date.now();
  const createFarmResponse = http.post(
    `${BASE_URL}/api/farms`,
    JSON.stringify(farmData),
    { headers }
  );
  
  const farmCreationEnd = Date.now();
  farmCreationDuration.add(farmCreationEnd - farmCreationStart);
  
  const farmCreationSuccess = check(createFarmResponse, {
    'Farm creation status is 201': (r) => r.status === 201,
    'Farm creation response has id': (r) => JSON.parse(r.body).id !== undefined,
    'Farm creation response time < 3s': (r) => r.timings.duration < 3000,
  });
  
  if (!farmCreationSuccess) {
    errorRate.add(1);
  }
  
  let farmId = null;
  if (createFarmResponse.status === 201) {
    farmId = JSON.parse(createFarmResponse.body).id;
  }

  sleep(1);

  // Test 2: Fetch Farms List
  const fetchFarmsResponse = http.get(`${BASE_URL}/api/farms`, { headers });
  
  check(fetchFarmsResponse, {
    'Fetch farms status is 200': (r) => r.status === 200,
    'Fetch farms returns array': (r) => Array.isArray(JSON.parse(r.body)),
    'Fetch farms response time < 1s': (r) => r.timings.duration < 1000,
  });

  sleep(0.5);

  // Test 3: WebSocket Connection Test
  const wsHealthResponse = http.get(`${BASE_URL}/api/websocket/health`, { headers });
  
  check(wsHealthResponse, {
    'WebSocket health check passes': (r) => r.status === 200,
  });

  sleep(0.5);

  // Test 4: Farm Status Check
  if (farmId) {
    const farmStatusResponse = http.get(`${BASE_URL}/api/farms/${farmId}`, { headers });
    
    check(farmStatusResponse, {
      'Farm status check is 200': (r) => r.status === 200,
      'Farm status response has correct id': (r) => JSON.parse(r.body).id === farmId,
    });
  }

  sleep(1);

  // Test 5: Harvest Data Fetch
  const harvestFetchStart = Date.now();
  const harvestResponse = http.get(`${BASE_URL}/api/harvests`, { headers });
  const harvestFetchEnd = Date.now();
  
  harvestFetchDuration.add(harvestFetchEnd - harvestFetchStart);
  
  check(harvestResponse, {
    'Harvest fetch status is 200': (r) => r.status === 200,
    'Harvest fetch response time < 2s': (r) => r.timings.duration < 2000,
  });

  sleep(0.5);

  // Test 6: Analytics API
  const analyticsResponse = http.get(`${BASE_URL}/api/analytics/metrics`, { headers });
  
  check(analyticsResponse, {
    'Analytics API status is 200': (r) => r.status === 200,
    'Analytics response has metrics': (r) => {
      const body = JSON.parse(r.body);
      return body.metrics !== undefined;
    },
  });

  sleep(0.5);

  // Test 7: Multi-Claude Service Status
  const multiClaudeResponse = http.get(`${BASE_URL}/api/multi-claude/status`, { headers });
  
  check(multiClaudeResponse, {
    'Multi-Claude service responds': (r) => r.status === 200 || r.status === 404, // 404 is acceptable if service not running
  });

  // Test 8: Clean up - Delete created farm
  if (farmId) {
    const deleteResponse = http.del(`${BASE_URL}/api/farms/${farmId}`, null, { headers });
    
    check(deleteResponse, {
      'Farm deletion successful': (r) => r.status === 200 || r.status === 204,
    });
  }

  sleep(1);
}

export function teardown(data) {
  console.log('Load test teardown completed');
  console.log(`Tested against: ${data.baseUrl}`);
}

// Custom scenario for specific load patterns
export const scenarios = {
  farm_creation_burst: {
    executor: 'ramping-arrival-rate',
    startRate: 1,
    timeUnit: '1s',
    preAllocatedVUs: 10,
    maxVUs: 50,
    stages: [
      { target: 5, duration: '30s' },
      { target: 10, duration: '1m' },
      { target: 5, duration: '30s' },
    ],
    exec: 'farmCreationScenario',
  },
  
  harvest_monitoring: {
    executor: 'constant-vus',
    vus: 10,
    duration: '2m',
    exec: 'harvestMonitoringScenario',
  },
};

// Scenario-specific functions
export function farmCreationScenario() {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getAuthToken()}`
  };

  const farmData = {
    name: `Burst Test Farm ${Date.now()}`,
    description: 'Farm creation burst test',
    type: 'sequential',
    config: { maxAgents: 2, autoScale: false }
  };

  const response = http.post(`${BASE_URL}/api/farms`, JSON.stringify(farmData), { headers });
  
  check(response, {
    'Burst farm creation successful': (r) => r.status === 201,
  });
}

export function harvestMonitoringScenario() {
  const headers = {
    'Authorization': `Bearer ${getAuthToken()}`
  };

  const response = http.get(`${BASE_URL}/api/harvests`, { headers });
  
  check(response, {
    'Harvest monitoring successful': (r) => r.status === 200,
  });
  
  sleep(2);
}