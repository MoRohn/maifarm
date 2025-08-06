import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from '../../src/components/Dashboard/Dashboard';
import FarmCreator from '../../src/components/Farm/FarmCreator';
import HarvestPage from '../../src/components/Harvest/HarvestPage';
import AnalyticsPage from '../../src/components/Analytics/AnalyticsPage';
import Header from '../../src/components/layouts/Header';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Mock providers and stores
jest.mock('../../src/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    connected: true,
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    sendMessage: jest.fn()
  })
}));

jest.mock('../../src/store/farmStore', () => ({
  useFarmStore: () => ({
    farms: [],
    loading: false,
    error: null,
    fetchFarms: jest.fn(),
    createFarm: jest.fn()
  })
}));

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('Accessibility Tests', () => {
  test('Dashboard should have no accessibility violations', async () => {
    const { container } = renderWithRouter(<Dashboard />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('Farm Creator should have no accessibility violations', async () => {
    const { container } = renderWithRouter(<FarmCreator />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('Harvest Page should have no accessibility violations', async () => {
    const { container } = renderWithRouter(<HarvestPage />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('Analytics Page should have no accessibility violations', async () => {
    const { container } = renderWithRouter(<AnalyticsPage />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('Header should have no accessibility violations', async () => {
    const { container } = renderWithRouter(<Header />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('Forms should have proper labels and ARIA attributes', async () => {
    const { container, getByLabelText, getByRole } = renderWithRouter(<FarmCreator />);
    
    // Check for proper form labels
    expect(getByLabelText(/farm name/i)).toBeInTheDocument();
    expect(getByLabelText(/description/i)).toBeInTheDocument();
    
    // Check for proper ARIA roles
    expect(getByRole('form')).toBeInTheDocument();
    expect(getByRole('button', { name: /create/i })).toBeInTheDocument();
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('Navigation should be keyboard accessible', async () => {
    const { container } = renderWithRouter(<Header />);
    
    // Check for proper navigation structure
    const nav = container.querySelector('nav');
    expect(nav).toBeInTheDocument();
    
    // Check for proper focus management
    const links = container.querySelectorAll('a, button');
    links.forEach(link => {
      expect(link).toHaveAttribute('tabindex');
    });
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('Color contrast should meet WCAG standards', async () => {
    const { container } = renderWithRouter(<Dashboard />);
    
    // Test with axe-core which includes color contrast checking
    const results = await axe(container, {
      rules: {
        'color-contrast': { enabled: true }
      }
    });
    
    expect(results).toHaveNoViolations();
  });

  test('Images should have alt text', async () => {
    const { container } = renderWithRouter(<Dashboard />);
    
    const images = container.querySelectorAll('img');
    images.forEach(img => {
      expect(img).toHaveAttribute('alt');
    });
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('Interactive elements should have proper ARIA labels', async () => {
    const { container } = renderWithRouter(<FarmCreator />);
    
    const buttons = container.querySelectorAll('button');
    buttons.forEach(button => {
      // Either has aria-label or accessible text content
      expect(
        button.hasAttribute('aria-label') || 
        button.textContent?.trim() !== '' ||
        button.querySelector('[aria-label]')
      ).toBeTruthy();
    });
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('Focus management should work correctly', async () => {
    const { container } = renderWithRouter(<Dashboard />);
    
    // Check that focusable elements are in logical tab order
    const focusableElements = container.querySelectorAll(
      'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
    );
    
    expect(focusableElements.length).toBeGreaterThan(0);
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});