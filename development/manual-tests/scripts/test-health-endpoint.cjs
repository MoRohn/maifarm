#!/usr/bin/env node

/**
 * Test the actual health check endpoint
 */

const http = require('http');

const PORT = process.env.PORT || 4567;

function testHealthEndpoint() {
  console.log(`Testing health endpoint at http://localhost:${PORT}/health\n`);

  http.get(`http://localhost:${PORT}/health`, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        const healthData = JSON.parse(data);
        const status = healthData.data?.status || healthData.status || 'unknown';
        const services = healthData.data?.services || healthData.services || [];

        console.log(`Overall Status: ${status}`);
        console.log('\nServices:');
        console.log('─'.repeat(50));

        services.forEach(service => {
          const statusEmoji =
            service.status === 'healthy' ? '✅' :
            service.status === 'degraded' ? '⚠️' :
            service.status === 'unhealthy' ? '❌' : '❓';

          console.log(`${statusEmoji} ${service.name.padEnd(15)} : ${service.status}`);

          if (service.error) {
            console.log(`   Error: ${service.error}`);
          }
          if (service.details) {
            console.log(`   Details:`, service.details);
          }
        });

        console.log('─'.repeat(50));

        // Focus on tmux service
        const tmuxService = services.find(s => s.name === 'tmux');
        if (tmuxService) {
          console.log('\nTmux Service Details:');
          console.log('─'.repeat(50));
          console.log(`Status: ${tmuxService.status}`);
          if (tmuxService.error) {
            console.log(`Error: ${tmuxService.error}`);
          }
          if (tmuxService.details) {
            console.log('Details:', JSON.stringify(tmuxService.details, null, 2));
          }
        } else {
          console.log('\n⚠️  Tmux service not found in health check response');
        }

        // Focus on api_keys service
        const apiKeysService = services.find(s => s.name === 'api_keys');
        if (apiKeysService) {
          console.log('\nAPI Keys Service Details:');
          console.log('─'.repeat(50));
          console.log(`Status: ${apiKeysService.status}`);
          if (apiKeysService.error) {
            console.log(`Error: ${apiKeysService.error}`);
          }
          if (apiKeysService.details) {
            console.log('Details:', JSON.stringify(apiKeysService.details, null, 2));
          }
        }

      } catch (error) {
        console.error('Failed to parse health check response:', error);
        console.log('Raw response:', data);
      }
    });
  }).on('error', (err) => {
    console.error('❌ Failed to connect to health endpoint:', err.message);
    console.log('\nMake sure the server is running on port', PORT);
  });
}

// Run the test
testHealthEndpoint();