import { BarnItem } from '../types/barn';

export function unwrapBarnApiPayload<T>(payload: any): T | null {
  if (payload == null) {
    return null;
  }

  if (Array.isArray(payload)) {
    return payload as T;
  }

  if (typeof payload === 'object') {
    if ('data' in payload) {
      return unwrapBarnApiPayload<T>((payload as any).data);
    }
    return payload as T;
  }

  return payload as T;
}

export function normalizeBarnItem(item: any): BarnItem {
  const artifacts = Array.isArray(item.yield) && item.yield.length > 0
    ? item.yield
    : item.artifacts || [];
  const normalizedArtifacts = artifacts.map((artifact: any) => ({
    ...artifact,
    location: artifact.location || artifact.path || '',
  }));

  const description = typeof item.description === 'string'
    ? item.description
    : item.description?.text ?? '';

  const metadata = {
    agentCount: item.metadata?.agentCount ?? 0,
    taskCount: item.metadata?.taskCount ?? 0,
    duration: item.metadata?.duration ?? 0,
    successRate: item.metadata?.successRate ?? 0,
    resourceUsage: item.metadata?.resourceUsage ?? undefined,
  };

  const config = item.config ?? {};

  return {
    ...item,
    description,
    createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
    updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date(),
    lastUsedAt: item.lastUsedAt ? new Date(item.lastUsedAt) : undefined,
    tags: Array.isArray(item.tags) ? item.tags : [],
    metadata,
    config,
    artifacts: normalizedArtifacts,
    yield: normalizedArtifacts,
  } as BarnItem;
}
