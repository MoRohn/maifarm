#!/usr/bin/env node

/**
 * Quick Task 3-Minute Interval Test
 * Specific test for 3-minute interval Quick Task farm
 */

import http from 'http';
import WebSocket from 'ws';
import { spawn } from 'child_process';

const API_BASE = 'http://localhost:4567';
const WS_URL = 'ws://localhost:4567';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const color = {
    info: colors.blue,
    success: colors.green,
    error: colors.red,
    warning: colors.yellow,
    progress: colors.cyan
  }[level] || colors.reset;
  
  console.log(`[${timestamp}] ${color}${message}${colors.reset}`);
}

async function apiRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: data ? JSON.parse(data) : null
          });
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

async function checkTmuxSessions() {
  return new Promise((resolve) => {
    const tmux = spawn('tmux', ['list-sessions', '-F', '#{session_name}']);
    let output = '';
    
    tmux.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    tmux.on('close', (code) => {
      if (code === 0) {
        const sessions = output.trim().split('\n').filter(Boolean);
        resolve(sessions);
      } else {
        resolve([]);
      }
    });
  });
}

async function getTmuxOutput(sessionName, paneId = '0.0') {
  return new Promise((resolve) => {
    const tmux = spawn('tmux', [
      'capture-pane',
      '-t', `${sessionName}:${paneId}`,
      '-p',
      '-S', '-100'
    ]);
    
    let output = '';
    tmux.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    tmux.on('close', () => {
      resolve(output);
    });
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class Test3MinuteQuickTask {
  constructor() {
    this.ws = null;
    this.taskId = null;
    this.farmId = null;
    this.events = [];
    this.startTime = null;
    this.checkInterval = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_URL);
      
      this.ws.on('open', () => {
        log('WebSocket connected', 'success');
        resolve();
      });
      
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.events.push({
            type: message.type,
            data: message,
            timestamp: new Date()
          });
          this.handleWebSocketMessage(message);
        } catch (error) {
          // Ignore parse errors
        }
      });
      
      this.ws.on('error', (error) => {
        log(`WebSocket error: ${error.message}`, 'error');
      });
      
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
    });
  }

  handleWebSocketMessage(message) {
    const { type, taskId, farmId } = message;
    
    // Only log messages related to our task
    if (taskId === this.taskId || farmId === this.farmId) {
      switch (type) {
        case 'task:created':
          log(`Task created: ${taskId}`, 'progress');
          break;
        case 'task:progress':
          log(`Task progress: ${message.progress || 'unknown'}%`, 'progress');
          break;
        case 'task:completed':
          log('Task completed!', 'success');
          break;
        case 'task:failed':
          log(`Task failed: ${message.error}`, 'error');
          break;
        case 'farm:status':
          log(`Farm status: ${message.status}`, 'progress');
          break;
      }
    }
  }

  async createQuickTask() {
    log('Creating 3-minute interval Quick Task...', 'info');
    
    const taskData = {
      title: '3-Minute Test Task',
      description: 'Quick task that runs for 3 minutes with periodic updates',
      priority: 'medium',
      timeout: 180000, // 3 minutes
      metadata: {
        interval: 180,
        testType: '3-minute-interval',
        createdAt: new Date().toISOString()
      }
    };
    
    const response = await apiRequest('POST', '/api/tasks/quick', taskData);
    
    if (response.status !== 201 && response.status !== 200) {
      throw new Error(`Failed to create task: ${response.status}`);
    }
    
    if (!response.body.success) {
      throw new Error(`Task creation failed: ${JSON.stringify(response.body)}`);
    }
    
    this.taskId = response.body.data.taskId;
    this.farmId = response.body.data.farmId;
    this.startTime = new Date();
    
    log(`Task created successfully!`, 'success');
    log(`Task ID: ${this.taskId}`, 'info');
    log(`Farm ID: ${this.farmId}`, 'info');
    
    return response.body.data;
  }

  async monitorTask() {
    log('Starting 3-minute monitoring...', 'info');
    
    let lastStatus = null;
    let checkCount = 0;
    const maxChecks = 36; // 3 minutes with 5-second intervals = 36 checks
    
    this.checkInterval = setInterval(async () => {
      checkCount++;
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      const remaining = Math.max(0, 180 - elapsed);
      
      log(`Check #${checkCount} - Elapsed: ${elapsed}s, Remaining: ${remaining}s`, 'progress');
      
      try {
        // Check task status
        const statusResponse = await apiRequest('GET', `/api/tasks/${this.taskId}`);
        if (statusResponse.body?.data) {
          const currentStatus = statusResponse.body.data.status;
          
          if (currentStatus !== lastStatus) {
            log(`Task status changed: ${lastStatus || 'none'} → ${currentStatus}`, 'info');
            lastStatus = currentStatus;
          }
          
          if (currentStatus === 'completed') {
            log('Task completed successfully!', 'success');
            this.cleanup();
            return;
          }
          
          if (currentStatus === 'failed') {
            log(`Task failed: ${statusResponse.body.data.error}`, 'error');
            this.cleanup();
            return;
          }
        }
        
        // Check tmux sessions
        const sessions = await checkTmuxSessions();
        const quickTaskSession = sessions.find(s => 
          s.includes(this.farmId) || 
          s.includes('quick-task') ||
          s.includes(this.taskId?.substring(0, 8))
        );
        
        if (quickTaskSession) {
          log(`Found tmux session: ${quickTaskSession}`, 'info');
          
          // Try to get terminal output
          const output = await getTmuxOutput(quickTaskSession);
          if (output && output.trim()) {
            const lines = output.trim().split('\n').slice(-5); // Last 5 lines
            log('Recent terminal output:', 'info');
            lines.forEach(line => console.log(`  > ${line}`));
          }
        }
        
        // Check harvest terminal
        const harvestResponse = await apiRequest('GET', '/api/harvest/terminal/sessions');
        if (harvestResponse.body?.data?.length > 0) {
          const session = harvestResponse.body.data.find(s => 
            s.sessionName.includes(this.farmId) ||
            s.sessionName.includes('quick')
          );
          
          if (session) {
            log(`Harvest terminal session found: ${session.sessionName}`, 'info');
          }
        }
        
      } catch (error) {
        log(`Check failed: ${error.message}`, 'warning');
      }
      
      // Stop after max checks
      if (checkCount >= maxChecks) {
        log('Maximum monitoring time reached (3 minutes)', 'warning');
        this.cleanup();
      }
      
    }, 5000); // Check every 5 seconds
  }

  async checkFinalStatus() {
    log('Checking final task status...', 'info');
    
    // Final task status
    const taskResponse = await apiRequest('GET', `/api/tasks/${this.taskId}`);
    if (taskResponse.body?.data) {
      const task = taskResponse.body.data;
      log(`Final task status: ${task.status}`, task.status === 'completed' ? 'success' : 'warning');
      
      if (task.result) {
        log(`Task result: ${JSON.stringify(task.result)}`, 'info');
      }
      
      if (task.error) {
        log(`Task error: ${task.error}`, 'error');
      }
    }
    
    // Check if farm was cleaned up
    const farmResponse = await apiRequest('GET', `/api/farms/${this.farmId}`);
    if (farmResponse.status === 404) {
      log('Farm was cleaned up successfully', 'success');
    } else if (farmResponse.body?.data) {
      log(`Farm status: ${farmResponse.body.data.status}`, 'info');
    }
    
    // Summary of WebSocket events
    log(`Total WebSocket events received: ${this.events.length}`, 'info');
    const eventTypes = {};
    this.events.forEach(e => {
      eventTypes[e.type] = (eventTypes[e.type] || 0) + 1;
    });
    
    log('Event summary:', 'info');
    Object.entries(eventTypes).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}`);
    });
  }

  cleanup() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    if (this.ws) {
      this.ws.close();
    }
    
    const duration = Math.floor((Date.now() - this.startTime) / 1000);
    log(`Test completed in ${duration} seconds`, 'info');
  }

  async run() {
    try {
      log('=== 3-Minute Quick Task Test ===', 'info');
      
      // Check server health
      const healthResponse = await apiRequest('GET', '/api/health');
      log(`Health check response: ${healthResponse.status}`, 'info');
      
      // Accept 200 or 503 (degraded when Redis not available)
      if (healthResponse.status !== 200 && healthResponse.status !== 503) {
        log(`Server returned unexpected status ${healthResponse.status}`, 'error');
        log(`Response body: ${JSON.stringify(healthResponse.body)}`, 'error');
        throw new Error(`Server returned unexpected status ${healthResponse.status}`);
      }
      
      // Accept degraded status (Redis might not be running)
      if (healthResponse.body?.status === 'ok' || healthResponse.body?.status === 'degraded') {
        log(`Server is ${healthResponse.body.status} (Redis: ${healthResponse.body?.services?.redis || 'unknown'})`, 'success');
        if (healthResponse.body?.services?.redis === 'unhealthy') {
          log('Note: Redis is not running, some features may be limited', 'warning');
        }
      } else {
        log(`Unexpected health status: ${healthResponse.body?.status}`, 'error');
        throw new Error('Server is not healthy');
      }
      
      // Connect WebSocket
      try {
        await this.connect();
      } catch (error) {
        log('WebSocket connection failed, continuing without it', 'warning');
      }
      
      // Create the quick task
      await this.createQuickTask();
      
      // Monitor for 3 minutes
      await this.monitorTask();
      
      // Wait for monitoring to complete
      await new Promise(resolve => {
        const checkComplete = setInterval(() => {
          if (!this.checkInterval) {
            clearInterval(checkComplete);
            resolve();
          }
        }, 1000);
      });
      
      // Check final status
      await this.checkFinalStatus();
      
      log('=== Test Complete ===', 'success');
      
    } catch (error) {
      log(`Test failed: ${error.message}`, 'error');
      console.error(error);
      process.exit(1);
    }
  }
}

// Run the test
const test = new Test3MinuteQuickTask();
test.run().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  console.error(error);
  process.exit(1);
});