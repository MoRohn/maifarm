import { aiProviderManager, AIProvider } from './apps/api/src/config/aiProviders';

async function test() {
  console.log('Testing API key loading from database...\n');
  
  // Wait for async initialization
  await aiProviderManager.refreshApiKeys();
  
  console.log('Default provider:', aiProviderManager.getDefaultProvider());
  
  try {
    const claudeConfig = aiProviderManager.getProvider(AIProvider.CLAUDE);
    console.log('\nClaude config:');
    console.log('  - Enabled:', claudeConfig.enabled);
    console.log('  - API Key:', claudeConfig.apiKey ? `Present (${claudeConfig.apiKey.length} chars)` : 'MISSING');
    
    const env = aiProviderManager.getProviderEnvironment(AIProvider.CLAUDE);
    console.log('\nClaude environment variables:');
    console.log('  - ANTHROPIC_API_KEY:', env.ANTHROPIC_API_KEY ? `Present (${env.ANTHROPIC_API_KEY.length} chars)` : 'MISSING');
    console.log('  - CLAUDE_API_KEY:', env.CLAUDE_API_KEY ? `Present (${env.CLAUDE_API_KEY.length} chars)` : 'MISSING');
  } catch (error: any) {
    console.error('\nError getting Claude config:', error.message);
  }
  
  console.log('\nprocess.env check (after loading):');
  console.log('  - ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? `Present (${process.env.ANTHROPIC_API_KEY.length} chars)` : 'NOT SET');
  console.log('  - CLAUDE_API_KEY:', process.env.CLAUDE_API_KEY ? `Present (${process.env.CLAUDE_API_KEY.length} chars)` : 'NOT SET');
}

test().then(() => process.exit(0)).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
