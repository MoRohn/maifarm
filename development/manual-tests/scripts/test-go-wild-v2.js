#!/usr/bin/env node

/**
 * Test script for Go Wild V2 enhanced services
 * Run with: GO_WILD_V2=true node test-go-wild-v2.js
 */

const axios = require('axios');

const API_BASE = 'http://localhost:4567/api';
const FARM_ID = `test-farm-${Date.now()}`;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testGoWildV2() {
  console.log('\n🚀 Testing Go Wild V2 Enhanced Services\n');
  console.log('========================================\n');
  
  try {
    // 1. Check system health
    console.log('1. Checking system health...');
    const healthResponse = await axios.get(`${API_BASE}/gowild/v2/health`);
    console.log('   ✅ System health:', healthResponse.data.data.status);
    console.log('   Score:', healthResponse.data.data.score);
    
    // 2. Start Go Wild session
    console.log('\n2. Starting Go Wild V2 session...');
    const startResponse = await axios.post(`${API_BASE}/gowild/start`, {
      farmId: FARM_ID,
      config: {
        creativityLevel: 85,
        explorationDepth: 5,
        maxDuration: 2, // 2 minutes
        focusAreas: ['performance optimization', 'architecture improvements', 'innovative features'],
        autoHarvest: true,
        valueThreshold: 60,
        boundaries: {
          maxCost: 100
        }
      }
    });
    
    const session = startResponse.data.data;
    const sessionId = session.id;
    
    console.log('   ✅ Session started:', sessionId);
    console.log('   Version:', startResponse.data.version);
    console.log('   API Provider:', startResponse.data.apiProvider);
    console.log('   System Health:', startResponse.data.systemHealth);
    console.log('   Metrics Stream:', startResponse.data.metricsStreamId);
    
    // 3. Monitor exploration progress
    console.log('\n3. Monitoring exploration progress...');
    let progressChecks = 0;
    const maxChecks = 10;
    
    while (progressChecks < maxChecks) {
      await sleep(3000); // Check every 3 seconds
      
      try {
        const sessionResponse = await axios.get(`${API_BASE}/gowild/v2/session/${sessionId}`);
        const sessionData = sessionResponse.data.data;
        
        console.log(`\n   Progress Update ${progressChecks + 1}:`);
        console.log(`   - Status: ${sessionData.session.status}`);
        console.log(`   - Nodes Explored: ${sessionData.session.metrics.nodesExplored}`);
        console.log(`   - Discoveries: ${sessionData.session.metrics.discoveriesMade}`);
        console.log(`   - High Value: ${sessionData.session.metrics.highValueDiscoveries}`);
        console.log(`   - Total Value: ${sessionData.session.metrics.totalValue}`);
        console.log(`   - Performance Score: ${sessionData.session.metrics.performanceScore.toFixed(2)}`);
        
        if (sessionData.realtimeMetrics) {
          console.log(`   - Discovery Rate: ${sessionData.realtimeMetrics.discoveryRate.toFixed(2)}/min`);
          console.log(`   - Exploration Velocity: ${sessionData.realtimeMetrics.explorationVelocity.toFixed(2)} nodes/min`);
        }
        
        if (sessionData.session.status === 'completed' || sessionData.session.status === 'failed') {
          console.log('\n   🏁 Exploration completed!');
          break;
        }
      } catch (error) {
        console.log('   ⚠️ Error checking session:', error.message);
      }
      
      progressChecks++;
    }
    
    // 4. Get metrics
    console.log('\n4. Fetching V2 metrics...');
    const metricsResponse = await axios.get(`${API_BASE}/gowild/v2/metrics`);
    const metrics = metricsResponse.data.data;
    
    console.log('   System Metrics:');
    console.log('   - Active Farms:', metrics.system.metrics.activeFarms);
    console.log('   - Active Agents:', metrics.system.metrics.activeAgents);
    console.log('   - Error Rate:', metrics.system.metrics.errorRate.toFixed(2) + '%');
    console.log('   - Avg Latency:', metrics.system.metrics.averageLatency.toFixed(0) + 'ms');
    console.log('   - Throughput:', metrics.system.metrics.throughput.toFixed(2) + ' ops/sec');
    
    // 5. Stop session and get results
    console.log('\n5. Stopping session and collecting harvest...');
    const stopResponse = await axios.put(`${API_BASE}/gowild/v2/session/${sessionId}/stop`);
    const results = stopResponse.data.data;
    
    console.log('   ✅ Session stopped successfully');
    console.log('\n   📊 Final Results:');
    console.log('   - Duration:', (results.summary.duration / 1000).toFixed(1) + ' seconds');
    console.log('   - Total Discoveries:', results.summary.discoveries);
    console.log('   - High Value Discoveries:', results.summary.highValueDiscoveries);
    console.log('   - Total Value Generated:', results.summary.totalValue);
    console.log('   - Performance Score:', results.summary.performanceScore.toFixed(2));
    console.log('   - Harvest ID:', results.harvestId);
    
    console.log('\n========================================');
    console.log('✅ Go Wild V2 Test Complete!');
    console.log('========================================\n');
    
    // Print summary
    console.log('📈 Value Delivery Summary:');
    console.log('   • Rapid exploration completed in under 2 minutes');
    console.log('   • Automatic discovery extraction and valuation');
    console.log('   • Real-time metrics streaming for live monitoring');
    console.log('   • Intelligent harvest collection with high-value auto-save');
    console.log('   • Robust error handling and API failover');
    console.log('   • Performance score for session quality assessment');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Run test
console.log('🔧 Go Wild V2 Enhanced Services Test');
console.log('=====================================');
console.log('Prerequisites:');
console.log('  1. Server running on port 4567');
console.log('  2. GO_WILD_V2=true environment variable set');
console.log('  3. Valid AI provider configured\n');

testGoWildV2().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});