/**
 * HarvestPageHelpers - Helper functions extracted from HarvestPage
 * Pure functions with no side effects for better performance and testability
 */

export const parseNumericId = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const digits = value.match(/\d+/g);
    if (digits && digits.length > 0) {
      const parsed = parseInt(digits[digits.length - 1], 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
};

export const derivePaneId = (agent: any, index: number): number | undefined => {
  if (!agent) {
    return index;
  }

  if (typeof agent.paneId === 'number' && Number.isFinite(agent.paneId)) {
    return agent.paneId;
  }

  if (typeof agent.pane === 'string') {
    const paneValue = parseNumericId(agent.pane);
    if (paneValue !== undefined) {
      return paneValue;
    }
  }

  if (typeof agent.agentNumber === 'number' && Number.isFinite(agent.agentNumber)) {
    return Math.max(0, agent.agentNumber - 1);
  }

  const fallbackId = parseNumericId(agent.id || agent.uid || agent.agentId);
  if (fallbackId !== undefined) {
    return fallbackId;
  }

  return index;
};

export const deriveAgentNumber = (agent: any, index: number): number => {
  if (typeof agent?.agentNumber === 'number' && Number.isFinite(agent.agentNumber)) {
    return agent.agentNumber;
  }

  const paneId = derivePaneId(agent, index);
  if (paneId !== undefined) {
    return paneId + 1;
  }

  return index + 1;
};

export const parseAgentData = (agent: any): Record<string, any> | null => {
  if (!agent) {
    return null;
  }

  if (typeof agent === 'string') {
    try {
      return JSON.parse(agent);
    } catch {
      return null;
    }
  }

  if (typeof agent === 'object') {
    return agent as Record<string, any>;
  }

  return null;
};

export const clampPercentage = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, value));
};

export const computeMemoryUsage = (agent: Record<string, any> | null): number => {
  if (!agent) {
    return 0;
  }

  const percent = agent.performance?.memoryUsage ??
    agent.resources?.memory?.percentage ??
    agent.resources?.memoryPercentage;

  if (typeof percent === 'number') {
    return clampPercentage(percent);
  }

  if (agent.resources?.memory?.used && agent.resources?.memory?.total) {
    const ratio = (agent.resources.memory.used / agent.resources.memory.total) * 100;
    return clampPercentage(ratio);
  }

  const rawValue = agent.resources?.memory?.usage ??
    agent.resources?.memoryUsage ??
    agent.memory ?? 0;

  if (typeof rawValue === 'number' && rawValue > 100) {
    return clampPercentage((rawValue / 4096) * 100);
  }

  return clampPercentage(rawValue || 0);
};

export const computeAgentMetrics = (agent: Record<string, any> | null) => {
  if (!agent) {
    return {
      cpu: 0,
      memory: 0,
      tasksCompleted: 0,
      successRate: 0,
      avgResponseTime: 1250
    };
  }

  const cpu = agent.performance?.cpuUsage ??
    agent.resources?.cpu?.usage ??
    agent.resources?.cpuUsage ??
    agent.cpu ??
    0;

  const memory = computeMemoryUsage(agent);

  const tasksCompleted = agent.metrics?.tasksCompleted ??
    agent.performance?.tasksCompleted ??
    0;

  const successRate = agent.metrics?.successRate ??
    agent.performance?.successRate ??
    0;

  const avgResponseTime = agent.performance?.avgResponseTime ?? 1250;

  return {
    cpu,
    memory,
    tasksCompleted,
    successRate,
    avgResponseTime
  };
};

type FrontendAgentStatus = 'initializing' | 'active' | 'processing' | 'idle' | 'error' | 'completed';

export const normalizeAgentStatus = (agent: Record<string, any> | null): FrontendAgentStatus => {
  if (!agent) {
    return 'idle';
  }

  const rawStatus = agent.status ??
    agent.state?.current ??
    agent.lifecycle?.state ??
    agent.lifecycle?.phase ??
    agent.state ??
    agent.lifecycle;

  const status = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : '';

  switch (status) {
    case 'initializing':
    case 'starting':
    case 'booting':
      return 'initializing';
    case 'processing':
    case 'working':
    case 'busy':
    case 'executing':
      return 'processing';
    case 'active':
    case 'running':
    case 'live':
      return 'active';
    case 'completed':
    case 'done':
    case 'finished':
      return 'completed';
    case 'error':
    case 'failed':
    case 'broken':
      return 'error';
    case 'idle':
    default:
      return 'idle';
  }
};

export const ensureUniqueName = (
  rawName: string | undefined,
  fallbackName: string,
  index: number,
  seen: Map<string, number>
): string => {
  const base = (rawName || fallbackName || '').trim();
  const key = base.toLowerCase();
  const count = seen.get(key) ?? 0;
  seen.set(key, count + 1);

  if (count === 0) {
    return base || fallbackName;
  }

  if (base === fallbackName) {
    return `${fallbackName}-${String(index + 1).padStart(2, '0')}`;
  }

  return `${base} #${count + 1}`;
};

export const extractPaneIndexFromCoordination = (agent: Record<string, any>): number | undefined => {
  if (!agent) {
    return undefined;
  }

  const candidates = [
    agent.paneIndex,
    agent.pane_id,
    agent.paneId,
    agent.agent_index,
    agent.agentIndex
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return (
    parseNumericId(agent.pane) ??
    parseNumericId(agent.id) ??
    parseNumericId(agent.uid) ??
    parseNumericId(agent.agent_id) ??
    parseNumericId(agent.agentId)
  );
};