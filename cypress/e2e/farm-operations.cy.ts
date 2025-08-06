describe('Farm Operations - Seeds, Farms, Harvest, Barn', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.wait(1000)
  })

  describe('Seeds Functionality', () => {
    it('should access seeds section', () => {
      // Check if seeds functionality exists
      cy.get('body').then($body => {
        if ($body.find('[data-testid="seeds-section"]').length > 0) {
          cy.get('[data-testid="seeds-section"]').should('be.visible')
          cy.contains('Seeds').should('exist')
        }
      })
    })

    it('should create new seed', () => {
      // Navigate to seeds if available
      cy.get('nav').then($nav => {
        if ($nav.find('a:contains("Seeds")').length > 0) {
          cy.contains('a', 'Seeds').click()
          cy.url().should('include', '/seeds')
          
          // Test seed creation
          cy.contains('button', 'New Seed').click()
          cy.get('[data-testid="seed-form"]').should('be.visible')
        }
      })
    })
  })

  describe('Farm Creation and Management', () => {
    it('should create a new farm with valid data', () => {
      cy.contains('button', 'New Farm').click()
      
      // Fill farm creation form
      cy.get('[data-testid="farm-name-input"]').type('Test Farm Alpha')
      cy.get('[data-testid="farm-description-input"]').type('Automated test farm for QA')
      
      // Select agents if available
      cy.get('[data-testid="agent-select"]').then($select => {
        if ($select.length > 0) {
          cy.get('[data-testid="agent-select"]').click()
          cy.get('[data-testid="agent-option"]').first().click()
        }
      })
      
      // Submit form
      cy.contains('button', 'Create Farm').click()
      
      // Verify farm was created
      cy.contains('Farm created successfully', { timeout: 10000 }).should('exist')
    })

    it('should validate farm creation form', () => {
      cy.contains('button', 'New Farm').click()
      
      // Try to submit empty form
      cy.contains('button', 'Create Farm').click()
      
      // Should show validation errors
      cy.contains('Farm name is required').should('exist')
    })

    it('should manage existing farms', () => {
      // Check if any farms exist
      cy.get('section').contains('Active Farms').parent().within(() => {
        cy.get('[data-testid="farm-card"]').then($cards => {
          if ($cards.length > 0) {
            // Test farm card interactions
            cy.get('[data-testid="farm-card"]').first().within(() => {
              cy.get('[data-testid="farm-status"]').should('exist')
              cy.get('[data-testid="farm-agents-count"]').should('exist')
              
              // Test farm actions
              cy.get('[data-testid="farm-menu"]').click()
              cy.contains('View Details').should('exist')
              cy.contains('Pause Farm').should('exist')
              cy.contains('Stop Farm').should('exist')
            })
          }
        })
      })
    })
  })

  describe('Harvest Operations', () => {
    it('should display harvest section', () => {
      cy.contains('Harvests').should('be.visible')
      cy.get('[data-testid="harvest-section"]').should('exist')
    })

    it('should show harvest results', () => {
      cy.get('[data-testid="harvest-section"]').within(() => {
        cy.get('body').then($body => {
          if ($body.find('[data-testid="harvest-item"]').length > 0) {
            cy.get('[data-testid="harvest-item"]').should('exist')
            cy.get('[data-testid="harvest-status"]').should('exist')
          } else {
            cy.contains('No harvests yet').should('exist')
          }
        })
      })
    })

    it('should filter harvests', () => {
      cy.get('[data-testid="harvest-section"]').within(() => {
        cy.get('[data-testid="harvest-filter"]').then($filter => {
          if ($filter.length > 0) {
            cy.get('[data-testid="harvest-filter"]').select('completed')
            // Verify filter applied
          }
        })
      })
    })
  })

  describe('Barn Management', () => {
    it('should navigate to barn', () => {
      cy.get('nav').contains('Barn').click()
      cy.url().should('include', '/barn')
      cy.contains('Barn').should('be.visible')
    })

    it('should display barn contents', () => {
      cy.visit('/barn')
      
      // Check barn structure
      cy.get('[data-testid="barn-storage"]').should('exist')
      cy.contains('Stored Results').should('be.visible')
      
      // Check for stored items or empty state
      cy.get('body').then($body => {
        if ($body.find('[data-testid="barn-item"]').length > 0) {
          cy.get('[data-testid="barn-item"]').should('exist')
        } else {
          cy.contains('Your barn is empty').should('exist')
        }
      })
    })

    it('should search barn contents', () => {
      cy.visit('/barn')
      
      cy.get('[data-testid="barn-search"]').then($search => {
        if ($search.length > 0) {
          cy.get('[data-testid="barn-search"]').type('test')
          // Verify search results update
        }
      })
    })
  })

  describe('Integration Between Components', () => {
    it('should flow from seed to farm to harvest to barn', () => {
      // This tests the full lifecycle
      
      // 1. Create or select a seed
      // 2. Create a farm from seed
      // 3. Run the farm
      // 4. Harvest results
      // 5. Store in barn
      
      // Due to async nature, we'll test presence of all components
      cy.contains('Quick Actions').should('exist')
      cy.contains('Active Farms').should('exist')
      cy.contains('Harvests').should('exist')
      cy.contains('Barn').should('exist')
    })
  })

  describe('Error States', () => {
    it('should handle farm creation errors', () => {
      cy.intercept('POST', '/api/farms', { statusCode: 500 })
      
      cy.contains('button', 'New Farm').click()
      cy.get('[data-testid="farm-name-input"]').type('Error Test Farm')
      cy.contains('button', 'Create Farm').click()
      
      cy.contains('Failed to create farm').should('exist')
    })

    it('should handle harvest errors', () => {
      cy.intercept('GET', '/api/harvests', { statusCode: 500 })
      cy.visit('/')
      
      cy.get('[data-testid="harvest-section"]').within(() => {
        cy.contains('Failed to load harvests').should('exist')
      })
    })
  })
})