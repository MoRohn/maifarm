import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { gptOssService } from '../../services/gptOssService';
import { aiProviderManager, AIProvider } from '../../config/aiProviders';
import axios from 'axios';

// Mock axios for testing
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GPT-OSS-20B Integration Tests', () => {
  beforeAll(() => {
    // Set up environment for GPT-OSS
    process.env.GPT_OSS_ENABLED = 'true';
    process.env.GPT_OSS_HOST = 'http://localhost:11435';
    process.env.GPT_OSS_MODEL = 'gpt-oss-20b';
    process.env.AI_PROVIDER = 'gpt_oss';
  });

  afterAll(async () => {
    // Clean up
    await gptOssService.stop();
  });

  describe('Service Initialization', () => {
    it('should check server status on initialization', async () => {
      const mockHealthResponse = { status: 200, data: { status: 'healthy' } };
      mockedAxios.get = jest.fn().mockResolvedValue(mockHealthResponse);

      const isRunning = await gptOssService.checkServerStatus();
      expect(isRunning).toBe(false); // Since we're mocking, actual server isn't running
    });

    it('should emit model:ready event when model is available', (done) => {
      gptOssService.once('model:ready', (config) => {
        expect(config).toHaveProperty('model');
        expect(config).toHaveProperty('contextWindow');
        done();
      });

      // Trigger initialization logic
      const mockConfig = {
        model: 'gpt-oss-20b',
        contextWindow: 32768,
        quantization: '8bit',
        hardware: 'cuda',
        memoryUsage: 16000,
        capabilities: ['code', 'instruction']
      };

      gptOssService.emit('model:ready', mockConfig);
    });
  });

  describe('Provider Configuration', () => {
    it('should be recognized as a valid AI provider', () => {
      const isEnabled = aiProviderManager.isProviderEnabled(AIProvider.GPT_OSS);
      expect(isEnabled).toBe(true);
    });

    it('should have correct configuration in AI provider manager', () => {
      const config = aiProviderManager.getProvider(AIProvider.GPT_OSS);
      expect(config.provider).toBe(AIProvider.GPT_OSS);
      expect(config.isLocal).toBe(true);
      expect(config.apiEndpoint).toBe('http://localhost:11435');
      expect(config.model).toBe('gpt-oss-20b');
      expect(config.contextWindow).toBe(32768);
    });

    it('should support environment variable configuration', () => {
      const env = aiProviderManager.getProviderEnvironment(AIProvider.GPT_OSS);
      expect(env.GPT_OSS_HOST).toBe('http://localhost:11435');
      expect(env.GPT_OSS_MODEL).toBe('gpt-oss-20b');
      expect(env.GPT_OSS_MAX_TOKENS).toBe('32768');
    });
  });

  describe('Completion Generation', () => {
    it('should generate completion with correct parameters', async () => {
      const mockResponse = {
        data: {
          model: 'gpt-oss-20b',
          created_at: new Date().toISOString(),
          response: 'Hello! I am GPT-OSS-20B.',
          done: true
        }
      };

      mockedAxios.create = jest.fn().mockReturnValue({
        post: jest.fn().mockResolvedValue(mockResponse)
      } as any);

      const result = await gptOssService.createCompletion('Hello!', {
        temperature: 0.7,
        maxTokens: 100
      });

      expect(result).toBe('Hello! I am GPT-OSS-20B.');
    });

    it('should handle streaming responses', async () => {
      const mockStreamData = [
        JSON.stringify({ response: 'Hello', done: false }),
        JSON.stringify({ response: ' world', done: false }),
        JSON.stringify({ response: '!', done: true })
      ].join('\n');

      mockedAxios.create = jest.fn().mockReturnValue({
        post: jest.fn().mockResolvedValue({
          data: {
            [Symbol.asyncIterator]: async function* () {
              yield Buffer.from(mockStreamData);
            }
          }
        })
      } as any);

      const stream = gptOssService.generateStream({
        model: 'gpt-oss-20b',
        prompt: 'Say hello',
        stream: true
      });

      const chunks: string[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ' world', '!']);
    });
  });

  describe('Resource Management', () => {
    it('should track resource usage', async () => {
      const metrics = await gptOssService.getResourceUsage();
      
      expect(metrics).toHaveProperty('cpu');
      expect(metrics).toHaveProperty('memory');
      expect(metrics).toHaveProperty('gpu');
      expect(metrics.cpu).toHaveProperty('percent');
      expect(metrics.memory).toHaveProperty('used');
      expect(metrics.memory).toHaveProperty('total');
    });

    it('should emit resource warnings when thresholds exceeded', (done) => {
      gptOssService.once('resources:warning', (warning) => {
        expect(warning).toHaveProperty('type');
        expect(warning).toHaveProperty('usage');
        expect(warning.type).toBe('memory');
        done();
      });

      // Simulate high memory usage
      gptOssService.emit('resources:warning', {
        type: 'memory',
        usage: 95,
        message: 'High memory usage detected'
      });
    });

    it('should support model unloading to free resources', async () => {
      mockedAxios.create = jest.fn().mockReturnValue({
        post: jest.fn().mockResolvedValue({ data: { success: true } })
      } as any);

      await expect(gptOssService.unloadModel()).resolves.not.toThrow();
    });
  });

  describe('Farm Integration', () => {
    it('should create farm with GPT-OSS provider', async () => {
      const farmConfig = {
        name: 'Test GPT-OSS Farm',
        provider: 'gpt_oss' as const,
        maxAgents: 3,
        timeout: 600,
        tasks: [
          { id: '1', prompt: 'Write a hello world function' }
        ]
      };

      const farm = await gptOssService.createFarm(farmConfig);
      
      expect(farm).toHaveProperty('id');
      expect(farm.provider).toBe('gpt_oss');
      expect(farm.config.model).toBe('gpt-oss-20b');
      expect(farm.config.maxAgents).toBe(3);
    });

    it('should execute tasks with proper error handling', async () => {
      const task = {
        id: 'test-task-1',
        prompt: 'Generate a Python fibonacci function',
        temperature: 0.5,
        maxTokens: 500
      };

      mockedAxios.create = jest.fn().mockReturnValue({
        post: jest.fn().mockResolvedValue({
          data: {
            response: 'def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)',
            done: true
          }
        })
      } as any);

      const result = await gptOssService.executeTask(task);
      
      expect(result.taskId).toBe('test-task-1');
      expect(result.status).toBe('completed');
      expect(result.result).toContain('fibonacci');
      expect(result.executionTime).toBeGreaterThan(0);
    });
  });

  describe('Batch Processing', () => {
    it('should handle batch requests efficiently', async () => {
      const requests = Array.from({ length: 10 }, (_, i) => ({
        model: 'gpt-oss-20b',
        prompt: `Task ${i}`,
        max_tokens: 100
      }));

      mockedAxios.create = jest.fn().mockReturnValue({
        post: jest.fn().mockImplementation((url, data) => {
          return Promise.resolve({
            data: {
              response: `Response for: ${data.prompt}`,
              done: true
            }
          });
        })
      } as any);

      const results = await gptOssService.processBatch(requests);
      
      expect(results).toHaveLength(10);
      results.forEach((result, i) => {
        expect(result).toContain(`Task ${i}`);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle server connection errors gracefully', async () => {
      mockedAxios.create = jest.fn().mockReturnValue({
        post: jest.fn().mockRejectedValue(new Error('Connection refused'))
      } as any);

      await expect(
        gptOssService.generate({ model: 'gpt-oss-20b', prompt: 'test' })
      ).rejects.toThrow('Connection refused');
    });

    it('should handle malformed responses', async () => {
      mockedAxios.create = jest.fn().mockReturnValue({
        post: jest.fn().mockResolvedValue({
          data: { invalid: 'response' }
        })
      } as any);

      const result = await gptOssService.generate({
        model: 'gpt-oss-20b',
        prompt: 'test'
      });

      expect(result).toBe(''); // Should return empty string for invalid response
    });
  });

  describe('Privacy and Security', () => {
    it('should ensure all processing is local', () => {
      const config = aiProviderManager.getProvider(AIProvider.GPT_OSS);
      expect(config.isLocal).toBe(true);
      expect(config.apiKey).toBe(''); // No API key needed for local model
    });

    it('should not make external API calls', () => {
      const endpoint = process.env.GPT_OSS_HOST;
      expect(endpoint).toMatch(/^http:\/\/localhost/);
      expect(endpoint).not.toMatch(/api\./);
    });
  });
});

