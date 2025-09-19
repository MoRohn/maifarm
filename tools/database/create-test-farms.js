import { db } from './server/database/connection.js';

async function createTestFarms() {
  try {
    console.log('Creating test farms...');
    const client = await db.connect();
    
    const farms = [
      { name: 'Test Farm 1', status: 'failed' },
      { name: 'Test Farm 2', status: 'completed' },
      { name: 'Test Farm 3', status: 'stopped' },
      { name: 'Active Farm', status: 'running' },
      { name: 'Launching Farm', status: 'launching' }
    ];
    
    for (const farm of farms) {
      await client.query(
        'INSERT INTO farms (name, status, created_by) VALUES ($1, $2, $3)',
        [farm.name, farm.status, '00000000-0000-0000-0000-000000000000']
      );
      console.log(`Created farm: ${farm.name} (${farm.status})`);
    }
    
    client.release();
    console.log('Test farms created successfully');
  } catch (error) {
    console.error('Failed to create test farms:', error);
  }
  process.exit(0);
}

createTestFarms();