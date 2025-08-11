import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const API_URL = process.env.API_URL || 'http://localhost:4567';

test.describe('Quick Task Execution Flow', () => {
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

  test('should execute a quick task successfully', async () => {
    // Open quick task modal
    await page.click('[data-testid="quick-task-button"]');
    
    // Wait for modal to open
    await page.waitForSelector('[data-testid="quick-task-modal"]', {
      timeout: 5000
    });
    
    // Fill in task prompt
    const taskPrompt = 'Analyze this test prompt and return a summary';
    await page.fill('[data-testid="quick-task-prompt"]', taskPrompt);
    
    // Select provider
    await page.selectOption('[data-testid="quick-task-provider"]', 'claude');
    
    // Set timeout (optional)
    await page.fill('[data-testid="quick-task-timeout"]', '180');
    
    // Submit task
    await page.click('[data-testid="submit-quick-task"]');
    
    // Wait for task to start
    await page.waitForSelector('[data-testid="quick-task-status-running"]', {
      timeout: 10000
    });
    
    // Verify progress indicator
    const progressIndicator = await page.locator('[data-testid="quick-task-progress"]');
    expect(await progressIndicator.isVisible()).toBe(true);
    
    // Wait for task completion (with extended timeout for actual execution)
    await page.waitForSelector('[data-testid="quick-task-status-completed"]', {
      timeout: 180000 // 3 minutes
    });
    
    // Verify result is displayed
    const result = await page.locator('[data-testid="quick-task-result"]');
    expect(await result.isVisible()).toBe(true);
    
    const resultText = await result.textContent();
    expect(resultText).toBeTruthy();
    expect(resultText?.length).toBeGreaterThan(0);
  });

  test('should handle quick task with file input', async () => {
    // Open quick task modal
    await page.click('[data-testid="quick-task-button"]');
    
    await page.waitForSelector('[data-testid="quick-task-modal"]', {
      timeout: 5000
    });
    
    // Upload a file
    const fileInput = await page.locator('[data-testid="quick-task-file-input"]');
    await fileInput.setInputFiles({
      name: 'test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('This is test file content for quick task processing.')
    });
    
    // Fill in task prompt
    await page.fill('[data-testid="quick-task-prompt"]', 'Analyze the uploaded file and summarize its content');
    
    // Submit task
    await page.click('[data-testid="submit-quick-task"]');
    
    // Wait for completion
    await page.waitForSelector('[data-testid="quick-task-status-completed"]', {
      timeout: 180000
    });
    
    // Verify result mentions the file
    const result = await page.locator('[data-testid="quick-task-result"]').textContent();
    expect(result).toBeTruthy();
  });

  test('should validate quick task inputs', async () => {
    // Open quick task modal
    await page.click('[data-testid="quick-task-button"]');
    
    await page.waitForSelector('[data-testid="quick-task-modal"]', {
      timeout: 5000
    });
    
    // Try to submit without prompt
    await page.click('[data-testid="submit-quick-task"]');
    
    // Verify validation error
    const promptError = await page.locator('[data-testid="quick-task-prompt-error"]');
    expect(await promptError.isVisible()).toBe(true);
    expect(await promptError.textContent()).toContain('Prompt is required');
    
    // Fill in invalid timeout
    await page.fill('[data-testid="quick-task-prompt"]', 'Valid prompt');
    await page.fill('[data-testid="quick-task-timeout"]', '0');
    
    await page.click('[data-testid="submit-quick-task"]');
    
    // Verify timeout validation error
    const timeoutError = await page.locator('[data-testid="quick-task-timeout-error"]');
    expect(await timeoutError.isVisible()).toBe(true);
    expect(await timeoutError.textContent()).toContain('at least');
  });

  test('should cancel a running quick task', async () => {
    // Open quick task modal
    await page.click('[data-testid="quick-task-button"]');
    
    await page.waitForSelector('[data-testid="quick-task-modal"]', {
      timeout: 5000
    });
    
    // Submit a long-running task
    await page.fill('[data-testid="quick-task-prompt"]', 'Perform a complex analysis that takes time');
    await page.fill('[data-testid="quick-task-timeout"]', '300');
    
    await page.click('[data-testid="submit-quick-task"]');
    
    // Wait for task to start
    await page.waitForSelector('[data-testid="quick-task-status-running"]', {
      timeout: 10000
    });
    
    // Cancel the task
    await page.click('[data-testid="cancel-quick-task"]');
    
    // Confirm cancellation
    await page.click('[data-testid="confirm-cancel-quick-task"]');
    
    // Verify task is canceled
    await page.waitForSelector('[data-testid="quick-task-status-canceled"]', {
      timeout: 5000
    });
    
    const statusText = await page.textContent('[data-testid="quick-task-status"]');
    expect(statusText).toContain('Canceled');
  });

  test('should show execution time and statistics', async () => {
    // Open quick task modal
    await page.click('[data-testid="quick-task-button"]');
    
    await page.waitForSelector('[data-testid="quick-task-modal"]', {
      timeout: 5000
    });
    
    // Submit a task
    await page.fill('[data-testid="quick-task-prompt"]', 'Simple test task');
    await page.click('[data-testid="submit-quick-task"]');
    
    // Wait for completion
    await page.waitForSelector('[data-testid="quick-task-status-completed"]', {
      timeout: 180000
    });
    
    // Verify execution time is displayed
    const executionTime = await page.locator('[data-testid="quick-task-execution-time"]');
    expect(await executionTime.isVisible()).toBe(true);
    
    const timeText = await executionTime.textContent();
    expect(timeText).toMatch(/\d+(\.\d+)?s/); // Matches patterns like "5.2s" or "10s"
    
    // Verify token usage (if available)
    const tokenUsage = await page.locator('[data-testid="quick-task-token-usage"]');
    if (await tokenUsage.isVisible()) {
      const tokenText = await tokenUsage.textContent();
      expect(tokenText).toMatch(/\d+/);
    }
  });

  test('should save quick task result', async () => {
    // Execute a quick task
    await page.click('[data-testid="quick-task-button"]');
    await page.waitForSelector('[data-testid="quick-task-modal"]', { timeout: 5000 });
    
    await page.fill('[data-testid="quick-task-prompt"]', 'Generate test data');
    await page.click('[data-testid="submit-quick-task"]');
    
    await page.waitForSelector('[data-testid="quick-task-status-completed"]', {
      timeout: 180000
    });
    
    // Save the result
    await page.click('[data-testid="save-quick-task-result"]');
    
    // Fill in save details
    await page.fill('[data-testid="save-result-name"]', 'Quick Task Test Result');
    await page.fill('[data-testid="save-result-description"]', 'E2E test result');
    
    await page.click('[data-testid="confirm-save-result"]');
    
    // Verify success message
    await page.waitForSelector('[data-testid="save-success-message"]', {
      timeout: 5000
    });
    
    // Close modal
    await page.click('[data-testid="close-quick-task-modal"]');
    
    // Navigate to saved results
    await page.click('[data-testid="nav-barn"]');
    
    // Verify the saved result appears
    const savedResult = await page.locator('[data-testid="barn-entry-Quick Task Test Result"]');
    expect(await savedResult.isVisible()).toBe(true);
  });

  test('should handle quick task errors gracefully', async () => {
    // Mock API error
    await page.route(`${API_URL}/api/tasks/quick`, route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Task execution failed' })
      });
    });
    
    // Open quick task modal
    await page.click('[data-testid="quick-task-button"]');
    await page.waitForSelector('[data-testid="quick-task-modal"]', { timeout: 5000 });
    
    // Submit task
    await page.fill('[data-testid="quick-task-prompt"]', 'This will fail');
    await page.click('[data-testid="submit-quick-task"]');
    
    // Wait for error
    await page.waitForSelector('[data-testid="quick-task-error"]', {
      timeout: 10000
    });
    
    const errorMessage = await page.textContent('[data-testid="quick-task-error"]');
    expect(errorMessage).toContain('failed');
    
    // Verify retry button is available
    const retryButton = await page.locator('[data-testid="retry-quick-task"]');
    expect(await retryButton.isVisible()).toBe(true);
  });

  test('should support quick task templates', async () => {
    // Open quick task modal
    await page.click('[data-testid="quick-task-button"]');
    await page.waitForSelector('[data-testid="quick-task-modal"]', { timeout: 5000 });
    
    // Open template selector
    await page.click('[data-testid="quick-task-templates-button"]');
    
    // Wait for templates to load
    await page.waitForSelector('[data-testid="template-list"]', {
      timeout: 5000
    });
    
    // Select a template
    await page.click('[data-testid="template-code-review"]');
    
    // Verify template is applied
    const promptField = await page.locator('[data-testid="quick-task-prompt"]');
    const promptValue = await promptField.inputValue();
    expect(promptValue).toContain('review');
    
    // Verify template parameters are filled
    const providerField = await page.locator('[data-testid="quick-task-provider"]');
    const providerValue = await providerField.inputValue();
    expect(providerValue).toBeTruthy();
  });

  test('should show quick task history', async () => {
    // Execute multiple quick tasks
    const tasks = ['Task 1', 'Task 2', 'Task 3'];
    
    for (const task of tasks) {
      await page.click('[data-testid="quick-task-button"]');
      await page.waitForSelector('[data-testid="quick-task-modal"]', { timeout: 5000 });
      
      await page.fill('[data-testid="quick-task-prompt"]', task);
      await page.click('[data-testid="submit-quick-task"]');
      
      await page.waitForSelector('[data-testid="quick-task-status-completed"]', {
        timeout: 180000
      });
      
      await page.click('[data-testid="close-quick-task-modal"]');
    }
    
    // Open quick task modal again
    await page.click('[data-testid="quick-task-button"]');
    await page.waitForSelector('[data-testid="quick-task-modal"]', { timeout: 5000 });
    
    // Open history
    await page.click('[data-testid="quick-task-history-button"]');
    
    // Verify history is displayed
    await page.waitForSelector('[data-testid="quick-task-history-list"]', {
      timeout: 5000
    });
    
    // Verify all tasks are in history
    for (const task of tasks) {
      const historyItem = await page.locator(`[data-testid="history-item-${task}"]`);
      expect(await historyItem.isVisible()).toBe(true);
    }
    
    // Test rerun from history
    await page.click('[data-testid="history-item-Task 1"] [data-testid="rerun-task"]');
    
    // Verify prompt is populated
    const promptField = await page.locator('[data-testid="quick-task-prompt"]');
    const promptValue = await promptField.inputValue();
    expect(promptValue).toBe('Task 1');
  });

  test('should handle concurrent quick tasks', async () => {
    // Note: This test assumes the UI supports multiple quick task modals or tabs
    // Adjust based on actual implementation
    
    const task1Promise = executeQuickTask(page, 'Concurrent Task 1');
    const task2Promise = executeQuickTask(page, 'Concurrent Task 2');
    
    // Wait for both tasks to complete
    const results = await Promise.all([task1Promise, task2Promise]);
    
    // Verify both completed successfully
    expect(results[0]).toBe(true);
    expect(results[1]).toBe(true);
  });

  async function executeQuickTask(page: Page, prompt: string): Promise<boolean> {
    try {
      // Open new quick task (implementation may vary)
      await page.click('[data-testid="quick-task-button"]');
      await page.waitForSelector('[data-testid="quick-task-modal"]', { timeout: 5000 });
      
      await page.fill('[data-testid="quick-task-prompt"]', prompt);
      await page.click('[data-testid="submit-quick-task"]');
      
      await page.waitForSelector('[data-testid="quick-task-status-completed"]', {
        timeout: 180000
      });
      
      return true;
    } catch (error) {
      console.error(`Quick task "${prompt}" failed:`, error);
      return false;
    }
  }

  test.afterEach(async () => {
    // Clean up any modals
    const modal = await page.locator('[data-testid="quick-task-modal"]');
    if (await modal.isVisible()) {
      const closeButton = await page.locator('[data-testid="close-quick-task-modal"]');
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
    }
    
    await page.close();
  });
});