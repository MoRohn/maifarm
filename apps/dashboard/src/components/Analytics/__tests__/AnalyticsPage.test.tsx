import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router-dom';
import { AnalyticsPage } from '../AnalyticsPage';
import { useFarmStore } from '@/store/farmStore';
import { useAnalyticsStore } from '@/store/analyticsStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { analyticsService } from '@/services/analyticsService';

// Mock stores and hooks
jest.mock('../../../store/farmStore');
jest.mock('../../../store/analyticsStore');
jest.mock('../../../store/userStore', () => ({
  useUserStore: () => ({
    user: {
      id: '1',
      name: 'Test User',
      role: 'admin',
      preferences: { notifications: true }
    }
  })
}));
jest.mock('../../../store/themeStore', () => ({
  useThemeStore: () => ({
    theme: 'light'
  })
}));
jest.mock('../../../hooks/useWebSocket');
jest.mock('../../../services/analyticsService');

// Mock chart components
jest.mock('../Charts/RealTimeChart', () => ({
  RealTimeChart: () => <div data-testid="realtime-chart">RealTimeChart</div>
}));
jest.mock('../Charts/CPUGPUChart', () => ({
  CPUGPUChart: () => <div data-testid="cpu-gpu-chart">CPUGPUChart</div>
}));
jest.mock('../Charts/HarvestChart', () => ({
  HarvestChart: () => <div data-testid="harvest-chart">HarvestChart</div>
}));
jest.mock('../Charts/CostBreakdown', () => ({
  CostBreakdown: () => <div data-testid="cost-breakdown">CostBreakdown</div>
}));
jest.mock('../Charts/AgentEfficiencyChart', () => ({
  AgentEfficiencyChart: () => <div data-testid="agent-efficiency-chart">AgentEfficiencyChart</div>
}));

const mockFarms = [
  {
    id: '1',
    name: 'Test Farm 1',
    status: 'active',
    agents: [
      { id: 'a1', name: 'Agent 1', status: 'active' },
      { id: 'a2', name: 'Agent 2', status: 'idle' }
    ]
  },
  {
    id: '2',
    name: 'Test Farm 2',
    status: 'active',
    agents: [
      { id: 'a3', name: 'Agent 3', status: 'active' }
    ]
  }
];

const mockTaskCompletions = [
  { id: '1', status: 'completed' },
  { id: '2', status: 'completed' },
  { id: '3', status: 'failed' },
  { id: '4', status: 'pending' }
];

