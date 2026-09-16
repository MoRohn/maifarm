export interface AgentConfiguration {
  maxConcurrentAgents?: number;
  maxAgents: number;
  staggerTime: number;
  defaultTimeout: number;
  retryAttempts?: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  autoRestart: boolean;
  healthCheckInterval?: number;
  resourceLimits?: {
    cpuThreshold: number;
    memoryThreshold: number;
    diskThreshold: number;
  };
  communicationProtocol?: 'websocket' | 'http' | 'grpc';
  parallelExecution: boolean;
  memoryLimit: number;
  cpuLimit: number;
  enableLogging: boolean;
  coordinationMode: 'centralized' | 'distributed' | 'hybrid';
  taskAllocation: 'round-robin' | 'load-balanced';
  failoverStrategy: 'restart' | 'reassign' | 'skip';
  agentMode: 'default' | 'supercharge' | 'ultrafarmer';
  defaultInterval: number;
}