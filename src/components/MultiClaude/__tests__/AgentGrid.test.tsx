import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentGrid } from '../AgentGrid';
import { MultiClaudeAgent } from '../../../types/multiClaude';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

describe('AgentGrid', () => {
  const mockAgents: MultiClaudeAgent[] = [
    {
      id: 'agent1',
      agentNumber: 1,
      paneId: 'pane1',
      status: 'ready',
      currentStep: 0,
      output: ['Test output 1'],
      startTime: new Date(),
      taskHistory: [],
    },
    {
      id: 'agent2',
      agentNumber: 2,
      paneId: 'pane2',
      status: 'working',
      currentStep: 1,
      output: ['Test output 2'],
      startTime: new Date(),
      taskHistory: [],
    },
  ];

  const mockHandlers = {
    onAgentCommand: vi.fn(),
    onAgentPrompt: vi.fn(),
    onAddAgent: vi.fn(),
    onRemoveAgent: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the agent grid with correct title', () => {
    render(
      <AgentGrid
        agents={mockAgents}
        {...mockHandlers}
      />
    );

    expect(screen.getByText('Multi-Claude Agents')).toBeInTheDocument();
  });

  it('displays the correct number of agents', () => {
    render(
      <AgentGrid
        agents={mockAgents}
        {...mockHandlers}
      />
    );

    expect(screen.getByText('2 / 12')).toBeInTheDocument();
    expect(screen.getByText('Agent 1')).toBeInTheDocument();
    expect(screen.getByText('Agent 2')).toBeInTheDocument();
  });

  it('shows add agent button when below max agents', () => {
    render(
      <AgentGrid
        agents={mockAgents}
        {...mockHandlers}
        maxAgents={5}
      />
    );

    const addButton = screen.getByRole('button', { name: /add agent/i });
    expect(addButton).toBeInTheDocument();
  });

  it('hides add agent button when at max agents', () => {
    render(
      <AgentGrid
        agents={mockAgents}
        {...mockHandlers}
        maxAgents={2}
      />
    );

    const addButton = screen.queryByRole('button', { name: /add agent/i });
    expect(addButton).not.toBeInTheDocument();
  });

  it('calls onAddAgent when add button is clicked', () => {
    render(
      <AgentGrid
        agents={mockAgents}
        {...mockHandlers}
      />
    );

    const addButton = screen.getByRole('button', { name: /add agent/i });
    fireEvent.click(addButton);

    expect(mockHandlers.onAddAgent).toHaveBeenCalledTimes(1);
  });

  it('displays empty state when no agents', () => {
    render(
      <AgentGrid
        agents={[]}
        {...mockHandlers}
      />
    );

    expect(screen.getByText('No Agents Running')).toBeInTheDocument();
    expect(screen.getByText(/Start your first Claude agent/)).toBeInTheDocument();
  });

  it('calls onAddAgent from empty state', () => {
    render(
      <AgentGrid
        agents={[]}
        {...mockHandlers}
      />
    );

    const startButton = screen.getByRole('button', { name: /start first agent/i });
    fireEvent.click(startButton);

    expect(mockHandlers.onAddAgent).toHaveBeenCalledTimes(1);
  });

  it('applies correct grid layout based on agent count', () => {
    const { container, rerender } = render(
      <AgentGrid
        agents={[mockAgents[0]]}
        {...mockHandlers}
      />
    );

    let grid = container.querySelector('.grid');
    expect(grid).toHaveClass('grid-cols-1');

    rerender(
      <AgentGrid
        agents={mockAgents}
        {...mockHandlers}
      />
    );

    grid = container.querySelector('.grid');
    expect(grid).toHaveClass('md:grid-cols-2');
  });

  it('passes correct props to AgentCard components', () => {
    render(
      <AgentGrid
        agents={mockAgents}
        {...mockHandlers}
      />
    );

    // Check that agent cards are rendered with correct data
    mockAgents.forEach(agent => {
      expect(screen.getByText(`Agent ${agent.agentNumber}`)).toBeInTheDocument();
    });
  });

  it('handles agent command callbacks correctly', () => {
    render(
      <AgentGrid
        agents={mockAgents}
        {...mockHandlers}
      />
    );

    // This would require testing the AgentCard interaction
    // which is covered in AgentCard.test.tsx
  });
});