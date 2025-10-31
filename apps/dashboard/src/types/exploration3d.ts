import { Vector3 } from 'three';

export interface ExplorationNode {
  id: string;
  agentId: string;
  agentName: string;
  position: Vector3;
  timestamp: number;
  taskType: 'exploration' | 'analysis' | 'generation' | 'validation' | 'execution';
  status: 'pending' | 'active' | 'completed' | 'failed';
  progress: number;
  connections: string[];
  metadata: {
    description: string;
    resourceUsage?: {
      cpu: number;
      memory: number;
      network: number;
    };
    output?: any;
    error?: string;
  };
}

export interface ExplorationPath {
  id: string;
  farmId: string;
  nodes: ExplorationNode[];
  startTime: number;
  endTime?: number;
  status: 'active' | 'completed' | 'paused' | 'failed';
  metrics: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    averageTaskTime: number;
    resourceEfficiency: number;
  };
}

export interface CameraState {
  position: Vector3;
  target: Vector3;
  zoom: number;
}

export interface VisualizationSettings {
  showLabels: boolean;
  showConnections: boolean;
  showResourceMetrics: boolean;
  animationSpeed: number;
  particleEffects: boolean;
  autoRotate: boolean;
  colorScheme: 'status' | 'agent' | 'taskType' | 'performance';
}

export interface TaskGenerationConfig {
  maxConcurrentTasks: number;
  taskPriorities: {
    exploration: number;
    analysis: number;
    generation: number;
    validation: number;
    execution: number;
  };
  loadBalancingStrategy: 'roundRobin' | 'leastLoaded' | 'priority' | 'adaptive';
  resourceLimits: {
    cpuThreshold: number;
    memoryThreshold: number;
    networkThreshold: number;
  };
}