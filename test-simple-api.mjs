// Test simple API endpoint
import http from 'http';

const testEndpoint = async (path) => {
  const data = JSON.stringify({
    description: 'Test quick task'
  });

  const options = {
    hostname: 'localhost',
    port: 4567,
    path: path,
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
        console.log(`\n${path}:`);
        console.log('Status:', res.statusCode);
        console.log('Response:', responseBody.substring(0, 200));
        
        if (res.statusCode === 201 || res.statusCode === 200) {
          console.log('✅ Success!');
          resolve(JSON.parse(responseBody));
        } else {
          console.log('❌ Failed');
          reject(new Error(`Status ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error(`❌ ${path} error:`, error.message);
      reject(error);
    });
    
    req.write(data);
    req.end();
  });
};

// Test both endpoints
console.log('Testing API endpoints...');

testEndpoint('/api/quicktest')
  .then(() => testEndpoint('/api/tasks/quick'))
  .catch(err => console.error('Test failed:', err.message));