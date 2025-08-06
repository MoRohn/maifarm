import { EventEmitter } from 'events';
import { aiProviderManager, AIProvider, AIProviderConfig } from '../config/aiProviders';
import { aiProxy } from './aiProxy';
import { websocketManager } from '../websocket/websocketManager';
import { farmManager } from './farmManager';
import { costTrackingService } from './costTrackingService';

/**
 * AI Orchestrator Service
 * Unified service for managing AI providers (Claude and Qwen)
 * Coordinates between farms, agents, and AI APIs
 */

export interface AITaskRequest {
  farmId: string;
  agentId: string;
  taskId: string;
  prompt: string;
  context?: string[];
  provider?: 'claude' | 'qwen';
  metadata?: Record<string, any>;
}

export interface AITaskResponse {
  taskId: string;
  response: string;
  provider: 'claude' | 'qwen';
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  timestamp: Date;
}

export interface ProviderStatus {
  provider: 'claude' | 'qwen';
  available: boolean;
  config: AIProviderConfig;
  activeRequests: number;
  totalRequests: number;
  lastError?: string;
  lastCheck: Date;
}

class AIOrchestrator extends EventEmitter {
  private activeRequests: Map<string, AITaskRequest> = new Map();
  private providerStats: Map<'claude' | 'qwen', { requests: number; errors: number }> = new Map();
  private healthCheckInterval: NodeJS.Timer | null = null;

  constructor() {
    super();
    this.initialize();
  }

  private initialize() {
    // Initialize provider stats
    this.providerStats.set('claude', { requests: 0, errors: 0 });
    this.providerStats.set('qwen', { requests: 0, errors: 0 });

    // Start health monitoring
    this.startHealthMonitoring();

    // Listen for provider changes
    aiProxy.on('provider:changed', (provider: AIProviderConfig) => {
      this.emit('provider:changed', provider);
      websocketManager.broadcast({
        type: 'ai:provider:changed',
        payload: {
          provider: provider.type,
          name: provider.name,
          enabled: provider.enabled
        }
      });
    });
  }

