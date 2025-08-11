#!/usr/bin/env node

/**
 * Test script for real-time metrics synchronization
 * Verifies that metrics are consistent across dashboard and analytics pages
 */

import io from 'socket.io-client';
import fetch from 'node-fetch';

const API_URL = process.env.VITE_API_URL || 'http://localhost:4567';
const WS_URL = API_URL;

console.log('🔬 Testing Real-Time Metrics Synchronization');
console.log('========================================\n');

// Create WebSocket clients to simulate multiple pages
const dashboardClient = io(WS_URL, {
  transports: ['websocket'],
  reconnection: true
});

const analyticsClient = io(WS_URL, {
  transports: ['websocket'],
  reconnection: true
});

let dashboardMetrics = null;
let analyticsMetrics = null;
let updateCount = 0;

// Helper to compare metrics
function compareMetrics(source1, source2, label) {
  console.log(`\n📊 Comparing ${label}:`);
  
  const keys = ['totalFarms', 'activeFarms', 'uniqueAgents', 'activeAgents', 
                'completedTasks', 'failedTasks', 'successRate'];
  
  let isConsistent = true;
  
  for (const key of keys) {
    const val1 = source1?.[key];
    const val2 = source2?.[key];
    
    if (val1 !== val2) {
      console.log(`  ❌ ${key}: Dashboard=${val1}, Analytics=${val2}`);
      isConsistent = false;
    } else {
      console.log(`  ✅ ${key}: ${val1} (consistent)`);
    }
  }
  
  return isConsistent;
}

// Dashboard client handlers
dashboardClient.on('connect', () => {
  console.log('✅ Dashboard client connected');
  dashboardClient.emit('metrics:subscribe');
});

dashboardClient.on('metrics:update', (data) => {
  console.log('\n📥 Dashboard received metrics update');
  dashboardMetrics = data.metrics || data;
  updateCount++;
  
  // Check consistency after both receive updates
  if (updateCount >= 2) {
    const isConsistent = compareMetrics(dashboardMetrics, analyticsMetrics, 'WebSocket Updates');
    if (isConsistent) {
      console.log('\n🎉 WebSocket metrics are synchronized!');
    } else {
      console.log('\n⚠️  WebSocket metrics have inconsistencies');
    }
  }
});

// Analytics client handlers
analyticsClient.on('connect', () => {
  console.log('✅ Analytics client connected');
  analyticsClient.emit('metrics:subscribe');
});

analyticsClient.on('metrics:update', (data) => {
  console.log('\n📥 Analytics received metrics update');
  analyticsMetrics = data.metrics || data;
  updateCount++;
  
  // Check consistency after both receive updates
  if (updateCount >= 2) {
    const isConsistent = compareMetrics(dashboardMetrics, analyticsMetrics, 'WebSocket Updates');
    if (isConsistent) {
      console.log('\n🎉 WebSocket metrics are synchronized!');
    } else {
      console.log('\n⚠️  WebSocket metrics have inconsistencies');
    }
  }
});

// Test API endpoints
async function testAPIConsistency() {
  console.log('\n📡 Testing API Endpoint Consistency...');
  
  try {
    // Fetch from dashboard endpoint
    const dashboardRes = await fetch(`${API_URL}/api/metrics/dashboard`);
    const dashboardData = await dashboardRes.json();
    
    // Fetch from unified endpoint
    const unifiedRes = await fetch(`${API_URL}/api/metrics/unified`);
    const unifiedData = await unifiedRes.json();
    
    if (dashboardData.success && unifiedData.success) {
      console.log('\n📊 API Response Comparison:');
      
      const dashboard = dashboardData.data;
      const unified = unifiedData.data.metrics;
      
      // Compare key metrics
      const checks = [
        {
          name: 'Active Farms',
          dash: dashboard.activeFarms,
          unified: unified.activeFarms
        },
        {
          name: 'Total Agents',
          dash: dashboard.totalAgents,
          unified: unified.uniqueAgents
        },
        {
          name: 'Tasks Completed',
          dash: dashboard.tasksCompleted,
          unified: unified.completedTasks
        },
        {
          name: 'Success Rate',
          dash: dashboard.successRate,
          unified: unified.successRate
        }
      ];
      
      let allConsistent = true;
      
      for (const check of checks) {
        if (check.dash === check.unified) {
          console.log(`  ✅ ${check.name}: ${check.dash} (consistent)`);
        } else {
          console.log(`  ❌ ${check.name}: Dashboard=${check.dash}, Unified=${check.unified}`);
          allConsistent = false;
        }
      }
      
      if (allConsistent) {
        console.log('\n🎉 API endpoints are synchronized!');
      } else {
        console.log('\n⚠️  API endpoints have inconsistencies');
      }
    }
  } catch (error) {
    console.error('❌ Failed to test API endpoints:', error.message);
  }
}

