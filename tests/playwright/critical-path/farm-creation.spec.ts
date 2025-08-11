import { test, expect } from '@playwright/test';

test.describe('Critical Path: Farm Creation Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
    
    // Wait for the app to load
    await page.waitForSelector('[data-testid="dashboard"], .dashboard, #root', { timeout: 10000 });
  });

  test('should complete full farm creation flow - Sequential Mode', async ({ page }) => {
    console.log('🌱 Testing Sequential Farm Creation...');
    
    // Step 1: Navigate to farm creation
    await page.click('[data-testid="create-farm-button"], button:has-text("Create Farm")');
    await expect(page).toHaveURL(/.*farm.*create.*/);
    
    // Step 2: Fill farm creation form
    await page.fill('input[name="farmName"], [data-testid="farm-name"]', 'Test Sequential Farm');
    await page.fill('textarea[name="description"], [data-testid="farm-description"]', 'Automated test farm');
    
    // Step 3: Select Sequential mode
    await page.click('[data-testid="farm-mode-sequential"], input[value="sequential"]');
    
    // Step 4: Configure agents
    await page.fill('input[name="maxAgents"], [data-testid="max-agents"]', '3');
    
    // Step 5: Add YAML configuration
    const yamlConfig = `
agents:
  - name: "Agent 1"
    type: "developer"
    tasks: ["analyze", "implement"]
  - name: "Agent 2" 
    type: "tester"
    tasks: ["test", "validate"]
  - name: "Agent 3"
    type: "reviewer"
    tasks: ["review", "optimize"]
`;
    await page.fill('textarea[name="yaml"], .yaml-editor textarea', yamlConfig);
    
    // Step 6: Submit farm creation
    await page.click('button[type="submit"], [data-testid="create-farm-submit"]');
    
    // Step 7: Verify direct navigation to harvest page
    await page.waitForURL(/.*harvest.*/, { timeout: 15000 });
    await expect(page).toHaveURL(/.*harvest.*/);
    
    // Step 8: Check for concept explainer modal (may appear for new farms)
    const conceptModal = page.locator('[role="dialog"], .fixed.inset-0.z-50');
    const modalVisible = await conceptModal.isVisible();
    
    if (modalVisible) {
      console.log('📚 Concept explainer modal detected - closing it');
      // Close the modal by clicking Continue button
      const continueButton = page.locator('button:has-text("Continue")');
      if (await continueButton.isVisible()) {
        await continueButton.click();
      } else {
        // Fallback: click X button
        await page.locator('button[aria-label="Close modal"], .absolute.top-4.right-4').click();
      }
      await page.waitForTimeout(500); // Wait for modal to close
    }
    
    // Step 9: Verify harvest page loaded
    await expect(page.locator('h1, .harvest-title')).toContainText(/harvest/i);
    
    // Step 10: Verify CLI terminals are visible (may need to switch to terminal view)
    const terminalView = page.locator('.terminal, [data-testid="agent-terminal"]');
    const terminalVisible = await terminalView.isVisible();
    
    if (!terminalVisible) {
      // Switch to terminal view if not already active
      const terminalButton = page.locator('button:has-text("Terminal")');
      if (await terminalButton.isVisible()) {
        await terminalButton.click();
        await page.waitForTimeout(1000);
      }
    }
    
    await expect(page.locator('.terminal, [data-testid="agent-terminal"]')).toBeVisible();
    
    console.log('✅ Sequential farm creation workflow completed successfully');
  });

  test('should complete full farm creation flow - Collaborative Mode', async ({ page }) => {
    console.log('🤝 Testing Collaborative Farm Creation...');
    
    await page.click('[data-testid="create-farm-button"], button:has-text("Create Farm")');
    await page.fill('input[name="farmName"]', 'Test Collaborative Farm');
    await page.fill('textarea[name="description"]', 'Collaborative test farm');
    
    // Select Collaborative mode
    await page.click('[data-testid="farm-mode-collaborative"], input[value="collaborative"]');
    await page.fill('input[name="maxAgents"]', '5');
    
    // Enable collaboration features
    await page.check('input[name="enableCollaboration"], [data-testid="enable-collaboration"]');
    
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*harvest.*/, { timeout: 15000 });
    
    // Handle concept modal if it appears
    const conceptModal = page.locator('[role="dialog"], .fixed.inset-0.z-50');
    if (await conceptModal.isVisible()) {
      await page.locator('button:has-text("Continue"), .absolute.top-4.right-4').click();
      await page.waitForTimeout(500);
    }
    
    await expect(page.locator('.harvest-title')).toContainText(/harvest/i);
    console.log('✅ Collaborative farm creation workflow completed');
  });

  test('should complete full farm creation flow - Autonomous Mode', async ({ page }) => {
    console.log('🤖 Testing Autonomous Farm Creation...');
    
    await page.click('[data-testid="create-farm-button"], button:has-text("Create Farm")');
    await page.fill('input[name="farmName"]', 'Test Autonomous Farm');
    await page.fill('textarea[name="description"]', 'Autonomous test farm');
    
    // Select Autonomous mode  
    await page.click('[data-testid="farm-mode-autonomous"], input[value="autonomous"]');
    await page.fill('input[name="maxAgents"]', '2');
    
    // Configure autonomous settings
    await page.fill('input[name="creativityLevel"], [data-testid="creativity-level"]', '0.7');
    
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*harvest.*/, { timeout: 15000 });
    
    // Handle concept modal if it appears
    const conceptModal = page.locator('[role="dialog"], .fixed.inset-0.z-50');
    if (await conceptModal.isVisible()) {
      await page.locator('button:has-text("Continue"), .absolute.top-4.right-4').click();
      await page.waitForTimeout(500);
    }
    
    await expect(page.locator('.harvest-title')).toContainText(/harvest/i);
    console.log('✅ Autonomous farm creation workflow completed');
  });

  test('should handle farm creation errors gracefully', async ({ page }) => {
    console.log('⚠️ Testing Error Handling...');
    
    await page.click('[data-testid="create-farm-button"], button:has-text("Create Farm")');
    
    // Try to submit without required fields
    await page.click('button[type="submit"]');
    
    // Should show validation errors
    await expect(page.locator('.error, .validation-error, [role="alert"]')).toBeVisible();
    
    // Fill required fields with invalid data
    await page.fill('input[name="farmName"]', ''); // Empty name
    await page.fill('input[name="maxAgents"]', '0'); // Invalid agent count
    
    await page.click('button[type="submit"]');
    await expect(page.locator('.error')).toBeVisible();
    
    console.log('✅ Error handling validated');
  });

  test('should maintain WebSocket connection during farm creation', async ({ page }) => {
    console.log('🔌 Testing WebSocket Connection...');
    
    // Monitor WebSocket connections
    const wsMessages: any[] = [];
    page.on('websocket', ws => {
      ws.on('framereceived', event => wsMessages.push(event.payload));
    });
    
    await page.click('[data-testid="create-farm-button"], button:has-text("Create Farm")');
    await page.fill('input[name="farmName"]', 'WebSocket Test Farm');
    await page.click('[data-testid="farm-mode-sequential"]');
    await page.fill('input[name="maxAgents"]', '2');
    
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*harvest.*/, { timeout: 15000 });
    
    // Handle concept modal if it appears
    const conceptModal = page.locator('[role="dialog"], .fixed.inset-0.z-50');
    if (await conceptModal.isVisible()) {
      await page.locator('button:has-text("Continue"), .absolute.top-4.right-4').click();
      await page.waitForTimeout(500);
    }
    
    // Wait a moment for WebSocket messages
    await page.waitForTimeout(2000);
    
    // Should have received some WebSocket messages
    expect(wsMessages.length).toBeGreaterThan(0);
    console.log(`📡 Received ${wsMessages.length} WebSocket messages`);
    
    console.log('✅ WebSocket connection maintained');
  });
});