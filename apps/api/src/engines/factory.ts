import { AnthropicAdapter } from './anthropic';
import { OpenAIAdapter } from './openai';
import { OssAdapter } from './oss';
import { LlamaAdapter } from './qwen';
import type { EngineAdapter } from './engine-adapter';
import type { EngineConfig } from './config';

export interface EngineSecrets {
  apiKey?: string;
  organization?: string;
}

export function createEngineAdapter(config: EngineConfig, secrets: EngineSecrets = {}): EngineAdapter {
  const baseOptions = {
    key: config.key,
    label: config.label,
    model: config.model
  } as const;

  switch (config.provider) {
    case 'anthropic': {
      if (!secrets.apiKey) {
        throw new Error(`Anthropic engine "${config.key}" requires an API key`);
      }
      return new AnthropicAdapter({
        ...baseOptions,
        apiKey: secrets.apiKey,
        model: config.model,
        baseURL: config.base_url,
        timeoutMs: config.timeout_ms,
        headers: config.headers as Record<string, string> | undefined
      });
    }

    case 'openai': {
      if (!secrets.apiKey) {
        throw new Error(`OpenAI engine "${config.key}" requires an API key`);
      }
      return new OpenAIAdapter({
        ...baseOptions,
        apiKey: secrets.apiKey,
        model: config.model,
        baseURL: config.base_url,
        organization: secrets.organization,
        headers: config.headers as Record<string, string> | undefined
      });
    }

    case 'vllm':
    case 'ollama': {
      const isLlama =
        config.metadata?.family === 'llama' ||
        config.metadata?.provider === 'llama' ||
        config.key.toLowerCase().includes('llama');

      if (isLlama) {
        return new LlamaAdapter({
          ...baseOptions,
          baseURL: config.base_url ?? 'http://localhost:8001/v1',
          apiKey: secrets.apiKey,
          toolMode: config.supports_tools === 'native' ? 'native' : 'emulated',
          headers: config.headers as Record<string, string> | undefined
        });
      }

      return new OssAdapter({
        ...baseOptions,
        baseURL: config.base_url ?? 'http://localhost:8000/v1',
        model: config.model,
        apiKey: secrets.apiKey,
        toolMode:
          config.supports_tools === 'emulated_json' || config.supports_tools === 'native_or_emulated'
            ? 'emulated_json'
            : 'none',
        headers: config.headers as Record<string, string> | undefined
      });
    }

    case 'custom': {
      if (config.metadata?.provider === 'llama') {
        return new LlamaAdapter({
          ...baseOptions,
          baseURL: config.base_url ?? 'http://localhost:8001/v1',
          apiKey: secrets.apiKey,
          toolMode: config.supports_tools === 'native' ? 'native' : 'emulated',
          headers: config.headers as Record<string, string> | undefined
        });
      }
      throw new Error(`Custom provider for engine "${config.key}" is not supported yet`);
    }

    default:
      throw new Error(`Unsupported provider ${(config as any).provider}`);
  }
}
