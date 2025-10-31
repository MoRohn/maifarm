import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { db } from '../database/connection';

export interface UniversalAgentMessage {
  version: '1.0';
  messageId: string;
  agentId: string;
  provider: string;
  messageType: 'work_claim' | 'status_update' | 'result' | 'coordination' | 'heartbeat';
  payload: {
    format: 'universal' | 'provider_specific';
    data: any;
  };
  timestamp: Date;
  signature?: string; // For message integrity
}

export interface WorkClaimPayload {
  taskId: string;
  taskType: string;
  claimedAt: Date;
  estimatedCompletion?: Date;
  dependencies?: string[];
}

export interface StatusUpdatePayload {
  status: 'idle' | 'working' | 'completed' | 'failed';
  currentTask?: string;
  progress?: number;
  metrics?: {
    tokensUsed: number;
    memoryUsage: number;
    cpuUsage: number;
  };
}

export interface ResultPayload {
  taskId: string;
  success: boolean;
  output?: any;
  error?: string;
  artifacts?: string[];
  duration: number;
}

export interface CoordinationPayload {
  action: 'request_help' | 'offer_help' | 'sync_state' | 'transfer_task';
  targetAgent?: string;
  data: any;
}

/**
 * Universal Agent Protocol for cross-provider communication
 */
export class UniversalAgentProtocol {
  private readonly VERSION = '1.0';
  private providerTranslators: Map<string, ProviderTranslator> = new Map();

  constructor() {
    this.registerTranslators();
  }

  /**
   * Register provider-specific translators
   */
  private registerTranslators(): void {
    // Claude translator
    this.providerTranslators.set('claude', new ClaudeTranslator());
    
    // Qwen translator
    this.providerTranslators.set('qwen', new QwenTranslator());
    
    // OpenAI translator
    this.providerTranslators.set('openai', new OpenAITranslator());
    
    // GPT-OSS translator
    this.providerTranslators.set('gpt_oss', new GptOssTranslator());

    logger.info('[UniversalAgentProtocol] Registered translators for all providers');
  }

  /**
   * Create a universal message
   */
  createMessage(
    agentId: string,
    provider: string,
    messageType: UniversalAgentMessage['messageType'],
    payload: any
  ): UniversalAgentMessage {
    return {
      version: this.VERSION,
      messageId: uuidv4(),
      agentId,
      provider,
      messageType,
      payload: {
        format: 'universal',
        data: payload
      },
      timestamp: new Date()
    };
  }

  /**
   * Translate provider-specific message to universal format
   */
  async translateToUniversal(providerMessage: any, provider: string): Promise<UniversalAgentMessage> {
    const translator = this.providerTranslators.get(provider);
    if (!translator) {
      throw new Error(`No translator registered for provider: ${provider}`);
    }

    try {
      const universal = await translator.toUniversal(providerMessage);
      
      // Validate message structure
      this.validateMessage(universal);
      
      // Log translation
      await this.logTranslation(universal.messageId, provider, 'to_universal');
      
      return universal;
    } catch (error) {
      logger.error(`[UniversalAgentProtocol] Failed to translate to universal from ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Translate universal message to provider-specific format
   */
  async translateFromUniversal(message: UniversalAgentMessage, targetProvider: string): Promise<any> {
    const translator = this.providerTranslators.get(targetProvider);
    if (!translator) {
      throw new Error(`No translator registered for provider: ${targetProvider}`);
    }

    try {
      const providerMessage = await translator.fromUniversal(message);
      
      // Log translation
      await this.logTranslation(message.messageId, targetProvider, 'from_universal');
      
      return providerMessage;
    } catch (error) {
      logger.error(`[UniversalAgentProtocol] Failed to translate from universal to ${targetProvider}:`, error);
      throw error;
    }
  }

  /**
   * Validate message structure
   */
  private validateMessage(message: UniversalAgentMessage): void {
    if (message.version !== this.VERSION) {
      throw new Error(`Invalid message version: ${message.version}`);
    }

    if (!message.messageId || !message.agentId || !message.provider) {
      throw new Error('Missing required message fields');
    }

    const validTypes = ['work_claim', 'status_update', 'result', 'coordination', 'heartbeat'];
    if (!validTypes.includes(message.messageType)) {
      throw new Error(`Invalid message type: ${message.messageType}`);
    }
  }

  /**
   * Log translation for debugging and auditing
   */
  private async logTranslation(messageId: string, provider: string, direction: string): Promise<void> {
    try {
      // Log to database for analysis
      await db.query(
        `INSERT INTO protocol_translations (message_id, provider, direction, timestamp)
         VALUES ($1, $2, $3, NOW())`,
        [messageId, provider, direction]
      );
    } catch (error) {
      // Non-critical error, just log
      logger.warn('[UniversalAgentProtocol] Failed to log translation:', error);
    }
  }

  /**
   * Bridge messages between two different providers
   */
  async bridgeMessage(
    message: any,
    fromProvider: string,
    toProvider: string
  ): Promise<any> {
    // Translate to universal format
    const universal = await this.translateToUniversal(message, fromProvider);
    
    // Translate to target provider format
    const targetMessage = await this.translateFromUniversal(universal, toProvider);
    
    // Store bridged message for tracking
    await this.storeBridgedMessage(universal, fromProvider, toProvider);
    
    return targetMessage;
  }

  /**
   * Store bridged message in database
   */
  private async storeBridgedMessage(
    message: UniversalAgentMessage,
    fromProvider: string,
    toProvider: string
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO cross_provider_messages 
         (message_id, farm_id, from_agent_id, from_provider, to_provider, 
          message_type, universal_format, delivered, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, false, NOW())`,
        [
          message.messageId,
          'unknown', // Would be extracted from context
          message.agentId,
          fromProvider,
          toProvider,
          message.messageType,
          JSON.stringify(message)
        ]
      );
    } catch (error) {
      logger.error('[UniversalAgentProtocol] Failed to store bridged message:', error);
    }
  }
}

