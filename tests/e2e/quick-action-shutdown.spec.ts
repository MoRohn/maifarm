import { test, expect, Page } from '@playwright/test';

// Test configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:4567';

test.describe('Quick Action Graceful Shutdown E2E Tests', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto(BASE_URL);
    
    // Login if required (bypass in dev mode)
    if (process.env.BYPASS_AUTH !== 'true') {
      await page.fill('[data-testid="email-input"]', 'test@example.com');
      await page.fill('[data-testid="password-input"]', 'testpass');
      await page.click('[data-testid="login-button"]');
      await page.waitForNavigation();
    }
  });

  test.afterEach(async () => {
    await page.close();
  });

  test.describe('Quick Task Mode', () => {
    test('should create task and shutdown gracefully after 5 minutes', async () => {
      // Open Quick Task modal
      await page.click('[data-testid="quick-task-button"]');
      await expect(page.locator('[data-testid="quick-task-modal"]')).toBeVisible();
      
      // Fill in task details
      await page.fill('[data-testid="task-title"]', 'E2E Test Task');
      await page.fill('[data-testid="task-description"]', 'Testing graceful shutdown at 4:30');
      await page.selectOption('[data-testid="task-priority"]', 'high');
      
      // Submit task
      await page.click('[data-testid="create-task-button"]');
      
      // Wait for navigation to growing page
      await page.waitForURL(/\/farms\/quick-task-.*\/growing/);
      
      // Verify task is running
      await expect(page.locator('[data-testid="farm-status"]')).toHaveText('Running');
      
      // Fast-forward to 4:30 (30s before timeout) - using test time controls
      await page.evaluate(() => {
        // Simulate time passing (only works if app has test hooks)
        (window as any).__TEST_ADVANCE_TIME?.(270000); // 4.5 minutes
      });
      
      // Check for graceful shutdown indicator
      await expect(page.locator('[data-testid="shutdown-indicator"]')).toBeVisible();
      await expect(page.locator('[data-testid="shutdown-message"]')).toContainText('Collecting files...');
      
      // Wait for shutdown to complete (max 30s)
      await page.waitForSelector('[data-testid="harvest-ready"]', { timeout: 35000 });
      
      // Verify redirect to harvest page
      await expect(page).toHaveURL(/\/harvest\/.*/);
      
      // Verify files are available in harvest
      await expect(page.locator('[data-testid="harvest-files"]')).toBeVisible();
      await expect(page.locator('[data-testid="file-count"]')).not.toHaveText('0');
    });
    
    test('should handle manual shutdown before timeout', async () => {
      // Create quick task
      await page.click('[data-testid="quick-task-button"]');
      await page.fill('[data-testid="task-title"]', 'Manual Shutdown Test');
      await page.fill('[data-testid="task-description"]', 'Testing manual shutdown');
      await page.click('[data-testid="create-task-button"]');
      
      // Wait for task to start
      await page.waitForURL(/\/farms\/quick-task-.*\/growing/);
      await expect(page.locator('[data-testid="farm-status"]')).toHaveText('Running');
      
      // Click stop button
      await page.click('[data-testid="stop-farm-button"]');
      
      // Confirm shutdown
      await page.click('[data-testid="confirm-shutdown"]');
      
      // Verify graceful shutdown process
      await expect(page.locator('[data-testid="shutdown-indicator"]')).toBeVisible();
      
      // Wait for harvest
      await page.waitForSelector('[data-testid="harvest-ready"]', { timeout: 35000 });
      
      // Navigate to Barn
      await page.click('[data-testid="barn-nav-link"]');
      await page.waitForURL(/\/barn/);
      
      // Verify harvest appears in Barn
      await expect(page.locator('[data-testid="barn-item"]').first()).toContainText('Manual Shutdown Test');
    });
  });

  test.describe('Farm Mode', () => {
    test('should use custom timeout from settings', async () => {
      // Navigate to settings
      await page.click('[data-testid="settings-nav-link"]');
      await page.waitForURL(/\/settings/);
      
      // Set custom farm timeout (10 minutes)
      await page.click('[data-testid="agent-settings-tab"]');
      await page.fill('[data-testid="default-timeout-input"]', '600'); // 10 minutes in seconds
      await page.click('[data-testid="save-settings"]');
      
      // Create a new farm
      await page.click('[data-testid="create-farm-button"]');
      await page.fill('[data-testid="farm-name"]', 'Custom Timeout Farm');
      await page.fill('[data-testid="farm-description"]', 'Testing 10-minute timeout');
      await page.click('[data-testid="create-farm-submit"]');
      
      // Verify farm is created with correct timeout
      await page.waitForURL(/\/farms\/.*/);
      const farmConfig = await page.locator('[data-testid="farm-config"]').textContent();
      expect(farmConfig).toContain('Timeout: 10 minutes');
      
      // Verify shutdown is scheduled at 9:30 (30s before 10min)
      const shutdownTime = await page.locator('[data-testid="scheduled-shutdown"]').textContent();
      expect(shutdownTime).toContain('9:30');
    });
    
    test('should collect all agent outputs during shutdown', async () => {
      // Create multi-agent farm
      await page.click('[data-testid="create-farm-button"]');
      await page.fill('[data-testid="farm-name"]', 'Multi-Agent Farm');
      await page.fill('[data-testid="agent-count"]', '3');
      await page.click('[data-testid="create-farm-submit"]');
      
      // Wait for farm to start
      await page.waitForURL(/\/farms\/.*/);
      await expect(page.locator('[data-testid="agent-count"]')).toHaveText('3');
      
      // Trigger shutdown
      await page.click('[data-testid="stop-farm-button"]');
      await page.click('[data-testid="confirm-shutdown"]');
      
      // Wait for file collection
      await expect(page.locator('[data-testid="collecting-agent-1"]')).toBeVisible();
      await expect(page.locator('[data-testid="collecting-agent-2"]')).toBeVisible();
      await expect(page.locator('[data-testid="collecting-agent-3"]')).toBeVisible();
      
      // Verify all files collected
      await page.waitForSelector('[data-testid="harvest-ready"]');
      await page.click('[data-testid="view-harvest"]');
      
      // Check agent logs are present
      await expect(page.locator('[data-testid="agent-1-log"]')).toBeVisible();
      await expect(page.locator('[data-testid="agent-2-log"]')).toBeVisible();
      await expect(page.locator('[data-testid="agent-3-log"]')).toBeVisible();
    });
  });

  test.describe('GoWild Mode', () => {
    test('should shutdown after exploration duration', async () => {
      // Start GoWild session
      await page.click('[data-testid="gowild-button"]');
      
      // Configure exploration
      await page.fill('[data-testid="creativity-level"]', '85');
      await page.fill('[data-testid="exploration-duration"]', '15'); // 15 minutes
      await page.click('[data-testid="start-exploration"]');
      
      // Verify exploration started
      await expect(page.locator('[data-testid="exploration-status"]')).toHaveText('Exploring');
      
      // Fast-forward to 14:30 (30s before 15min timeout)
      await page.evaluate(() => {
        (window as any).__TEST_ADVANCE_TIME?.(870000); // 14.5 minutes
      });
      
      // Verify graceful shutdown started
      await expect(page.locator('[data-testid="exploration-status"]')).toHaveText('Harvesting');
      
      // Wait for discoveries to be collected
      await page.waitForSelector('[data-testid="discoveries-collected"]', { timeout: 35000 });
      
      // Verify discoveries in Barn
      await page.click('[data-testid="barn-nav-link"]');
      const discoveries = await page.locator('[data-testid="discovery-count"]').textContent();
      expect(parseInt(discoveries || '0')).toBeGreaterThan(0);
    });
  });

  test.describe('Barn Integration', () => {
    test('should make files accessible in Barn immediately after shutdown', async () => {
      // Create and complete a quick task
      await page.click('[data-testid="quick-task-button"]');
      await page.fill('[data-testid="task-title"]', 'Barn Test Task');
      await page.click('[data-testid="create-task-button"]');
      
      // Wait for task to start then stop it
      await page.waitForURL(/\/farms\/quick-task-.*/);
      await page.click('[data-testid="stop-farm-button"]');
      await page.click('[data-testid="confirm-shutdown"]');
      
      // Wait for shutdown to complete
      await page.waitForSelector('[data-testid="harvest-ready"]', { timeout: 35000 });
      
      // Navigate to Barn immediately
      await page.click('[data-testid="barn-nav-link"]');
      
      // Verify harvest is available
      await expect(page.locator('[data-testid="barn-item"]').first()).toBeVisible();
      
      // Click to view files
      await page.click('[data-testid="barn-item"]').first();
      await expect(page.locator('[data-testid="file-tree"]')).toBeVisible();
      
      // Verify file operations work
      await page.click('[data-testid="file-item"]').first();
      await expect(page.locator('[data-testid="file-content"]')).toBeVisible();
    });
    
    test('should handle concurrent shutdowns correctly', async () => {
      // Start multiple quick tasks
      const taskPromises = [];
      
      for (let i = 0; i < 3; i++) {
        taskPromises.push((async () => {
          const taskPage = await page.context().newPage();
          await taskPage.goto(BASE_URL);
          
          await taskPage.click('[data-testid="quick-task-button"]');
          await taskPage.fill('[data-testid="task-title"]', `Concurrent Task ${i + 1}`);
          await taskPage.click('[data-testid="create-task-button"]');
          
          return taskPage;
        })());
      }
      
      const taskPages = await Promise.all(taskPromises);
      
      // Stop all tasks simultaneously
      await Promise.all(taskPages.map(async (taskPage) => {
        await taskPage.click('[data-testid="stop-farm-button"]');
        await taskPage.click('[data-testid="confirm-shutdown"]');
      }));
      
      // Wait for all to complete
      await Promise.all(taskPages.map(async (taskPage) => {
        await taskPage.waitForSelector('[data-testid="harvest-ready"]', { timeout: 35000 });
        await taskPage.close();
      }));
      
      // Navigate to Barn and verify all harvests are present
      await page.click('[data-testid="barn-nav-link"]');
      
      for (let i = 0; i < 3; i++) {
        await expect(page.locator(`text=Concurrent Task ${i + 1}`)).toBeVisible();
      }
    });
  });

  test.describe('Error Recovery', () => {
    test('should recover from file collection failures', async () => {
      // Simulate network issues during shutdown
      await page.route('**/api/harvests/*/files', route => {
        // Fail first attempt, succeed on retry
        if (!route.request().headers()['x-retry']) {
          route.abort('failed');
        } else {
          route.continue();
        }
      });
      
      // Create and stop a task
      await page.click('[data-testid="quick-task-button"]');
      await page.fill('[data-testid="task-title"]', 'Error Recovery Test');
      await page.click('[data-testid="create-task-button"]');
      
      await page.waitForURL(/\/farms\/quick-task-.*/);
      await page.click('[data-testid="stop-farm-button"]');
      await page.click('[data-testid="confirm-shutdown"]');
      
      // Should retry and eventually succeed
      await expect(page.locator('[data-testid="retry-indicator"]')).toBeVisible();
      await page.waitForSelector('[data-testid="harvest-ready"]', { timeout: 45000 });
      
      // Verify files were eventually collected
      await page.click('[data-testid="view-harvest"]');
      await expect(page.locator('[data-testid="file-count"]')).not.toHaveText('0');
    });
  });
});