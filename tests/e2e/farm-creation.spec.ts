import { test, expect, Page } from '@playwright/test';

// Test configuration
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const API_URL = process.env.API_URL || 'http://localhost:4567';

test.describe('Farm Creation Flow', () => {
  let page: Page;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    
    // Navigate to the application
    await page.goto(BASE_URL);
    
    // Wait for the app to load
    await page.waitForSelector('[data-testid="app-container"]', { 
      timeout: 10000,
      state: 'visible' 
    });
  });

  test('should create a farm with multiple agents successfully', async () => {
    // Navigate to farm creation page
    await page.click('[data-testid="nav-farms"]');
    await page.click('[data-testid="create-farm-button"]');
    
    // Fill in farm details
    await page.fill('[data-testid="farm-name-input"]', 'E2E Test Farm');
    await page.fill('[data-testid="farm-prompt-input"]', 'Test prompt for automated E2E testing');
    
    // Select number of agents
    await page.selectOption('[data-testid="agent-count-select"]', '3');
    
    // Select provider
    await page.selectOption('[data-testid="provider-select"]', 'claude');
    
    // Submit form
    await page.click('[data-testid="create-farm-submit"]');
    
    // Wait for farm creation to complete
    await page.waitForSelector('[data-testid="farm-status-active"]', {
      timeout: 30000
    });
    
    // Verify farm was created
    const farmName = await page.textContent('[data-testid="farm-name"]');
    expect(farmName).toContain('E2E Test Farm');
    
    // Verify agents are active
    const agentCount = await page.locator('[data-testid^="agent-status-active"]').count();
    expect(agentCount).toBe(3);
    
    // Verify WebSocket connection
    const wsStatus = await page.textContent('[data-testid="websocket-status"]');
    expect(wsStatus).toContain('Connected');
  });

  test('should handle farm creation errors gracefully', async () => {
    // Mock API error
    await page.route(`${API_URL}/api/farms`, route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server error' })
      });
    });
    
    // Try to create a farm
    await page.click('[data-testid="nav-farms"]');
    await page.click('[data-testid="create-farm-button"]');
    
    await page.fill('[data-testid="farm-name-input"]', 'Error Test Farm');
    await page.fill('[data-testid="farm-prompt-input"]', 'This should fail');
    await page.click('[data-testid="create-farm-submit"]');
    
    // Verify error message is displayed
    const errorMessage = await page.waitForSelector('[data-testid="error-message"]', {
      timeout: 5000
    });
    expect(await errorMessage.textContent()).toContain('Failed to create farm');
    
    // Verify retry button is available
    const retryButton = await page.locator('[data-testid="retry-button"]');
    expect(await retryButton.isVisible()).toBe(true);
  });

  test('should validate farm creation inputs', async () => {
    await page.click('[data-testid="nav-farms"]');
    await page.click('[data-testid="create-farm-button"]');
    
    // Try to submit without filling required fields
    await page.click('[data-testid="create-farm-submit"]');
    
    // Check for validation errors
    const nameError = await page.locator('[data-testid="farm-name-error"]');
    expect(await nameError.isVisible()).toBe(true);
    expect(await nameError.textContent()).toContain('Farm name is required');
    
    const promptError = await page.locator('[data-testid="farm-prompt-error"]');
    expect(await promptError.isVisible()).toBe(true);
    expect(await promptError.textContent()).toContain('Prompt is required');
    
    // Fill in invalid data
    await page.fill('[data-testid="farm-name-input"]', 'a'); // Too short
    await page.fill('[data-testid="agent-count-input"]', '0'); // Invalid count
    
    await page.click('[data-testid="create-farm-submit"]');
    
    // Check for specific validation errors
    const nameMinError = await page.locator('[data-testid="farm-name-error"]');
    expect(await nameMinError.textContent()).toContain('at least 3 characters');
    
    const agentError = await page.locator('[data-testid="agent-count-error"]');
    expect(await agentError.textContent()).toContain('at least 1 agent');
  });

  test('should update farm status in real-time via WebSocket', async () => {
    // Create a farm
    await page.click('[data-testid="nav-farms"]');
    await page.click('[data-testid="create-farm-button"]');
    
    await page.fill('[data-testid="farm-name-input"]', 'WebSocket Test Farm');
    await page.fill('[data-testid="farm-prompt-input"]', 'Testing WebSocket updates');
    await page.selectOption('[data-testid="agent-count-select"]', '2');
    
    await page.click('[data-testid="create-farm-submit"]');
    
    // Wait for initial status
    await page.waitForSelector('[data-testid="farm-status-pending"]', {
      timeout: 5000
    });
    
    // Verify status updates to active
    await page.waitForSelector('[data-testid="farm-status-active"]', {
      timeout: 30000
    });
    
    // Verify progress updates
    const progressBar = await page.locator('[data-testid="farm-progress"]');
    const initialProgress = await progressBar.getAttribute('aria-valuenow');
    
    // Wait for progress to update
    await page.waitForFunction(
      ([selector, initial]) => {
        const element = document.querySelector(selector);
        return element && element.getAttribute('aria-valuenow') !== initial;
      },
      ['[data-testid="farm-progress"]', initialProgress],
      { timeout: 10000 }
    );
    
    const updatedProgress = await progressBar.getAttribute('aria-valuenow');
    expect(Number(updatedProgress)).toBeGreaterThan(Number(initialProgress));
  });

  test('should handle multiple farm creations concurrently', async () => {
    await page.click('[data-testid="nav-farms"]');
    
    // Create first farm
    await page.click('[data-testid="create-farm-button"]');
    await page.fill('[data-testid="farm-name-input"]', 'Concurrent Farm 1');
    await page.fill('[data-testid="farm-prompt-input"]', 'First concurrent test');
    await page.selectOption('[data-testid="agent-count-select"]', '2');
    await page.click('[data-testid="create-farm-submit"]');
    
    // Immediately create second farm
    await page.click('[data-testid="create-farm-button"]');
    await page.fill('[data-testid="farm-name-input"]', 'Concurrent Farm 2');
    await page.fill('[data-testid="farm-prompt-input"]', 'Second concurrent test');
    await page.selectOption('[data-testid="agent-count-select"]', '2');
    await page.click('[data-testid="create-farm-submit"]');
    
    // Verify both farms are created
    await page.waitForSelector('[data-testid="farm-card-Concurrent Farm 1"]', {
      timeout: 30000
    });
    await page.waitForSelector('[data-testid="farm-card-Concurrent Farm 2"]', {
      timeout: 30000
    });
    
    // Verify both farms have active status
    const farm1Status = await page.locator('[data-testid="farm-card-Concurrent Farm 1"] [data-testid="farm-status"]').textContent();
    const farm2Status = await page.locator('[data-testid="farm-card-Concurrent Farm 2"] [data-testid="farm-status"]').textContent();
    
    expect(['active', 'pending', 'completed']).toContain(farm1Status?.toLowerCase());
    expect(['active', 'pending', 'completed']).toContain(farm2Status?.toLowerCase());
  });

  test('should allow canceling farm creation', async () => {
    await page.click('[data-testid="nav-farms"]');
    await page.click('[data-testid="create-farm-button"]');
    
    await page.fill('[data-testid="farm-name-input"]', 'Cancel Test Farm');
    await page.fill('[data-testid="farm-prompt-input"]', 'This will be canceled');
    await page.selectOption('[data-testid="agent-count-select"]', '5');
    
    await page.click('[data-testid="create-farm-submit"]');
    
    // Wait for farm to start creating
    await page.waitForSelector('[data-testid="farm-status-pending"]', {
      timeout: 5000
    });
    
    // Cancel the creation
    await page.click('[data-testid="cancel-farm-button"]');
    
    // Confirm cancellation
    await page.click('[data-testid="confirm-cancel-button"]');
    
    // Verify farm is canceled
    await page.waitForSelector('[data-testid="farm-status-canceled"]', {
      timeout: 10000
    });
    
    const statusText = await page.textContent('[data-testid="farm-status"]');
    expect(statusText).toContain('Canceled');
  });

  test('should persist farm data after page refresh', async () => {
    // Create a farm
    await page.click('[data-testid="nav-farms"]');
    await page.click('[data-testid="create-farm-button"]');
    
    const farmName = `Persist Test Farm ${Date.now()}`;
    await page.fill('[data-testid="farm-name-input"]', farmName);
    await page.fill('[data-testid="farm-prompt-input"]', 'Testing persistence');
    await page.selectOption('[data-testid="agent-count-select"]', '1');
    
    await page.click('[data-testid="create-farm-submit"]');
    
    // Wait for farm to be created
    await page.waitForSelector(`[data-testid="farm-card-${farmName}"]`, {
      timeout: 30000
    });
    
    // Refresh the page
    await page.reload();
    
    // Wait for app to reload
    await page.waitForSelector('[data-testid="app-container"]', {
      timeout: 10000
    });
    
    // Navigate back to farms
    await page.click('[data-testid="nav-farms"]');
    
    // Verify farm still exists
    const farmCard = await page.locator(`[data-testid="farm-card-${farmName}"]`);
    expect(await farmCard.isVisible()).toBe(true);
    
    // Verify farm details are preserved
    const displayedName = await farmCard.locator('[data-testid="farm-name"]').textContent();
    expect(displayedName).toContain(farmName);
  });

  test.afterEach(async () => {
    // Clean up any created farms if needed
    // This would typically call an API to delete test farms
    await page.close();
  });
});