/**
 * Base class for provider translators
 */
abstract class ProviderTranslator {
  abstract toUniversal(providerMessage: any): Promise<UniversalAgentMessage>;
  abstract fromUniversal(message: UniversalAgentMessage): Promise<any>;
}

/**
 * Claude-specific translator
 */
class ClaudeTranslator extends ProviderTranslator {
  async toUniversal(claudeMessage: any): Promise<UniversalAgentMessage> {
    // Claude uses file-based coordination
    const messageType = this.detectClaudeMessageType(claudeMessage);
    
    return {
      version: '1.0',
      messageId: claudeMessage.id || uuidv4(),
      agentId: claudeMessage.agent_id || claudeMessage.agentId,
      provider: 'claude',
      messageType,
      payload: {
        format: 'universal',
        data: this.extractClaudePayload(claudeMessage, messageType)
      },
      timestamp: new Date(claudeMessage.timestamp || Date.now())
    };
  }

  async fromUniversal(message: UniversalAgentMessage): Promise<any> {
    // Convert to Claude's file-based format
    return {
      agent_id: message.agentId,
      type: this.mapToClaudeType(message.messageType),
      data: message.payload.data,
      timestamp: message.timestamp.toISOString()
    };
  }

  private detectClaudeMessageType(message: any): UniversalAgentMessage['messageType'] {
    if (message.type === 'work_claim' || message.action === 'claim') {
      return 'work_claim';
    } else if (message.type === 'status' || message.status) {
      return 'status_update';
    } else if (message.type === 'result' || message.output) {
      return 'result';
    } else {
      return 'coordination';
    }
  }

  private extractClaudePayload(message: any, messageType: string): any {
    switch (messageType) {
      case 'work_claim':
        return {
          taskId: message.task_id || message.taskId,
          taskType: message.task_type || 'general',
          claimedAt: new Date(message.claimed_at || Date.now())
        };
      
      case 'status_update':
        return {
          status: message.status,
          currentTask: message.current_task,
          progress: message.progress || 0
        };
      
      case 'result':
        return {
          taskId: message.task_id,
          success: message.success !== false,
          output: message.output || message.result,
          duration: message.duration || 0
        };
      
      default:
        return message.data || {};
    }
  }

  private mapToClaudeType(messageType: string): string {
    const mapping = {
      'work_claim': 'work_claim',
      'status_update': 'status',
      'result': 'result',
      'coordination': 'coordination',
      'heartbeat': 'heartbeat'
    };
    return mapping[messageType] || 'unknown';
  }
}

/**
 * Qwen-specific translator
 */
class QwenTranslator extends ProviderTranslator {
  async toUniversal(qwenMessage: any): Promise<UniversalAgentMessage> {
    return {
      version: '1.0',
      messageId: qwenMessage.msg_id || uuidv4(),
      agentId: qwenMessage.agent_id,
      provider: 'qwen',
      messageType: this.detectQwenMessageType(qwenMessage),
      payload: {
        format: 'universal',
        data: this.extractQwenPayload(qwenMessage)
      },
      timestamp: new Date(qwenMessage.ts || Date.now())
    };
  }

