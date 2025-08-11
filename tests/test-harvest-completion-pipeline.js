#!/usr/bin/env node

/**
 * Harvest Completion Pipeline Test
 * Tests the complete flow: Quick Task → Task Completion → Harvest Ready → Barn Availability
 */

import http from 'http';
import WebSocket from 'ws';

const API_BASE = 'http://localhost:4567';
const WS_URL = 'ws://localhost:4567';

const colors = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', 
  blue: '\x1b[34m', cyan: '\x1b[36m', purple: '\x1b[35m', gray: '\x1b[90m'
};

function log(message, level = 'info') {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const color = colors[{ info: 'blue', success: 'green', error: 'red', warning: 'yellow', progress: 'cyan', debug: 'purple', trace: 'gray' }[level]] || colors.reset;
  console.log(`[${timestamp}] ${color}${message}${colors.reset}`);
}

async function apiRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
        } catch (error) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

class HarvestCompletionTest {
  constructor() {
    this.ws = null;
    this.taskId = null;
    this.farmId = null;
    this.harvestId = null;
    this.startTime = null;
    this.events = [];
    this.harvestEvents = [];
    this.testResults = {
      taskCreated: false,
      taskProcessed: false,
      harvestCreated: false,
      harvestProgressed: false,
      harvestCompleted: false,
      barnAvailable: false,
      harvestData: null,
      barnData: null
    };
  }

  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_URL);
      
      this.ws.on('open', () => {
        log('WebSocket connected', 'success');
        resolve();
      });
      
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.events.push({ type: message.type, data: message, timestamp: new Date() });
          this.handleWebSocketMessage(message);
        } catch (error) {
          // Ignore parse errors
        }
      });
      
      this.ws.on('error', (error) => {
        log(`WebSocket error: ${error.message}`, 'warning');
      });
      
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
    });
  }

  handleWebSocketMessage(message) {
    const { type } = message;
    
    if (message.taskId === this.taskId || message.farmId === this.farmId || message.harvestId === this.harvestId) {
      switch (type) {
        case 'task:created':
          log(`✓ WebSocket: Task created`, 'success');
          this.testResults.taskCreated = true;
          break;
        case 'task:processing':
          log(`✓ WebSocket: Task processing started`, 'success');
          this.testResults.taskProcessed = true;
          break;
        case 'task:completed':
          log(`✓ WebSocket: Task completed`, 'success');
          break;
        case 'task:failed':
          log(`⚠️ WebSocket: Task failed: ${message.error}`, 'warning');
          break;
        case 'harvest:started':
          log(`✓ WebSocket: Harvest started`, 'success');
          this.testResults.harvestCreated = true;
          this.harvestId = message.harvestId;
          break;
        case 'harvest:progress':
          log(`✓ WebSocket: Harvest progress: ${message.progress}%`, 'progress');
          this.testResults.harvestProgressed = true;
          break;
        case 'harvest:ready':
        case 'harvest:completed':
          log(`✓ WebSocket: Harvest completed!`, 'success');
          this.testResults.harvestCompleted = true;
          this.harvestEvents.push({...message, timestamp: new Date()});
          break;
        default:
          if (type.includes('harvest')) {
            log(`📡 WebSocket: ${type}`, 'debug');
            this.harvestEvents.push({...message, timestamp: new Date()});
          }
      }
    }
  }

  async createQuickTaskWithShortTimeout() {
    log('Creating Quick Task with short timeout for faster testing...', 'info');
    this.startTime = Date.now();
    
    // Create a simple task that should complete quickly
    const taskData = {
      title: 'Harvest Pipeline Test',
      description: 'Simple test task: Create a file called test-output.txt with the current date and time.',
      priority: 'high',
      timeout: 60000, // 1 minute timeout for faster testing
      metadata: {
        testType: 'harvest-pipeline-validation',
        expectedOutput: 'test-output.txt file creation'
      }
    };
    
    const response = await apiRequest('POST', '/api/tasks/quick', taskData);
    
    if (!response.body?.success) {
      throw new Error(`Failed to create task: ${JSON.stringify(response.body)}`);
    }
    
    this.taskId = response.body.data.taskId;
    this.farmId = response.body.data.farmId;
    this.harvestId = response.body.data.harvestId;
    
    log(`✓ Quick Task created successfully!`, 'success');
    log(`  Task ID: ${this.taskId}`, 'info');
    log(`  Farm ID: ${this.farmId}`, 'info');
    log(`  Harvest ID: ${this.harvestId || 'Not yet assigned'}`, 'info');
    
    return response.body.data;
  }

  async monitorHarvestPipeline() {
    log('Starting harvest pipeline monitoring...', 'info');
    
    const maxChecks = 24; // 2 minutes with 5-second intervals
    let checkCount = 0;
    let taskCompleted = false;
    
    return new Promise((resolve) => {
      const checkInterval = setInterval(async () => {
        checkCount++;
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        
        log(`Check #${checkCount}/${maxChecks} - Elapsed: ${elapsed}s`, 'progress');
        
        try {
          // 1. Check harvest status and progress
          const harvestResponse = await apiRequest('GET', `/api/harvests/${this.harvestId}`);
          if (harvestResponse.body?.data) {
            const harvest = harvestResponse.body.data;
            log(`  Harvest Status: ${harvest.status} (Progress: ${harvest.progress || 0}%)`, 'info');
            
            if (harvest.status === 'ready' || harvest.status === 'completed') {
              log('✓ Harvest completed!', 'success');
              this.testResults.harvestCompleted = true;
              this.testResults.harvestData = harvest;
            }
            
            if (harvest.progress > 0) {
              this.testResults.harvestProgressed = true;
            }
          } else {
            log(`  Harvest API returned: ${harvestResponse.status}`, 'debug');
          }
          
          // 2. Check barn availability
          const barnResponse = await apiRequest('GET', '/api/barn/items');
          if (barnResponse.body?.data) {
            const barnItems = barnResponse.body.data;
            const ourHarvest = barnItems.find(item => 
              item.harvestId === this.harvestId || 
              item.farmId === this.farmId ||
              (item.id && item.id === this.harvestId)
            );
            
            if (ourHarvest) {
              log('✓ Harvest found in Barn!', 'success');
              this.testResults.barnAvailable = true;
              this.testResults.barnData = ourHarvest;
            } else {
              log(`  Barn has ${barnItems.length} items, but our harvest not found`, 'debug');
            }
          }
          
          // 3. Check all harvests to see our specific one
          const allHarvestsResponse = await apiRequest('GET', '/api/harvests');
          if (allHarvestsResponse.body?.data) {
            const harvests = allHarvestsResponse.body.data;
            const ourHarvest = harvests.find(h => h.id === this.harvestId || h.farmId === this.farmId);
            if (ourHarvest) {
              log(`  Found harvest in list: ${ourHarvest.status}`, 'debug');
            }
          }
          
          // Stop if we've achieved key milestones or reached max checks
          const keyMilestones = this.testResults.harvestCompleted || this.testResults.barnAvailable;
          if (keyMilestones || checkCount >= maxChecks) {
            clearInterval(checkInterval);
            resolve();
          }
          
        } catch (error) {
          log(`Check failed: ${error.message}`, 'warning');
        }
      }, 5000); // Check every 5 seconds
    });
  }

  generateReport() {
    log('\n=== HARVEST COMPLETION PIPELINE TEST REPORT ===', 'info');
    
    const duration = Math.floor((Date.now() - this.startTime) / 1000);
    log(`Test Duration: ${duration} seconds`, 'info');
    
    log('\n📊 Pipeline Results:', 'info');
    Object.entries(this.testResults).forEach(([test, result]) => {
      if (typeof result === 'boolean') {
        const status = result ? '✓' : '✗';
        const color = result ? 'success' : 'error';
        log(`  ${status} ${test.replace(/([A-Z])/g, ' $1').toLowerCase()}`, color);
      }
    });
    
    const passedTests = Object.entries(this.testResults).filter(([k, v]) => typeof v === 'boolean' && v).length;
    const totalBooleanTests = Object.entries(this.testResults).filter(([k, v]) => typeof v === 'boolean').length;
    const successRate = Math.round((passedTests / totalBooleanTests) * 100);
    
    log(`\n📈 Pipeline Success Rate: ${passedTests}/${totalBooleanTests} (${successRate}%)`, 
         successRate >= 75 ? 'success' : 'error');
    
    // Detailed analysis
    log('\n🔍 Detailed Analysis:', 'info');
    
    if (this.testResults.harvestData) {
      log('  Harvest Data:', 'info');
      const harvest = this.testResults.harvestData;
      log(`    Status: ${harvest.status}`, 'info');
      log(`    Progress: ${harvest.progress || 0}%`, 'info');
      log(`    Results: ${harvest.results ? harvest.results.length : 0} items`, 'info');
      log(`    Quality Score: ${harvest.quality ? harvest.quality.overallScore || 0 : 0}`, 'info');
    }
    
    if (this.testResults.barnData) {
      log('  Barn Item Data:', 'info');
      const item = this.testResults.barnData;
      log(`    Type: ${item.type || 'unknown'}`, 'info');
      log(`    Status: ${item.status || 'unknown'}`, 'info');
      log(`    Created: ${item.createdAt || 'unknown'}`, 'info');
    }
    
    log('\n📡 Harvest WebSocket Events:', 'info');
    if (this.harvestEvents.length > 0) {
      this.harvestEvents.forEach((event, idx) => {
        log(`  ${idx + 1}. ${event.type}: ${JSON.stringify(event, ['status', 'progress', 'harvestId'], 2)}`, 'trace');
      });
    } else {
      log('  No harvest-specific WebSocket events captured', 'warning');
    }
    
    // Issue analysis
    log('\n🚨 Issue Analysis:', 'info');
    
    if (!this.testResults.harvestCompleted) {
      log('  ❌ CRITICAL: Harvest never completed', 'error');
      log('     - Check harvestService.ts completion triggers', 'error');
      log('     - Verify harvest status updates from executor', 'error');
    }
    
    if (!this.testResults.barnAvailable) {
      log('  ❌ CRITICAL: Harvest not available in Barn', 'error');
      log('     - Check barn integration after harvest completion', 'error');
      log('     - Verify barnCatalogService refresh mechanism', 'error');
    }
    
    if (this.testResults.harvestCompleted && this.testResults.barnAvailable) {
      log('\n✅ SUCCESS: Complete harvest pipeline working!', 'success');
      log('The system successfully: Created task → Processed → Harvested → Made available in Barn', 'success');
    } else if (this.testResults.harvestCreated) {
      log('\n⚠️ PARTIAL SUCCESS: Harvest created but pipeline incomplete', 'warning');
    } else {
      log('\n❌ PIPELINE FAILURE: Core harvest functionality not working', 'error');
    }
  }

  cleanup() {
    if (this.ws) {
      this.ws.close();
    }
  }

  async run() {
    try {
      log('=== HARVEST COMPLETION PIPELINE TEST ===', 'info');
      log('Testing: Task Creation → Processing → Harvest Completion → Barn Availability', 'info');
      
      // Check server health
      const healthResponse = await apiRequest('GET', '/api/health');
      if (healthResponse.status !== 200 && healthResponse.status !== 503) {
        throw new Error(`Server not healthy: ${healthResponse.status}`);
      }
      log(`✓ Server health check passed`, 'success');
      
      // Connect WebSocket for real-time monitoring
      try {
        await this.connectWebSocket();
      } catch (error) {
        log('WebSocket connection failed, continuing without real-time monitoring', 'warning');
      }
      
      // Create the test task
      await this.createQuickTaskWithShortTimeout();
      
      // Monitor the harvest pipeline
      await this.monitorHarvestPipeline();
      
      // Generate comprehensive report
      this.generateReport();
      
    } catch (error) {
      log(`Test failed: ${error.message}`, 'error');
      console.error(error);
      this.generateReport();
      process.exit(1);
    } finally {
      this.cleanup();
    }
  }
}

// Run the test
const test = new HarvestCompletionTest();
test.run().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  console.error(error);
  process.exit(1);
});