import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react-dom/test-utils';
import '@testing-library/jest-dom';
import { HarvestTerminalPro } from '../../../src/components/Harvest/HarvestTerminalPro';
import { ThemeProvider } from '../../../src/components/Harvest/themes/ThemeProvider';
import { EnhancedWebSocketService } from '../../../src/services/websocket/EnhancedWebSocketService';
import { CloudflareTunnelManager } from '../../../apps/api/src/services/cloudflareTunnel';

// Mock dependencies
jest.mock('../../../src/services/websocket/EnhancedWebSocketService', () => ({
  EnhancedWebSocketService: jest.requireActual('../../../tests/__mocks__/EnhancedWebSocketService').EnhancedWebSocketService
}));

jest.mock('../../../apps/api/src/services/cloudflareTunnel', () => ({
  CloudflareTunnelManager: jest.requireActual('../../../tests/__mocks__/CloudflareTunnelManager').CloudflareTunnelManager
}));

jest.mock('../../../src/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    socket: {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      io: {
        engine: {
          transport: {
            ws: {
              readyState: 1,
              bufferedAmount: 1024
            }
          }
        }
      },
      connected: true
    },
    isConnected: true,
    reconnect: jest.fn()
  })
}));

// Mock xterm dependencies
jest.mock('xterm', () => ({
  Terminal: jest.fn().mockImplementation(() => ({
    open: jest.fn(),
    writeln: jest.fn(),
    onData: jest.fn(),
    loadAddon: jest.fn(),
    options: {},
    dispose: jest.fn()
  }))
}));

jest.mock('xterm-addon-fit', () => ({
  FitAddon: jest.fn().mockImplementation(() => ({
    fit: jest.fn()
  }))
}));

jest.mock('xterm-addon-web-links', () => ({
  WebLinksAddon: jest.fn()
}));

jest.mock('xterm-addon-search', () => ({
  SearchAddon: jest.fn()
}));

jest.mock('xterm-addon-canvas', () => ({
  CanvasAddon: jest.fn()
}));

// Mock performance API if not available
if (!window.performance.memory) {
  Object.defineProperty(window.performance, 'memory', {
    value: {
      usedJSHeapSize: 50 * 1024 * 1024,
      totalJSHeapSize: 100 * 1024 * 1024,
      jsHeapSizeLimit: 200 * 1024 * 1024
    },
    writable: true
  });
}

// Mock fetch API
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: [] })
  })
) as jest.Mock;

