export interface ExplorationNode {
  id: string;
  label: string;
  type: 'idea' | 'solution' | 'discovery' | 'branch';
  timestamp: Date;
  agentId: string;
  parentId?: string;
  children: string[];
  content: string;
  confidence: number;
  creativity: number;
  position?: {
    x: number;
    y: number;
    z: number;
  };
}

export interface ExplorationPath {
  nodes: ExplorationNode[];
  edges: ExplorationEdge[];
  startTime: Date;
  currentNodeId: string;
  discoveries: Discovery[];
}

export interface ExplorationEdge {
  source: string;
  target: string;
  weight: number;
  type: 'explore' | 'backtrack' | 'leap';
}

export interface Discovery {
  id: string;
  nodeId: string;
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  category: string;
  timestamp: Date;
  saved: boolean;
}

export interface GoWildConfig {
  creativityLevel: number; // 0-100
  explorationDepth: number; // 1-10
  maxDuration: number; // minutes
  boundaries: {
    allowExternalAPIs: boolean;
    allowFileSystem: boolean;
    allowNetworkRequests: boolean;
    restrictedDomains: string[];
  };
  focusAreas: string[];
}

export interface GoWildSession {
  id: string;
  farmId: string;
  config: GoWildConfig;
  status: 'idle' | 'exploring' | 'paused' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  pausedAt?: Date;
  harvestId?: string;
  explorationPath: {
    nodes: ExplorationNode[];
    edges: ExplorationEdge[];
    discoveries: Discovery[];
    currentNodeId: string | null;
  };
  stats: {
    nodesExplored: number;
    discoveriesMade: number;
    backtrackCount: number;
    averageCreativity: number;
  };
  summary?: {
    sessionId: string;
    farmId: string;
    duration: number;
    stats: any;
    discoveries: number;
    savedDiscoveries: number;
    totalNodes: number;
    completedAt: string;
  };
  discoveries?: Discovery[];
  totalTasks?: number;
  completedTasks?: number;
}

export interface GoWildUpdate {
  type: 'node-added' | 'discovery-made' | 'path-changed' | 'status-changed';
  sessionId: string;
  data: any;
  timestamp: Date;
}

export interface ExplorationSummary {
  sessionId: string;
  farmId: string;
  duration: number;
  stats: {
    nodesExplored: number;
    discoveriesMade: number;
    backtrackCount: number;
    averageCreativity: number;
  };
  discoveries: number;
  savedDiscoveries: number;
}

export interface EmergencyStopResult {
  sessionId: string;
  status: 'stopped' | 'error';
  summary?: ExplorationSummary;
  error?: string;
}