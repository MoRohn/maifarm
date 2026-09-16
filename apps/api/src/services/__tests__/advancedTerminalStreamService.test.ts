import { promises as fs } from 'fs';

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  },
  LogCategory: {
    TERMINAL: 'terminal'
  }
}));

jest.mock('../../websocket/UnifiedWebSocketManager', () => ({
  unifiedWebSocketManager: {
    broadcast: jest.fn().mockResolvedValue(undefined),
    broadcastToFarm: jest.fn().mockResolvedValue(undefined),
    broadcastToRoom: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn().mockResolvedValue(undefined)
  }
}));

jest.mock('child_process', () => {
  const execMock = jest.fn();

  return {
    exec: execMock,
    __esModule: true
  };
});

// Import modules after setting up mocks
import { advancedTerminalStreamService } from '../AdvancedTerminalStreamService';
import { pathConfig } from '../../config/paths';

const execMock = require('child_process').exec as jest.Mock;

const FARM_ID = '11111111-1111-1111-1111-111111111111';
const AGENT_ID = 0;

describe('AdvancedTerminalStreamService', () => {
  beforeEach(async () => {
    // FIX: Handle both exec(cmd, callback) and exec(cmd, options, callback) signatures
    execMock.mockImplementation((command: string, optionsOrCallback: any, maybeCallback?: (...args: any[]) => void) => {
      // Determine the actual callback - it's either the second or third argument
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;

      if (!callback) {
        return {} as any;
      }

      if (command.includes('pipe-pane')) {
        setTimeout(() => callback(new Error('tmux pipe failure')), 0);
        return {} as any;
      }

      if (command.includes('capture-pane')) {
        const output = '$ echo "ready"\nready\n';
        setTimeout(() => callback(null, output), 0);
        return {} as any;
      }

      setTimeout(() => callback(null, ''), 0);
      return {} as any;
    });

    // Ensure clean start
    await advancedTerminalStreamService.closeSession(FARM_ID, AGENT_ID);
  });

  afterEach(async () => {
    await advancedTerminalStreamService.closeAllSessions();
    execMock.mockReset();

    const terminalDir = pathConfig.getTerminalDir(FARM_ID);
    await fs.rm(terminalDir, { recursive: true, force: true });
  });

  it('falls back to polling and captures terminal output within managed log path', async () => {
    await advancedTerminalStreamService.createSession(
      FARM_ID,
      AGENT_ID,
      'Agent Smith',
      'farm-session',
      'Install dependencies'
    );

    // Allow the mocked pipe-pane to run and fallback to polling
    await new Promise((resolve) => setTimeout(resolve, 50));

    const session = advancedTerminalStreamService.getSession(FARM_ID, AGENT_ID);
    expect(session).toBeDefined();
    if (!session) return;

    expect(session.outputPath).toBe(pathConfig.getTerminalLogPath(FARM_ID, AGENT_ID));
    expect(session.pollInterval).toBeDefined();

    // Give the polling interval a chance to capture data
    await new Promise((resolve) => setTimeout(resolve, 150));

    const logContents = await fs.readFile(session.outputPath, 'utf-8');
    expect(logContents).toContain('ready');

    const serviceWithInternals = advancedTerminalStreamService as unknown as {
      processNewOutput: (targetSession: any) => Promise<void>;
    };

    await serviceWithInternals.processNewOutput(session);

    expect(session.messages.length).toBeGreaterThan(0);
    expect(session.messages[0].content).toContain('ready');
  });
});
