// Test Quick Task API endpoint
const http = require('http');

const testQuickTask = async () => {
  const data = JSON.stringify({
    description: 'Test quick task from API',
    timeout: 300000
  });

  const options = {
    hostname: 'localhost',
    port: 4567,
    path: '/api/tasks/quick',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let responseBody = '';
      
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      
      res.on('end', () => {
        console.log('Status Code:', res.statusCode);
        console.log('Response:', responseBody);
        
        if (res.statusCode === 201 || res.statusCode === 200) {
          console.log('✅ Quick Task API is working!');
          resolve(JSON.parse(responseBody));
        } else {
          console.log('❌ Quick Task API returned error');
          reject(new Error(`Status ${res.statusCode}: ${responseBody}`));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ Connection error:', error.message);
      reject(error);
    });
    
    req.write(data);
    req.end();
  });
};

// Run the test
console.log('Testing Quick Task API endpoint...');
testQuickTask()
  .then(result => {
    console.log('Success! Farm ID:', result.farmId || result.data?.farmId);
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error.message);
    process.exit(1);
  });