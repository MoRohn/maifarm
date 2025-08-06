describe('Seeds → Farms → Harvest → Barn Workflow', () => {
  beforeEach(() => {
    // Visit the application
    cy.visit('http://localhost:3000');
    
    // Mock authentication if needed
    cy.window().then((win) => {
      win.localStorage.setItem('auth_token', 'test-token');
    });
  });

  describe('Seeds Management', () => {
    it('should display available seeds', () => {
      cy.visit('http://localhost:3000/seeds');
      
      // Check if seeds are displayed
      cy.contains('Code Review Assistant').should('be.visible');
      cy.contains('Data Processing Pipeline').should('be.visible');
      cy.contains('AI Research Assistant').should('be.visible');
    });

    it('should show seed details on click', () => {
      cy.visit('http://localhost:3000/seeds');
      
      // Click on a seed
      cy.contains('Code Review Assistant').click();
      
      // Check if details are shown
      cy.contains('Multi-agent farm for comprehensive code review').should('be.visible');
      cy.contains('collaborative').should('be.visible');
      cy.contains('3 agents').should('be.visible');
    });
  });

  describe('Farm Creation from Seed', () => {
    it('should create a farm from seed', () => {
      cy.visit('http://localhost:3000/seeds');
      
      // Select a seed
      cy.contains('Code Review Assistant').click();
      
      // Click create farm button
      cy.contains('Create Farm').click();
      
      // Fill in farm details
      cy.get('input[name="farmName"]').type('My Code Review Farm');
      cy.get('textarea[name="description"]').type('Testing farm creation');
      
      // Submit form
      cy.get('button[type="submit"]').contains('Create').click();
      
      // Check if redirected to farms page
      cy.url().should('include', '/farms');
      cy.contains('My Code Review Farm').should('be.visible');
    });
  });

  describe('Farm Execution and Harvest', () => {
    it('should start farm and monitor progress', () => {
      cy.visit('http://localhost:3000/farms');
      
      // Find and start a farm
      cy.contains('My Code Review Farm').parent().within(() => {
        cy.contains('Start').click();
      });
      
      // Check if status changes
      cy.contains('Running').should('be.visible');
      
      // Check if agents are shown
      cy.contains('style-checker').should('be.visible');
      cy.contains('security-scanner').should('be.visible');
      cy.contains('performance-analyzer').should('be.visible');
    });

    it('should show harvest results when complete', () => {
      cy.visit('http://localhost:3000/harvest');
      
      // Check if harvest items appear
      cy.get('[data-testid="harvest-item"]').should('have.length.greaterThan', 0);
      
      // Click on a harvest item
      cy.get('[data-testid="harvest-item"]').first().click();
      
      // Check harvest details
      cy.contains('Harvest Details').should('be.visible');
      cy.contains('Output').should('be.visible');
    });
  });

  describe('Barn Storage', () => {
    it('should store harvest in barn', () => {
      cy.visit('http://localhost:3000/harvest');
      
      // Select a harvest item
      cy.get('[data-testid="harvest-item"]').first().within(() => {
        cy.contains('Store in Barn').click();
      });
      
      // Fill storage details
      cy.get('input[name="itemName"]').type('Code Review Results v1');
      cy.get('select[name="folder"]').select('Development');
      cy.get('input[name="tags"]').type('code-review, quality, v1');
      
      // Submit
      cy.contains('Store').click();
      
      // Verify stored
      cy.contains('Successfully stored in barn').should('be.visible');
    });

    it('should browse barn items', () => {
      cy.visit('http://localhost:3000/barn');
      
      // Check folder structure
      cy.contains('Development').should('be.visible');
      cy.contains('Research').should('be.visible');
      
      // Click on Development folder
      cy.contains('Development').click();
      
      // Check stored items
      cy.contains('Code Review Results v1').should('be.visible');
      
      // Click on item
      cy.contains('Code Review Results v1').click();
      
      // Check item details
      cy.contains('Stored from harvest').should('be.visible');
      cy.contains('code-review').should('be.visible');
    });

    it('should create seed from barn item', () => {
      cy.visit('http://localhost:3000/barn');
      
      // Navigate to item
      cy.contains('Development').click();
      cy.contains('Code Review Results v1').click();
      
      // Click create seed button
      cy.contains('Create Seed Template').click();
      
      // Fill seed details
      cy.get('input[name="seedName"]').type('Enhanced Code Review');
      cy.get('textarea[name="seedDescription"]').type('Improved code review based on results');
      
      // Submit
      cy.contains('Create Seed').click();
      
      // Verify seed created
      cy.url().should('include', '/seeds');
      cy.contains('Enhanced Code Review').should('be.visible');
    });
  });

  describe('Real-time Updates', () => {
    it('should show real-time farm status updates', () => {
      cy.visit('http://localhost:3000/farms');
      
      // Start a farm
      cy.contains('Start').first().click();
      
      // Check for WebSocket connection indicator
      cy.get('[data-testid="websocket-status"]').should('have.class', 'connected');
      
      // Check for real-time status updates
      cy.contains('Running', { timeout: 10000 }).should('be.visible');
      
      // Check for agent status updates
      cy.get('[data-testid="agent-status"]').should('contain', 'active');
    });
  });
});