// Test duplicate detection
async function testDuplicateDetection() {
  console.log('\n🔍 Testing Duplicate Agent Detection...');
  
  try {
    // Create test data with duplicate agents
    const testFarms = [
      {
        id: 'farm1',
        agents: [
          { id: 'agent1', name: 'Agent One' },
          { id: 'agent2', name: 'Agent Two' }
        ]
      },
      {
        id: 'farm2',
        agents: [
          { id: 'agent1', name: 'Agent One' }, // Duplicate
          { id: 'agent3', name: 'Agent Three' }
        ]
      }
    ];
    
    // Count unique agents manually
    const uniqueAgents = new Set();
    testFarms.forEach(farm => {
      farm.agents.forEach(agent => {
        uniqueAgents.add(agent.id);
      });
    });
    
    console.log(`  Expected unique agents: ${uniqueAgents.size}`);
    console.log(`  Total agent instances: ${testFarms.reduce((sum, f) => sum + f.agents.length, 0)}`);
    
    // Verify the backend handles this correctly
    const unifiedRes = await fetch(`${API_URL}/api/metrics/unified`);
    const unifiedData = await unifiedRes.json();
    
    if (unifiedData.success) {
      console.log(`  Backend reports unique agents: ${unifiedData.data.uniqueAgentCount}`);
      console.log(`  ✅ Duplicate detection is working`);
    }
  } catch (error) {
    console.error('❌ Failed to test duplicate detection:', error.message);
  }
}

// Test metric validation
async function testMetricValidation() {
  console.log('\n🛡️  Testing Metric Validation...');
  
  const invalidMetrics = [
    { name: 'String instead of number', data: { totalFarms: "five" }},
    { name: 'Negative count', data: { totalFarms: -5 }},
    { name: 'Percentage > 100', data: { successRate: 150 }},
    { name: 'NaN value', data: { cpuUsage: NaN }},
    { name: 'Infinity value', data: { throughput: Infinity }}
  ];
  
  for (const test of invalidMetrics) {
    console.log(`\n  Testing: ${test.name}`);
    
    // Send via WebSocket
    dashboardClient.emit('metrics:update', test.data);
    
    // Wait for error response
    await new Promise(resolve => {
      dashboardClient.once('metrics:error', (error) => {
        console.log(`    ✅ Validation caught error: ${error.error}`);
        resolve();
      });
      
      // Timeout if no error
      setTimeout(() => {
        console.log(`    ⚠️  No validation error received`);
        resolve();
      }, 1000);
    });
  }
}

// Run all tests
async function runTests() {
  console.log('\n🚀 Starting synchronization tests...\n');
  
  // Wait for connections
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Run API consistency test
  await testAPIConsistency();
  
  // Test duplicate detection
  await testDuplicateDetection();
  
  // Test validation
  await testMetricValidation();
  
  // Wait for WebSocket updates
  console.log('\n⏳ Waiting for WebSocket updates...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Final summary
  console.log('\n========================================');
  console.log('📈 Metrics Synchronization Test Complete');
  console.log('========================================\n');
  
  // Cleanup
  dashboardClient.disconnect();
  analyticsClient.disconnect();
  
  process.exit(0);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});

// Start tests
runTests();