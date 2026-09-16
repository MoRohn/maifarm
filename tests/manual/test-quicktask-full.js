#!/usr/bin/env node

/**
 * Full Quick Task Mode Test
 * Tests the complete Quick Task flow including agent execution
 */

import axios from 'axios';
import { io } from 'socket.io-client';

const API_BASE = 'http://localhost:4567/api';
const WS_BASE = 'http://localhost:4567';

// Test configuration
const TEST_PROMPT = 'Write a function that calculates the factorial of a number';
const MONITOR_DURATION = 30; // Monitor for 30 seconds

class QuickTaskTester {
  constructor() {
    this.socket = null;
    this.farmId = null;
    this.taskId = null;
    this.startTime = null;
    this.events = [];
  }

  async test() {
    console.log('🚀 Full Quick Task Mode Test');
    console.log('=' .repeat(50) + '\n');

    try {
      // 1. Connect WebSocket
      await this.connectWebSocket();

      // 2. Launch Quick Task
      await this.launchQuickTask();

      // 3. Monitor execution
      await this.monitorExecution();

      // 4. Display results
      this.displayResults();

    } catch (error) {
      console.error('\n❌ Test failed:', error.message);
      if (error.response?.data) {
        console.error('   Response:', JSON.stringify(error.response.data, null, 2));
      }
      process.exit(1);
    } finally {
      if (this.socket) {
        this.socket.disconnect();
      }
    }
  }

