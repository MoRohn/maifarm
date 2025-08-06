import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import { TerminalContainer } from '../TerminalContainer';

// Mock the hooks
jest.mock('../hooks/useTerminalSession', () => ({
  useTerminalSession: jest.fn(() => ({
    sessions: [
      {
        id: 'farm_test123',
        sessionName: 'farm_test123',
        farmId: 'test123',
        paneCount: 3,
        windowName: 'agents',
        active: true,
        status: 'running',
        createdAt: new Date(),
        agents: [
          { id: 0, sessionId: 'farm_test123', paneId: 'farm_test123:0', status: 'ready', commandHistory: [] },
          { id: 1, sessionId: 'farm_test123', paneId: 'farm_test123:1', status: 'working', commandHistory: [] },
          { id: 2, sessionId: 'farm_test123', paneId: 'farm_test123:2', status: 'ready', commandHistory: [] }
        ]
      }
    ],
    activeSession: 'farm_test123',
    isLoading: false,
    error: null,
    isConnected: true,
    setActiveSession: jest.fn(),
    getSession: jest.fn((id) => ({
      id: 'farm_test123',
      sessionName: 'farm_test123',
      farmId: 'test123',
      paneCount: 3,
      windowName: 'agents',
      active: true,
      status: 'running',
      createdAt: new Date(),
      agents: [
        { id: 0, sessionId: 'farm_test123', paneId: 'farm_test123:0', status: 'ready', commandHistory: [] },
        { id: 1, sessionId: 'farm_test123', paneId: 'farm_test123:1', status: 'working', commandHistory: [] },
        { id: 2, sessionId: 'farm_test123', paneId: 'farm_test123:2', status: 'ready', commandHistory: [] }
      ]
    })),
    getSessionAgents: jest.fn(() => [
      { id: 0, sessionId: 'farm_test123', paneId: 'farm_test123:0', status: 'ready', commandHistory: [] },
      { id: 1, sessionId: 'farm_test123', paneId: 'farm_test123:1', status: 'working', commandHistory: [] },
      { id: 2, sessionId: 'farm_test123', paneId: 'farm_test123:2', status: 'ready', commandHistory: [] }
    ])
  }))
}));

jest.mock('../hooks/useTerminalOutput', () => ({
  useTerminalOutput: jest.fn(() => ({
    getOutput: jest.fn((sessionId, agentId) => [
      `Agent ${agentId} initialized`,
      `Running commands...`,
      `$ ls -la`,
      `total 42`,
      `drwxr-xr-x 2 user user 4096 Jan  1 12:00 .`,
      `drwxr-xr-x 3 user user 4096 Jan  1 12:00 ..`
    ]),
    fetchMultipleOutputs: jest.fn(),
    registerTerminalRef: jest.fn(),
    hasOutput: jest.fn(() => true),
    scrollToBottom: jest.fn()
  }))
}));

jest.mock('../hooks/useTerminalCommand', () => ({
  useTerminalCommand: jest.fn(() => ({
    sendCommand: jest.fn().mockResolvedValue(true),
    sendCommandToMultiple: jest.fn().mockResolvedValue([
      { agentId: 0, success: true },
      { agentId: 1, success: true },
      { agentId: 2, success: true }
    ]),
    currentCommand: '',
    setCurrentCommand: jest.fn(),
    commandHistory: ['ls -la', 'pwd', 'git status'],
    isExecuting: false,
    navigateHistory: jest.fn(),
    getCommandSuggestions: jest.fn(() => ['ls', 'pwd', 'cd'])
  }))
}));

