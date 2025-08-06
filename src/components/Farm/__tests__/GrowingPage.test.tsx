import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { jest } from '@jest/globals';
import { GrowingPage } from '../GrowingPage';

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ farmId: 'test-farm-123' }),
  useNavigate: () => mockNavigate
}));

// Mock stores
const mockSubscribe = jest.fn((event, handler) => {
  // Return unsubscribe function
  return () => {};
});

const mockUseFarmStore = jest.fn(() => ({
  farms: [
    {
      id: 'test-farm-123',
      name: 'Test Farm',
      status: 'preparing',
      createdAt: new Date(Date.now() - 5000).toISOString(), // 5 seconds ago
      type: 'standard',
      description: 'Test farm for unit tests'
    }
  ]
}));

jest.mock('../../../store/websocketStore', () => ({
  useWebSocketStore: () => ({
    subscribe: mockSubscribe
  })
}));

jest.mock('../../../store/farmStore', () => ({
  useFarmStore: mockUseFarmStore
}));

// Mock framer-motion to avoid animation issues in tests
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>
  },
  AnimatePresence: ({ children }: any) => children
}));

// Mock CompactorAnimation component
jest.mock('../../common/CompactorAnimation', () => {
  return {
    __esModule: true,
    default: ({ className }: any) => (
      <div className={className} data-testid="compactor-animation">
        Compactor Animation
      </div>
    )
  };
});