  async fromUniversal(message: UniversalAgentMessage): Promise<any> {
    return {
      msg_id: message.messageId,
      agent_id: message.agentId,
      msg_type: this.mapToQwenType(message.messageType),
      payload: message.payload.data,
      ts: message.timestamp.getTime()
    };
  }

  private detectQwenMessageType(message: any): UniversalAgentMessage['messageType'] {
    const typeMap = {
      'task_claim': 'work_claim',
      'status': 'status_update',
      'completion': 'result',
      'sync': 'coordination'
    };
    return typeMap[message.msg_type] || 'coordination';
  }

  private extractQwenPayload(message: any): any {
    return message.payload || message.data || {};
  }

  private mapToQwenType(messageType: string): string {
    const mapping = {
      'work_claim': 'task_claim',
      'status_update': 'status',
      'result': 'completion',
      'coordination': 'sync',
      'heartbeat': 'ping'
    };
    return mapping[messageType] || 'unknown';
  }
}

/**
 * OpenAI-specific translator
 */
class OpenAITranslator extends ProviderTranslator {
  async toUniversal(openaiMessage: any): Promise<UniversalAgentMessage> {
    return {
      version: '1.0',
      messageId: openaiMessage.id || uuidv4(),
      agentId: openaiMessage.assistant_id || openaiMessage.agent_id,
      provider: 'openai',
      messageType: this.detectOpenAIMessageType(openaiMessage),
      payload: {
        format: 'universal',
        data: this.extractOpenAIPayload(openaiMessage)
      },
      timestamp: new Date(openaiMessage.created_at || Date.now())
    };
  }

  async fromUniversal(message: UniversalAgentMessage): Promise<any> {
    return {
      id: message.messageId,
      assistant_id: message.agentId,
      event_type: this.mapToOpenAIType(message.messageType),
      data: message.payload.data,
      created_at: message.timestamp.toISOString()
    };
  }

  private detectOpenAIMessageType(message: any): UniversalAgentMessage['messageType'] {
    if (message.event_type === 'task.claimed') {
      return 'work_claim';
    } else if (message.event_type === 'status.changed') {
      return 'status_update';
    } else if (message.event_type === 'task.completed') {
      return 'result';
    } else {
      return 'coordination';
    }
  }

  private extractOpenAIPayload(message: any): any {
    return message.data || {};
  }

  private mapToOpenAIType(messageType: string): string {
    const mapping = {
      'work_claim': 'task.claimed',
      'status_update': 'status.changed',
      'result': 'task.completed',
      'coordination': 'coordination.message',
      'heartbeat': 'health.check'
    };
    return mapping[messageType] || 'unknown';
  }
}

/**
 * GPT-OSS-specific translator
 */
class GptOssTranslator extends ProviderTranslator {
  async toUniversal(gptOssMessage: any): Promise<UniversalAgentMessage> {
    return {
      version: '1.0',
      messageId: gptOssMessage.uuid || uuidv4(),
      agentId: gptOssMessage.worker_id,
      provider: 'gpt_oss',
      messageType: this.detectGptOssMessageType(gptOssMessage),
      payload: {
        format: 'universal',
        data: gptOssMessage.content || {}
      },
      timestamp: new Date(gptOssMessage.timestamp || Date.now())
    };
  }

  async fromUniversal(message: UniversalAgentMessage): Promise<any> {
    return {
      uuid: message.messageId,
      worker_id: message.agentId,
      message_class: this.mapToGptOssClass(message.messageType),
      content: message.payload.data,
      timestamp: message.timestamp.getTime()
    };
  }

  private detectGptOssMessageType(message: any): UniversalAgentMessage['messageType'] {
    const classMap = {
      'claim': 'work_claim',
      'update': 'status_update',
      'output': 'result',
      'coordinate': 'coordination'
    };
    return classMap[message.message_class] || 'coordination';
  }

  private mapToGptOssClass(messageType: string): string {
    const mapping = {
      'work_claim': 'claim',
      'status_update': 'update',
      'result': 'output',
      'coordination': 'coordinate',
      'heartbeat': 'heartbeat'
    };
    return mapping[messageType] || 'unknown';
  }
}

// Export singleton instance
export const universalAgentProtocol = new UniversalAgentProtocol();