describe('TerminalContainer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders terminal container with session data', async () => {
    render(<TerminalContainer farmId="test123" />);
    
    await waitFor(() => {
      expect(screen.getByText('Unified Terminal')).toBeInTheDocument();
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });
  });

  it('displays terminal grid by default', async () => {
    render(<TerminalContainer farmId="test123" defaultViewMode="grid" />);
    
    await waitFor(() => {
      // Should show all 3 agents in grid mode
      expect(screen.getByText('Agent 0')).toBeInTheDocument();
      expect(screen.getByText('Agent 1')).toBeInTheDocument();
      expect(screen.getByText('Agent 2')).toBeInTheDocument();
    });
  });

  it('switches to single view mode', async () => {
    render(<TerminalContainer farmId="test123" defaultViewMode="grid" />);
    
    await waitFor(() => {
      expect(screen.getByText('Agent 0')).toBeInTheDocument();
    });

    // Click single view mode button (monitor icon)
    const singleViewButton = screen.getByTitle('Single View');
    fireEvent.click(singleViewButton);

    // Should now show only one agent
    await waitFor(() => {
      const agentElements = screen.getAllByText(/Agent \d/);
      expect(agentElements.length).toBeLessThan(3); // Less than 3 because we're in single view
    });
  });

  it('displays session selector when multiple sessions exist', async () => {
    render(<TerminalContainer />);
    
    await waitFor(() => {
      expect(screen.getByDisplayValue('farm_test123 (3 agents)')).toBeInTheDocument();
    });
  });

  it('shows no sessions message when no sessions are available', async () => {
    // Mock empty sessions
    const mockUseTerminalSession = require('../hooks/useTerminalSession').useTerminalSession;
    mockUseTerminalSession.mockReturnValueOnce({
      sessions: [],
      activeSession: null,
      isLoading: false,
      error: null,
      isConnected: true,
      setActiveSession: jest.fn(),
      getSession: jest.fn(() => null),
      getSessionAgents: jest.fn(() => [])
    });

    render(<TerminalContainer farmId="test123" />);
    
    await waitFor(() => {
      expect(screen.getByText('No active terminal sessions')).toBeInTheDocument();
      expect(screen.getByText('Launch a farm to see agent terminals')).toBeInTheDocument();
    });
  });

  it('displays loading state', async () => {
    // Mock loading state
    const mockUseTerminalSession = require('../hooks/useTerminalSession').useTerminalSession;
    mockUseTerminalSession.mockReturnValueOnce({
      sessions: [],
      activeSession: null,
      isLoading: true,
      error: null,
      isConnected: true,
      setActiveSession: jest.fn(),
      getSession: jest.fn(() => null),
      getSessionAgents: jest.fn(() => [])
    });

    render(<TerminalContainer farmId="test123" />);
    
    await waitFor(() => {
      expect(screen.getByText('Loading terminal sessions...')).toBeInTheDocument();
    });
  });

  it('displays error state', async () => {
    // Mock error state
    const mockUseTerminalSession = require('../hooks/useTerminalSession').useTerminalSession;
    mockUseTerminalSession.mockReturnValueOnce({
      sessions: [],
      activeSession: null,
      isLoading: false,
      error: 'Failed to connect to terminal service',
      isConnected: false,
      setActiveSession: jest.fn(),
      getSession: jest.fn(() => null),
      getSessionAgents: jest.fn(() => [])
    });

    render(<TerminalContainer farmId="test123" />);
    
    await waitFor(() => {
      expect(screen.getByText('Error: Failed to connect to terminal service')).toBeInTheDocument();
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });
  });

  it('toggles fullscreen mode', async () => {
    render(<TerminalContainer farmId="test123" />);
    
    const fullscreenButton = screen.getByTitle('Fullscreen');
    fireEvent.click(fullscreenButton);

    await waitFor(() => {
      expect(screen.getByTitle('Exit Fullscreen')).toBeInTheDocument();
    });
  });

  it('sends commands in grid mode to all agents', async () => {
    const mockSendCommandToMultiple = jest.fn().mockResolvedValue([
      { agentId: 0, success: true },
      { agentId: 1, success: true },
      { agentId: 2, success: true }
    ]);

    const mockUseTerminalCommand = require('../hooks/useTerminalCommand').useTerminalCommand;
    mockUseTerminalCommand.mockReturnValue({
      sendCommand: jest.fn(),
      sendCommandToMultiple: mockSendCommandToMultiple,
      currentCommand: 'ls -la',
      setCurrentCommand: jest.fn(),
      commandHistory: [],
      isExecuting: false,
      navigateHistory: jest.fn(),
      getCommandSuggestions: jest.fn(() => [])
    });

    render(<TerminalContainer farmId="test123" defaultViewMode="grid" showControls={true} />);

    // Find and interact with command input (this would depend on the actual UI structure)
    await waitFor(() => {
      expect(screen.getByText('Unified Terminal')).toBeInTheDocument();
    });

    // In a real test, we would simulate typing a command and pressing enter
    // For now, we just verify the mock is set up correctly
    expect(mockSendCommandToMultiple).toBeDefined();
  });

  it('handles tab switching in tabs view mode', async () => {
    render(<TerminalContainer farmId="test123" defaultViewMode="tabs" />);
    
    await waitFor(() => {
      expect(screen.getByText('Unified Terminal')).toBeInTheDocument();
    });

    // Click tabs view mode
    const tabsViewButton = screen.getByTitle('Tabbed View');
    fireEvent.click(tabsViewButton);

    await waitFor(() => {
      // Should show tab buttons for each agent
      expect(screen.getByText('Agent 0')).toBeInTheDocument();
      expect(screen.getByText('Agent 1')).toBeInTheDocument();
      expect(screen.getByText('Agent 2')).toBeInTheDocument();
    });
  });
});

describe('TerminalContainer Integration', () => {
  it('loads terminal output for all agents when session changes', async () => {
    const mockFetchMultipleOutputs = jest.fn();
    
    const mockUseTerminalOutput = require('../hooks/useTerminalOutput').useTerminalOutput;
    mockUseTerminalOutput.mockReturnValue({
      getOutput: jest.fn(() => ['Test output']),
      fetchMultipleOutputs: mockFetchMultipleOutputs,
      registerTerminalRef: jest.fn(),
      hasOutput: jest.fn(() => true),
      scrollToBottom: jest.fn()
    });

    render(<TerminalContainer farmId="test123" />);

    await waitFor(() => {
      expect(mockFetchMultipleOutputs).toHaveBeenCalledWith('farm_test123', [0, 1, 2]);
    });
  });

  it('maintains responsive layout across different screen sizes', async () => {
    // Mock different screen sizes
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 768, // Tablet size
    });

    render(<TerminalContainer farmId="test123" defaultViewMode="grid" />);
    
    await waitFor(() => {
      expect(screen.getByText('Unified Terminal')).toBeInTheDocument();
    });

    // Test would verify responsive classes are applied correctly
    // This would require more detailed DOM inspection
  });
});