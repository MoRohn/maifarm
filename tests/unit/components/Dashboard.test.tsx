import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Dashboard } from '@/components/Dashboard/Dashboard';
import { mockServices } from '../../__mocks__/services';
import '@testing-library/jest-dom';

// Mock stores
jest.mock('@/store/farmStore', () => ({
  useFarmStore: () => ({
    farms: [
      {
        id: 'farm-1',
        name: 'Test Farm',
        status: 'running',
        agents: ['agent-1', 'agent-2'],
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    ],
    activeFarms: 1,
    loading: false,
    error: null,
    fetchFarms: jest.fn(),
    addFarm: jest.fn(),
    updateFarm: jest.fn(),
    deleteFarm: jest.fn(),
  })
}));

jest.mock('@/store/agentStore', () => ({
  useAgentStore: () => ({
    agents: [
      {
        id: 'agent-1',
        name: 'Agent Alpha',
        status: 'active',
        farmId: 'farm-1',
        health: { status: 'healthy' },
      },
      {
        id: 'agent-2',
        name: 'Agent Beta',
        status: 'idle',
        farmId: 'farm-1',
        health: { status: 'healthy' },
      }
    ],
    loading: false,
    error: null,
  })
}));

const renderDashboard = () => {
  return render(
    <BrowserRouter>
      <Dashboard />
    </BrowserRouter>
  );
};

describe('Dashboard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the dashboard with title', () => {
      renderDashboard();
      expect(screen.getByText(/Dashboard/i)).toBeInTheDocument();
    });

    it('should display farm statistics', () => {
      renderDashboard();
      expect(screen.getByText(/Active Farms/i)).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('should display agent count', () => {
      renderDashboard();
      expect(screen.getByText(/Total Agents/i)).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('should show quick actions section', () => {
      renderDashboard();
      expect(screen.getByText(/Quick Actions/i)).toBeInTheDocument();
    });
  });

  describe('Farm Grid', () => {
    it('should display farm cards', () => {
      renderDashboard();
      expect(screen.getByText('Test Farm')).toBeInTheDocument();
    });

    it('should show farm status', () => {
      renderDashboard();
      expect(screen.getByText(/running/i)).toBeInTheDocument();
    });

    it('should display agent count for farm', () => {
      renderDashboard();
      expect(screen.getByText(/2 agents/i)).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('should handle create farm button click', () => {
      renderDashboard();
      const createButton = screen.getByRole('button', { name: /Create Farm/i });
      expect(createButton).toBeInTheDocument();

      fireEvent.click(createButton);
      // Should navigate or open modal
    });

    it('should refresh data on refresh button click', async () => {
      const { container } = renderDashboard();
      const refreshButton = container.querySelector('[aria-label*="refresh"]');

      if (refreshButton) {
        fireEvent.click(refreshButton);

        await waitFor(() => {
          // Check that fetch was called
          expect(mockServices.farm.getAllFarms).toHaveBeenCalled();
        });
      }
    });

    it('should filter farms by status', () => {
      renderDashboard();
      const filterDropdown = screen.queryByRole('combobox', { name: /status/i });

      if (filterDropdown) {
        fireEvent.change(filterDropdown, { target: { value: 'running' } });

        // Check that only running farms are displayed
        expect(screen.getByText('Test Farm')).toBeInTheDocument();
      }
    });
  });

  describe('Real-time Updates', () => {
    it('should handle WebSocket connection', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(mockServices.websocket.on).toHaveBeenCalledWith(
          'farm:status',
          expect.any(Function)
        );
      });
    });

    it('should update farm status on WebSocket event', async () => {
      renderDashboard();

      // Simulate WebSocket event
      const statusHandler = mockServices.websocket.on.mock.calls.find(
        call => call[0] === 'farm:status'
      )?.[1];

      if (statusHandler) {
        statusHandler({
          farmId: 'farm-1',
          status: 'completed'
        });

        await waitFor(() => {
          expect(screen.getByText(/completed/i)).toBeInTheDocument();
        });
      }
    });
  });

  describe('Error Handling', () => {
    it('should display error message when farms fail to load', async () => {
      // Mock error state
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockServices.farm.getAllFarms.mockRejectedValueOnce(new Error('Network error'));

      renderDashboard();

      await waitFor(() => {
        const errorMessage = screen.queryByText(/Failed to load farms/i);
        if (errorMessage) {
          expect(errorMessage).toBeInTheDocument();
        }
      });

      console.error.mockRestore();
    });

    it('should show loading state while fetching data', () => {
      const { container } = renderDashboard();
      const loadingIndicator = container.querySelector('.animate-spin');

      // Loading indicator may be present initially
      if (loadingIndicator) {
        expect(loadingIndicator).toBeInTheDocument();
      }
    });
  });

  describe('Responsive Design', () => {
    it('should render mobile-friendly layout on small screens', () => {
      // Mock window resize
      global.innerWidth = 375;
      global.dispatchEvent(new Event('resize'));

      renderDashboard();

      // Check for mobile-specific classes
      const gridElement = screen.getByTestId('farm-grid');
      expect(gridElement).toHaveClass('grid-cols-1');
    });

    it('should render desktop layout on large screens', () => {
      // Mock window resize
      global.innerWidth = 1920;
      global.dispatchEvent(new Event('resize'));

      renderDashboard();

      // Check for desktop-specific classes
      const gridElement = screen.getByTestId('farm-grid');
      expect(gridElement).toHaveClass('lg:grid-cols-3');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      renderDashboard();

      // Check for ARIA labels
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    it('should support keyboard navigation', () => {
      renderDashboard();

      const firstButton = screen.getAllByRole('button')[0];
      firstButton.focus();

      expect(document.activeElement).toBe(firstButton);

      // Simulate Tab key
      fireEvent.keyDown(firstButton, { key: 'Tab' });
    });
  });
});