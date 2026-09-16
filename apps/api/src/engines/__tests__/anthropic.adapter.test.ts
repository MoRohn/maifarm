import axios from 'axios';
import type { ChatRequest } from '../engine-adapter';
import { AnthropicAdapter } from '../anthropic';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const postMock = jest.fn();

describe('AnthropicAdapter', () => {
  const chatRequest: ChatRequest = {
    system: 'You are a helper',
    messages: [
      { role: 'user', content: 'Hello!' }
    ]
  };

  beforeEach(() => {
    postMock.mockReset();
    mockedAxios.create.mockReset();
    mockedAxios.create.mockReturnValue({ post: postMock } as any);
  });

  it('sends chat payload and normalises response', async () => {
    postMock.mockResolvedValueOnce({
      data: {
        content: [
          { type: 'text', text: 'Hi there' }
        ],
        usage: {
          input_tokens: 12,
          output_tokens: 4
        },
        stop_reason: 'stop',
        model: 'claude-3-sonnet'
      }
    });

    const adapter = new AnthropicAdapter({
      key: 'claude-code',
      apiKey: 'test-key',
      model: 'claude-3-sonnet'
    });

    const response = await adapter.chat(chatRequest);

    expect(mockedAxios.create).toHaveBeenCalledWith({
      baseURL: 'https://api.anthropic.com/v1',
      timeout: 60000,
      headers: expect.objectContaining({
        'x-api-key': 'test-key'
      })
    });

    expect(postMock).toHaveBeenCalledWith('/messages', expect.objectContaining({
      model: 'claude-3-sonnet',
      system: 'You are a helper',
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.arrayContaining([
            expect.objectContaining({ type: 'text', text: 'Hello!' })
          ])
        })
      ])
    }));

    expect(response.content).toBe('Hi there');
    expect(response.usage).toEqual({
      prompt_tokens: 12,
      completion_tokens: 4,
      total_tokens: 16
    });
    expect(response.finish_reason).toBe('stop');
  });

  it('counts tokens via API when available', async () => {
    postMock.mockResolvedValueOnce({
      data: {
        input_tokens: 42,
        output_tokens: 0
      }
    });

    const adapter = new AnthropicAdapter({
      key: 'claude-code',
      apiKey: 'test-key',
      model: 'claude-3-sonnet'
    });

    const result = await adapter.countTokens(chatRequest);
    expect(postMock).toHaveBeenLastCalledWith('/messages/count_tokens', expect.any(Object));
    expect(result).toEqual({ prompt: 42, completion: 0 });
  });
});
