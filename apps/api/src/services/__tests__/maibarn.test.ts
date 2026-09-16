import { EventEmitter } from 'events';
const tmuxTmpDir = process.env.TMUX_TMPDIR || '/tmp';

// FIX: Use 'mock' prefix for variables referenced inside jest.mock() factories
const mockSpawn = jest.fn();
const mockGetTmuxPaneRef = jest.fn();

jest.mock('child_process', () => ({
  spawn: (...args: any[]) => mockSpawn(...args),
  exec: jest.fn()
}));

jest.mock('../../utils/tmuxHelpers', () => ({
  getTmuxPaneRef: (...args: any[]) => mockGetTmuxPaneRef(...args)
}));

// Import after mocks so the module picks up mocked dependencies
import { MaiBarn } from '../maibarn';

describe('MaiBarn terminal helpers', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    mockGetTmuxPaneRef.mockReset();
  });

  it('uses tmux helper pane references when capturing output', async () => {
    mockGetTmuxPaneRef.mockResolvedValue('farm-12345678:agents.0');

    mockSpawn.mockImplementation(() => {
      const stdout = new EventEmitter();
      const stderr = new EventEmitter();
      const proc = new EventEmitter() as any;
      proc.stdout = stdout;
      proc.stderr = stderr;
      proc.on = proc.addListener.bind(proc);
      proc.stdout.on = proc.stdout.addListener.bind(proc.stdout);
      proc.stderr.on = proc.stderr.addListener.bind(proc.stderr);

      setTimeout(() => {
        stdout.emit('data', Buffer.from('line one\nline two\n'));
        proc.emit('exit', 0);
      }, 0);

      return proc;
    });

    const result = await MaiBarn.getAgentOutput('farm-12345678', 0, 50);

    expect(mockGetTmuxPaneRef).toHaveBeenCalledWith('farm-12345678', 0);
    expect(mockSpawn).toHaveBeenCalledTimes(1);

    const [cmd, args, options] = mockSpawn.mock.calls[0];
    expect(cmd).toBe('tmux');
    expect(args).toEqual(expect.arrayContaining(['-t', 'farm-12345678:agents.0']));
    expect(options?.env?.TMUX_TMPDIR).toBe(process.env.TMUX_TMPDIR);
    expect(result.lines).toEqual(['line one', 'line two']);
  });
});
