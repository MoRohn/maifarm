/**
 * Yield Detection Service
 *
 * Monitors terminal output and workspace changes to detect yield items in real-time.
 * Correlates outputs with user prompts to determine relevance and quality.
 */
import { EventEmitter } from 'events';
import { ParsedActivity, FileOperation } from './activityParser';
import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';
import { websocketManager } from '../websocket/websocketManager';
import { pathConfig } from '../config/paths';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface YieldItem {
  id: string;
  farmId: string;
  harvestId?: string;
  agentId: string;
  agentName: string;
  type: 'file' | 'code' | 'document' | 'data' | 'report' | 'test-result' | 'build-artifact' | 'configuration' | 'diagram';
  title: string;
  description: string;
  path: string;
  content?: string;
  preview?: string;
  metadata: {
    size: number;
    language?: string;
    linesOfCode?: number;
    createdAt: Date;
    modifiedAt?: Date;
    relevanceScore?: number;
    quality?: 'low' | 'medium' | 'high' | 'excellent';
    tags: string[];
    checksum?: string;
    mimeType?: string;
  };
  correlationData: {
    promptKeywords: string[];
    matchedKeywords: string[];
    context: string;
    confidence: number; // 0-1 confidence in correlation
  };
}

interface FarmContext {
  farmId: string;
  userPrompt: string;
  promptKeywords: string[];
  agentNames: Map<number, string>;
  detectedItems: Map<string, YieldItem>; // path -> item
  startTime: Date;
}

// ============================================================================
// Yield Detection Service
// ============================================================================

export class YieldDetectionService extends EventEmitter {
  private static instance: YieldDetectionService;
  private farms: Map<string, FarmContext> = new Map();
  private fileOperationHistory: Map<string, FileOperation[]> = new Map(); // farmId:path -> operations
  private cleanupTimers: Map<string, NodeJS.Timeout> = new Map(); // farmId -> timer

  // Maximum time a farm context can remain before automatic cleanup (4 hours)
  private readonly MAX_FARM_LIFETIME_MS = 4 * 60 * 60 * 1000;

  // Common file extensions and their categorization
  private readonly fileTypeMap: Record<string, YieldItem['type']> = {
    // Code files
    '.ts': 'code', '.tsx': 'code', '.js': 'code', '.jsx': 'code',
    '.py': 'code', '.java': 'code', '.go': 'code', '.rs': 'code',
    '.cpp': 'code', '.c': 'code', '.cs': 'code', '.php': 'code',
    '.rb': 'code', '.swift': 'code', '.kt': 'code', '.scala': 'code',
    '.r': 'code', '.m': 'code', '.h': 'code', '.hpp': 'code',

    // Documentation
    '.md': 'document', '.txt': 'document', '.doc': 'document',
    '.docx': 'document', '.pdf': 'document', '.tex': 'document',
    '.rst': 'document', '.org': 'document',

    // Data files
    '.json': 'data', '.yaml': 'data', '.yml': 'data', '.xml': 'data',
    '.csv': 'data', '.tsv': 'data', '.sql': 'data', '.db': 'data',
    '.sqlite': 'data', '.parquet': 'data',

    // Configuration
    '.env': 'configuration', '.ini': 'configuration', '.conf': 'configuration',
    '.cfg': 'configuration', '.toml': 'configuration', '.properties': 'configuration',

    // Diagrams
    '.svg': 'diagram', '.dot': 'diagram', '.puml': 'diagram',
    '.drawio': 'diagram', '.mermaid': 'diagram',

    // Build artifacts
    '.jar': 'build-artifact', '.war': 'build-artifact', '.dll': 'build-artifact',
    '.so': 'build-artifact', '.dylib': 'build-artifact', '.exe': 'build-artifact',
    '.wasm': 'build-artifact', '.min.js': 'build-artifact', '.min.css': 'build-artifact'
  };

  // Keywords that indicate test files
  private readonly testIndicators = ['test', 'spec', 'jest', 'cypress', 'playwright', 'mocha', 'jasmine'];

  // Keywords that indicate reports
  private readonly reportIndicators = ['report', 'summary', 'analysis', 'results', 'output', 'metrics'];

