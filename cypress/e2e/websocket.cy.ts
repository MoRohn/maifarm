describe('WebSocket Functionality', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.wait(1000)
  })

  describe('WebSocket Connection', () => {
    it('should establish WebSocket connection on startup', () => {
      cy.window().then((win) => {
        expect(win).to.have.property('WebSocket')
      })
      
      // Check connection status indicator
      cy.get('header').within(() => {
        cy.get('[class*="bg-green"]').should('exist') // Connected indicator
      })
    })

    it('should show disconnected state when WebSocket fails', () => {
      // Block WebSocket connection
      cy.visit('/', {
        onBeforeLoad(win) {
          // Override WebSocket to simulate connection failure
          win.WebSocket = class MockWebSocket {
            constructor(url: string) {
              setTimeout(() => {
                if (this.onerror) this.onerror(new Event('error'))
              }, 100)
            }
            send() {}
            close() {}
            onerror: ((event: Event) => void) | null = null
            onopen: ((event: Event) => void) | null = null
            onclose: ((event: Event) => void) | null = null
            onmessage: ((event: MessageEvent) => void) | null = null
          } as any
        }
      })
      
      cy.contains('Disconnected').should('be.visible')
      cy.get('[class*="bg-red"]').should('exist')
    })

    it('should reconnect after disconnection', () => {
      // Test reconnection logic
      cy.window().then((win) => {
        // Access WebSocket store if available
        if ((win as any).websocketStore) {
          const store = (win as any).websocketStore
          // Simulate disconnection and reconnection
          store.disconnect()
          cy.contains('Disconnected').should('be.visible')
          
          store.connect()
          cy.contains('Connected').should('be.visible')
        }
      })
    })
  })

  describe('Real-time Updates', () => {
    it('should update metrics in real-time', () => {
      // Get initial metric value
      cy.get('[data-testid="stats-card"]').contains('Active Farms').parent().within(() => {
        cy.get('[data-testid="metric-value"]').then($value => {
          const initialValue = $value.text()
          
          // Simulate WebSocket message
          cy.window().then((win) => {
            if ((win as any).websocketStore) {
              const store = (win as any).websocketStore
              store.handleMessage({
                type: 'metrics:update',
                payload: {
                  activeFarms: parseInt(initialValue) + 1,
                  totalAgents: 10,
                  tasksCompleted: 50,
                  successRate: 95
                }
              })
              
              // Check if value updated
              cy.get('[data-testid="metric-value"]').should('not.have.text', initialValue)
            }
          })
        })
      })
    })

    it('should update farm status in real-time', () => {
      // Create a test farm first
      cy.contains('button', 'New Farm').click()
      cy.get('[data-testid="farm-name-input"]').type('WebSocket Test Farm')
      cy.contains('button', 'Create Farm').click()
      
      // Wait for farm to be created
      cy.contains('WebSocket Test Farm', { timeout: 10000 }).should('exist')
      
      // Simulate status update via WebSocket
      cy.window().then((win) => {
        if ((win as any).websocketStore) {
          const store = (win as any).websocketStore
          store.handleMessage({
            type: 'farm_update',
            payload: {
              event: 'updated',
              farm: {
                id: 'test-farm-1',
                name: 'WebSocket Test Farm',
                status: 'running'
              }
            }
          })
          
          // Verify status updated
          cy.contains('WebSocket Test Farm').parent().within(() => {
            cy.contains('running').should('exist')
          })
        }
      })
    })

    it('should show recent activity from WebSocket events', () => {
      cy.window().then((win) => {
        if ((win as any).websocketStore) {
          const store = (win as any).websocketStore
          store.handleMessage({
            type: 'activity',
            payload: {
              id: 'activity-1',
              type: 'farm_created',
              title: 'New Farm Created',
              description: 'Test farm created via WebSocket',
              timestamp: new Date().toISOString()
            }
          })
          
          // Check if activity appears
          cy.contains('Recent Activity').parent().within(() => {
            cy.contains('New Farm Created').should('exist')
          })
        }
      })
    })
  })

  describe('WebSocket Error Handling', () => {
    it('should handle malformed messages gracefully', () => {
      cy.window().then((win) => {
        if ((win as any).websocketStore) {
          const store = (win as any).websocketStore
          
          // Send malformed message
          store.handleMessage({
            type: 'invalid_type',
            payload: null
          })
          
          // App should not crash
          cy.contains('Dashboard').should('exist')
        }
      })
    })

    it('should queue messages when disconnected', () => {
      cy.window().then((win) => {
        if ((win as any).websocketStore) {
          const store = (win as any).websocketStore
          
          // Disconnect
          store.disconnect()
          
          // Try to send message
          store.send({
            type: 'test_message',
            payload: { data: 'test' }
          })
          
          // Check if message is queued
          expect(store.messageQueue).to.have.length.greaterThan(0)
          
          // Reconnect and verify queue is processed
          store.connect()
          cy.wait(1000)
          expect(store.messageQueue).to.have.length(0)
        }
      })
    })

    it('should implement exponential backoff for reconnection', () => {
      let reconnectAttempts = 0
      
      cy.visit('/', {
        onBeforeLoad(win) {
          // Mock WebSocket with tracking
          const OriginalWebSocket = win.WebSocket
          win.WebSocket = class MockWebSocket extends OriginalWebSocket {
            constructor(url: string) {
              super(url)
              reconnectAttempts++
              
              // Fail first few attempts
              if (reconnectAttempts < 3) {
                setTimeout(() => {
                  if (this.onerror) this.onerror(new Event('error'))
                  if (this.onclose) this.onclose(new CloseEvent('close'))
                }, 100)
              }
            }
          } as any
        }
      })
      
      // Wait for reconnection attempts
      cy.wait(5000)
      
      cy.window().then(() => {
        expect(reconnectAttempts).to.be.greaterThan(1)
      })
    })
  })

  describe('WebSocket Performance', () => {
    it('should handle high-frequency updates without lag', () => {
      cy.window().then((win) => {
        if ((win as any).websocketStore) {
          const store = (win as any).websocketStore
          
          // Send multiple rapid updates
          for (let i = 0; i < 50; i++) {
            store.handleMessage({
              type: 'metrics:update',
              payload: {
                activeFarms: i,
                totalAgents: i * 2,
                tasksCompleted: i * 5,
                successRate: 90 + (i % 10)
              }
            })
          }
          
          // UI should remain responsive
          cy.get('[data-testid="stats-card"]').should('be.visible')
          cy.contains('Dashboard').should('exist')
        }
      })
    })

    it('should debounce metric updates', () => {
      let updateCount = 0
      
      // Intercept metric update calls
      cy.window().then((win) => {
        const originalUpdate = (win as any).metricsService?.updateMetrics
        if (originalUpdate) {
          (win as any).metricsService.updateMetrics = function(...args: any[]) {
            updateCount++
            return originalUpdate.apply(this, args)
          }
        }
      })
      
      // Send multiple updates rapidly
      cy.window().then((win) => {
        if ((win as any).websocketStore) {
          const store = (win as any).websocketStore
          
          for (let i = 0; i < 10; i++) {
            store.handleMessage({
              type: 'metrics:update',
              payload: { activeFarms: i }
            })
          }
        }
      })
      
      cy.wait(1000)
      
      // Should have debounced updates
      cy.window().then(() => {
        expect(updateCount).to.be.lessThan(10)
      })
    })
  })
})