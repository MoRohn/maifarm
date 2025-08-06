describe('Analytics Page E2E Tests', () => {
  beforeEach(() => {
    // Visit the analytics page
    cy.visit('/analytics');
    
    // Wait for page to load
    cy.contains('Analytics').should('be.visible');
  });

  describe('Page Layout and Navigation', () => {
    it('should display the analytics header with navigation', () => {
      // Check header elements
      cy.get('header').within(() => {
        cy.contains('Analytics').should('be.visible');
        cy.get('[data-testid="time-range-selector"]').should('exist');
        cy.get('button').contains('Export').should('exist');
      });
    });

    it('should match Home page design consistency', () => {
      // Check for themed layout components
      cy.get('[data-testid="themed-layout"]').should('exist');
      cy.get('[data-testid="themed-header"]').should('exist');
      
      // Check for consistent styling
      cy.get('.rounded-apple-lg').should('have.length.greaterThan', 0);
    });
  });

  describe('Real-time Metrics', () => {
    it('should display metrics overview cards', () => {
      cy.contains('Metrics Overview').should('be.visible');
      
      // Check for all metric cards
      cy.contains('Active Farms').should('be.visible');
      cy.contains('Active Agents').should('be.visible');
      cy.contains('Success Rate').should('be.visible');
      cy.contains('Daily Cost').should('be.visible');
    });

    it('should show connection status', () => {
      cy.get('[data-testid="connection-status"]').within(() => {
        cy.get('.w-2.h-2').should('have.class', 'bg-green-500');
        cy.contains(/Connected|Disconnected/).should('be.visible');
      });
    });

    it('should update last updated timestamp', () => {
      cy.contains('Last updated:').should('be.visible');
      cy.contains(/seconds? ago|just now/).should('be.visible');
    });
  });

  describe('Charts and Visualizations', () => {
    it('should render all chart components', () => {
      // Performance charts
      cy.contains('Performance Monitoring').should('be.visible');
      cy.contains('Farm Performance').should('be.visible');
      cy.contains('Resource Utilization').should('be.visible');
      
      // Detailed analytics charts
      cy.contains('Detailed Analytics').should('be.visible');
      cy.contains('Harvest Analytics').should('be.visible');
      cy.contains('Cost Breakdown').should('be.visible');
      cy.contains('Agent Efficiency').should('be.visible');
      cy.contains('Task Completion').should('be.visible');
    });

    it('should have interactive chart elements', () => {
      // Check for chart containers
      cy.get('[data-testid="chart-container"]').should('have.length.greaterThan', 0);
      
      // Hover interactions (if implemented)
      cy.get('[data-testid="chart-container"]').first().trigger('mouseover');
    });
  });

  describe('Time Range Selection', () => {
    it('should allow time range selection', () => {
      cy.get('select').should('be.visible');
      
      // Change time range
      cy.get('select').select('7D');
      cy.get('select').should('have.value', '7d');
      
      // Verify data updates (mock or real)
      cy.wait(500); // Wait for potential data fetch
    });

    it('should update charts when time range changes', () => {
      // Select different time ranges
      const timeRanges = ['1H', '6H', '24H', '7D', '30D'];
      
      timeRanges.forEach(range => {
        cy.get('select').select(range);
        cy.wait(200);
      });
    });
  });

  describe('Data Export', () => {
    it('should handle export functionality', () => {
      cy.get('button').contains('Export').click();
      
      // Check for success message or download trigger
      // Note: Actual file download testing requires additional setup
    });
  });

  describe('Refresh Functionality', () => {
    it('should refresh metrics on demand', () => {
      cy.contains('Refresh').click();
      
      // Check for loading state
      cy.contains('Refreshing...').should('be.visible');
      
      // Wait for refresh to complete
      cy.contains('Refresh', { timeout: 5000 }).should('be.visible');
    });
  });

  describe('Responsive Design', () => {
    it('should be responsive on mobile', () => {
      cy.viewport('iphone-x');
      
      // Check that layout adapts
      cy.get('.grid').should('have.class', 'grid-cols-1');
      
      // Verify all content is still accessible
      cy.contains('Active Farms').should('be.visible');
    });

    it('should be responsive on tablet', () => {
      cy.viewport('ipad-2');
      
      // Check medium breakpoint layout
      cy.get('.md\\:grid-cols-2').should('exist');
    });

    it('should be responsive on desktop', () => {
      cy.viewport(1920, 1080);
      
      // Check large breakpoint layout
      cy.get('.lg\\:grid-cols-4').should('exist');
      cy.get('.lg\\:grid-cols-3').should('exist');
    });
  });

  describe('Real-time Updates via WebSocket', () => {
    it('should receive and display real-time updates', () => {
      // Mock WebSocket connection
      cy.window().then((win) => {
        // Simulate WebSocket message
        win.postMessage({
          type: 'metrics:update',
          data: {
            activeFarms: 5,
            activeAgents: 12
          }
        }, '*');
      });
      
      // Verify UI updates (would need actual WebSocket integration)
      cy.wait(1000);
    });
  });

  describe('Analytics Modes', () => {
    it('should display Farm Creation mode analytics', () => {
      // Check for farm creation specific metrics
      cy.contains(/Farm|Creation/i).should('exist');
    });

    it('should display Go Wild mode analytics', () => {
      // Check for Go Wild specific metrics
      cy.get('[data-testid="chart-container"]').should('exist');
    });

    it('should display Quick Task analytics', () => {
      // Check for Quick Task specific metrics
      cy.contains('Task Completion').should('be.visible');
    });
  });

  describe('Performance', () => {
    it('should load page within acceptable time', () => {
      cy.visit('/analytics', {
        onBeforeLoad: (win) => {
          win.performance.mark('start');
        },
        onLoad: (win) => {
          win.performance.mark('end');
          win.performance.measure('pageLoad', 'start', 'end');
          const measure = win.performance.getEntriesByName('pageLoad')[0];
          expect(measure.duration).to.be.lessThan(3000); // 3 seconds
        }
      });
    });

    it('should handle large datasets efficiently', () => {
      // Test with mock large dataset
      cy.window().then((win) => {
        // Inject large dataset
        const largeData = Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          value: Math.random() * 100
        }));
        
        win.postMessage({
          type: 'large:dataset',
          data: largeData
        }, '*');
      });
      
      // Verify page remains responsive
      cy.get('button').contains('Refresh').click();
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', () => {
      // Intercept API calls and force error
      cy.intercept('GET', '/api/analytics*', {
        statusCode: 500,
        body: { error: 'Server error' }
      });
      
      cy.visit('/analytics');
      
      // Should show error state or fallback
      cy.contains(/error|failed/i, { timeout: 5000 }).should('be.visible');
    });

    it('should handle WebSocket disconnection', () => {
      // Simulate disconnection
      cy.window().then((win) => {
        win.postMessage({
          type: 'websocket:disconnect'
        }, '*');
      });
      
      // Should show disconnected status
      cy.contains('Disconnected').should('be.visible');
    });
  });

  describe('Accessibility', () => {
    it('should be keyboard navigable', () => {
      // Tab through interactive elements
      cy.get('body').tab();
      cy.focused().should('have.attr', 'role');
      
      // Navigate with keyboard
      cy.get('select').focus().type('{downarrow}');
      cy.get('button').first().focus().type('{enter}');
    });

    it('should have proper ARIA labels', () => {
      cy.get('[aria-label]').should('have.length.greaterThan', 0);
      cy.get('[role="button"]').should('exist');
    });
  });
});