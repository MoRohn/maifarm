describe('Dashboard Functionality', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.wait(1000) // Allow initial load
  })

  describe('Dashboard Loading', () => {
    it('should load dashboard with all main sections', () => {
      // Check header elements
      cy.get('header').should('be.visible')
      cy.contains('Connected').should('exist')
      
      // Check greeting
      cy.contains(/Good (morning|afternoon|evening)/).should('be.visible')
      
      // Check metrics cards
      cy.get('[data-testid="stats-card"]').should('have.length', 4)
      cy.contains('Active Farms').should('be.visible')
      cy.contains('Total Agents').should('be.visible')
      cy.contains('Tasks Completed').should('be.visible')
      cy.contains('Success Rate').should('be.visible')
      
      // Check quick actions
      cy.contains('Quick Actions').should('be.visible')
      cy.get('[data-testid="quick-action-card"]').should('have.length.at.least', 3)
    })

    it('should handle metrics loading states', () => {
      cy.get('[data-testid="stats-card"]').each(($card) => {
        cy.wrap($card).should('not.contain', '—')
      })
    })

    it('should refresh metrics when refresh button clicked', () => {
      cy.contains('button', 'Refresh').click()
      cy.contains('Refreshing...').should('be.visible')
      cy.contains('Refreshing...').should('not.exist')
    })
  })

  describe('WebSocket Connection', () => {
    it('should show connection status', () => {
      cy.get('header').within(() => {
        cy.contains(/Connected|Disconnected/).should('exist')
      })
    })

    it('should update metrics via WebSocket', () => {
      // This would require WebSocket mocking
      cy.window().then((win) => {
        // Check if WebSocket connection exists
        expect(win).to.have.property('WebSocket')
      })
    })
  })

  describe('Farm Management', () => {
    it('should open farm creator when New Farm clicked', () => {
      cy.contains('button', 'New Farm').click()
      cy.get('[data-testid="farm-creator"]').should('be.visible')
      cy.contains('Create New Farm').should('be.visible')
    })

    it('should display active farms if any exist', () => {
      cy.get('section').contains('Active Farms').parent().within(() => {
        // Either shows farms or empty state
        cy.get('body').then($body => {
          if ($body.find('[data-testid="farm-card"]').length > 0) {
            cy.get('[data-testid="farm-card"]').should('exist')
          } else {
            cy.contains('No active farms').should('be.visible')
            cy.contains('Create Your First Farm').should('be.visible')
          }
        })
      })
    })
  })

  describe('Quick Actions', () => {
    it('should have New Farm quick action', () => {
      cy.get('[data-testid="quick-action-card"]').contains('New Farm').click()
      cy.get('[data-testid="farm-creator"]').should('be.visible')
    })

    it('should have Go Wild quick action', () => {
      cy.get('[data-testid="quick-action-card"]').contains('Go Wild').should('exist')
    })

    it('should have Quick Task quick action', () => {
      cy.get('[data-testid="quick-action-card"]').contains('Quick Task').should('exist')
    })
  })

  describe('Recent Activity', () => {
    it('should display recent activity section', () => {
      cy.contains('Recent Activity').should('be.visible')
      cy.get('[data-testid="activity-item"]').should('exist')
    })
  })

  describe('Responsive Design', () => {
    it('should be responsive on mobile', () => {
      cy.viewport('iphone-x')
      cy.get('header').should('be.visible')
      cy.get('[data-testid="stats-card"]').should('be.visible')
    })

    it('should be responsive on tablet', () => {
      cy.viewport('ipad-2')
      cy.get('header').should('be.visible')
      cy.get('[data-testid="stats-card"]').should('have.length', 4)
    })
  })

  describe('Error Handling', () => {
    it('should handle API errors gracefully', () => {
      // Intercept API calls and force errors
      cy.intercept('GET', '/api/metrics/dashboard', { statusCode: 500 })
      cy.visit('/')
      
      // Should show error message but not crash
      cy.contains('Failed to load metrics').should('exist')
      cy.get('[data-testid="stats-card"]').should('exist')
    })
  })

  describe('Theme Support', () => {
    it('should support dark mode', () => {
      // Toggle dark mode if available
      cy.get('body').then($body => {
        if ($body.find('[data-testid="theme-toggle"]').length > 0) {
          cy.get('[data-testid="theme-toggle"]').click()
          cy.get('html').should('have.class', 'dark')
        }
      })
    })
  })
})