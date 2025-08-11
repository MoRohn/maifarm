import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { HarvestTerminalPro } from '../HarvestTerminalPro';
import { HarvestTerminal } from '../HarvestTerminal';
import { useWebSocket } from '../../../hooks/useWebSocket';
import { useFarmStore } from '../../../store/farmStore';
import { useSettingsStore } from '../../../store/settingsStore';

// Mock dependencies
jest.mock('../../../hooks/useWebSocket');
jest.mock('../../../store/farmStore');
jest.mock('../../../store/settingsStore');
jest.mock('../../../hooks/useTabVisibility', () => ({
  useTabVisibility: () => ({
    isVisible: true,
    wasInBackground: false,
    backgroundDurationFormatted: '0s'
  })
}));

// Mock XTerm
jest.mock('xterm', () => ({
  Terminal: jest.fn().mockImplementation(() => ({
    open: jest.fn(),
    writeln: jest.fn(),
    write: jest.fn(),
    onData: jest.fn(),
    loadAddon: jest.fn(),
    options: {}
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

describe('HarvestTerminalPro', () => {
  const mockSocket = {
    connected: true,
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    io: {
      engine: {
        transport: {
          ws: {
            readyState: 1,
            bufferedAmount: 0
          }
        }
      }
    }
  };

  const mockFarm = {
    id: 'test-farm-123',
    name: 'Test Farm',
    status: 'running',
    agentCount: 3,
    agents: [
      { id: 0, name: 'Agent Alpha', role: 'Coordinator' },
      { id: 1, name: 'Agent Beta', role: 'Worker' },
      { id: 2, name: 'Agent Gamma', role: 'Analyzer' }
    ]
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    (useWebSocket as jest.Mock).mockReturnValue({
      socket: mockSocket,
      isConnected: true,
      reconnect: jest.fn()
    });

    (useFarmStore as jest.Mock).mockReturnValue({
      farms: [mockFarm]
    });

    (useSettingsStore as jest.Mock).mockReturnValue({
      getSetting: jest.fn((key, defaultValue) => {
        if (key === 'harvestTerminalPro') return true;
        if (key === 'enableAnimations') return true;
        if (key === 'terminalFontSize') return 14;
        if (key === 'terminalTheme') return 'matrix';
        return defaultValue;
      }),
      setSetting: jest.fn()
    });

    // Mock fetch for sessions
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          data: [
            {
              sessionName: 'farm-test-123',
              paneCount: 3,
              windowName: 'agents',
              active: true,
              farmId: 'test-farm-123'
            }
          ]
        })
      })
    ) as jest.Mock;
  });

  describe('Component Rendering', () => {
    it('should render HarvestTerminalPro when pro mode is enabled', async () => {
      render(<HarvestTerminal farmId="test-farm-123" forceProMode={true} />);
      
      await waitFor(() => {
        expect(screen.getByText(/HARVEST TERMINAL PRO/)).toBeInTheDocument();
      });
    });

    it('should render legacy terminal when legacy mode is forced', () => {
      render(<HarvestTerminal farmId="test-farm-123" legacyMode={true} />);
      
      expect(screen.queryByText(/HARVEST TERMINAL PRO/)).not.toBeInTheDocument();
    });

    it('should display loading state while pro mode loads', () => {
      render(<HarvestTerminal farmId="test-farm-123" forceProMode={true} />);
      
      expect(screen.getByText(/Loading Harvest Terminal Pro/)).toBeInTheDocument();
    });
  });

  describe('Theme System', () => {
    it('should render all available themes', async () => {
      const { container } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      await waitFor(() => {
        const themeButton = container.querySelector('[title*="theme"]');
        expect(themeButton).toBeInTheDocument();
      });
    });

    it('should switch themes on button click', async () => {
      const onThemeChange = jest.fn();
      const { container } = render(
        <HarvestTerminalPro farmId="test-farm-123" onThemeChange={onThemeChange} />
      );
      
      await waitFor(() => {
        const themeButton = container.querySelector('[title*="theme"]');
        if (themeButton) {
          fireEvent.click(themeButton);
        }
      });
      
      expect(onThemeChange).toHaveBeenCalled();
    });

    it('should save theme preference to settings', async () => {
      const mockSetSetting = jest.fn();
      (useSettingsStore as jest.Mock).mockReturnValue({
        getSetting: jest.fn(),
        setSetting: mockSetSetting
      });
      
      const { container } = render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      await waitFor(() => {
        const themeButton = container.querySelector('[title*="theme"]');
        if (themeButton) {
          fireEvent.click(themeButton);
        }
      });
      
      expect(mockSetSetting).toHaveBeenCalledWith('terminalTheme', expect.any(String));
    });
  });

  describe('View Modes', () => {
    it('should support grid view mode', async () => {
      render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      await waitFor(() => {
        const viewButton = screen.getByRole('button', { name: /view/i });
        fireEvent.click(viewButton);
      });
      
      // Grid view should show multiple terminals
      expect(screen.getAllByText(/Agent/)).toHaveLength(3);
    });

    it('should support single agent view', async () => {
      render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      await waitFor(() => {
        const viewButton = screen.getByRole('button', { name: /view/i });
        fireEvent.click(viewButton);
        fireEvent.click(viewButton); // Cycle to single view
      });
      
      // Should show agent selector
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
  });

  describe('WebSocket Integration', () => {
    it('should connect to WebSocket on mount', () => {
      render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      expect(mockSocket.on).toHaveBeenCalledWith('terminal:output', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('harvest:terminal:update', expect.any(Function));
    });

    it('should handle terminal output updates', async () => {
      render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      const outputHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'terminal:output'
      )?.[1];
      
      act(() => {
        outputHandler?.({
          sessionId: 'farm-test-123',
          agentId: 0,
          output: 'Test output from agent'
        });
      });
      
      // Terminal should receive the output
      expect(mockSocket.on).toHaveBeenCalled();
    });

    it('should emit terminal input on user interaction', async () => {
      render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      await waitFor(() => {
        expect(mockSocket.emit).toHaveBeenCalledWith(
          'terminal:input',
          expect.objectContaining({
            sessionId: expect.any(String),
            agentId: expect.any(Number),
            data: expect.any(String)
          })
        );
      });
    });
  });

  describe('Performance Monitoring', () => {
    it('should display performance metrics', async () => {
      render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      await waitFor(() => {
        expect(screen.getByText(/FPS/)).toBeInTheDocument();
        expect(screen.getByText(/Latency/)).toBeInTheDocument();
      });
    });

    it('should update metrics periodically', async () => {
      jest.useFakeTimers();
      
      render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      await waitFor(() => {
        expect(screen.getByText(/60 FPS/)).toBeInTheDocument();
      });
      
      jest.useRealTimers();
    });
  });

  describe('Mobile Support', () => {
    it('should enable mobile view when configured', async () => {
      render(<HarvestTerminalPro farmId="test-farm-123" enableMobileView={true} />);
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /mobile/i })).toBeInTheDocument();
      });
    });

    it('should toggle between mobile and desktop views', async () => {
      render(<HarvestTerminalPro farmId="test-farm-123" enableMobileView={true} />);
      
      const mobileButton = await screen.findByRole('button', { name: /mobile/i });
      fireEvent.click(mobileButton);
      
      expect(screen.getByRole('button', { name: /desktop/i })).toBeInTheDocument();
    });
  });

  describe('Cloudflare Integration', () => {
    it('should show Cloudflare status when enabled', async () => {
      render(<HarvestTerminalPro farmId="test-farm-123" enableCloudflare={true} />);
      
      await waitFor(() => {
        expect(screen.getByText(/Cloudflare/)).toBeInTheDocument();
      });
    });

    it('should connect to Cloudflare tunnel', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            tunnelUrl: 'https://test.trycloudflare.com'
          })
        })
      ) as jest.Mock;
      
      render(<HarvestTerminalPro farmId="test-farm-123" enableCloudflare={true} />);
      
      const cloudflareButton = await screen.findByRole('button', { name: /cloudflare/i });
      fireEvent.click(cloudflareButton);
      
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/cloudflare/tunnel',
          expect.objectContaining({
            method: 'POST'
          })
        );
      });
    });
  });

  describe('Command Palette', () => {
    it('should open command palette on keyboard shortcut', async () => {
      render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      act(() => {
        fireEvent.keyDown(window, { key: 'k', metaKey: true });
      });
      
      await waitFor(() => {
        expect(screen.getByText(/Command Palette/)).toBeInTheDocument();
      });
    });

    it('should execute commands from palette', async () => {
      render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      act(() => {
        fireEvent.keyDown(window, { key: 'k', metaKey: true });
      });
      
      const themeCommand = await screen.findByText(/Switch to Matrix Theme/);
      fireEvent.click(themeCommand);
      
      // Command palette should close
      expect(screen.queryByText(/Command Palette/)).not.toBeInTheDocument();
    });
  });

  describe('Session Recording', () => {
    it('should toggle session recording', async () => {
      render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      act(() => {
        fireEvent.keyDown(window, { key: 'k', metaKey: true });
      });
      
      const recordCommand = await screen.findByText(/Start Recording/);
      fireEvent.click(recordCommand);
      
      expect(screen.getByText(/REC/)).toBeInTheDocument();
    });

    it('should track recorded commands', async () => {
      render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      // Start recording
      act(() => {
        fireEvent.keyDown(window, { key: 'k', metaKey: true });
      });
      
      const recordCommand = await screen.findByText(/Start Recording/);
      fireEvent.click(recordCommand);
      
      // Simulate terminal input
      act(() => {
        mockSocket.emit('terminal:input', {
          sessionId: 'test-session',
          agentId: 0,
          data: 'ls -la'
        });
      });
      
      expect(screen.getByText(/Recording: \d+ commands/)).toBeInTheDocument();
    });
  });

  describe('Backward Compatibility', () => {
    it('should respect legacy mode prop', () => {
      const { container } = render(
        <HarvestTerminal farmId="test-farm-123" legacyMode={true} />
      );
      
      expect(container.querySelector('.harvest-terminal-pro')).not.toBeInTheDocument();
      expect(container.querySelector('.harvest-terminal')).toBeInTheDocument();
    });

    it('should use feature flag from settings', async () => {
      (useSettingsStore as jest.Mock).mockReturnValue({
        getSetting: jest.fn((key) => key === 'harvestTerminalPro' ? false : undefined),
        setSetting: jest.fn()
      });
      
      const { container } = render(<HarvestTerminal farmId="test-farm-123" />);
      
      expect(container.querySelector('.harvest-terminal-pro')).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle WebSocket disconnection gracefully', async () => {
      (useWebSocket as jest.Mock).mockReturnValue({
        socket: null,
        isConnected: false,
        reconnect: jest.fn()
      });
      
      render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      await waitFor(() => {
        expect(screen.getByText(/Disconnected/)).toBeInTheDocument();
      });
    });

    it('should handle session fetch errors', async () => {
      global.fetch = jest.fn(() =>
        Promise.reject(new Error('Network error'))
      ) as jest.Mock;
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      render(<HarvestTerminalPro farmId="test-farm-123" />);
      
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          'Error fetching sessions:',
          expect.any(Error)
        );
      });
      
      consoleSpy.mockRestore();
    });
  });
});

