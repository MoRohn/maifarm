/**
 * Context Manager for AI Providers
 * Handles large context windows and session management for Qwen3-Coder and Claude
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

interface ContextSession {
  id: string;
  farmId: string;
  provider: 'claude' | 'qwen';
  createdAt: Date;
  lastAccessed: Date;
  tokenCount: number;
  maxTokens: number;
  messages: ContextMessage[];
  metadata: Record<string, any>;
}

interface ContextMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: Date;
  tokenCount: number;
  attachments?: ContextAttachment[];
}

interface ContextAttachment {
  type: 'file' | 'image';
  path: string;
  content?: string;
  tokenCount: number;
}

interface ContextWindow {
  provider: 'claude' | 'qwen';
  standard: number;
  large: number;
  maximum: number;
}

export class ContextManager extends EventEmitter {
  private sessions: Map<string, ContextSession> = new Map();
  private sessionPath = '/tmp/maifarm_contexts';
  
  // Provider-specific context windows (in tokens)
  private contextWindows: Record<'claude' | 'qwen', ContextWindow> = {
    claude: {
      standard: 200000,
      large: 200000,
      maximum: 200000
    },
    qwen: {
      standard: 256000,
      large: 512000,
      maximum: 1000000 // 1M tokens theoretical maximum
    }
  };

  constructor() {
    super();
    this.initialize();
  }

  private async initialize() {
    try {
      await fs.mkdir(this.sessionPath, { recursive: true });
      // Load existing sessions
      await this.loadSessions();
    } catch (error) {
      console.error('Failed to initialize ContextManager:', error);
    }
  }

  /**
   * Create a new context session
   */
  async createSession(
    farmId: string, 
    provider: 'claude' | 'qwen',
    options?: {
      windowSize?: 'standard' | 'large' | 'maximum';
      metadata?: Record<string, any>;
    }
  ): Promise<ContextSession> {
    const sessionId = `${farmId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const windowSize = options?.windowSize || 'standard';
    
    const session: ContextSession = {
      id: sessionId,
      farmId,
      provider,
      createdAt: new Date(),
      lastAccessed: new Date(),
      tokenCount: 0,
      maxTokens: this.contextWindows[provider][windowSize],
      messages: [],
      metadata: options?.metadata || {}
    };

    this.sessions.set(sessionId, session);
    await this.persistSession(session);
    
    this.emit('session:created', { sessionId, farmId, provider });
    return session;
  }

  /**
   * Add a message to the context
   */
  async addMessage(
    sessionId: string,
    message: Omit<ContextMessage, 'timestamp' | 'tokenCount'>
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Estimate token count (rough approximation: 1 token ≈ 4 chars)
    const tokenCount = Math.ceil(message.content.length / 4);
    
    // Add attachment tokens if any
    let totalTokens = tokenCount;
    if (message.attachments) {
      for (const attachment of message.attachments) {
        totalTokens += attachment.tokenCount;
      }
    }

    // Check if adding this message would exceed the limit
    if (session.tokenCount + totalTokens > session.maxTokens) {
      // Implement sliding window - remove oldest messages
      await this.compressContext(sessionId, totalTokens);
    }

    const contextMessage: ContextMessage = {
      ...message,
      timestamp: new Date(),
      tokenCount: totalTokens
    };

    session.messages.push(contextMessage);
    session.tokenCount += totalTokens;
    session.lastAccessed = new Date();

    await this.persistSession(session);
    this.emit('message:added', { sessionId, tokenCount: totalTokens });
  }

  /**
   * Compress context by removing old messages or summarizing
   */
  private async compressContext(sessionId: string, requiredTokens: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Strategy 1: Remove oldest messages until we have enough space
    let tokensToFree = requiredTokens - (session.maxTokens - session.tokenCount);
    let messagesRemoved = 0;

    while (tokensToFree > 0 && session.messages.length > 1) {
      const oldestMessage = session.messages.shift();
      if (oldestMessage) {
        tokensToFree -= oldestMessage.tokenCount;
        session.tokenCount -= oldestMessage.tokenCount;
        messagesRemoved++;
      }
    }

    // Strategy 2: If still not enough space, summarize older messages
    if (tokensToFree > 0 && session.provider === 'qwen') {
      // Qwen can handle larger contexts, so we can be more aggressive
      await this.summarizeOldMessages(sessionId);
    }

    this.emit('context:compressed', { 
      sessionId, 
      messagesRemoved, 
      newTokenCount: session.tokenCount 
    });
  }

  /**
   * Summarize old messages to save tokens (Qwen-specific optimization)
   */
  private async summarizeOldMessages(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.messages.length < 10) return;

    // Take first 50% of messages for summarization
    const midpoint = Math.floor(session.messages.length / 2);
    const messagesToSummarize = session.messages.slice(0, midpoint);
    
    // Create a summary (in production, this would call the AI API)
    const summary: ContextMessage = {
      role: 'system',
      content: `[Summary of previous ${messagesToSummarize.length} messages: Key points discussed include task initialization, agent coordination, and progress updates. Total tokens saved: ${messagesToSummarize.reduce((sum, m) => sum + m.tokenCount, 0)}]`,
      timestamp: new Date(),
      tokenCount: 100 // Approximate
    };

    // Replace old messages with summary
    const remainingMessages = session.messages.slice(midpoint);
    session.messages = [summary, ...remainingMessages];
    
    // Recalculate token count
    session.tokenCount = session.messages.reduce((sum, m) => sum + m.tokenCount, 0);
  }

  /**
   * Get context for sending to AI provider
   */
  async getContext(sessionId: string, options?: {
    maxMessages?: number;
    includeSystem?: boolean;
  }): Promise<ContextMessage[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    let messages = [...session.messages];
    
    // Filter system messages if requested
    if (options?.includeSystem === false) {
      messages = messages.filter(m => m.role !== 'system');
    }

    // Limit messages if requested
    if (options?.maxMessages) {
      messages = messages.slice(-options.maxMessages);
    }

    session.lastAccessed = new Date();
    return messages;
  }

  /**
   * Reset session context (equivalent to Claude's /clear)
   */
  async resetSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.messages = [];
    session.tokenCount = 0;
    session.lastAccessed = new Date();

    await this.persistSession(session);
    this.emit('session:reset', { sessionId });
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): {
    tokenCount: number;
    maxTokens: number;
    utilization: number;
    messageCount: number;
    oldestMessage?: Date;
    newestMessage?: Date;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      tokenCount: session.tokenCount,
      maxTokens: session.maxTokens,
      utilization: (session.tokenCount / session.maxTokens) * 100,
      messageCount: session.messages.length,
      oldestMessage: session.messages[0]?.timestamp,
      newestMessage: session.messages[session.messages.length - 1]?.timestamp
    };
  }

  /**
   * Optimize context for provider
   */
  async optimizeForProvider(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.provider === 'qwen') {
      // Qwen-specific optimizations
      // 1. Reorder messages for better coherence
      // 2. Add chain-of-thought markers
      // 3. Optimize for larger context utilization
      
      for (let i = 0; i < session.messages.length; i++) {
        const message = session.messages[i];
        if (message.role === 'user' && !message.content.includes('step by step')) {
          // Add chain-of-thought hint for complex tasks
          if (message.tokenCount > 200) {
            message.content = `${message.content}\n\nPlease think through this step by step.`;
            message.tokenCount += 10;
          }
        }
      }
    } else if (session.provider === 'claude') {
      // Claude-specific optimizations
      // Keep context more focused and concise
      if (session.tokenCount > session.maxTokens * 0.8) {
        await this.compressContext(sessionId, session.maxTokens * 0.2);
      }
    }

    await this.persistSession(session);
  }

  /**
   * Persist session to disk
   */
  private async persistSession(session: ContextSession): Promise<void> {
    const sessionFile = path.join(this.sessionPath, `${session.id}.json`);
    await fs.writeFile(sessionFile, JSON.stringify(session, null, 2));
  }

  /**
   * Load sessions from disk
   */
  private async loadSessions(): Promise<void> {
    try {
      const files = await fs.readdir(this.sessionPath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = await fs.readFile(path.join(this.sessionPath, file), 'utf-8');
          const session = JSON.parse(content) as ContextSession;
          // Convert date strings back to Date objects
          session.createdAt = new Date(session.createdAt);
          session.lastAccessed = new Date(session.lastAccessed);
          session.messages.forEach(m => {
            m.timestamp = new Date(m.timestamp);
          });
          this.sessions.set(session.id, session);
        }
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  }

  /**
   * Clean up old sessions
   */
  async cleanupOldSessions(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
    const now = Date.now();
    const sessionsToDelete: string[] = [];

    for (const [id, session] of this.sessions) {
      if (now - session.lastAccessed.getTime() > maxAge) {
        sessionsToDelete.push(id);
      }
    }

    for (const id of sessionsToDelete) {
      this.sessions.delete(id);
      const sessionFile = path.join(this.sessionPath, `${id}.json`);
      await fs.unlink(sessionFile).catch(() => {});
    }

    if (sessionsToDelete.length > 0) {
      this.emit('sessions:cleaned', { count: sessionsToDelete.length });
    }
  }

  /**
   * Get provider capabilities
   */
  getProviderCapabilities(provider: 'claude' | 'qwen'): ContextWindow {
    return this.contextWindows[provider];
  }
}

// Export singleton instance
export const contextManager = new ContextManager();