#!/usr/bin/env node

import axios from 'axios';

async function testGoWild() {
  console.log('Testing GoWild mode launch...');
  
  try {
    const response = await axios.post('http://localhost:4567/api/go-wild', {
      prompt: 'Test GoWild exploration - build a simple calculator',
      timeout: 300, // 5 minutes for testing
      autoScale: false,
      maxAgents: 2
    });
    
    console.log('✅ GoWild launched successfully!');
    console.log('Farm ID:', response.data.farmId);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    // Check the Harvest URL
    const harvestUrl = `http://localhost:3000/harvest/${response.data.farmId}`;
    console.log(`\n🌾 View harvest at: ${harvestUrl}`);
    
  } catch (error) {
    console.error('❌ Failed to launch GoWild:', error.message);
    if (error.response) {
      console.error('Error details:', error.response.data);
    }
  }
}

testGoWild();