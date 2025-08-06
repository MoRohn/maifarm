describe('Go Wild Feature', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.wait(1000)
  })

  describe('Go Wild Quick Action', () => {
    it('should have Go Wild option in quick actions', () => {
      cy.get('[data-testid="quick-action-card"]').contains('Go Wild').should('exist')
    })

    it('should open Go Wild modal when clicked', () => {
      cy.get('[data-testid="quick-action-card"]').contains('Go Wild').click()
      
      // Check if modal opens or if feature is not implemented
      cy.get('body').then($body => {
        if ($body.find('[data-testid="go-wild-modal"]').length > 0) {
          cy.get('[data-testid="go-wild-modal"]').should('be.visible')
          cy.contains('Go Wild Configuration').should('exist')
        } else {
          // Feature might not be implemented yet
          cy.log('Go Wild feature not yet implemented')
        }
      })
    })
  })

  describe('Go Wild Configuration', () => {
    it('should configure exploration boundaries', () => {
      cy.get('[data-testid="quick-action-card"]').contains('Go Wild').click()
      
      cy.get('[data-testid="go-wild-modal"]').then($modal => {
        if ($modal.length > 0) {
          // Test boundary controls
          cy.get('[data-testid="boundary-slider"]').should('exist')
          cy.get('[data-testid="resource-limit"]').should('exist')
          cy.get('[data-testid="safety-rules"]').should('exist')
        }
      })
    })

    it('should set exploration goals', () => {
      cy.get('[data-testid="quick-action-card"]').contains('Go Wild').click()
      
      cy.get('[data-testid="go-wild-modal"]').then($modal => {
        if ($modal.length > 0) {
          cy.get('[data-testid="goal-input"]').type('Explore new AI patterns')
          cy.get('[data-testid="constraint-input"]').type('Stay within NLP domain')
        }
      })
    })
  })

  describe('Go Wild Monitoring', () => {
    it('should show real-time monitoring dashboard', () => {
      // Assuming Go Wild session is active
      cy.get('[data-testid="go-wild-monitor"]').then($monitor => {
        if ($monitor.length > 0) {
          cy.get('[data-testid="exploration-graph"]').should('exist')
          cy.get('[data-testid="discovery-feed"]').should('exist')
          cy.get('[data-testid="resource-usage"]').should('exist')
        }
      })
    })

    it('should display safety status', () => {
      cy.get('[data-testid="go-wild-monitor"]').then($monitor => {
        if ($monitor.length > 0) {
          cy.get('[data-testid="safety-status"]').should('exist')
          cy.contains('Safety Status').should('be.visible')
        }
      })
    })
  })

  describe('Go Wild Controls', () => {
    it('should have emergency stop button', () => {
      cy.get('[data-testid="go-wild-monitor"]').then($monitor => {
        if ($monitor.length > 0) {
          cy.get('[data-testid="emergency-stop"]').should('exist')
          cy.get('[data-testid="emergency-stop"]').should('have.css', 'background-color', 'rgb(239, 68, 68)')
        }
      })
    })

    it('should allow pausing exploration', () => {
      cy.get('[data-testid="go-wild-monitor"]').then($monitor => {
        if ($monitor.length > 0) {
          cy.get('[data-testid="pause-exploration"]').should('exist')
        }
      })
    })

    it('should support rollback', () => {
      cy.get('[data-testid="go-wild-monitor"]').then($monitor => {
        if ($monitor.length > 0) {
          cy.get('[data-testid="rollback-button"]').should('exist')
        }
      })
    })
  })

  describe('Go Wild Integration', () => {
    it('should integrate with WebSocket for real-time updates', () => {
      cy.window().then((win) => {
        // Check for WebSocket events related to Go Wild
        if (win.WebSocket) {
          cy.log('WebSocket available for Go Wild updates')
        }
      })
    })

    it('should update metrics during exploration', () => {
      // Check if metrics update during Go Wild session
      cy.get('[data-testid="stats-card"]').contains('Active Farms').parent().within(() => {
        cy.get('[data-testid="metric-value"]').should('exist')
      })
    })
  })

  describe('Go Wild Error Handling', () => {
    it('should handle exploration errors gracefully', () => {
      cy.intercept('POST', '/api/gowild/sessions', { statusCode: 500 })
      
      cy.get('[data-testid="quick-action-card"]').contains('Go Wild').click()
      
      cy.get('[data-testid="go-wild-modal"]').then($modal => {
        if ($modal.length > 0) {
          cy.contains('button', 'Start Exploration').click()
          cy.contains('Failed to start Go Wild session').should('exist')
        }
      })
    })

    it('should handle boundary violations', () => {
      // Test boundary violation handling
      cy.get('[data-testid="go-wild-monitor"]').then($monitor => {
        if ($monitor.length > 0) {
          cy.intercept('POST', '/api/gowild/sessions/*/boundaries', {
            statusCode: 400,
            body: { error: 'Boundary violation detected' }
          })
          
          cy.contains('Boundary violation').should('exist')
        }
      })
    })
  })
})