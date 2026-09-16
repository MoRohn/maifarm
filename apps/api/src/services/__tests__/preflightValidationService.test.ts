import { PreflightCheck } from '../preflightValidationService';

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  },
  LogCategory: {
    FARM: 'farm'
  }
}));

jest.mock('../../engines/gpt-oss-launcher', () => ({
  gptOssLauncher: {
    checkHealth: jest.fn()
  }
}));

import { preflightValidationService } from '../preflightValidationService';
import { gptOssLauncher } from '../../engines/gpt-oss-launcher';

const gptOssLauncherMock = gptOssLauncher as unknown as {
  checkHealth: jest.Mock;
};

describe('PreflightValidationService - GPT-OSS integration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    gptOssLauncherMock.checkHealth.mockReset();
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  afterAll(() => {
    Object.assign(process.env, originalEnv);
  });

  const callValidateProvider = async () =>
    (preflightValidationService as unknown as {
      validateProvider: (provider: 'gpt-oss') => Promise<PreflightCheck>;
    }).validateProvider('gpt-oss');

  const callValidateGptOssServer = async () =>
    (preflightValidationService as unknown as {
      validateGptOssServer: () => Promise<PreflightCheck>;
    }).validateGptOssServer();

  it('fails provider validation when GPT-OSS is not enabled', async () => {
    delete process.env.GPT_OSS_ENABLED;
    process.env.GPT_OSS_HOST = 'http://localhost:8000/v1';
    process.env.GPT_OSS_MODEL = 'openai/gpt-oss-20b';

    const result = await callValidateProvider();

    expect(result.status).toBe('fail');
    expect(result.message).toContain('GPT_OSS_ENABLED');
  });

  it('returns warning when GPT_OSS_MODEL is missing', async () => {
    process.env.GPT_OSS_ENABLED = 'true';
    process.env.GPT_OSS_HOST = 'http://localhost:8000/v1';
    delete process.env.GPT_OSS_MODEL;

    const result = await callValidateProvider();

    expect(result.status).toBe('warning');
    expect(result.message).toContain('GPT_OSS_MODEL');
  });

  it('passes provider validation when GPT-OSS configuration is present', async () => {
    process.env.GPT_OSS_ENABLED = 'true';
    process.env.GPT_OSS_HOST = 'http://localhost:8000/v1';
    process.env.GPT_OSS_MODEL = 'openai/gpt-oss-20b';

    const result = await callValidateProvider();

    expect(result.status).toBe('pass');
    expect(result.details).toMatchObject({ host: 'http://localhost:8000/v1' });
  });

  it('fails GPT-OSS server check when launcher reports server offline', async () => {
    process.env.GPT_OSS_ENABLED = 'true';
    process.env.GPT_OSS_HOST = 'http://localhost:8000/v1';
    process.env.GPT_OSS_MODEL = 'openai/gpt-oss-20b';

    gptOssLauncherMock.checkHealth.mockResolvedValue({
      running: false,
      healthy: false,
      error: 'connection refused'
    });

    const result = await callValidateGptOssServer();

    expect(result.status).toBe('fail');
    expect(result.message).toContain('not running');
  });

  it('passes GPT-OSS server check when launcher reports healthy', async () => {
    process.env.GPT_OSS_ENABLED = 'true';
    process.env.GPT_OSS_HOST = 'http://localhost:8000/v1';
    process.env.GPT_OSS_MODEL = 'openai/gpt-oss-20b';

    gptOssLauncherMock.checkHealth.mockResolvedValue({
      running: true,
      healthy: true,
      backend: 'llama-cpp',
      model: 'openai/gpt-oss-20b'
    });

    const result = await callValidateGptOssServer();

    expect(result.status).toBe('pass');
    expect(result.details).toMatchObject({ backend: 'llama-cpp' });
  });

  it('passes GPT-OSS server check when embedded mini backend is active', async () => {
    process.env.GPT_OSS_ENABLED = 'true';
    process.env.GPT_OSS_HOST = 'http://localhost:8000/v1';
    process.env.GPT_OSS_MODEL = 'openai/gpt-oss-20b';

    gptOssLauncherMock.checkHealth.mockResolvedValue({
      running: true,
      healthy: true,
      backend: 'mini',
      model: 'openai/gpt-oss-20b'
    });

    const result = await callValidateGptOssServer();

    expect(result.status).toBe('pass');
    expect(result.message).toContain('embedded mini backend');
    expect(result.details).toMatchObject({ backend: 'mini' });
  });

  it('treats mock backend health as pass for local smoke testing', async () => {
    process.env.GPT_OSS_ENABLED = 'true';
    process.env.GPT_OSS_HOST = 'http://localhost:8000/v1';
    process.env.GPT_OSS_MODEL = 'openai/gpt-oss-20b';

    gptOssLauncherMock.checkHealth.mockResolvedValue({
      running: true,
      healthy: true,
      backend: 'mock',
      model: 'openai/gpt-oss-20b'
    });

    const result = await callValidateGptOssServer();

    expect(result.status).toBe('warning');
    expect(result.message).toContain('mock backend');
    expect(result.details).toMatchObject({ backend: 'mock' });
  });
});
