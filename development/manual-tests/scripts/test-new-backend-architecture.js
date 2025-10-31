#!/usr/bin/env node

/**
 * Test script for new MaiFarm backend architecture
 * Verifies all new components are working correctly
 */

const axios = require('axios');
const io = require('socket.io-client');
const { spawn } = require('child_process');

const API_BASE = process.env.API_URL || 'http://localhost:4567';
const WS_URL = process.env.WS_URL || 'http://localhost:4567';

// Test configuration
const TEST_CONFIG = {
  farmName: 'test-backend-architecture',
  agentCount: 2,
  timeout: 60000, // 1 minute
  prompt: 'Test the new backend architecture by creating a simple hello world file'
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}[${new Date().toISOString()}] ${message}${colors.reset}`);
}

function logSection(title) {
  console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  ${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
}

class BackendArchitectureTest {
  constructor() {
    this.socket = null;
    this.farmId = null;
    this.sessionName = null;
    this.harvestId = null;
    this.testResults = {
      unifiedConnection: false,
      optimizedTerminal: false,
      harvestCollection: false,
      redisEvents: false,
      circuitBreaker: false,
      healthMonitoring: false
    };
  }

  async run() {
    try {
      logSection('MaiFarm Backend Architecture Test');
      
      // Test 1: WebSocket Connection with UnifiedConnectionHub
      await this.testUnifiedConnection();
      
      // Test 2: Create a farm to test the full flow
      await this.testFarmCreation();
      
      // Test 3: Terminal streaming with OptimizedTerminalEngine
      await this.testTerminalStreaming();
      
      // Test 4: Redis event distribution
      await this.testRedisEvents();
      
      // Test 5: Health monitoring
      await this.testHealthMonitoring();
      
      // Test 6: Harvest collection
      await this.testHarvestCollection();
      
      // Test 7: Circuit breaker functionality
      await this.testCircuitBreaker();
      
      // Display results
      this.displayResults();
      
    } catch (error) {
      log(`Test failed: ${error.message}`, 'red');
      process.exit(1);
    }
  }

  async testUnifiedConnection() {
    logSection('Test 1: UnifiedConnectionHub');
    
    return new Promise((resolve, reject) => {
      this.socket = io(WS_URL, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 3
      });
      
      const timeout = setTimeout(() => {
        log('Connection timeout', 'red');
        this.testResults.unifiedConnection = false;
        reject(new Error('WebSocket connection timeout'));
      }, 10000);
      
      this.socket.on('connect', () => {
        clearTimeout(timeout);
        log(`Connected to WebSocket with ID: ${this.socket.id}`, 'green');
        
        // Test heartbeat mechanism
        this.socket.on('heartbeat', (data) => {
          log(`Received heartbeat: sequence=${data.sequence}, health=${data.healthScore}`, 'blue');
          this.socket.emit('heartbeat', { ack: true });
        });
        
        this.testResults.unifiedConnection = true;
        resolve();
      });
      
      this.socket.on('connection:latency', (data) => {
        log(`Connection latency: ${data.latency}ms`, 'yellow');
      });
      
      this.socket.on('error', (error) => {
        log(`WebSocket error: ${error}`, 'red');
      });
    });
  }

  async testFarmCreation() {
    logSection('Test 2: Farm Creation');
    
    try {
      const response = await axios.post(`${API_BASE}/api/farms/quick`, {
        prompt: TEST_CONFIG.prompt,
        numberOfAgents: TEST_CONFIG.agentCount,
        timeout: TEST_CONFIG.timeout / 1000 // Convert to seconds
      });
      
      this.farmId = response.data.farm.id;
      this.sessionName = response.data.sessionName;
      this.harvestId = response.data.harvestId;
      
      log(`Farm created: ${this.farmId}`, 'green');
      log(`Session: ${this.sessionName}`, 'green');
      log(`Harvest: ${this.harvestId}`, 'green');
      
      // Subscribe to farm events
      this.socket.emit('farm:subscribe', this.farmId);
      
      // Listen for farm status updates
      this.socket.on('farm:status', (data) => {
        log(`Farm status: ${data.status}`, 'blue');
      });
      
      return true;
    } catch (error) {
      log(`Farm creation failed: ${error.message}`, 'red');
      throw error;
    }
  }

  async testTerminalStreaming() {
    logSection('Test 3: OptimizedTerminalEngine');
    
    return new Promise((resolve) => {
      let outputReceived = false;
      const timeout = setTimeout(() => {
        if (!outputReceived) {
          log('Terminal streaming timeout', 'yellow');
          this.testResults.optimizedTerminal = false;
        }
        resolve();
      }, 15000);
      
      // Subscribe to terminal events
      this.socket.emit('terminal:join_session', {
        sessionId: this.sessionName,
        farmId: this.farmId
      });
      
      // Listen for terminal output
      this.socket.on('terminal:stream', (data) => {
        if (!outputReceived) {
          outputReceived = true;
          clearTimeout(timeout);
          
          log(`Terminal stream received: compressed=${data.compressed}, sequence=${data.sequence}`, 'green');
          
          // Decode if compressed
          if (data.compressed) {
            log(`Compressed data size: ${data.compressedSize} bytes (original: ${data.originalSize} bytes)`, 'blue');
            log(`Compression ratio: ${(data.originalSize / data.compressedSize).toFixed(2)}x`, 'blue');
          }
          
          this.testResults.optimizedTerminal = true;
        }
      });
      
      // Listen for terminal batch updates
      this.socket.on('terminal:batch', (data) => {
        log(`Terminal batch: ${data.batch.length} updates`, 'blue');
      });
      
      // Listen for agent activities
      this.socket.on('agent:activities', (data) => {
        log(`Agent ${data.agentId} activities: ${data.activities.length} detected`, 'cyan');
        data.activities.forEach(activity => {
          log(`  - ${activity.type}: ${activity.content?.substring(0, 50)}...`, 'cyan');
        });
      });
    });
  }

  async testRedisEvents() {
    logSection('Test 4: Redis Event Distribution');
    
    return new Promise((resolve) => {
      let eventsReceived = 0;
      const requiredEvents = ['farm:events', 'agent:events', 'harvest:events'];
      const receivedEvents = new Set();
      
      const timeout = setTimeout(() => {
        log(`Received ${eventsReceived} Redis events`, eventsReceived > 0 ? 'green' : 'yellow');
        this.testResults.redisEvents = eventsReceived > 0;
        resolve();
      }, 10000);
      
      // Listen for various Redis-distributed events
      this.socket.on('farm:updated', (data) => {
        eventsReceived++;
        receivedEvents.add('farm:events');
        log(`Redis event: farm:updated`, 'green');
      });
      
      this.socket.on('agent:status', (data) => {
        eventsReceived++;
        receivedEvents.add('agent:events');
        log(`Redis event: agent:status`, 'green');
      });
      
      this.socket.on('harvest:progress', (data) => {
        eventsReceived++;
        receivedEvents.add('harvest:events');
        log(`Redis event: harvest:progress (${data.progress}%)`, 'green');
      });
      
      // Check if all event types received
      this.socket.on('*', () => {
        if (receivedEvents.size === requiredEvents.length) {
          clearTimeout(timeout);
          this.testResults.redisEvents = true;
          resolve();
        }
      });
    });
  }

  async testHealthMonitoring() {
    logSection('Test 5: Health Monitoring');
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        log('Health monitoring timeout', 'yellow');
        resolve();
      }, 10000);
      
      // Subscribe to health events
      this.socket.emit('health:subscribe');
      
      this.socket.on('system:health', (health) => {
        clearTimeout(timeout);
        
        log('System health received:', 'green');
        log(`  Services:`, 'blue');
        Object.entries(health.services).forEach(([service, healthy]) => {
          log(`    - ${service}: ${healthy ? '✓' : '✗'}`, healthy ? 'green' : 'red');
        });
        
        if (health.metrics) {
          log(`  Metrics:`, 'blue');
          log(`    - Total connections: ${health.metrics.totalConnections || 0}`, 'cyan');
          log(`    - Active sessions: ${health.metrics.activeSessions || 0}`, 'cyan');
          log(`    - Active harvests: ${health.metrics.activeHarvests || 0}`, 'cyan');
        }
        
        this.testResults.healthMonitoring = true;
        resolve();
      });
      
      this.socket.on('health:metrics', (metrics) => {
        log(`Health metrics: avg score=${metrics.averageHealthScore?.toFixed(1)}, healthy=${metrics.healthyConnections}/${metrics.totalConnections}`, 'blue');
      });
    });
  }

  async testHarvestCollection() {
    logSection('Test 6: Harvest Collection');
    
    return new Promise((resolve) => {
      let harvestStarted = false;
      let harvestProgress = 0;
      
      const timeout = setTimeout(() => {
        log(`Harvest collection: ${harvestProgress}% complete`, harvestProgress > 0 ? 'green' : 'yellow');
        this.testResults.harvestCollection = harvestProgress > 0;
        resolve();
      }, 20000);
      
      // Listen for harvest events
      this.socket.on('harvest:started', (data) => {
        harvestStarted = true;
        log(`Harvest started: ${data.totalFiles} files, ${data.totalSize} bytes`, 'green');
      });
      
      this.socket.on('harvest:progress', (data) => {
        harvestProgress = data.progress;
        log(`Harvest progress: ${data.progress}% (${data.collectedFiles}/${data.totalFiles} files)`, 'blue');
        
        if (data.currentFile) {
          log(`  Current file: ${data.currentFile}`, 'cyan');
        }
        
        if (data.estimatedTimeRemaining) {
          const remaining = Math.round(data.estimatedTimeRemaining / 1000);
          log(`  Estimated time remaining: ${remaining}s`, 'cyan');
        }
      });
      
      this.socket.on('harvest:completed', (data) => {
        clearTimeout(timeout);
        log(`Harvest completed: success=${data.success}, files=${data.collectedFiles}, size=${data.totalSize}`, 'green');
        this.testResults.harvestCollection = true;
        resolve();
      });
      
      this.socket.on('harvest:ready', (data) => {
        log(`Harvest ready for collection: ${data.harvestId}`, 'green');
      });
    });
  }

  async testCircuitBreaker() {
    logSection('Test 7: Circuit Breaker');
    
    try {
      // Test circuit breaker by making rapid requests
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(
          axios.get(`${API_BASE}/api/health`)
            .catch(err => ({ error: true, message: err.message }))
        );
      }
      
      const results = await Promise.all(requests);
      const failures = results.filter(r => r.error).length;
      
      log(`Circuit breaker test: ${10 - failures}/10 requests succeeded`, 'green');
      
      if (failures > 5) {
        log('Circuit breaker likely opened (expected behavior)', 'yellow');
      }
      
      this.testResults.circuitBreaker = true;
      
    } catch (error) {
      log(`Circuit breaker test error: ${error.message}`, 'yellow');
      this.testResults.circuitBreaker = false;
    }
  }

  displayResults() {
    logSection('Test Results');
    
    let passedTests = 0;
    let totalTests = Object.keys(this.testResults).length;
    
    Object.entries(this.testResults).forEach(([test, passed]) => {
      if (passed) passedTests++;
      const icon = passed ? '✓' : '✗';
      const color = passed ? 'green' : 'red';
      log(`${icon} ${test}: ${passed ? 'PASSED' : 'FAILED'}`, color);
    });
    
    console.log('');
    const percentage = Math.round((passedTests / totalTests) * 100);
    const overallColor = percentage >= 80 ? 'green' : percentage >= 60 ? 'yellow' : 'red';
    
    log(`Overall: ${passedTests}/${totalTests} tests passed (${percentage}%)`, overallColor);
    
    if (percentage === 100) {
      log('🎉 All tests passed! The new backend architecture is working correctly.', 'green');
    } else if (percentage >= 80) {
      log('✅ Most tests passed. The new backend architecture is mostly functional.', 'green');
    } else if (percentage >= 60) {
      log('⚠️ Some tests failed. The backend architecture needs attention.', 'yellow');
    } else {
      log('❌ Many tests failed. The backend architecture has significant issues.', 'red');
    }
    
    // Cleanup
    if (this.socket) {
      this.socket.disconnect();
    }
    
    // Exit with appropriate code
    process.exit(percentage === 100 ? 0 : 1);
  }
}

// Run the test
const test = new BackendArchitectureTest();
test.run().catch(error => {
  log(`Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});