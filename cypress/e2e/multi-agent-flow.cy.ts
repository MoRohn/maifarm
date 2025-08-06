describe('Multi-Claude Agent Management Flow', () => {
  beforeEach(() => {
    // Visit the dashboard
    cy.visit('/dashboard');
    
    // Mock WebSocket connection
    cy.window().then((win) => {
      win.__mockWebSocket = true;
    });
  });

  describe('Navigation to Multi-Claude Manager', () => {
    it('should navigate to Multi-Claude Manager from Quick Actions', () => {
      // Find and click the Multi-Claude quick action
      cy.contains('Multi-Claude').click();
      
      // Verify we're on the Multi-Claude page
      cy.url().should('include', '/multiclaude');
      cy.contains('Multi-Claude Manager').should('be.visible');
      cy.contains('Orchestrate multiple AI agents').should('be.visible');
    });

    it('should show disconnected state initially', () => {
      cy.visit('/multiclaude');
      cy.contains('Disconnected').should('be.visible');
      cy.contains('Ready to Orchestrate').should('be.visible');
    });
  });

  describe('Session Management', () => {
    beforeEach(() => {
      cy.visit('/multiclaude');
      
      // Mock successful API responses
      cy.intercept('POST', '/api/multiclaude/session', {
        statusCode: 200,
        body: { success: true },
      }).as('startSession');
      
      cy.intercept('DELETE', '/api/multiclaude/session', {
        statusCode: 200,
        body: { success: true },
      }).as('stopSession');
    });

    it('should start a new Multi-Claude session', () => {
      // Click Start Session button
      cy.contains('Start Multi-Claude Session').click();
      
      // Wait for session to start
      cy.wait('@startSession');
      
      // Verify session started
      cy.contains('Stop Session').should('be.visible');
      cy.contains('Multi-Claude Agents').should('be.visible');
    });

    it('should stop an active session', () => {
      // Start session first
      cy.contains('Start Multi-Claude Session').click();
      cy.wait('@startSession');
      
      // Stop session
      cy.contains('Stop Session').click();
      cy.wait('@stopSession');
      
      // Verify session stopped
      cy.contains('Start Multi-Claude Session').should('be.visible');
      cy.contains('Ready to Orchestrate').should('be.visible');
    });
  });

  describe('Agent Grid Management', () => {
    beforeEach(() => {
      cy.visit('/multiclaude');
      
      // Mock API responses
      cy.intercept('POST', '/api/multiclaude/session', { statusCode: 200 }).as('startSession');
      cy.intercept('POST', '/api/multiclaude/agents', { statusCode: 200 }).as('addAgent');
      cy.intercept('DELETE', '/api/multiclaude/agents/*', { statusCode: 200 }).as('removeAgent');
      
      // Start session
      cy.contains('Start Multi-Claude Session').click();
      cy.wait('@startSession');
    });

    it('should display empty state when no agents are running', () => {
      cy.contains('No Agents Running').should('be.visible');
      cy.contains('Start your first Claude agent').should('be.visible');
    });

    it('should add a new agent', () => {
      // Click add agent button
      cy.contains('Start First Agent').click();
      cy.wait('@addAgent');
      
      // Verify agent card appears
      cy.contains('Agent 1').should('be.visible');
      cy.get('[data-testid="agent-card"]').should('have.length', 1);
    });

    it('should add multiple agents', () => {
      // Add first agent
      cy.contains('Start First Agent').click();
      cy.wait('@addAgent');
      
      // Add second agent
      cy.contains('Add Agent').click();
      cy.wait('@addAgent');
      
      // Verify both agents appear
      cy.contains('Agent 1').should('be.visible');
      cy.contains('Agent 2').should('be.visible');
      cy.contains('2 / 12').should('be.visible');
    });

    it('should remove an agent', () => {
      // Add an agent first
      cy.contains('Start First Agent').click();
      cy.wait('@addAgent');
      
      // Remove the agent
      cy.get('[title="Remove Agent"]').first().click();
      cy.wait('@removeAgent');
      
      // Verify agent is removed
      cy.contains('No Agents Running').should('be.visible');
    });

    it('should respect maximum agent limit', () => {
      // Mock the grid with max agents
      cy.window().then((win) => {
        win.__mockMaxAgents = 2;
      });
      
      // Add two agents
      cy.contains('Start First Agent').click();
      cy.wait('@addAgent');
      cy.contains('Add Agent').click();
      cy.wait('@addAgent');
      
      // Verify add button is hidden
      cy.contains('Add Agent').should('not.exist');
      cy.contains('2 / 2').should('be.visible');
    });
  });

  describe('Agent Controls', () => {
    beforeEach(() => {
      cy.visit('/multiclaude');
      
      // Mock API responses
      cy.intercept('POST', '/api/multiclaude/session', { statusCode: 200 }).as('startSession');
      cy.intercept('POST', '/api/multiclaude/agents', { statusCode: 200 }).as('addAgent');
      cy.intercept('POST', '/api/multiclaude/agents/*/command', { statusCode: 200 }).as('sendCommand');
      cy.intercept('POST', '/api/multiclaude/agents/*/prompt', { statusCode: 200 }).as('sendPrompt');
      
      // Start session and add an agent
      cy.contains('Start Multi-Claude Session').click();
      cy.wait('@startSession');
      cy.contains('Start First Agent').click();
      cy.wait('@addAgent');
    });

    it('should send start command to agent', () => {
      cy.get('[title="Start Agent"]').first().click();
      cy.wait('@sendCommand').its('request.body').should('deep.include', {
        type: 'start',
      });
    });

    it('should send pause command to agent', () => {
      // Start agent first
      cy.get('[title="Start Agent"]').first().click();
      cy.wait('@sendCommand');
      
      // Pause agent
      cy.get('[title="Pause Agent"]').first().click();
      cy.wait('@sendCommand').its('request.body').should('deep.include', {
        type: 'pause',
      });
    });

    it('should send reset command to agent', () => {
      cy.get('[title="Reset Agent"]').first().click();
      cy.wait('@sendCommand').its('request.body').should('deep.include', {
        type: 'reset',
      });
    });

    it('should send prompt to agent', () => {
      const testPrompt = 'Test prompt for agent';
      
      // Type prompt
      cy.get('[placeholder="Enter prompt for this agent..."]').first().type(testPrompt);
      
      // Send prompt
      cy.get('[title="Send Prompt"]').first().click();
      cy.wait('@sendPrompt').its('request.body').should('deep.include', {
        prompt: testPrompt,
      });
      
      // Verify input is cleared
      cy.get('[placeholder="Enter prompt for this agent..."]').first().should('have.value', '');
    });

    it('should send prompt with Enter key', () => {
      const testPrompt = 'Quick prompt';
      
      // Type prompt and press Enter
      cy.get('[placeholder="Enter prompt for this agent..."]').first()
        .type(`${testPrompt}{enter}`);
      
      cy.wait('@sendPrompt').its('request.body').should('deep.include', {
        prompt: testPrompt,
      });
    });
  });

  describe('Settings Panel', () => {
    beforeEach(() => {
      cy.visit('/multiclaude');
    });

    it('should open and close settings panel', () => {
      // Open settings
      cy.get('[aria-label="Settings"]').click();
      cy.contains('Multi-Claude Settings').should('be.visible');
      
      // Close settings
      cy.get('[aria-label="Close"]').click();
      cy.contains('Multi-Claude Settings').should('not.exist');
    });

    it('should update maximum agents setting', () => {
      // Open settings
      cy.get('[aria-label="Settings"]').click();
      
      // Change max agents
      cy.get('input[type="range"]').first().invoke('val', 8).trigger('input');
      cy.contains('8').should('be.visible');
      
      // Save changes
      cy.contains('Save Changes').click();
      
      // Verify setting is saved
      cy.reload();
      cy.get('[aria-label="Settings"]').click();
      cy.contains('8').should('be.visible');
    });

    it('should update stagger delay setting', () => {
      // Open settings
      cy.get('[aria-label="Settings"]').click();
      
      // Change stagger delay
      cy.get('input[type="range"]').eq(1).invoke('val', 5).trigger('input');
      cy.contains('5s').should('be.visible');
      
      // Save changes
      cy.contains('Save Changes').click();
    });

    it('should toggle enable logging', () => {
      // Open settings
      cy.get('[aria-label="Settings"]').click();
      
      // Toggle logging
      cy.contains('Enable Logging').parent().find('button').click();
      
      // Save changes
      cy.contains('Save Changes').click();
    });

    it('should reset unsaved changes', () => {
      // Open settings
      cy.get('[aria-label="Settings"]').click();
      
      // Make changes
      cy.get('input[type="range"]').first().invoke('val', 10).trigger('input');
      
      // Reset changes
      cy.contains('Reset').click();
      
      // Verify original value is restored
      cy.contains('6').should('be.visible');
    });
  });

  describe('Real-time Updates', () => {
    beforeEach(() => {
      cy.visit('/multiclaude');
      
      // Mock WebSocket events
      cy.window().then((win) => {
        win.__mockWebSocketEvents = true;
      });
      
      // Start session and add agent
      cy.intercept('POST', '/api/multiclaude/session', { statusCode: 200 }).as('startSession');
      cy.intercept('POST', '/api/multiclaude/agents', { statusCode: 200 }).as('addAgent');
      
      cy.contains('Start Multi-Claude Session').click();
      cy.wait('@startSession');
      cy.contains('Start First Agent').click();
      cy.wait('@addAgent');
    });

    it('should update agent status in real-time', () => {
      // Simulate status change via WebSocket
      cy.window().then((win) => {
        win.__triggerWebSocketEvent('multiclaude:agent:update', {
          type: 'agent:status',
          agentId: 'agent_1',
          data: { status: 'working', activity: 'Processing task...' },
        });
      });
      
      // Verify status update
      cy.contains('working').should('be.visible');
      cy.contains('Processing task...').should('be.visible');
    });

    it('should display agent output in real-time', () => {
      // Simulate output via WebSocket
      cy.window().then((win) => {
        win.__triggerWebSocketEvent('multiclaude:agent:update', {
          type: 'agent:output',
          agentId: 'agent_1',
          data: { lines: ['[INFO] Starting task', '[SUCCESS] Task completed'] },
        });
      });
      
      // Verify output appears in terminal
      cy.contains('[INFO] Starting task').should('be.visible');
      cy.contains('[SUCCESS] Task completed').should('be.visible');
    });

    it('should handle agent errors', () => {
      // Simulate error via WebSocket
      cy.window().then((win) => {
        win.__triggerWebSocketEvent('multiclaude:agent:update', {
          type: 'agent:error',
          agentId: 'agent_1',
          data: { error: 'Connection timeout' },
        });
      });
      
      // Verify error state
      cy.contains('error').should('be.visible');
      cy.contains('Connection timeout').should('be.visible');
    });
  });

  describe('Responsive Design', () => {
    it('should display grid layout on desktop', () => {
      cy.viewport(1920, 1080);
      cy.visit('/multiclaude');
      
      // Start session and add multiple agents
      cy.intercept('POST', '/api/multiclaude/**', { statusCode: 200 });
      cy.contains('Start Multi-Claude Session').click();
      
      // Add 4 agents
      for (let i = 0; i < 4; i++) {
        cy.contains(i === 0 ? 'Start First Agent' : 'Add Agent').click();
      }
      
      // Verify grid layout
      cy.get('.grid').should('have.class', 'lg:grid-cols-2');
    });

    it('should display single column on mobile', () => {
      cy.viewport(375, 667);
      cy.visit('/multiclaude');
      
      // Start session and add agents
      cy.intercept('POST', '/api/multiclaude/**', { statusCode: 200 });
      cy.contains('Start Multi-Claude Session').click();
      cy.contains('Start First Agent').click();
      
      // Verify single column layout
      cy.get('.grid').should('have.class', 'grid-cols-1');
    });
  });
});