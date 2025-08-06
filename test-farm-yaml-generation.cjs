#!/usr/bin/env node

/**
 * Test script for farm-themed YAML generation
 * Tests the updated YAML generator with farm animal names
 */

const http = require('http');

async function makeRequest(prompt, mode = 'freestyle') {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      prompt: prompt,
      mode: mode,
      options: {}
    });

    const options = {
      hostname: 'localhost',
      port: 4567,
      path: '/api/yaml/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

async function testFarmYamlGeneration() {
  console.log('🌾 MaiFarm YAML Generation Test 🌾');
  console.log('='.repeat(50));
  
  const testCases = [
    {
      name: 'Code Review Farm',
      prompt: 'Create a farm with 3 agents for code review of a React application',
      mode: 'freestyle'
    },
    {
      name: 'Testing Farm',
      prompt: 'Generate a testing farm with 4 agents for comprehensive testing',
      mode: 'freestyle'
    },
    {
      name: 'Development Farm',
      prompt: 'Build a development farm with 5 agents for creating a new API',
      mode: 'freestyle'
    },
    {
      name: 'Debugging Farm',
      prompt: 'Setup 2 agents for debugging performance issues',
      mode: 'freestyle'
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n📝 Test: ${testCase.name}`);
    console.log(`   Prompt: ${testCase.prompt}`);
    console.log('-'.repeat(50));
    
    try {
      const result = await makeRequest(testCase.prompt, testCase.mode);
      
      if (result.success && result.data) {
        console.log('✅ YAML generated successfully!');
        
        // Parse YAML to check agents
        const yamlContent = result.data.yaml;
        const agentMatches = yamlContent.match(/- name: ([^\n]+)/g);
        
        if (agentMatches) {
          console.log('\n🐄 Farm Agents Found:');
          agentMatches.forEach((match, index) => {
            const name = match.replace('- name: ', '').trim();
            console.log(`   ${index + 1}. ${name}`);
            
            // Check if it has farm animal emojis and names
            if (name.includes('🐄') || name.includes('🐷') || name.includes('🐔') || 
                name.includes('🐴') || name.includes('🐑') || name.includes('🦆') ||
                name.includes('🐕') || name.includes('🐈') || name.includes('🦉')) {
              console.log('      ✅ Has farm emoji!');
            }
            
            if (name.includes(' the ')) {
              console.log('      ✅ Has farm character format!');
            }
          });
        }
        
        // Check initial prompt for farm theme
        const promptMatch = yamlContent.match(/initial_prompt: \|([^]*?)(?=\nsteps:|$)/);
        if (promptMatch) {
          const initialPrompt = promptMatch[1].trim();
          console.log('\n📋 Initial Prompt Preview:');
          const promptPreview = initialPrompt.substring(0, 200);
          console.log(`   "${promptPreview}..."`);
          
          if (initialPrompt.includes('MaiFarm') || initialPrompt.includes('farm') || 
              initialPrompt.includes('barnyard') || initialPrompt.includes('agricultural')) {
            console.log('   ✅ Contains farm-themed language!');
          }
        }
        
        // Count steps
        const stepMatches = yamlContent.match(/^  - /gm);
        const stepCount = stepMatches ? stepMatches.length : 0;
        
        console.log('\n📊 Farm Statistics:');
        console.log(`   Total Agents: ${agentMatches ? agentMatches.length : 0}`);
        console.log(`   Total Steps: ${stepCount}`);
        
        // Save sample YAML for inspection
        if (testCase.name === 'Code Review Farm') {
          const fs = require('fs');
          const yamlPath = './test-farm-sample.yaml';
          fs.writeFileSync(yamlPath, yamlContent);
          console.log(`\n💾 Sample YAML saved to: ${yamlPath}`);
        }
      } else {
        console.log('❌ Failed to generate YAML:', result.error || 'Unknown error');
      }
    } catch (error) {
      console.error('❌ Error during test:', error.message);
      console.log('   Make sure the server is running with: npm run dev');
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('🎉 Farm YAML Generation Tests Complete!');
}

// Run the tests
testFarmYamlGeneration().catch(console.error);