/**
 * End-to-end tests for Qwen3-Coder integration
 */

import { test, expect } from '@playwright/test';
import { Page } from '@playwright/test';

// Test configuration
const TEST_TIMEOUT = 120000; // 2 minutes for AI operations

test.describe('Qwen3-Coder Farm Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:3000');
    
    // Wait for app to load
    await page.waitForSelector('[data-testid="dashboard"]', { timeout: 10000 });
  });

  test('should create a farm with Qwen provider', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    // Click create farm button
    await page.click('[data-testid="create-farm-btn"]');
    
    // Fill in farm details
    await page.fill('[data-testid="farm-name-input"]', 'E2E Test Qwen Farm');
    await page.fill('[data-testid="farm-description-input"]', 'Testing Qwen3-Coder integration');
    
    // Select farm type
    await page.click('[data-testid="farm-type-sequential"]');
    
    // Move to configuration step
    await page.click('[data-testid="next-step-btn"]');
    
    // Select Qwen provider
    await page.waitForSelector('[data-testid="provider-selector"]');
    await page.click('[data-testid="provider-qwen"]');
    
    // Verify Qwen is selected
    const providerStatus = await page.textContent('[data-testid="selected-provider"]');
    expect(providerStatus).toContain('Qwen3-Coder');
    
    // Configure farm settings
    await page.fill('[data-testid="max-agents-input"]', '3');
    await page.click('[data-testid="auto-scale-toggle"]');
    
    // Move to review step
    await page.click('[data-testid="next-step-btn"]');
    
    // Verify summary shows Qwen
    const summary = await page.textContent('[data-testid="farm-summary"]');
    expect(summary).toContain('Qwen3-Coder');
    expect(summary).toContain('3 agents');
    
    // Create the farm
    await page.click('[data-testid="create-farm-btn-final"]');
    
    // Wait for farm creation
    await page.waitForSelector('[data-testid="farm-created-success"]', { timeout: 30000 });
    
    // Verify farm appears in dashboard
    await page.waitForSelector('[data-testid="farm-card"]');
    const farmCard = await page.textContent('[data-testid="farm-card"]');
    expect(farmCard).toContain('E2E Test Qwen Farm');
    
    // Verify provider indicator
    const providerBadge = await page.isVisible('[data-testid="provider-badge-qwen"]');
    expect(providerBadge).toBeTruthy();
  });

  test('should launch Qwen agents for a farm', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    // Assume farm already exists (or create one)
    await createTestFarm(page, 'qwen');
    
    // Find the farm card
    const farmCard = page.locator('[data-testid="farm-card"]').filter({
      hasText: 'Test Qwen Farm'
    });
    
    // Click launch button
    await farmCard.locator('[data-testid="launch-farm-btn"]').click();
    
    // Wait for launching status
    await expect(farmCard.locator('[data-testid="farm-status"]')).toContainText('launching', {
      timeout: 5000
    });
    
    // Wait for agents to start
    await expect(farmCard.locator('[data-testid="farm-status"]')).toContainText('running', {
      timeout: 60000
    });
    
    // Verify agents are visible
    const agentCount = await farmCard.locator('[data-testid="agent-preview"]').count();
    expect(agentCount).toBeGreaterThan(0);
    
    // Check agent status
    const firstAgent = farmCard.locator('[data-testid="agent-preview"]').first();
    await expect(firstAgent).toContainText('working');
  });

  test('should monitor Qwen agent progress via WebSocket', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    // Create and launch a farm
    await createTestFarm(page, 'qwen');
    await launchFarm(page, 'Test Qwen Farm');
    
    // Navigate to monitoring view
    await page.click('[data-testid="farm-monitor-btn"]');
    
    // Wait for WebSocket connection
    await page.waitForSelector('[data-testid="websocket-connected"]', { timeout: 10000 });
    
    // Verify real-time updates
    const metricsContainer = page.locator('[data-testid="agent-metrics"]');
    
    // Wait for metrics to update
    await page.waitForTimeout(5000);
    
    // Check CPU usage is updating
    const cpuUsage = await metricsContainer.locator('[data-testid="cpu-usage"]').textContent();
    expect(parseFloat(cpuUsage || '0')).toBeGreaterThan(0);
    
    // Check memory usage
    const memoryUsage = await metricsContainer.locator('[data-testid="memory-usage"]').textContent();
    expect(parseFloat(memoryUsage || '0')).toBeGreaterThan(0);
    
    // Verify agent communication graph
    const commGraph = await page.isVisible('[data-testid="communication-graph"]');
    expect(commGraph).toBeTruthy();
  });

  test('should compare Qwen and Claude performance', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    // Create farms with both providers
    await createTestFarm(page, 'claude', 'Claude Test Farm');
    await createTestFarm(page, 'qwen', 'Qwen Test Farm');
    
    // Launch both farms
    await launchFarm(page, 'Claude Test Farm');
    await launchFarm(page, 'Qwen Test Farm');
    
    // Wait for some execution
    await page.waitForTimeout(30000);
    
    // Navigate to analytics
    await page.click('[data-testid="analytics-nav"]');
    
    // Select comparison view
    await page.click('[data-testid="provider-comparison-tab"]');
    
    // Wait for comparison data
    await page.waitForSelector('[data-testid="comparison-chart"]', { timeout: 10000 });
    
    // Verify comparison metrics are displayed
    const metrics = ['latency', 'throughput', 'cost', 'error-rate'];
    for (const metric of metrics) {
      const metricElement = await page.isVisible(`[data-testid="metric-${metric}"]`);
      expect(metricElement).toBeTruthy();
    }
    
    // Check recommendation
    const recommendation = await page.textContent('[data-testid="provider-recommendation"]');
    expect(recommendation).toMatch(/Claude|Qwen/);
  });

  test('should handle large context with Qwen', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    // Create a farm with large context requirements
    await page.click('[data-testid="create-farm-btn"]');
    
    // Use YAML editor for complex config
    await page.click('[data-testid="use-yaml-editor"]');
    
    const largeContextYaml = `
name: Large Context Qwen Farm
provider: qwen
description: Testing Qwen's 256K context window
agents:
  - name: Context Processor
    type: analyzer
    capabilities: [large-context, document-processing]
    tasks:
      - Process large document corpus
      - Maintain context across multiple files
      - Generate comprehensive analysis
config:
  maxAgents: 2
  contextWindow: large
  timeout: 7200
    `;
    
    await page.fill('[data-testid="yaml-editor"]', largeContextYaml);
    
    // Create farm
    await page.click('[data-testid="create-from-yaml-btn"]');
    
    // Wait for creation
    await page.waitForSelector('[data-testid="farm-created-success"]');
    
    // Launch and verify it handles large context
    await launchFarm(page, 'Large Context Qwen Farm');
    
    // Check context utilization
    await page.click('[data-testid="farm-monitor-btn"]');
    const contextUsage = await page.textContent('[data-testid="context-usage"]');
    expect(contextUsage).toContain('256K');
  });

  test('should test GoWild mode with Qwen', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    // Create farm with GoWild enabled
    await page.click('[data-testid="create-farm-btn"]');
    await page.fill('[data-testid="farm-name-input"]', 'Qwen GoWild Test');
    
    // Configure
    await page.click('[data-testid="next-step-btn"]');
    await page.click('[data-testid="provider-qwen"]');
    
    // Enable GoWild mode
    await page.click('[data-testid="gowild-toggle"]');
    await page.selectOption('[data-testid="creativity-level"]', '4');
    
    // Set boundaries
    await page.fill('[data-testid="boundary-input-0"]', 'Stay within project scope');
    await page.click('[data-testid="add-boundary-btn"]');
    await page.fill('[data-testid="boundary-input-1"]', 'No external API calls');
    
    // Create and launch
    await page.click('[data-testid="next-step-btn"]');
    await page.click('[data-testid="create-farm-btn-final"]');
    
    await page.waitForSelector('[data-testid="farm-created-success"]');
    await launchFarm(page, 'Qwen GoWild Test');
    
    // Monitor exploration
    await page.click('[data-testid="gowild-monitor-btn"]');
    
    // Verify exploration metrics
    await page.waitForSelector('[data-testid="exploration-graph"]');
    const explorationScore = await page.textContent('[data-testid="exploration-score"]');
    expect(parseFloat(explorationScore || '0')).toBeGreaterThan(0);
  });
});

// Helper functions
async function createTestFarm(page: Page, provider: 'claude' | 'qwen', name?: string) {
  const farmName = name || `Test ${provider === 'qwen' ? 'Qwen' : 'Claude'} Farm`;
  
  await page.click('[data-testid="create-farm-btn"]');
  await page.fill('[data-testid="farm-name-input"]', farmName);
  await page.fill('[data-testid="farm-description-input"]', `Testing ${provider} provider`);
  await page.click('[data-testid="next-step-btn"]');
  await page.click(`[data-testid="provider-${provider}"]`);
  await page.click('[data-testid="next-step-btn"]');
  await page.click('[data-testid="create-farm-btn-final"]');
  await page.waitForSelector('[data-testid="farm-created-success"]', { timeout: 30000 });
}

async function launchFarm(page: Page, farmName: string) {
  const farmCard = page.locator('[data-testid="farm-card"]').filter({
    hasText: farmName
  });
  
  await farmCard.locator('[data-testid="launch-farm-btn"]').click();
  await expect(farmCard.locator('[data-testid="farm-status"]')).toContainText('running', {
    timeout: 60000
  });
}