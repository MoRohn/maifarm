import * as fs from 'fs';
import * as path from 'path';
import { loadEnginesConfig } from '../config';

describe('Golden transcripts', () => {
  it('covers every configured engine with a baseline response', () => {
    const transcriptsDir = path.join(process.cwd(), 'tests/engines/golden');
    const configPath = path.join(process.cwd(), 'config', 'engines.yaml');
    const enginesConfig = loadEnginesConfig(configPath);
    const transcriptPath = path.join(transcriptsDir, 'basic-tool.json');
    const payload = JSON.parse(fs.readFileSync(transcriptPath, 'utf8')) as {
      prompt: string;
      expected: Record<string, string>;
    };

    expect(payload.prompt).toBeTruthy();

    for (const engine of enginesConfig.engines) {
      expect(payload.expected).toHaveProperty(engine.key);
      expect(typeof payload.expected[engine.key]).toBe('string');
    }
  });
});
