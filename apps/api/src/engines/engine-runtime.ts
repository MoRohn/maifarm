import PQueue from 'p-queue';
import { isAxiosError } from 'axios';
import type { EngineAdapter, ChatRequest, ChatResponse, StreamEvent } from './engine-adapter';
import type { EngineConfig } from './config';
import type { EngineSecrets } from './factory';
import { createEngineAdapter } from './factory';
import { estimateMessagesTokenCount } from './token-estimator';
import { EngineCircuitOpenError, EngineExecutionError } from './errors';

const MIN_RATE_DELAY_MS = 50;
const WINDOW_MS = 60_000;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

type CircuitState = 'closed' | 'open' | 'half-open';

type ExecutionKind = 'chat' | 'stream';

export interface EngineMetricsSnapshot {
  key: string;
  provider: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCostUsd: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  lastError?: string;
  circuitState: CircuitState;
  lastUpdated: number;
}

interface RateWindowState {
  windowStart: number;
  requests: number;
  tokens: number;
}

interface ExecutionResult<T> {
  engineKey: string;
  response: T;
}

export class EngineRuntime {
  private config: EngineConfig;
  private secrets: EngineSecrets;
  private adapterPromise: Promise<EngineAdapter> | null = null;
  private readonly rateQueue = new PQueue({ concurrency: 1 });
  private rateState: RateWindowState = { windowStart: Date.now(), requests: 0, tokens: 0 };
  private circuitState: CircuitState = 'closed';
  private lastFailureAt = 0;
  private failureCount = 0;
  private readonly latencies: number[] = [];
  private readonly LATENCY_SAMPLE_CAP = 100;
  private metrics: Omit<EngineMetricsSnapshot, 'p50LatencyMs' | 'p95LatencyMs'> = {
    key: '',
    provider: '',
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalCostUsd: 0,
    lastError: undefined,
    circuitState: 'closed',
    lastUpdated: Date.now()
  };

  constructor(config: EngineConfig, secrets: EngineSecrets) {
    this.config = config;
    this.secrets = secrets;
    this.metrics.key = config.key;
    this.metrics.provider = config.provider;
  }

  updateConfig(config: EngineConfig, secrets: EngineSecrets) {
    this.config = config;
    this.secrets = secrets;
    this.metrics.key = config.key;
    this.metrics.provider = config.provider;
    void this.shutdownAdapter();
    this.adapterPromise = null;
  }

  async shutdown(): Promise<void> {
    await this.shutdownAdapter();
  }

  async chat(request: ChatRequest, overrideModel?: string): Promise<ExecutionResult<ChatResponse>> {
    const prepared = this.prepareRequest(request, overrideModel);
    const adapter = await this.getAdapter();
    const execute = async () => adapter.chat(prepared);
    const response = await this.executeWithPolicies('chat', prepared, execute);
    return { engineKey: this.config.key, response };
  }

  async stream(
    request: ChatRequest,
    overrideModel?: string
  ): Promise<ExecutionResult<AsyncIterable<StreamEvent>>> {
    const prepared = this.prepareRequest(request, overrideModel);
    const adapter = await this.getAdapter();
    const execute = async () => adapter.stream(prepared);
    const response = await this.executeWithPolicies('stream', prepared, execute);
    return { engineKey: this.config.key, response };
  }

  getMetrics(): EngineMetricsSnapshot {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const percentile = (p: number) => {
      if (sorted.length === 0) {
        return null;
      }
      const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
      return sorted[index];
    };

    return {
      ...this.metrics,
      circuitState: this.circuitState,
      p50LatencyMs: percentile(50),
      p95LatencyMs: percentile(95)
    };
  }

  private async getAdapter(): Promise<EngineAdapter> {
    if (!this.adapterPromise) {
      this.adapterPromise = Promise.resolve(createEngineAdapter(this.config, this.secrets));
    }
    return this.adapterPromise;
  }

  private async shutdownAdapter() {
    if (!this.adapterPromise) {
      return;
    }
    try {
      const adapter = await this.adapterPromise;
      await adapter.shutdown?.();
    } catch (error) {
      // Swallow shutdown errors but keep log signal via metrics
      this.metrics.lastError = `Shutdown failed: ${(error as Error)?.message ?? 'unknown error'}`;
    } finally {
      this.adapterPromise = null;
    }
  }

