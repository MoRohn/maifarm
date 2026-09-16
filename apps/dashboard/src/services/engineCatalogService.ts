import axios from 'axios';
import type { EngineAnalyticsMetric } from '@/types/analytics';

export interface EngineCatalogEntry {
  key: string;
  provider: string;
  label: string;
  models: Array<{
    name: string;
    label?: string;
    default?: boolean;
    description?: string;
    max_output_tokens?: number;
  }>;
  defaultModel: string;
  supportsTools: string;
  stream: boolean;
  fallback?: string[];
  hasApiKey: boolean;
  maxContext?: number | string;
  metadata?: Record<string, unknown>;
  cost?: {
    prompt?: number;
    completion?: number;
  };
  rateLimit?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
  };
  features?: Record<string, unknown>;
}

class EngineCatalogService {
  async fetchCatalog(): Promise<EngineCatalogEntry[]> {
    const response = await axios.get('/api/engines/catalog');
    if (!response.data?.success) {
      throw new Error('Failed to load engine catalog');
    }
    return response.data.engines as EngineCatalogEntry[];
  }

  async fetchMetrics(): Promise<EngineAnalyticsMetric[]> {
    const response = await axios.get('/api/engines/metrics');
    if (!response.data?.success) {
      throw new Error('Failed to load engine metrics');
    }
    return response.data.metrics as EngineAnalyticsMetric[];
  }
}

export const engineCatalogService = new EngineCatalogService();
export type EngineMetricsEntry = EngineAnalyticsMetric;
