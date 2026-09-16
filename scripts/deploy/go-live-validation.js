#!/usr/bin/env node
/**
 * GO-LIVE VALIDATION SCRIPT
 * Comprehensive end-to-end validation for production readiness
 */

import axios from 'axios';
import { io } from 'socket.io-client';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

const BASE_URL = 'http://localhost:4567';
const FRONTEND_URL = 'http://localhost:3000';

// Test results tracking
const results = {
  passed: [],
  failed: [],
  warnings: []
};

// Test utilities
async function test(name, fn) {
  try {
    console.log(`\n🧪 Testing: ${name}...`);
    await fn();
    results.passed.push(name);
    console.log(`✅ PASSED: ${name}`);
  } catch (error) {
    results.failed.push({ name, error: error.message });
    console.error(`❌ FAILED: ${name}`);
    console.error(`   Error: ${error.message}`);
  }
}

async function warn(message) {
  results.warnings.push(message);
  console.warn(`⚠️  WARNING: ${message}`);
}

// API Tests
async function testAPIEndpoints() {
  console.log('\n\n=== 🌐 API ENDPOINT VALIDATION ===');

  // Test health endpoints
  await test('API Health Check', async () => {
    const { data } = await axios.get(`${BASE_URL}/`);
    if (data.status !== 'ok' && data.status !== 'degraded') {
      throw new Error(`Unexpected status: ${data.status}`);
    }
  });

  // Test authentication
  await test('Authentication Required', async () => {
    try {
      await axios.get(`${BASE_URL}/api/farms`);
      throw new Error('Should require authentication');
    } catch (error) {
      if (!error.response || error.response.status !== 401) {
        throw new Error('Should return 401 for unauthenticated requests');
      }
    }
  });

  // Test CORS headers
  await test('CORS Headers', async () => {
    const response = await axios.options(`${BASE_URL}/api/farms`, {
      headers: { 'Origin': 'http://localhost:3000' }
    });
    if (!response.headers['access-control-allow-origin']) {
      throw new Error('CORS headers missing');
    }
  });

  // Test rate limiting
  await test('Rate Limiting', async () => {
    const requests = [];
    for (let i = 0; i < 150; i++) {
      requests.push(axios.get(`${BASE_URL}/`).catch(e => e));
    }
    const responses = await Promise.all(requests);
    const rateLimited = responses.some(r => r.response && r.response.status === 429);
    if (!rateLimited) {
      warn('Rate limiting may not be configured properly');
    }
  });
}

