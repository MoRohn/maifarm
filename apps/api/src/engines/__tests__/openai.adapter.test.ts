import type { ChatRequest } from '../engine-adapter';
import { OpenAIAdapter } from '../openai';

// FIX: Use 'mock' prefix for variables referenced inside jest.mock() factories
const mockCompletionsCreate = jest.fn();

jest.mock('openai', () => {
  const OpenAI = jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCompletionsCreate
      }
    }
  }));

  return { __esModule: true, default: OpenAI };
});

describe('OpenAIAdapter', () => {
  const chatRequest: ChatRequest = {
    system: 'system prompt',
    messages: [
      { role: 'user', content: 'Say hello' }
    ],
    response_format: { type: 'json_schema', schema: { title: 'Test', type: 'object' } }
  };

  beforeEach(() => {
    mockCompletionsCreate.mockReset();
  });

  it('invokes OpenAI client with native tooling', async () => {
    mockCompletionsCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: 'Hello!',
            tool_calls: undefined
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 5,
        total_tokens: 25
      },
      model: 'gpt-4.1-mini'
    });

    const adapter = new OpenAIAdapter({
      key: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4.1-mini'
    });

    const response = await adapter.chat(chatRequest);

    expect(mockCompletionsCreate).toHaveBeenCalledWith({
      model: 'gpt-4.1-mini',
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'system', content: 'system prompt' }),
        expect.objectContaining({ role: 'user', content: 'Say hello' })
      ]),
      max_tokens: undefined,
      temperature: undefined,
      top_p: undefined,
      stop: undefined,
      tools: undefined,
      tool_choice: undefined,
      response_format: {
        type: 'json_schema',
        json_schema: expect.objectContaining({ name: 'Test', schema: expect.any(Object), strict: true })
      }
    });

    expect(response.content).toBe('Hello!');
    expect(response.usage).toEqual({
      prompt_tokens: 20,
      completion_tokens: 5,
      total_tokens: 25
    });
  });

  it('estimates token counts without API call', async () => {
    const adapter = new OpenAIAdapter({
      key: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4.1-mini'
    });

    const result = await adapter.countTokens(chatRequest);
    expect(result.prompt).toBeGreaterThan(0);
  });
});