describe('HarvestTerminalPro - Comprehensive Test Suite', () => {
  let mockWebSocketService: jest.Mocked<EnhancedWebSocketService>;
  
  beforeEach(() => {
    mockWebSocketService = new EnhancedWebSocketService() as jest.Mocked<EnhancedWebSocketService>;
    jest.clearAllMocks();
  });

  describe('Theme System Tests', () => {
    it('should load and render with default theme', async () => {
      const { container } = render(
        <ThemeProvider>
          <HarvestTerminalPro farmId="test-farm-123" />
        </ThemeProvider>
      );
      
      await waitFor(() => {
        expect(container.querySelector('.terminal-container')).toBeInTheDocument();
      });
      
      // Check default theme is applied
      const terminalElement = container.querySelector('.terminal-container');
      expect(terminalElement).toHaveStyle('background-color: #0c0c0c'); // Default dark theme
    });

    it('should successfully switch between all 7 themes without errors', async () => {
      const themes = ['matrix', 'cyberpunk', 'dracula', 'nord', 'solarized', 'monokai', 'github'];
      
      const { container, getByTestId } = render(
        <ThemeProvider>
          <HarvestTerminalPro farmId="test-farm-123" />
        </ThemeProvider>
      );
      
      for (const theme of themes) {
        const themeSelector = await waitFor(() => getByTestId('theme-selector'));
        
        await act(async () => {
          fireEvent.click(themeSelector);
          const themeOption = await waitFor(() => getByTestId(`theme-${theme}`));
          fireEvent.click(themeOption);
        });
        
        // Verify theme is applied
        expect(container.querySelector('.terminal-container')).toHaveClass(`theme-${theme}`);
        
        // Verify no console errors
        expect(console.error).not.toHaveBeenCalled();
      }
    });

    it('should persist theme selection across sessions', async () => {
      const { getByTestId, unmount } = render(
        <ThemeProvider>
          <HarvestTerminalPro farmId="test-farm-123" />
        </ThemeProvider>
      );
      
      // Select cyberpunk theme
      const themeSelector = await waitFor(() => getByTestId('theme-selector'));
      fireEvent.click(themeSelector);
      const cyberpunkOption = await waitFor(() => getByTestId('theme-cyberpunk'));
      fireEvent.click(cyberpunkOption);
      
      // Verify localStorage is updated
      expect(localStorage.getItem('harvest-terminal-theme')).toBe('cyberpunk');
      
      // Unmount and remount
      unmount();
      
      const { container } = render(
        <ThemeProvider>
          <HarvestTerminalPro farmId="test-farm-123" />
        </ThemeProvider>
      );
      
      // Verify theme is restored
      await waitFor(() => {
        const terminalPro = container.querySelector('.harvest-terminal-pro');
        expect(terminalPro).toBeInTheDocument();
        expect(localStorage.getItem('harvest-terminal-theme')).toBe('cyberpunk');
      });
    });

    it('should handle rapid theme switching without crashes', async () => {
      const { getByTestId } = render(
        <ThemeProvider>
          <HarvestTerminalPro farmId="test-farm-123" />
        </ThemeProvider>
      );
      
      const themes = ['matrix', 'cyberpunk', 'dracula', 'nord', 'solarized'];
      
      // Rapidly switch themes 100 times
      for (let i = 0; i < 100; i++) {
        const theme = themes[i % themes.length];
        const themeSelector = await waitFor(() => getByTestId('theme-selector'));
        
        await act(async () => {
          fireEvent.click(themeSelector);
          const themeOption = await waitFor(() => getByTestId(`theme-${theme}`));
          fireEvent.click(themeOption);
        });
      }
      
      // Verify no crashes or errors
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should apply theme-specific visual effects', async () => {
      const { container, getByTestId } = render(
        <ThemeProvider>
          <HarvestTerminalPro farmId="test-farm-123" />
        </ThemeProvider>
      );
      
      // Switch to Matrix theme
      const themeSelector = await waitFor(() => getByTestId('theme-selector'));
      fireEvent.click(themeSelector);
      const matrixOption = await waitFor(() => getByTestId('theme-matrix'));
      fireEvent.click(matrixOption);
      
      // Verify Matrix-specific effects
      await waitFor(() => {
        expect(container.querySelector('.matrix-rain-effect')).toBeInTheDocument();
        expect(container.querySelector('.scanlines')).toBeInTheDocument();
        expect(container.querySelector('.glow-text')).toBeInTheDocument();
      });
    });
  });

  describe('WebSocket Enhancement Tests', () => {
    it('should establish WebSocket connection on mount', async () => {
      render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      await waitFor(() => {
        expect(mockWebSocketService.connect).toHaveBeenCalled();
      });
    });

    it('should reconnect after disconnection with exponential backoff', async () => {
      jest.useFakeTimers();
      
      const { getByTestId } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      // Simulate disconnection
      mockWebSocketService.isConnected = false;
      mockWebSocketService.emit('disconnect');
      
      // Verify reconnection attempts with backoff
      expect(mockWebSocketService.reconnect).not.toHaveBeenCalled();
      
      jest.advanceTimersByTime(1000); // First attempt after 1s
      expect(mockWebSocketService.reconnect).toHaveBeenCalledTimes(1);
      
      jest.advanceTimersByTime(2000); // Second attempt after 2s
      expect(mockWebSocketService.reconnect).toHaveBeenCalledTimes(2);
      
      jest.advanceTimersByTime(4000); // Third attempt after 4s
      expect(mockWebSocketService.reconnect).toHaveBeenCalledTimes(3);
      
      jest.useRealTimers();
    });

    it('should batch messages efficiently', async () => {
      const { getByTestId } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      // Send multiple messages rapidly
      const messages = Array.from({ length: 100 }, (_, i) => ({
        type: 'terminal:output',
        agentId: i % 5,
        content: `Message ${i}`
      }));
      
      messages.forEach(msg => {
        mockWebSocketService.emit('message', msg);
      });
      
      // Verify messages are batched
      await waitFor(() => {
        expect(mockWebSocketService.batchMessages).toHaveBeenCalled();
        expect(mockWebSocketService.batchMessages).toHaveBeenCalledWith(
          expect.arrayContaining(messages)
        );
      });
    });

    it('should handle message prioritization correctly', async () => {
      const { container } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      // Send messages with different priorities
      const criticalMessage = { type: 'alert', priority: 'critical', content: 'Error!' };
      const normalMessage = { type: 'output', priority: 'normal', content: 'Log' };
      const lowMessage = { type: 'metric', priority: 'low', content: 'CPU: 50%' };
      
      mockWebSocketService.emit('message', lowMessage);
      mockWebSocketService.emit('message', normalMessage);
      mockWebSocketService.emit('message', criticalMessage);
      
      // Verify critical message is processed first
      await waitFor(() => {
        const alerts = container.querySelectorAll('.alert-message');
        expect(alerts[0]).toHaveTextContent('Error!');
      });
    });

    it('should compress large payloads', async () => {
      render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      // Send large payload
      const largePayload = {
        type: 'terminal:bulk-output',
        data: 'x'.repeat(10000) // 10KB of data
      };
      
      mockWebSocketService.emit('message', largePayload);
      
      // Verify compression is applied
      await waitFor(() => {
        expect(mockWebSocketService.compressPayload).toHaveBeenCalledWith(largePayload);
      });
    });
  });

  describe('Terminal Emulation Tests', () => {
    it('should initialize XTerm.js terminal correctly', async () => {
      const { container } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      await waitFor(() => {
        expect(container.querySelector('.xterm')).toBeInTheDocument();
        expect(container.querySelector('.xterm-viewport')).toBeInTheDocument();
      });
    });

    it('should support copy/paste functionality', async () => {
      const { container, getByTestId } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      const terminal = await waitFor(() => container.querySelector('.xterm'));
      
      // Simulate text selection and copy
      const selectedText = 'test command';
      await userEvent.type(terminal!, selectedText);
      
      // Copy with Cmd+C
      fireEvent.keyDown(terminal!, { key: 'c', metaKey: true });
      
      // Verify clipboard content
      const clipboardContent = await navigator.clipboard.readText();
      expect(clipboardContent).toBe(selectedText);
      
      // Test paste
      fireEvent.keyDown(terminal!, { key: 'v', metaKey: true });
      await waitFor(() => {
        expect(terminal).toHaveTextContent(selectedText + selectedText);
      });
    });

    it('should support search within terminal output', async () => {
      const { container, getByTestId } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      // Add some output to terminal
      const terminal = await waitFor(() => container.querySelector('.xterm'));
      const testOutput = 'Finding this text should work';
      
      mockWebSocketService.emit('terminal:output', { content: testOutput });
      
      // Open search with Cmd+F
      fireEvent.keyDown(terminal!, { key: 'f', metaKey: true });
      
      const searchBox = await waitFor(() => getByTestId('terminal-search'));
      await userEvent.type(searchBox, 'Finding');
      
      // Verify search results are highlighted
      await waitFor(() => {
        expect(container.querySelector('.search-highlight')).toBeInTheDocument();
      });
    });

    it('should handle ANSI color codes correctly', async () => {
      const { container } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      // Send ANSI colored output
      const coloredOutput = '\x1b[31mRed Text\x1b[0m \x1b[32mGreen Text\x1b[0m';
      mockWebSocketService.emit('terminal:output', { content: coloredOutput });
      
      await waitFor(() => {
        const redText = container.querySelector('.xterm-color-1');
        const greenText = container.querySelector('.xterm-color-2');
        
        expect(redText).toHaveTextContent('Red Text');
        expect(greenText).toHaveTextContent('Green Text');
      });
    });
  });

  describe('Mobile Interface Tests', () => {
    beforeEach(() => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', { writable: true, value: 375 });
      Object.defineProperty(window, 'innerHeight', { writable: true, value: 812 });
    });

    it('should render mobile-optimized layout on small screens', async () => {
      const { container } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      await waitFor(() => {
        expect(container.querySelector('.mobile-terminal-view')).toBeInTheDocument();
        expect(container.querySelector('.mobile-agent-cards')).toBeInTheDocument();
      });
    });

    it('should support swipe gestures between agents', async () => {
      const { container, getByTestId } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      const swipeableView = await waitFor(() => container.querySelector('.swipeable-agents'));
      
      // Simulate swipe left
      fireEvent.touchStart(swipeableView!, { touches: [{ clientX: 300, clientY: 400 }] });
      fireEvent.touchMove(swipeableView!, { touches: [{ clientX: 100, clientY: 400 }] });
      fireEvent.touchEnd(swipeableView!);
      
      // Verify agent switched
      await waitFor(() => {
        expect(getByTestId('active-agent-indicator')).toHaveTextContent('Agent 2');
      });
    });

    it('should support pinch-to-zoom on terminal output', async () => {
      const { container } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      const terminal = await waitFor(() => container.querySelector('.mobile-terminal'));
      
      // Simulate pinch gesture
      fireEvent.touchStart(terminal!, {
        touches: [
          { clientX: 100, clientY: 100 },
          { clientX: 200, clientY: 200 }
        ]
      });
      
      fireEvent.touchMove(terminal!, {
        touches: [
          { clientX: 50, clientY: 50 },
          { clientX: 250, clientY: 250 }
        ]
      });
      
      fireEvent.touchEnd(terminal!);
      
      // Verify zoom applied
      await waitFor(() => {
        expect(terminal).toHaveStyle('transform: scale(1.5)');
      });
    });

    it('should show mobile command palette with touch-optimized UI', async () => {
      const { getByTestId } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      const commandButton = await waitFor(() => getByTestId('mobile-command-button'));
      fireEvent.click(commandButton);
      
      const commandPalette = await waitFor(() => getByTestId('mobile-command-palette'));
      
      // Verify mobile-specific features
      expect(commandPalette.querySelector('.voice-input-button')).toBeInTheDocument();
      expect(commandPalette.querySelector('.quick-actions-grid')).toBeInTheDocument();
      expect(commandPalette.querySelector('.gesture-shortcuts')).toBeInTheDocument();
    });
  });

  describe('Performance and Animation Tests', () => {
    it('should maintain 60 FPS during animations', async () => {
      const { container } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      // Start performance measurement
      const startTime = performance.now();
      let frameCount = 0;
      
      const measureFPS = () => {
        frameCount++;
        if (performance.now() - startTime < 1000) {
          requestAnimationFrame(measureFPS);
        }
      };
      
      requestAnimationFrame(measureFPS);
      
      // Trigger animations
      const themeSelector = await waitFor(() => container.querySelector('[data-testid="theme-selector"]'));
      fireEvent.click(themeSelector!);
      
      // Wait for 1 second
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verify FPS
      expect(frameCount).toBeGreaterThanOrEqual(55); // Allow small margin
    });

    it('should lazy load heavy components', async () => {
      const { container } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      // Initially, heavy components should not be loaded
      expect(container.querySelector('.agent-communication-graph')).not.toBeInTheDocument();
      
      // Open visualizations tab
      const vizTab = await waitFor(() => container.querySelector('[data-testid="viz-tab"]'));
      fireEvent.click(vizTab!);
      
      // Verify lazy loading
      await waitFor(() => {
        expect(container.querySelector('.loading-spinner')).toBeInTheDocument();
      });
      
      await waitFor(() => {
        expect(container.querySelector('.agent-communication-graph')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should handle virtual scrolling for large outputs', async () => {
      const { container } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      // Add 10000 lines of output
      const largeOutput = Array.from({ length: 10000 }, (_, i) => `Line ${i}`);
      mockWebSocketService.emit('terminal:bulk-output', { lines: largeOutput });
      
      await waitFor(() => {
        // Only visible items should be rendered
        const renderedLines = container.querySelectorAll('.terminal-line');
        expect(renderedLines.length).toBeLessThan(100); // Much less than 10000
      });
      
      // Verify scrolling works
      const terminal = container.querySelector('.terminal-viewport');
      fireEvent.scroll(terminal!, { target: { scrollTop: 5000 } });
      
      await waitFor(() => {
        expect(container.querySelector('.terminal-line')).toHaveTextContent(/Line 2\d\d/);
      });
    });
  });

  describe('Command Palette Tests', () => {
    it('should open command palette with Cmd+K', async () => {
      const { container, getByTestId } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      // Press Cmd+K
      fireEvent.keyDown(document, { key: 'k', metaKey: true });
      
      const commandPalette = await waitFor(() => getByTestId('command-palette'));
      expect(commandPalette).toBeInTheDocument();
      expect(commandPalette).toHaveClass('command-palette-open');
    });

    it('should search and execute commands', async () => {
      const { getByTestId } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      // Open command palette
      fireEvent.keyDown(document, { key: 'k', metaKey: true });
      
      const searchInput = await waitFor(() => getByTestId('command-search'));
      await userEvent.type(searchInput, 'switch theme');
      
      // Verify filtered results
      await waitFor(() => {
        const results = document.querySelectorAll('.command-result');
        expect(results.length).toBeGreaterThan(0);
        expect(results[0]).toHaveTextContent(/theme/i);
      });
      
      // Execute command
      fireEvent.keyDown(searchInput, { key: 'Enter' });
      
      await waitFor(() => {
        expect(getByTestId('theme-selector')).toBeVisible();
      });
    });

    it('should show keyboard shortcuts', async () => {
      const { getByTestId } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      fireEvent.keyDown(document, { key: 'k', metaKey: true });
      
      const searchInput = await waitFor(() => getByTestId('command-search'));
      await userEvent.type(searchInput, 'shortcuts');
      
      fireEvent.keyDown(searchInput, { key: 'Enter' });
      
      const shortcutsModal = await waitFor(() => getByTestId('shortcuts-modal'));
      
      // Verify common shortcuts are listed
      expect(shortcutsModal).toHaveTextContent('Cmd/Ctrl + K');
      expect(shortcutsModal).toHaveTextContent('Cmd/Ctrl + T');
      expect(shortcutsModal).toHaveTextContent('Cmd/Ctrl + 1-9');
    });
  });

  describe('Multi-tab Support Tests', () => {
    it('should create new terminal tabs', async () => {
      const { container, getByTestId } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      // Press Cmd+T to create new tab
      fireEvent.keyDown(document, { key: 't', metaKey: true });
      
      await waitFor(() => {
        const tabs = container.querySelectorAll('.terminal-tab');
        expect(tabs).toHaveLength(2);
      });
    });

    it('should switch between tabs with keyboard shortcuts', async () => {
      const { container } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      // Create multiple tabs
      fireEvent.keyDown(document, { key: 't', metaKey: true });
      fireEvent.keyDown(document, { key: 't', metaKey: true });
      
      await waitFor(() => {
        expect(container.querySelectorAll('.terminal-tab')).toHaveLength(3);
      });
      
      // Switch to tab 2 with Cmd+2
      fireEvent.keyDown(document, { key: '2', metaKey: true });
      
      await waitFor(() => {
        const activeTab = container.querySelector('.terminal-tab.active');
        expect(activeTab).toHaveTextContent('Tab 2');
      });
    });

    it('should maintain separate sessions per tab', async () => {
      const { container, getByTestId } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      // Create new tab
      fireEvent.keyDown(document, { key: 't', metaKey: true });
      
      // Type in first tab
      const terminal1 = container.querySelectorAll('.xterm')[0];
      await userEvent.type(terminal1, 'echo "Tab 1"');
      
      // Switch to second tab
      fireEvent.keyDown(document, { key: '2', metaKey: true });
      
      // Type in second tab
      const terminal2 = container.querySelectorAll('.xterm')[1];
      await userEvent.type(terminal2, 'echo "Tab 2"');
      
      // Verify separate content
      expect(terminal1).toHaveTextContent('echo "Tab 1"');
      expect(terminal2).toHaveTextContent('echo "Tab 2"');
    });
  });

  describe('Error Handling and Recovery Tests', () => {
    it('should show error boundary on component crash', async () => {
      // Mock console.error to avoid noise in test output
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Force an error
      const ThrowError = () => {
        throw new Error('Test error');
      };
      
      const { container } = render(
        <HarvestTerminalPro farmId="test-farm-123">
          <ThrowError />
        </HarvestTerminalPro>
      );
      
      await waitFor(() => {
        expect(container.querySelector('.error-boundary')).toBeInTheDocument();
        expect(container.querySelector('.error-message')).toHaveTextContent(/something went wrong/i);
      });
      
      consoleSpy.mockRestore();
    });

    it('should recover from theme loading errors', async () => {
      // Mock theme loading failure
      jest.spyOn(console, 'error').mockImplementation();
      
      const { container, getByTestId } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      // Force theme error
      mockWebSocketService.emit('theme:error', { theme: 'invalid-theme' });
      
      await waitFor(() => {
        // Should fallback to default theme
        expect(container.querySelector('.terminal-container')).toHaveClass('theme-default');
        
        // Should show error notification
        expect(container.querySelector('.error-notification')).toHaveTextContent(/theme.*failed/i);
      });
    });

    it('should handle WebSocket reconnection failures gracefully', async () => {
      const { container } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      // Simulate multiple failed reconnection attempts
      for (let i = 0; i < 10; i++) {
        mockWebSocketService.emit('reconnect:failed', { attempt: i + 1 });
      }
      
      await waitFor(() => {
        // Should show offline mode
        expect(container.querySelector('.offline-mode-banner')).toBeInTheDocument();
        
        // Should still allow local operations
        const themeSelector = container.querySelector('[data-testid="theme-selector"]');
        expect(themeSelector).not.toBeDisabled();
      });
    });
  });

  describe('Accessibility Tests', () => {
    it('should have proper ARIA labels', async () => {
      const { container } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      await waitFor(() => {
        expect(container.querySelector('[aria-label="Terminal output"]')).toBeInTheDocument();
        expect(container.querySelector('[aria-label="Command input"]')).toBeInTheDocument();
        expect(container.querySelector('[aria-label="Theme selector"]')).toBeInTheDocument();
      });
    });

    it('should support keyboard navigation', async () => {
      const { container } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      // Tab through interactive elements
      const focusableElements = container.querySelectorAll(
        'button, input, select, [tabindex]:not([tabindex="-1"])'
      );
      
      focusableElements[0].focus();
      
      for (let i = 1; i < focusableElements.length; i++) {
        fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
        expect(document.activeElement).toBe(focusableElements[i]);
      }
    });

    it('should announce state changes to screen readers', async () => {
      const { container } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      // Verify live regions exist
      expect(container.querySelector('[aria-live="polite"]')).toBeInTheDocument();
      expect(container.querySelector('[aria-live="assertive"]')).toBeInTheDocument();
      
      // Trigger state change
      mockWebSocketService.emit('agent:status', { agentId: 0, status: 'completed' });
      
      await waitFor(() => {
        const liveRegion = container.querySelector('[aria-live="polite"]');
        expect(liveRegion).toHaveTextContent(/Agent.*completed/i);
      });
    });
  });
});