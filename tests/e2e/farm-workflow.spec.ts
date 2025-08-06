import { test, expect } from '@playwright/test';

test.describe('Farm Creation Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
  });

  test('should create a new farm through Quick Actions', async ({ page }) => {
    // Click on New Farm quick action
    await page.click('text=New Farm');
    
    // Wait for farm creation modal
    await expect(page.locator('text=Create New Farm')).toBeVisible();
    
    // Fill in farm details
    await page.fill('input[placeholder="My Awesome Farm"]', 'E2E Test Farm');
    await page.fill('textarea[placeholder="Describe what this farm will do..."]', 'This is an automated test farm');
    
    // Select farm type
    await page.click('text=Collaborative');
    
    // Click Next
    await page.click('button:has-text("Next")');
    
    // Skip seeds section
    await page.click('text=Skip to manual YAML');
    
    // Enter YAML configuration
    const yamlEditor = page.locator('.yaml-editor');
    await yamlEditor.fill(`agents:
  - name: Test Agent 1
    type: builder
    capabilities: [testing]
  - name: Test Agent 2
    type: builder
    capabilities: [automation]`);
    
    // Click Next through remaining steps
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    
    // Review and create
    await expect(page.locator('text=Review Your Farm')).toBeVisible();
    await page.click('button:has-text("Create Farm")');
    
    // Verify farm was created
    await expect(page.locator('text=E2E Test Farm')).toBeVisible({ timeout: 10000 });
  });

  test('should start Go Wild mode for a farm', async ({ page }) => {
    // Assuming a farm already exists
    // Click on Go Wild quick action
    await page.click('text=Go Wild');
    
    // Wait for Go Wild modal
    await expect(page.locator('text=Go Wild Configuration')).toBeVisible();
    
    // Set creativity level
    const creativitySlider = page.locator('input[type="range"]');
    await creativitySlider.fill('4');
    
    // Set boundaries
    await page.fill('input[placeholder="Add boundary..."]', 'Stay within project scope');
    await page.keyboard.press('Enter');
    
    // Start exploration
    await page.click('button:has-text("Start Exploration")');
    
    // Verify Go Wild started
    await expect(page.locator('text=Exploration in progress')).toBeVisible({ timeout: 10000 });
  });

  test('should create a quick task', async ({ page }) => {
    // Click on Quick Task action
    await page.click('text=Quick Task');
    
    // Wait for Quick Task modal
    await expect(page.locator('text=Quick Task')).toBeVisible();
    
    // Fill in task details
    await page.fill('input[placeholder="Task description"]', 'Test quick task execution');
    
    // Submit task
    await page.click('button:has-text("Execute")');
    
    // Verify task started
    await expect(page.locator('text=Task executing')).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to farm details and manage agents', async ({ page }) => {
    // Click on a farm card (assuming one exists)
    const farmCard = page.locator('.farm-card').first();
    await farmCard.click();
    
    // Verify farm details page
    await expect(page.locator('text=Farm Details')).toBeVisible();
    
    // Check agents section
    await expect(page.locator('text=Agents')).toBeVisible();
    
    // Start the farm
    await page.click('button:has-text("Start Farm")');
    
    // Verify farm is running
    await expect(page.locator('text=Running')).toBeVisible({ timeout: 5000 });
    
    // Pause the farm
    await page.click('button:has-text("Pause Farm")');
    
    // Verify farm is paused
    await expect(page.locator('text=Paused')).toBeVisible({ timeout: 5000 });
  });

  test('should monitor real-time metrics', async ({ page }) => {
    // Navigate to monitoring section
    await page.click('text=Monitoring');
    
    // Verify metrics are displayed
    await expect(page.locator('text=Active Farms')).toBeVisible();
    await expect(page.locator('text=Total Agents')).toBeVisible();
    await expect(page.locator('text=Tasks Completed')).toBeVisible();
    
    // Check for real-time updates (metrics should change)
    const tasksCompleted = await page.locator('[data-testid="tasks-completed"]').textContent();
    
    // Wait for potential update
    await page.waitForTimeout(5000);
    
    // Verify metrics might have changed (depending on activity)
    const newTasksCompleted = await page.locator('[data-testid="tasks-completed"]').textContent();
    // Note: In a real test, we'd trigger an action that guarantees a metric change
  });
});

test.describe('Farm Creation Error Handling', () => {
  test('should show error when creating farm without name', async ({ page }) => {
    await page.goto('http://localhost:3000');
    
    // Click on New Farm
    await page.click('text=New Farm');
    
    // Try to proceed without filling name
    await page.click('button:has-text("Next")');
    
    // Verify error message or disabled button
    const nextButton = page.locator('button:has-text("Next")');
    await expect(nextButton).toBeDisabled();
  });

  test('should handle network errors gracefully', async ({ page, context }) => {
    // Intercept API calls and make them fail
    await context.route('**/api/farms', route => {
      route.abort('failed');
    });
    
    await page.goto('http://localhost:3000');
    
    // Try to create a farm
    await page.click('text=New Farm');
    await page.fill('input[placeholder="My Awesome Farm"]', 'Test Farm');
    await page.click('button:has-text("Next")');
    
    // Skip to review
    for (let i = 0; i < 3; i++) {
      await page.click('button:has-text("Next")');
    }
    
    // Try to create
    await page.click('button:has-text("Create Farm")');
    
    // Verify error message
    await expect(page.locator('text=Failed to create farm')).toBeVisible({ timeout: 5000 });
  });
});