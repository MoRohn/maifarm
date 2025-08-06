import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const apiDuration = new Trend('api_duration');
const websocketDuration = new Trend('websocket_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '5m', target: 50 },   // Stay at 50 users
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.1'],                   // Error rate under 10%
    errors: ['rate<0.1'],                            // Custom error rate under 10%
  },
  ext: {
    loadimpact: {
      projectID: 3478725,
      name: 'MaiFarm Load Test',
    },
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Helper function to make authenticated requests
function authenticatedRequest(url, payload, token) {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    },
  };
  
  return http.post(url, JSON.stringify(payload), params);
}

// User scenarios
export default function () {
  // Scenario 1: Homepage visit
  let res = http.get(`${BASE_URL}/`);
  check(res, {
    'Homepage loads successfully': (r) => r.status === 200,
    'Homepage loads quickly': (r) => r.timings.duration < 300,
  });
  errorRate.add(res.status !== 200);
  sleep(1);

  // Scenario 2: User login
  const loginPayload = {
    email: `testuser${__VU}@example.com`,
    password: 'TestPassword123!',
  };
  
  res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify(loginPayload), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  const loginSuccess = check(res, {
    'Login successful': (r) => r.status === 200,
    'Login returns token': (r) => r.json('token') !== undefined,
  });
  
  errorRate.add(!loginSuccess);
  apiDuration.add(res.timings.duration);
  
  let token = '';
  if (loginSuccess) {
    token = res.json('token');
  }
  
  sleep(1);

  // Scenario 3: Dashboard access
  res = http.get(`${BASE_URL}/dashboard`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  
  check(res, {
    'Dashboard loads successfully': (r) => r.status === 200,
    'Dashboard loads within SLA': (r) => r.timings.duration < 1000,
  });
  
  errorRate.add(res.status !== 200);
  sleep(2);

  // Scenario 4: Farm operations
  const farmPayload = {
    name: `Test Farm ${__VU}-${__ITER}`,
    agents: [
      { type: 'processor', count: 2 },
      { type: 'analyzer', count: 1 },
    ],
    configuration: {
      maxConcurrency: 5,
      timeout: 30000,
    },
  };
  
  res = authenticatedRequest(`${BASE_URL}/api/farms`, farmPayload, token);
  
  const farmCreated = check(res, {
    'Farm created successfully': (r) => r.status === 201,
    'Farm has ID': (r) => r.json('id') !== undefined,
  });
  
  errorRate.add(!farmCreated);
  apiDuration.add(res.timings.duration);
  
  let farmId = '';
  if (farmCreated) {
    farmId = res.json('id');
  }
  
  sleep(1);

  // Scenario 5: Real-time monitoring
  if (farmId) {
    res = http.get(`${BASE_URL}/api/farms/${farmId}/metrics`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    check(res, {
      'Metrics retrieved successfully': (r) => r.status === 200,
      'Metrics contain required fields': (r) => {
        const body = r.json();
        return body.cpu !== undefined && body.memory !== undefined;
      },
    });
    
    errorRate.add(res.status !== 200);
    apiDuration.add(res.timings.duration);
  }
  
  sleep(2);

  // Scenario 6: YAML generation
  const yamlPayload = {
    prompt: 'Create a data processing farm with 3 agents',
    preferences: {
      language: 'typescript',
      framework: 'node',
    },
  };
  
  res = authenticatedRequest(`${BASE_URL}/api/yaml/generate`, yamlPayload, token);
  
  check(res, {
    'YAML generated successfully': (r) => r.status === 200,
    'YAML generation under 5s': (r) => r.timings.duration < 5000,
  });
  
  errorRate.add(res.status !== 200);
  apiDuration.add(res.timings.duration);
  
  sleep(1);

  // Scenario 7: Analytics query
  res = http.get(`${BASE_URL}/api/analytics/summary?period=24h`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  
  check(res, {
    'Analytics retrieved successfully': (r) => r.status === 200,
    'Analytics response time acceptable': (r) => r.timings.duration < 2000,
  });
  
  errorRate.add(res.status !== 200);
  apiDuration.add(res.timings.duration);
  
  sleep(1);

  // Scenario 8: Concurrent API calls
  const batch = [
    ['GET', `${BASE_URL}/api/agents`, null, { headers: { 'Authorization': `Bearer ${token}` } }],
    ['GET', `${BASE_URL}/api/farms`, null, { headers: { 'Authorization': `Bearer ${token}` } }],
    ['GET', `${BASE_URL}/api/monitoring/alerts`, null, { headers: { 'Authorization': `Bearer ${token}` } }],
  ];
  
  const responses = http.batch(batch);
  
  responses.forEach((response, index) => {
    check(response, {
      [`Batch request ${index} successful`]: (r) => r.status === 200,
    });
    errorRate.add(response.status !== 200);
  });
  
  sleep(3);
}

// Teardown function
export function teardown(data) {
  console.log('Load test completed');
  console.log(`Total errors: ${errorRate.rate}`);
  console.log(`Average API duration: ${apiDuration.avg}ms`);
}