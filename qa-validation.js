#!/usr/bin/env node

/**
 * QA Validation Script
 * Validates all fixes implemented for the QA issues
 */

const axios = require('axios');
const io = require('socket.io-client');
const chalk = require('chalk');

const BASE_URL = process.env.API_URL || 'http://localhost:4567';
const WS_URL = process.env.WS_URL || 'http://localhost:4567';

class QAValidator {
  constructor() {
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      details: []
    };
  }

  log(message, type = 'info') {
    const prefix = {
      info: chalk.blue('ℹ'),
      success: chalk.green('✓'),
      error: chalk.red('✗'),
      warning: chalk.yellow('⚠')
    };
    console.log(`${prefix[type] || ''} ${message}`);
  }

  async test(name, testFn) {
    this.results.total++;
    this.log(`Testing: ${name}`);
    
    try {
      await testFn();
      this.results.passed++;
      this.results.details.push({ name, status: 'PASSED' });
      this.log(`${name} - PASSED`, 'success');
      return true;
    } catch (error) {
      this.results.failed++;
      this.results.details.push({ 
        name, 
        status: 'FAILED', 
        error: error.message 
      });
      this.log(`${name} - FAILED: ${error.message}`, 'error');
      return false;
    }
  }

  async validateWebSocketConnection() {
    return new Promise((resolve, reject) => {
      const socket = io(WS_URL, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        auth: { userId: 'qa-validator' }
      });

      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error('WebSocket connection timeout'));
      }, 10000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        
        // Test heartbeat
        let pingReceived = false;
        socket.on('ping', () => {
          pingReceived = true;
          socket.emit('pong');
        });

        setTimeout(() => {
          socket.close();
          if (pingReceived) {
            resolve();
          } else {
            reject(new Error('No heartbeat received'));
          }
        }, 3000);
      });

      socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        socket.close();
        reject(new Error(`Connection failed: ${error.message}`));
      });
    });
  }

  async validateRedisWithFallback() {
    const response = await axios.get(`${BASE_URL}/health`);
    const { services } = response.data;
    
    // Redis can be degraded but app should still work
    if (services.api === 'healthy') {
      if (services.redis === 'degraded') {
        this.log('Redis is degraded, but fallback is working', 'warning');
      }
      return true;
    }
    throw new Error('API is not healthy');
  }

  async validateJSONResponses() {
    // Test various endpoints for JSON responses
    const endpoints = [
      '/api/farms',
      '/api/tasks',
      '/api/agents',
      '/api/metrics'
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(`${BASE_URL}${endpoint}`, {
          headers: { 'Accept': 'application/json' }
        });
        
        if (!response.headers['content-type'].includes('application/json')) {
          throw new Error(`${endpoint} did not return JSON`);
        }
        
        if (!response.data.hasOwnProperty('success')) {
          throw new Error(`${endpoint} response missing 'success' field`);
        }
      } catch (error) {
        if (error.response) {
          // Even error responses should be JSON
          if (!error.response.headers['content-type'].includes('application/json')) {
            throw new Error(`${endpoint} error response is not JSON`);
          }
        } else {
          throw error;
        }
      }
    }
  }

  async validateQuickTaskEndpoint() {
    const testCases = [
      {
        payload: { description: 'Test task 1', mode: 'fast' },
        shouldPass: true
      },
      {
        payload: { description: 'Test task 2', title: 'Custom Title' },
        shouldPass: true
      },
      {
        payload: { mode: 'fast' }, // Missing description
        shouldPass: false
      }
    ];

    for (const testCase of testCases) {
      try {
        const response = await axios.post(
          `${BASE_URL}/api/tasks/quick`,
          testCase.payload
        );
        
        if (!testCase.shouldPass) {
          throw new Error('Should have failed but passed');
        }
        
        if (!response.data.success) {
          throw new Error('Success flag is false');
        }
      } catch (error) {
        if (testCase.shouldPass) {
          throw new Error(`Valid request failed: ${error.message}`);
        }
        
        // Verify error is properly formatted
        if (error.response) {
          const { data } = error.response;
          if (!data.success === false || !data.error) {
            throw new Error('Error response not properly formatted');
          }
        }
      }
    }
  }

  async validateSecurityHeaders() {
    const response = await axios.get(`${BASE_URL}/health`);
    const headers = response.headers;
    
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
  }

  async validateInputSanitization() {
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '"><script>alert(1)</script>',
      'javascript:alert(1)'
    ];
    
    for (const payload of xssPayloads) {
      try {
        const response = await axios.post(`${BASE_URL}/api/tasks/quick`, {
          description: payload
        });
        
        // Check response doesn't contain unescaped script
        const responseText = JSON.stringify(response.data);
        if (responseText.includes('<script>') || responseText.includes('javascript:')) {
          throw new Error('XSS not properly sanitized');
        }
      } catch (error) {
        // If it's a validation error, that's also acceptable
        if (error.response && error.response.status === 400) {
          continue;
        }
        throw error;
      }
    }
  }

  async validateErrorHandling() {
    // Test 404 handling
    try {
      await axios.get(`${BASE_URL}/api/nonexistent`);
      throw new Error('Should have returned 404');
    } catch (error) {
      if (error.response) {
        if (error.response.status !== 404) {
          throw new Error(`Expected 404, got ${error.response.status}`);
        }
        if (!error.response.data.error) {
          throw new Error('404 response missing error object');
        }
      } else {
        throw error;
      }
    }
    
    // Test malformed JSON
    try {
      await axios.post(`${BASE_URL}/api/tasks`, '{ invalid json', {
        headers: { 'Content-Type': 'application/json' }
      });
      throw new Error('Should have rejected malformed JSON');
    } catch (error) {
      if (!error.response || error.response.status !== 400) {
        throw new Error('Malformed JSON not properly handled');
      }
    }
  }

  async runAllTests() {
    console.log(chalk.bold('\n🔍 MaiFarm QA Validation Suite\n'));
    console.log(`Testing against: ${BASE_URL}\n`);

    // Critical Tests (Must Pass)
    await this.test('1. WebSocket Connectivity', 
      () => this.validateWebSocketConnection());
    
    await this.test('2. Redis Connection with Fallback', 
      () => this.validateRedisWithFallback());
    
    await this.test('3. JSON API Responses', 
      () => this.validateJSONResponses());
    
    await this.test('4. Quick Task Endpoint', 
      () => this.validateQuickTaskEndpoint());
    
    // Security Tests
    await this.test('5. Security Headers', 
      () => this.validateSecurityHeaders());
    
    await this.test('6. Input Sanitization', 
      () => this.validateInputSanitization());
    
    await this.test('7. Error Handling', 
      () => this.validateErrorHandling());

    // Print summary
    console.log(chalk.bold('\n📊 Test Summary\n'));
    console.log(`Total Tests: ${this.results.total}`);
    console.log(chalk.green(`Passed: ${this.results.passed}`));
    console.log(chalk.red(`Failed: ${this.results.failed}`));
    
    const passRate = (this.results.passed / this.results.total * 100).toFixed(1);
    console.log(`Pass Rate: ${passRate}%`);
    
    if (this.results.failed > 0) {
      console.log(chalk.bold('\n❌ Failed Tests:'));
      this.results.details
        .filter(d => d.status === 'FAILED')
        .forEach(d => {
          console.log(chalk.red(`  - ${d.name}: ${d.error}`));
        });
    }
    
    // Determine overall status
    const criticalTestsPassed = this.results.details
      .slice(0, 4)
      .every(d => d.status === 'PASSED');
    
    if (criticalTestsPassed && passRate >= 80) {
      console.log(chalk.bold.green('\n✅ QA VALIDATION PASSED'));
      console.log('All critical issues have been resolved.');
      process.exit(0);
    } else if (criticalTestsPassed) {
      console.log(chalk.bold.yellow('\n⚠️ QA VALIDATION PARTIALLY PASSED'));
      console.log('Critical issues resolved, but some improvements needed.');
      process.exit(0);
    } else {
      console.log(chalk.bold.red('\n❌ QA VALIDATION FAILED'));
      console.log('Critical issues still need to be addressed.');
      process.exit(1);
    }
  }
}

// Run validation
const validator = new QAValidator();

// Handle server not running
process.on('unhandledRejection', (error) => {
  if (error.code === 'ECONNREFUSED') {
    console.error(chalk.red('\n❌ Cannot connect to server'));
    console.error('Please ensure the server is running on port 4567');
    console.error('Run: npm run dev');
    process.exit(1);
  } else {
    console.error(chalk.red('\n❌ Unexpected error:'), error);
    process.exit(1);
  }
});

// Add chalk to dependencies if not present
try {
  require('chalk');
} catch (e) {
  console.log('Installing required dependencies...');
  require('child_process').execSync('npm install chalk', { stdio: 'inherit' });
}

validator.runAllTests().catch(error => {
  console.error(chalk.red('\n❌ Validation suite failed:'), error);
  process.exit(1);
});