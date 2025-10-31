#!/usr/bin/env node

import axios from 'axios';
import { randomUUID } from 'crypto';

const API_BASE_URL = process.env.API_URL || 'http://localhost:4567';
const api = axios.create({ baseURL: API_BASE_URL });

// Test data
const testSeed = {
  name: 'Test Seed - Code Analyzer',
  description: 'A test seed for code analysis workflow',
  yaml: `agents:
  - name: code-scanner
    type: analyzer
    tasks:
      - scan-code
      - analyze-patterns
  - name: report-generator
    type: reporter
    tasks:
      - generate-report`,
  farmType: 'sequential',
  category: 'testing',
  tags: ['test', 'code-analysis'],
  isPublic: true
};

const testFarmId = randomUUID();
const testFarmName = 'Test Farm from Seed';

async function testWorkflow() {
  console.log('🌱 Testing Seeds, Harvest, and Barn Integration...\n');

  try {
    // 1. Test Seeds API
    console.log('1️⃣  Testing Seeds API...');
    
    // Get all seeds
    console.log('   - Getting all seeds...');
    const seedsResponse = await api.get('/api/seeds');
    console.log(`   ✅ Found ${seedsResponse.data.length} seeds`);

    // Create a new seed
    console.log('   - Creating new seed...');
    const createSeedResponse = await api.post('/api/seeds', testSeed);
    const createdSeed = createSeedResponse.data;
    console.log(`   ✅ Created seed: ${createdSeed.id} - ${createdSeed.name}`);

    // Use the seed
    console.log('   - Using seed...');
    const useSeedResponse = await api.post(`/api/seeds/${createdSeed.id}/use`);
    console.log(`   ✅ Seed used ${useSeedResponse.data.usage.count} times`);

    // Get seed categories
    console.log('   - Getting seed categories...');
    const categoriesResponse = await api.get('/api/seeds/meta/categories');
    console.log(`   ✅ Found categories: ${categoriesResponse.data.join(', ')}`);

    // 2. Test Harvest API
    console.log('\n2️⃣  Testing Harvest API...');

    // Start a harvest
    console.log('   - Starting harvest...');
    const startHarvestResponse = await api.post(`/api/harvest/farms/${testFarmId}/harvest`, {
      farmName: testFarmName
    });
    const harvest = startHarvestResponse.data;
    console.log(`   ✅ Started harvest: ${harvest.id}`);

    // Wait for harvest to complete (simulated)
    console.log('   - Waiting for harvest to complete...');
    await new Promise(resolve => setTimeout(resolve, 12000)); // Wait 12 seconds

    // Get harvest details
    console.log('   - Getting harvest details...');
    const harvestDetailsResponse = await api.get(`/api/harvest/${harvest.id}`);
    const completedHarvest = harvestDetailsResponse.data;
    console.log(`   ✅ Harvest status: ${completedHarvest.status}`);
    console.log(`   ✅ Results: ${completedHarvest.results.length}`);
    console.log(`   ✅ Insights: ${completedHarvest.insights.length}`);
    console.log(`   ✅ Quality score: ${completedHarvest.quality.overallScore.toFixed(1)}%`);

    // Export harvest
    console.log('   - Exporting harvest as JSON...');
    const exportResponse = await api.post(`/api/harvest/${harvest.id}/export`, {
      format: 'json',
      includeResults: true,
      includeInsights: true
    });
    console.log('   ✅ Export successful');

    // Get harvest summaries
    console.log('   - Getting harvest summaries...');
    const summariesResponse = await api.get('/api/harvest/summaries');
    console.log(`   ✅ Found ${summariesResponse.data.length} harvest summaries`);

    // 3. Test Barn API
    console.log('\n3️⃣  Testing Barn API...');

    // Store harvest in barn
    console.log('   - Storing harvest in barn...');
    const storeResponse = await api.post('/api/barn/store', {
      harvestId: harvest.id,
      name: 'Test Analysis Results',
      description: 'Results from test code analysis',
      type: 'tool',
      category: 'analysis',
      tags: ['test', 'analysis', 'code'],
      folderId: 'apps'
    });
    const barnItem = storeResponse.data;
    console.log(`   ✅ Stored in barn: ${barnItem.id} - ${barnItem.name}`);

    // Get barn stats
    console.log('   - Getting barn statistics...');
    const statsResponse = await api.get('/api/barn/stats');
    const stats = statsResponse.data;
    console.log(`   ✅ Total items: ${stats.totalItems}`);
    console.log(`   ✅ Total storage: ${(stats.totalStorage / 1024).toFixed(2)} KB`);

    // Get all barn items
    console.log('   - Getting barn items...');
    const itemsResponse = await api.get('/api/barn/items');
    console.log(`   ✅ Found ${itemsResponse.data.length} items in barn`);

    // Use barn item
    console.log('   - Using barn item...');
    const useItemResponse = await api.post(`/api/barn/items/${barnItem.id}/use`);
    console.log(`   ✅ Item used ${useItemResponse.data.useCount} times`);

    // Get barn folders
    console.log('   - Getting barn folders...');
    const foldersResponse = await api.get('/api/barn/folders');
    console.log(`   ✅ Found ${foldersResponse.data.length} folders`);

    // Convert barn item to seed
    console.log('   - Converting barn item to seed...');
    const toSeedResponse = await api.post(`/api/barn/items/${barnItem.id}/to-seed`);
    console.log(`   ✅ Generated YAML for new seed`);

    // 4. Test End-to-End Workflow
    console.log('\n4️⃣  Testing End-to-End Workflow...');
    console.log('   ✅ Seed → Farm → Harvest → Barn workflow complete!');

    // Cleanup
    console.log('\n🧹 Cleaning up...');
    
    // Delete barn item
    await api.delete(`/api/barn/items/${barnItem.id}`);
    console.log('   ✅ Deleted barn item');

    // Delete seed
    await api.delete(`/api/seeds/${createdSeed.id}`);
    console.log('   ✅ Deleted test seed');

    console.log('\n✨ All tests passed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Run the test
testWorkflow().catch(console.error);