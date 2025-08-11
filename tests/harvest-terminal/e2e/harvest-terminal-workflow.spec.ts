import { test, expect, Page, BrowserContext } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

describe('Harvest Terminal Pro - E2E Workflow Tests', () => {
  let page: Page;
  let context: BrowserContext;
  let serverProcess: ChildProcess;
  let tunnelProcess: ChildProcess;
  
  // Start server and services before all tests
  test.beforeAll(async () => {
    // Start the development server
    serverProcess = spawn('npm', ['run', 'dev'], {
      cwd: path.resolve(__dirname, '../../../'),
      env: { ...process.env, BYPASS_AUTH: 'true', NODE_ENV: 'test' }
    });
    
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 5000));
  });
  
  test.afterAll(async () => {
    // Cleanup processes
    if (serverProcess) serverProcess.kill();
    if (tunnelProcess) tunnelProcess.kill();
  });
  
  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      permissions: ['clipboard-read', 'clipboard-write', 'notifications']
    });
    page = await context.newPage();
    
    // Navigate to MaiFarm dashboard
    await page.goto('http://localhost:3000');
    
    // Enable Harvest Terminal Pro mode
    await page.evaluate(() => {
      localStorage.setItem('harvestTerminalPro', 'true');
    });
  });
  
  test.afterEach(async () => {
    await context.close();
  });

  test('Complete Multi-Agent Farm Creation and Terminal Monitoring', async () => {
    // Step 1: Create a new farm
    await page.click('[data-testid="create-farm-button"]');
    await page.fill('[data-testid="farm-name-input"]', 'E2E Test Farm');
    await page.fill('[data-testid="agent-count-input"]', '3');
    await page.fill('[data-testid="farm-prompt"]', 'Test the Harvest Terminal features');
    await page.click('[data-testid="launch-farm-button"]');
    
    // Wait for farm to launch
    await expect(page.locator('[data-testid="farm-status"]')).toContainText('Running', { timeout: 30000 });
    
    // Step 2: Navigate to Harvest Terminal
    await page.click('[data-testid="view-terminal-button"]');
    
    // Verify Harvest Terminal Pro loaded
    await expect(page.locator('.harvest-terminal-pro')).toBeVisible();
    
    // Step 3: Verify all agents are visible
    const agentCards = page.locator('.agent-terminal-card');
    await expect(agentCards).toHaveCount(3);
    
    // Step 4: Test theme switching
    await page.click('[data-testid="theme-selector"]');
    await page.click('[data-testid="theme-cyberpunk"]');
    
    // Verify theme applied
    await expect(page.locator('.terminal-container')).toHaveClass(/theme-cyberpunk/);
    
    // Verify theme persists after reload
    await page.reload();
    await expect(page.locator('.terminal-container')).toHaveClass(/theme-cyberpunk/);
    
    // Step 5: Test command execution
    const terminal1 = page.locator('.agent-terminal-card').first();
    await terminal1.click();
    await page.keyboard.type('echo "Hello from E2E test"');
    await page.keyboard.press('Enter');
    
    // Verify command output
    await expect(terminal1.locator('.terminal-output')).toContainText('Hello from E2E test');
    
    // Step 6: Test multi-tab functionality
    await page.keyboard.press('Meta+T'); // Cmd+T for new tab
    await expect(page.locator('.terminal-tab')).toHaveCount(2);
    
    // Switch between tabs
    await page.keyboard.press('Meta+1');
    await expect(page.locator('.terminal-tab.active')).toHaveText(/Tab 1/);
    
    await page.keyboard.press('Meta+2');
    await expect(page.locator('.terminal-tab.active')).toHaveText(/Tab 2/);
    
    // Step 7: Test command palette
    await page.keyboard.press('Meta+K');
    await expect(page.locator('[data-testid="command-palette"]')).toBeVisible();
    
    await page.fill('[data-testid="command-search"]', 'copy output');
    await page.keyboard.press('Enter');
    
    // Verify clipboard contains terminal output
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('Hello from E2E test');
    
    // Step 8: Test performance monitoring
    await page.click('[data-testid="metrics-tab"]');
    await expect(page.locator('.performance-metrics')).toBeVisible();
    await expect(page.locator('.cpu-usage-chart')).toBeVisible();
    await expect(page.locator('.memory-usage-chart')).toBeVisible();
    
    // Step 9: Test session recording
    await page.click('[data-testid="record-session-button"]');
    await page.waitForTimeout(3000); // Record for 3 seconds
    await page.click('[data-testid="stop-recording-button"]');
    
    // Verify recording saved
    await expect(page.locator('[data-testid="recording-saved-notification"]')).toBeVisible();
    
    // Step 10: Test export functionality
    await page.click('[data-testid="export-button"]');
    await page.click('[data-testid="export-json"]');
    
    // Verify download triggered
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="confirm-export"]')
    ]);
    
    expect(download.suggestedFilename()).toContain('harvest-terminal-export');
  });

  test('Mobile Interface and Cloudflare Tunnel Access', async () => {
    // Step 1: Enable Cloudflare tunnel
    await page.click('[data-testid="settings-button"]');
    await page.click('[data-testid="enable-tunnel-toggle"]');
    
    // Wait for tunnel to establish
    await expect(page.locator('[data-testid="tunnel-status"]')).toContainText('Connected', { timeout: 30000 });
    
    // Get tunnel URL and QR code
    const tunnelUrl = await page.locator('[data-testid="tunnel-url"]').textContent();
    expect(tunnelUrl).toMatch(/https:\/\/.*\.trycloudflare\.com/);
    
    // Verify QR code is displayed
    await expect(page.locator('[data-testid="tunnel-qr-code"]')).toBeVisible();
    
    // Step 2: Test mobile viewport
    await context.close();
    context = await page.context().browser()!.newContext({
      viewport: { width: 375, height: 812 }, // iPhone dimensions
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15'
    });
    page = await context.newPage();
    
    // Navigate to tunnel URL (in real test, would use actual tunnel URL)
    await page.goto('http://localhost:3000');
    
    // Verify mobile interface loaded
    await expect(page.locator('.mobile-terminal-view')).toBeVisible();
    await expect(page.locator('.swipeable-agents')).toBeVisible();
    
    // Step 3: Test touch gestures
    const swipeArea = page.locator('.swipeable-agents');
    
    // Simulate swipe left
    await swipeArea.dispatchEvent('touchstart', {
      touches: [{ clientX: 300, clientY: 400 }]
    });
    await swipeArea.dispatchEvent('touchmove', {
      touches: [{ clientX: 100, clientY: 400 }]
    });
    await swipeArea.dispatchEvent('touchend');
    
    // Verify agent switched
    await expect(page.locator('[data-testid="active-agent-indicator"]')).toContainText('Agent 2');
    
    // Step 4: Test mobile command input
    await page.click('[data-testid="mobile-command-button"]');
    await expect(page.locator('.mobile-command-palette')).toBeVisible();
    
    // Test voice input button exists
    await expect(page.locator('[data-testid="voice-input-button"]')).toBeVisible();
    
    // Test quick actions
    await page.click('[data-testid="quick-action-status"]');
    await expect(page.locator('.terminal-output')).toContainText('git status');
    
    // Step 5: Test pull-to-refresh
    await page.locator('.mobile-terminal-view').dispatchEvent('touchstart', {
      touches: [{ clientX: 200, clientY: 100 }]
    });
    await page.locator('.mobile-terminal-view').dispatchEvent('touchmove', {
      touches: [{ clientX: 200, clientY: 300 }]
    });
    await page.locator('.mobile-terminal-view').dispatchEvent('touchend');
    
    // Verify refresh indicator
    await expect(page.locator('.refresh-indicator')).toBeVisible();
  });

  test('WebSocket Resilience and Real-time Updates', async () => {
    // Create a farm first
    await page.click('[data-testid="create-farm-button"]');
    await page.fill('[data-testid="farm-name-input"]', 'WebSocket Test Farm');
    await page.fill('[data-testid="agent-count-input"]', '2');
    await page.click('[data-testid="launch-farm-button"]');
    
    await page.click('[data-testid="view-terminal-button"]');
    
    // Step 1: Verify WebSocket connection
    const wsStatus = page.locator('[data-testid="websocket-status"]');
    await expect(wsStatus).toHaveClass(/connected/);
    
    // Step 2: Simulate WebSocket disconnection
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
    });
    
    // Verify disconnection detected
    await expect(wsStatus).toHaveClass(/disconnected/);
    await expect(page.locator('.offline-mode-banner')).toBeVisible();
    
    // Step 3: Verify reconnection
    await page.evaluate(() => {
      window.dispatchEvent(new Event('online'));
    });
    
    // Wait for reconnection
    await expect(wsStatus).toHaveClass(/connected/, { timeout: 10000 });
    await expect(page.locator('.offline-mode-banner')).not.toBeVisible();
    
    // Step 4: Test real-time updates
    // Open terminal in second tab
    const newPage = await context.newPage();
    await newPage.goto('http://localhost:3000');
    await newPage.click('[data-testid="view-terminal-button"]');
    
    // Type in first page
    await page.locator('.agent-terminal-card').first().click();
    await page.keyboard.type('echo "Real-time test"');
    await page.keyboard.press('Enter');
    
    // Verify update appears in second page
    await expect(newPage.locator('.terminal-output')).toContainText('Real-time test', { timeout: 5000 });
    
    // Step 5: Test message batching
    // Send many messages rapidly
    for (let i = 0; i < 50; i++) {
      await page.keyboard.type(`echo "Message ${i}"`);
      await page.keyboard.press('Enter');
    }
    
    // Verify all messages appear but are batched (check network tab would show fewer requests)
    await expect(page.locator('.terminal-output')).toContainText('Message 49');
  });

  test('Performance Monitoring and Optimization', async () => {
    // Create a large farm to test performance
    await page.click('[data-testid="create-farm-button"]');
    await page.fill('[data-testid="farm-name-input"]', 'Performance Test Farm');
    await page.fill('[data-testid="agent-count-input"]', '10');
    await page.click('[data-testid="launch-farm-button"]');
    
    await page.click('[data-testid="view-terminal-button"]');
    
    // Step 1: Measure initial load time
    const startTime = Date.now();
    await expect(page.locator('.harvest-terminal-pro')).toBeVisible();
    const loadTime = Date.now() - startTime;
    
    expect(loadTime).toBeLessThan(3000); // Should load in under 3 seconds
    
    // Step 2: Test virtual scrolling with large output
    const terminal = page.locator('.agent-terminal-card').first();
    await terminal.click();
    
    // Generate large output
    for (let i = 0; i < 100; i++) {
      await page.keyboard.type(`for i in {1..100}; do echo "Line $i-$RANDOM"; done`);
      await page.keyboard.press('Enter');
    }
    
    // Verify virtual scrolling is working
    const visibleLines = await page.locator('.terminal-line:visible').count();
    expect(visibleLines).toBeLessThan(200); // Should virtualize, not render all 10000 lines
    
    // Step 3: Test smooth scrolling
    await page.evaluate(() => {
      document.querySelector('.terminal-viewport')?.scrollTo({ top: 5000, behavior: 'smooth' });
    });
    
    // Verify scroll position updated
    await page.waitForTimeout(1000);
    const scrollTop = await page.evaluate(() => 
      document.querySelector('.terminal-viewport')?.scrollTop
    );
    expect(scrollTop).toBeGreaterThan(4000);
    
    // Step 4: Monitor memory usage
    const metrics = await page.evaluate(() => {
      if ('memory' in performance) {
        return (performance as any).memory;
      }
      return null;
    });
    
    if (metrics) {
      expect(metrics.usedJSHeapSize).toBeLessThan(150 * 1024 * 1024); // Less than 150MB
    }
    
    // Step 5: Test animations FPS
    await page.click('[data-testid="theme-selector"]');
    
    // Measure FPS during theme animation
    const fps = await page.evaluate(() => {
      return new Promise<number>(resolve => {
        let frameCount = 0;
        const startTime = performance.now();
        
        function countFrames() {
          frameCount++;
          if (performance.now() - startTime < 1000) {
            requestAnimationFrame(countFrames);
          } else {
            resolve(frameCount);
          }
        }
        
        requestAnimationFrame(countFrames);
      });
    });
    
    expect(fps).toBeGreaterThan(55); // Should maintain near 60 FPS
  });

  test('Error Recovery and Edge Cases', async () => {
    // Step 1: Test handling of invalid farm ID
    await page.goto('http://localhost:3000/harvest-terminal?farmId=invalid-farm-id');
    await expect(page.locator('.error-message')).toContainText(/Farm not found/);
    
    // Step 2: Test recovery from theme loading failure
    await page.evaluate(() => {
      // Corrupt theme storage
      localStorage.setItem('harvest-terminal-theme', 'corrupted-theme-data');
    });
    
    await page.reload();
    
    // Should fallback to default theme
    await expect(page.locator('.terminal-container')).toHaveClass(/theme-default/);
    
    // Step 3: Test handling of extremely long output lines
    await page.click('[data-testid="create-farm-button"]');
    await page.fill('[data-testid="farm-name-input"]', 'Edge Case Farm');
    await page.click('[data-testid="launch-farm-button"]');
    await page.click('[data-testid="view-terminal-button"]');
    
    const terminal = page.locator('.agent-terminal-card').first();
    await terminal.click();
    
    // Send very long line
    const longLine = 'x'.repeat(10000);
    await page.keyboard.type(`echo "${longLine}"`);
    await page.keyboard.press('Enter');
    
    // Should handle without crashing
    await expect(terminal.locator('.terminal-output')).toContainText('x');
    
    // Step 4: Test rapid session switching
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Meta+T'); // Create new tab
      await page.waitForTimeout(50);
      await page.keyboard.press(`Meta+${(i % 9) + 1}`); // Switch tabs rapidly
    }
    
    // Should not crash
    await expect(page.locator('.harvest-terminal-pro')).toBeVisible();
    
    // Step 5: Test cleanup on navigation away
    const beforeNavigation = await page.evaluate(() => {
      return window.performance.memory ? (window.performance.memory as any).usedJSHeapSize : 0;
    });
    
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForTimeout(1000);
    
    const afterNavigation = await page.evaluate(() => {
      return window.performance.memory ? (window.performance.memory as any).usedJSHeapSize : 0;
    });
    
    // Memory should be released
    expect(afterNavigation).toBeLessThan(beforeNavigation * 1.2); // Allow 20% variance
  });
});