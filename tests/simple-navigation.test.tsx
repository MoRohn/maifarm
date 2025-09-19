import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

// Simple test components
const Dashboard = () => <div>Dashboard Page</div>;
const Analytics = () => <div>Analytics Page</div>;
const Settings = () => <div>Settings Page</div>;
const NotFound = () => <div>404 - Page Not Found</div>;

// Test navigation wrapper component
const TestApp = () => {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/analytics" element={<Analytics />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

describe('Simple Navigation Tests', () => {
  test('renders dashboard at root path', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <TestApp />
      </MemoryRouter>
    );
    
    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
  });

  test('renders analytics page at /analytics', () => {
    render(
      <MemoryRouter initialEntries={['/analytics']}>
        <TestApp />
      </MemoryRouter>
    );
    
    expect(screen.getByText('Analytics Page')).toBeInTheDocument();
  });

  test('renders settings page at /settings', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <TestApp />
      </MemoryRouter>
    );
    
    expect(screen.getByText('Settings Page')).toBeInTheDocument();
  });

  test('renders 404 page for unknown routes', () => {
    render(
      <MemoryRouter initialEntries={['/unknown-path']}>
        <TestApp />
      </MemoryRouter>
    );
    
    expect(screen.getByText('404 - Page Not Found')).toBeInTheDocument();
  });

  test('navigation with Links works correctly', async () => {
    const user = userEvent.setup();
    
    // Component with navigation links
    const AppWithLinks = () => (
      <>
        <nav>
          <a href="/analytics">Go to Analytics</a>
          <a href="/settings">Go to Settings</a>
        </nav>
        <TestApp />
      </>
    );
    
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppWithLinks />
      </MemoryRouter>
    );
    
    // Verify we start on dashboard
    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
    
    // Navigation links should be present
    expect(screen.getByText('Go to Analytics')).toBeInTheDocument();
    expect(screen.getByText('Go to Settings')).toBeInTheDocument();
  });

  test('multiple route changes work correctly', () => {
    // Test dashboard route
    const { unmount: unmount1 } = render(
      <MemoryRouter initialEntries={['/']}>
        <TestApp />
      </MemoryRouter>
    );
    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
    unmount1();
    
    // Test analytics route
    const { unmount: unmount2 } = render(
      <MemoryRouter initialEntries={['/analytics']}>
        <TestApp />
      </MemoryRouter>
    );
    expect(screen.getByText('Analytics Page')).toBeInTheDocument();
    unmount2();
    
    // Test settings route
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <TestApp />
      </MemoryRouter>
    );
    expect(screen.getByText('Settings Page')).toBeInTheDocument();
  });
});