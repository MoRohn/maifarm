import { generateMiniGptOssResponse } from '../gpt-oss-mini';

describe('generateMiniGptOssResponse', () => {
  const baseOptions = {
    maxTokens: 512,
    temperature: 0.6,
    agentName: 'Bessie',
  };

  it('handles directory listing prompt with deterministic output', () => {
    const response = generateMiniGptOssResponse([
      { role: 'user', content: 'List the contents of the current directory' },
    ], baseOptions);

    expect(response).toContain('### Directory Survey');
    expect(response).toContain('- apps/');
  });

  it('produces review guidance for TypeScript review prompt', () => {
    const response = generateMiniGptOssResponse([
      { role: 'user', content: 'Review this TypeScript function for bugs:\nfunction add(a: number, b: number) {\n  return a + b;\n}' },
    ], baseOptions);

    expect(response).toContain('### Review Summary');
    expect(response).toContain('Suggested Actions');
  });

  it('falls back to generic workflow guidance otherwise', () => {
    const response = generateMiniGptOssResponse([
      { role: 'user', content: 'Analyze our deployment checklist for risks.' },
    ], baseOptions);

    expect(response).toContain('MaiFarm GPT-OSS mini backend');
    expect(response).toMatch(/###/);
  });
});
