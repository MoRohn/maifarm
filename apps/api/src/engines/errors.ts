export interface EngineErrorOptions {
  engineKey: string;
  provider?: string;
  statusCode?: number;
  retryable?: boolean;
  fallbackEligible?: boolean;
  originalError?: unknown;
}

export class EngineExecutionError extends Error {
  readonly engineKey: string;
  readonly provider?: string;
  readonly statusCode?: number;
  readonly retryable: boolean;
  readonly fallbackEligible: boolean;
  readonly originalError?: unknown;

  constructor(message: string, options: EngineErrorOptions) {
    super(message);
    this.name = 'EngineExecutionError';
    this.engineKey = options.engineKey;
    this.provider = options.provider;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
    this.fallbackEligible = options.fallbackEligible ?? false;
    this.originalError = options.originalError;
  }
}

export class EngineCircuitOpenError extends EngineExecutionError {
  constructor(engineKey: string, provider?: string) {
    super('Circuit breaker is open for engine', {
      engineKey,
      provider,
      retryable: false,
      fallbackEligible: true
    });
    this.name = 'EngineCircuitOpenError';
  }
}

