/**
 * MaiFarm Complete Demo Recording Script
 *
 * This script creates a comprehensive demo of the MaiFarm application,
 * showing the complete farming workflow from creation to harvest collection.
 * Target duration: 3-5 minutes
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';

const API_BASE = 'http://localhost:4567';
const FRONTEND_URL = 'http://localhost:3000';

interface DemoConfig {
  slowMo: number;
  farmName: string;
  farmDescription: string;
}

const config: DemoConfig = {
  slowMo: 400,  // Faster slowMo but with manual delays for key moments
  farmName: `Demo Farm ${new Date().toISOString().slice(11, 16).replace(':', '')}`,
  farmDescription: 'A demonstration farm showcasing the MaiFarm workflow',
};

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runDemo(): Promise<void> {
  console.log('🎬 Starting MaiFarm Complete Demo Recording...');
  console.log('   Target duration: 3-5 minutes');

  const browser: Browser = await chromium.launch({
    headless: false,
    slowMo: config.slowMo,
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,  // Retina quality
    locale: 'en-US',
  });

  const page: Page = await context.newPage();

  // Helper function to dismiss modals
  const dismissModal = async () => {
    const closeSelectors = [
      '[role="dialog"] button[aria-label="Close"]',
      'button:has-text("Close")',
      'button:has-text("Dismiss")',
      'button:has-text("Got it")',
      'button:has-text("Skip")',
      'button:has-text("Later")',
      'button:has-text("Not now")',
      '[data-testid="close-modal"]',
    ];

    for (const selector of closeSelectors) {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
        try {
          await btn.click({ force: true, timeout: 1000 });
          console.log(`   Dismissed modal`);
          await sleep(500);
          return true;
        } catch (e) {
          // Continue
        }
      }
    }
    await page.keyboard.press('Escape');
    await sleep(200);
    return false;
  };

  // Helper to safely navigate
  const navigateTo = async (path: string, name: string) => {
    console.log(`   ➡️ ${name}...`);
    await page.goto(`${FRONTEND_URL}${path}`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await sleep(1500);
    await dismissModal();
    await dismissModal();
  };

  try {
    // ============================================================
    // SETUP: Enable guest mode
    // ============================================================
    console.log('🔓 Setting up guest mode...');
    await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem('maifarm:guest-mode', 'true');
      localStorage.setItem('maifarm:auth-bypass', 'true');
      localStorage.setItem('maifarm:welcome-page:v2', 'viewed');
      localStorage.setItem('maifarm-show-welcome', 'false');
    });

    // ============================================================
    // PHASE 1: Dashboard Overview
    // ============================================================
    console.log('📊 PHASE 1: Dashboard Overview');

    await page.reload({ waitUntil: 'networkidle' });
    await sleep(2000);

    // Dismiss any welcome modals
    for (let i = 0; i < 3; i++) await dismissModal();

    console.log('   Exploring dashboard...');
    await sleep(2000);

    // Slow scroll to show dashboard
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 200);
      await sleep(800);
    }
    await sleep(1000);
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, -200);
      await sleep(800);
    }

    console.log('✅ Dashboard viewed');
    await sleep(1500);

    // ============================================================
    // PHASE 2: Settings & AI Engine Configuration
    // ============================================================
    console.log('⚙️ PHASE 2: Settings & AI Engine Configuration');

    await navigateTo('/settings', 'Settings');
    await sleep(2000);

    // Explore settings sections
    console.log('   Scrolling through settings...');
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 250);
      await sleep(1000);
    }

    // Scroll back up
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, -250);
      await sleep(800);
    }

    // Try to click on AI Engine related settings
    const aiEngineSelectors = [
      'button:has-text("AI Engine")',
      'button:has-text("Engine")',
      'button:has-text("Model")',
      '[data-testid="ai-settings"]',
      'div:has-text("AI Engine") >> button'
    ];

    for (const selector of aiEngineSelectors) {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        console.log('   Found AI Engine settings');
        await btn.click().catch(() => {});
        await sleep(2000);
        break;
      }
    }

    console.log('✅ Settings explored');
    await sleep(1500);

    // ============================================================
    // PHASE 3: Explore Farmers (Templates)
    // ============================================================
    console.log('👨‍🌾 PHASE 3: Explore Farmers/Templates');

    await navigateTo('/farmers', 'Farmers');
    await sleep(2000);

    // Scroll through farmers
    console.log('   Viewing available farmers...');
    await page.mouse.wheel(0, 300);
    await sleep(1500);
    await page.mouse.wheel(0, 300);
    await sleep(1500);
    await page.mouse.wheel(0, -600);
    await sleep(1000);

    // Try to click on a farmer card to view details
    const farmerCard = page.locator('.card, [class*="Card"], [data-testid*="farmer"]').first();
    if (await farmerCard.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log('   Viewing farmer details...');
      await farmerCard.click().catch(() => {});
      await sleep(2000);
      await dismissModal();
    }

    console.log('✅ Farmers explored');
    await sleep(1500);

    // ============================================================
    // PHASE 4: Create New Farm - The Main Flow
    // ============================================================
    console.log('🌾 PHASE 4: Create New Farm');

    await navigateTo('/farms/new', 'New Farm');
    await sleep(3000);

    // Dismiss any modals
    await dismissModal();
    await dismissModal();

    console.log('   Viewing seed options...');

    // Scroll to show available seeds
    await page.mouse.wheel(0, 200);
    await sleep(1500);
    await page.mouse.wheel(0, -200);
    await sleep(1000);

    // Try to find and click a seed card
    const seedSelectors = [
      '[data-testid="seed-card"]',
      '.seed-card',
      '[class*="seed"]',
      '.card:has-text("Code Review")',
      '.card:has-text("Research")',
      '.card:has-text("Data")',
      '.card'
    ];

    let seedSelected = false;
    for (const selector of seedSelectors) {
      const card = page.locator(selector).first();
      if (await card.isVisible({ timeout: 500 }).catch(() => false)) {
        console.log('   Selecting a seed template...');
        await card.click().catch(() => {});
        await sleep(2000);
        seedSelected = true;
        break;
      }
    }

    // Fill in farm name
    const nameInputSelectors = [
      'input[name="farmName"]',
      'input[placeholder*="name" i]',
      'input[placeholder*="farm" i]',
      'input[id*="name" i]',
      'input[type="text"]'
    ];

    for (const selector of nameInputSelectors) {
      const input = page.locator(selector).first();
      if (await input.isVisible({ timeout: 500 }).catch(() => false)) {
        console.log('   Entering farm name...');
        await input.click();
        await sleep(300);
        await input.fill('');
        await input.type(config.farmName, { delay: 80 });  // Slower typing for demo
        await sleep(1500);
        break;
      }
    }

    // Fill in description if available
    const descInput = page.locator('textarea, input[name="description"]').first();
    if (await descInput.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log('   Adding description...');
      await descInput.type(config.farmDescription, { delay: 40 });
      await sleep(1000);
    }

    // Look at options/settings before creating
    console.log('   Reviewing farm settings...');
    await page.mouse.wheel(0, 200);
    await sleep(1500);

    // Find and click create button
    const createSelectors = [
      'button:has-text("Create Farm")',
      'button:has-text("Start Farm")',
      'button:has-text("Launch")',
      'button:has-text("Create")',
      'button:has-text("Start")',
      'button[type="submit"]'
    ];

    for (const selector of createSelectors) {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        console.log('   Creating farm...');
        await btn.hover();
        await sleep(1000);
        await btn.click().catch(() => {});
        await sleep(5000);
        break;
      }
    }

    console.log('✅ Farm creation initiated');
    await sleep(2000);

    // ============================================================
    // PHASE 5: Monitor Harvest Progress
    // ============================================================
    console.log('🌿 PHASE 5: Monitor Harvest');

    // Check current URL - we might have been redirected
    const currentUrl = page.url();
    console.log(`   Current location: ${currentUrl}`);

    if (!currentUrl.includes('harvest')) {
      // Try to navigate to harvest
      await navigateTo('/home', 'Dashboard');
      await sleep(2000);

      // Look for active farms to view harvest
      const activeFarm = page.locator('[class*="farm"]:has-text("running"), [class*="active"], .card:has-text("Demo")').first();
      if (await activeFarm.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('   Found active farm...');
        await activeFarm.click().catch(() => {});
        await sleep(2000);
      }
    }

    // Wait and show harvest progress
    console.log('   Monitoring harvest progress...');
    console.log('   (Waiting 45 seconds for harvest activity)');

    for (let i = 0; i < 9; i++) {
      await sleep(5000);
      console.log(`   Progress check ${i + 1}/9...`);

      // Scroll to show activity
      await page.mouse.wheel(0, 150);
      await sleep(1000);
      await page.mouse.wheel(0, -150);
      await sleep(500);
    }

    console.log('✅ Harvest monitoring complete');
    await sleep(1500);

    // ============================================================
    // PHASE 6: View Barn Results
    // ============================================================
    console.log('🏠 PHASE 6: View Barn Results');

    await navigateTo('/barn', 'Barn');
    await sleep(2500);

    // Explore barn content
    console.log('   Viewing stored harvests...');
    await page.mouse.wheel(0, 300);
    await sleep(1500);
    await page.mouse.wheel(0, 300);
    await sleep(1500);
    await page.mouse.wheel(0, -600);
    await sleep(1000);

    // Try to click on a harvest item
    const harvestItem = page.locator('[data-testid="harvest-item"], .harvest-item, [class*="harvest"], .card').first();
    if (await harvestItem.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log('   Opening harvest details...');
      await harvestItem.click().catch(() => {});
      await sleep(3000);
      await dismissModal();
    }

    console.log('✅ Barn results viewed');
    await sleep(1500);

    // ============================================================
    // PHASE 7: Analytics Overview
    // ============================================================
    console.log('📈 PHASE 7: Analytics');

    await navigateTo('/analytics', 'Analytics');
    await sleep(2000);

    console.log('   Viewing analytics...');
    await page.mouse.wheel(0, 300);
    await sleep(1500);
    await page.mouse.wheel(0, -300);
    await sleep(1500);

    console.log('✅ Analytics viewed');
    await sleep(1500);

    // ============================================================
    // PHASE 8: Return to Dashboard
    // ============================================================
    console.log('🏡 PHASE 8: Return to Dashboard');

    await navigateTo('/home', 'Dashboard');
    await sleep(2000);

    // Final overview
    console.log('   Final dashboard view...');
    await page.mouse.wheel(0, 400);
    await sleep(2000);
    await page.mouse.wheel(0, -400);
    await sleep(2000);

    console.log('✅ Demo workflow complete!');

    // Final hold
    console.log('🎬 Holding for 5 seconds...');
    await sleep(5000);

  } catch (error) {
    console.error('❌ Demo error:', error);
    await sleep(3000);
  } finally {
    await browser.close();
    console.log('🎬 Browser closed. Demo finished!');
  }
}

runDemo().catch(console.error);
