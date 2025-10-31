/**
 * Test script to verify rate limit error handling
 * Run with: npx ts-node apps/api/src/tests/rate-limit-test.ts
 */

import axios from 'axios';

const API_URL = 'http://localhost:4567';

async function testRateLimit() {
  console.log('Testing rate limit error handling...\n');

  // Create a test request that will trigger rate limit
  const testRequest = {
    prompt: 'Test task for rate limit',
    provider: 'claude',
    agentCount: 5,
    timeoutMinutes: 45,
    useXenoSync: true
  };

  try {
    // Make multiple rapid requests to trigger rate limit
    console.log('Sending multiple requests to trigger rate limit...');

    const promises = [];
    for (let i = 0; i < 15; i++) {
      promises.push(
        axios.post(`${API_URL}/api/quick-actions/go-wild`, testRequest, {
          headers: {
            'Content-Type': 'application/json'
          }
        }).catch(err => err)
      );
    }

    const results = await Promise.all(promises);

    // Check for rate limit responses
    const rateLimitResponses = results.filter(r =>
      r.response?.status === 429
    );

    if (rateLimitResponses.length > 0) {
      console.log('\n✅ Rate limit triggered successfully!');
      console.log('\nRate limit response structure:');
      const sampleResponse = rateLimitResponses[0].response.data;
      console.log(JSON.stringify(sampleResponse, null, 2));

      // Verify enhanced error details
      if (sampleResponse.provider && sampleResponse.providerName && sampleResponse.providerUrl) {
        console.log('\n✅ Enhanced rate limit details present:');
        console.log(`  Provider: ${sampleResponse.provider}`);
        console.log(`  Provider Name: ${sampleResponse.providerName}`);
        console.log(`  Provider URL: ${sampleResponse.providerUrl}`);
        console.log(`  Error Code: ${sampleResponse.error?.code}`);
        console.log(`  User Message: ${sampleResponse.error?.userMessage}`);
      } else {
        console.log('\n⚠️ Enhanced rate limit details missing!');
      }
    } else {
      console.log('\n⚠️ Rate limit was not triggered. You may need to:');
      console.log('  1. Reduce the rate limit threshold in rateLimiter.ts');
      console.log('  2. Make more requests');
      console.log('  3. Check if rate limiting is properly configured');
    }

  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testRateLimit().then(() => {
  console.log('\nTest complete!');
  process.exit(0);
}).catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});