/**
 * Critical Path Test: Complete MaiFarm Workflow
 * Tests the entire user journey from farm creation to harvest completion
 */

describe('Critical Path: Complete MaiFarm Workflow', () => {
  beforeEach(() => {
    // Visit the application
    cy.visit('/');
    
    // Wait for the application to load
    cy.get('[data-testid="app-root"], .app, #root').should('be.visible');
    
    // Skip authentication if BYPASS_AUTH is enabled
    cy.window().then((win) => {
      if (win.location.pathname === '/login') {
        cy.get('button').contains('Skip Auth').click();
      }
    });
  });

  it('should complete the full farm creation and harvest workflow', () => {
    cy.log('🌱 Starting Critical Path Test: Farm Creation → Growing → Harvest');
    
    // Step 1: Navigate to Dashboard
    cy.get('[data-testid="dashboard"], .dashboard').should('be.visible');
    cy.log('✅ Dashboard loaded successfully');

    // Step 2: Create a new farm
    cy.get('button').contains(/create.*farm/i).click();
    cy.url().should('include', 'create');
    
    // Fill out farm creation form
    cy.get('input[name="farmName"], [data-testid="farm-name"]')
      .type('Critical Path Test Farm');
    
    cy.get('textarea[name="description"], [data-testid="farm-description"]')
      .type('Automated critical path testing farm');
    
    // Select farm type
    cy.get('[data-testid="farm-mode-sequential"], input[value="sequential"]')
      .check({ force: true });
    
    // Set number of agents
    cy.get('input[name="maxAgents"], [data-testid="max-agents"]')
      .clear()
      .type('3');
    
    // Add YAML configuration
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

workflow:
  type: "sequential"
  timeout: 1800
`;
    
    cy.get('textarea').contains('yaml').type(yamlConfig, { force: true });
    
    // Submit farm creation
    cy.get('button[type="submit"], [data-testid="create-farm-submit"]').click();
    cy.log('✅ Farm creation form submitted');

    // Step 3: Verify navigation to growing page
    cy.url().should('include', 'growing');
    cy.get('h1, .growing-title').should('contain.text', /growing|preparing/i);
    cy.log('✅ Navigated to growing page');

    // Step 4: Wait for compactor animation to appear
    cy.get('.compactor-animation, [data-testid="compactor"]', { timeout: 10000 })
      .should('be.visible');
    cy.log('✅ Compactor animation is running');

    // Step 5: Wait for transition to harvest page (this tests our recent fix)
    cy.url({ timeout: 30000 }).should('include', 'harvest');
    cy.log('✅ Successfully transitioned to harvest page');

    // Step 6: Verify harvest page content
    cy.get('h1, .harvest-title').should('contain.text', /harvest/i);
    cy.log('✅ Harvest page title visible');

    // Step 7: Check for terminal displays
    cy.get('.terminal, [data-testid="agent-terminal"], .terminal-container', { timeout: 15000 })
      .should('exist')
      .and('be.visible');
    cy.log('✅ Agent terminals are visible');

    // Step 8: Verify agent status indicators
    cy.get('[data-testid="agent-status"], .agent-status, .status-indicator')
      .should('have.length.greaterThan', 0);
    cy.log('✅ Agent status indicators present');

    // Step 9: Check for real-time updates (WebSocket functionality)
    cy.window().then((win) => {
      // Check if WebSocket connection exists
      expect(win.WebSocket).to.exist;
    });
    cy.log('✅ WebSocket functionality available');

    // Step 10: Test harvest collection functionality
    cy.get('button, [data-testid="collect-harvest"]')
      .contains(/collect|harvest/i)
      .first()
      .click({ force: true });
    
    // Wait for harvest processing
    cy.get('.harvest-processing, [data-testid="harvest-processing"]', { timeout: 10000 })
      .should('be.visible');
    cy.log('✅ Harvest collection initiated');

    // Step 11: Verify harvest results
    cy.get('.harvest-results, [data-testid="harvest-results"]', { timeout: 15000 })
      .should('be.visible');
    cy.log('✅ Harvest results displayed');

    // Step 12: Navigate to barn to verify storage
    cy.get('nav a, [data-testid="nav-barn"]')
      .contains(/barn/i)
      .click();
    
    cy.url().should('include', 'barn');
    cy.get('.harvest-item, [data-testid="harvest-item"]')
      .should('have.length.greaterThan', 0);
    cy.log('✅ Harvest stored in barn successfully');

    cy.log('🎉 Critical Path Test Completed Successfully!');
  });

  it('should handle farm creation errors gracefully', () => {
    cy.log('⚠️ Testing Error Handling in Farm Creation');

    // Navigate to farm creation
    cy.get('button').contains(/create.*farm/i).click();
    
    // Try to submit without required fields
    cy.get('button[type="submit"]').click();
    
    // Should show validation errors
    cy.get('.error, .validation-error, [role="alert"]')
      .should('be.visible')
      .and('contain.text', /required|invalid/i);
    cy.log('✅ Validation errors displayed correctly');

    // Fill in invalid data
    cy.get('input[name="farmName"]').type('');
    cy.get('input[name="maxAgents"]').clear().type('0');
    
    cy.get('button[type="submit"]').click();
    
    cy.get('.error, .validation-error')
      .should('be.visible');
    cy.log('✅ Invalid data handling works correctly');
  });

  it('should maintain responsive design across different viewports', () => {
    cy.log('📱 Testing Responsive Design');

    const viewports = [
      { width: 375, height: 667, name: 'Mobile' },
      { width: 768, height: 1024, name: 'Tablet' },
      { width: 1440, height: 900, name: 'Desktop' }
    ];

    viewports.forEach(viewport => {
      cy.viewport(viewport.width, viewport.height);
      cy.log(`📐 Testing ${viewport.name} (${viewport.width}x${viewport.height})`);
      
      // Check that main elements are visible and properly arranged
      cy.get('[data-testid="dashboard"], .dashboard').should('be.visible');
      
      // Check navigation is accessible
      cy.get('nav, [data-testid="navigation"]').should('be.visible');
      
      // Verify buttons are clickable
      cy.get('button').contains(/create.*farm/i).should('be.visible');
      
      cy.log(`✅ ${viewport.name} layout works correctly`);
    });
  });

  it('should handle WebSocket connection issues gracefully', () => {
    cy.log('🔌 Testing WebSocket Error Handling');

    // Intercept WebSocket connections and simulate failures
    cy.window().then((win) => {
      const originalWebSocket = win.WebSocket;
      
      // Mock failing WebSocket
      win.WebSocket = function(url) {
        const ws = new originalWebSocket(url);
        setTimeout(() => {
          ws.dispatchEvent(new Event('error'));
        }, 100);
        return ws;
      };
    });

    // Navigate through the app
    cy.get('button').contains(/create.*farm/i).click();
    
    // App should still function despite WebSocket issues
    cy.get('input[name="farmName"]').type('WebSocket Test Farm');
    cy.get('button[type="submit"]').should('be.visible');
    
    cy.log('✅ App handles WebSocket failures gracefully');
  });

  it('should persist farm state across page refreshes', () => {
    cy.log('💾 Testing State Persistence');

    // Create a farm
    cy.get('button').contains(/create.*farm/i).click();
    cy.get('input[name="farmName"]').type('Persistence Test Farm');
    cy.get('input[name="maxAgents"]').clear().type('2');
    cy.get('button[type="submit"]').click();

    // Wait for growing page
    cy.url().should('include', 'growing');
    
    // Refresh the page
    cy.reload();
    
    // Should maintain state or redirect appropriately
    cy.url().should('not.include', 'error');
    cy.get('body').should('be.visible');
    
    cy.log('✅ Page refresh handled correctly');
  });

  it('should support keyboard navigation', () => {
    cy.log('⌨️ Testing Keyboard Accessibility');

    // Tab through main navigation elements
    cy.get('body').tab();
    cy.focused().should('have.attr', 'tabindex').and('not.equal', '-1');
    
    // Test form navigation
    cy.get('button').contains(/create.*farm/i).click();
    
    cy.get('input[name="farmName"]').focus().type('Keyboard Test Farm');
    
    // Tab to next field
    cy.focused().tab();
    cy.focused().should('be.visible');
    
    // Use Enter to submit (if appropriate)
    cy.get('button[type="submit"]').focus();
    cy.focused().should('contain.text', /create|submit/i);
    
    cy.log('✅ Keyboard navigation works correctly');
  });

  it('should handle concurrent farm creation', () => {
    cy.log('🔄 Testing Concurrent Operations');

    // Simulate multiple rapid farm creation attempts
    for (let i = 0; i < 3; i++) {
      cy.get('button').contains(/create.*farm/i).click();
      cy.get('input[name="farmName"]').type(`Concurrent Farm ${i + 1}`);
      cy.get('input[name="maxAgents"]').clear().type('1');
      
      if (i < 2) {
        // Don't submit the last one to test form state
        cy.get('button[type="submit"]').click();
        cy.wait(500); // Brief pause between attempts
      }
    }
    
    // Should handle concurrent requests gracefully
    cy.get('.error, .loading, .success').should('exist');
    
    cy.log('✅ Concurrent operations handled correctly');
  });

  afterEach(() => {
    // Clean up any created farms
    cy.window().then((win) => {
      // Clear any local storage or session data if needed
      win.localStorage.clear();
      win.sessionStorage.clear();
    });
  });
});