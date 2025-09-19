import { test, expect, Page, BrowserContext } from '@playwright/test';
import { phase4Config, testPhases } from '../config/phase4.config';
import path from 'path';
import fs from 'fs/promises';

// Test state tracking
const testState = {
  farmId: null as string | null,
  harvestId: null as string | null,
  agentIds: [] as string[],
  startTime: 0,
  errors: [] as any[],
  warnings: [] as any[],
  screenshots: [] as string[],
  logs: [] as string[],
  metrics: {
    farmCreationTime: 0,
    agentLaunchTime: 0,
    taskExecutionTime: 0,
    harvestTime: 0,
    totalTime: 0,
  },
};

test.describe('Phase 4: Complete MaiFarm Workflow Validation', () => {
  let page: Page;
  let context: BrowserContext;

  test.beforeAll(async () => {
    console.log('🚀 Phase 4 Testing Starting...');
    console.log('📋 Test Configuration:', phase4Config.testData);
    
    // Ensure directories exist
    await fs.mkdir(phase4Config.recording.videoDir, { recursive: true });
    await fs.mkdir(phase4Config.recording.screenshotDir, { recursive: true });
    await fs.mkdir(phase4Config.recording.logDir, { recursive: true });
    await fs.mkdir(phase4Config.recording.reportDir, { recursive: true });
    
    testState.startTime = Date.now();
  });

  test.beforeEach(async ({ browser }) => {
    // Create context with video recording
    context = await browser.newContext({
      recordVideo: phase4Config.recording.enabled ? {
        dir: phase4Config.recording.videoDir,
        size: { width: 1920, height: 1080 },
      } : undefined,
      viewport: { width: 1920, height: 1080 },
    });

    page = await context.newPage();

    // Setup console logging
    if (phase4Config.recording.captureConsole) {
      page.on('console', msg => {
        const text = msg.text();
        testState.logs.push(`[Console ${msg.type()}] ${text}`);
        
        // Check for errors
        if (msg.type() === 'error') {
          testState.errors.push({ type: 'console', message: text, timestamp: Date.now() });
        }
      });
    }

    // Setup request/response logging
    if (phase4Config.recording.captureNetwork) {
      page.on('requestfailed', request => {
        testState.errors.push({
          type: 'network',
          url: request.url(),
          failure: request.failure(),
          timestamp: Date.now(),
        });
      });
    }
  });

  test('Complete Farm Creation to Barn Storage Workflow', async () => {
    console.log('\n════════════════════════════════════════════');
    console.log('   PHASE 4: END-TO-END VALIDATION TEST');
    console.log('════════════════════════════════════════════\n');

    try {
      // Phase 1: Setup and Health Checks
      await runPhase('Setup', async () => {
        console.log('🏥 Running health checks...');
        
        // Check backend
        const backendHealth = await fetch(phase4Config.healthChecks.backend.url);
        expect(backendHealth.status).toBe(200);
        console.log('✅ Backend is healthy');

        // Navigate to frontend
        await page.goto(phase4Config.environment.baseUrl);
        await page.waitForLoadState('networkidle');
        console.log('✅ Frontend loaded');

        await captureScreenshot(page, 'setup-complete');
      });

      // Phase 2: Farm Creation via Quick Action
      await runPhase('Farm Creation', async () => {
        const farmCreationStart = Date.now();
        
        console.log('🚜 Creating farm via Quick Action...');
        
        // Click on New Farm quick action
        await page.waitForSelector('[data-testid="quick-action-new-farm"]', { timeout: 10000 });
        await page.click('[data-testid="quick-action-new-farm"]');
        console.log('  → Clicked New Farm quick action');

        // Wait for farm creator modal
        await page.waitForSelector('[data-testid="farm-creator-modal"]', { timeout: 5000 });
        await captureScreenshot(page, 'farm-creator-opened');

        // Fill in farm details
        await page.fill('[data-testid="farm-name-input"]', phase4Config.testData.farmName);
        await page.fill('[data-testid="farm-description-input"]', phase4Config.testData.farmDescription);
        
        // Set agent count
        await page.selectOption('[data-testid="agent-count-select"]', phase4Config.testData.agentCount.toString());
        
        // Set provider
        await page.selectOption('[data-testid="provider-select"]', phase4Config.testData.provider);
        
        // Add task prompt
        await page.fill('[data-testid="task-prompt-input"]', phase4Config.testData.taskPrompt);
        
        await captureScreenshot(page, 'farm-details-filled');
        console.log('  → Filled farm creation form');

        // Submit farm creation
        await page.click('[data-testid="create-farm-button"]');
        console.log('  → Submitted farm creation');

        // Wait for farm to be created and get ID
        await page.waitForSelector('[data-testid="farm-status-launching"]', { timeout: 15000 });
        
        // Extract farm ID from URL or page
        const farmUrl = page.url();
        const farmIdMatch = farmUrl.match(/farms\/([a-f0-9-]+)/);
        if (farmIdMatch) {
          testState.farmId = farmIdMatch[1];
          console.log(`  → Farm created with ID: ${testState.farmId}`);
        }

        testState.metrics.farmCreationTime = Date.now() - farmCreationStart;
        console.log(`✅ Farm created in ${testState.metrics.farmCreationTime}ms`);
        
        await captureScreenshot(page, 'farm-created');
        phase4Config.successCriteria.farmCreated = true;
      });

      // Phase 3: Agent Launch and Monitoring
      await runPhase('Agent Launch', async () => {
        const agentLaunchStart = Date.now();
        
        console.log('🤖 Launching and monitoring agents...');
        
        // Wait for agents to become active
        await page.waitForSelector('[data-testid="agent-status-active"]', { timeout: 30000 });
        console.log('  → Agents are launching');

        // Count active agents
        const activeAgents = await page.$$('[data-testid="agent-status-active"]');
        expect(activeAgents.length).toBe(phase4Config.testData.agentCount);
        console.log(`  → ${activeAgents.length} agents active`);

        // Navigate to Harvest/Terminal view
        await page.click('[data-testid="view-harvest-button"]');
        await page.waitForSelector('[data-testid="harvest-terminal"]', { timeout: 10000 });
        console.log('  → Navigated to Harvest Terminal');

        await captureScreenshot(page, 'harvest-terminal-view');

        // Check for terminal output
        await page.waitForSelector('[data-testid="terminal-output"]', { timeout: 15000 });
        const terminalOutputs = await page.$$('[data-testid="terminal-output"]');
        expect(terminalOutputs.length).toBeGreaterThan(0);
        console.log(`  → Terminal output visible for ${terminalOutputs.length} agents`);

        testState.metrics.agentLaunchTime = Date.now() - agentLaunchStart;
        console.log(`✅ Agents launched in ${testState.metrics.agentLaunchTime}ms`);
        
        phase4Config.successCriteria.agentsLaunched = true;
        phase4Config.successCriteria.terminalOutputReceived = true;
      });

      // Phase 4: Task Execution Monitoring
      await runPhase('Task Execution', async () => {
        const taskExecutionStart = Date.now();
        
        console.log('⚙️ Monitoring task execution...');
        
        // Monitor terminal output for task completion
        let taskCompleted = false;
        let attempts = 0;
        const maxAttempts = 60; // 60 seconds

        while (!taskCompleted && attempts < maxAttempts) {
          // Check for completion indicators in terminal
          const terminalContent = await page.textContent('[data-testid="terminal-output"]');
          
          if (terminalContent?.includes('print("Hello, World!")') || 
              terminalContent?.includes('Task completed') ||
              terminalContent?.includes('Success')) {
            taskCompleted = true;
            console.log('  → Task execution detected in terminal');
            break;
          }

          // Check farm status
          const farmStatus = await page.getAttribute('[data-testid="farm-status"]', 'data-status');
          if (farmStatus === 'completed') {
            taskCompleted = true;
            console.log('  → Farm status: completed');
            break;
          }

          await page.waitForTimeout(1000);
          attempts++;
          
          if (attempts % 10 === 0) {
            console.log(`  → Monitoring... (${attempts}s elapsed)`);
            await captureScreenshot(page, `task-execution-${attempts}s`);
          }
        }

        expect(taskCompleted).toBe(true);
        
        testState.metrics.taskExecutionTime = Date.now() - taskExecutionStart;
        console.log(`✅ Task executed in ${testState.metrics.taskExecutionTime}ms`);
      });

      // Phase 5: Harvest Collection
      await runPhase('Harvest Collection', async () => {
        const harvestStart = Date.now();
        
        console.log('🌾 Collecting harvest...');
        
        // Trigger harvest if not automatic
        const harvestButton = await page.$('[data-testid="collect-harvest-button"]');
        if (harvestButton) {
          await harvestButton.click();
          console.log('  → Triggered harvest collection');
        }

        // Wait for harvest completion
        await page.waitForSelector('[data-testid="harvest-status-completed"]', { timeout: 30000 });
        console.log('  → Harvest completed');

        // Get harvest ID
        const harvestIdElement = await page.$('[data-testid="harvest-id"]');
        if (harvestIdElement) {
          testState.harvestId = await harvestIdElement.textContent() || null;
          console.log(`  → Harvest ID: ${testState.harvestId}`);
        }

        await captureScreenshot(page, 'harvest-completed');

        testState.metrics.harvestTime = Date.now() - harvestStart;
        console.log(`✅ Harvest collected in ${testState.metrics.harvestTime}ms`);
        
        phase4Config.successCriteria.harvestCompleted = true;
      });

      // Phase 6: Barn Storage Validation
      await runPhase('Barn Validation', async () => {
        console.log('🏚️ Validating barn storage...');
        
        // Navigate to Barn
        await page.click('[data-testid="nav-barn"]');
        await page.waitForSelector('[data-testid="barn-page"]', { timeout: 10000 });
        console.log('  → Navigated to Barn');

        // Check for harvest items
        await page.waitForSelector('[data-testid="barn-item"]', { timeout: 15000 });
        const barnItems = await page.$$('[data-testid="barn-item"]');
        expect(barnItems.length).toBeGreaterThan(0);
        console.log(`  → Found ${barnItems.length} items in barn`);

        // Verify our harvest is present
        if (testState.harvestId) {
          const ourHarvest = await page.$(`[data-testid="barn-item-${testState.harvestId}"]`);
          expect(ourHarvest).toBeTruthy();
          console.log('  → Our harvest is in the barn');
        }

        await captureScreenshot(page, 'barn-items-verified');

        console.log('✅ Barn storage validated');
        phase4Config.successCriteria.barnItemsCreated = true;
      });

      // Final validation
      phase4Config.successCriteria.noErrors = testState.errors.length === 0;
      testState.metrics.totalTime = Date.now() - testState.startTime;

      console.log('\n════════════════════════════════════════════');
      console.log('         TEST COMPLETED SUCCESSFULLY!');
      console.log('════════════════════════════════════════════');
      console.log('\n📊 Final Metrics:');
      console.log(`  • Farm Creation: ${testState.metrics.farmCreationTime}ms`);
      console.log(`  • Agent Launch: ${testState.metrics.agentLaunchTime}ms`);
      console.log(`  • Task Execution: ${testState.metrics.taskExecutionTime}ms`);
      console.log(`  • Harvest Collection: ${testState.metrics.harvestTime}ms`);
      console.log(`  • Total Time: ${testState.metrics.totalTime}ms`);
      console.log('\n✅ Success Criteria:');
      Object.entries(phase4Config.successCriteria).forEach(([key, value]) => {
        if (typeof value === 'boolean') {
          console.log(`  • ${key}: ${value ? '✅' : '❌'}`);
        }
      });

    } catch (error) {
      console.error('\n❌ Test failed:', error);
      await captureScreenshot(page, 'test-failed');
      throw error;
    }
  });

  test.afterEach(async () => {
    // Save video if available
    if (context) {
      await context.close();
    }

    // Generate test report
    await generateReport();
  });

  test.afterAll(async () => {
    console.log('\n🏁 Phase 4 Testing Complete');
    console.log(`  Total errors: ${testState.errors.length}`);
    console.log(`  Total warnings: ${testState.warnings.length}`);
    console.log(`  Screenshots taken: ${testState.screenshots.length}`);
  });
});

