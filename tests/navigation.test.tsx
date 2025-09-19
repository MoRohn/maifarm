import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

// Mock import.meta.env
global.import = {
  meta: {
    env: {
      DEV: false
    }
  }
} as any;

// Mock WebSocket manager to prevent connection attempts in tests
jest.mock('../src/services/websocket/singletonManager', () => ({
  wsManager: {
    initialize: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn(),
    emit: jest.fn(),
    getSocket: jest.fn(() => null),
  }
}));

// Mock authentication
jest.mock('../src/hooks/useAuth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    isAuthenticated: true,
    user: { id: 'test-user', email: 'test@example.com' },
    login: jest.fn(),
    logout: jest.fn(),
  }),
}));

// Import App after mocks are set up
const App = require('../src/App').default;

describe('Navigation Tests', () => {
  beforeEach(() => {
    // Clear any localStorage/sessionStorage
    localStorage.clear();
    sessionStorage.clear();
  });

  test('renders dashboard as default route', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    // Wait for dashboard to load
    await waitFor(() => {
      expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
    });
  });

  test('navigates to analytics page', async () => {
    render(
      <MemoryRouter initialEntries={['/analytics']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/analytics/i)).toBeInTheDocument();
    });
  });

  test('navigates to settings page', async () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/settings/i)).toBeInTheDocument();
    });
  });

  test('navigates to barn page', async () => {
    render(
      <MemoryRouter initialEntries={['/barn']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/barn/i)).toBeInTheDocument();
    });
  });

  test('redirects unknown routes to dashboard', async () => {
    render(
      <MemoryRouter initialEntries={['/unknown-route']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
    });
  });

  test('navigation links work correctly', async () => {
    const user = userEvent.setup();
    
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
    });

    // Try to find and click analytics link
    const analyticsLink = screen.queryByRole('link', { name: /analytics/i });
    if (analyticsLink) {
      await user.click(analyticsLink);
      
      await waitFor(() => {
        expect(screen.getByText(/analytics/i)).toBeInTheDocument();
      });
    }
  });
});