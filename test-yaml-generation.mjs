#!/usr/bin/env node

import axios from 'axios';

async function testYAMLGeneration() {
  console.log('Testing YAML generation...\n');
  
  try {
    // Test 1: Direct YAML generation
    console.log('Test 1: Direct YAML generation');
    const yamlResponse = await axios.post('http://localhost:4567/api/yaml/generate', {
      prompt: 'Build a weather dashboard with real-time updates',
      num_agents: 3,
      complexity: 'moderate',
      farm_type: 'development',
      include_estimates: true,
      enhance_prompt: false
    });
    
    console.log('✅ YAML generated successfully!');
    console.log('Response structure:', {
      success: yamlResponse.data.success,
      hasYaml: !!yamlResponse.data?.data?.yaml,
      yamlLength: yamlResponse.data?.data?.yaml?.length || 0
    });
    console.log('\nFirst 200 chars of YAML:');
    console.log(yamlResponse.data?.data?.yaml?.substring(0, 200) + '...\n');
    
    // Test 2: Farm creation with YAML
    console.log('Test 2: Farm creation with generated YAML');
    const farmResponse = await axios.post('http://localhost:4567/api/farms', {
      name: 'Test Weather Dashboard',
      description: 'Build a weather dashboard with real-time updates',
      config: yamlResponse.data?.data?.yaml,
      type: 'collaborative',
      status: 'launching',
      orchestratorType: 'multiClaude',
      timeout: 300, // 5 minutes for testing
      autoScale: false
    });
    
    console.log('✅ Farm created successfully!');
    const farmData = farmResponse.data.data || farmResponse.data;
    const farmId = farmData.id;
    console.log('Farm ID:', farmId);
    console.log('Farm Status:', farmData.status);
    console.log('\n🌾 View harvest at: http://localhost:3000/harvest/' + farmId);
    
    return farmId;
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Error details:', error.response.data);
    }
    process.exit(1);
  }
}

// Run the test
testYAMLGeneration().then(farmId => {
  console.log('\n✅ All tests passed!');
  console.log('Farm ID:', farmId);
  process.exit(0);
}).catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});