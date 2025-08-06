import { FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting MaiFarm test environment teardown...');
  
  try {
    // Clean up temporary files
    const tempFiles = [
      'tests/playwright/auth.json',
      'test-results/lighthouse.html'
    ];
    
    for (const file of tempFiles) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(`🗑️  Cleaned up: ${file}`);
      }
    }
    
    // Generate test summary report
    const reportDir = 'reports';
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const summary = {
      timestamp: new Date().toISOString(),
      testResults: 'See detailed reports in test-results/',
      environment: process.env.NODE_ENV || 'development',
      cleanup: 'completed'
    };
    
    fs.writeFileSync(
      path.join(reportDir, 'test-summary.json'),
      JSON.stringify(summary, null, 2)
    );
    
    console.log('✅ Global teardown completed successfully');
  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw error to avoid masking test failures
  }
}

export default globalTeardown;