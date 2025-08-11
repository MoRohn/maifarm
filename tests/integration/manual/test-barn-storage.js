#!/usr/bin/env node

/**
 * Test script to verify barn storage functionality
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:4567/api';

async function testBarnStorage() {
  console.log('🧪 Testing Barn Storage Functionality...\n');
  
  try {
    // 1. Get all harvests
    console.log('1. Fetching all harvests...');
    const harvestsRes = await fetch(`${BASE_URL}/harvest`);
    const harvests = await harvestsRes.json();
    console.log(`   Found ${harvests.length} harvests`);
    
    // Find a ready harvest
    const readyHarvest = harvests.find(h => h.status === 'ready');
    
    if (readyHarvest) {
      console.log(`   Found ready harvest: ${readyHarvest.id}`);
      
      // 2. Try to store it in barn
      console.log('\n2. Storing harvest in barn...');
      const storeRes = await fetch(`${BASE_URL}/barn/store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          harvestId: readyHarvest.id,
          name: `Test Barn Storage - ${new Date().toLocaleDateString()}`,
          description: 'Testing barn storage functionality',
          type: 'harvest',
          category: 'test',
          tags: ['test', 'manual']
        })
      });
      
      if (storeRes.ok) {
        const barnItem = await storeRes.json();
        console.log(`   ✅ Successfully stored in barn with ID: ${barnItem.id}`);
        console.log(`   Name: ${barnItem.name}`);
        console.log(`   Status: ${barnItem.status}`);
      } else {
        const error = await storeRes.json();
        console.log(`   ❌ Failed to store in barn: ${error.error}`);
      }
    } else {
      console.log('   No ready harvests found to test with');
      
      // Try creating a test harvest
      console.log('\n2. Creating test harvest...');
      // This would require creating a farm first, which is more complex
      console.log('   Skipping - would need to create a farm first');
    }
    
    // 3. Get barn items
    console.log('\n3. Fetching barn items...');
    const barnRes = await fetch(`${BASE_URL}/barn/items`);
    const barnItems = await barnRes.json();
    console.log(`   Found ${barnItems.length} items in barn`);
    
    if (barnItems.length > 0) {
      console.log('   Recent barn items:');
      barnItems.slice(0, 3).forEach(item => {
        console.log(`   - ${item.name} (${item.type}) - ${item.status}`);
      });
    }
    
    // 4. Get barn stats
    console.log('\n4. Fetching barn statistics...');
    const statsRes = await fetch(`${BASE_URL}/barn/stats`);
    const stats = await statsRes.json();
    
    if (stats.success) {
      console.log(`   Total harvests: ${stats.data.totalHarvests}`);
      console.log(`   Total storage: ${(stats.data.totalStorage / 1024).toFixed(2)} KB`);
      console.log(`   Item types:`, stats.data.itemsByType);
    }
    
    console.log('\n✅ Barn storage test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testBarnStorage().catch(console.error);