import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting MaiFarm test environment setup...');
  
  const { baseURL } = config.projects[0].use;
  
  // Launch browser for setup
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Wait for the application to be ready
    console.log(`⏱️  Waiting for ${baseURL} to be ready...`);
    await page.goto(baseURL || 'http://localhost:4173');
    
    // Wait for the main app to load
    await page.waitForSelector('[data-testid="app-root"], .app, #root', { timeout: 30000 });
    
    // Check if WebSocket connection is working
    const wsStatus = await page.evaluate(() => {
      return new Promise((resolve) => {
        const ws = new WebSocket('ws://localhost:4567');
        ws.onopen = () => resolve('connected');
        ws.onerror = () => resolve('failed');
        setTimeout(() => resolve('timeout'), 5000);
      });
    });
    
    console.log(`🔌 WebSocket status: ${wsStatus}`);
    
    // Setup test data if needed
    console.log('📊 Setting up test data...');
    
    // Store authentication state if needed
    await page.context().storageState({ path: 'tests/playwright/auth.json' });
    
    console.log('✅ Global setup completed successfully');
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;