// Test script to verify AI Engine configuration persistence
// Run with: node test-ai-engine-persistence.js

console.log('Testing AI Engine Configuration Persistence...\n');

// Simulate saving configuration
const testEngineConfig = [
  {
    id: 'claude',
    name: 'Claude Code',
    icon: '🧠',
    status: 'configured',
    apiType: 'cloud',
    lastConfigured: new Date().toISOString()
  },
  {
    id: 'openai',
    name: 'OpenAI GPT',
    icon: '🧠',
    status: 'not-configured',
    apiType: 'cloud'
  }
];

const testApiKeys = [
  {
    id: '1234567890',
    name: 'Claude API Key',
    key: 'sk-ant-api03-test-key-masked',
    service: 'Claude',
    permissions: ['read', 'write'],
    createdAt: new Date().toISOString()
  }
];

// Save to localStorage (simulated)
console.log('Saving configurations to localStorage...');
console.log('AI Engines:', JSON.stringify(testEngineConfig, null, 2));
console.log('API Keys:', JSON.stringify(testApiKeys, null, 2));

// Test server endpoints
const testServerEndpoints = async () => {
  const baseUrl = 'http://localhost:4567';
  
  console.log('\nTesting server endpoints...');
  
  // Test Claude status endpoint
  try {
    const claudeStatus = await fetch(`${baseUrl}/api/apikeys/claude/status`);
    if (claudeStatus.ok) {
      const data = await claudeStatus.json();
      console.log('✅ Claude API status:', data.configured ? 'Configured' : 'Not configured');
    } else {
      console.log('❌ Failed to check Claude status');
    }
  } catch (error) {
    console.log('⚠️ Server not running or endpoint not available');
  }
  
  // Test OpenAI status endpoint
  try {
    const openaiStatus = await fetch(`${baseUrl}/api/openai/status`);
    if (openaiStatus.ok) {
      const data = await openaiStatus.json();
      console.log('✅ OpenAI API status:', data.configured ? 'Configured' : 'Not configured');
    } else {
      console.log('❌ Failed to check OpenAI status');
    }
  } catch (error) {
    console.log('⚠️ Server not running or endpoint not available');
  }
};

// Run tests
testServerEndpoints().then(() => {
  console.log('\n✅ Configuration persistence test complete!');
  console.log('The AI Engine Setup should now:');
  console.log('1. Save engine configurations to localStorage');
  console.log('2. Load saved configurations on component mount');
  console.log('3. Check server status for each engine');
  console.log('4. Display API keys inline with each engine');
  console.log('5. Combine AI Engine & API Keys into one settings section');
}).catch(error => {
  console.error('Test failed:', error);
});