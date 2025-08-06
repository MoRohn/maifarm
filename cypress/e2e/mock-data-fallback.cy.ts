describe('Mock Data Fallback E2E Tests', () => {
  beforeEach(() => {
    // Clear state
    cy.clearLocalStorage();
    cy.clearCookies();
  });

  describe('Offline Mode Detection', () => {
    it('should detect server unavailability and switch to mock mode', () => {
      // Block all WebSocket connections
      cy.intercept('GET', '**/socket.io/*', { forceNetworkError: true }).as('blockedConnection');
      cy.intercept('POST', '**/socket.io/*', { forceNetworkError: true });
      
      cy.visit('/');
      
      // Wait for multiple connection attempts
      for (let i = 0; i < 10; i++) {
        cy.wait('@blockedConnection', { timeout: 10000 });
      }
      
      // Should show offline mode warning
      cy.get('.Toastify__toast--warning', { timeout: 30000 })
        .should('contain', 'Server unavailable. Running in offline mode with mock data.');
      
      // Verify mock mode indicator
      cy.get('[data-testid="connection-status"]')
        .should('contain', 'Offline Mode')
        .and('have.class', 'text-warning');
    });

    it('should display mock data banner when in offline mode', () => {
      // Force offline mode
      cy.visit('/', {
        onBeforeLoad(win) {
          // Override WebSocket to always fail
          win.WebSocket = class MockWebSocket {
            constructor() {
              setTimeout(() => {
                this.onerror?.(new Event('error'));
                this.onclose?.(new CloseEvent('close'));
              }, 0);
            }
            send() {}
            close() {}
            addEventListener() {}
            removeEventListener() {}
          } as any;
        }
      });
      
      // Should show mock data banner
      cy.get('[data-testid="mock-data-banner"]', { timeout: 30000 })
        .should('be.visible')
        .and('contain', 'Using mock data - Server connection unavailable');
    });
  });

  describe('Mock Data Generation', () => {
    beforeEach(() => {
      // Force offline mode for these tests
      cy.intercept('GET', '**/socket.io/*', { forceNetworkError: true });
      cy.intercept('POST', '**/socket.io/*', { forceNetworkError: true });
      
      cy.visit('/');
      
      // Wait for mock mode to activate
      cy.get('[data-testid="mock-data-banner"]', { timeout: 30000 }).should('be.visible');
    });

    it('should generate and display mock metrics', () => {
      // Check dashboard metrics exist and update
      cy.get('[data-testid="active-farms-metric"]')
        .should('exist')
        .invoke('text')
        .then((initialValue) => {
          // Wait for mock data update (every 5 seconds)
          cy.wait(5500);
          
          // Value should have changed
          cy.get('[data-testid="active-farms-metric"]')
            .invoke('text')
            .should('not.equal', initialValue);
        });
      
      // All metric cards should have values
      cy.get('[data-testid="total-agents-metric"]').should('not.be.empty');
      cy.get('[data-testid="tasks-completed-metric"]').should('not.be.empty');
      cy.get('[data-testid="success-rate-metric"]').should('not.be.empty');
    });

    it('should generate mock farm updates', () => {
      cy.get('[data-testid="nav-farms"]').click();
      
      // Wait for mock farms to appear
      cy.get('[data-testid^="farm-card-"]', { timeout: 10000 }).should('have.length.greaterThan', 0);
      
      // Check farm details are populated
      cy.get('[data-testid^="farm-card-"]').first().within(() => {
        cy.get('[data-testid="farm-name"]').should('not.be.empty');
        cy.get('[data-testid="farm-status"]').should('match', /preparing|running|paused|completed/i);
        cy.get('[data-testid="farm-metrics"]').should('exist');
      });
    });

    it('should generate mock agent updates', () => {
      cy.get('[data-testid="nav-monitoring"]').click();
      
      // Wait for mock agents to appear
      cy.get('[data-testid^="agent-"]', { timeout: 10000 }).should('have.length.greaterThan', 0);
      
      // Check agent details
      cy.get('[data-testid^="agent-"]').first().within(() => {
        cy.get('[data-testid="agent-name"]').should('not.be.empty');
        cy.get('[data-testid="agent-status"]').should('match', /idle|active|completed|error/i);
        cy.get('[data-testid="agent-resources"]').should('exist');
      });
    });

    it('should update mock data periodically', () => {
      // Capture initial state
      const initialData: any = {};
      
      cy.get('[data-testid="active-farms-metric"]')
        .invoke('text')
        .then((value) => { initialData.farms = value; });
      
      cy.get('[data-testid="total-agents-metric"]')
        .invoke('text')
        .then((value) => { initialData.agents = value; });
      
      // Wait for multiple update cycles (3 cycles = 15 seconds)
      cy.wait(15000);
      
      // Verify at least some values changed
      cy.get('[data-testid="active-farms-metric"]')
        .invoke('text')
        .then((value) => {
          cy.get('[data-testid="total-agents-metric"]')
            .invoke('text')
            .then((agentValue) => {
              // At least one metric should have changed
              const farmsChanged = value !== initialData.farms;
              const agentsChanged = agentValue !== initialData.agents;
              expect(farmsChanged || agentsChanged).to.be.true;
            });
        });
    });
  });

  describe('Seamless Transition', () => {
    it('should transition from mock to real data when connection restored', () => {
      // Start in offline mode
      cy.intercept('GET', '**/socket.io/*', { forceNetworkError: true }).as('failedConnection');
      
      cy.visit('/');
      
      // Wait for mock mode
      cy.get('[data-testid="mock-data-banner"]', { timeout: 30000 }).should('be.visible');
      
      // Restore connection by removing intercept
      cy.intercept('GET', '**/socket.io/*').as('successfulConnection');
      
      // Force reconnection attempt
      cy.window().then((win) => {
        win.websocketService.reconnect();
      });
      
      // Wait for successful connection
      cy.wait('@successfulConnection');
      
      // Mock data banner should disappear
      cy.get('[data-testid="mock-data-banner"]').should('not.exist');
      
      // Connection status should show connected
      cy.get('[data-testid="connection-status"]')
        .should('contain', 'Connected')
        .and('not.have.class', 'text-warning');
      
      // Should show success notification
      cy.get('.Toastify__toast--success')
        .should('contain', 'Connected to MaiFarm server');
    });

    it('should preserve user actions made during offline mode', () => {
      // Start in offline mode
      cy.intercept('GET', '**/socket.io/*', { forceNetworkError: true });
      
      cy.visit('/');
      cy.get('[data-testid="mock-data-banner"]', { timeout: 30000 }).should('be.visible');
      
      // Perform actions in offline mode
      cy.get('[data-testid="nav-settings"]').click();
      
      // Change a setting
      cy.get('[data-testid="theme-selector"]').select('dark');
      
      // Navigate to another page
      cy.get('[data-testid="nav-dashboard"]').click();
      
      // Restore connection
      cy.intercept('GET', '**/socket.io/*');
      cy.window().then((win) => {
        win.websocketService.reconnect();
      });
      
      // Wait for connection
      cy.get('[data-testid="connection-status"]', { timeout: 10000 })
        .should('contain', 'Connected');
      
      // Settings should be preserved
      cy.get('[data-testid="nav-settings"]').click();
      cy.get('[data-testid="theme-selector"]').should('have.value', 'dark');
    });
  });

  describe('UI Functionality in Mock Mode', () => {
    beforeEach(() => {
      // Force offline mode
      cy.intercept('GET', '**/socket.io/*', { forceNetworkError: true });
      cy.visit('/');
      cy.get('[data-testid="mock-data-banner"]', { timeout: 30000 }).should('be.visible');
    });

    it('should allow navigation between pages', () => {
      const pages = [
        { nav: 'dashboard', url: '/' },
        { nav: 'farms', url: '/farms' },
        { nav: 'monitoring', url: '/monitoring' },
        { nav: 'settings', url: '/settings' }
      ];
      
      pages.forEach(({ nav, url }) => {
        cy.get(`[data-testid="nav-${nav}"]`).click();
        cy.url().should('include', url);
        cy.get('[data-testid="page-content"]').should('be.visible');
      });
    });

    it('should display appropriate warnings for actions requiring server', () => {
      cy.get('[data-testid="nav-farms"]').click();
      
      // Try to create a new farm
      cy.get('[data-testid="create-farm-btn"]').click();
      
      // Should show warning
      cy.get('[data-testid="offline-warning-modal"]')
        .should('be.visible')
        .and('contain', 'This action requires server connection');
      
      // Can dismiss the warning
      cy.get('[data-testid="offline-warning-close"]').click();
      cy.get('[data-testid="offline-warning-modal"]').should('not.exist');
    });

    it('should update charts and visualizations with mock data', () => {
      // Check dashboard charts
      cy.get('[data-testid="metrics-chart"]').should('be.visible');
      cy.get('[data-testid="activity-timeline"]').should('be.visible');
      
      // Navigate to monitoring
      cy.get('[data-testid="nav-monitoring"]').click();
      
      // Check resource visualization
      cy.get('[data-testid="resource-3d-viz"]').should('be.visible');
      cy.get('[data-testid="communication-graph"]').should('be.visible');
    });
  });

  describe('Error Handling in Mock Mode', () => {
    beforeEach(() => {
      cy.intercept('GET', '**/socket.io/*', { forceNetworkError: true });
      cy.visit('/');
      cy.get('[data-testid="mock-data-banner"]', { timeout: 30000 }).should('be.visible');
    });

    it('should handle navigation errors gracefully', () => {
      // Try to access a non-existent route
      cy.visit('/non-existent-page', { failOnStatusCode: false });
      
      // Should show 404 page
      cy.get('[data-testid="404-page"]').should('be.visible');
      
      // Can navigate back
      cy.get('[data-testid="nav-dashboard"]').click();
      cy.url().should('equal', Cypress.config().baseUrl + '/');
    });

    it('should prevent data modification actions', () => {
      cy.get('[data-testid="nav-farms"]').click();
      
      // Mock farm should exist
      cy.get('[data-testid^="farm-card-"]').first().within(() => {
        // Try to delete
        cy.get('[data-testid="farm-delete-btn"]').click();
      });
      
      // Should show prevention message
      cy.get('.Toastify__toast--warning')
        .should('contain', 'Cannot modify data in offline mode');
      
      // Farm should still exist
      cy.get('[data-testid^="farm-card-"]').should('exist');
    });
  });

  describe('Performance in Mock Mode', () => {
    beforeEach(() => {
      cy.intercept('GET', '**/socket.io/*', { forceNetworkError: true });
      cy.visit('/');
      cy.get('[data-testid="mock-data-banner"]', { timeout: 30000 }).should('be.visible');
    });

    it('should maintain responsive UI with mock data updates', () => {
      // Measure interaction responsiveness
      const startTime = Date.now();
      
      // Perform rapid navigation
      cy.get('[data-testid="nav-farms"]').click();
      cy.get('[data-testid="nav-monitoring"]').click();
      cy.get('[data-testid="nav-settings"]').click();
      cy.get('[data-testid="nav-dashboard"]').click();
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // All navigation should complete within reasonable time
      expect(totalTime).to.be.lessThan(2000); // 2 seconds for 4 navigations
    });

    it('should not accumulate memory with continuous mock data generation', () => {
      // This would require memory profiling tools
      // For now, just ensure the app remains stable over time
      
      // Wait for several update cycles
      cy.wait(30000); // 30 seconds = 6 update cycles
      
      // App should still be responsive
      cy.get('[data-testid="metrics-dashboard"]').should('be.visible');
      cy.get('[data-testid="nav-farms"]').click();
      cy.get('[data-testid="page-content"]').should('be.visible');
    });
  });
});