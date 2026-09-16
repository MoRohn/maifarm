import * as fs from 'fs';
import * as path from 'path';
import { load } from 'js-yaml';
import { z } from 'zod';

const ToolingModeSchema = z.union([
  z.literal('native'),
  z.literal('emulated_json'),
  z.literal('none'),
  z.literal('native_or_emulated')
]);

const EngineProviderSchema = z.union([
  z.literal('anthropic'),
  z.literal('openai'),
  z.literal('vllm'),
  z.literal('ollama'),
  z.literal('azure-openai'),
  z.literal('bedrock'),
  z.literal('custom')
]);

const EngineModelSchema = z.object({
  name: z.string().min(1),
  label: z.string().optional(),
  default: z.boolean().optional(),
  description: z.string().optional(),
  max_output_tokens: z.number().int().positive().optional()
});

const CostSchema = z
  .object({
    prompt: z.number().nonnegative().optional(),
    completion: z.number().nonnegative().optional()
  })
  .optional();

const RetrySchema = z
  .object({
    attempts: z.number().int().min(0).default(0),
    initialDelayMs: z.number().int().min(0).default(200),
    multiplier: z.number().positive().default(2),
    maxDelayMs: z.number().int().min(0).optional()
  })
  .default({ attempts: 0, initialDelayMs: 200, multiplier: 2 });

const CircuitBreakerSchema = z
  .object({
    errorThreshold: z.number().int().min(1).default(5),
    cooldownMs: z.number().int().min(1000).default(60_000),
    halfOpenAfterMs: z.number().int().min(1000).default(30_000)
  })
  .optional();

const RateLimitSchema = z
  .object({
    requestsPerMinute: z.number().int().min(1).optional(),
    tokensPerMinute: z.number().int().min(1).optional()
  })
  .optional();

const FeatureFlagSchema = z
  .object({
    enable_openai: z.boolean().optional(),
    enable_oss: z.boolean().optional(),
    enable_llama: z.boolean().optional()
  })
  .partial();

const EngineConfigSchema = z.object({
  key: z.string().min(1),
  provider: EngineProviderSchema,
  model: z.string().min(1),
  label: z.string().optional(),
  api_key_env: z.string().optional(),
  base_url: z.string().optional(),
  organization_env: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  stream: z.boolean().default(true),
  supports_tools: ToolingModeSchema.default('none'),
  max_context: z.union([z.number().int().positive(), z.string()]).optional(),
  max_output_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  timeout_ms: z.number().int().positive().optional(),
  retry: RetrySchema.optional(),
  circuit_breaker: CircuitBreakerSchema,
  rate_limit: RateLimitSchema,
  cost: CostSchema,
  fallback: z.array(z.string().min(1)).optional(),
  models: z.array(EngineModelSchema).optional(),
  features: z
    .object({
      vision: z.boolean().optional(),
      json_mode: z.boolean().optional(),
      system_messages: z.boolean().optional(),
      tool_choice: z.boolean().optional(),
      batching: z.boolean().optional()
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  options: z.record(z.string(), z.unknown()).optional()
});

const EnginesConfigSchema = z.object({
  default_engine: z.string().min(1),
  engines: z.array(EngineConfigSchema),
  feature_flags: FeatureFlagSchema.optional()
});

export type EngineModel = z.infer<typeof EngineModelSchema>;
export type EngineConfig = z.infer<typeof EngineConfigSchema>;
export type EnginesConfig = z.infer<typeof EnginesConfigSchema>;

export class EngineConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineConfigurationError';
  }
}

export function loadEnginesConfig(configPath?: string): EnginesConfig {
  const resolvedPath = configPath
    ? path.resolve(configPath)
    : path.join(process.cwd(), 'config', 'engines.yaml');

  if (!fs.existsSync(resolvedPath)) {
    throw new EngineConfigurationError(`engines.yaml not found at ${resolvedPath}`);
  }

  const raw = fs.readFileSync(resolvedPath, 'utf8');
  const parsed = load(raw);

  const result = EnginesConfigSchema.safeParse(parsed);

  if (!result.success) {
    const formatted = result.error.issues
      .map(issue => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new EngineConfigurationError(`Invalid engines.yaml: ${formatted}`);
  }

  const config = result.data;
  const keys = new Set(config.engines.map(engine => engine.key));
  if (!keys.has(config.default_engine)) {
    throw new EngineConfigurationError(
      `Default engine "${config.default_engine}" is not present in engines list`
    );
  }

  return config;
}

export function resolveEngineConfig(config: EnginesConfig, key: string): EngineConfig {
  const engine = config.engines.find(entry => entry.key === key);
  if (!engine) {
    throw new EngineConfigurationError(`Engine "${key}" not defined in engines.yaml`);
  }
  return engine;
}