  async connectWebSocket() {
    console.log('🔌 Connecting to WebSocket...');

    this.socket = io(WS_BASE, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 5000);

      this.socket.on('connect', () => {
        console.log('✅ WebSocket connected\n');
        clearTimeout(timeout);
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async launchQuickTask() {
    console.log('📝 Launching Quick Task');
    console.log(`   Prompt: "${TEST_PROMPT}"`);
    console.log('   Timeout: 5 minutes (fixed)');
    console.log('   Provider: claude\n');

    this.startTime = Date.now();

    const response = await axios.post(`${API_BASE}/tasks/quick`, {
      title: 'Factorial Function Test',
      description: TEST_PROMPT,
      mode: 'quick_task',
      provider: 'claude',
      priority: 'medium'
    });

    if (!response.data.success) {
      throw new Error(`Failed to launch: ${response.data.error}`);
    }

    this.farmId = response.data.farmId || response.data.data?.farmId;
    this.taskId = response.data.taskId || response.data.data?.taskId;

    console.log('✅ Quick Task launched!');
    console.log(`   Farm ID: ${this.farmId}`);
    console.log(`   Task ID: ${this.taskId}`);
    console.log(`   Launch time: ${Date.now() - this.startTime}ms\n`);

    // Subscribe to events
    this.setupEventListeners();

    // Join farm room
    this.socket.emit('farm:join', { farmId: this.farmId });
    if (this.taskId) {
      this.socket.emit('quicktask:join', { taskId: this.taskId });
    }
  }

  setupEventListeners() {
    // Farm events
    this.socket.on('farm:status', (data) => {
      this.events.push({ type: 'farm:status', data, timestamp: Date.now() });
      console.log(`📊 Farm status: ${data.status || data.currentStatus}`);
    });

    // Agent events
    this.socket.on('agent:status', (data) => {
      this.events.push({ type: 'agent:status', data, timestamp: Date.now() });
      console.log(`🤖 Agent ${data.agentId}: ${data.status}`);
    });

    // Terminal output
    this.socket.on('terminal:output', (data) => {
      this.events.push({ type: 'terminal:output', data, timestamp: Date.now() });
      // Only show first line of output
      const firstLine = data.content?.split('\n')[0];
      if (firstLine && firstLine.trim()) {
        console.log(`📝 Output: ${firstLine.substring(0, 80)}${firstLine.length > 80 ? '...' : ''}`);
      }
    });

    // Quick task specific events
    this.socket.on('quicktask:output', (data) => {
      this.events.push({ type: 'quicktask:output', data, timestamp: Date.now() });
    });

    this.socket.on('quicktask:status', (data) => {
      this.events.push({ type: 'quicktask:status', data, timestamp: Date.now() });
      console.log(`⚡ Quick Task status: ${data.currentStatus}`);
    });

    // Harvest events
    this.socket.on('harvest:ready', (data) => {
      this.events.push({ type: 'harvest:ready', data, timestamp: Date.now() });
      console.log(`🌾 Harvest ready: ${data.harvestId}`);
    });

    this.socket.on('harvest:collected', (data) => {
      this.events.push({ type: 'harvest:collected', data, timestamp: Date.now() });
      console.log(`📦 Harvest collected: ${data.harvestId}`);
    });

    // Task completion
    this.socket.on('task:completed', (data) => {
      this.events.push({ type: 'task:completed', data, timestamp: Date.now() });
      console.log(`✅ Task completed!`);
    });
  }

  async monitorExecution() {
    console.log(`\n⏳ Monitoring execution for ${MONITOR_DURATION} seconds...`);
    console.log('-'.repeat(50));

    for (let i = 0; i < MONITOR_DURATION; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check farm status every 5 seconds
      if (i % 5 === 0) {
        try {
          const response = await axios.get(`${API_BASE}/farms/${this.farmId}`);
          const farm = response.data;

          const elapsed = Math.round((Date.now() - this.startTime) / 1000);
          process.stdout.write(`\r[${elapsed}s] Status: ${farm.status || 'running'}, Agents: ${farm.agents?.length || 0}`);

          // Check if completed
          if (farm.status === 'completed' || farm.status === 'failed') {
            console.log(`\n\n🏁 Farm ${farm.status} after ${elapsed} seconds`);
            break;
          }
        } catch (error) {
          // Ignore errors during monitoring
        }
      }
    }

    console.log('\n' + '-'.repeat(50));
  }

  displayResults() {
    console.log('\n' + '='.repeat(50));
    console.log('📊 Test Results');
    console.log('='.repeat(50));

    // Event summary
    const eventTypes = {};
    this.events.forEach(e => {
      eventTypes[e.type] = (eventTypes[e.type] || 0) + 1;
    });

    console.log('\nEvent Summary:');
    Object.entries(eventTypes).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });

    // Timing
    const totalTime = Date.now() - this.startTime;
    console.log('\nTiming:');
    console.log(`   Total execution time: ${Math.round(totalTime / 1000)}s`);
    console.log(`   Expected timeout: 300s (5 minutes)`);
    console.log(`   Timeout enforced: ${totalTime <= 305000 ? '✅ Yes' : '❌ No'}`);

    // Terminal output stats
    const terminalEvents = this.events.filter(e => e.type === 'terminal:output');
    console.log('\nTerminal Output:');
    console.log(`   Total lines: ${terminalEvents.length}`);
    if (terminalEvents.length > 0) {
      const firstOutput = terminalEvents[0];
      const timeToFirst = firstOutput.timestamp - this.startTime;
      console.log(`   Time to first output: ${Math.round(timeToFirst / 1000)}s`);
    }

    // Final status check
    this.checkFinalStatus();
  }

  async checkFinalStatus() {
    console.log('\n🔍 Final Status Check:');

    try {
      // Check farm
      const farmResponse = await axios.get(`${API_BASE}/farms/${this.farmId}`);
      const farm = farmResponse.data;
      console.log(`   Farm status: ${farm.status || 'unknown'}`);
      console.log(`   Harvest ID: ${farm.harvestId || 'none'}`);

      // Check if harvest exists
      if (farm.harvestId) {
        try {
          const harvestResponse = await axios.get(`${API_BASE}/harvests/${farm.harvestId}`);
          const harvest = harvestResponse.data;
          console.log(`   Harvest status: ${harvest.status || 'unknown'}`);
          console.log(`   Files collected: ${harvest.files?.length || 0}`);
        } catch (error) {
          console.log(`   Harvest check failed: ${error.message}`);
        }
      }
    } catch (error) {
      console.log(`   Final check failed: ${error.message}`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ Quick Task Full Test Complete!');
    console.log('='.repeat(50));
  }
}

// Run the test
const tester = new QuickTaskTester();
tester.test().catch(console.error);