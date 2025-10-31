import { EventEmitter } from 'events';

const spawnMock = jest.fn();
const getTmuxPaneRefMock = jest.fn();

jest.mock('child_process', () => ({
  spawn: (...args: any[]) => spawnMock(...args),
  exec: jest.fn()
}));

jest.mock('../../utils/tmuxHelpers', () => ({
  getTmuxPaneRef: (...args: any[]) => getTmuxPaneRefMock(...args)
}));

// Import after mocks so the module picks up mocked dependencies
import { MaiBarn } from '../maibarn';

describe('MaiBarn terminal helpers', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    getTmuxPaneRefMock.mockReset();
  });

  it('uses tmux helper pane references when capturing output', async () => {
    getTmuxPaneRefMock.mockResolvedValue('farm-12345678:agents.0');

    spawnMock.mockImplementation(() => {
      const stdout = new EventEmitter();
      const stderr = new EventEmitter();
      const proc = new EventEmitter() as any;
      proc.stdout = stdout;
      proc.stderr = stderr;
      proc.on = proc.addListener.bind(proc);
      proc.stdout.on = proc.stdout.addListener.bind(proc.stdout);
      proc.stderr.on = proc.stderr.addListener.bind(proc.stderr);

      setImmediate(() => {
        stdout.emit('data', Buffer.from('line one\nline two\n'));
        proc.emit('exit', 0);
      });

      return proc;
    });

    const result = await MaiBarn.getAgentOutput('farm-12345678', 0, 50);

    expect(getTmuxPaneRefMock).toHaveBeenCalledWith('farm-12345678', 0);
    expect(spawnMock).toHaveBeenCalledWith(
      'tmux',
      expect.arrayContaining(['-t', 'farm-12345678:agents.0']),
      expect.objectContaining({ env: expect.objectContaining({ TMUX_TMPDIR: '/tmp' }) })
    );
    expect(result.lines).toEqual(['line one', 'line two']);
  });
});
