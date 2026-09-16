/**
 * Advanced Terminal Stream Service
 *
 * Next-generation terminal streaming with intelligent message parsing,
 * activity detection, and real-time yield identification.
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { dirname } from 'path';
import { FSWatcher, watch } from 'chokidar';
import { logger, LogCategory } from '../utils/logger';
import { pathConfig } from '../config/paths';
import { cleanTerminalOutput } from '../utils/terminalCleaner';
import { unifiedWebSocketManager } from '../websocket/UnifiedWebSocketManager';
import * as crypto from 'crypto';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface StructuredMessage {
  id: string;
  farmId: string;
  agentId: number;
  agentName: string;
  timestamp: Date;
  type: 'command' | 'output' | 'error' | 'thinking' | 'file_operation' | 'api_call' | 'yield_created' | 'status';
  category: 'system' | 'user_action' | 'ai_response' | 'file_io' | 'network' | 'computation';
  content: string;
  metadata: {
    raw: string;
    cleaned: string;
    isImportant: boolean;
    relevanceScore: number;
    phase?: 'planning' | 'executing' | 'validating' | 'completing';
    context?: string;
    tool?: string;
    parameters?: any;
    result?: any;
    duration?: number;
    lineNumber?: number;
  };
  activity?: AgentActivity;
  yield?: DetectedYield;
}

export interface AgentActivity {
  type: 'file_created' | 'file_modified' | 'file_deleted' | 'code_written' |
        'test_executed' | 'command_run' | 'api_called' | 'thinking' |
        'planning' | 'reviewing' | 'debugging' | 'optimizing';
  description: string;
  target?: string;
  language?: string;
  linesOfCode?: number;
  testsPassed?: number;
  testsFailed?: number;
  coverage?: number;
  performance?: {
    executionTime: number;
    memoryUsage: number;
    cpuUsage: number;
  };
}

export interface DetectedYield {
  type: 'code' | 'document' | 'test' | 'config' | 'data' | 'report' | 'diagram';
  path: string;
  title: string;
  description: string;
  quality: 'excellent' | 'high' | 'medium' | 'low';
  relevance: number; // 0-100
  size: number;
  language?: string;
  preview?: string;
  tags: string[];
  correlatedToPrompt: boolean;
  promptKeywords: string[];
}

interface StreamSession {
  farmId: string;
  agentId: number;
  agentName: string;
  sessionName: string;
  messages: StructuredMessage[];
  activities: AgentActivity[];
  yields: DetectedYield[];
  statistics: {
    totalMessages: number;
    commandsExecuted: number;
    filesCreated: number;
    filesModified: number;
    errorsEncountered: number;
    linesOfCodeWritten: number;
    testsRun: number;
    testsPassed: number;
    apiCalls: number;
    thinkingTime: number;
    executionTime: number;
  };
  watcher?: FSWatcher;
  outputPath: string;
  lastPosition: number;
  isActive: boolean;
  startTime: Date;
  lastActivity: Date;
  userPrompt: string;
  promptKeywords: string[];
  pollInterval?: NodeJS.Timeout;
  lastPollContent?: string;
}

// ============================================================================
// Message Parser
// ============================================================================

class IntelligentMessageParser {
  // Patterns for detecting different types of activities
  private patterns = {
    command: /^\$\s+(.+)|^>\s+(.+)|^❯\s+(.+)/,
    fileOperation: /(?:Creating|Writing|Modifying|Deleting|Reading)\s+(?:file\s+)?['"]?([^'"]+)['"]?/i,
    codeBlock: /^```(\w+)?\n([\s\S]*?)```$/m,
    thinking: /(?:thinking|planning|analyzing|considering|reviewing|debugging).*:/i,
    apiCall: /(?:GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)|fetch\(['"]([^'"]+)['"]/i,
    error: /(?:error|exception|failed|failure|traceback|stack trace):/i,
    test: /(?:test|spec|suite).*(?:passed|failed|skipped)/i,
    import: /^(?:import|from|require|use)\s+/m,
    function: /(?:function|def|fn|const|let|var)\s+(\w+)/,
    classDecl: /(?:class|interface|struct|enum)\s+(\w+)/,
    yield: /(?:created|generated|produced|built|compiled)\s+(?:file\s+)?['"]?([^'"]+)['"]?/i,
  };

  // Tool detection patterns
  private toolPatterns = {
    bash: /\[Bash\]/,
    read: /\[Read\]/,
    write: /\[Write\]/,
    edit: /\[Edit\]/,
    grep: /\[Grep\]/,
    glob: /\[Glob\]/,
    webSearch: /\[WebSearch\]/,
    webFetch: /\[WebFetch\]/,
    task: /\[Task\]/,
  };

  public parse(
    content: string,
    context: {
      agentName: string;
      farmId: string;
      agentId: number;
      promptKeywords: string[];
    }
  ): StructuredMessage {
    const cleaned = cleanTerminalOutput(content, {
      preserveColor: false,
      normalizeLineEndings: true,
      trimEmpty: false
    });

    const message: StructuredMessage = {
      id: crypto.randomUUID(),
      farmId: context.farmId,
      agentId: context.agentId,
      agentName: context.agentName,
      timestamp: new Date(),
      type: this.detectMessageType(content, cleaned),
      category: this.detectCategory(content, cleaned),
      content: cleaned,
      metadata: {
        raw: content,
        cleaned: cleaned,
        isImportant: this.isImportantMessage(cleaned, context.promptKeywords),
        relevanceScore: this.calculateRelevance(cleaned, context.promptKeywords),
        phase: this.detectPhase(cleaned)
      }
    };

    // Detect activities
    const activity = this.detectActivity(cleaned, content);
    if (activity) {
      message.activity = activity;
    }

    // Detect yields
    const yieldItem = this.detectYield(cleaned, context.promptKeywords);
    if (yieldItem) {
      message.yield = yieldItem;
    }

    // Extract tool information
    const tool = this.detectTool(content);
    if (tool) {
      message.metadata.tool = tool;
    }

    return message;
  }

  private detectMessageType(raw: string, cleaned: string): StructuredMessage['type'] {
    if (this.patterns.command.test(cleaned)) return 'command';
    if (this.patterns.error.test(cleaned)) return 'error';
    if (this.patterns.thinking.test(cleaned)) return 'thinking';
    if (this.patterns.fileOperation.test(cleaned)) return 'file_operation';
    if (this.patterns.apiCall.test(cleaned)) return 'api_call';
    if (this.patterns.yield.test(cleaned)) return 'yield_created';
    if (cleaned.includes('[Status]') || cleaned.includes('Status:')) return 'status';
    return 'output';
  }

  private detectCategory(raw: string, cleaned: string): StructuredMessage['category'] {
    if (raw.includes('[System]') || raw.includes('system:')) return 'system';
    if (this.patterns.fileOperation.test(cleaned)) return 'file_io';
    if (this.patterns.apiCall.test(cleaned)) return 'network';
    if (this.patterns.thinking.test(cleaned)) return 'ai_response';
    if (this.patterns.test.test(cleaned)) return 'computation';
    if (this.patterns.command.test(cleaned)) return 'user_action';
    return 'ai_response';
  }

  private detectPhase(content: string): StructuredMessage['metadata']['phase'] {
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('planning') || lowerContent.includes('analyzing')) return 'planning';
    if (lowerContent.includes('executing') || lowerContent.includes('running')) return 'executing';
    if (lowerContent.includes('validating') || lowerContent.includes('testing')) return 'validating';
    if (lowerContent.includes('completing') || lowerContent.includes('finished')) return 'completing';
    return undefined;
  }

  private detectActivity(cleaned: string, raw: string): AgentActivity | undefined {
    // File operations
    const fileOpMatch = cleaned.match(this.patterns.fileOperation);
    if (fileOpMatch) {
      const path = fileOpMatch[1];
      const operation = cleaned.toLowerCase();

      let type: AgentActivity['type'] = 'file_modified';
      if (operation.includes('creating')) type = 'file_created';
      else if (operation.includes('deleting')) type = 'file_deleted';

      // Check if it's code
      if (path.match(/\.(ts|tsx|js|jsx|py|java|go|rs|cpp|c|cs)$/)) {
        type = 'code_written';
      }

      return {
        type,
        description: cleaned.substring(0, 100),
        target: path,
        language: this.detectLanguage(path)
      };
    }

    // Test execution
    if (this.patterns.test.test(cleaned)) {
      const passed = (cleaned.match(/(\d+)\s+passed/i) || [])[1];
      const failed = (cleaned.match(/(\d+)\s+failed/i) || [])[1];

      return {
        type: 'test_executed',
        description: 'Running tests',
        testsPassed: passed ? parseInt(passed) : undefined,
        testsFailed: failed ? parseInt(failed) : undefined
      };
    }

    // Command execution
    const commandMatch = cleaned.match(this.patterns.command);
    if (commandMatch) {
      return {
        type: 'command_run',
        description: commandMatch[1] || commandMatch[2] || commandMatch[3],
        target: 'terminal'
      };
    }

    // API calls
    const apiMatch = cleaned.match(this.patterns.apiCall);
    if (apiMatch) {
      return {
        type: 'api_called',
        description: `API call to ${apiMatch[1] || apiMatch[2]}`,
        target: apiMatch[1] || apiMatch[2]
      };
    }

    // Thinking/Planning
    if (this.patterns.thinking.test(cleaned)) {
      return {
        type: 'thinking',
        description: cleaned.substring(0, 100)
      };
    }

    return undefined;
  }

  private detectYield(content: string, promptKeywords: string[]): DetectedYield | undefined {
    const yieldMatch = content.match(this.patterns.yield);
    if (!yieldMatch) return undefined;

    const path = yieldMatch[1];
    const ext = path.split('.').pop() || '';

    // Calculate relevance based on prompt keywords
    const relevance = this.calculateRelevance(content, promptKeywords);

    return {
      type: this.getYieldType(ext),
      path,
      title: path.split('/').pop() || path,
      description: content.substring(0, 200),
      quality: relevance > 80 ? 'excellent' : relevance > 60 ? 'high' : relevance > 40 ? 'medium' : 'low',
      relevance,
      size: 0, // Will be updated when file is read
      language: this.detectLanguage(path),
      tags: this.extractTags(content, promptKeywords),
      correlatedToPrompt: relevance > 50,
      promptKeywords: promptKeywords.filter(keyword =>
        content.toLowerCase().includes(keyword.toLowerCase())
      )
    };
  }

  private detectTool(content: string): string | undefined {
    for (const [tool, pattern] of Object.entries(this.toolPatterns)) {
      if (pattern.test(content)) {
        return tool;
      }
    }
    return undefined;
  }

  private isImportantMessage(content: string, keywords: string[]): boolean {
    // Check for important markers
    if (content.match(/(?:CRITICAL|IMPORTANT|WARNING|ERROR|SUCCESS|COMPLETE)/i)) return true;

    // Check for file operations
    if (this.patterns.fileOperation.test(content)) return true;

    // Check for yield creation
    if (this.patterns.yield.test(content)) return true;

    // Check for test results
    if (this.patterns.test.test(content)) return true;

    // Check for prompt keywords
    const relevance = this.calculateRelevance(content, keywords);
    return relevance > 60;
  }

  private calculateRelevance(content: string, keywords: string[]): number {
    if (!keywords.length) return 50;

    const lowerContent = content.toLowerCase();
    let matches = 0;
    let totalWeight = 0;

    keywords.forEach(keyword => {
      const lowerKeyword = keyword.toLowerCase();
      const count = (lowerContent.match(new RegExp(lowerKeyword, 'g')) || []).length;
      if (count > 0) {
        matches++;
        totalWeight += count * (keyword.length / 10); // Longer keywords get more weight
      }
    });

    const keywordScore = keywords.length > 0 ? (matches / keywords.length) * 50 : 0;
    const weightScore = Math.min(totalWeight * 10, 50);

    return Math.min(keywordScore + weightScore, 100);
  }

  private detectLanguage(path: string): string | undefined {
    const ext = path.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      'ts': 'TypeScript', 'tsx': 'TypeScript React',
      'js': 'JavaScript', 'jsx': 'JavaScript React',
      'py': 'Python', 'java': 'Java', 'go': 'Go',
      'rs': 'Rust', 'cpp': 'C++', 'c': 'C',
      'cs': 'C#', 'rb': 'Ruby', 'php': 'PHP',
      'swift': 'Swift', 'kt': 'Kotlin', 'scala': 'Scala'
    };
    return ext ? langMap[ext] : undefined;
  }

  private getYieldType(ext: string): DetectedYield['type'] {
    const typeMap: Record<string, DetectedYield['type']> = {
      'ts': 'code', 'tsx': 'code', 'js': 'code', 'jsx': 'code',
      'py': 'code', 'java': 'code', 'go': 'code',
      'md': 'document', 'txt': 'document', 'pdf': 'document',
      'json': 'data', 'yaml': 'data', 'yml': 'data', 'csv': 'data',
      'test.ts': 'test', 'spec.ts': 'test', 'test.js': 'test',
      'config.ts': 'config', 'config.js': 'config', '.env': 'config',
      'html': 'report', 'xml': 'report',
      'svg': 'diagram', 'puml': 'diagram', 'mermaid': 'diagram'
    };

    // Check for test files
    if (ext.includes('test') || ext.includes('spec')) return 'test';

    return typeMap[ext] || 'document';
  }

  private extractTags(content: string, keywords: string[]): string[] {
    const tags = new Set<string>();

    // Add matched keywords as tags
    keywords.forEach(keyword => {
      if (content.toLowerCase().includes(keyword.toLowerCase())) {
        tags.add(keyword.toLowerCase());
      }
    });

    // Extract technology tags
    const techPatterns = [
      'react', 'vue', 'angular', 'typescript', 'javascript',
      'python', 'django', 'flask', 'fastapi',
      'docker', 'kubernetes', 'aws', 'gcp', 'azure',
      'postgresql', 'mongodb', 'redis', 'mysql',
      'api', 'rest', 'graphql', 'websocket'
    ];

    techPatterns.forEach(tech => {
      if (content.toLowerCase().includes(tech)) {
        tags.add(tech);
      }
    });

    return Array.from(tags);
  }
}

// ============================================================================
// Advanced Terminal Stream Service
// ============================================================================

export class AdvancedTerminalStreamService extends EventEmitter {
  private static instance: AdvancedTerminalStreamService;
  private sessions: Map<string, StreamSession> = new Map();
  private parser = new IntelligentMessageParser();
  private healthCheckInterval?: NodeJS.Timeout;

  private constructor() {
    super();
    this.startHealthMonitoring();
  }

  public static getInstance(): AdvancedTerminalStreamService {
    if (!AdvancedTerminalStreamService.instance) {
      AdvancedTerminalStreamService.instance = new AdvancedTerminalStreamService();
    }
    return AdvancedTerminalStreamService.instance;
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  public async createSession(
    farmId: string,
    agentId: number,
    agentName: string,
    sessionName: string,
    userPrompt: string
  ): Promise<void> {
    const sessionKey = `${farmId}:${agentId}`;

    if (this.sessions.has(sessionKey)) {
      logger.warn(LogCategory.TERMINAL, `Session already exists for ${sessionKey}`);
      return;
    }

    // Extract keywords from prompt for relevance scoring
    const promptKeywords = this.extractKeywords(userPrompt);

    const outputPath = pathConfig.getTerminalLogPath(farmId, agentId);
    await fs.mkdir(dirname(outputPath), { recursive: true });

    const session: StreamSession = {
      farmId,
      agentId,
      agentName,
      sessionName,
      messages: [],
      activities: [],
      yields: [],
      statistics: {
        totalMessages: 0,
        commandsExecuted: 0,
        filesCreated: 0,
        filesModified: 0,
        errorsEncountered: 0,
        linesOfCodeWritten: 0,
        testsRun: 0,
        testsPassed: 0,
        apiCalls: 0,
        thinkingTime: 0,
        executionTime: 0
      },
      outputPath,
      lastPosition: 0,
      isActive: true,
      startTime: new Date(),
      lastActivity: new Date(),
      userPrompt,
      promptKeywords
    };

    this.sessions.set(sessionKey, session);

    // Setup file watcher
    await this.setupWatcher(session);

    // Setup tmux pipe-pane
    await this.setupPipePane(session);

    logger.info(LogCategory.TERMINAL, `Created advanced stream session for ${sessionKey}`);

    // Emit session created event
    this.emit('session:created', {
      farmId,
      agentId,
      agentName,
      sessionName
    });
  }

  private async setupWatcher(session: StreamSession): Promise<void> {
    // Create file if it doesn't exist
    await fs.writeFile(session.outputPath, '', { flag: 'a' });

    session.watcher = watch(session.outputPath, {
      persistent: true,
      usePolling: false,
      awaitWriteFinish: false,
      ignoreInitial: true,
      atomic: false,
      interval: 10,
      binaryInterval: 10
    });

    session.watcher.on('change', async () => {
      await this.processNewOutput(session);
    });

    session.watcher.on('error', (error) => {
      logger.error(LogCategory.TERMINAL, `Watcher error for session ${session.farmId}:${session.agentId}`, error);
    });
  }

  private async setupPipePane(session: StreamSession): Promise<void> {
    const paneRef = `${session.sessionName}:0.${session.agentId}`;
    const command = `TMUX_TMPDIR=/tmp tmux pipe-pane -t ${paneRef} "cat >> ${session.outputPath}"`;

    exec(command, (error) => {
      if (error) {
        logger.warn(LogCategory.TERMINAL, `Failed to setup pipe-pane for ${paneRef}, using fallback polling`);
        this.setupPolling(session);
      } else {
        logger.info(LogCategory.TERMINAL, `Pipe-pane setup successful for ${paneRef}`);
      }
    });
  }

  private setupPolling(session: StreamSession): void {
    session.pollInterval = setInterval(async () => {
      await this.pollTerminalOutput(session);
    }, 100); // Poll every 100ms for near real-time updates
  }

  private async pollTerminalOutput(session: StreamSession): Promise<void> {
    const paneRef = `${session.sessionName}:0.${session.agentId}`;
    const command = `TMUX_TMPDIR=/tmp tmux capture-pane -t ${paneRef} -p`;

    // FIX: Wrap exec callback in proper error handling for async operations
    exec(command, { timeout: 5000 }, (error, stdout) => {
      if (!error && stdout !== session.lastPollContent) {
        const newContent = stdout.substring(session.lastPollContent?.length || 0);
        if (newContent) {
          // FIX: Handle async operation with proper error catching
          fs.appendFile(session.outputPath, newContent)
            .then(() => {
              session.lastPollContent = stdout;
            })
            .catch((appendError) => {
              console.error(`[AdvancedTerminalStream] Failed to append output for session ${session.sessionId}:`, appendError);
            });
        }
      }
    });
  }

  // ============================================================================
  // Output Processing
  // ============================================================================

  private async processNewOutput(session: StreamSession): Promise<void> {
    try {
      const content = await fs.readFile(session.outputPath, 'utf-8');
      const newContent = content.substring(session.lastPosition);

      if (!newContent) return;

      session.lastPosition = content.length;
      session.lastActivity = new Date();

      // Split content into lines and process each
      const lines = newContent.split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;

        // Parse the message
        const message = this.parser.parse(line, {
          agentName: session.agentName,
          farmId: session.farmId,
          agentId: session.agentId,
          promptKeywords: session.promptKeywords
        });

        // Update statistics
        this.updateStatistics(session, message);

        // Store message
        session.messages.push(message);

        // Store activities and yields
        if (message.activity) {
          session.activities.push(message.activity);
        }
        if (message.yield) {
          session.yields.push(message.yield);
        }

        // Broadcast structured message
        await this.broadcastMessage(session, message);

        // Emit events for important messages
        if (message.metadata.isImportant) {
          this.emit('important:message', message);
        }

        if (message.yield) {
          this.emit('yield:detected', {
            ...message.yield,
            farmId: session.farmId,
            agentId: session.agentId,
            agentName: session.agentName
          });
        }
      }

      // Broadcast aggregated statistics periodically
      if (session.messages.length % 10 === 0) {
        await this.broadcastStatistics(session);
      }

    } catch (error) {
      logger.error(LogCategory.TERMINAL, `Error processing output for ${session.farmId}:${session.agentId}`, error);
    }
  }

  private updateStatistics(session: StreamSession, message: StructuredMessage): void {
    const stats = session.statistics;
    stats.totalMessages++;

    switch (message.type) {
      case 'command':
        stats.commandsExecuted++;
        break;
      case 'error':
        stats.errorsEncountered++;
        break;
      case 'file_operation':
        if (message.activity?.type === 'file_created') stats.filesCreated++;
        if (message.activity?.type === 'file_modified') stats.filesModified++;
        if (message.activity?.type === 'code_written' && message.activity.linesOfCode) {
          stats.linesOfCodeWritten += message.activity.linesOfCode;
        }
        break;
      case 'api_call':
        stats.apiCalls++;
        break;
      case 'thinking':
        stats.thinkingTime += message.metadata.duration || 1;
        break;
    }

    if (message.activity?.type === 'test_executed') {
      stats.testsRun++;
      if (message.activity.testsPassed) stats.testsPassed += message.activity.testsPassed;
    }

    stats.executionTime = Date.now() - session.startTime.getTime();
  }

  // ============================================================================
  // Broadcasting
  // ============================================================================

  private async broadcastMessage(session: StreamSession, message: StructuredMessage): Promise<void> {
    const event = 'agent:activity';
    const data = {
      farmId: session.farmId,
      agentId: session.agentId,
      agentName: session.agentName,
      message,
      timestamp: new Date()
    };

    // Broadcast to WebSocket rooms (use farm-specific broadcast)
    unifiedWebSocketManager.broadcastToFarm(session.farmId, event, data);

    // Also emit locally for other services
    this.emit('message:processed', data);
  }

  private async broadcastStatistics(session: StreamSession): Promise<void> {
    const event = 'agent:statistics';
    const data = {
      farmId: session.farmId,
      agentId: session.agentId,
      agentName: session.agentName,
      statistics: session.statistics,
      activities: session.activities.slice(-10), // Last 10 activities
      yields: session.yields,
      timestamp: new Date()
    };

    unifiedWebSocketManager.broadcastToFarm(session.farmId, event, data);
  }

  // ============================================================================
  // Keyword Extraction
  // ============================================================================

  private extractKeywords(prompt: string): string[] {
    // Remove common words
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'can', 'shall', 'need',
      'please', 'help', 'create', 'make', 'build', 'implement', 'add'
    ]);

    // Extract meaningful words
    const words = prompt.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    // Look for technical terms and keep them
    const technicalTerms = words.filter(word =>
      word.match(/^(api|auth|database|server|client|test|config|docker|react|node|typescript|javascript|python|sql|html|css|json|xml|yaml|function|class|component|service|model|controller|route|endpoint|query|mutation|schema|migration|deploy|build|compile|lint|format|optimize|debug|log|error|warning|success)/)
    );

    // Combine unique words
    const keywords = Array.from(new Set([...technicalTerms, ...words.slice(0, 10)]));

    return keywords;
  }

  // ============================================================================
  // Health Monitoring
  // ============================================================================

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.sessions.forEach(session => {
        const sessionKey = `${session.farmId}:${session.agentId}`;
        const inactive = Date.now() - session.lastActivity.getTime();

        if (inactive > 60000 && session.isActive) { // 1 minute of inactivity
          logger.warn(LogCategory.TERMINAL, `Session ${sessionKey} appears inactive`);
          this.emit('session:inactive', {
            farmId: session.farmId,
            agentId: session.agentId,
            lastActivity: session.lastActivity
          });
        }

        // Check for stale sessions (over 2 hours old)
        const age = Date.now() - session.startTime.getTime();
        if (age > 7200000) {
          logger.info(LogCategory.TERMINAL, `Cleaning up stale session ${sessionKey}`);
          this.closeSession(session.farmId, session.agentId);
        }
      });
    }, 30000); // Check every 30 seconds
  }

  // ============================================================================
  // Session Cleanup
  // ============================================================================

  public async closeSession(farmId: string, agentId: number): Promise<void> {
    const sessionKey = `${farmId}:${agentId}`;
    const session = this.sessions.get(sessionKey);

    if (!session) return;

    // Stop watchers and intervals
    if (session.watcher) {
      await session.watcher.close();
    }
    if (session.pollInterval) {
      clearInterval(session.pollInterval);
    }

    // Final statistics broadcast
    await this.broadcastStatistics(session);

    // Store yields in database
    if (session.yields.length > 0) {
      this.emit('yields:final', {
        farmId: session.farmId,
        agentId: session.agentId,
        agentName: session.agentName,
        yields: session.yields
      });
    }

    this.sessions.delete(sessionKey);

    logger.info(LogCategory.TERMINAL, `Closed session ${sessionKey}. Stats: ${JSON.stringify(session.statistics)}`);

    this.emit('session:closed', {
      farmId: session.farmId,
      agentId: session.agentId,
      statistics: session.statistics,
      yields: session.yields
    });
  }

  public async closeAllSessions(): Promise<void> {
    const promises: Promise<void>[] = [];

    this.sessions.forEach(session => {
      promises.push(this.closeSession(session.farmId, session.agentId));
    });

    await Promise.all(promises);

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

  // ============================================================================
  // Public API
  // ============================================================================

  public getSession(farmId: string, agentId: number): StreamSession | undefined {
    return this.sessions.get(`${farmId}:${agentId}`);
  }

  public getAllSessions(): StreamSession[] {
    return Array.from(this.sessions.values());
  }

  public getSessionStatistics(farmId: string, agentId: number): StreamSession['statistics'] | undefined {
    const session = this.getSession(farmId, agentId);
    return session?.statistics;
  }

  public getSessionYields(farmId: string, agentId: number): DetectedYield[] {
    const session = this.getSession(farmId, agentId);
    return session?.yields || [];
  }

  public getRecentMessages(farmId: string, agentId: number, limit = 50): StructuredMessage[] {
    const session = this.getSession(farmId, agentId);
    if (!session) return [];

    return session.messages.slice(-limit);
  }

  public getImportantMessages(farmId: string, agentId: number): StructuredMessage[] {
    const session = this.getSession(farmId, agentId);
    if (!session) return [];

    return session.messages.filter(msg => msg.metadata.isImportant);
  }
}

// Export singleton instance
export const advancedTerminalStreamService = AdvancedTerminalStreamService.getInstance();