// Helper Functions

async function runPhase(phaseName: string, fn: () => Promise<void>) {
  console.log(`\n▶️  ${phaseName} Phase`);
  console.log('─'.repeat(40));
  const startTime = Date.now();
  
  try {
    await fn();
    const duration = Date.now() - startTime;
    console.log(`✅ ${phaseName} completed in ${duration}ms`);
  } catch (error) {
    console.error(`❌ ${phaseName} failed:`, error);
    throw error;
  }
}

async function captureScreenshot(page: Page, name: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}-${name}.png`;
  const filepath = path.join(phase4Config.recording.screenshotDir, filename);
  
  await page.screenshot({ path: filepath, fullPage: true });
  testState.screenshots.push(filepath);
  console.log(`  📸 Screenshot: ${name}`);
  
  return filepath;
}

async function generateReport() {
  const report = {
    timestamp: new Date().toISOString(),
    duration: testState.metrics.totalTime,
    success: phase4Config.successCriteria.noErrors,
    metrics: testState.metrics,
    criteria: phase4Config.successCriteria,
    errors: testState.errors,
    warnings: testState.warnings,
    screenshots: testState.screenshots,
    logs: testState.logs.slice(-100), // Last 100 log entries
  };

  const reportPath = path.join(
    phase4Config.recording.reportDir,
    `phase4-report-${Date.now()}.json`
  );
  
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report generated: ${reportPath}`);
}