  private constructor() {
    super();
    // Run periodic cleanup every 30 minutes to catch orphaned farm contexts
    setInterval(() => this.cleanupStaleFarms(), 30 * 60 * 1000);
  }

  static getInstance(): YieldDetectionService {
    if (!this.instance) {
      this.instance = new YieldDetectionService();
    }
    return this.instance;
  }

  /**
   * Register a farm with its user prompt for correlation
   */
  registerFarm(farmId: string, userPrompt: string, agentNames: string[]): void {
    const promptKeywords = this.extractKeywords(userPrompt);

    const agentNamesMap = new Map<number, string>();
    agentNames.forEach((name, index) => {
      agentNamesMap.set(index, name);
    });

    this.farms.set(farmId, {
      farmId,
      userPrompt,
      promptKeywords,
      agentNames: agentNamesMap,
      detectedItems: new Map(),
      startTime: new Date()
    });

    // MEMORY LEAK FIX: Schedule automatic cleanup after MAX_FARM_LIFETIME_MS
    // This ensures farm contexts are cleaned up even if farm fails or times out
    this.scheduleAutoCleanup(farmId);

    logger.info(LogCategory.HARVEST,
      `Registered farm ${farmId} for yield detection with ${agentNames.length} agents`);
  }

  /**
   * Schedule automatic cleanup for a farm to prevent memory leaks
   */
  private scheduleAutoCleanup(farmId: string): void {
    // Clear any existing timer for this farm
    const existingTimer = this.cleanupTimers.get(farmId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule cleanup
    const timer = setTimeout(() => {
      logger.warn(LogCategory.HARVEST,
        `Auto-cleaning farm ${farmId} after ${this.MAX_FARM_LIFETIME_MS / 1000 / 60} minutes (timeout)`);
      this.cleanupFarm(farmId);
    }, this.MAX_FARM_LIFETIME_MS);

    this.cleanupTimers.set(farmId, timer);
  }

  /**
   * Clean up any stale farms that have been running too long
   */
  private cleanupStaleFarms(): void {
    const now = new Date();
    const staleFarms: string[] = [];

    for (const [farmId, context] of this.farms.entries()) {
      const ageMs = now.getTime() - context.startTime.getTime();
      if (ageMs > this.MAX_FARM_LIFETIME_MS) {
        staleFarms.push(farmId);
      }
    }

    if (staleFarms.length > 0) {
      logger.warn(LogCategory.HARVEST,
        `Cleaning up ${staleFarms.length} stale farm contexts`);
      staleFarms.forEach(farmId => this.cleanupFarm(farmId));
    }
  }

  /**
   * Analyze terminal activities to detect yield items
   */
  async analyzeActivities(
    farmId: string,
    agentId: number,
    activities: ParsedActivity[]
  ): Promise<YieldItem[]> {
    const farmContext = this.farms.get(farmId);
    if (!farmContext) {
      logger.warn(LogCategory.HARVEST, `Farm ${farmId} not registered for yield detection`);
      return [];
    }

    const detectedItems: YieldItem[] = [];
    const agentName = farmContext.agentNames.get(agentId) || `Agent ${agentId}`;

    for (const activity of activities) {
      // Process file operations
      if (activity.metadata.fileOperation) {
        const op = activity.metadata.fileOperation;
        this.trackFileOperation(farmId, op);

        // Only create yield items for create/edit operations
        if (op.type === 'create' || op.type === 'edit') {
          const yieldItem = await this.createYieldItem(
            farmContext,
            agentId.toString(),
            agentName,
            op.path,
            op
          );

          if (yieldItem && !farmContext.detectedItems.has(op.path)) {
            detectedItems.push(yieldItem);
            farmContext.detectedItems.set(op.path, yieldItem);
          }
        }
      }

      // Also check for files mentioned in tool_use activities
      if (activity.type === 'tool_use' && activity.metadata.files) {
        for (const filePath of activity.metadata.files) {
          // Check if this file exists and we haven't tracked it yet
          if (!farmContext.detectedItems.has(filePath)) {
            const yieldItem = await this.createYieldItem(
              farmContext,
              agentId.toString(),
              agentName,
              filePath
            );

            if (yieldItem) {
              detectedItems.push(yieldItem);
              farmContext.detectedItems.set(filePath, yieldItem);
            }
          }
        }
      }

      // Detect command outputs that might be yield items
      if (activity.type === 'command' && activity.metadata.command) {
        const cmd = activity.metadata.command;

        // Check for file creation commands
        if (cmd.includes('touch ') || cmd.includes('echo >') || cmd.includes('cat >')) {
          const fileMatch = cmd.match(/(?:touch|>|>>)\s+([^\s]+)/);
          if (fileMatch) {
            const filePath = fileMatch[1];
            const yieldItem = await this.createYieldItem(
              farmContext,
              agentId.toString(),
              agentName,
              filePath
            );

            if (yieldItem && !farmContext.detectedItems.has(filePath)) {
              detectedItems.push(yieldItem);
              farmContext.detectedItems.set(filePath, yieldItem);
            }
          }
        }
      }
    }

    // Broadcast detected items if any
    if (detectedItems.length > 0) {
      await this.broadcastYieldItems(farmId, detectedItems);
    }

    return detectedItems;
  }

  /**
   * Track file operation history
   */
  private trackFileOperation(farmId: string, operation: FileOperation): void {
    const key = `${farmId}:${operation.path}`;
    if (!this.fileOperationHistory.has(key)) {
      this.fileOperationHistory.set(key, []);
    }
    this.fileOperationHistory.get(key)!.push(operation);
  }

  /**
   * Create a yield item from file path
   */
  private async createYieldItem(
    farmContext: FarmContext,
    agentId: string,
    agentName: string,
    filePath: string,
    operation?: FileOperation
  ): Promise<YieldItem | null> {
    try {
      // Resolve the full path if relative
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(pathConfig.getWorkspacePath(farmContext.farmId), filePath);

      // Check if file exists
      try {
        await fs.access(fullPath);
      } catch {
        // File doesn't exist yet, skip
        return null;
      }

      // Get file stats
      const stats = await fs.stat(fullPath);

      // Skip directories
      if (stats.isDirectory()) {
        return null;
      }

      // Skip very large files (>10MB)
      if (stats.size > 10 * 1024 * 1024) {
        logger.warn(LogCategory.HARVEST, `Skipping large file ${fullPath} (${stats.size} bytes)`);
        return null;
      }

      // Read file content
      let content: string | undefined;
      let isBinary = false;

      try {
        content = await fs.readFile(fullPath, 'utf-8');
      } catch {
        // File is binary or unreadable
        isBinary = true;
      }

      // Determine file type
      const fileType = this.classifyFile(fullPath, content);

      // Skip certain file types
      if (this.shouldSkipFile(fullPath, fileType)) {
        return null;
      }

      // Calculate file hash
      const checksum = content
        ? createHash('md5').update(content).digest('hex')
        : undefined;

      // Extract metadata
      const language = this.detectLanguage(fullPath);
      const linesOfCode = content ? content.split('\n').length : 0;

      // Calculate relevance score
      const relevanceScore = this.calculateRelevance(
        fullPath,
        content || '',
        farmContext.userPrompt,
        farmContext.promptKeywords
      );

      // Generate preview
      const preview = this.generatePreview(content || '', fileType);

      // Extract tags
      const tags = this.extractTags(fullPath, content || '', farmContext.promptKeywords);

      // Analyze correlation
      const correlationData = this.analyzeCorrelation(
        fullPath,
        content || '',
        farmContext.userPrompt,
        farmContext.promptKeywords
      );

      // Assess quality
      const quality = this.assessQuality(content || '', relevanceScore, fileType);

      // Generate title and description
      const title = this.generateTitle(fullPath);
      const description = this.generateDescription(fullPath, content || '', fileType, language);

      // Create yield item
      const yieldItem: YieldItem = {
        id: `yield-${farmContext.farmId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        farmId: farmContext.farmId,
        agentId,
        agentName,
        type: fileType,
        title,
        description,
        path: filePath, // Store relative path
        content: content && content.length < 100000 ? content : undefined,
        preview,
        metadata: {
          size: stats.size,
          language,
          linesOfCode,
          createdAt: stats.birthtime || stats.ctime,
          modifiedAt: stats.mtime,
          relevanceScore,
          quality,
          tags,
          checksum,
          mimeType: this.getMimeType(fullPath)
        },
        correlationData
      };

      // Save to database
      await this.saveYieldItem(yieldItem);

      logger.info(LogCategory.HARVEST,
        `Detected yield item: ${title} (${fileType}) by ${agentName}`);

      return yieldItem;

    } catch (error) {
      logger.error(LogCategory.HARVEST, `Failed to create yield item for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Classify file type based on extension and content
   */
  private classifyFile(filePath: string, content?: string): YieldItem['type'] {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath).toLowerCase();

    // Check for test files
    if (this.testIndicators.some(indicator => basename.includes(indicator))) {
      return 'test-result';
    }

    // Check for report files
    if (this.reportIndicators.some(indicator => basename.includes(indicator))) {
      return 'report';
    }

    // Check by extension
    const typeByExt = this.fileTypeMap[ext];
    if (typeByExt) {
      return typeByExt;
    }

    // Check content for hints
    if (content) {
      // Check for shebang
      if (content.startsWith('#!')) {
        return 'code';
      }

      // Check for common code patterns
      if (content.match(/^(import |from |const |let |var |function |class |def |public |private )/m)) {
        return 'code';
      }

      // Check for data patterns
      if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
        return 'data';
      }

      // Check for markup
      if (content.includes('<!DOCTYPE') || content.includes('<html')) {
        return 'document';
      }
    }

    // Default based on path
    if (filePath.includes('dist/') || filePath.includes('build/')) {
      return 'build-artifact';
    }

    return 'file';
  }

  /**
   * Check if file should be skipped
   */
  private shouldSkipFile(filePath: string, fileType: YieldItem['type']): boolean {
    const basename = path.basename(filePath);

    // Skip hidden files
    if (basename.startsWith('.')) {
      return true;
    }

    // Skip node_modules, .git, etc.
    if (filePath.includes('node_modules/') ||
        filePath.includes('.git/') ||
        filePath.includes('.vscode/') ||
        filePath.includes('__pycache__/')) {
      return true;
    }

    // Skip lock files
    if (basename === 'package-lock.json' ||
        basename === 'yarn.lock' ||
        basename === 'Pipfile.lock') {
      return true;
    }

    // Skip temp files
    if (basename.endsWith('.tmp') ||
        basename.endsWith('.temp') ||
        basename.endsWith('.bak') ||
        basename.endsWith('~')) {
      return true;
    }

    return false;
  }

  /**
   * Detect programming language from file extension
   */
  private detectLanguage(filePath: string): string | undefined {
    const ext = path.extname(filePath).toLowerCase().substring(1);
    const languageMap: Record<string, string> = {
      'ts': 'TypeScript',
      'tsx': 'TypeScript React',
      'js': 'JavaScript',
      'jsx': 'JavaScript React',
      'py': 'Python',
      'java': 'Java',
      'go': 'Go',
      'rs': 'Rust',
      'cpp': 'C++',
      'c': 'C',
      'cs': 'C#',
      'php': 'PHP',
      'rb': 'Ruby',
      'swift': 'Swift',
      'kt': 'Kotlin',
      'scala': 'Scala',
      'r': 'R',
      'lua': 'Lua',
      'dart': 'Dart',
      'sh': 'Shell',
      'bash': 'Bash',
      'ps1': 'PowerShell',
      'sql': 'SQL',
      'html': 'HTML',
      'css': 'CSS',
      'scss': 'SCSS',
      'sass': 'Sass',
      'less': 'Less',
      'vue': 'Vue',
      'svelte': 'Svelte'
    };
    return languageMap[ext];
  }

  /**
   * Calculate relevance score based on prompt correlation
   */
  private calculateRelevance(
    filePath: string,
    content: string,
    userPrompt: string,
    promptKeywords: string[]
  ): number {
    if (!userPrompt || promptKeywords.length === 0) {
      return 0.5; // Default neutral relevance
    }

    let score = 0;
    let factors = 0;

    // Check file name relevance
    const fileName = path.basename(filePath).toLowerCase();
    const fileNameMatches = promptKeywords.filter(kw =>
      fileName.includes(kw.toLowerCase())
    );
    if (fileNameMatches.length > 0) {
      score += 0.4 * (fileNameMatches.length / promptKeywords.length);
      factors++;
    }

    // Check content relevance
    const contentLower = content.toLowerCase();
    const contentMatches = promptKeywords.filter(kw =>
      contentLower.includes(kw.toLowerCase())
    );
    if (contentMatches.length > 0) {
      score += 0.6 * (contentMatches.length / promptKeywords.length);
      factors++;
    }

    // Check for semantic patterns
    // If prompt mentions "test", boost test files
    if (userPrompt.toLowerCase().includes('test') && filePath.includes('test')) {
      score += 0.2;
      factors++;
    }

    // If prompt mentions "api", boost API-related files
    if (userPrompt.toLowerCase().includes('api') &&
        (filePath.includes('api') || content.includes('endpoint') || content.includes('route'))) {
      score += 0.2;
      factors++;
    }

    // If prompt mentions "frontend" or "ui", boost UI files
    if ((userPrompt.toLowerCase().includes('frontend') || userPrompt.toLowerCase().includes('ui')) &&
        (filePath.includes('component') || filePath.includes('view') || filePath.includes('.tsx') || filePath.includes('.jsx'))) {
      score += 0.2;
      factors++;
    }

    return factors > 0 ? Math.min(score / factors, 1.0) : 0.3;
  }

  /**
   * Generate preview for file content
   */
  private generatePreview(content: string, fileType: YieldItem['type']): string {
    if (!content) return '';

    const maxLength = 500;

    switch (fileType) {
      case 'code':
        // Get first non-comment, non-empty lines
        const codeLines = content.split('\n')
          .filter(line => line.trim() && !line.trim().startsWith('//') && !line.trim().startsWith('#'))
          .slice(0, 10);
        return codeLines.join('\n').substring(0, maxLength);

      case 'document':
        // Get first paragraph or section
        const firstParagraph = content.split('\n\n')[0];
        return firstParagraph.substring(0, maxLength);

      case 'data':
        // Pretty print JSON if possible
        try {
          const parsed = JSON.parse(content);
          return JSON.stringify(parsed, null, 2).substring(0, maxLength);
        } catch {
          return content.substring(0, maxLength);
        }

      default:
        return content.substring(0, maxLength);
    }
  }

  /**
   * Generate human-readable title
   */
  private generateTitle(filePath: string): string {
    const basename = path.basename(filePath, path.extname(filePath));

    // Convert snake_case, kebab-case, or camelCase to Title Case
    return basename
      .replace(/[_-]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Generate description based on file analysis
   */
  private generateDescription(
    filePath: string,
    content: string,
    fileType: YieldItem['type'],
    language?: string
  ): string {
    const fileName = path.basename(filePath);

    switch (fileType) {
      case 'code':
        // Try to extract first comment or docstring
        const commentMatch = content.match(/^\/\*\*([\s\S]*?)\*\/|^\/\/(.*?)$/m);
        if (commentMatch) {
          const comment = commentMatch[1] || commentMatch[2];
          return comment.trim().split('\n')[0].substring(0, 200);
        }
        return `${language || 'Code'} implementation file`;

      case 'test-result':
        // Look for pass/fail indicators
        const passed = content.match(/pass|passed|✓|✔|success/gi)?.length || 0;
        const failed = content.match(/fail|failed|✗|✖|error/gi)?.length || 0;
        if (passed || failed) {
          return `Test results: ${passed} passed, ${failed} failed`;
        }
        return 'Test results file';

      case 'document':
        // Extract title if markdown
        if (fileName.endsWith('.md')) {
          const titleMatch = content.match(/^#\s+(.+)$/m);
          if (titleMatch) {
            return titleMatch[1];
          }
        }
        return 'Documentation file';

      case 'data':
        const lines = content.split('\n').length;
        return `Data file with ${lines} lines`;

      case 'configuration':
        return `Configuration file for ${path.dirname(filePath).split('/').pop() || 'project'}`;

      case 'build-artifact':
        return `Build output from compilation/bundling process`;

      default:
        return `${fileType} file`;
    }
  }

  /**
   * Extract relevant tags
   */
  private extractTags(filePath: string, content: string, promptKeywords: string[]): string[] {
    const tags = new Set<string>();

    // Add language tag
    const language = this.detectLanguage(filePath);
    if (language) {
      tags.add(language);
    }

    // Add path-based tags
    const pathParts = filePath.toLowerCase().split('/');
    ['api', 'frontend', 'backend', 'test', 'component', 'service', 'util', 'model', 'view', 'controller']
      .forEach(keyword => {
        if (pathParts.some(part => part.includes(keyword))) {
          tags.add(keyword);
        }
      });

    // Add prompt-based tags (top 3)
    promptKeywords.slice(0, 3).forEach(kw => tags.add(kw.toLowerCase()));

    // Add content-based tags
    if (content.includes('async') || content.includes('await')) {
      tags.add('async');
    }
    if (content.includes('test(') || content.includes('describe(') || content.includes('it(')) {
      tags.add('testing');
    }
    if (content.includes('useState') || content.includes('useEffect')) {
      tags.add('react');
    }
    if (content.includes('SELECT') || content.includes('INSERT') || content.includes('UPDATE')) {
      tags.add('database');
    }

    return Array.from(tags);
  }

  /**
   * Analyze correlation with user prompt
   */
  private analyzeCorrelation(
    filePath: string,
    content: string,
    userPrompt: string,
    promptKeywords: string[]
  ): YieldItem['correlationData'] {
    const fileAndContent = `${filePath} ${content}`.toLowerCase();

    const matchedKeywords = promptKeywords.filter(kw =>
      fileAndContent.includes(kw.toLowerCase())
    );

    const confidence = matchedKeywords.length > 0
      ? Math.min(matchedKeywords.length / promptKeywords.length, 1.0)
      : 0.2;

    let context = '';
    if (matchedKeywords.length > 0) {
      context = `This file is relevant because it contains: ${matchedKeywords.join(', ')}`;
    } else {
      context = 'This file was created as part of the task execution';
    }

    return {
      promptKeywords,
      matchedKeywords,
      context,
      confidence
    };
  }

  /**
   * Assess quality based on various factors
   */
  private assessQuality(
    content: string,
    relevanceScore: number,
    fileType: YieldItem['type']
  ): 'low' | 'medium' | 'high' | 'excellent' {
    // Base quality on content size and relevance
    const size = content.length;

    if (relevanceScore > 0.8) {
      if (size > 1000) return 'excellent';
      if (size > 500) return 'high';
      return 'medium';
    }

    if (relevanceScore > 0.5) {
      if (size > 500) return 'high';
      if (size > 100) return 'medium';
      return 'low';
    }

    // For code files, check for structure
    if (fileType === 'code') {
      const hasComments = content.includes('//') || content.includes('/*');
      const hasFunctions = content.match(/function|def|func|method/gi);
      const hasClasses = content.match(/class|interface|struct/gi);

      const qualityFactors = [
        hasComments ? 1 : 0,
        hasFunctions ? 1 : 0,
        hasClasses ? 1 : 0,
        size > 500 ? 1 : 0
      ].reduce((a, b) => a + b, 0);

      if (qualityFactors >= 3) return 'high';
      if (qualityFactors >= 2) return 'medium';
      return 'low';
    }

    // Default assessment
    if (size > 500) return 'medium';
    return 'low';
  }

  /**
   * Get MIME type for file
   */
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.zip': 'application/zip'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
      'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must', 'can', 'shall',
      'that', 'this', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we',
      'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all',
      'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
      'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very'
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 20); // Top 20 keywords
  }

  /**
   * Save yield item to database
   */
  private async saveYieldItem(item: YieldItem): Promise<void> {
    try {
      await db.query(`
        INSERT INTO harvest_yield (
          id, harvest_id, farm_id, agent_id, agent_name, type, title,
          description, path, preview, metadata, correlation_data, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE SET
          metadata = $11::jsonb,
          correlation_data = $12::jsonb,
          updated_at = NOW()
      `, [
        item.id,
        item.harvestId || null,
        item.farmId,
        item.agentId,
        item.agentName,
        item.type,
        item.title,
        item.description,
        item.path,
        item.preview,
        JSON.stringify(item.metadata),
        JSON.stringify(item.correlationData)
      ]);

      logger.debug(LogCategory.HARVEST, `Saved yield item ${item.id} to database`);
    } catch (error) {
      logger.error(LogCategory.HARVEST, `Failed to save yield item ${item.id}:`, error);
    }
  }

  /**
   * Broadcast yield items to WebSocket clients
   */
  private async broadcastYieldItems(farmId: string, items: YieldItem[]): Promise<void> {
    const farmContext = this.farms.get(farmId);
    if (!farmContext) return;

    const payload = {
      farmId,
      items,
      totalCount: farmContext.detectedItems.size,
      timestamp: new Date().toISOString()
    };

    websocketManager.sendToRoom(`farm:${farmId}`, 'yield:detected', payload);

    logger.info(LogCategory.HARVEST,
      `Broadcasted ${items.length} yield items for farm ${farmId}`);

    // Emit local event
    this.emit('yield:detected', { farmId, items });
  }

  /**
   * Get all yield items for a farm
   */
  getYieldItems(farmId: string): YieldItem[] {
    const farmContext = this.farms.get(farmId);
    if (!farmContext) {
      return [];
    }
    return Array.from(farmContext.detectedItems.values());
  }

  /**
   * Link yield items to harvest
   */
  async linkYieldItemsToHarvest(farmId: string, harvestId: string): Promise<void> {
    try {
      await db.query(`
        UPDATE harvest_yield
        SET harvest_id = $1
        WHERE farm_id = $2 AND harvest_id IS NULL
      `, [harvestId, farmId]);

      logger.info(LogCategory.HARVEST,
        `Linked yield items for farm ${farmId} to harvest ${harvestId}`);
    } catch (error) {
      logger.error(LogCategory.HARVEST,
        `Failed to link yield items to harvest:`, error);
      // FIX: Rethrow error so callers can handle appropriately (e.g., log warning or retry)
      throw error;
    }
  }

  /**
   * Clean up farm data
   */
  cleanupFarm(farmId: string): void {
    // Cancel any pending auto-cleanup timer
    const timer = this.cleanupTimers.get(farmId);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(farmId);
    }

    // Clean up farm context
    this.farms.delete(farmId);

    // Clean up file operation history
    const keysToDelete: string[] = [];
    for (const key of this.fileOperationHistory.keys()) {
      if (key.startsWith(`${farmId}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.fileOperationHistory.delete(key));

    logger.info(LogCategory.HARVEST, `Cleaned up yield detection data for farm ${farmId}`);
  }

  /**
   * Get yield statistics for a farm
   */
  getYieldStatistics(farmId: string): {
    totalItems: number;
    byType: Record<string, number>;
    byAgent: Record<string, number>;
    byQuality: Record<string, number>;
    averageRelevance: number;
  } {
    const items = this.getYieldItems(farmId);

    if (items.length === 0) {
      return {
        totalItems: 0,
        byType: {},
        byAgent: {},
        byQuality: {},
        averageRelevance: 0
      };
    }

    const byType: Record<string, number> = {};
    const byAgent: Record<string, number> = {};
    const byQuality: Record<string, number> = {};
    let totalRelevance = 0;

    for (const item of items) {
      // Count by type
      byType[item.type] = (byType[item.type] || 0) + 1;

      // Count by agent
      byAgent[item.agentName] = (byAgent[item.agentName] || 0) + 1;

      // Count by quality
      const quality = item.metadata.quality || 'unknown';
      byQuality[quality] = (byQuality[quality] || 0) + 1;

      // Sum relevance
      totalRelevance += item.metadata.relevanceScore || 0;
    }

    return {
      totalItems: items.length,
      byType,
      byAgent,
      byQuality,
      averageRelevance: totalRelevance / items.length
    };
  }
}

// Export singleton instance
export const yieldDetectionService = YieldDetectionService.getInstance();