#!/usr/bin/env node

import http from 'http';

async function apiRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'http://localhost:4567');
    const options = {
      method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
        } catch (error) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function testHarvest() {
  console.log('Creating Quick Task to generate harvest...');
  
  const taskData = {
    title: 'Debug Harvest Test',
    description: 'Test to debug harvest lookup issue',
    priority: 'high',
    timeout: 30000, // 30 seconds
  };
  
  const createResponse = await apiRequest('POST', '/api/tasks/quick', taskData);
  console.log('Task creation response:', createResponse.status);
  
  if (createResponse.body?.success) {
    const harvestId = createResponse.body.data.harvestId;
    console.log('Harvest ID:', harvestId);
    
    // Wait a moment, then try to fetch the harvest
    setTimeout(async () => {
      console.log('Fetching harvest...');
      const harvestResponse = await apiRequest('GET', `/api/harvests/${harvestId}`);
      console.log('Harvest fetch response:', harvestResponse.status);
      if (harvestResponse.body) {
        console.log('Response body:', JSON.stringify(harvestResponse.body, null, 2));
      }
    }, 2000);
  }
}

testHarvest().catch(console.error);