// WebSocket Tests
async function testWebSocketFeatures() {
  console.log('\n\n=== 🔌 WEBSOCKET VALIDATION ===');

  await test('WebSocket Connection', async () => {
    const socket = io(BASE_URL, {
      transports: ['websocket'],
      timeout: 5000
    });

    return new Promise((resolve, reject) => {
      socket.on('connect', () => {
        socket.disconnect();
        resolve();
      });
      socket.on('connect_error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  });

  await test('WebSocket Reconnection', async () => {
    const socket = io(BASE_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 3
    });

    return new Promise((resolve, reject) => {
      socket.on('connect', () => {
        socket.disconnect();
        socket.connect();
        socket.on('connect', () => {
          socket.disconnect();
          resolve();
        });
      });
      socket.on('connect_error', reject);
      setTimeout(() => reject(new Error('Reconnection failed')), 10000);
    });
  });
}

// Database Tests
async function testDatabaseIntegrity() {
  console.log('\n\n=== 🗄️ DATABASE VALIDATION ===');

  await test('Database Connection', async () => {
    const { stdout } = await execAsync('npm run db:health 2>&1 | grep "DATABASE HEALTH"');
    if (!stdout.includes('DATABASE HEALTH')) {
      throw new Error('Database health check failed');
    }
  });

  await test('Critical Tables Exist', async () => {
    const { stdout } = await execAsync(`
      PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -t -c "
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema='public'
        AND table_name IN ('farms', 'agents', 'harvests', 'users', 'api_keys')
      " 2>&1
    `);
    const tableCount = parseInt(stdout.trim());
    if (tableCount < 5) {
      throw new Error(`Missing critical tables. Found only ${tableCount} of 5`);
    }
  });

  await test('Indexes Exist', async () => {
    const { stdout } = await execAsync(`
      PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -c "
        SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public'
      " -t 2>&1
    `);
    const indexCount = parseInt(stdout.trim());
    if (indexCount < 20) {
      warn(`Only ${indexCount} indexes found. Consider adding more for performance.`);
    }
  });
}

// Security Tests
async function testSecurityFeatures() {
  console.log('\n\n=== 🔒 SECURITY VALIDATION ===');

  await test('Security Headers', async () => {
    const { headers } = await axios.get(`${BASE_URL}/`);
    const requiredHeaders = [
      'x-content-type-options',
      'x-frame-options',
      'x-xss-protection'
    ];

    for (const header of requiredHeaders) {
      if (!headers[header]) {
        throw new Error(`Missing security header: ${header}`);
      }
    }
  });

  await test('SQL Injection Protection', async () => {
    try {
      await axios.get(`${BASE_URL}/api/farms?id=1' OR '1'='1`);
    } catch (error) {
      // Should fail safely
      if (error.response && error.response.status === 500) {
        throw new Error('SQL injection vulnerability detected');
      }
    }
  });

  await test('Environment Variables', async () => {
    const { stdout } = await execAsync('grep -c "ANTHROPIC_API_KEY" .env.development 2>/dev/null || echo 0');
    if (stdout.trim() === '0') {
      throw new Error('API keys not configured in environment');
    }
  });
}

// Performance Tests
async function testPerformance() {
  console.log('\n\n=== ⚡ PERFORMANCE VALIDATION ===');

  await test('API Response Time', async () => {
    const start = Date.now();
    await axios.get(`${BASE_URL}/`);
    const duration = Date.now() - start;

    if (duration > 500) {
      warn(`Slow API response: ${duration}ms (should be <500ms)`);
    }
  });

  await test('Bundle Size Check', async () => {
    const { stdout } = await execAsync('du -sh apps/dashboard/dist 2>/dev/null || echo "0"');
    const sizeStr = stdout.trim().split('\t')[0];

    if (sizeStr === '0') {
      warn('Production build not found. Run npm run build to check bundle size.');
    } else {
      console.log(`   Bundle size: ${sizeStr}`);
      // Parse size and warn if too large
      const sizeNum = parseFloat(sizeStr);
      const unit = sizeStr.replace(/[0-9.]/g, '');
      if ((unit === 'M' && sizeNum > 10) || unit === 'G') {
        warn(`Bundle size is large: ${sizeStr}. Consider code splitting.`);
      }
    }
  });

  await test('Memory Usage', async () => {
    const { stdout } = await execAsync('ps aux | grep "node.*index.ts" | grep -v grep | awk \'{print $6}\'');
    const memoryKB = parseInt(stdout.trim() || '0');
    const memoryMB = memoryKB / 1024;

    if (memoryMB > 500) {
      warn(`High memory usage: ${memoryMB.toFixed(2)}MB`);
    }
  });
}

// Frontend Tests
async function testFrontend() {
  console.log('\n\n=== 🎨 FRONTEND VALIDATION ===');

  await test('Frontend Build', async () => {
    try {
      const { stdout } = await execAsync('ls apps/dashboard/dist/index.html 2>/dev/null');
      if (!stdout) {
        warn('Frontend not built. Run npm run build for production.');
      }
    } catch {
      warn('Frontend build not found. Development mode OK.');
    }
  });

  await test('Frontend Accessibility', async () => {
    // Basic check for ARIA attributes in components
    const { stdout } = await execAsync('grep -r "aria-" apps/dashboard/src/components 2>/dev/null | wc -l');
    const ariaCount = parseInt(stdout.trim());

    if (ariaCount < 10) {
      warn(`Low accessibility coverage: only ${ariaCount} ARIA attributes found`);
    }
  });
}

// Error Recovery Tests
async function testErrorRecovery() {
  console.log('\n\n=== 🔄 ERROR RECOVERY VALIDATION ===');

  await test('Graceful Shutdown Handler', async () => {
    const { stdout } = await execAsync('grep -c "SIGTERM\\|SIGINT" apps/api/src/index.ts');
    const handlerCount = parseInt(stdout.trim());

    if (handlerCount < 2) {
      throw new Error('Missing graceful shutdown handlers');
    }
  });

  await test('Error Boundaries', async () => {
    const { stdout } = await execAsync('grep -r "ErrorBoundary" apps/dashboard/src 2>/dev/null | wc -l');
    const boundaryCount = parseInt(stdout.trim());

    if (boundaryCount < 1) {
      warn('No React Error Boundaries found. Add for better error handling.');
    }
  });
}

// Main execution
async function runValidation() {
  console.log('🚀 GO-LIVE VALIDATION STARTING...');
  console.log('================================\n');

  // Check if server is running
  try {
    await axios.get(`${BASE_URL}/`);
  } catch (error) {
    console.error('❌ Server not running on port 4567');
    console.error('   Run: npm run dev');
    process.exit(1);
  }

  // Run all test suites
  await testAPIEndpoints();
  await testWebSocketFeatures();
  await testDatabaseIntegrity();
  await testSecurityFeatures();
  await testPerformance();
  await testFrontend();
  await testErrorRecovery();

  // Generate report
  console.log('\n\n');
  console.log('====================================');
  console.log('📊 GO-LIVE VALIDATION REPORT');
  console.log('====================================\n');

  const total = results.passed.length + results.failed.length;
  const passRate = ((results.passed.length / total) * 100).toFixed(1);

  console.log(`✅ Passed: ${results.passed.length}/${total} (${passRate}%)`);
  console.log(`❌ Failed: ${results.failed.length}/${total}`);
  console.log(`⚠️  Warnings: ${results.warnings.length}`);

  if (results.failed.length > 0) {
    console.log('\n🔴 FAILED TESTS:');
    results.failed.forEach(({ name, error }) => {
      console.log(`  - ${name}: ${error}`);
    });
  }

  if (results.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    results.warnings.forEach(warning => {
      console.log(`  - ${warning}`);
    });
  }

  // Final status
  console.log('\n====================================');
  if (results.failed.length === 0) {
    console.log('✅ STATUS: READY FOR GO-LIVE');
    console.log('   All critical tests passed!');
  } else if (results.failed.length <= 2) {
    console.log('⚠️  STATUS: NEARLY READY');
    console.log('   Fix the remaining issues before go-live.');
  } else {
    console.log('❌ STATUS: NOT READY');
    console.log('   Multiple critical issues need resolution.');
  }
  console.log('====================================\n');

  process.exit(results.failed.length > 0 ? 1 : 0);
}

// Run validation
runValidation().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});