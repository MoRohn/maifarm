describe('GoWild Exploration Features', () => {
  beforeEach(() => {
    cy.visit('http://localhost:3000');
    
    // Mock authentication
    cy.window().then((win) => {
      win.localStorage.setItem('auth_token', 'test-token');
    });
  });

  describe('GoWild Mode Activation', () => {
    it('should access GoWild mode from dashboard', () => {
      cy.visit('http://localhost:3000/dashboard');
      
      // Click GoWild button
      cy.contains('Go Wild').click();
      
      // Check if GoWild modal opens
      cy.get('[data-testid="gowild-modal"]').should('be.visible');
      cy.contains('Autonomous Exploration Mode').should('be.visible');
    });

    it('should configure exploration boundaries', () => {
      cy.visit('http://localhost:3000/dashboard');
      cy.contains('Go Wild').click();
      
      // Adjust creativity slider
      cy.get('input[name="creativity"]').invoke('val', 0.8).trigger('change');
      cy.contains('Creativity: 80%').should('be.visible');
      
      // Adjust exploration depth
      cy.get('input[name="exploration"]').invoke('val', 0.7).trigger('change');
      cy.contains('Exploration: 70%').should('be.visible');
      
      // Adjust safety level
      cy.get('input[name="safety"]').invoke('val', 0.9).trigger('change');
      cy.contains('Safety: 90%').should('be.visible');
    });

    it('should set exploration goals', () => {
      cy.visit('http://localhost:3000/dashboard');
      cy.contains('Go Wild').click();
      
      // Add exploration goals
      cy.get('textarea[name="goals"]').type('Find innovative solutions for code optimization');
      
      // Add constraints
      cy.get('textarea[name="constraints"]').type('Stay within JavaScript/TypeScript ecosystem');
      
      // Set time limit
      cy.get('input[name="timeLimit"]').type('30');
    });
  });

  describe('Exploration Execution', () => {
    it('should start exploration session', () => {
      cy.visit('http://localhost:3000/dashboard');
      cy.contains('Go Wild').click();
      
      // Configure and start
      cy.get('input[name="creativity"]').invoke('val', 0.7).trigger('change');
      cy.get('input[name="exploration"]').invoke('val', 0.8).trigger('change');
      cy.get('input[name="safety"]').invoke('val', 0.9).trigger('change');
      
      // Select a farm for exploration
      cy.get('select[name="farmId"]').select('Test Farm');
      
      // Start exploration
      cy.contains('Start Exploration').click();
      
      // Check if exploration view opens
      cy.url().should('include', '/gowild/active');
      cy.contains('Exploration in Progress').should('be.visible');
    });

    it('should display 3D exploration visualization', () => {
      cy.visit('http://localhost:3000/gowild/active');
      
      // Check if 3D canvas is rendered
      cy.get('canvas').should('be.visible');
      
      // Check exploration nodes
      cy.get('[data-testid="exploration-stats"]').within(() => {
        cy.contains('Nodes Explored').should('be.visible');
        cy.contains('Discoveries').should('be.visible');
        cy.contains('Backtracks').should('be.visible');
      });
    });

    it('should show real-time exploration updates', () => {
      cy.visit('http://localhost:3000/gowild/active');
      
      // Check for live updates
      cy.get('[data-testid="exploration-log"]').within(() => {
        cy.contains('Exploring').should('be.visible');
        cy.get('.log-entry').should('have.length.greaterThan', 0);
      });
      
      // Check discovery notifications
      cy.get('[data-testid="discovery-alert"]', { timeout: 10000 }).should('be.visible');
    });
  });

  describe('Safety Monitoring', () => {
    it('should display safety indicators', () => {
      cy.visit('http://localhost:3000/gowild/active');
      
      // Check safety monitor
      cy.get('[data-testid="safety-monitor"]').within(() => {
        cy.contains('Safety Status').should('be.visible');
        cy.get('.safety-indicator').should('have.class', 'safe');
      });
      
      // Check boundary violations
      cy.get('[data-testid="boundary-status"]').within(() => {
        cy.contains('Within Boundaries').should('be.visible');
      });
    });

    it('should allow emergency stop', () => {
      cy.visit('http://localhost:3000/gowild/active');
      
      // Click emergency stop
      cy.get('[data-testid="emergency-stop"]').click();
      
      // Confirm stop
      cy.contains('Are you sure').should('be.visible');
      cy.contains('Yes, Stop Exploration').click();
      
      // Check if exploration stopped
      cy.contains('Exploration Stopped').should('be.visible');
      cy.url().should('include', '/gowild/results');
    });
  });

  describe('Rollback Controls', () => {
    it('should show rollback options', () => {
      cy.visit('http://localhost:3000/gowild/active');
      
      // Open rollback panel
      cy.contains('Rollback Controls').click();
      
      // Check rollback options
      cy.get('[data-testid="rollback-panel"]').within(() => {
        cy.contains('Snapshots').should('be.visible');
        cy.get('.snapshot-item').should('have.length.greaterThan', 0);
      });
    });

    it('should perform rollback to snapshot', () => {
      cy.visit('http://localhost:3000/gowild/active');
      cy.contains('Rollback Controls').click();
      
      // Select a snapshot
      cy.get('.snapshot-item').first().click();
      cy.contains('Preview').click();
      
      // Check preview
      cy.get('[data-testid="snapshot-preview"]').should('be.visible');
      
      // Perform rollback
      cy.contains('Rollback to This Point').click();
      cy.contains('Confirm Rollback').click();
      
      // Verify rollback
      cy.contains('Rollback Successful').should('be.visible');
    });
  });

  describe('Exploration Results', () => {
    it('should display exploration summary', () => {
      cy.visit('http://localhost:3000/gowild/results/test-session-id');
      
      // Check summary stats
      cy.get('[data-testid="exploration-summary"]').within(() => {
        cy.contains('Total Nodes Explored').should('be.visible');
        cy.contains('Discoveries Made').should('be.visible');
        cy.contains('Time Elapsed').should('be.visible');
        cy.contains('Efficiency Score').should('be.visible');
      });
    });

    it('should show discovery details', () => {
      cy.visit('http://localhost:3000/gowild/results/test-session-id');
      
      // Check discoveries section
      cy.get('[data-testid="discoveries-section"]').within(() => {
        cy.get('.discovery-card').should('have.length.greaterThan', 0);
        
        // Click on a discovery
        cy.get('.discovery-card').first().click();
      });
      
      // Check discovery details
      cy.get('[data-testid="discovery-detail"]').within(() => {
        cy.contains('Discovery Details').should('be.visible');
        cy.contains('Confidence').should('be.visible');
        cy.contains('Impact').should('be.visible');
      });
    });

    it('should export exploration results', () => {
      cy.visit('http://localhost:3000/gowild/results/test-session-id');
      
      // Click export button
      cy.contains('Export Results').click();
      
      // Check export options
      cy.get('[data-testid="export-modal"]').within(() => {
        cy.contains('Export Format').should('be.visible');
        cy.get('input[value="json"]').should('be.checked');
        
        // Select PDF
        cy.get('input[value="pdf"]').click();
        
        // Export
        cy.contains('Download').click();
      });
      
      // Verify download started
      cy.readFile('cypress/downloads/exploration-results.pdf').should('exist');
    });

    it('should save discoveries to barn', () => {
      cy.visit('http://localhost:3000/gowild/results/test-session-id');
      
      // Select discoveries to save
      cy.get('.discovery-card input[type="checkbox"]').first().click();
      cy.get('.discovery-card input[type="checkbox"]').eq(1).click();
      
      // Click save to barn
      cy.contains('Save to Barn').click();
      
      // Configure barn storage
      cy.get('[data-testid="barn-save-modal"]').within(() => {
        cy.get('input[name="collectionName"]').type('GoWild Discoveries');
        cy.get('select[name="folder"]').select('Research');
        cy.contains('Save').click();
      });
      
      // Verify saved
      cy.contains('Saved to Barn').should('be.visible');
    });
  });

  describe('Exploration History', () => {
    it('should show exploration history', () => {
      cy.visit('http://localhost:3000/gowild/history');
      
      // Check history list
      cy.get('[data-testid="exploration-history"]').within(() => {
        cy.get('.history-item').should('have.length.greaterThan', 0);
        
        // Check history item details
        cy.get('.history-item').first().within(() => {
          cy.contains('Exploration Session').should('be.visible');
          cy.contains('Duration').should('be.visible');
          cy.contains('Discoveries').should('be.visible');
        });
      });
    });

    it('should filter exploration history', () => {
      cy.visit('http://localhost:3000/gowild/history');
      
      // Apply filters
      cy.get('select[name="farmFilter"]').select('Test Farm');
      cy.get('input[name="dateFrom"]').type('2025-01-01');
      cy.get('input[name="dateTo"]').type('2025-12-31');
      
      // Apply
      cy.contains('Apply Filters').click();
      
      // Check filtered results
      cy.get('.history-item').each(($item) => {
        cy.wrap($item).contains('Test Farm').should('be.visible');
      });
    });
  });
});