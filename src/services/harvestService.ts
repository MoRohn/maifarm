import { 
  Harvest, 
  HarvestFilter, 
  HarvestExport, 
  HarvestSummary 
} from '../types/harvest';
import apiClient from './apiClient';
import { websocketService } from './websocket/websocketService';

class HarvestService {
  private baseUrl = '/api/harvest';

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
    
    const response = await apiClient.get<Harvest[]>(url);
    return response.data.map(harvest => this.parseHarvest(harvest));
  }

  async getSummaries(): Promise<HarvestSummary[]> {
    const response = await apiClient.get<HarvestSummary[]>(`${this.baseUrl}/summaries`);
    return response.data.map(summary => ({
      ...summary,
      completedAt: new Date(summary.completedAt),
      topInsights: summary.topInsights.map(insight => ({
        ...insight,
        timestamp: new Date(insight.timestamp)
      }))
    }));
  }

  async getById(id: string): Promise<Harvest> {
    const response = await apiClient.get<Harvest>(`${this.baseUrl}/${id}`);
    return this.parseHarvest(response.data);
  }

  async getByFarmId(farmId: string): Promise<Harvest[]> {
    const response = await apiClient.get<Harvest[]>(`${this.baseUrl}/farms/${farmId}`);
    return response.data.map(harvest => this.parseHarvest(harvest));
  }

  async startHarvest(farmId: string, farmName: string): Promise<Harvest> {
    const response = await apiClient.post<Harvest>(
      `/api/harvest/farms/${farmId}/harvest`,
      { farmName }
    );
    return this.parseHarvest(response.data);
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
    const response = await apiClient.post<Harvest>(`${this.baseUrl}/${id}/complete`);
    return this.parseHarvest(response.data);
  }

  private parseHarvest(harvest: any): Harvest {
    return {
      ...harvest,
      createdAt: new Date(harvest.createdAt),
      completedAt: harvest.completedAt ? new Date(harvest.completedAt) : undefined,
      results: harvest.results.map((result: any) => ({
        ...result,
        timestamp: new Date(result.timestamp)
      })),
      insights: harvest.insights.map((insight: any) => ({
        ...insight,
        timestamp: new Date(insight.timestamp)
      })),
      artifacts: harvest.artifacts.map((artifact: any) => ({
        ...artifact,
        createdAt: new Date(artifact.createdAt)
      }))
    };
  }

  // Helper method to download harvest export
  async downloadExport(harvestId: string, format: HarvestExport['format'] = 'json'): Promise<void> {
    const exportConfig: HarvestExport = {
      harvestId,
      format,
      includeResults: true,
      includeInsights: true,
      includeArtifacts: true
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

  async getCoordinationAgents(): Promise<any[]> {
    const response = await apiClient.get(`${this.baseUrl}/coordination/agents`);
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

  async downloadArtifact(harvestId: string, artifactId: string): Promise<void> {
    const response = await apiClient.get(
      `${this.baseUrl}/${harvestId}/artifacts/${artifactId}/download`,
      { responseType: 'blob' }
    );
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `artifact_${artifactId}`);
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
    websocketService.emit('harvest:join', { farmId });
  }

  leaveHarvestRoom(farmId: string) {
    websocketService.emit('harvest:leave', { farmId });
  }

  requestTerminalOutput(sessionName: string, agentId: string, lines?: number) {
    websocketService.emit('harvest:terminal:request', {
      sessionName,
      agentId,
      lines
    });
  }

  sendTerminalCommandRealtime(sessionName: string, agentId: string, command: string) {
    websocketService.emit('harvest:terminal:command', {
      sessionName,
      agentId,
      command
    });
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
}

export const harvestService = new HarvestService();