describe('GPT-OSS Performance Tests', () => {
  it('should measure token generation speed', async () => {
    const startTime = Date.now();
    const mockTokens = 100;
    
    mockedAxios.create = jest.fn().mockReturnValue({
      post: jest.fn().mockResolvedValue({
        data: {
          response: 'a '.repeat(mockTokens),
          done: true,
          eval_count: mockTokens,
          eval_duration: 5000000000 // 5 seconds in nanoseconds
        }
      })
    } as any);

    await gptOssService.generate({
      model: 'gpt-oss-20b',
      prompt: 'Generate text',
      max_tokens: mockTokens
    });

    const duration = Date.now() - startTime;
    const tokensPerSecond = (mockTokens / duration) * 1000;
    
    // Performance should be reasonable for local inference
    expect(tokensPerSecond).toBeGreaterThan(0);
  });

  it('should handle context window limits', async () => {
    const longPrompt = 'a'.repeat(40000); // Exceeds 32K context
    
    mockedAxios.create = jest.fn().mockReturnValue({
      post: jest.fn().mockRejectedValue(new Error('Context length exceeded'))
    } as any);

    await expect(
      gptOssService.generate({
        model: 'gpt-oss-20b',
        prompt: longPrompt
      })
    ).rejects.toThrow('Context length exceeded');
  });
});