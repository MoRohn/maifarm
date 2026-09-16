import axios from 'axios';
import type { ChatRequest } from '../engine-adapter';
import { OssAdapter } from '../oss';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const postMock = jest.fn();

describe('OssAdapter', () => {
  const chatRequest: ChatRequest = {
    messages: [
      { role: 'user', content: 'Run tool' }
    ],
    tools: [
      {
        name: 'execute',
        description: 'Execute tool',
        parameters: { type: 'object', properties: { command: { type: 'string' } } }
      }
    ],
    tool_choice: 'auto'
  };

  beforeEach(() => {
    postMock.mockReset();
    mockedAxios.create.mockReset();
    mockedAxios.create.mockReturnValue({ post: postMock } as any);
  });

  it('emulates tool calling via JSON protocol', async () => {
    postMock.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({ tool: 'execute', arguments: { command: 'ls' } })
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: 30,
          completion_tokens: 10,
          total_tokens: 40
        }
      }
    });

    const adapter = new OssAdapter({
      key: 'gpt-oss',
      label: 'OSS',
      model: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
      baseURL: 'http://localhost:8000/v1',
      toolMode: 'emulated_json'
    });

    const response = await adapter.chat(chatRequest);

    expect(postMock).toHaveBeenCalledWith('/chat/completions', expect.objectContaining({
      model: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('TOOL PROTOCOL')
        })
      ])
    }));

    expect(response.content).toBeNull();
    expect(response.tool_calls).toEqual([
      {
        id: expect.stringMatching(/^execute-/),
        name: 'execute',
        arguments: { command: 'ls' }
      }
    ]);
    expect(response.usage).toEqual({
      prompt_tokens: 30,
      completion_tokens: 10,
      total_tokens: 40
    });
  });

  it('estimates tokens for plain requests', async () => {
    const adapter = new OssAdapter({
      key: 'gpt-oss',
      label: 'OSS',
      model: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
      baseURL: 'http://localhost:8000/v1'
    });

    const result = await adapter.countTokens({ messages: [{ role: 'user', content: 'token estimate' }] });
    expect(result.prompt).toBeGreaterThan(0);
  });
});
