# MaiFarm End-to-End QA Test Plan

## Executive Summary
This comprehensive QA test plan is designed to ensure the MaiFarm application is production-ready by thoroughly testing the critical end-to-end flow from Farm Creation through Harvest completion. This plan is structured for both manual testing and automated testing by Claude agents.

## Table of Contents
1. [Test Environment Setup](#test-environment-setup)
2. [Critical Path Testing](#critical-path-testing)
3. [Feature-Specific Test Scenarios](#feature-specific-test-scenarios)
4. [Integration Test Suites](#integration-test-suites)
5. [Performance & Load Testing](#performance--load-testing)
6. [Security Testing](#security-testing)
7. [Automated Test Templates](#automated-test-templates)
8. [Rollback & Recovery Testing](#rollback--recovery-testing)
9. [Test Execution Schedule](#test-execution-schedule)
10. [Success Criteria](#success-criteria)

---

## Test Environment Setup

### Prerequisites
```bash
# System Requirements
- Node.js 18+ and npm 9+
- Docker and Docker Compose
- PostgreSQL 16 (or Docker container)
- Redis 7 (or Docker container)
- Chrome/Firefox/Safari latest versions
- 8GB RAM minimum, 16GB recommended

# Environment Variables (.env.development)
PORT=4567
NODE_ENV=development
BYPASS_AUTH=true
DB_HOST=localhost
DB_PORT=5432
DB_NAME=maifarm_test
DB_USER=maifarm
DB_PASSWORD=testpassword
REDIS_URL=redis://localhost:6379
WS_PORT=4567
```

### Setup Commands
```bash
# 1. Install dependencies
npm install

# 2. Start database services
docker-compose -f docker-compose.simple.yml up -d

# 3. Run database migrations
npm run db:migrate

# 4. Seed test data (if available)
npm run db:seed

# 5. Start application in development mode
npm run dev

# 6. Verify health check
curl http://localhost:4567/health
```

### Teardown Procedure
```bash
# 1. Stop all services
npm run docker:down

# 2. Clean test data
npm run db:clean

# 3. Clear cache
npm run cache:clear

# 4. Remove temporary files
rm -rf /tmp/claude_coordination/*
rm -rf ./temp/*
```

---

## Critical Path Testing

### 1. Farm Creation Flow (Priority: CRITICAL)

#### Test Case FC-001: Basic Farm Creation
**Objective:** Verify basic farm creation with minimal configuration

**Steps:**
1. Navigate to Dashboard
2. Click "Create New Farm" button
3. Enter farm details:
   - Name: "Test Farm Alpha"
   - Description: "Basic test farm"
   - Type: Sequential
4. Configure settings:
   - Auto-scaling: Enabled
   - Max agents: 3
   - Timeout: 1800 seconds
5. Generate YAML configuration
6. Review and confirm creation
7. Click "Create Farm"

**Expected Results:**
- Farm appears in dashboard within 5 seconds
- WebSocket connection established
- Farm status: "initializing" → "ready"
- Notification: "Farm created successfully"
- Farm ID generated and visible
- Active agents count: 0

**Validation Points:**
```javascript
// Automated validation
assert(farm.id !== null);
assert(farm.status === 'ready');
assert(farm.config.maxAgents === 3);
assert(websocket.connected === true);
```

#### Test Case FC-002: Farm Creation with Seed Template
**Objective:** Test farm creation using pre-configured seed templates

**Steps:**
1. Navigate to Dashboard
2. Click "Create from Seed"
3. Select seed: "Code Review Pipeline"
4. Customize seed parameters:
   - Branch: main
   - Language: TypeScript
   - Review depth: Comprehensive
5. Attach test files (optional)
6. Generate and review YAML
7. Create farm

**Expected Results:**
- Seed template loads correctly
- Parameters properly injected into YAML
- Farm inherits seed configuration
- Agents auto-initialize based on seed

#### Test Case FC-003: Farm Creation with File Attachments
**Objective:** Verify file upload and context handling

**Steps:**
1. Create new farm
2. Attach files:
   - Code file (.ts, .js)
   - Documentation (.md)
   - Configuration (.json)
3. Verify file upload progress
4. Generate YAML with file context
5. Create farm

**Expected Results:**
- Files upload successfully
- File metadata visible in UI
- YAML includes file references
- Files accessible to agents

### 2. GoWild Mode Testing (Priority: HIGH)

#### Test Case GW-001: Enable GoWild Mode
**Objective:** Test autonomous exploration features

**Steps:**
1. Create farm with GoWild enabled
2. Set creativity level: 7/10
3. Define boundaries:
   - Scope: "Frontend optimization"
   - Excluded: ["database", "auth"]
4. Start GoWild exploration
5. Monitor agent behavior for 5 minutes

**Expected Results:**
- Agents generate autonomous tasks
- Tasks respect defined boundaries
- Creativity metrics visible
- Safety checks active
- Rollback capability available

**Validation Points:**
```javascript
// Monitor GoWild behavior
assert(farm.goWildMode.enabled === true);
assert(farm.goWildMode.creativityLevel === 7);
assert(farm.goWildMode.boundaries.length > 0);
assert(farm.agents.some(a => a.autonomous === true));
```

#### Test Case GW-002: GoWild Safety Boundaries
**Objective:** Verify safety mechanisms prevent unwanted operations

**Steps:**
1. Enable GoWild with strict boundaries
2. Monitor for boundary violations
3. Test emergency stop functionality
4. Verify rollback mechanism

**Expected Results:**
- No operations outside defined scope
- Emergency stop halts all agents
- Rollback restores previous state
- Audit log captures all actions

### 3. Quick Task Execution (Priority: HIGH)

#### Test Case QT-001: Simple Quick Task
**Objective:** Test rapid task execution without full farm setup

**Steps:**
1. Click "Quick Task" from dashboard
2. Enter task: "Format all TypeScript files"
3. Select execution mode: "Fast"
4. Execute task
5. Monitor progress

**Expected Results:**
- Task executes within 30 seconds
- Progress indicators update real-time
- Results displayed in UI
- Task history recorded

#### Test Case QT-002: Quick Task with Dependencies
**Objective:** Test quick task that requires multiple operations

**Steps:**
1. Create quick task: "Run tests and fix failures"
2. Monitor multi-step execution:
   - Test discovery
   - Test execution
   - Failure analysis
   - Fix generation
   - Verification
3. Review results

**Expected Results:**
- Dependencies resolved automatically
- Each step status visible
- Failures handled gracefully
- Final report generated

### 4. Harvest Collection (Priority: CRITICAL)

#### Test Case HC-001: Basic Harvest Collection
**Objective:** Verify collection of agent outputs

**Steps:**
1. Create and run farm with 3 agents
2. Wait for task completion
3. Navigate to Harvest page
4. Click "Collect Harvest"
5. Review collected artifacts

**Expected Results:**
- All agent outputs collected
- Artifacts categorized correctly
- Download options available
- Harvest metrics displayed

**Validation Points:**
```javascript
// Harvest validation
assert(harvest.artifacts.length > 0);
assert(harvest.status === 'collected');
assert(harvest.metrics.totalTasks > 0);
assert(harvest.downloadUrl !== null);
```

#### Test Case HC-002: Harvest Analysis & Insights
**Objective:** Test AI-powered harvest analysis

**Steps:**
1. Collect harvest from completed farm
2. Click "Generate Insights"
3. Review AI analysis:
   - Code quality metrics
   - Performance improvements
   - Suggested next steps
4. Export insights report

**Expected Results:**
- Insights generated within 60 seconds
- Metrics visualized in charts
- Actionable recommendations provided
- Export formats: JSON, PDF, Markdown

#### Test Case HC-003: Harvest to Seed Conversion
**Objective:** Convert successful harvest into reusable seed

**Steps:**
1. Select completed harvest
2. Click "Save as Seed"
3. Configure seed metadata:
   - Name: "Optimized Pipeline v2"
   - Category: "Performance"
   - Tags: ["tested", "production"]
4. Save seed template

**Expected Results:**
- Seed created from harvest
- Available in seed library
- Configuration preserved
- Shareable with team

---

## Feature-Specific Test Scenarios

### 5. WebSocket Communication (Priority: HIGH)

#### Test Case WS-001: Connection Stability
**Objective:** Verify WebSocket connection reliability

**Test Steps:**
```javascript
// Automated test
const testWebSocketStability = async () => {
  // 1. Establish connection
  const ws = new WebSocket('ws://localhost:4567');
  
  // 2. Send ping every 5 seconds for 1 minute
  const interval = setInterval(() => {
    ws.send(JSON.stringify({ type: 'ping' }));
  }, 5000);
  
  // 3. Monitor for disconnections
  ws.on('close', () => {
    console.error('Unexpected disconnection');
  });
  
  // 4. Verify message delivery
  ws.on('message', (data) => {
    assert(JSON.parse(data).type === 'pong');
  });
  
  // 5. Clean disconnect after test
  setTimeout(() => {
    clearInterval(interval);
    ws.close();
  }, 60000);
};
```

#### Test Case WS-002: Multi-Client Broadcasting
**Objective:** Test real-time updates across multiple clients

**Steps:**
1. Open 3 browser tabs with dashboard
2. Create farm in tab 1
3. Verify farm appears in tabs 2 & 3
4. Update farm status in tab 2
5. Verify updates in all tabs

**Expected Results:**
- Updates propagate < 500ms
- No message duplication
- Consistent state across clients

### 6. Agent Lifecycle Management (Priority: HIGH)

#### Test Case AL-001: Agent Creation and Initialization
**Steps:**
1. Create farm with 3 agents
2. Monitor agent initialization:
   - Status: pending → initializing → ready
   - Resource allocation
   - Task assignment
3. Verify agent health checks

**Expected Results:**
- Agents initialize within 30 seconds
- Health status: healthy
- Metrics collection active

#### Test Case AL-002: Agent Failure Recovery
**Steps:**
1. Simulate agent failure (kill process)
2. Monitor recovery mechanism
3. Verify task reassignment
4. Check retry policy execution

**Expected Results:**
- Failed agent detected < 10 seconds
- Automatic restart attempted
- Tasks reassigned if restart fails
- Audit log updated

### 7. YAML Generation & Validation (Priority: MEDIUM)

#### Test Case YG-001: AI-Powered YAML Generation
**Steps:**
1. Enter natural language prompt:
   "Create a farm that reviews TypeScript code and suggests performance improvements"
2. Click "Generate YAML"
3. Review generated configuration
4. Validate YAML syntax
5. Test configuration deployment

**Expected Results:**
- Valid YAML generated
- Configuration matches prompt intent
- Syntax validation passes
- Deployable without errors

#### Test Case YG-002: YAML Template Customization
**Steps:**
1. Load existing template
2. Modify configuration:
   - Add custom environment variables
   - Change agent count
   - Update task priorities
3. Save as new template
4. Deploy modified configuration

**Expected Results:**
- Modifications preserved
- Template saves successfully
- Deployment uses updated config

---

## Integration Test Suites

### 8. End-to-End Workflow Tests

#### Test Suite E2E-001: Complete Farm Lifecycle
```javascript
// Automated E2E test template
describe('Farm Lifecycle E2E', () => {
  let farmId;
  
  beforeAll(async () => {
    // Setup test environment
    await setupTestEnvironment();
  });
  
  test('Create farm from seed', async () => {
    const farm = await api.createFarm({
      name: 'E2E Test Farm',
      seedId: 'code-review-seed',
      config: {
        maxAgents: 3,
        autoScale: true
      }
    });
    
    expect(farm.id).toBeDefined();
    expect(farm.status).toBe('initializing');
    farmId = farm.id;
  });
  
  test('Monitor farm execution', async () => {
    // Wait for farm to be ready
    await waitForStatus(farmId, 'ready', 30000);
    
    // Start farm tasks
    await api.startFarm(farmId);
    
    // Monitor progress
    const progress = await monitorProgress(farmId, 120000);
    expect(progress.tasksCompleted).toBeGreaterThan(0);
  });
  
  test('Collect harvest', async () => {
    // Wait for completion
    await waitForStatus(farmId, 'completed', 300000);
    
    // Collect harvest
    const harvest = await api.collectHarvest(farmId);
    expect(harvest.artifacts).toHaveLength(greaterThan(0));
    expect(harvest.status).toBe('collected');
  });
  
  test('Generate insights', async () => {
    const insights = await api.generateInsights(farmId);
    expect(insights.recommendations).toBeDefined();
    expect(insights.metrics).toBeDefined();
  });
  
  afterAll(async () => {
    // Cleanup
    await api.deleteFarm(farmId);
    await cleanupTestEnvironment();
  });
});
```

### 9. API Integration Tests

#### Test Suite API-001: REST API Endpoints
```javascript
// API test template
describe('API Endpoints', () => {
  test('POST /api/farms - Create farm', async () => {
    const response = await fetch('http://localhost:4567/api/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'API Test Farm',
        type: 'sequential',
        config: { maxAgents: 2 }
      })
    });
    
    expect(response.status).toBe(201);
    const farm = await response.json();
    expect(farm.id).toBeDefined();
  });
  
  test('GET /api/farms/:id - Get farm details', async () => {
    const response = await fetch(`http://localhost:4567/api/farms/${farmId}`);
    expect(response.status).toBe(200);
    const farm = await response.json();
    expect(farm.name).toBe('API Test Farm');
  });
  
  test('PUT /api/farms/:id/status - Update farm status', async () => {
    const response = await fetch(`http://localhost:4567/api/farms/${farmId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paused' })
    });
    
    expect(response.status).toBe(200);
  });
  
  test('DELETE /api/farms/:id - Delete farm', async () => {
    const response = await fetch(`http://localhost:4567/api/farms/${farmId}`, {
      method: 'DELETE'
    });
    
    expect(response.status).toBe(204);
  });
});
```

---

## Performance & Load Testing

### 10. Performance Benchmarks

#### Test Case PERF-001: Concurrent Farm Operations
**Objective:** Test system performance under load

**Test Configuration:**
```javascript
// K6 load test script
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 10 },  // Ramp up to 10 users
    { duration: '5m', target: 10 },  // Stay at 10 users
    { duration: '2m', target: 50 },  // Ramp up to 50 users
    { duration: '5m', target: 50 },  // Stay at 50 users
    { duration: '2m', target: 0 },   // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests under 2s
    http_req_failed: ['rate<0.1'],     // Error rate under 10%
  },
};

export default function() {
  // Create farm
  let createResponse = http.post('http://localhost:4567/api/farms', 
    JSON.stringify({
      name: `Load Test Farm ${__VU}`,
      type: 'parallel',
      config: { maxAgents: 2 }
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  check(createResponse, {
    'farm created': (r) => r.status === 201,
    'response time OK': (r) => r.timings.duration < 2000,
  });
  
  sleep(1);
  
  // Get farm status
  let farmId = JSON.parse(createResponse.body).id;
  let statusResponse = http.get(`http://localhost:4567/api/farms/${farmId}`);
  
  check(statusResponse, {
    'status retrieved': (r) => r.status === 200,
  });
  
  sleep(1);
}
```

**Success Criteria:**
- 95th percentile response time < 2 seconds
- Error rate < 10%
- No memory leaks over 15-minute test
- WebSocket connections stable

#### Test Case PERF-002: Large Farm Scalability
**Objective:** Test with maximum agent configuration

**Steps:**
1. Create farm with 20 agents
2. Execute complex workflow
3. Monitor resource usage:
   - CPU utilization < 80%
   - Memory usage < 4GB
   - Database connections < 100
4. Measure time to completion

**Expected Results:**
- System remains responsive
- No agent failures
- Completion time < 10 minutes

---

## Security Testing

### 11. Security Validation

#### Test Case SEC-001: Authentication & Authorization
**Steps:**
1. Test login with valid credentials
2. Test login with invalid credentials
3. Verify JWT token validation
4. Test role-based access control
5. Verify session timeout

**Expected Results:**
- Valid login generates JWT
- Invalid login rejected
- Expired tokens rejected
- RBAC enforced correctly
- Sessions expire after timeout

#### Test Case SEC-002: Input Validation & Sanitization
**Steps:**
1. Test XSS prevention:
   ```javascript
   farmName: "<script>alert('XSS')</script>"
   ```
2. Test SQL injection prevention:
   ```javascript
   farmId: "1' OR '1'='1"
   ```
3. Test file upload restrictions
4. Test rate limiting

**Expected Results:**
- Malicious input sanitized
- SQL injection prevented
- File types restricted
- Rate limits enforced

---

## Automated Test Templates

### 12. Claude Agent Test Automation

#### Template 1: Farm Creation Automation
```yaml
# claude-test-farm-creation.yaml
name: Automated Farm Creation Test
description: Claude agent automated test for farm creation

tasks:
  - name: Setup Environment
    type: shell
    commands:
      - npm install
      - npm run docker:up
      - npm run db:migrate
  
  - name: Create Test Farm
    type: api
    endpoint: POST /api/farms
    payload:
      name: "Claude Test Farm {{timestamp}}"
      type: sequential
      config:
        maxAgents: 3
        autoScale: true
    validation:
      - status: 201
      - response.id: exists
      - response.status: "initializing"
  
  - name: Monitor Farm Status
    type: websocket
    events:
      - listen: "farm:status"
      - wait_for: 
          status: "ready"
          timeout: 30s
  
  - name: Execute Farm Tasks
    type: api
    endpoint: POST /api/farms/{{farm_id}}/start
    validation:
      - status: 200
  
  - name: Collect Harvest
    type: api
    endpoint: POST /api/farms/{{farm_id}}/harvest
    wait_for:
      status: "completed"
      timeout: 5m
    validation:
      - response.artifacts: length > 0
      - response.status: "collected"
  
  - name: Cleanup
    type: shell
    commands:
      - curl -X DELETE http://localhost:4567/api/farms/{{farm_id}}
      - npm run docker:down
```

#### Template 2: GoWild Mode Testing
```javascript
// claude-test-gowild.js
const testGoWildMode = async () => {
  console.log('Starting GoWild Mode Test...');
  
  // 1. Create farm with GoWild enabled
  const farm = await createFarm({
    name: 'GoWild Test Farm',
    config: {
      goWildMode: {
        enabled: true,
        creativityLevel: 5,
        boundaries: ['src/', 'tests/'],
        excludePatterns: ['*.prod.*', 'node_modules']
      }
    }
  });
  
  // 2. Start GoWild exploration
  await startGoWild(farm.id);
  
  // 3. Monitor for 2 minutes
  const startTime = Date.now();
  const explorationResults = [];
  
  while (Date.now() - startTime < 120000) {
    const status = await getFarmStatus(farm.id);
    explorationResults.push(status.goWildMetrics);
    
    // Check boundaries
    assert(status.goWildMetrics.boundaryViolations === 0);
    
    await sleep(5000);
  }
  
  // 4. Stop and analyze
  await stopGoWild(farm.id);
  
  // 5. Validate results
  assert(explorationResults.length > 0);
  assert(explorationResults.some(r => r.tasksGenerated > 0));
  
  console.log('GoWild Mode Test Completed Successfully');
  return explorationResults;
};
```

#### Template 3: Quick Task Execution
```javascript
// claude-test-quicktask.js
const testQuickTask = async () => {
  const quickTasks = [
    {
      description: 'Format all TypeScript files',
      expectedDuration: 30000,
      validation: (result) => result.filesFormatted > 0
    },
    {
      description: 'Run linting and fix issues',
      expectedDuration: 60000,
      validation: (result) => result.issuesFixed >= 0
    },
    {
      description: 'Generate component documentation',
      expectedDuration: 45000,
      validation: (result) => result.docsGenerated > 0
    }
  ];
  
  for (const task of quickTasks) {
    console.log(`Testing: ${task.description}`);
    
    const startTime = Date.now();
    const result = await executeQuickTask(task.description);
    const duration = Date.now() - startTime;
    
    // Validate execution time
    assert(duration < task.expectedDuration, 
      `Task took ${duration}ms, expected < ${task.expectedDuration}ms`);
    
    // Validate results
    assert(task.validation(result), 
      `Task validation failed for: ${task.description}`);
    
    console.log(`✓ ${task.description} completed in ${duration}ms`);
  }
};
```

---

## Rollback & Recovery Testing

### 13. Failure Recovery Scenarios

#### Test Case RR-001: Farm Crash Recovery
**Steps:**
1. Create farm with 5 agents
2. Start long-running task
3. Simulate crash (kill process)
4. Restart application
5. Verify farm recovery

**Expected Results:**
- Farm state persisted
- Tasks resume from checkpoint
- No data loss
- Agents reconnect

#### Test Case RR-002: Database Connection Loss
**Steps:**
1. Create active farm
2. Stop database service
3. Monitor error handling
4. Restart database
5. Verify reconnection

**Expected Results:**
- Graceful degradation
- Error messages logged
- Automatic reconnection
- State synchronized

---

## Test Execution Schedule

### Daily Tests (Automated)
- [ ] Smoke Tests (15 minutes)
  - Basic farm creation
  - Quick task execution
  - WebSocket connectivity
  - API health checks

### Weekly Tests (Semi-Automated)
- [ ] Integration Tests (2 hours)
  - Full E2E workflows
  - Cross-feature testing
  - Performance benchmarks
  - Security scans

### Release Tests (Manual + Automated)
- [ ] Complete Test Suite (8 hours)
  - All test cases
  - Load testing
  - Security audit
  - Browser compatibility
  - Mobile responsiveness

---

## Success Criteria

### Minimum Requirements for Production
1. **Functional Requirements**
   - ✅ 100% of critical path tests pass
   - ✅ 95% of high priority tests pass
   - ✅ 90% of medium priority tests pass

2. **Performance Requirements**
   - ✅ API response time p95 < 2 seconds
   - ✅ WebSocket latency < 100ms
   - ✅ Farm creation < 10 seconds
   - ✅ Harvest collection < 30 seconds

3. **Reliability Requirements**
   - ✅ 99.9% uptime over 24 hours
   - ✅ Zero data loss scenarios
   - ✅ Automatic recovery from crashes
   - ✅ Graceful degradation under load

4. **Security Requirements**
   - ✅ No critical vulnerabilities
   - ✅ Authentication properly enforced
   - ✅ Input validation on all endpoints
   - ✅ Rate limiting active

5. **User Experience Requirements**
   - ✅ UI responsive on all devices
   - ✅ Real-time updates < 500ms
   - ✅ Clear error messages
   - ✅ Progress indicators accurate

---

## Test Reporting

### Test Report Template
```markdown
## Test Execution Report - [DATE]

### Summary
- Total Tests: X
- Passed: X (X%)
- Failed: X (X%)
- Skipped: X (X%)
- Duration: X hours

### Critical Issues
1. [Issue description]
   - Severity: Critical/High/Medium/Low
   - Impact: [User impact]
   - Resolution: [Fix or workaround]

### Test Results by Category
- Farm Creation: X/X passed
- GoWild Mode: X/X passed
- Quick Tasks: X/X passed
- Harvest: X/X passed
- WebSocket: X/X passed
- Performance: X/X passed
- Security: X/X passed

### Recommendations
- [Action items for development team]
- [Required fixes before production]
- [Performance optimizations needed]

### Sign-off
- QA Lead: [Name] - [Date]
- Dev Lead: [Name] - [Date]
- Product Owner: [Name] - [Date]
```

---

## Appendix

### A. Test Data Sets
```javascript
// test-data.js
export const testFarms = [
  {
    name: 'Simple Sequential Farm',
    type: 'sequential',
    config: { maxAgents: 2, autoScale: false }
  },
  {
    name: 'Complex Parallel Farm',
    type: 'parallel',
    config: { maxAgents: 10, autoScale: true }
  },
  {
    name: 'GoWild Exploration Farm',
    type: 'exploration',
    config: { 
      maxAgents: 5, 
      goWildMode: { enabled: true, creativityLevel: 7 }
    }
  }
];

export const testTasks = [
  'Format all code files',
  'Run tests and fix failures',
  'Generate API documentation',
  'Optimize performance bottlenecks',
  'Review security vulnerabilities'
];
```

### B. Common Issues & Solutions
| Issue | Symptoms | Solution |
|-------|----------|----------|
| WebSocket Disconnect | "Connection lost" errors | Check firewall, increase timeout |
| Slow Farm Creation | >30 seconds to create | Check database indexes, connection pool |
| Agent Failures | Agents stuck in "initializing" | Verify /tmp permissions, check logs |
| Harvest Incomplete | Missing artifacts | Check agent completion status |
| Memory Leaks | Increasing memory usage | Review WebSocket listeners, clear intervals |

### C. Environment Variables for Testing
```bash
# Test environment overrides
TEST_MODE=true
LOG_LEVEL=debug
BYPASS_AUTH=true
MOCK_CLAUDE_API=true
TEST_TIMEOUT=300000
MAX_TEST_FARMS=50
CLEANUP_ON_EXIT=true
```

### D. Useful Testing Commands
```bash
# Run specific test suite
npm test -- --testNamePattern="Farm Creation"

# Run with coverage
npm run test:coverage

# Run E2E tests headless
npm run test:e2e:headless

# Generate test report
npm run test:report

# Performance profiling
npm run perf:profile

# Security audit
npm audit
npm run security:scan

# Clean test environment
npm run test:clean
```

---

## Version History
- v1.0.0 - Initial QA Test Plan (2025-08-04)
- Authors: Claude AI Assistant
- Review: Pending

## Contact
For questions or updates to this test plan:
- GitHub Issues: https://github.com/[your-repo]/maifarm/issues
- Documentation: /docs/testing
- Slack: #maifarm-qa

---

**Note:** This test plan should be treated as a living document and updated regularly based on:
- New features added
- Bugs discovered
- Performance benchmarks
- User feedback
- Production incidents