  private prepareRequest(request: ChatRequest, overrideModel?: string): ChatRequest {
    const model = this.resolveModel(overrideModel, request.metadata?.model);
    const maxTokens = this.resolveMaxTokens(request.max_tokens);
    const temperature = request.temperature ?? this.config.temperature;
    const topP = request.top_p ?? this.config.top_p;

    return {
      ...request,
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
      metadata: {
        ...request.metadata,
        model
      }
    };
  }

  private resolveModel(...candidates: Array<string | undefined>): string {
    const incoming = candidates.find(Boolean);
    if (!this.config.models || this.config.models.length === 0) {
      return incoming ?? this.config.model;
    }

    if (incoming) {
      const exists = this.config.models.some(model => model.name === incoming);
      if (!exists) {
        throw new EngineExecutionError(`Model ${incoming} is not configured for engine ${this.config.key}`, {
          engineKey: this.config.key,
          provider: this.config.provider,
          retryable: false,
          fallbackEligible: false
        });
      }
      return incoming;
    }

    const preferred = this.config.models.find(model => model.default) ?? this.config.models[0];
    return preferred?.name ?? this.config.model;
  }

  private resolveMaxTokens(requestMax?: number): number | undefined {
    if (!requestMax && !this.config.max_output_tokens) {
      return undefined;
    }
    if (!requestMax) {
      return this.config.max_output_tokens;
    }
    if (!this.config.max_output_tokens) {
      return requestMax;
    }
    return Math.min(requestMax, this.config.max_output_tokens);
  }

  private async executeWithPolicies<T>(
    kind: ExecutionKind,
    request: ChatRequest,
    operation: () => Promise<T>
  ): Promise<T> {
    await this.ensureCircuitAllowsExecution();
    await this.applyRateLimit(request);

    const retry = this.config.retry ?? { attempts: 0, initialDelayMs: 200, multiplier: 2 };
    const attempts = Math.max(0, retry.attempts);
    let attempt = 0;
    let delayMs = retry.initialDelayMs ?? 200;

    while (true) {
      attempt += 1;
      const start = Date.now();
      try {
        const result = await operation();
        this.recordSuccess(Date.now() - start, request, kind, result);
        return result;
      } catch (error) {
        const wrapped = this.normalizeError(error as Error);
        this.recordFailure(wrapped);

        const shouldRetry = wrapped.retryable && attempt <= attempts;
        if (shouldRetry) {
          await delay(Math.min(delayMs, retry.maxDelayMs ?? delayMs));
          delayMs = Math.min(delayMs * (retry.multiplier ?? 2), retry.maxDelayMs ?? delayMs * 2);
          await this.ensureCircuitAllowsExecution();
          continue;
        }

        throw wrapped;
      }
    }
  }

  private async ensureCircuitAllowsExecution(): Promise<void> {
    if (!this.config.circuit_breaker) {
      return;
    }
    const now = Date.now();
    if (this.circuitState === 'open') {
      const { cooldownMs, halfOpenAfterMs } = this.config.circuit_breaker;
      const waitMs = Math.max(cooldownMs, halfOpenAfterMs);
      if (now - this.lastFailureAt < waitMs) {
        throw new EngineCircuitOpenError(this.config.key, this.config.provider);
      }
      this.circuitState = 'half-open';
    }
  }

  private async applyRateLimit(request: ChatRequest): Promise<void> {
    const limits = this.config.rate_limit;
    if (!limits || (!limits.requestsPerMinute && !limits.tokensPerMinute)) {
      return;
    }

    await this.rateQueue.add(async () => {
      const now = Date.now();
      if (now - this.rateState.windowStart >= WINDOW_MS) {
        this.rateState = { windowStart: now, requests: 0, tokens: 0 };
      }

      const estimatedTokens = this.estimateTokenUsage(request);

      const { requestsPerMinute, tokensPerMinute } = limits;
      const wouldExceedRequests =
        requestsPerMinute !== undefined && this.rateState.requests >= requestsPerMinute;
      const wouldExceedTokens =
        tokensPerMinute !== undefined && this.rateState.tokens + estimatedTokens > tokensPerMinute;

      if (wouldExceedRequests || wouldExceedTokens) {
        const waitMs = Math.max(MIN_RATE_DELAY_MS, this.rateState.windowStart + WINDOW_MS - now);
        await delay(waitMs);
        this.rateState = { windowStart: Date.now(), requests: 0, tokens: 0 };
      }

      this.rateState.requests += 1;
      this.rateState.tokens += estimatedTokens;
    });
  }

