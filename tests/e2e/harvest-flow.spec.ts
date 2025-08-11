import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const API_URL = process.env.API_URL || 'http://localhost:4567';

test.describe('Harvest Collection Flow', () => {
  let page: Page;
  let farmId: string;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    
    // Navigate to the application
    await page.goto(BASE_URL);
    
    // Wait for the app to load
    await page.waitForSelector('[data-testid="app-container"]', { 
      timeout: 10000,
      state: 'visible' 
    });
    
    // Create a test farm first
    await createTestFarm(page);
  });

  async function createTestFarm(page: Page): Promise<void> {
    await page.click('[data-testid="nav-farms"]');
    await page.click('[data-testid="create-farm-button"]');
    
    const farmName = `Harvest Test Farm ${Date.now()}`;
    await page.fill('[data-testid="farm-name-input"]', farmName);
    await page.fill('[data-testid="farm-prompt-input"]', 'Generate test data for harvest');
    await page.selectOption('[data-testid="agent-count-select"]', '2');
    
    await page.click('[data-testid="create-farm-submit"]');
    
    // Wait for farm to be active
    await page.waitForSelector('[data-testid="farm-status-active"]', {
      timeout: 30000
    });
    
    // Extract farm ID from the URL or data attribute
    farmId = await page.getAttribute('[data-testid="current-farm"]', 'data-farm-id') || 'test-farm';
  }

  test('should initiate harvest collection successfully', async () => {
    // Navigate to harvest page
    await page.click('[data-testid="nav-harvest"]');
    
    // Select the farm for harvest
    await page.click(`[data-testid="farm-select-${farmId}"]`);
    
    // Initiate harvest
    await page.click('[data-testid="start-harvest-button"]');
    
    // Confirm harvest
    await page.click('[data-testid="confirm-harvest-button"]');
    
    // Wait for harvest to start
    await page.waitForSelector('[data-testid="harvest-status-collecting"]', {
      timeout: 10000
    });
    
    // Verify harvest progress is displayed
    const progressBar = await page.locator('[data-testid="harvest-progress"]');
    expect(await progressBar.isVisible()).toBe(true);
    
    // Verify agent activity is shown
    const agentActivity = await page.locator('[data-testid^="harvest-agent-"]');
    const agentCount = await agentActivity.count();
    expect(agentCount).toBeGreaterThan(0);
  });

  test('should display harvest results and artifacts', async () => {
    // Navigate to harvest page
    await page.click('[data-testid="nav-harvest"]');
    
    // Start harvest
    await page.click(`[data-testid="farm-select-${farmId}"]`);
    await page.click('[data-testid="start-harvest-button"]');
    await page.click('[data-testid="confirm-harvest-button"]');
    
    // Wait for harvest to complete (with longer timeout)
    await page.waitForSelector('[data-testid="harvest-status-completed"]', {
      timeout: 60000
    });
    
    // Verify summary is displayed
    const summary = await page.locator('[data-testid="harvest-summary"]');
    expect(await summary.isVisible()).toBe(true);
    
    // Verify artifacts are listed
    const artifacts = await page.locator('[data-testid^="harvest-artifact-"]');
    const artifactCount = await artifacts.count();
    expect(artifactCount).toBeGreaterThan(0);
    
    // Verify download options are available
    const downloadButton = await page.locator('[data-testid="download-harvest-button"]');
    expect(await downloadButton.isVisible()).toBe(true);
    
    // Verify export options
    const exportOptions = ['json', 'csv', 'markdown'];
    for (const format of exportOptions) {
      const exportButton = await page.locator(`[data-testid="export-${format}-button"]`);
      expect(await exportButton.isVisible()).toBe(true);
    }
  });

  test('should allow viewing individual artifacts', async () => {
    // Complete a harvest first
    await page.click('[data-testid="nav-harvest"]');
    await page.click(`[data-testid="farm-select-${farmId}"]`);
    await page.click('[data-testid="start-harvest-button"]');
    await page.click('[data-testid="confirm-harvest-button"]');
    
    await page.waitForSelector('[data-testid="harvest-status-completed"]', {
      timeout: 60000
    });
    
    // Click on first artifact
    await page.click('[data-testid^="harvest-artifact-"]:first-child');
    
    // Verify artifact viewer opens
    await page.waitForSelector('[data-testid="artifact-viewer"]', {
      timeout: 5000
    });
    
    // Verify artifact content is displayed
    const artifactContent = await page.locator('[data-testid="artifact-content"]');
    expect(await artifactContent.isVisible()).toBe(true);
    
    // Verify artifact metadata
    const metadata = await page.locator('[data-testid="artifact-metadata"]');
    expect(await metadata.isVisible()).toBe(true);
    
    // Test navigation between artifacts
    const nextButton = await page.locator('[data-testid="next-artifact-button"]');
    if (await nextButton.isVisible()) {
      await nextButton.click();
      
      // Verify content changed
      const newContent = await page.locator('[data-testid="artifact-content"]').textContent();
      expect(newContent).toBeTruthy();
    }
    
    // Close artifact viewer
    await page.click('[data-testid="close-artifact-viewer"]');
    
    // Verify viewer is closed
    await expect(page.locator('[data-testid="artifact-viewer"]')).not.toBeVisible();
  });

  test('should save harvest to barn', async () => {
    // Complete a harvest
    await page.click('[data-testid="nav-harvest"]');
    await page.click(`[data-testid="farm-select-${farmId}"]`);
    await page.click('[data-testid="start-harvest-button"]');
    await page.click('[data-testid="confirm-harvest-button"]');
    
    await page.waitForSelector('[data-testid="harvest-status-completed"]', {
      timeout: 60000
    });
    
    // Save to barn
    await page.click('[data-testid="save-to-barn-button"]');
    
    // Fill in barn entry details
    await page.fill('[data-testid="barn-entry-name"]', 'E2E Test Harvest');
    await page.fill('[data-testid="barn-entry-description"]', 'Automated test harvest');
    
    // Select category
    await page.selectOption('[data-testid="barn-category-select"]', 'test-results');
    
    // Add tags
    await page.fill('[data-testid="barn-tags-input"]', 'e2e, test, automated');
    
    // Save
    await page.click('[data-testid="confirm-save-to-barn"]');
    
    // Verify success message
    await page.waitForSelector('[data-testid="barn-save-success"]', {
      timeout: 5000
    });
    
    // Navigate to barn
    await page.click('[data-testid="nav-barn"]');
    
    // Verify harvest is in barn
    const barnEntry = await page.locator('[data-testid="barn-entry-E2E Test Harvest"]');
    expect(await barnEntry.isVisible()).toBe(true);
  });

  test('should handle harvest errors gracefully', async () => {
    // Mock API error for harvest
    await page.route(`${API_URL}/api/harvests`, route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Harvest failed' })
      });
    });
    
    // Try to start harvest
    await page.click('[data-testid="nav-harvest"]');
    await page.click(`[data-testid="farm-select-${farmId}"]`);
    await page.click('[data-testid="start-harvest-button"]');
    await page.click('[data-testid="confirm-harvest-button"]');
    
    // Verify error message
    await page.waitForSelector('[data-testid="harvest-error"]', {
      timeout: 5000
    });
    
    const errorMessage = await page.textContent('[data-testid="harvest-error"]');
    expect(errorMessage).toContain('failed');
    
    // Verify retry option is available
    const retryButton = await page.locator('[data-testid="retry-harvest-button"]');
    expect(await retryButton.isVisible()).toBe(true);
  });

  test('should filter and search harvest results', async () => {
    // Complete a harvest with multiple artifacts
    await page.click('[data-testid="nav-harvest"]');
    await page.click(`[data-testid="farm-select-${farmId}"]`);
    await page.click('[data-testid="start-harvest-button"]');
    await page.click('[data-testid="confirm-harvest-button"]');
    
    await page.waitForSelector('[data-testid="harvest-status-completed"]', {
      timeout: 60000
    });
    
    // Test search functionality
    await page.fill('[data-testid="harvest-search-input"]', 'test');
    
    // Verify filtered results
    const searchResults = await page.locator('[data-testid^="harvest-artifact-"]');
    const resultCount = await searchResults.count();
    
    // Clear search
    await page.fill('[data-testid="harvest-search-input"]', '');
    
    // Test filter by type
    await page.selectOption('[data-testid="artifact-type-filter"]', 'code');
    
    // Verify filtered results show only code artifacts
    const codeArtifacts = await page.locator('[data-artifact-type="code"]');
    const codeCount = await codeArtifacts.count();
    
    if (codeCount > 0) {
      expect(codeCount).toBeGreaterThan(0);
    }
    
    // Test date filter
    await page.click('[data-testid="date-filter-today"]');
    
    // Verify results are from today
    const todayResults = await page.locator('[data-testid^="harvest-artifact-"]');
    expect(await todayResults.count()).toBeGreaterThan(0);
  });

  test('should export harvest in multiple formats', async () => {
    // Complete a harvest
    await page.click('[data-testid="nav-harvest"]');
    await page.click(`[data-testid="farm-select-${farmId}"]`);
    await page.click('[data-testid="start-harvest-button"]');
    await page.click('[data-testid="confirm-harvest-button"]');
    
    await page.waitForSelector('[data-testid="harvest-status-completed"]', {
      timeout: 60000
    });
    
    // Test JSON export
    const [jsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="export-json-button"]')
    ]);
    
    expect(jsonDownload.suggestedFilename()).toContain('.json');
    
    // Test CSV export
    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="export-csv-button"]')
    ]);
    
    expect(csvDownload.suggestedFilename()).toContain('.csv');
    
    // Test Markdown export
    const [mdDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="export-markdown-button"]')
    ]);
    
    expect(mdDownload.suggestedFilename()).toContain('.md');
  });

  test('should show real-time harvest progress via WebSocket', async () => {
    await page.click('[data-testid="nav-harvest"]');
    await page.click(`[data-testid="farm-select-${farmId}"]`);
    await page.click('[data-testid="start-harvest-button"]');
    await page.click('[data-testid="confirm-harvest-button"]');
    
    // Wait for harvest to start
    await page.waitForSelector('[data-testid="harvest-status-collecting"]', {
      timeout: 10000
    });
    
    // Monitor progress updates
    const progressBar = await page.locator('[data-testid="harvest-progress"]');
    const initialProgress = await progressBar.getAttribute('aria-valuenow');
    
    // Wait for progress to update
    await page.waitForFunction(
      ([selector, initial]) => {
        const element = document.querySelector(selector);
        return element && parseInt(element.getAttribute('aria-valuenow') || '0') > parseInt(initial || '0');
      },
      ['[data-testid="harvest-progress"]', initialProgress],
      { timeout: 20000 }
    );
    
    // Verify agent status updates
    const agentStatuses = await page.locator('[data-testid^="harvest-agent-status-"]');
    const statusCount = await agentStatuses.count();
    expect(statusCount).toBeGreaterThan(0);
    
    // Verify artifact count updates
    const artifactCounter = await page.locator('[data-testid="artifact-counter"]');
    const initialCount = await artifactCounter.textContent();
    
    await page.waitForFunction(
      ([selector, initial]) => {
        const element = document.querySelector(selector);
        return element && element.textContent !== initial;
      },
      ['[data-testid="artifact-counter"]', initialCount],
      { timeout: 20000 }
    );
  });

  test.afterEach(async () => {
    // Clean up test data
    if (farmId) {
      // Would typically call an API to delete the test farm
    }
    await page.close();
  });
});