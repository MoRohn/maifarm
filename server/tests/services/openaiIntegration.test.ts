import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { openaiService } from '../../services/unified/aiProviderService';
import { openaiCodeManager } from '../../services/unified/aiProviderService';
import { aiProviderManager, AIProvider } from '../../config/aiProviders';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OpenAI Integration Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Set up test environment
    process.env.OPENAI_API_KEY = 'test-api-key';
    process.env.OPENAI_ENABLED = 'true';
    process.env.OPENAI_MODEL = 'gpt-4-turbo-preview';
    process.env.USE_LLM_PROXY = 'false';
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('OpenAI Service', () => {
    it('should be configured when API key is present', () => {
      expect(openaiService.isConfigured()).toBe(true);
    });

    it('should validate connection with proper API key', async () => {
      // Mock successful validation response
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          data: [
            { id: 'gpt-4-turbo-preview', object: 'model' },
            { id: 'gpt-4', object: 'model' },
            { id: 'gpt-3.5-turbo', object: 'model' }
          ]
        }
      });

      const validation = await openaiService.validateConnection();
      
      expect(validation.isValid).toBe(true);
      expect(validation.provider).toBe('openai');
      expect(validation.availableModels).toContain('gpt-4-turbo-preview');
    });

    it('should handle API test correctly', async () => {
      // Mock validation and API test responses
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          data: [{ id: 'gpt-4-turbo-preview', object: 'model' }]
        }
      });

      mockedAxios.post.mockResolvedValueOnce({
        data: {
          choices: [{
            message: {
              content: 'API connection successful'
            }
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15
          }
        }
      });

      const result = await openaiService.testAPI();
      
      expect(result.success).toBe(true);
      expect(result.response?.message).toBe('API connection successful');
      expect(result.response?.usage).toBeDefined();
    });

    it('should execute quick tasks', async () => {
      // Mock API response for quick task
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          choices: [{
            message: {
              content: 'Task completed successfully'
            }
          }],
          usage: {
            total_tokens: 100
          }
        }
      });

      const result = await openaiService.executeQuickTask({
        prompt: 'Test task',
        model: 'gpt-4-turbo-preview'
      });

      expect(result.agentId).toMatch(/^openai-quick-/);
      expect(result.result).toBeDefined();
    });

    it('should create farms with OpenAI agents', async () => {
      const farm = await openaiService.createFarm({
        agentCount: 2,
        model: 'gpt-4-turbo-preview',
        agentNames: ['Agent 1', 'Agent 2']
      });

      expect(farm.farmId).toMatch(/^openai-farm-/);
      expect(farm.agents).toHaveLength(2);
      expect(farm.agents[0].provider).toBe('openai');
    });
  });

  describe('OpenAI Code Manager', () => {
    it('should check availability correctly', async () => {
      const isAvailable = await openaiCodeManager.isAvailable();
      expect(isAvailable).toBe(true);
    });

    it('should create farms with proper configuration', async () => {
      const farm = await openaiCodeManager.createFarm({
        name: 'Test Farm',
        description: 'Test Description',
        agents: 3,
        prompt: 'Test prompt',
        projectPath: '/test/path',
        collaborative: true
      });

      expect(farm.id).toBeDefined();
      expect(farm.provider).toBe('openai');
      expect(farm.model).toBe('gpt-4-turbo-preview');
      expect(farm.agents).toBe(3);
    });

    it('should handle function calling tools', () => {
      const tools = openaiCodeManager['getAvailableTools']();
      
      expect(tools).toBeInstanceOf(Array);
      expect(tools.length).toBeGreaterThan(0);
      
      const toolNames = tools.map(t => t.function.name);
      expect(toolNames).toContain('execute_code');
      expect(toolNames).toContain('read_file');
      expect(toolNames).toContain('write_file');
      expect(toolNames).toContain('search_codebase');
    });

    it('should send tasks to agents', async () => {
      // Create a test farm first
      const farm = await openaiCodeManager.createFarm({
        name: 'Test Farm',
        description: 'Test',
        agents: 1,
        prompt: 'Initial prompt',
        projectPath: '/test'
      });

      const agents = openaiCodeManager.getFarmAgents(farm.id);
      expect(agents).toHaveLength(1);

      // Mock API response for task
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          choices: [{
            message: {
              content: 'Task executed'
            }
          }]
        }
      });

      await openaiCodeManager.sendTaskToAgent(agents[0].id, 'New task');
      
      const agent = openaiCodeManager.getAgentStatus(agents[0].id);
      expect(agent?.currentTask).toBe('New task');
    });

    it('should stop farms and cleanup resources', async () => {
      const farm = await openaiCodeManager.createFarm({
        name: 'Cleanup Test',
        description: 'Test',
        agents: 2,
        prompt: 'Test',
        projectPath: '/test'
      });

      await openaiCodeManager.stopFarm(farm.id);
      
      const farmStatus = openaiCodeManager.getFarmStatus(farm.id);
      expect(farmStatus?.status).toBe('stopped');
    });
  });

  describe('AI Provider Manager Integration', () => {
    it('should recognize OpenAI as enabled provider', () => {
      const isEnabled = aiProviderManager.isProviderEnabled(AIProvider.OPENAI);
      expect(isEnabled).toBe(true);
    });

    it('should include OpenAI in available providers', () => {
      const providers = aiProviderManager.getAllProviders();
      const openaiProvider = providers.find(p => p.provider === AIProvider.OPENAI);
      
      expect(openaiProvider).toBeDefined();
      expect(openaiProvider?.enabled).toBe(true);
      expect(openaiProvider?.model).toBe('gpt-4-turbo-preview');
    });

    it('should provide correct environment variables for OpenAI', () => {
      const env = aiProviderManager.getProviderEnvironment(AIProvider.OPENAI);
      
      expect(env.OPENAI_API_KEY).toBe('test-api-key');
      expect(env.OPENAI_MODEL).toBe('gpt-4-turbo-preview');
      expect(env.AI_PROVIDER).toBe('openai');
    });
  });

  describe('LLM Proxy Integration', () => {
    beforeAll(() => {
      process.env.USE_LLM_PROXY = 'true';
      process.env.LLM_PROXY_URL = 'http://localhost:8001';
    });

    it('should use LLM proxy when enabled', async () => {
      // Mock fetch for proxy requests
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          providers: ['openai', 'claude', 'qwen']
        })
      } as Response);

      const isAvailable = await openaiCodeManager.isAvailable();
      expect(isAvailable).toBe(true);
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/providers')
      );
    });

    it('should route OpenAI requests through proxy', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ providers: ['openai'] })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{
              message: { content: 'Proxy response' }
            }]
          })
        } as Response);

      const farm = await openaiCodeManager.createFarm({
        name: 'Proxy Test',
        description: 'Test',
        agents: 1,
        prompt: 'Test',
        projectPath: '/test'
      });

      expect(farm.id).toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/chat/completions'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('openai/')
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle missing API key gracefully', async () => {
      process.env.OPENAI_API_KEY = '';
      
      const validation = await openaiService.validateConnection();
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('not configured');
    });

    it('should handle API errors with proper messages', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: {
          status: 429,
          data: {
            error: {
              message: 'Rate limit exceeded'
            }
          }
        }
      });

      const result = await openaiService.testAPI();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit');
    });

    it('should handle network errors', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));
      
      const validation = await openaiService.validateConnection();
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Network error');
    });
  });
});

