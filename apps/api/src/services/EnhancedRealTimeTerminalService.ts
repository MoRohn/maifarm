/**
 * Enhanced Real-Time Terminal Service
 *
 * Advanced terminal streaming service that provides:
 * - Ultra-low latency streaming (< 5ms)
 * - AI engine-specific output parsing
 * - Intelligent yield detection
 * - Clean, structured message formatting
 * - Multi-agent coordination
 * - Automatic recovery and health monitoring
 */

import { EventEmitter } from 'events';
import { exec, spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join, dirname, extname } from 'path';
import { FSWatcher, watch } from 'chokidar';
import { logger, LogCategory } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { pathConfig } from '../config/paths';
import { aiProviderManager, AIProvider } from '../config/aiProviders';
import { createHash } from 'crypto';

// ============================================================================
// Types & Interfaces
// ============================================================================

interface StreamConfig {
  farmId: string;
  agentId: string;
  agentIndex: number;
  agentName: string;
  sessionName: string;
  aiProvider: AIProvider;
  outputPath: string;
  workspacePath: string;
}

interface TerminalStream {
  config: StreamConfig;
  watcher?: FSWatcher;
  tailProcess?: ChildProcess;
  lastPosition: number;
  lastActivity: Date;
  isActive: boolean;
  buffer: string[];
  flushTimer?: NodeJS.Timeout;
  healthCheck?: NodeJS.Timeout;
  messageQueue: StructuredMessage[];
  yieldWatcher?: FSWatcher;
  detectedYields: Set<string>;
}

interface StructuredMessage {
  id: string;
  timestamp: Date;
  type: 'command' | 'output' | 'error' | 'system' | 'thinking' | 'result' | 'yield';
  level: 'info' | 'warning' | 'error' | 'success' | 'debug';
  source: 'agent' | 'system' | 'user';
  content: string;
  metadata?: {
    command?: string;
    exitCode?: number;
    duration?: number;
    filePath?: string;
    language?: string;
    lineCount?: number;
    byteSize?: number;
    aiProvider?: string;
    modelVersion?: string;
  };
  formatted?: string; // Pre-formatted for terminal display
}

interface YieldDetection {
  path: string;
  type: 'file' | 'code' | 'document' | 'artifact';
  name: string;
  size: number;
  language?: string;
  description?: string;
  relevance: number; // 0-1 score
  timestamp: Date;
}