  private estimateTokenUsage(request: ChatRequest): number {
    const promptTokens = estimateMessagesTokenCount(request.messages);
    const plannedCompletion = request.max_tokens ?? this.config.max_output_tokens ?? 0;
    return promptTokens + plannedCompletion;
  }

  private recordSuccess(durationMs: number, request: ChatRequest, kind: ExecutionKind, result: unknown) {
    this.failureCount = 0;
    if (this.circuitState !== 'closed') {
      this.circuitState = 'closed';
    }
    this.metrics.circuitState = this.circuitState;

    this.metrics.totalRequests += 1;
    this.metrics.successfulRequests += 1;
    this.metrics.lastUpdated = Date.now();

    if (kind === 'chat' && this.isChatResponse(result)) {
      const usage = result.usage;
      if (usage) {
        this.metrics.totalPromptTokens += usage.prompt_tokens ?? 0;
        this.metrics.totalCompletionTokens += usage.completion_tokens ?? 0;
        this.metrics.totalCostUsd += this.calculateCost(usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0);
      }
    }

    this.latencies.push(durationMs);
    if (this.latencies.length > this.LATENCY_SAMPLE_CAP) {
      this.latencies.splice(0, this.latencies.length - this.LATENCY_SAMPLE_CAP);
    }
  }

  private recordFailure(error: EngineExecutionError) {
    this.metrics.totalRequests += 1;
    this.metrics.failedRequests += 1;
    this.metrics.lastUpdated = Date.now();
    this.metrics.lastError = error.message;
    this.lastFailureAt = Date.now();

    if (this.config.circuit_breaker) {
      this.failureCount += 1;
      if (this.failureCount >= this.config.circuit_breaker.errorThreshold) {
        this.circuitState = 'open';
      }
    }
    this.metrics.circuitState = this.circuitState;
  }

  private calculateCost(promptTokens: number, completionTokens: number): number {
    if (!this.config.cost) {
      return 0;
    }
    const promptCost = this.config.cost.prompt ?? 0;
    const completionCost = this.config.cost.completion ?? 0;
    return (promptTokens / 1000) * promptCost + (completionTokens / 1000) * completionCost;
  }

  private isChatResponse(result: unknown): result is ChatResponse {
    return Boolean(result && typeof result === 'object' && 'finish_reason' in (result as Record<string, unknown>));
  }

  private normalizeError(error: Error): EngineExecutionError {
    const base: EngineExecutionError =
      error instanceof EngineExecutionError
        ? error
        : new EngineExecutionError(error.message || 'Engine execution failed', {
            engineKey: this.config.key,
            provider: this.config.provider,
            originalError: error
          });

    if (error instanceof EngineExecutionError) {
      return error;
    }

    if (isAxiosError(error)) {
      const status = error.response?.status;
      const code = error.code;
      const retryable =
        status === 408 ||
        status === 409 ||
        status === 425 ||
        status === 429 ||
        (status !== undefined && status >= 500) ||
        ['ECONNRESET', 'ENETUNREACH', 'ETIMEDOUT', 'ECONNABORTED'].includes(code ?? '');

      const fallbackEligible = retryable || status === 401 || status === 403;

      return new EngineExecutionError(error.message, {
        engineKey: this.config.key,
        provider: this.config.provider,
        statusCode: status,
        retryable,
        fallbackEligible,
        originalError: error
      });
    }

    return new EngineExecutionError(base.message, {
      engineKey: this.config.key,
      provider: this.config.provider,
      retryable: false,
      fallbackEligible: false,
      originalError: error
    });
  }
}
