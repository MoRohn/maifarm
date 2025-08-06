describe('Infographic Generation E2E', () => {
  beforeEach(() => {
    // Reset database and seed test data
    cy.task('db:reset');
    cy.task('db:seed');
    
    // Visit the main dashboard
    cy.visit('/');
  });

  describe('Creating New Infographic', () => {
    it('should create infographic from news articles', () => {
      // Navigate to infographic creator
      cy.get('[data-testid="nav-infographics"]').click();
      cy.get('[data-testid="btn-create-new"]').click();

      // Step 1: Select data source
      cy.get('[data-testid="source-news"]').click();
      cy.get('[data-testid="search-input"]').type('Trump policy 2024');
      cy.get('[data-testid="btn-search"]').click();

      // Wait for search results
      cy.get('[data-testid="search-results"]', { timeout: 10000 }).should('exist');
      
      // Select articles
      cy.get('[data-testid^="article-checkbox-"]').first().check();
      cy.get('[data-testid^="article-checkbox-"]').eq(1).check();
      cy.get('[data-testid^="article-checkbox-"]').eq(2).check();
      
      cy.get('[data-testid="selected-count"]').should('contain', '3 articles selected');
      cy.get('[data-testid="btn-next-step"]').click();

      // Step 2: Choose template
      cy.get('[data-testid="template-timeline"]').click();
      cy.get('[data-testid="template-preview"]').should('be.visible');
      cy.get('[data-testid="btn-next-step"]').click();

      // Step 3: Customize design
      cy.get('[data-testid="title-input"]').clear().type('Trump Policy Timeline 2024');
      cy.get('[data-testid="subtitle-input"]').type('Key Policy Developments');
      
      // Select color theme
      cy.get('[data-testid="theme-selector"]').click();
      cy.get('[data-testid="theme-professional"]').click();
      
      // Add custom branding
      cy.get('[data-testid="toggle-branding"]').click();
      cy.get('[data-testid="org-name-input"]').type('Political Analytics Inc.');
      
      cy.get('[data-testid="btn-next-step"]').click();

      // Step 4: Review and generate
      cy.get('[data-testid="preview-container"]').should('be.visible');
      cy.get('[data-testid="infographic-title"]').should('contain', 'Trump Policy Timeline 2024');
      
      // Generate infographic
      cy.get('[data-testid="btn-generate"]').click();
      
      // Wait for generation
      cy.get('[data-testid="generation-progress"]', { timeout: 15000 }).should('be.visible');
      cy.get('[data-testid="generation-complete"]', { timeout: 30000 }).should('be.visible');
      
      // Verify generated infographic
      cy.get('[data-testid="infographic-viewer"]').should('be.visible');
      cy.get('[data-testid="download-btn"]').should('be.enabled');
      cy.get('[data-testid="share-btn"]').should('be.enabled');
    });

    it('should create chart-heavy infographic from data', () => {
      cy.get('[data-testid="nav-infographics"]').click();
      cy.get('[data-testid="btn-create-new"]').click();

      // Select data source
      cy.get('[data-testid="source-data"]').click();
      
      // Upload CSV data
      cy.fixture('polling-data.csv').then(fileContent => {
        cy.get('[data-testid="file-upload"]').attachFile({
          fileContent: fileContent.toString(),
          fileName: 'polling-data.csv',
          mimeType: 'text/csv'
        });
      });

      cy.get('[data-testid="data-preview"]').should('be.visible');
      cy.get('[data-testid="btn-next-step"]').click();

      // Select chart template
      cy.get('[data-testid="template-charts"]').click();
      cy.get('[data-testid="btn-next-step"]').click();

      // Configure charts
      cy.get('[data-testid="chart-type-select"]').select('bar');
      cy.get('[data-testid="x-axis-field"]').select('date');
      cy.get('[data-testid="y-axis-field"]').select('approval_rating');
      
      cy.get('[data-testid="add-chart-btn"]').click();
      
      cy.get('[data-testid="chart-type-select"]').select('line');
      cy.get('[data-testid="x-axis-field"]').select('date');
      cy.get('[data-testid="y-axis-field"]').select('disapproval_rating');
      
      cy.get('[data-testid="btn-generate"]').click();

      // Verify charts are rendered
      cy.get('[data-testid="chart-container"]').should('have.length', 2);
      cy.get('svg.chart').should('have.length', 2);
    });
  });

  describe('Editing Existing Infographic', () => {
    it('should edit and update infographic', () => {
      // Navigate to existing infographic
      cy.get('[data-testid="nav-infographics"]').click();
      cy.get('[data-testid="infographic-list"]').should('be.visible');
      cy.get('[data-testid^="infographic-card-"]').first().click();

      // Enter edit mode
      cy.get('[data-testid="btn-edit"]').click();

      // Update title
      cy.get('[data-testid="title-input"]').clear().type('Updated Trump Policy Analysis');

      // Add new section
      cy.get('[data-testid="add-section-btn"]').click();
      cy.get('[data-testid="section-type-select"]').select('text');
      cy.get('[data-testid="section-content"]').type('Latest developments in trade policy...');

      // Save changes
      cy.get('[data-testid="btn-save"]').click();

      // Verify changes
      cy.get('[data-testid="save-success"]').should('be.visible');
      cy.get('[data-testid="infographic-title"]').should('contain', 'Updated Trump Policy Analysis');
    });

    it('should delete infographic with confirmation', () => {
      cy.get('[data-testid="nav-infographics"]').click();
      cy.get('[data-testid^="infographic-card-"]').first().click();

      // Click delete button
      cy.get('[data-testid="btn-delete"]').click();

      // Confirm deletion
      cy.get('[data-testid="confirm-dialog"]').should('be.visible');
      cy.get('[data-testid="confirm-delete-btn"]').click();

      // Verify deletion
      cy.get('[data-testid="delete-success"]').should('be.visible');
      cy.url().should('include', '/infographics');
    });
  });

  describe('Real-time Collaboration', () => {
    it('should show real-time updates from other users', () => {
      // Open infographic
      cy.get('[data-testid="nav-infographics"]').click();
      cy.get('[data-testid^="infographic-card-"]').first().click();

      // Simulate another user editing
      cy.window().then((win) => {
        // Emit WebSocket event for another user's edit
        (win as any).socket.emit('test:simulate-edit', {
          infographicId: 'test-id',
          user: 'Other User',
          change: { title: 'Edited by Another User' }
        });
      });

      // Verify real-time update notification
      cy.get('[data-testid="collab-notification"]').should('be.visible');
      cy.get('[data-testid="collab-notification"]').should('contain', 'Other User is editing');

      // Verify changes appear
      cy.get('[data-testid="infographic-title"]', { timeout: 5000 })
        .should('contain', 'Edited by Another User');
    });

    it('should handle concurrent edits gracefully', () => {
      cy.get('[data-testid="nav-infographics"]').click();
      cy.get('[data-testid^="infographic-card-"]').first().click();
      cy.get('[data-testid="btn-edit"]').click();

      // Start editing
      cy.get('[data-testid="title-input"]').clear().type('My Edit');

      // Simulate conflict
      cy.window().then((win) => {
        (win as any).socket.emit('test:simulate-conflict', {
          infographicId: 'test-id'
        });
      });

      // Handle conflict resolution
      cy.get('[data-testid="conflict-dialog"]').should('be.visible');
      cy.get('[data-testid="resolve-keep-mine"]').click();

      // Verify resolution
      cy.get('[data-testid="title-input"]').should('have.value', 'My Edit');
    });
  });

  describe('Export and Sharing', () => {
    it('should export infographic in multiple formats', () => {
      cy.get('[data-testid="nav-infographics"]').click();
      cy.get('[data-testid^="infographic-card-"]').first().click();

      // Test PNG export
      cy.get('[data-testid="export-btn"]').click();
      cy.get('[data-testid="export-png"]').click();
      cy.get('[data-testid="download-progress"]').should('be.visible');
      
      // Verify download initiated
      cy.readFile('cypress/downloads/infographic.png').should('exist');

      // Test SVG export
      cy.get('[data-testid="export-btn"]').click();
      cy.get('[data-testid="export-svg"]').click();
      cy.readFile('cypress/downloads/infographic.svg').should('exist');

      // Test PDF export
      cy.get('[data-testid="export-btn"]').click();
      cy.get('[data-testid="export-pdf"]').click();
      cy.readFile('cypress/downloads/infographic.pdf').should('exist');
    });

    it('should generate shareable link', () => {
      cy.get('[data-testid="nav-infographics"]').click();
      cy.get('[data-testid^="infographic-card-"]').first().click();

      // Generate share link
      cy.get('[data-testid="share-btn"]').click();
      cy.get('[data-testid="generate-link-btn"]').click();

      // Verify link generated
      cy.get('[data-testid="share-link-input"]').should('be.visible');
      cy.get('[data-testid="share-link-input"]')
        .invoke('val')
        .should('match', /https?:\/\/.+\/share\/.+/);

      // Copy link
      cy.get('[data-testid="copy-link-btn"]').click();
      cy.get('[data-testid="copy-success"]').should('be.visible');
    });

    it('should embed infographic with iframe code', () => {
      cy.get('[data-testid="nav-infographics"]').click();
      cy.get('[data-testid^="infographic-card-"]').first().click();

      cy.get('[data-testid="share-btn"]').click();
      cy.get('[data-testid="embed-tab"]').click();

      // Get embed code
      cy.get('[data-testid="embed-code"]').should('be.visible');
      cy.get('[data-testid="embed-code"]')
        .invoke('val')
        .should('contain', '<iframe');

      // Test embed preview
      cy.get('[data-testid="preview-embed-btn"]').click();
      cy.get('[data-testid="embed-preview"]').should('be.visible');
      cy.get('[data-testid="embed-preview"] iframe').should('exist');
    });
  });

  describe('Performance and Loading', () => {
    it('should handle large datasets efficiently', () => {
      cy.get('[data-testid="nav-infographics"]').click();
      cy.get('[data-testid="btn-create-new"]').click();

      // Upload large dataset
      cy.fixture('large-dataset.json').then(fileContent => {
        cy.get('[data-testid="file-upload"]').attachFile({
          fileContent: JSON.stringify(fileContent),
          fileName: 'large-dataset.json',
          mimeType: 'application/json'
        });
      });

      // Verify data loads within reasonable time
      cy.get('[data-testid="data-preview"]', { timeout: 5000 }).should('be.visible');
      cy.get('[data-testid="record-count"]').should('contain', '10000 records');

      // Generate visualization
      cy.get('[data-testid="btn-quick-generate"]').click();
      
      // Should complete within 10 seconds
      cy.get('[data-testid="generation-complete"]', { timeout: 10000 }).should('be.visible');
    });

    it('should implement lazy loading for infographic list', () => {
      cy.get('[data-testid="nav-infographics"]').click();

      // Initial load should show first batch
      cy.get('[data-testid^="infographic-card-"]').should('have.length', 20);

      // Scroll to bottom
      cy.scrollTo('bottom');

      // More items should load
      cy.get('[data-testid^="infographic-card-"]').should('have.length.greaterThan', 20);

      // Verify loading indicator
      cy.get('[data-testid="loading-more"]').should('be.visible');
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', () => {
      // Intercept and force error
      cy.intercept('POST', '/api/infographics', {
        statusCode: 500,
        body: { error: { message: 'Server error' } }
      });

      cy.get('[data-testid="nav-infographics"]').click();
      cy.get('[data-testid="btn-create-new"]').click();
      
      // Try to create infographic
      cy.get('[data-testid="title-input"]').type('Test Infographic');
      cy.get('[data-testid="btn-save"]').click();

      // Verify error message
      cy.get('[data-testid="error-toast"]').should('be.visible');
      cy.get('[data-testid="error-toast"]').should('contain', 'Server error');
    });

    it('should handle network disconnection', () => {
      cy.get('[data-testid="nav-infographics"]').click();

      // Simulate offline
      cy.window().then((win) => {
        win.dispatchEvent(new Event('offline'));
      });

      // Verify offline indicator
      cy.get('[data-testid="offline-banner"]').should('be.visible');

      // Try to create new (should be disabled)
      cy.get('[data-testid="btn-create-new"]').should('be.disabled');

      // Simulate back online
      cy.window().then((win) => {
        win.dispatchEvent(new Event('online'));
      });

      // Verify online again
      cy.get('[data-testid="offline-banner"]').should('not.exist');
      cy.get('[data-testid="btn-create-new"]').should('not.be.disabled');
    });
  });
});