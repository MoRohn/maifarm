import axios from 'axios';

export interface EngineCostSummaryResponse {
  success: boolean;
  summary: {
    totalCost: number;
    totalRequests: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  };
  byProvider: Array<{
    provider: string;
    totalCost: number;
    totalRequests: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    models: Array<{
      model: string;
      cost: number;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      period: string;
    }>;
  }>;
  details: Array<{
    provider: string;
    model: string;
    total_cost: string;
    request_count: string;
    total_input_tokens: string;
    total_output_tokens: string;
    period: string;
  }>;
  timestamp: string;
}

class EngineCostService {
  async fetchSummary(params?: { startDate?: string; endDate?: string; groupBy?: string }): Promise<EngineCostSummaryResponse> {
    const response = await axios.get('/api/ai-engines/costs', { params });
    if (!response.data?.success) {
      throw new Error('Failed to load engine cost summary');
    }
    return response.data as EngineCostSummaryResponse;
  }
}

export const engineCostService = new EngineCostService();
export type { EngineCostSummaryResponse };
