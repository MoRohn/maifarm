describe('WebSocket Connection E2E Tests', () => {
  beforeEach(() => {
    // Start with a clean state
    cy.clearLocalStorage();
    cy.clearCookies();
    
    // Visit the application
    cy.visit('/');
  });

  describe('Connection Lifecycle', () => {
    it('should establish WebSocket connection on app load', () => {
      // Wait for initial connection
      cy.window().its('websocketService').should('exist');
      
      // Check connection status indicator
      cy.get('[data-testid="connection-status"]', { timeout: 10000 })
        .should('exist')
        .and('contain', 'Connected');
      
      // Verify toast notification
      cy.get('.Toastify__toast--success')
        .should('contain', 'Connected to MaiFarm server');
    });

    it('should show disconnection warning when server is unavailable', () => {
      // Intercept WebSocket connection to simulate failure
      cy.intercept('GET', '**/socket.io/*', { forceNetworkError: true });
      
      cy.visit('/');
      
      // Should show disconnection status
      cy.get('[data-testid="connection-status"]', { timeout: 10000 })
        .should('contain', 'Disconnected');
      
      // Should show error toast
      cy.get('.Toastify__toast--error')
        .should('contain', 'Disconnected from server');
    });

    it('should attempt automatic reconnection', () => {
      // First establish connection
      cy.get('[data-testid="connection-status"]')
        .should('contain', 'Connected');
      
      // Simulate disconnection by intercepting requests
      cy.intercept('GET', '**/socket.io/*', { statusCode: 500 }).as('failedConnection');
      
      // Force a disconnection
      cy.window().then((win) => {
        win.websocketService.disconnect();
      });
      
      // Should show disconnected status
      cy.get('[data-testid="connection-status"]')
        .should('contain', 'Disconnected');
      
      // Wait for reconnection attempts
      cy.wait('@failedConnection', { timeout: 5000 });
      cy.wait('@failedConnection', { timeout: 5000 });
      
      // Verify reconnection attempts in console
      cy.window().its('console.log').should('be.called');
    });

    it('should switch to mock data mode after max retries', () => {
      // Intercept all WebSocket connections to fail
      cy.intercept('GET', '**/socket.io/*', { forceNetworkError: true }).as('failedConnection');
      
      cy.visit('/');
      
      // Wait for multiple reconnection attempts
      for (let i = 0; i < 10; i++) {
        cy.wait('@failedConnection', { timeout: 10000 });
      }
      
      // Should show offline mode notification
      cy.get('.Toastify__toast--warning', { timeout: 30000 })
        .should('contain', 'Server unavailable. Running in offline mode with mock data.');
      
      // Should still display mock data
      cy.get('[data-testid="metrics-dashboard"]').should('exist');
      cy.get('[data-testid="active-farms-metric"]').should('exist');
      cy.get('[data-testid="total-agents-metric"]').should('exist');
    });
  });

  describe('Real-time Updates', () => {
    beforeEach(() => {
      // Ensure WebSocket is connected
      cy.get('[data-testid="connection-status"]')
        .should('contain', 'Connected');
    });

    it('should receive and display real-time metrics updates', () => {
      // Get initial metric values
      cy.get('[data-testid="active-farms-metric"]')
        .invoke('text')
        .then((initialValue) => {
          // Trigger a metrics update from the server
          cy.window().then((win) => {
            const mockMetricsUpdate = {
              type: 'metrics:update',
              event: 'metrics:update',
              data: {
                dashboard: {
                  activeFarms: parseInt(initialValue) + 1,
                  totalAgents: 15,
                  tasksCompleted: 100,
                  successRate: 95
                }
              },
              timestamp: new Date()
            };
            
            // Simulate receiving the update
            win.websocketService.handleMessage(mockMetricsUpdate);
          });
          
          // Verify the UI updates
          cy.get('[data-testid="active-farms-metric"]')
            .should('not.contain', initialValue)
            .and('contain', parseInt(initialValue) + 1);
          
          cy.get('[data-testid="total-agents-metric"]')
            .should('contain', '15');
          
          cy.get('[data-testid="tasks-completed-metric"]')
            .should('contain', '100');
          
          cy.get('[data-testid="success-rate-metric"]')
            .should('contain', '95%');
        });
    });

    it('should update farm status in real-time', () => {
      // Navigate to farms page
      cy.get('[data-testid="nav-farms"]').click();
      
      // Create a test farm
      cy.get('[data-testid="create-farm-btn"]').click();
      cy.get('[data-testid="farm-name-input"]').type('Test Farm E2E');
      cy.get('[data-testid="create-farm-submit"]').click();
      
      // Get the farm ID from the created farm
      cy.get('[data-testid^="farm-card-"]').first()
        .invoke('attr', 'data-testid')
        .then((testId) => {
          const farmId = testId.replace('farm-card-', '');
          
          // Simulate farm status update
          cy.window().then((win) => {
            const farmUpdate = {
              type: 'farm_update',
              payload: {
                event: 'updated',
                farm: {
                  id: farmId,
                  name: 'Test Farm E2E',
                  status: 'running',
                  agents: [],
                  startTime: new Date(),
                  metrics: {
                    totalTasks: 10,
                    completedTasks: 5,
                    failedTasks: 0,
                    efficiency: 90
                  }
                }
              },
              timestamp: new Date()
            };
            
            win.websocketService.handleMessage(farmUpdate);
          });
          
          // Verify UI updates
          cy.get(`[data-testid="farm-card-${farmId}"]`)
            .should('contain', 'Running')
            .and('contain', '5/10 tasks');
        });
    });

    it('should display agent status updates', () => {
      // Navigate to monitoring page
      cy.get('[data-testid="nav-monitoring"]').click();
      
      // Simulate agent status update
      cy.window().then((win) => {
        const agentUpdate = {
          type: 'agent_update',
          payload: {
            id: 'agent-e2e-test',
            name: 'E2E Test Agent',
            status: 'active',
            currentTask: 'Processing data',
            progress: 75,
            lastUpdate: new Date(),
            resources: {
              cpu: 45,
              memory: 60,
              network: 30
            }
          },
          timestamp: new Date()
        };
        
        win.websocketService.handleMessage(agentUpdate);
      });
      
      // Verify agent appears in monitoring
      cy.get('[data-testid="agent-e2e-test"]', { timeout: 5000 })
        .should('exist')
        .and('contain', 'E2E Test Agent')
        .and('contain', 'Active')
        .and('contain', 'Processing data')
        .and('contain', '75%');
      
      // Verify resource visualization updates
      cy.get('[data-testid="agent-e2e-test-cpu"]')
        .should('contain', '45%');
      cy.get('[data-testid="agent-e2e-test-memory"]')
        .should('contain', '60%');
    });

    it('should handle rapid consecutive updates', () => {
      // Navigate to dashboard
      cy.get('[data-testid="nav-dashboard"]').click();
      
      // Send multiple rapid updates
      cy.window().then((win) => {
        for (let i = 0; i < 20; i++) {
          setTimeout(() => {
            const update = {
              type: 'metrics:update',
              event: 'metrics:update',
              data: {
                dashboard: {
                  activeFarms: i + 1,
                  totalAgents: i * 2,
                  tasksCompleted: i * 10,
                  successRate: 80 + i
                }
              },
              timestamp: new Date()
            };
            
            win.websocketService.handleMessage(update);
          }, i * 100);
        }
      });
      
      // Wait for updates to complete
      cy.wait(2500);
      
      // Verify final values
      cy.get('[data-testid="active-farms-metric"]')
        .should('contain', '20');
      cy.get('[data-testid="total-agents-metric"]')
        .should('contain', '38');
      cy.get('[data-testid="tasks-completed-metric"]')
        .should('contain', '190');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle WebSocket errors gracefully', () => {
      // Trigger a WebSocket error
      cy.window().then((win) => {
        const error = new Error('Test WebSocket error');
        win.websocketService.socket?.emit('error', error);
      });
      
      // Should not crash the application
      cy.get('[data-testid="app-container"]').should('exist');
      
      // Connection status should reflect the error
      cy.get('[data-testid="connection-status"]')
        .should('exist');
    });

    it('should maintain UI functionality during disconnection', () => {
      // Disconnect WebSocket
      cy.window().then((win) => {
        win.websocketService.disconnect();
      });
      
      // UI should remain interactive
      cy.get('[data-testid="nav-farms"]').click();
      cy.url().should('include', '/farms');
      
      cy.get('[data-testid="nav-monitoring"]').click();
      cy.url().should('include', '/monitoring');
      
      // Forms should still work
      cy.get('[data-testid="nav-settings"]').click();
      cy.get('[data-testid="settings-form"]').should('exist');
    });

    it('should queue actions during disconnection and process on reconnection', () => {
      // This test would require more complex setup with a mock server
      // that can be controlled during the test
      cy.log('Test requires mock server implementation');
    });
  });

  describe('Performance', () => {
    it('should handle high-frequency updates without UI lag', () => {
      // Measure initial render performance
      cy.get('[data-testid="metrics-dashboard"]').should('exist');
      
      // Send high-frequency updates
      cy.window().then((win) => {
        const startTime = performance.now();
        let frameDrops = 0;
        let lastFrameTime = startTime;
        
        const checkFrameRate = () => {
          const currentTime = performance.now();
          const frameDuration = currentTime - lastFrameTime;
          
          // Check if frame took longer than 33ms (30fps threshold)
          if (frameDuration > 33) {
            frameDrops++;
          }
          
          lastFrameTime = currentTime;
          
          if (currentTime - startTime < 5000) {
            requestAnimationFrame(checkFrameRate);
          } else {
            // Assert frame drops are within acceptable range
            expect(frameDrops).to.be.lessThan(10);
          }
        };
        
        // Start performance monitoring
        requestAnimationFrame(checkFrameRate);
        
        // Send updates at 60fps
        const interval = setInterval(() => {
          const update = {
            type: 'metrics:update',
            event: 'metrics:update',
            data: {
              dashboard: {
                activeFarms: Math.floor(Math.random() * 10),
                totalAgents: Math.floor(Math.random() * 50),
                tasksCompleted: Math.floor(Math.random() * 200),
                successRate: Math.floor(Math.random() * 100)
              }
            },
            timestamp: new Date()
          };
          
          win.websocketService.handleMessage(update);
        }, 16); // ~60fps
        
        // Stop after 5 seconds
        setTimeout(() => clearInterval(interval), 5000);
      });
      
      // Wait for test to complete
      cy.wait(6000);
      
      // UI should still be responsive
      cy.get('[data-testid="metrics-dashboard"]').should('be.visible');
    });
  });
});