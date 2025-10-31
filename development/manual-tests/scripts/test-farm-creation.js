#!/usr/bin/env node

/**
 * Test script for farm creation with prompt enhancement
 * Tests the complete flow from creation through API key validation
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
const envFile = process.env.NODE_ENV === 'production' ? '.env' : '.env.development';
dotenv.config({ path: resolve(process.cwd(), envFile) });

const API_BASE = process.env.API_URL || 'http://localhost:4567';

async function testFarmCreation() {
  console.log('=== Testing Farm Creation Flow ===\n');
  
  // Check API keys are available
  const hasApiKey = !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY);
  console.log(`✓ API Keys Available: ${hasApiKey ? 'YES' : 'NO'}`);
  if (!hasApiKey) {
    console.error('⚠️  Warning: No API keys found in environment');
  }
  
  // Test 1: Create farm with simple prompt
  console.log('\n1. Testing farm creation with simple prompt...');
  try {
    const response = await fetch(`${API_BASE}/api/farms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify({
        name: `Test Farm ${Date.now()}`,
        description: 'Test farm for validation',
        type: 'collaborative',
        autoLaunch: true,
        config: {
          prompt: 'Build a simple calculator application',
          maxAgents: 2,
          timeout: 300, // 5 minutes
          provider: 'claude'
        }
      })
    });
    
    const result = await response.json();
    if (result.success) {
      console.log('✓ Farm created successfully:', result.data.id);
      console.log('  Status:', result.data.status);
      console.log('  Config:', JSON.stringify(result.data.config, null, 2));
      
      // Check if prompt enhancement happened
      if (result.data.config.enhancementMetadata) {
        console.log('✓ Prompt enhancement applied');
      } else {
        console.log('⚠️  Prompt enhancement not applied (fallback used)');
      }
      
      return result.data.id;
    } else {
      console.error('✗ Farm creation failed:', result.error);
      return null;
    }
  } catch (error) {
    console.error('✗ Request failed:', error.message);
    return null;
  }
}

async function checkFarmStatus(farmId) {
  if (!farmId) return;
  
  console.log('\n2. Checking farm status...');
  try {
    const response = await fetch(`${API_BASE}/api/farms/${farmId}`, {
      headers: {
        'Authorization': 'Bearer test-token'
      }
    });
    
    const result = await response.json();
    if (result.success) {
      console.log('✓ Farm status:', result.data.status);
      console.log('  Agents:', result.data.agents.length);
      
      // Check for any errors
      if (result.data.errors && result.data.errors.length > 0) {
        console.error('⚠️  Farm has errors:', result.data.errors);
      }
    } else {
      console.error('✗ Failed to get farm status:', result.error);
    }
  } catch (error) {
    console.error('✗ Request failed:', error.message);
  }
}

async function testPromptEnhancement() {
  console.log('\n3. Testing direct prompt enhancement...');
  
  // This would require a direct endpoint for testing prompt enhancement
  // For now, we can only test it through farm creation
  console.log('  (Tested through farm creation above)');
}

async function runTests() {
  console.log('Starting farm creation tests...');
  console.log('API Base:', API_BASE);
  console.log('Environment:', process.env.NODE_ENV || 'development');
  
  // Run tests
  const farmId = await testFarmCreation();
  
  // Wait a bit for farm to initialize
  if (farmId) {
    console.log('\nWaiting 3 seconds for farm initialization...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    await checkFarmStatus(farmId);
  }
  
  await testPromptEnhancement();
  
  console.log('\n=== Test Complete ===');
  process.exit(0);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

// Run tests
runTests();