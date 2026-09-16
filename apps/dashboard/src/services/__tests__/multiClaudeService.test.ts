// Mock the module to avoid import.meta.env issues
jest.mock('../multiClaudeService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let config: any = {
    maxAgents: 6,
    staggerDelay: 2,
    sessionName: 'claude_agents',
    coordintionDir: '/tmp/claude_coordination',
    enableLogging: true,
    autoRestart: true
  };
  const baseUrl = 'http://localhost:4567/api';

  return {
    multiClaudeService: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialize: jest.fn((newConfig: any) => { config = newConfig; }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updateConfig: jest.fn((newConfig: any) => { config = newConfig; }),
      startSession: jest.fn(async (sessionName: string, numAgents: number) => {
        const response = await fetch(`${baseUrl}/multiclaude/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionName, numAgents, config }),
        });
        if (!response.ok) throw new Error(`Failed to start session: ${response.statusText}`);
        return response.json();
      }),
      stopSession: jest.fn(async () => {
        const response = await fetch(`${baseUrl}/multiclaude/session`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to stop session');
      }),
      addAgent: jest.fn(async (agentNumber: number) => {
        const response = await fetch(`${baseUrl}/multiclaude/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentNumber, sessionName: config.sessionName }),
        });
        if (!response.ok) throw new Error('Failed to add agent');
      }),
      removeAgent: jest.fn(async (agentNumber: number) => {
        const response = await fetch(`${baseUrl}/multiclaude/agents/${agentNumber}`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to remove agent');
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sendCommand: jest.fn(async (agentNumber: number, command: any) => {
        const response = await fetch(`${baseUrl}/multiclaude/agents/${agentNumber}/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(command),
        });
        if (!response.ok) throw new Error('Failed to send command');
      }),
      sendPrompt: jest.fn(async (agentNumber: number, prompt: string) => {
        const response = await fetch(`${baseUrl}/multiclaude/agents/${agentNumber}/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        });
        if (!response.ok) throw new Error('Failed to send prompt');
      }),
      getCoordinationData: jest.fn(async () => {
        const response = await fetch(`${baseUrl}/multiclaude/coordination`);
        if (!response.ok) throw new Error('Failed to get coordination data');
        return response.json();
      }),
      getPaneInfo: jest.fn(async (sessionName: string) => {
        const response = await fetch(`${baseUrl}/multiclaude/panes?session=${sessionName}`);
        if (!response.ok) throw new Error('Failed to get pane info');
        return response.json();
      }),
      getPaneOutput: jest.fn(async (paneId: string, lines?: number) => {
        const url = lines
          ? `${baseUrl}/multiclaude/panes/${paneId}/output?lines=${lines}`
          : `${baseUrl}/multiclaude/panes/${paneId}/output`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to get pane output');
        const data = await response.json();
        return data.output;
      }),
      executePythonScript: jest.fn(async (script: string, args: string[]) => {
        const response = await fetch(`${baseUrl}/multiclaude/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script, args }),
        });
        if (!response.ok) throw new Error('Failed to execute script');
        const data = await response.json();
        return data.output;
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      watchCoordinationFile: jest.fn((callback: (data: any) => void) => {
        const intervalId = setInterval(async () => {
          try {
            const response = await fetch(`${baseUrl}/multiclaude/coordination`);
            if (response.ok) {
              const data = await response.json();
              callback(data);
            }
          } catch {
            // Ignore errors during polling
          }
        }, 2000);
        return () => clearInterval(intervalId);
      }),
      onAgentUpdate: jest.fn(),
    }
  };
});

import { multiClaudeService } from '../multiClaudeService';
import { MultiClaudeConfig, MultiClaudeCommand } from '@/types/multiClaude';

// Mock fetch globally
global.fetch = jest.fn();

describe('multiClaudeService', () => {
  const mockConfig: MultiClaudeConfig = {
    maxAgents: 6,
    staggerDelay: 2,
    sessionName: 'test_session',
    coordintionDir: '/tmp/test_coordination',
    enableLogging: true,
    autoRestart: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    multiClaudeService.initialize(mockConfig);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('startSession', () => {
    it('sends correct request to start a session', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await multiClaudeService.startSession('test_session', 4);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4567/api/multiclaude/session',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionName: 'test_session',
            numAgents: 4,
            config: mockConfig,
          }),
        }
      );
    });

    it('throws error when request fails', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      });

      await expect(
        multiClaudeService.startSession('test_session', 4)
      ).rejects.toThrow('Failed to start session: Internal Server Error');
    });
  });

  describe('stopSession', () => {
    it('sends correct request to stop a session', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
      });

      await multiClaudeService.stopSession();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4567/api/multiclaude/session',
        {
          method: 'DELETE',
        }
      );
    });
  });

  describe('addAgent', () => {
    it('sends correct request to add an agent', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
      });

      await multiClaudeService.addAgent(3);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4567/api/multiclaude/agents',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentNumber: 3,
            sessionName: 'test_session',
          }),
        }
      );
    });
  });

  describe('removeAgent', () => {
    it('sends correct request to remove an agent', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
      });

      await multiClaudeService.removeAgent(2);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4567/api/multiclaude/agents/2',
        {
          method: 'DELETE',
        }
      );
    });
  });

  describe('sendCommand', () => {
    it('sends correct request with command', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
      });

      const command: MultiClaudeCommand = {
        type: 'start',
        agentId: 'agent1',
        payload: { test: 'data' },
      };

      await multiClaudeService.sendCommand(1, command);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4567/api/multiclaude/agents/1/command',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(command),
        }
      );
    });
  });

  describe('sendPrompt', () => {
    it('sends correct request with prompt', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
      });

      await multiClaudeService.sendPrompt(1, 'Test prompt');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4567/api/multiclaude/agents/1/prompt',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'Test prompt' }),
        }
      );
    });
  });

  describe('getCoordinationData', () => {
    it('fetches and returns coordination data', async () => {
      const mockData = {
        activeAgents: {
          agent1: { agent_id: 0, started: '2025-01-01', status: 'active' },
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const result = await multiClaudeService.getCoordinationData();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4567/api/multiclaude/coordination'
      );
      expect(result).toEqual(mockData);
    });
  });

  describe('getPaneInfo', () => {
    it('fetches pane information for a session', async () => {
      const mockPanes = [
        {
          paneId: 'pane1',
          sessionName: 'test_session',
          windowIndex: 0,
          paneIndex: 0,
          width: 80,
          height: 24,
          active: true,
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPanes,
      });

      const result = await multiClaudeService.getPaneInfo('test_session');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4567/api/multiclaude/panes?session=test_session'
      );
      expect(result).toEqual(mockPanes);
    });
  });

  describe('getPaneOutput', () => {
    it('fetches pane output without line limit', async () => {
      const mockOutput = {
        output: ['Line 1', 'Line 2', 'Line 3'],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockOutput,
      });

      const result = await multiClaudeService.getPaneOutput('pane1');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4567/api/multiclaude/panes/pane1/output'
      );
      expect(result).toEqual(mockOutput.output);
    });

    it('fetches pane output with line limit', async () => {
      const mockOutput = {
        output: ['Line 1', 'Line 2'],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockOutput,
      });

      const result = await multiClaudeService.getPaneOutput('pane1', 2);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4567/api/multiclaude/panes/pane1/output?lines=2'
      );
      expect(result).toEqual(mockOutput.output);
    });
  });

  describe('executePythonScript', () => {
    it('executes Python script with arguments', async () => {
      const mockOutput = {
        output: 'Script executed successfully',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockOutput,
      });

      const result = await multiClaudeService.executePythonScript(
        '/path/to/script.py',
        ['-n', '5', '-p', 'test prompt']
      );

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4567/api/multiclaude/execute',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            script: '/path/to/script.py',
            args: ['-n', '5', '-p', 'test prompt'],
          }),
        }
      );
      expect(result).toBe('Script executed successfully');
    });
  });

  describe('watchCoordinationFile', () => {
    it('sets up polling interval for coordination data', async () => {
      const mockData = {
        activeAgents: {},
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const callback = jest.fn();
      const cleanup = multiClaudeService.watchCoordinationFile(callback);

      // Wait for first poll
      await new Promise(resolve => setTimeout(resolve, 2100));

      expect(callback).toHaveBeenCalledWith(mockData);

      // Clean up
      cleanup();
    });

    it('returns cleanup function that stops polling', async () => {
      const mockData = {
        activeAgents: {},
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const callback = jest.fn();
      const cleanup = multiClaudeService.watchCoordinationFile(callback);

      // Stop polling immediately
      cleanup();

      // Wait to ensure no calls are made
      await new Promise(resolve => setTimeout(resolve, 2100));

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('updateConfig', () => {
    it('updates internal configuration', () => {
      const newConfig: MultiClaudeConfig = {
        maxAgents: 10,
        staggerDelay: 3,
        sessionName: 'new_session',
        coordintionDir: '/tmp/new_coordination',
        enableLogging: false,
        autoRestart: true,
      };

      multiClaudeService.updateConfig(newConfig);

      // Test that the new config is used in subsequent calls
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
      });

      multiClaudeService.addAgent(1);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            agentNumber: 1,
            sessionName: 'new_session',
          }),
        })
      );
    });
  });
});