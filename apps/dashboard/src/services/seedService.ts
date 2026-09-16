import { Seed, SeedCreateInput, SeedUpdateInput, SeedFilter } from '@/types/seed';
import apiClient from './apiClient';

class SeedService {
  private baseUrl = '/api/seeds';

  async getAll(filter?: SeedFilter): Promise<Seed[]> {
    const params = new URLSearchParams();
    
    if (filter) {
      if (filter.category) params.append('category', filter.category);
      if (filter.farmType) params.append('farmType', filter.farmType);
      if (filter.tags?.length) params.append('tags', filter.tags.join(','));
      if (filter.search) params.append('search', filter.search);
      if (filter.isPublic !== undefined) params.append('isPublic', String(filter.isPublic));
      if (filter.isOfficial !== undefined) params.append('isOfficial', String(filter.isOfficial));
      if (filter.sortBy) params.append('sortBy', filter.sortBy);
      if (filter.sortOrder) params.append('sortOrder', filter.sortOrder);
      if (filter.limit !== undefined) params.append('limit', String(filter.limit));
    }

    const queryString = params.toString();
    const url = queryString ? `${this.baseUrl}?${queryString}` : this.baseUrl;
    
    const response = await apiClient.get<Seed[]>(url);
    return response.data.map(seed => ({
      ...seed,
      createdAt: new Date(seed.createdAt),
      updatedAt: new Date(seed.updatedAt),
      usage: {
        ...seed.usage,
        lastUsed: seed.usage.lastUsed ? new Date(seed.usage.lastUsed) : undefined
      }
    }));
  }

  async getById(id: string): Promise<Seed> {
    const response = await apiClient.get<Seed>(`${this.baseUrl}/${id}`);
    return {
      ...response.data,
      createdAt: new Date(response.data.createdAt),
      updatedAt: new Date(response.data.updatedAt),
      usage: {
        ...response.data.usage,
        lastUsed: response.data.usage.lastUsed ? new Date(response.data.usage.lastUsed) : undefined
      }
    };
  }

  async create(input: SeedCreateInput): Promise<Seed> {
    const response = await apiClient.post<Seed>(this.baseUrl, input);
    return {
      ...response.data,
      createdAt: new Date(response.data.createdAt),
      updatedAt: new Date(response.data.updatedAt)
    };
  }

  async createFromHarvest(harvestId: string, input: Partial<SeedCreateInput>): Promise<Seed> {
    const response = await apiClient.post<Seed>(
      `${this.baseUrl}/from-harvest/${harvestId}`,
      input
    );
    return {
      ...response.data,
      createdAt: new Date(response.data.createdAt),
      updatedAt: new Date(response.data.updatedAt)
    };
  }

  async update(id: string, input: SeedUpdateInput): Promise<Seed> {
    const response = await apiClient.put<Seed>(`${this.baseUrl}/${id}`, input);
    return {
      ...response.data,
      createdAt: new Date(response.data.createdAt),
      updatedAt: new Date(response.data.updatedAt),
      usage: {
        ...response.data.usage,
        lastUsed: response.data.usage.lastUsed ? new Date(response.data.usage.lastUsed) : undefined
      }
    };
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`${this.baseUrl}/${id}`);
  }

  async use(id: string): Promise<Seed> {
    const response = await apiClient.post<Seed>(`${this.baseUrl}/${id}/use`);
    return {
      ...response.data,
      createdAt: new Date(response.data.createdAt),
      updatedAt: new Date(response.data.updatedAt),
      usage: {
        ...response.data.usage,
        lastUsed: new Date(response.data.usage.lastUsed!)
      }
    };
  }

  async getCategories(): Promise<string[]> {
    const response = await apiClient.get<string[]>(`${this.baseUrl}/meta/categories`);
    return response.data;
  }

  // ============================================
  // SEEDS ENHANCEMENT METHODS (Feature A)
  // ============================================

  /**
   * Validate seed compatibility with mode and engine
   */
  async validateCompatibility(
    seedIds: string[],
    mode: string,
    engine: string
  ): Promise<{
    compatible: boolean;
    incompatibleSeeds: Array<{ seedId: string; reason: string }>;
    warnings: string[];
  }> {
    const response = await apiClient.post(`${this.baseUrl}/validate-compatibility`, {
      seedIds,
      mode,
      engine
    });
    return response.data;
  }

  /**
   * Get seeds applied to a farm
   */
  async getAppliedSeeds(farmId: string): Promise<Seed[]> {
    const response = await apiClient.get<{ seeds: Seed[] }>(
      `${this.baseUrl}/farm/${farmId}/applied`
    );
    return response.data.seeds || [];
  }

  // ============================================
  // VIRAL SEEDS METHODS (Feature B)
  // ============================================

  /**
   * Generate viral seeds from internet trends
   */
  async generateViralSeeds(config: {
    searchQueries?: string[];
    searchProvider?: 'websearch' | 'bing' | 'google';
    maxResultsPerQuery?: number;
    includeCategories?: string[];
    excludeCategories?: string[];
    creativityLevel?: number;
  }): Promise<{
    success: boolean;
    seeds?: Seed[];
    snapshotId?: string;
    error?: string;
  }> {
    const response = await apiClient.post(`${this.baseUrl}/viral/generate`, config);
    return response.data;
  }

  /**
   * Regenerate viral seeds from a snapshot
   */
  async regenerateViralSeeds(snapshotId: string): Promise<{
    success: boolean;
    seeds?: Seed[];
    snapshotId?: string;
    error?: string;
  }> {
    const response = await apiClient.post(`${this.baseUrl}/viral/regenerate/${snapshotId}`);
    return response.data;
  }

  /**
   * Get viral seeds generation snapshots
   */
  async getViralSnapshots(limit: number = 10): Promise<{
    success: boolean;
    snapshots: Array<{
      id: string;
      searchQueries: string[];
      seedCount: number;
      createdAt: Date;
    }>;
  }> {
    const response = await apiClient.get(`${this.baseUrl}/viral/snapshots?limit=${limit}`);
    return response.data;
  }

  /**
   * Check if viral seeds pipeline is running
   */
  async getViralPipelineStatus(): Promise<{ isRunning: boolean }> {
    const response = await apiClient.get(`${this.baseUrl}/viral/status`);
    return response.data;
  }

  // Helper method to convert seed YAML to farm configuration
  convertSeedToFarmConfig(seed: Seed): any {
    return {
      name: `Farm from ${seed.name}`,
      description: seed.description,
      type: seed.farmType,
      yaml: seed.yaml,
      seedId: seed.id,
      tags: seed.tags
    };
  }
}

export const seedService = new SeedService();