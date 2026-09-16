import { 
  Harvest, 
  HarvestFilter, 
  HarvestExport, 
  HarvestSummary,
  HarvestYield,
  HarvestInsight
} from '@/types/harvest';
import apiClient from './apiClient';
import { websocketService } from './websocket/websocketService';

declare const module: any;

const generateId = (): string => {
  const cryptoObj = (globalThis as any)?.crypto;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }
  return `yield-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const parseResult = (result: any): Harvest['results'][number] => ({
  id: result.id || generateId(),
  agentId: result.agentId || '',
  agentName: result.agentName || result.agentId || 'Agent',
  agentType: result.agentType || 'agent',
  taskType: result.taskType || 'task',
  content: result.content || '',
  metadata: result.metadata || {},
  timestamp: result.timestamp ? new Date(result.timestamp) : new Date(),
  processingTime: result.processingTime ?? 0,
  success: result.success ?? true,
  error: result.error
});

const parseInsight = (insight: any): HarvestInsight => ({
  id: insight.id || generateId(),
  type: insight.type || 'summary',
  title: insight.title || insight.id || 'Insight',
  description: insight.description ?? insight.content ?? '',
  importance: insight.importance || 'medium',
  source: insight.source || {},
  relatedResults: insight.relatedResults || [],
  timestamp: insight.timestamp ? new Date(insight.timestamp) : new Date()
});

const parseYieldItem = (item: any): HarvestYield => ({
  id: item.id || generateId(),
  type: item.type || 'file',
  name: item.name || item.filename || item.id || 'Yield Item',
  description: item.description || item.summary || '',
  mimeType: item.mimeType,
  size: item.size,
  location: item.location,
  checksum: item.checksum,
  data: item.data ?? item.content,
  createdBy: item.createdBy,
  createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
  metadata: item.metadata || {}
});

class HarvestServiceImpl {
  private baseUrl = '/api/harvest';
  private harvestCache = new Map<string, Harvest>();

  constructor() {
    // Subscribe to harvest-related WebSocket events
    this.subscribeToEvents();
  }

  private subscribeToEvents() {
    websocketService.on('harvest:started', this.handleHarvestStarted.bind(this));
    websocketService.on('harvest:progress', this.handleHarvestProgress.bind(this));
    websocketService.on('harvest:completed', this.handleHarvestCompleted.bind(this));
  }

  private handleHarvestStarted(data: any) {
    // Could update local state or emit events to UI
    console.log('Harvest started:', data);
  }

  private handleHarvestProgress(data: any) {
    // Update progress in UI
    console.log('Harvest progress:', data);
  }

  private handleHarvestCompleted(data: any) {
    // Refresh harvests list or show notification
    console.log('Harvest completed:', data);
  }

  async getAll(filter?: HarvestFilter): Promise<Harvest[]> {
    const params = new URLSearchParams();
    
    if (filter) {
      if (filter.farmId) params.append('farmId', filter.farmId);
      if (filter.status?.length) params.append('status', filter.status.join(','));
      if (filter.tags?.length) params.append('tags', filter.tags.join(','));
      if (filter.qualityThreshold) params.append('qualityThreshold', String(filter.qualityThreshold));
      if (filter.searchQuery) params.append('search', filter.searchQuery);
      if (filter.dateRange) {
        params.append('startDate', filter.dateRange.start.toISOString());
        params.append('endDate', filter.dateRange.end.toISOString());
      }
    }

    const queryString = params.toString();
    const url = queryString ? `${this.baseUrl}?${queryString}` : this.baseUrl;
    
    const response = await apiClient.get<any>(url);
    const raw = this.unwrapResponse<any[]>(response, []);
    return raw.map(harvest => this.parseHarvest(harvest));
  }

  async getSummaries(): Promise<HarvestSummary[]> {
    const response = await apiClient.get<any>(`${this.baseUrl}/summaries`);
    const summaries = this.unwrapResponse<any[]>(response, []);
    return summaries.map(summary => ({
      ...summary,
      completedAt: new Date(summary.completedAt),
      topInsights: summary.topInsights.map(insight => ({
        ...insight,
        timestamp: new Date(insight.timestamp)
      }))
    }));
  }

  async getById(id: string): Promise<Harvest> {
    const cached = this.harvestCache.get(id);
    if (cached) {
      return this.cloneHarvest(cached);
    }

    const response = await apiClient.get<any>(`${this.baseUrl}/${id}`);
    const parsed = this.parseHarvest(this.unwrapResponse(response));
    this.harvestCache.set(parsed.id, parsed);
    return this.cloneHarvest(parsed);
  }

  // Alias for getById - some components expect this method name
  async getHarvest(id: string): Promise<Harvest> {
    return this.getById(id);
  }

  async getByFarmId(farmId: string): Promise<Harvest[]> {
    const response = await apiClient.get<any>(`${this.baseUrl}/farms/${farmId}`);
    const harvests = this.unwrapResponse<any[]>(response, []);
    return harvests.map(harvest => this.parseHarvest(harvest));
  }

  async startHarvest(farmId: string, farmName: string): Promise<Harvest> {
    const response = await apiClient.post<any>(
      `/api/harvest/farms/${farmId}/harvest`,
      { farmName }
    );
    const parsed = this.parseHarvest(this.unwrapResponse(response));
    this.harvestCache.set(parsed.id, parsed);
    return this.cloneHarvest(parsed);
  }

  async exportHarvest(exportConfig: HarvestExport): Promise<Blob> {
    const response = await apiClient.post(
      `${this.baseUrl}/${exportConfig.harvestId}/export`,
      exportConfig,
      { responseType: 'blob' }
    );
    return response.data;
  }

  async completeHarvest(id: string): Promise<Harvest> {
    const response = await apiClient.post<any>(`${this.baseUrl}/${id}/complete`);
    const parsed = this.parseHarvest(this.unwrapResponse(response));
    this.harvestCache.delete(parsed.id);
    return this.cloneHarvest(parsed);
  }

  async deleteHarvest(id: string): Promise<void> {
    await apiClient.delete(`${this.baseUrl}/${id}`);
    this.harvestCache.delete(id);
  }

  async updateHarvestTags(id: string, tags: string[]): Promise<Harvest> {
    const response = await apiClient.patch<any>(`${this.baseUrl}/${id}/tags`, { tags });
    const parsed = this.parseHarvest(this.unwrapResponse(response));
    this.harvestCache.set(parsed.id, parsed);
    return this.cloneHarvest(parsed);
  }

  async batchDelete(ids: string[]): Promise<{ deleted: number; failed: number }> {
    const response = await apiClient.post<any>(`${this.baseUrl}/batch/delete`, { ids });
    ids.forEach(id => this.harvestCache.delete(id));
    return this.unwrapResponse<{ deleted: number; failed: number }>(response, { deleted: 0, failed: 0 });
  }

  async batchUpdateStatus(ids: string[], status: string): Promise<{ updated: number; failed: number }> {
    const response = await apiClient.post<any>(`${this.baseUrl}/batch/status`, { ids, status });
    ids.forEach(id => this.harvestCache.delete(id));
    return this.unwrapResponse<{ updated: number; failed: number }>(response, { updated: 0, failed: 0 });
  }

  private parseHarvest(harvest: any): Harvest {
    if (!harvest) {
      throw new Error('Harvest not found');
    }

    const createdAt = harvest.createdAt ? new Date(harvest.createdAt) : new Date();
    const startedAt = harvest.startedAt === null
      ? null
      : harvest.startedAt
        ? new Date(harvest.startedAt)
        : undefined;
    const completedAt = harvest.completedAt === null
      ? null
      : harvest.completedAt
        ? new Date(harvest.completedAt)
        : undefined;

    const results: Harvest['results'] = (harvest.results || []).map(parseResult);

    let insights: Harvest['insights'] = (harvest.insights || []).map(parseInsight);

    const yieldPayload = harvest.yield;
    const yieldMetrics = !Array.isArray(yieldPayload) && typeof yieldPayload === 'object'
      ? yieldPayload.metrics
      : undefined;
    let yieldItems: HarvestYield[] = [];

    if (Array.isArray(yieldPayload)) {
      yieldItems = yieldPayload.map(parseYieldItem);
    } else if (yieldPayload && typeof yieldPayload === 'object') {
      const artifacts = Array.isArray(yieldPayload.artifacts) ? yieldPayload.artifacts : [];
      yieldItems = artifacts.map(parseYieldItem);

      if (Array.isArray(yieldPayload.insights)) {
        const yieldInsights = yieldPayload.insights.map(parseInsight);
        insights = [...insights, ...yieldInsights];
      }
    }

    const topLevelArtifacts = Array.isArray(harvest.artifacts)
      ? harvest.artifacts.map(parseYieldItem)
      : [];

    const combinedArtifacts = [...yieldItems];
    topLevelArtifacts.forEach(item => {
      if (!combinedArtifacts.some(existing => existing.id === item.id)) {
        combinedArtifacts.push(item);
      }
    });

    const defaultSummary = {
      description: '',
      totalFiles: 0,
      filesGenerated: 0,
      filesFailed: 0,
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      duration: 0,
      efficiency: 0,
      agents: [],
      fileCategories: {
        text: 0,
        code: 0,
        image: 0,
        data: 0,
        config: 0,
        other: 0
      }
    };

    const quality = {
      completeness: harvest.quality?.completeness ?? 0,
      accuracy: harvest.quality?.accuracy ?? 0,
      relevance: harvest.quality?.relevance ?? 0,
      overallScore: harvest.quality?.overallScore
        ?? yieldMetrics?.qualityScore
        ?? 0
    };

    return {
      id: harvest.id,
      farmId: harvest.farmId,
      farmName: harvest.farmName || '',
      name: harvest.name || 'Harvest',
      description: harvest.description || '',
      type: harvest.type || 'workflow',
      status: harvest.status || 'processing',
      createdAt,
      startedAt,
      completedAt,
      useCount: harvest.useCount ?? 0,
      summary: {
        ...defaultSummary,
        ...(harvest.summary || {}),
        fileCategories: {
          ...defaultSummary.fileCategories,
          ...(harvest.summary?.fileCategories || {})
        }
      },
      farmConfig: harvest.farmConfig,
      results,
      insights,
      yield: yieldItems.length ? yieldItems : combinedArtifacts,
      artifacts: combinedArtifacts,
      quality,
      tags: harvest.tags || [],
      farmerTemplateId: harvest.farmerTemplateId,
      farmerTemplateName: harvest.farmerTemplateName,
      exportFormats: harvest.exportFormats || ['json']
    };
  }

  // Helper method to download harvest export
  async downloadExport(harvestId: string, format: HarvestExport['format'] = 'json'): Promise<void> {
    const exportConfig: HarvestExport = {
      harvestId,
      format,
      includeResults: true,
      includeInsights: true,
      includeArtifacts: true,
      includeYield: true
    };

    const blob = await this.exportHarvest(exportConfig);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `harvest-${harvestId}.${format}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  // Monitor harvest progress
  subscribeToHarvest(harvestId: string, callback: (progress: number, summary: any) => void) {
    const handler = (data: any) => {
      if (data.harvestId === harvestId) {
        callback(data.progress, data.summary);
      }
    };
    
    websocketService.on('harvest:progress', handler);
    
    // Return unsubscribe function
    return () => {
      websocketService.off('harvest:progress', handler);
    };
  }

  // ===== Coordination API Methods =====

  async getCoordinationAgents(farmId?: string): Promise<any[]> {
    const params = farmId ? `?farmId=${encodeURIComponent(farmId)}` : '';
    const response = await apiClient.get(`${this.baseUrl}/coordination/agents${params}`);
    return response.data.data || [];
  }

  async getWorkClaims(): Promise<any[]> {
    const response = await apiClient.get(`${this.baseUrl}/coordination/claims`);
    return response.data.data || [];
  }

  async getCompletedWork(): Promise<any[]> {
    const response = await apiClient.get(`${this.baseUrl}/coordination/completed`);
    return response.data.data || [];
  }

  async createHarvestReport(farmId: string, results: any[]): Promise<any> {
    const response = await apiClient.post(`${this.baseUrl}/coordination/harvest`, {
      farmId,
      results
    });
    return response.data.data;
  }

  async getHarvestReports(farmId?: string): Promise<any[]> {
    const params = farmId ? `?farmId=${farmId}` : '';
    const response = await apiClient.get(`${this.baseUrl}/coordination/reports${params}`);
    return response.data.data || [];
  }

  async updateAgentStatus(agentId: string, status: string, metrics?: any): Promise<void> {
    await apiClient.put(`${this.baseUrl}/coordination/agents/${agentId}/status`, {
      status,
      metrics
    });
  }

  // ===== Additional Methods =====

  async markAsViewed(harvestId: string): Promise<void> {
    await apiClient.put(`${this.baseUrl}/${harvestId}/viewed`);
  }

  async downloadYield(harvestId: string, yieldId: string): Promise<void> {
    const response = await apiClient.get(
      `${this.baseUrl}/${harvestId}/yield/${yieldId}/download`,
      { responseType: 'blob' }
    );

    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `yield_${yieldId}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  // ===== Terminal API Methods =====

  async getTerminalSessions(): Promise<any[]> {
    const response = await apiClient.get(`${this.baseUrl}/terminal/sessions`);
    return response.data.data || [];
  }

  async getTerminalOutput(sessionName: string, agentId: string, lines: number = 100): Promise<any> {
    const response = await apiClient.get(
      `${this.baseUrl}/terminal/${sessionName}/${agentId}?lines=${lines}`
    );
    return response.data.data;
  }

  async sendTerminalCommand(sessionName: string, agentId: string, command: string): Promise<any> {
    const response = await apiClient.post(
      `${this.baseUrl}/terminal/${sessionName}/${agentId}/command`,
      { command }
    );
    return response.data;
  }

  // ===== Real-time harvest monitoring =====

  joinHarvestRoom(farmId: string) {
    // Only emit if WebSocket is connected
    if (websocketService.connected) {
      websocketService.emit('harvest:join', { farmId });
    }
  }

  leaveHarvestRoom(farmId: string) {
    // Only emit if WebSocket is connected
    if (websocketService.connected) {
      websocketService.emit('harvest:leave', { farmId });
    }
  }

  requestTerminalOutput(sessionName: string, agentId: string, lines?: number) {
    // Only emit if WebSocket is connected
    if (websocketService.connected) {
      websocketService.emit('harvest:terminal:request', {
        sessionName,
        agentId,
        lines
      });
    }
  }

  sendTerminalCommandRealtime(sessionName: string, agentId: string, command: string) {
    // Only emit if WebSocket is connected
    if (websocketService.connected) {
      websocketService.emit('harvest:terminal:command', {
        sessionName,
        agentId,
        command
      });
    }
  }

  // Subscribe to harvest updates
  onHarvestUpdate(callback: (update: any) => void) {
    websocketService.on('harvest:update', callback);
    return () => websocketService.off('harvest:update', callback);
  }

  onAgentsUpdate(callback: (agents: any[]) => void) {
    websocketService.on('harvest:agents:update', callback);
    return () => websocketService.off('harvest:agents:update', callback);
  }

  onWorkCompleted(callback: (completed: any[]) => void) {
    websocketService.on('harvest:work:completed', callback);
    return () => websocketService.off('harvest:work:completed', callback);
  }

  onTerminalOutput(callback: (output: any) => void) {
    websocketService.on('harvest:terminal:output', callback);
    return () => websocketService.off('harvest:terminal:output', callback);
  }

  onInitialData(callback: (data: any) => void) {
    websocketService.on('harvest:initial:data', callback);
    return () => websocketService.off('harvest:initial:data', callback);
  }

  private unwrapResponse<T>(response: any, fallback?: T): T {
    if (!response) {
      if (fallback !== undefined) return fallback;
      throw new Error('Invalid response');
    }
    if (response.data && response.data.data !== undefined) {
      return response.data.data;
    }
    if (response.data !== undefined) {
      return response.data;
    }
    if (fallback !== undefined) {
      return fallback;
    }
    return response;
  }

  private cloneHarvest(harvest: Harvest): Harvest {
    return {
      ...harvest,
      summary: {
        ...harvest.summary,
        fileCategories: {
          ...harvest.summary.fileCategories
        }
      },
      results: harvest.results.map(result => ({
        ...result,
        metadata: { ...result.metadata }
      })),
      insights: harvest.insights.map(insight => ({
        ...insight,
        source: { ...insight.source }
      })),
      yield: harvest.yield.map(item => ({
        ...item,
        metadata: item.metadata ? { ...item.metadata } : undefined,
        createdBy: item.createdBy ? { ...item.createdBy } : undefined
      })),
      quality: { ...harvest.quality }
    };
  }
}

export { HarvestServiceImpl as HarvestService };
export type { HarvestServiceImpl as HarvestServiceType };
export const harvestService = new HarvestServiceImpl();

if (typeof module !== 'undefined' && module?.exports) {
  module.exports.HarvestService = HarvestServiceImpl;
  module.exports.harvestService = harvestService;
}