describe('GrowingPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderGrowingPage = () => {
    return render(
      <BrowserRouter>
        <GrowingPage />
      </BrowserRouter>
    );
  };

  it('renders growing page with farm name', async () => {
    renderGrowingPage();
    
    await waitFor(() => {
      expect(screen.getByText('Test Farm')).toBeInTheDocument();
    });
  });

  it('displays progressive messages based on farm age', async () => {
    renderGrowingPage();
    
    await waitFor(() => {
      // Should show early stage message (farm is 5 seconds old)
      expect(screen.getByText(/Preparing AI agents/)).toBeInTheDocument();
      expect(screen.getByText(/Preparing your farm/)).toBeInTheDocument();
    });
  });

  it('updates messages as farm ages', async () => {
    // Mock a farm that's 15 seconds old
    mockUseFarmStore.mockReturnValue({
      farms: [
        {
          id: 'test-farm-123',
          name: 'Test Farm',
          status: 'preparing',
          createdAt: new Date(Date.now() - 15000).toISOString(), // 15 seconds ago
          type: 'standard',
          description: 'Test farm for unit tests'
        }
      ]
    });

    renderGrowingPage();
    
    await waitFor(() => {
      // Should show CLI session starting messages
      expect(screen.getByText(/Starting CLI sessions/)).toBeInTheDocument();
      expect(screen.getByText(/Starting your farm/)).toBeInTheDocument();
    });
  });

  it('shows auto-redirect countdown for aged farms', async () => {
    // Mock a farm that's 50 seconds old (past 45s threshold)
    mockUseFarmStore.mockReturnValue({
      farms: [
        {
          id: 'test-farm-123',
          name: 'Test Farm',
          status: 'preparing',
          createdAt: new Date(Date.now() - 50000).toISOString(), // 50 seconds ago
          type: 'standard',
          description: 'Test farm for unit tests'
        }
      ]
    });

    renderGrowingPage();
    
    await waitFor(() => {
      expect(screen.getByText(/Auto-redirect in \d+s/)).toBeInTheDocument();
    });
  });

  it('navigates to harvest when farm status changes to launching', async () => {
    // Start with preparing status
    
    const { rerender } = renderGrowingPage();
    
    // Update farm status to launching
    mockUseFarmStore.mockReturnValue({
      farms: [
        {
          id: 'test-farm-123',
          name: 'Test Farm',
          status: 'launching',
          createdAt: new Date(Date.now() - 5000).toISOString(),
          type: 'standard',
          description: 'Test farm for unit tests'
        }
      ]
    });

    rerender(
      <BrowserRouter>
        <GrowingPage />
      </BrowserRouter>
    );

    // Advance timers to trigger the navigation timeout
    act(() => {
      jest.advanceTimersByTime(200);
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/harvests/test-farm-123', { replace: true });
    });
  });

  it('navigates to harvest when farm status changes to running', async () => {
    // Farm store mock is already configured globally
    
    // Update farm status to running
    mockUseFarmStore.mockReturnValue({
      farms: [
        {
          id: 'test-farm-123',
          name: 'Test Farm',
          status: 'running',
          createdAt: new Date(Date.now() - 10000).toISOString(),
          type: 'standard',
          description: 'Test farm for unit tests'
        }
      ]
    });

    renderGrowingPage();

    act(() => {
      jest.advanceTimersByTime(200);
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/harvests/test-farm-123', { replace: true });
    });
  });

  it('navigates to harvest after 60 second timeout', async () => {
    // Mock a very old farm (70 seconds)
    // Farm store mock is already configured globally
    mockUseFarmStore.mockReturnValue({
      farms: [
        {
          id: 'test-farm-123',
          name: 'Test Farm',
          status: 'preparing',
          createdAt: new Date(Date.now() - 70000).toISOString(), // 70 seconds ago
          type: 'standard',
          description: 'Test farm for unit tests'
        }
      ]
    });

    renderGrowingPage();

    act(() => {
      jest.advanceTimersByTime(200);
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/harvests/test-farm-123', { replace: true });
    });
  });

  it('handles WebSocket events for navigation', async () => {
    let tmuxReadyHandler: Function;
    let terminalSessionHandler: Function;
    let firstOutputHandler: Function;

    const mockSubscribe = jest.fn((event, handler) => {
      if (event === 'farm:tmux:ready') {
        tmuxReadyHandler = handler;
      } else if (event === 'terminal:session') {
        terminalSessionHandler = handler;
      } else if (event === 'terminal:output') {
        firstOutputHandler = handler;
      }
      return () => {}; // unsubscribe function
    });

    // Mock subscribe behavior is already set up globally

    renderGrowingPage();

    // Simulate tmux ready event
    act(() => {
      tmuxReadyHandler!({ farmId: 'test-farm-123' });
      jest.advanceTimersByTime(2100); // Wait for the 2s delay
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/harvests/test-farm-123', { replace: true });
    });

    // Reset navigation mock
    mockNavigate.mockClear();

    // Simulate terminal session created event
    act(() => {
      terminalSessionHandler!({ action: 'created', farmId: 'test-farm-123' });
      jest.advanceTimersByTime(1600); // Wait for the 1.5s delay
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/harvests/test-farm-123', { replace: true });
    });

    // Reset navigation mock
    mockNavigate.mockClear();

    // Simulate first output event
    act(() => {
      firstOutputHandler!({ farmId: 'test-farm-123' });
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/harvests/test-farm-123', { replace: true });
    });
  });

  it('does not navigate multiple times', async () => {
    // Farm store mock is already configured globally
    mockUseFarmStore.mockReturnValue({
      farms: [
        {
          id: 'test-farm-123',
          name: 'Test Farm',
          status: 'launching',
          createdAt: new Date(Date.now() - 5000).toISOString(),
          type: 'standard',
          description: 'Test farm for unit tests'
        }
      ]
    });

    renderGrowingPage();

    act(() => {
      jest.advanceTimersByTime(200);
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledTimes(1);
    });

    // Try to trigger navigation again
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Should still be called only once
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('handles skip to harvest button click', async () => {
    renderGrowingPage();
    
    const skipButton = await screen.findByText('Skip to harvest view →');
    
    act(() => {
      skipButton.click();
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/harvests/test-farm-123', { replace: true });
    });
  });

  it('displays progress indicators with animations', async () => {
    renderGrowingPage();
    
    await waitFor(() => {
      expect(screen.getByText('Planting')).toBeInTheDocument();
      expect(screen.getByText('Watering')).toBeInTheDocument();
      expect(screen.getByText('Growing')).toBeInTheDocument();
    });
  });

  it('handles missing farm gracefully', async () => {
    // Mock empty farms array
    // Farm store mock is already configured globally
    mockUseFarmStore.mockReturnValue({ farms: [] });

    renderGrowingPage();
    
    // Should still render but not crash
    await waitFor(() => {
      expect(screen.getByText(/Growing your farm/)).toBeInTheDocument();
    });
  });

  it('rotates messages at correct intervals', async () => {
    renderGrowingPage();
    
    // Initial message should be visible
    await waitFor(() => {
      expect(screen.getByText(/Preparing AI agents/)).toBeInTheDocument();
    });

    // Advance time by 3 seconds (message rotation interval)
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    // Message should have rotated
    await waitFor(() => {
      // Should show a different message from the same phase
      const messageElements = screen.getAllByText(/initializing|Setting up|Loading|Configuring/);
      expect(messageElements.length).toBeGreaterThan(0);
    });
  });
});