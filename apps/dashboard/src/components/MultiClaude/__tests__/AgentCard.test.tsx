import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { AgentCard } from '../AgentCard';
import { MultiClaudeAgent } from '@/types/multiClaude';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
}));

// Mock AgentTerminalOutput component
jest.mock('../AgentTerminalOutput', () => ({
  AgentTerminalOutput: ({ output }: any) => (
    <div data-testid="terminal-output">
      {output.map((line: string, i: number) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  ),
}));

describe('AgentCard', () => {
  const mockAgent: MultiClaudeAgent = {
    id: 'test-agent',
    agentNumber: 1,
    paneId: 'test-pane',
    status: 'ready',
    currentStep: 0,
    output: ['Line 1', 'Line 2'],
    lastActivity: 'Test activity',
    startTime: new Date(),
    taskHistory: [],
  };

  const mockHandlers = {
    onCommand: jest.fn(),
    onPrompt: jest.fn(),
    onRemove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders agent information correctly', () => {
    render(
      <AgentCard
        agent={mockAgent}
        {...mockHandlers}
      />
    );

    expect(screen.getByText('Agent 1')).toBeInTheDocument();
    expect(screen.getByText('test-pane')).toBeInTheDocument();
    expect(screen.getByText(/ready/i)).toBeInTheDocument();
    expect(screen.getByText('Test activity')).toBeInTheDocument();
  });

  it('displays correct status icon and color', () => {
    const { container, rerender } = render(
      <AgentCard
        agent={{ ...mockAgent, status: 'ready' }}
        {...mockHandlers}
      />
    );

    expect(container.querySelector('.text-green-500')).toBeInTheDocument();
    expect(container.querySelector('.border-green-400')).toBeInTheDocument();

    rerender(
      <AgentCard
        agent={{ ...mockAgent, status: 'working' }}
        {...mockHandlers}
      />
    );

    expect(container.querySelector('.text-blue-500')).toBeInTheDocument();
    expect(container.querySelector('.border-blue-400')).toBeInTheDocument();

    rerender(
      <AgentCard
        agent={{ ...mockAgent, status: 'error' }}
        {...mockHandlers}
      />
    );

    expect(container.querySelector('.text-red-500')).toBeInTheDocument();
    expect(container.querySelector('.border-red-400')).toBeInTheDocument();
  });

  it('calls onRemove when X button is clicked', () => {
    render(
      <AgentCard
        agent={mockAgent}
        {...mockHandlers}
      />
    );

    const removeButton = screen.getByTitle('Remove Agent');
    fireEvent.click(removeButton);

    expect(mockHandlers.onRemove).toHaveBeenCalledTimes(1);
  });

  it('calls onCommand with start when start button is clicked', () => {
    render(
      <AgentCard
        agent={{ ...mockAgent, status: 'ready' }}
        {...mockHandlers}
      />
    );

    const startButton = screen.getByTitle('Start Agent');
    fireEvent.click(startButton);
    expect(mockHandlers.onCommand).toHaveBeenCalledWith('start');
  });

  it('calls onCommand with pause when pause button is clicked', () => {
    render(
      <AgentCard
        agent={{ ...mockAgent, status: 'working' }}
        {...mockHandlers}
      />
    );

    const pauseButton = screen.getByTitle('Pause Agent');
    fireEvent.click(pauseButton);
    expect(mockHandlers.onCommand).toHaveBeenCalledWith('pause');
  });

  it('calls onCommand with reset when reset button is clicked', () => {
    render(
      <AgentCard
        agent={mockAgent}
        {...mockHandlers}
      />
    );

    const resetButton = screen.getByTitle('Reset Agent');
    fireEvent.click(resetButton);
    expect(mockHandlers.onCommand).toHaveBeenCalledWith('reset');
  });

  it('disables start button when agent is working', () => {
    render(
      <AgentCard
        agent={{ ...mockAgent, status: 'working' }}
        {...mockHandlers}
      />
    );

    const startButton = screen.getByTitle('Start Agent');
    expect(startButton).toBeDisabled();
  });

  it('disables pause button when agent is not working', () => {
    render(
      <AgentCard
        agent={{ ...mockAgent, status: 'ready' }}
        {...mockHandlers}
      />
    );

    const pauseButton = screen.getByTitle('Pause Agent');
    expect(pauseButton).toBeDisabled();
  });

  it('handles prompt input and submission', async () => {
    const user = userEvent.setup();

    render(
      <AgentCard
        agent={mockAgent}
        {...mockHandlers}
      />
    );

    const promptInput = screen.getByPlaceholderText('Enter prompt for this agent...');

    // FIX: Wrap state-updating interactions in act() to prevent React warnings
    await act(async () => {
      await user.type(promptInput, 'Test prompt');
    });

    const sendButton = screen.getByTitle('Send Prompt');

    await act(async () => {
      await user.click(sendButton);
    });

    // Wait for state updates to settle before asserting
    await waitFor(() => {
      expect(mockHandlers.onPrompt).toHaveBeenCalledWith('Test prompt');
    });
  });

  it('clears prompt input after submission', async () => {
    const user = userEvent.setup();

    render(
      <AgentCard
        agent={mockAgent}
        {...mockHandlers}
      />
    );

    const promptInput = screen.getByPlaceholderText('Enter prompt for this agent...') as HTMLTextAreaElement;

    // FIX: Wrap state-updating interactions in act() to prevent React warnings
    await act(async () => {
      await user.type(promptInput, 'Test prompt');
    });

    const sendButton = screen.getByTitle('Send Prompt');

    await act(async () => {
      await user.click(sendButton);
    });

    // Wait for state updates to settle before asserting
    await waitFor(() => {
      expect(promptInput.value).toBe('');
    });
  });

  it('handles Enter key for prompt submission', async () => {
    const user = userEvent.setup();

    render(
      <AgentCard
        agent={mockAgent}
        {...mockHandlers}
      />
    );

    const promptInput = screen.getByPlaceholderText('Enter prompt for this agent...');

    // FIX: Wrap state-updating interactions in act() to prevent React warnings
    await act(async () => {
      await user.type(promptInput, 'Test prompt{Enter}');
    });

    // Wait for all state updates to settle before asserting
    await waitFor(() => {
      expect(mockHandlers.onPrompt).toHaveBeenCalledWith('Test prompt');
    });
  });

  it('does not submit on Shift+Enter', async () => {
    const user = userEvent.setup();

    render(
      <AgentCard
        agent={mockAgent}
        {...mockHandlers}
      />
    );

    const promptInput = screen.getByPlaceholderText('Enter prompt for this agent...');

    // FIX: Wrap state-updating interactions in act() to prevent React warnings
    await act(async () => {
      await user.type(promptInput, 'Test prompt{Shift>}{Enter}{/Shift}');
    });

    // Wait for state updates to settle before asserting
    await waitFor(() => {
      expect(mockHandlers.onPrompt).not.toHaveBeenCalled();
    });
  });

  it('disables send button when prompt is empty', () => {
    render(
      <AgentCard
        agent={mockAgent}
        {...mockHandlers}
      />
    );

    const sendButton = screen.getByTitle('Send Prompt');
    expect(sendButton).toBeDisabled();
  });

  it('disables send button when agent is not ready', () => {
    render(
      <AgentCard
        agent={{ ...mockAgent, status: 'starting' }}
        {...mockHandlers}
      />
    );

    const sendButton = screen.getByTitle('Send Prompt');
    expect(sendButton).toBeDisabled();
  });

  it('displays terminal output', () => {
    render(
      <AgentCard
        agent={mockAgent}
        {...mockHandlers}
      />
    );

    const terminal = screen.getByTestId('terminal-output');
    expect(terminal).toBeInTheDocument();
    expect(screen.getByText('Line 1')).toBeInTheDocument();
    expect(screen.getByText('Line 2')).toBeInTheDocument();
  });

  it('shows processing indicator when agent is working', () => {
    render(
      <AgentCard
        agent={{ ...mockAgent, status: 'working' }}
        {...mockHandlers}
      />
    );

    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });

  it('displays current step when available', () => {
    render(
      <AgentCard
        agent={{ ...mockAgent, currentStep: 3 }}
        {...mockHandlers}
      />
    );

    expect(screen.getByText('Step: 3')).toBeInTheDocument();
  });
});