describe('OpenAI Farm Lifecycle Integration', () => {
  it('should complete full farm lifecycle', async () => {
    // Mock all necessary API calls
    mockedAxios.post.mockResolvedValue({
      data: {
        choices: [{
          message: { content: 'Task completed' }
        }],
        usage: { total_tokens: 100 }
      }
    });

    // Create farm
    const farm = await openaiCodeManager.createFarm({
      name: 'Lifecycle Test',
      description: 'Full lifecycle test',
      agents: 2,
      prompt: 'Complete this task',
      projectPath: '/test',
      collaborative: true,
      steps: ['Step 1', 'Step 2', 'Step 3']
    });

    expect(farm.status).toBe('running');
    expect(farm.agents).toBe(2);

    // Get agents
    const agents = openaiCodeManager.getFarmAgents(farm.id);
    expect(agents).toHaveLength(2);

    // Send tasks to agents
    for (const agent of agents) {
      await openaiCodeManager.sendTaskToAgent(
        agent.id, 
        `Task for ${agent.id}`
      );
    }

    // Stop farm
    await openaiCodeManager.stopFarm(farm.id);
    
    const finalStatus = openaiCodeManager.getFarmStatus(farm.id);
    expect(finalStatus?.status).toBe('stopped');
  });

  it('should handle collaborative mode correctly', async () => {
    const farm = await openaiCodeManager.createFarm({
      name: 'Collab Test',
      description: 'Collaborative test',
      agents: 3,
      prompt: 'Work together',
      projectPath: '/test',
      collaborative: true
    });

    const agents = openaiCodeManager.getFarmAgents(farm.id);
    
    // Verify all agents have collaborative instructions
    for (const agent of agents) {
      const conversation = openaiCodeManager['agentConversations'].get(agent.id);
      expect(conversation).toBeDefined();
      expect(conversation![0].content).toContain('COLLABORATION MODE ENABLED');
    });
  });
});