// Enhanced Admin Testing Types

export type TestStatus = 'pending' | 'running' | 'success' | 'error' | 'warning' | 'skipped';
export type ErrorCategory = 'network' | 'validation' | 'timeout' | 'system' | 'api' | 'unknown';

export interface SubPhase {
  name: string;
  description: string;
  status: TestStatus;
  duration?: number;
  retries?: number;
  maxRetries?: number;
  error?: TestError;
}

export interface TestError {
  code?: string | number;
  message: string;
  category: ErrorCategory;
  stack?: string;
  context?: Record<string, any>;
  timestamp: string;
  retryAttempt?: number;
}

export interface TestPhase {
  id: string;
  name: string;
  icon: string;
  description: string;
  status: TestStatus;
  subPhases?: SubPhase[];
  canRunIndividually?: boolean;
  dependencies?: string[];
  estimatedDuration?: number;
}

export interface TestResult {
  phase: string;
  phaseId: string;
  success: boolean;
  duration: number;
  startTime: string;
  endTime: string;
  message?: string;
  error?: TestError;
  subResults?: SubPhaseResult[];
  metrics?: TestMetrics;
  apiResponses?: ApiResponseLog[];
}

export interface SubPhaseResult {
  name: string;
  success: boolean;
  duration: number;
  message?: string;
  error?: TestError;
  retries?: number;
}

export interface TestMetrics {
  memoryUsage?: number;
  responseTime?: number;
  apiCallCount?: number;
  retryCount?: number;
}

export interface ApiResponseLog {
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  timestamp: string;
  error?: string;
}

export interface TestConfiguration {
  verboseMode: boolean;
  enableRetries: boolean;
  maxRetries: number;
  timeout: number;
  runIndividualPhases: boolean;
  selectedPhases?: string[];
  environment: 'development' | 'staging' | 'production';
}

export interface TestSession {
  id: string;
  startTime: string;
  endTime?: string;
  totalDuration?: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  phases: TestResult[];
  configuration: TestConfiguration;
  overallSuccess: boolean;
  errorCount: number;
  warningCount: number;
}