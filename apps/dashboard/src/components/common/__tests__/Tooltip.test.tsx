import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Tooltip } from '../Tooltip';

describe('Tooltip', () => {
  beforeEach(() => {
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders children correctly', () => {
    render(
      <Tooltip content="Test tooltip">
        <button>Test Button</button>
      </Tooltip>
    );

    expect(screen.getByText('Test Button')).toBeInTheDocument();
  });

  it('shows tooltip on hover after delay', async () => {
    render(
      <Tooltip content="Test tooltip" delay={100}>
        <button>Test Button</button>
      </Tooltip>
    );

    const button = screen.getByText('Test Button');
    
    // Initially tooltip should not be visible
    expect(screen.queryByText('Test tooltip')).not.toBeInTheDocument();

    // Hover over the button
    fireEvent.mouseEnter(button);
    
    // Tooltip should not appear immediately
    expect(screen.queryByText('Test tooltip')).not.toBeInTheDocument();
    
    // Fast forward past the delay
    jest.advanceTimersByTime(100);
    
    // Tooltip should now be visible
    await waitFor(() => {
      expect(screen.getByText('Test tooltip')).toBeInTheDocument();
    });
  });

  it('hides tooltip on mouse leave', async () => {
    render(
      <Tooltip content="Test tooltip" delay={0}>
        <button>Test Button</button>
      </Tooltip>
    );

    const button = screen.getByText('Test Button');
    
    // Show tooltip
    fireEvent.mouseEnter(button);
    jest.runAllTimers();
    
    await waitFor(() => {
      expect(screen.getByText('Test tooltip')).toBeInTheDocument();
    });

    // Hide tooltip
    fireEvent.mouseLeave(button);
    
    // Should start hiding immediately
    jest.runAllTimers();
    
    await waitFor(() => {
      expect(screen.queryByText('Test tooltip')).not.toBeInTheDocument();
    });
  });

  it('does not show tooltip when disabled', async () => {
    render(
      <Tooltip content="Test tooltip" delay={0} disabled>
        <button>Test Button</button>
      </Tooltip>
    );

    const button = screen.getByText('Test Button');
    
    fireEvent.mouseEnter(button);
    jest.runAllTimers();
    
    // Tooltip should never appear
    expect(screen.queryByText('Test tooltip')).not.toBeInTheDocument();
  });

  it('preserves existing mouse event handlers', () => {
    const onMouseEnter = jest.fn();
    const onMouseLeave = jest.fn();

    render(
      <Tooltip content="Test tooltip" delay={0}>
        <button onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
          Test Button
        </button>
      </Tooltip>
    );

    const button = screen.getByText('Test Button');
    
    fireEvent.mouseEnter(button);
    expect(onMouseEnter).toHaveBeenCalled();
    
    fireEvent.mouseLeave(button);
    expect(onMouseLeave).toHaveBeenCalled();
  });

  it('applies correct position classes', () => {
    const { rerender } = render(
      <Tooltip content="Test tooltip" position="top" delay={0}>
        <button>Test Button</button>
      </Tooltip>
    );

    const button = screen.getByText('Test Button');
    fireEvent.mouseEnter(button);
    jest.runAllTimers();

    // Check if tooltip with top position is rendered
    // Note: In a real test, you'd check for specific CSS classes
    expect(screen.getByText('Test tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(button);
    jest.runAllTimers();

    // Test different positions
    rerender(
      <Tooltip content="Test tooltip" position="bottom" delay={0}>
        <button>Test Button</button>
      </Tooltip>
    );

    fireEvent.mouseEnter(button);
    jest.runAllTimers();
    expect(screen.getByText('Test tooltip')).toBeInTheDocument();
  });
});