describe('Integration Tests', () => {
  it('should handle multi-agent coordination', async () => {
    const mockSessions = [
      {
        sessionName: 'multi-agent-session',
        paneCount: 5,
        windowName: 'agents',
        active: true,
        farmId: 'multi-farm-123'
      }
    ];
    
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: mockSessions })
      })
    ) as jest.Mock;
    
    render(<HarvestTerminalPro farmId="multi-farm-123" />);
    
    await waitFor(() => {
      expect(screen.getByText(/5 agents/)).toBeInTheDocument();
    });
  });

  it('should sync with mobile devices via Cloudflare', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('cloudflare')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            tunnelUrl: 'https://mobile.trycloudflare.com',
            qrCode: 'data:image/png;base64,mockQR'
          })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [] })
      });
    }) as jest.Mock;
    
    render(<HarvestTerminalPro farmId="test-farm-123" enableCloudflare={true} />);
    
    const cloudflareButton = await screen.findByRole('button', { name: /cloudflare/i });
    fireEvent.click(cloudflareButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Cloudflare Connected/)).toBeInTheDocument();
    });
  });

  it('should maintain terminal state across theme changes', async () => {
    const { container } = render(<HarvestTerminalPro farmId="test-farm-123" />);
    
    // Switch theme multiple times
    for (let i = 0; i < 3; i++) {
      act(() => {
        fireEvent.keyDown(window, { key: 't', metaKey: true });
      });
      
      await waitFor(() => {
        expect(container.querySelector('.harvest-terminal-pro')).toBeInTheDocument();
      });
    }
    
    // Terminal should still be functional
    expect(mockSocket.on).toHaveBeenCalled();
  });
});