#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.development') });
dotenv.config({ path: join(__dirname, '../.env') });

// Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_ENDPOINT = process.env.OPENAI_API_ENDPOINT || 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_KEY = process.env.AZURE_OPENAI_KEY;

console.log('OpenAI Connection Test');
console.log('======================\n');

// Check if API key is configured
if (!OPENAI_API_KEY && !AZURE_OPENAI_KEY) {
  console.error('❌ Error: No OpenAI API key configured.');
  console.log('\nPlease set one of the following environment variables:');
  console.log('  - OPENAI_API_KEY for standard OpenAI API');
  console.log('  - AZURE_OPENAI_KEY for Azure OpenAI Service');
  console.log('\nYou can obtain an API key from:');
  console.log('  - OpenAI: https://platform.openai.com/api-keys');
  console.log('  - Azure: https://portal.azure.com');
  process.exit(1);
}

const isAzure = AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_KEY;
const apiKey = isAzure ? AZURE_OPENAI_KEY : OPENAI_API_KEY;
const endpoint = isAzure ? AZURE_OPENAI_ENDPOINT : OPENAI_API_ENDPOINT;

console.log(`Provider: ${isAzure ? 'Azure OpenAI' : 'OpenAI'}`);
console.log(`Endpoint: ${endpoint}`);
console.log(`Model: ${OPENAI_MODEL}`);
console.log(`API Key: ${apiKey ? '✓ Configured' : '✗ Missing'}\n`);

// Test 1: List available models
async function listModels() {
  console.log('Test 1: Fetching available models...');
  
  if (isAzure) {
    console.log('  Skipping model listing for Azure (not supported)');
    return true;
  }
  
  try {
    const response = await axios.get(`${endpoint}/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    const gptModels = response.data.data
      .filter(model => model.id.includes('gpt'))
      .map(model => model.id)
      .sort();
    
    console.log(`  ✓ Found ${gptModels.length} GPT models:`);
    gptModels.slice(0, 5).forEach(model => {
      console.log(`    - ${model}`);
    });
    if (gptModels.length > 5) {
      console.log(`    ... and ${gptModels.length - 5} more`);
    }
    
    return true;
  } catch (error) {
    console.error(`  ✗ Failed to list models: ${error.message}`);
    if (error.response?.status === 401) {
      console.error('    Invalid API key');
    }
    return false;
  }
}

// Test 2: Test chat completion
async function testChatCompletion() {
  console.log('\nTest 2: Testing chat completion...');
  
  const testMessage = {
    model: OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant. Reply with exactly: "OpenAI connection successful!"'
      },
      {
        role: 'user',
        content: 'Test message'
      }
    ],
    max_tokens: 50,
    temperature: 0
  };
  
  try {
    let response;
    
    if (isAzure) {
      // Azure OpenAI format
      const azureEndpoint = `${endpoint}/openai/deployments/${OPENAI_MODEL}/chat/completions?api-version=2024-02-15-preview`;
      response = await axios.post(azureEndpoint, testMessage, {
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json'
        }
      });
    } else {
      // Standard OpenAI format
      response = await axios.post(`${endpoint}/chat/completions`, testMessage, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
    }
    
    const reply = response.data.choices[0].message.content;
    const usage = response.data.usage;
    
    console.log(`  ✓ Chat completion successful`);
    console.log(`    Response: "${reply}"`);
    console.log(`    Tokens used: ${usage.total_tokens} (prompt: ${usage.prompt_tokens}, completion: ${usage.completion_tokens})`);
    
    return true;
  } catch (error) {
    console.error(`  ✗ Chat completion failed: ${error.message}`);
    if (error.response) {
      console.error(`    Status: ${error.response.status}`);
      if (error.response.data?.error) {
        console.error(`    Error: ${error.response.data.error.message}`);
      }
    }
    return false;
  }
}

// Test 3: Check model capabilities
async function checkCapabilities() {
  console.log('\nTest 3: Checking model capabilities...');
  
  const models = {
    'gpt-4-turbo-preview': { tokens: 128000, vision: false, functions: true },
    'gpt-4o': { tokens: 128000, vision: true, functions: true },
    'gpt-4': { tokens: 8192, vision: false, functions: true },
    'gpt-3.5-turbo': { tokens: 16385, vision: false, functions: true }
  };
  
  const modelKey = Object.keys(models).find(key => OPENAI_MODEL.includes(key));
  const capabilities = models[modelKey] || { tokens: 8192, vision: false, functions: true };
  
  console.log(`  Model: ${OPENAI_MODEL}`);
  console.log(`  ✓ Max tokens: ${capabilities.tokens.toLocaleString()}`);
  console.log(`  ${capabilities.vision ? '✓' : '✗'} Vision support`);
  console.log(`  ${capabilities.functions ? '✓' : '✗'} Function calling`);
  
  return true;
}

// Run all tests
async function runTests() {
  console.log('Running connectivity tests...\n');
  
  const results = [];
  
  // Run tests
  results.push(await listModels());
  results.push(await testChatCompletion());
  results.push(await checkCapabilities());
  
  // Summary
  console.log('\n======================');
  console.log('Test Summary:');
  console.log('======================');
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  if (passed === total) {
    console.log(`✅ All ${total} tests passed!`);
    console.log('\nOpenAI integration is ready to use.');
    console.log('You can now create farms and execute tasks using OpenAI GPT-4.');
  } else {
    console.log(`⚠️  ${passed}/${total} tests passed`);
    console.log('\nPlease check the errors above and ensure:');
    console.log('1. Your API key is valid');
    console.log('2. The API endpoint is correct');
    console.log('3. Your account has access to the specified model');
  }
  
  process.exit(passed === total ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});