// AI Provider-specific patterns for parsing
const AI_PROVIDER_PATTERNS = {
  [AIProvider.CLAUDE]: {
    thinking: /^(Thinking|Analyzing|Planning|Considering)[:\.]/i,
    command: /^(Running|Executing|>|$)\s*(.*)/,
    error: /^(Error|Failed|Exception|Warning)[:]/i,
    result: /^(Result|Output|Success|Completed)[:]/i,
    file: /^(Created|Modified|Wrote|Generated|Saved)\s+([^\s]+)/i
  },
  [AIProvider.OPENAI]: {
    thinking: /^(##?\s*Thinking|Analyzing|I'm going to|Let me)[:\.]/i,
    command: /^```(?:bash|shell|sh)?\n(.*?)```/ms,
    error: /^(⚠️|❌|Error|Failed)[:]/i,
    result: /^(✅|✓|Success|Done|Completed)[:]/i,
    file: /^(File created:|Updated file:|Generated:)\s*([^\s]+)/i
  },
  [AIProvider.GPT_OSS]: {
    thinking: /^(\[REASONING\]|\[ANALYSIS\]|Thinking)[:]/i,
    command: /^(\$|>|EXECUTE:)\s*(.*)/,
    error: /^(\[ERROR\]|\[FAIL\]|ERROR:)[:]/i,
    result: /^(\[SUCCESS\]|\[COMPLETE\]|RESULT:)[:]/i,
    file: /^(\[FILE\]|OUTPUT FILE:)\s*([^\s]+)/i
  },
  [AIProvider.LLAMA]: {
    thinking: /^(分析|思考|Planning|正在)[:：]/i,
    command: /^(执行|Run|>)\s*(.*)/,
    error: /^(错误|失败|Error|失敗)[:：]/i,
    result: /^(成功|完成|Success|完了)[:：]/i,
    file: /^(文件|File|生成)[:：]\s*([^\s]+)/i
  },
  [AIProvider.GROK]: {
    thinking: /^(Thinking|Analyzing|Processing|Let me think)[:\.]/i,
    command: /^(Running|Executing|>|$)\s*(.*)/,
    error: /^(Error|Failed|Exception|Warning)[:]/i,
    result: /^(Result|Output|Success|Completed)[:]/i,
    file: /^(Created|Modified|Wrote|Generated|Saved)\s+([^\s]+)/i
  }
};

// File extensions that indicate yield items
const YIELD_FILE_PATTERNS = {
  code: ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs', '.cpp', '.c', '.cs', '.rb', '.php', '.swift'],
  document: ['.md', '.txt', '.pdf', '.docx', '.doc', '.rtf', '.tex', '.org'],
  data: ['.json', '.yaml', '.yml', '.xml', '.csv', '.tsv', '.sql'],
  config: ['.env', '.ini', '.conf', '.cfg', '.toml', '.properties'],
  test: ['test.', 'spec.', '.test.', '.spec.'],
  build: ['.jar', '.war', '.dll', '.so', '.exe', '.wasm', '.min.js', '.min.css']
};

// ============================================================================
// Enhanced Real-Time Terminal Service
// ============================================================================

export class EnhancedRealTimeTerminalService extends EventEmitter {
  private static instance: EnhancedRealTimeTerminalService;
  private streams: Map<string, TerminalStream> = new Map();
  private readonly FLUSH_INTERVAL = 5; // 5ms for ultra-low latency
  private readonly HEALTH_CHECK_INTERVAL = 10000; // 10 seconds
  private readonly MAX_BUFFER_SIZE = 50; // Lines before force flush
  private readonly YIELD_SCAN_INTERVAL = 2000; // 2 seconds

  private constructor() {
    super();
    this.setupGlobalHealthMonitoring();
  }

  static getInstance(): EnhancedRealTimeTerminalService {
    if (!this.instance) {
      this.instance = new EnhancedRealTimeTerminalService();
    }
    return this.instance;
  }

  /**
   * Start streaming for an agent with AI provider-specific handling
   */
  async startStreaming(config: StreamConfig): Promise<void> {
    const streamKey = `${config.farmId}:${config.agentId}`;

    // Stop existing stream if any
    await this.stopStreaming(config.farmId, config.agentId);

    // Create output directory if needed
    const outputDir = dirname(config.outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    // Initialize stream
    const stream: TerminalStream = {
      config,
      lastPosition: 0,
      lastActivity: new Date(),
      isActive: true,
      buffer: [],
      messageQueue: [],
      detectedYields: new Set()
    };

    this.streams.set(streamKey, stream);

    // Start different capture methods based on AI provider
    if (config.aiProvider === AIProvider.GPT_OSS) {
      await this.setupGptOssStreaming(stream);
    } else {
      await this.setupStandardStreaming(stream);
    }

    // Start yield detection
    this.startYieldDetection(stream);

    // Start health monitoring
    this.startHealthMonitoring(stream);

    // Send initial connection message
    this.sendStructuredMessage(stream, {
      id: this.generateMessageId(),
      timestamp: new Date(),
      type: 'system',
      level: 'info',
      source: 'system',
      content: `Agent ${config.agentName} connected (${config.aiProvider.toUpperCase()})`,
      metadata: {
        aiProvider: config.aiProvider,
        modelVersion: await this.getModelVersion(config.aiProvider)
      }
    });

    logger.info(LogCategory.TERMINAL,
      `Started enhanced streaming for ${config.agentName} using ${config.aiProvider}`);
  }

  /**
   * Setup streaming for GPT-OSS with specific handling
   */
  private async setupGptOssStreaming(stream: TerminalStream): Promise<void> {
    const { config } = stream;

    // Use tail -F for following file (handles rotation)
    stream.tailProcess = spawn('tail', ['-F', '-n', '+1', config.outputPath], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Process stdout
    stream.tailProcess.stdout?.on('data', (chunk: Buffer) => {
      this.processGptOssOutput(stream, chunk.toString());
    });

    // Process stderr
    stream.tailProcess.stderr?.on('data', (chunk: Buffer) => {
      this.processOutput(stream, chunk.toString(), 'error');
    });

    // Handle process exit
    stream.tailProcess.on('exit', (code) => {
      if (stream.isActive) {
        logger.warn(LogCategory.TERMINAL,
          `Tail process exited for ${config.agentName}, restarting...`);
        setTimeout(() => {
          if (stream.isActive) {
            this.setupGptOssStreaming(stream);
          }
        }, 1000);
      }
    });

    // Also watch file for changes as backup
    stream.watcher = watch(config.outputPath, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 50,
        pollInterval: 10
      }
    });

    stream.watcher.on('change', async () => {
      await this.readNewContent(stream);
    });
  }

  /**
   * Setup standard streaming for other AI providers
   */
  private async setupStandardStreaming(stream: TerminalStream): Promise<void> {
    const { config } = stream;

    // Try tmux pipe-pane first for real-time capture
    const paneRef = `${config.sessionName}:0.${config.agentIndex}`;
    const setupPipeCmd = `TMUX_TMPDIR=/tmp tmux pipe-pane -t ${paneRef} -o "cat >> ${config.outputPath}"`;

    try {
      await this.execAsync(setupPipeCmd);
      logger.info(LogCategory.TERMINAL,
        `Setup tmux pipe-pane for ${config.agentName}`);
    } catch (error) {
      logger.warn(LogCategory.TERMINAL,
        `Failed to setup pipe-pane for ${config.agentName}, using file watch`);
    }

    // Watch output file for changes
    stream.watcher = watch(config.outputPath, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 25, // Ultra-fast for low latency
        pollInterval: 5
      }
    });

    stream.watcher.on('change', async () => {
      await this.readNewContent(stream);
    });

    // Setup flush timer for buffered content
    stream.flushTimer = setInterval(() => {
      this.flushBuffer(stream);
    }, this.FLUSH_INTERVAL);
  }

  /**
   * Process GPT-OSS specific output format
   */
  private processGptOssOutput(stream: TerminalStream, content: string): void {
    const lines = content.split('\n');
    const patterns = AI_PROVIDER_PATTERNS[AIProvider.GPT_OSS];

    for (const line of lines) {
      if (!line.trim()) continue;

      let message: StructuredMessage | null = null;

      // Check for different message types
      if (patterns.thinking.test(line)) {
        message = this.createMessage('thinking', 'info', line, stream);
      } else if (patterns.command.test(line)) {
        const match = line.match(patterns.command);
        message = this.createMessage('command', 'info', line, stream, {
          command: match?.[2] || match?.[1]
        });
      } else if (patterns.error.test(line)) {
        message = this.createMessage('error', 'error', line, stream);
      } else if (patterns.result.test(line)) {
        message = this.createMessage('result', 'success', line, stream);
      } else if (patterns.file.test(line)) {
        const match = line.match(patterns.file);
        if (match) {
          const filePath = match[2];
          message = this.createMessage('yield', 'success', line, stream, {
            filePath
          });
          this.detectYieldItem(stream, filePath);
        }
      } else {
        message = this.createMessage('output', 'info', line, stream);
      }

      if (message) {
        this.sendStructuredMessage(stream, message);
      }
    }
  }

  /**
   * Process standard output with AI provider-specific parsing
   */
  private processOutput(stream: TerminalStream, content: string, type: 'output' | 'error' = 'output'): void {
    const lines = content.split('\n');
    const patterns = AI_PROVIDER_PATTERNS[stream.config.aiProvider];

    for (const line of lines) {
      if (!line.trim()) continue;

      // Clean ANSI codes and control characters
      const cleanLine = this.cleanOutput(line);

      // Parse based on AI provider patterns
      let messageType: StructuredMessage['type'] = type === 'error' ? 'error' : 'output';
      let level: StructuredMessage['level'] = type === 'error' ? 'error' : 'info';
      let metadata: any = {};

      // Check patterns for current AI provider
      if (patterns) {
        if (patterns.thinking.test(cleanLine)) {
          messageType = 'thinking';
        } else if (patterns.command.test(cleanLine)) {
          messageType = 'command';
          const match = cleanLine.match(patterns.command);
          metadata.command = match?.[2] || match?.[1];
        } else if (patterns.result.test(cleanLine)) {
          messageType = 'result';
          level = 'success';
        } else if (patterns.file.test(cleanLine)) {
          const match = cleanLine.match(patterns.file);
          if (match) {
            messageType = 'yield';
            level = 'success';
            metadata.filePath = match[2];
            this.detectYieldItem(stream, match[2]);
          }
        }
      }

      const message = this.createMessage(messageType, level, cleanLine, stream, metadata);
      stream.buffer.push(this.formatMessageForTerminal(message));

      // Force flush if buffer is getting large
      if (stream.buffer.length >= this.MAX_BUFFER_SIZE) {
        this.flushBuffer(stream);
      }
    }
  }

  /**
   * Read new content from file
   */
  private async readNewContent(stream: TerminalStream): Promise<void> {
    try {
      const stats = await fs.stat(stream.config.outputPath);
      const fileSize = stats.size;

      if (fileSize > stream.lastPosition) {
        const fd = await fs.open(stream.config.outputPath, 'r');
        const newContentSize = fileSize - stream.lastPosition;
        const buffer = Buffer.alloc(newContentSize);

        await fd.read(buffer, 0, newContentSize, stream.lastPosition);
        await fd.close();

        const content = buffer.toString('utf8');
        this.processOutput(stream, content);

        stream.lastPosition = fileSize;
        stream.lastActivity = new Date();
      }
    } catch (error) {
      logger.error(LogCategory.TERMINAL,
        `Error reading content for ${stream.config.agentName}:`, error);
    }
  }

  /**
   * Clean terminal output
   */
  private cleanOutput(content: string): string {
    return content
      // Remove ANSI escape sequences
      .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
      // Remove other control characters
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Remove duplicate spaces
      .replace(/\s+/g, ' ')
      // Trim
      .trim();
  }

  /**
   * Create structured message
   */
  private createMessage(
    type: StructuredMessage['type'],
    level: StructuredMessage['level'],
    content: string,
    stream: TerminalStream,
    metadata?: any
  ): StructuredMessage {
    return {
      id: this.generateMessageId(),
      timestamp: new Date(),
      type,
      level,
      source: 'agent',
      content: this.cleanOutput(content),
      metadata: {
        ...metadata,
        aiProvider: stream.config.aiProvider,
        modelVersion: this.getCachedModelVersion(stream.config.aiProvider)
      },
      formatted: this.formatForDisplay(type, level, content)
    };
  }

  /**
   * Format message for terminal display with colors and structure
   */
  private formatForDisplay(
    type: StructuredMessage['type'],
    level: StructuredMessage['level'],
    content: string
  ): string {
    const timestamp = new Date().toLocaleTimeString();

    // Color codes for terminal (will be handled by frontend)
    const colors = {
      info: '\x1b[37m',      // White
      success: '\x1b[32m',   // Green
      warning: '\x1b[33m',   // Yellow
      error: '\x1b[31m',     // Red
      debug: '\x1b[90m',     // Gray
      reset: '\x1b[0m'
    };

    const typeIcons = {
      command: '$ ',
      output: '  ',
      error: '⚠ ',
      system: '⚙ ',
      thinking: '💭 ',
      result: '✓ ',
      yield: '📦 '
    };

    const color = colors[level] || colors.info;
    const icon = typeIcons[type] || '  ';

    return `${colors.debug}[${timestamp}]${colors.reset} ${color}${icon}${content}${colors.reset}`;
  }

  /**
   * Format message for terminal output
   */
  private formatMessageForTerminal(message: StructuredMessage): string {
    return message.formatted || message.content;
  }

  /**
   * Send structured message via WebSocket
   */
  private sendStructuredMessage(stream: TerminalStream, message: StructuredMessage): void {
    const payload = {
      farmId: stream.config.farmId,
      agentId: stream.config.agentId,
      agentName: stream.config.agentName,
      message,
      timestamp: message.timestamp.toISOString()
    };

    // Emit to WebSocket
    websocketManager.broadcast('terminal:structured', payload);

    // Also emit traditional output for backward compatibility
    websocketManager.broadcast('terminal:output', {
      farmId: stream.config.farmId,
      agentId: stream.config.agentId,
      agentName: stream.config.agentName,
      content: message.formatted || message.content
    });

    // Store in message queue
    stream.messageQueue.push(message);

    // Keep only last 1000 messages
    if (stream.messageQueue.length > 1000) {
      stream.messageQueue.shift();
    }
  }

  /**
   * Flush buffer to WebSocket
   */
  private flushBuffer(stream: TerminalStream): void {
    if (stream.buffer.length === 0) return;

    const content = stream.buffer.join('\n');
    stream.buffer = [];

    websocketManager.broadcast('terminal:output', {
      farmId: stream.config.farmId,
      agentId: stream.config.agentId,
      agentName: stream.config.agentName,
      content
    });
  }

  /**
   * Start yield detection for workspace
   */
  private startYieldDetection(stream: TerminalStream): void {
    const workspacePath = stream.config.workspacePath;

    // Watch workspace for new files
    stream.yieldWatcher = watch(workspacePath, {
      persistent: true,
      ignoreInitial: true,
      depth: 3,
      ignorePermissionErrors: true,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/.env*',
        '**/tmp/**',
        '**/temp/**'
      ]
    });

    stream.yieldWatcher.on('add', async (filePath: string) => {
      await this.detectYieldItem(stream, filePath);
    });

    stream.yieldWatcher.on('change', async (filePath: string) => {
      await this.detectYieldItem(stream, filePath);
    });

    // Periodic scan for yields
    setInterval(() => {
      this.scanForYields(stream);
    }, this.YIELD_SCAN_INTERVAL);
  }

  /**
   * Detect and process yield item
   */
  private async detectYieldItem(stream: TerminalStream, filePath: string): Promise<void> {
    // Skip if already detected
    if (stream.detectedYields.has(filePath)) return;

    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) return;

      const ext = extname(filePath).toLowerCase();
      const fileName = filePath.split('/').pop() || 'unknown';

      // Determine yield type
      let yieldType: YieldDetection['type'] = 'file';
      let relevance = 0.5;

      // Check against patterns
      for (const [type, patterns] of Object.entries(YIELD_FILE_PATTERNS)) {
        if (patterns.some(p => filePath.includes(p) || ext === p)) {
          yieldType = type as YieldDetection['type'];
          relevance = 0.8;
          break;
        }
      }

      // Create yield detection
      const yieldItem: YieldDetection = {
        path: filePath,
        type: yieldType,
        name: fileName,
        size: stats.size,
        language: this.detectLanguage(ext),
        description: `${yieldType} created by ${stream.config.agentName}`,
        relevance,
        timestamp: new Date()
      };

      // Mark as detected
      stream.detectedYields.add(filePath);

      // Emit yield event
      websocketManager.broadcast('yield:detected', {
        farmId: stream.config.farmId,
        agentId: stream.config.agentId,
        agentName: stream.config.agentName,
        yield: yieldItem
      });

      // Send structured message
      this.sendStructuredMessage(stream, {
        id: this.generateMessageId(),
        timestamp: new Date(),
        type: 'yield',
        level: 'success',
        source: 'system',
        content: `Created ${yieldType}: ${fileName}`,
        metadata: {
          filePath,
          language: yieldItem.language,
          byteSize: stats.size
        }
      });

      logger.info(LogCategory.HARVEST,
        `Detected yield item: ${fileName} from ${stream.config.agentName}`);
    } catch (error) {
      logger.error(LogCategory.HARVEST,
        `Error detecting yield for ${filePath}:`, error);
    }
  }

  /**
   * Scan workspace for yield items
   */
  private async scanForYields(stream: TerminalStream): Promise<void> {
    // This is called periodically to catch any missed files
    // Implementation would scan the workspace directory
  }

  /**
   * Detect programming language from extension
   */
  private detectLanguage(ext: string): string | undefined {
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescriptreact',
      '.js': 'javascript',
      '.jsx': 'javascriptreact',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp',
      '.rb': 'ruby',
      '.php': 'php',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.r': 'r',
      '.sql': 'sql',
      '.sh': 'shell',
      '.bash': 'bash',
      '.yml': 'yaml',
      '.yaml': 'yaml',
      '.json': 'json',
      '.xml': 'xml',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.md': 'markdown'
    };

    return languageMap[ext];
  }

  /**
   * Start health monitoring for stream
   */
  private startHealthMonitoring(stream: TerminalStream): void {
    stream.healthCheck = setInterval(async () => {
      const now = new Date();
      const timeSinceLastActivity = now.getTime() - stream.lastActivity.getTime();

      // Check if stream is still healthy
      if (timeSinceLastActivity > 60000) { // 1 minute of inactivity
        logger.warn(LogCategory.TERMINAL,
          `Stream inactive for ${stream.config.agentName}, checking health...`);

        // Try to restart streaming
        await this.restartStream(stream);
      }

      // Emit health status
      websocketManager.broadcast('terminal:health', {
        farmId: stream.config.farmId,
        agentId: stream.config.agentId,
        isHealthy: timeSinceLastActivity < 60000,
        lastActivity: stream.lastActivity.toISOString(),
        messageCount: stream.messageQueue.length,
        detectedYields: stream.detectedYields.size
      });
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Restart stream if unhealthy
   */
  private async restartStream(stream: TerminalStream): Promise<void> {
    logger.info(LogCategory.TERMINAL,
      `Restarting stream for ${stream.config.agentName}`);

    // Stop current streaming
    this.cleanupStream(stream);

    // Restart based on AI provider
    if (stream.config.aiProvider === AIProvider.GPT_OSS) {
      await this.setupGptOssStreaming(stream);
    } else {
      await this.setupStandardStreaming(stream);
    }
  }

  /**
   * Setup global health monitoring
   */
  private setupGlobalHealthMonitoring(): void {
    setInterval(() => {
      const healthReport = {
        totalStreams: this.streams.size,
        activeStreams: Array.from(this.streams.values()).filter(s => s.isActive).length,
        totalMessages: Array.from(this.streams.values()).reduce((sum, s) => sum + s.messageQueue.length, 0),
        totalYields: Array.from(this.streams.values()).reduce((sum, s) => sum + s.detectedYields.size, 0)
      };

      websocketManager.broadcast('terminal:global-health', healthReport);

      logger.debug(LogCategory.TERMINAL,
        `Global health: ${healthReport.activeStreams}/${healthReport.totalStreams} active streams`);
    }, 30000); // Every 30 seconds
  }

  /**
   * Stop streaming for an agent
   */
  async stopStreaming(farmId: string, agentId: string): Promise<void> {
    const streamKey = `${farmId}:${agentId}`;
    const stream = this.streams.get(streamKey);

    if (!stream) return;

    stream.isActive = false;
    this.cleanupStream(stream);
    this.streams.delete(streamKey);

    logger.info(LogCategory.TERMINAL,
      `Stopped streaming for agent ${agentId} in farm ${farmId}`);
  }

  /**
   * Cleanup stream resources
   */
  private cleanupStream(stream: TerminalStream): void {
    if (stream.watcher) {
      stream.watcher.close();
    }

    if (stream.tailProcess) {
      stream.tailProcess.kill();
    }

    if (stream.flushTimer) {
      clearInterval(stream.flushTimer);
    }

    if (stream.healthCheck) {
      clearInterval(stream.healthCheck);
    }

    if (stream.yieldWatcher) {
      stream.yieldWatcher.close();
    }
  }

  /**
   * Stop all streams for a farm
   */
  async stopFarmStreaming(farmId: string): Promise<void> {
    const farmStreams = Array.from(this.streams.entries())
      .filter(([key]) => key.startsWith(`${farmId}:`));

    for (const [key, stream] of farmStreams) {
      stream.isActive = false;
      this.cleanupStream(stream);
      this.streams.delete(key);
    }

    logger.info(LogCategory.TERMINAL,
      `Stopped all streaming for farm ${farmId}`);
  }

  /**
   * Get stream statistics
   */
  getStreamStats(farmId: string): any {
    const farmStreams = Array.from(this.streams.values())
      .filter(s => s.config.farmId === farmId);

    return {
      totalStreams: farmStreams.length,
      activeStreams: farmStreams.filter(s => s.isActive).length,
      totalMessages: farmStreams.reduce((sum, s) => sum + s.messageQueue.length, 0),
      totalYields: farmStreams.reduce((sum, s) => sum + s.detectedYields.size, 0),
      streams: farmStreams.map(s => ({
        agentId: s.config.agentId,
        agentName: s.config.agentName,
        isActive: s.isActive,
        lastActivity: s.lastActivity.toISOString(),
        messageCount: s.messageQueue.length,
        yieldCount: s.detectedYields.size
      }))
    };
  }

  /**
   * Get model version for AI provider
   */
  private async getModelVersion(provider: AIProvider): Promise<string> {
    const config = aiProviderManager.getProvider(provider);

    // Get actual model versions
    const versions: Record<AIProvider, string> = {
      [AIProvider.CLAUDE]: config.model || 'claude-3-sonnet-20240229',
      [AIProvider.OPENAI]: config.model || 'gpt-4-turbo-preview',
      [AIProvider.GPT_OSS]: config.model || 'openai/gpt-oss-20b',
      [AIProvider.LLAMA]: config.model || 'llama2.5-coder:7b',
      [AIProvider.GROK]: config.model || 'grok-2'
    };

    return versions[provider];
  }

  /**
   * Get cached model version
   */
  private getCachedModelVersion(provider: AIProvider): string {
    const versions: Record<AIProvider, string> = {
      [AIProvider.CLAUDE]: 'claude-3-sonnet-20240229',
      [AIProvider.OPENAI]: 'gpt-4-turbo-preview',
      [AIProvider.GPT_OSS]: 'openai/gpt-oss-20b',
      [AIProvider.LLAMA]: 'llama2.5-coder:7b',
      [AIProvider.GROK]: 'grok-2'
    };
    return versions[provider];
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Execute command asynchronously
   */
  private execAsync(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });
  }
}

// Export singleton instance
export const enhancedTerminalService = EnhancedRealTimeTerminalService.getInstance();