describe('AnalyticsPage', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock store implementations
    (useFarmStore as any).mockReturnValue({
      farms: mockFarms,
      activeFarms: mockFarms
    });

    (useAnalyticsStore as any).mockReturnValue({
      metrics: {},
      timeSeriesData: [],
      agentPerformance: [],
      taskCompletions: mockTaskCompletions,
      setMetrics: jest.fn(),
      updateTimeSeriesData: jest.fn(),
      setLoading: jest.fn()
    });

    (useWebSocket as any).mockReturnValue({
      connected: true,
      lastMessage: null
    });

    (analyticsService as any).calculateAggregatedMetrics = jest.fn().mockResolvedValue({});
    (analyticsService as any).generateMockTimeSeriesData = jest.fn().mockReturnValue([]);
    (analyticsService as any).exportToCSV = jest.fn();
    (analyticsService as any).refreshMetrics = jest.fn().mockResolvedValue({});
  });

  const renderWithRouter = (component: React.ReactElement) => {
    return render(
      <BrowserRouter>
        {component}
      </BrowserRouter>
    );
  };

  it('renders the analytics page with header', () => {
    renderWithRouter(<AnalyticsPage />);
    
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(screen.getByText('Real-time Analytics')).toBeInTheDocument();
  });

  it('displays connection status', () => {
    renderWithRouter(<AnalyticsPage />);
    
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('calculates and displays real-time metrics correctly', () => {
    renderWithRouter(<AnalyticsPage />);
    
    // Check for metrics cards
    expect(screen.getByText('Active Farms')).toBeInTheDocument();
    expect(screen.getByText('Active Agents')).toBeInTheDocument();
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
    expect(screen.getByText('Daily Cost')).toBeInTheDocument();
  });

  it('renders all chart components', () => {
    renderWithRouter(<AnalyticsPage />);
    
    expect(screen.getByTestId('realtime-chart')).toBeInTheDocument();
    expect(screen.getByTestId('cpu-gpu-chart')).toBeInTheDocument();
    expect(screen.getByTestId('harvest-chart')).toBeInTheDocument();
    expect(screen.getByTestId('cost-breakdown')).toBeInTheDocument();
    expect(screen.getByTestId('agent-efficiency-chart')).toBeInTheDocument();
    expect(screen.getByTestId('task-completion-chart')).toBeInTheDocument();
  });

  it('handles time range selection', async () => {
    renderWithRouter(<AnalyticsPage />);
    
    const timeRangeSelect = screen.getByRole('combobox');
    fireEvent.change(timeRangeSelect, { target: { value: '7d' } });
    
    await waitFor(() => {
      expect((timeRangeSelect as HTMLSelectElement).value).toBe('7d');
    });
  });

  it('handles export functionality', async () => {
    const mockAgentPerformance = [
      { agentId: '1', name: 'Agent 1', efficiency: 95 }
    ];
    
    (useAnalyticsStore as any).mockReturnValue({
      metrics: {},
      timeSeriesData: [],
      agentPerformance: mockAgentPerformance,
      taskCompletions: mockTaskCompletions,
      setMetrics: jest.fn(),
      updateTimeSeriesData: jest.fn(),
      setLoading: jest.fn()
    });

    renderWithRouter(<AnalyticsPage />);
    
    const exportButton = screen.getByRole('button', { name: /export/i });
    fireEvent.click(exportButton);
    
    await waitFor(() => {
      expect(analyticsService.exportToCSV).toHaveBeenCalledWith(
        mockAgentPerformance,
        'maifarm_analytics_report'
      );
    });
  });

  it('handles refresh functionality', async () => {
    renderWithRouter(<AnalyticsPage />);
    
    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshButton);
    
    await waitFor(() => {
      expect(analyticsService.refreshMetrics).toHaveBeenCalled();
    });
  });

  it('updates when WebSocket message is received', async () => {
    const { rerender } = renderWithRouter(<AnalyticsPage />);
    
    // Simulate WebSocket message
    (useWebSocket as any).mockReturnValue({
      connected: true,
      lastMessage: { type: 'metrics:update', data: {} }
    });
    
    rerender(
      <BrowserRouter>
        <AnalyticsPage />
      </BrowserRouter>
    );
    
    // Last update should change
    expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
  });

  it('shows loading state correctly', () => {
    renderWithRouter(<AnalyticsPage />);
    
    // Check that loading indicators work
    const statsCards = screen.getAllByText('—');
    expect(statsCards.length).toBeGreaterThan(0);
  });

  it('handles disconnected state', () => {
    (useWebSocket as any).mockReturnValue({
      connected: false,
      lastMessage: null
    });
    
    renderWithRouter(<AnalyticsPage />);
    
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('calculates success rate correctly', () => {
    renderWithRouter(<AnalyticsPage />);
    
    // With mock data: 2 completed out of 4 total = 50%
    const successRate = (2 / 4) * 100;
    expect(screen.getByText(`${successRate.toFixed(1)}%`)).toBeInTheDocument();
  });

  it('responsive design classes are applied', () => {
    const { container } = renderWithRouter(<AnalyticsPage />);
    
    // Check for responsive grid classes
    const grids = container.querySelectorAll('[class*="grid-cols"]');
    expect(grids.length).toBeGreaterThan(0);
    
    // Check for responsive breakpoints
    const responsiveElements = container.querySelectorAll('[class*="md:"], [class*="lg:"]');
    expect(responsiveElements.length).toBeGreaterThan(0);
  });
});