  private startHealthMonitoring() {
    // Check provider health every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      const providers: AIProvider[] = [AIProvider.CLAUDE, AIProvider.QWEN];
      
      for (const provider of providers) {
        if (aiProviderManager.isProviderEnabled(provider)) {
          try {
            const available = await this.checkProviderHealth(provider);
            if (!available) {
              console.warn(`[AIOrchestrator] Provider ${provider} health check failed`);
              this.emit('provider:unhealthy', provider);
            }
          } catch (error) {
            console.error(`[AIOrchestrator] Error checking ${provider} health:`, error);
          }
        }
      }
    }, 30000);
  }

  /**
   * Submit a task to the AI provider
   */
  async submitTask(request: AITaskRequest): Promise<AITaskResponse> {
    const taskId = request.taskId;
    this.activeRequests.set(taskId, request);

    try {
      // Determine which provider to use
      const provider = request.provider || aiProviderManager.getDefaultProvider();
      
      // Check if provider is available
      const providerEnum = provider === 'claude' ? AIProvider.CLAUDE : AIProvider.QWEN;
      if (!aiProviderManager.isProviderEnabled(providerEnum)) {
        throw new Error(`Provider ${provider} is not available or configured`);
      }

      // Update stats
      const stats = this.providerStats.get(provider)!;
      stats.requests++;

      // Prepare the unified request
      const aiRequest = {
        messages: [
          {
            role: 'user' as const,
            content: request.prompt
          }
        ],
        metadata: {
          farmId: request.farmId,
          agentId: request.agentId,
          taskId: request.taskId,
          ...request.metadata
        }
      };

      // Add context if provided
      if (request.context && request.context.length > 0) {
        aiRequest.messages.unshift({
          role: 'system' as const,
          content: `Context:\n${request.context.join('\n\n')}`
        });
      }

      // Send request through AI proxy
      const response = await aiProxy.sendRequest(aiRequest);

      // Prepare task response
      const taskResponse: AITaskResponse = {
        taskId,
        response: response.content,
        provider: response.provider,
        model: response.model,
        usage: response.usage,
        timestamp: new Date()
      };

      // Track token usage and costs
      if (response.usage) {
        await costTrackingService.trackTokenUsage({
          inputTokens: response.usage.promptTokens || 0,
          outputTokens: response.usage.completionTokens || 0,
          totalTokens: response.usage.totalTokens || 0,
          model: response.model,
          provider: response.provider as AIProvider,
          timestamp: new Date(),
          taskId,
          farmId: request.farmId,
          agentId: request.agentId
        });
      }

      // Emit success event
      this.emit('task:completed', taskResponse);
      
      // Broadcast to WebSocket clients
      websocketManager.broadcast({
        type: 'ai:task:completed',
        payload: {
          farmId: request.farmId,
          agentId: request.agentId,
          taskId,
          provider: response.provider,
          usage: response.usage
        }
      });

      return taskResponse;
    } catch (error) {
      // Update error stats
      const provider = request.provider || aiProviderManager.getDefaultProvider();
      const stats = this.providerStats.get(provider)!;
      stats.errors++;

      // Emit error event
      this.emit('task:error', { taskId, error });
      
      // Broadcast error
      websocketManager.broadcast({
        type: 'ai:task:error',
        payload: {
          farmId: request.farmId,
          agentId: request.agentId,
          taskId,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });

      throw error;
    } finally {
      this.activeRequests.delete(taskId);
    }
  }

  /**
   * Stream a task response
   */
  async streamTask(
    request: AITaskRequest,
    onChunk: (chunk: string) => void,
    onComplete?: (response: AITaskResponse) => void
  ): Promise<void> {
    const taskId = request.taskId;
    this.activeRequests.set(taskId, request);

    try {
      const provider = request.provider || aiProviderManager.getDefaultProvider();
      const providerEnum = provider === 'claude' ? AIProvider.CLAUDE : AIProvider.QWEN;
      
      if (!aiProviderManager.isProviderEnabled(providerEnum)) {
        throw new Error(`Provider ${provider} is not available`);
      }

      const aiRequest = {
        messages: [
          {
            role: 'user' as const,
            content: request.prompt
          }
        ],
        metadata: {
          farmId: request.farmId,
          agentId: request.agentId,
          taskId: request.taskId
        }
      };

      let fullResponse = '';
      
      await aiProxy.streamRequest(
        aiRequest,
        (chunk: string) => {
          fullResponse += chunk;
          onChunk(chunk);
          
          // Broadcast chunk
          websocketManager.broadcast({
            type: 'ai:task:chunk',
            payload: {
              farmId: request.farmId,
              agentId: request.agentId,
              taskId,
              chunk
            }
          });
        },
        () => {
          if (onComplete) {
            const response: AITaskResponse = {
              taskId,
              response: fullResponse,
              provider: provider as 'claude' | 'qwen',
              model: aiProviderManager.getProvider(providerEnum).model || '',
              timestamp: new Date()
            };
            onComplete(response);
          }
        }
      );
    } finally {
      this.activeRequests.delete(taskId);
    }
  }

  /**
   * Switch the active AI provider for a specific farm
   */
  async switchFarmProvider(farmId: string, provider: 'claude' | 'qwen'): Promise<void> {
    // Check if provider is available
    const providerEnum = provider === 'claude' ? AIProvider.CLAUDE : AIProvider.QWEN;
    if (!aiProviderManager.isProviderEnabled(providerEnum)) {
      throw new Error(`Provider ${provider} is not available or configured`);
    }

    // Update farm configuration
    const farm = await farmManager.getFarm(farmId, 'system');
    if (!farm) {
      throw new Error(`Farm ${farmId} not found`);
    }

    // Update farm config with new provider
    await farmManager.updateFarm(farmId, 'system', {
      config: {
        ...farm.config,
        provider
      }
    });

    // Emit provider switch event
    this.emit('farm:provider:switched', { farmId, provider });
    
    // Broadcast the change
    websocketManager.broadcast({
      type: 'farm:provider:switched',
      payload: {
        farmId,
        provider,
        timestamp: new Date()
      }
    });
  }

  /**
   * Get provider status
   */
  async getProviderStatus(provider: 'claude' | 'qwen'): Promise<ProviderStatus> {
    const providerEnum = provider === 'claude' ? AIProvider.CLAUDE : AIProvider.QWEN;
    const config = aiProviderManager.getProvider(providerEnum);
    const stats = this.providerStats.get(provider)!;
    const activeCount = Array.from(this.activeRequests.values())
      .filter(req => (req.provider || aiProviderManager.getDefaultProvider()) === provider).length;

    return {
      provider,
      available: aiProviderManager.isProviderEnabled(providerEnum),
      config: config as any,
      activeRequests: activeCount,
      totalRequests: stats.requests,
      lastCheck: new Date()
    };
  }

  /**
   * Get all provider statuses
   */
  async getAllProviderStatuses(): Promise<ProviderStatus[]> {
    return Promise.all([
      this.getProviderStatus('claude'),
      this.getProviderStatus('qwen')
    ]);
  }

  /**
   * Check provider health
   */
  private async checkProviderHealth(provider: AIProvider): Promise<boolean> {
    try {
      // Check if provider is enabled
      if (!aiProviderManager.isProviderEnabled(provider)) {
        return false;
      }
      
      // For now, just check if it's configured
      // In a real implementation, we'd ping the API
      return true;
    } catch (error) {
      console.error(`[AIOrchestrator] Provider ${provider} health check error:`, error);
      return false;
    }
  }

  /**
   * Get active requests
   */
  getActiveRequests(): AITaskRequest[] {
    return Array.from(this.activeRequests.values());
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string): boolean {
    if (this.activeRequests.has(taskId)) {
      this.activeRequests.delete(taskId);
      this.emit('task:cancelled', taskId);
      return true;
    }
    return false;
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.removeAllListeners();
  }
}

// Export singleton instance
export const aiOrchestrator = new AIOrchestrator();