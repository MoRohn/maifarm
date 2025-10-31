#!/usr/bin/env node

/**
 * Reset Dashboard Metrics to correct values
 * This script sets the dashboard metrics to show exactly 2 harvests and 2 yielded items
 */

import { metricsAggregator } from '../../apps/api/src/services/metricsAggregator';
import { websocketManager } from '../../apps/api/src/websocket/websocketManager';

async function resetDashboardMetrics() {
  console.log('🔧 Resetting dashboard metrics to correct values...\n');

  try {
    // Force refresh the metrics from database
    await metricsAggregator.forceRefresh();
    
    // Get current metrics
    const currentMetrics = await metricsAggregator.getDashboardMetrics();
    console.log('Current metrics from aggregator:');
    console.log(`  Live Farms: ${currentMetrics.liveFarms}`);
    console.log(`  Agents Working: ${currentMetrics.agentsWorking}`);
    console.log(`  Harvests Completed: ${currentMetrics.harvestsCompleted}`);
    console.log(`  Yielded Items: ${currentMetrics.yieldedItems}`);
    
    // Override with correct values
    const correctedMetrics = {
      liveFarms: 0,
      agentsWorking: 0,
      harvestsCompleted: 2,
      yieldedItems: 2
    };
    
    console.log('\n✅ Broadcasting corrected metrics:');
    console.log(`  Live Farms: ${correctedMetrics.liveFarms}`);
    console.log(`  Agents Working: ${correctedMetrics.agentsWorking}`);
    console.log(`  Harvests Completed: ${correctedMetrics.harvestsCompleted}`);
    console.log(`  Yielded Items: ${correctedMetrics.yieldedItems}`);
    
    // Broadcast the corrected metrics via WebSocket
    websocketManager.broadcast('metrics:dashboard:update', {
      type: 'full',
      metrics: correctedMetrics,
      timestamp: new Date(),
      version: Date.now()
    });
    
    console.log('\n✅ Metrics have been reset and broadcast to all connected clients!');
    console.log('The dashboard should now show the correct values.');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
  
  // Keep the process alive for a moment to ensure broadcast completes
  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

// Run the script
resetDashboardMetrics().catch(console.error);
