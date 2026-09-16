/**
 * ConfidenzService - Dashboard service for confidence scoring
 *
 * Integrates with the backend confidenz API and WebSocket events
 * to provide real-time confidence data to dashboard components.
 *
 * @author Blerbz
 * @license MIT
 */

import apiClient from './apiClient';

export interface AgentConfidence {
  id: string;
  name: string;
  score: number;
  level: 'high' | 'medium' | 'low';
  shouldAutoContinue: boolean;
  timestamp: string;
}

export interface ConfidenceAggregate {
  average: number;
  min: number;
  max: number;
  level: 'high' | 'medium' | 'low';
  trend: 'improving' | 'declining' | 'stable';
}

export interface FarmConfidenceData {
  farmId: string;
  agents: AgentConfidence[];
  aggregate: ConfidenceAggregate;
  updatedAt: string;
}

export interface ConfidenceMetrics {
  farmId: string;
  currentScore: number;
  averageScore: number;
  minScore: number;
  maxScore: number;
  scoreCount: number;
  trend: 'improving' | 'declining' | 'stable';
  lastUpdated: string;
}

export interface ConfidenceHistory {
  farmId: string;
  agentId?: string;
  agentName?: string;
  score: number;
  level: 'high' | 'medium' | 'low';
  timestamp: string;
  sessionId?: string;
}

export interface CalculateConfidenceResponse {
  score: number;
  level: 'high' | 'medium' | 'low';
  wordCount: number;
}

class ConfidenzService {
  private readonly baseUrl = '/api/confidenz';

  /**
   * Get confidence data for a farm
   */
  async getFarmConfidence(farmId: string): Promise<{
    farmId: string;
    status: string;
    metrics: ConfidenceMetrics | null;
    agents: AgentConfidence[];
    coordination: {
      averageScore: number;
      minScore: number;
      maxScore: number;
      trend: 'improving' | 'declining' | 'stable';
      overallLevel: 'high' | 'medium' | 'low';
      updatedAt: string;
      agentCount: number;
    } | null;
  }> {
    const response = await apiClient.get(`${this.baseUrl}/${farmId}`);
    return response.data;
  }

  /**
   * Start confidence monitoring for a farm
   */
  async startMonitoring(farmId: string): Promise<{ status: string; farmId: string; message: string }> {
    const response = await apiClient.post(`${this.baseUrl}/${farmId}/start`);
    return response.data;
  }

  /**
   * Stop confidence monitoring for a farm
   */
  async stopMonitoring(farmId: string): Promise<{ status: string; farmId: string; message: string }> {
    const response = await apiClient.post(`${this.baseUrl}/${farmId}/stop`);
    return response.data;
  }

  /**
   * Get confidence history for a farm
   */
  async getHistory(farmId: string, limit = 50): Promise<{
    farmId: string;
    count: number;
    history: ConfidenceHistory[];
  }> {
    const response = await apiClient.get(`${this.baseUrl}/${farmId}/history`, {
      params: { limit },
    });
    return response.data;
  }

  /**
   * Record a confidence score (for testing or manual input)
   */
  async recordConfidence(
    farmId: string,
    data: {
      agentId?: string;
      agentName?: string;
      score: number;
      sessionId?: string;
    }
  ): Promise<{ status: string; confidence: ConfidenceHistory }> {
    const response = await apiClient.post(`${this.baseUrl}/${farmId}/record`, data);
    return response.data;
  }

  /**
   * Calculate confidence score from text
   */
  async calculateConfidence(text: string): Promise<CalculateConfidenceResponse> {
    const response = await apiClient.post(`${this.baseUrl}/calculate`, { text });
    return response.data;
  }

  /**
   * Clear confidence data for a farm
   */
  async clearFarmData(farmId: string): Promise<{ status: string; farmId: string }> {
    const response = await apiClient.delete(`${this.baseUrl}/${farmId}`);
    return response.data;
  }

  /**
   * Get confidence level color for UI display
   */
  getLevelColor(level: 'high' | 'medium' | 'low'): string {
    switch (level) {
      case 'high':
        return '#22c55e'; // green-500
      case 'medium':
        return '#f59e0b'; // amber-500
      case 'low':
        return '#ef4444'; // red-500
      default:
        return '#6b7280'; // gray-500
    }
  }

  /**
   * Get confidence level from score
   */
  getLevelFromScore(score: number): 'high' | 'medium' | 'low' {
    if (score >= 75) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  /**
   * Get trend icon for UI display
   */
  getTrendIcon(trend: 'improving' | 'declining' | 'stable'): string {
    switch (trend) {
      case 'improving':
        return '\u2191'; // Up arrow
      case 'declining':
        return '\u2193'; // Down arrow
      case 'stable':
        return '\u2192'; // Right arrow
      default:
        return '\u2192';
    }
  }

  /**
   * Format score for display
   */
  formatScore(score: number): string {
    return `${Math.round(score)}%`;
  }
}

// Singleton export
export const confidenzService = new ConfidenzService();
export default confidenzService;
