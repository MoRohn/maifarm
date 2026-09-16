/**
 * Intelligent Yield Detection Service
 *
 * Advanced yield detection with AI context awareness, automatic categorization,
 * and quality scoring based on user prompts.
 */

import { EventEmitter } from 'events';
import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';
import { unifiedWebSocketManager } from '../websocket/UnifiedWebSocketManager';
import { pathConfig } from '../config/paths';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface IntelligentYield {
  id: string;
  farmId: string;
  harvestId?: string;
  agentId: number;
  agentName: string;

  // Core properties
  type: 'code' | 'test' | 'documentation' | 'configuration' | 'data' | 'api' | 'ui_component' | 'database' | 'deployment' | 'analysis';
  category: 'implementation' | 'testing' | 'documentation' | 'infrastructure' | 'research' | 'optimization';

  // Content details
  title: string;
  description: string;
  path: string;
  content?: string;
  preview: string;

  // Quality metrics
  quality: {
    score: number; // 0-100
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    confidence: number; // 0-1
    completeness: number; // 0-100
    correctness: number; // 0-100
    readability: number; // 0-100
    performance: number; // 0-100
  };

  // Metadata
  metadata: {
    size: number;
    language?: string;
    framework?: string;
    dependencies?: string[];
    linesOfCode?: number;
    complexity?: number;
    createdAt: Date;
    modifiedAt?: Date;
    checksum: string;
    mimeType?: string;
    encoding?: string;
  };

  // Prompt correlation
  correlation: {
    promptKeywords: string[];
    matchedKeywords: string[];
    contextSnippets: string[];
    relevanceScore: number; // 0-100
    confidence: number; // 0-1
    reasoning: string;
  };

  // Relationships
  relationships: {
    dependsOn?: string[]; // IDs of other yields
    usedBy?: string[]; // IDs of yields that use this
    relatedTo?: string[]; // IDs of related yields
    parentYield?: string; // ID of parent yield if this is a sub-component
  };

  // Tags and classification
  tags: string[];
  autoTags: string[];
  userTags?: string[];

  // Incubation potential
  incubation: {
    canIncubate: boolean;
    suggestedPrompts: string[];
    improvementAreas: string[];
    estimatedEffort: 'low' | 'medium' | 'high';
  };
}

interface PromptAnalysis {
  intent: 'create' | 'modify' | 'fix' | 'analyze' | 'optimize' | 'test' | 'document';
  domain: string;
  technologies: string[];
  requirements: string[];
  expectedOutputs: string[];
  keywords: string[];
  complexity: 'simple' | 'moderate' | 'complex' | 'advanced';
}

interface YieldContext {
  farmId: string;
  harvestId?: string;
  userPrompt: string;
  promptAnalysis: PromptAnalysis;
  agentMap: Map<number, string>;
  detectedYields: Map<string, IntelligentYield>;
  yieldGraph: Map<string, Set<string>>; // Relationship graph
  startTime: Date;
}

// ============================================================================
// Intelligent Yield Detection Service
// ============================================================================

export class IntelligentYieldDetectionService extends EventEmitter {
  private static instance: IntelligentYieldDetectionService;
  private contexts: Map<string, YieldContext> = new Map();
  private yieldPatterns: Map<string, RegExp>;
  private qualityRules: Map<string, (yieldItem: IntelligentYield) => number>;

  private constructor() {
    super();
    this.initializePatterns();
    this.initializeQualityRules();
  }

  public static getInstance(): IntelligentYieldDetectionService {
    if (!IntelligentYieldDetectionService.instance) {
      IntelligentYieldDetectionService.instance = new IntelligentYieldDetectionService();
    }
    return IntelligentYieldDetectionService.instance;
  }

  private initializePatterns(): void {
    this.yieldPatterns = new Map([
      ['api_endpoint', /(?:app\.(get|post|put|delete|patch)|router\.(get|post|put|delete|patch))\(['"]([^'"]+)['"]/gi],
      ['react_component', /(?:export\s+(?:default\s+)?(?:function|const)\s+(\w+).*?:\s*(?:React\.)?FC|Component)/gi],
      ['database_schema', /(?:CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+INDEX)\s+(\w+)/gi],
      ['test_suite', /(?:describe|test|it)\(['"]([^'"]+)['"]/gi],
      ['configuration', /(?:export\s+(?:default\s+)?(?:const|let|var)\s+(\w+Config|\w+Settings))/gi],
      ['class_definition', /(?:export\s+)?class\s+(\w+)/gi],
      ['function_export', /export\s+(?:async\s+)?function\s+(\w+)/gi],
      ['interface_type', /(?:interface|type)\s+(\w+)/gi],
    ]);
  }

  private initializeQualityRules(): void {
    this.qualityRules = new Map([
      ['has_tests', (y) => y.type === 'test' || y.tags.includes('tested') ? 20 : 0],
      ['has_documentation', (y) => y.type === 'documentation' || y.content?.includes('/**') ? 15 : 0],
      ['follows_conventions', (y) => this.checkNamingConventions(y) ? 15 : 0],
      ['no_errors', (y) => !y.content?.match(/error|exception|failed/i) ? 10 : 0],
      ['has_types', (y) => y.metadata.language === 'TypeScript' ? 10 : 5],
      ['reasonable_size', (y) => y.metadata.linesOfCode && y.metadata.linesOfCode < 500 ? 10 : 5],
      ['low_complexity', (y) => (y.metadata.complexity || 0) < 10 ? 10 : 5],
      ['prompt_alignment', (y) => y.correlation.relevanceScore > 80 ? 10 : 5],
    ]);
  }

  // ============================================================================
  // Farm Context Management
  // ============================================================================

  public async initializeFarm(
    farmId: string,
    userPrompt: string,
    agentNames: Map<number, string>,
    harvestId?: string
  ): Promise<void> {
    const promptAnalysis = await this.analyzePrompt(userPrompt);

    const context: YieldContext = {
      farmId,
      harvestId,
      userPrompt,
      promptAnalysis,
      agentMap: agentNames,
      detectedYields: new Map(),
      yieldGraph: new Map(),
      startTime: new Date()
    };

    this.contexts.set(farmId, context);

    logger.info(LogCategory.TERMINAL, `Initialized intelligent yield detection for farm ${farmId}`);
    logger.info(LogCategory.TERMINAL, `Prompt analysis: ${JSON.stringify(promptAnalysis)}`);

    // Emit initialization event
    this.emit('farm:initialized', {
      farmId,
      promptAnalysis,
      expectedOutputs: promptAnalysis.expectedOutputs
    });
  }

  // ============================================================================
  // Prompt Analysis
  // ============================================================================

  private async analyzePrompt(prompt: string): Promise<PromptAnalysis> {
    const lowerPrompt = prompt.toLowerCase();

    // Detect intent
    let intent: PromptAnalysis['intent'] = 'create';
    if (lowerPrompt.includes('fix') || lowerPrompt.includes('debug')) intent = 'fix';
    else if (lowerPrompt.includes('modify') || lowerPrompt.includes('update')) intent = 'modify';
    else if (lowerPrompt.includes('analyze') || lowerPrompt.includes('review')) intent = 'analyze';
    else if (lowerPrompt.includes('optimize') || lowerPrompt.includes('improve')) intent = 'optimize';
    else if (lowerPrompt.includes('test') || lowerPrompt.includes('spec')) intent = 'test';
    else if (lowerPrompt.includes('document') || lowerPrompt.includes('readme')) intent = 'document';

    // Extract domain
    const domainPatterns = {
      'web': /web|website|frontend|ui|ux|page|site/i,
      'api': /api|endpoint|rest|graphql|backend|server/i,
      'database': /database|db|sql|mongo|postgres|mysql/i,
      'mobile': /mobile|ios|android|react native|flutter/i,
      'desktop': /desktop|electron|native/i,
      'cli': /cli|command|terminal|console/i,
      'ml': /machine learning|ml|ai|neural|model/i,
      'devops': /devops|ci|cd|deploy|docker|kubernetes/i,
    };

    let domain = 'general';
    for (const [key, pattern] of Object.entries(domainPatterns)) {
      if (pattern.test(prompt)) {
        domain = key;
        break;
      }
    }

    // Extract technologies
    const technologies = this.extractTechnologies(prompt);

    // Extract requirements
    const requirements = this.extractRequirements(prompt);

    // Predict expected outputs
    const expectedOutputs = this.predictExpectedOutputs(intent, domain, technologies, prompt);

    // Extract keywords
    const keywords = this.extractKeywords(prompt);

    // Assess complexity
    const complexity = this.assessComplexity(prompt, requirements, technologies);

    return {
      intent,
      domain,
      technologies,
      requirements,
      expectedOutputs,
      keywords,
      complexity
    };
  }

  private extractTechnologies(prompt: string): string[] {
    const techPatterns = [
      'react', 'vue', 'angular', 'svelte', 'next.js', 'nuxt', 'gatsby',
      'node', 'express', 'fastify', 'nest', 'koa', 'hapi',
      'typescript', 'javascript', 'python', 'java', 'go', 'rust', 'c#', 'ruby',
      'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'dynamodb',
      'docker', 'kubernetes', 'terraform', 'ansible', 'jenkins',
      'aws', 'gcp', 'azure', 'vercel', 'netlify', 'heroku',
      'graphql', 'rest', 'websocket', 'grpc', 'mqtt',
      'jest', 'mocha', 'cypress', 'playwright', 'selenium',
      'webpack', 'vite', 'rollup', 'parcel', 'esbuild',
      'tailwind', 'styled-components', 'sass', 'css', 'material-ui', 'chakra-ui'
    ];

    const found: string[] = [];
    const lowerPrompt = prompt.toLowerCase();

    for (const tech of techPatterns) {
      if (lowerPrompt.includes(tech)) {
        found.push(tech);
      }
    }

    return found;
  }

  private extractRequirements(prompt: string): string[] {
    const requirements: string[] = [];

    // Look for specific requirement patterns
    const patterns = [
      /should\s+([^,.]+)/gi,
      /must\s+([^,.]+)/gi,
      /need(?:s)?\s+to\s+([^,.]+)/gi,
      /require(?:s)?\s+([^,.]+)/gi,
      /implement\s+([^,.]+)/gi,
      /create\s+([^,.]+)/gi,
      /add\s+([^,.]+)/gi,
      /include\s+([^,.]+)/gi,
    ];

    for (const pattern of patterns) {
      const matches = prompt.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          requirements.push(match[1].trim());
        }
      }
    }

    // Also look for feature lists
    const listMatch = prompt.match(/(?:features?|functionality):\s*([^.]+)/i);
    if (listMatch) {
      const items = listMatch[1].split(/[,;]/).map(item => item.trim());
      requirements.push(...items);
    }

    return [...new Set(requirements)]; // Remove duplicates
  }

  private predictExpectedOutputs(
    intent: PromptAnalysis['intent'],
    domain: string,
    technologies: string[],
    prompt: string
  ): string[] {
    const outputs: string[] = [];

    // Based on intent
    switch (intent) {
      case 'create':
        outputs.push('implementation files', 'main functionality');
        break;
      case 'test':
        outputs.push('test files', 'test results', 'coverage report');
        break;
      case 'document':
        outputs.push('README', 'documentation', 'API docs', 'comments');
        break;
      case 'fix':
        outputs.push('bug fixes', 'error resolution', 'corrected code');
        break;
      case 'optimize':
        outputs.push('optimized code', 'performance improvements', 'benchmarks');
        break;
    }

    // Based on domain
    switch (domain) {
      case 'web':
        outputs.push('components', 'styles', 'layouts', 'routes');
        break;
      case 'api':
        outputs.push('endpoints', 'controllers', 'middleware', 'schemas');
        break;
      case 'database':
        outputs.push('migrations', 'models', 'queries', 'indexes');
        break;
      case 'devops':
        outputs.push('config files', 'pipelines', 'scripts', 'manifests');
        break;
    }

    // Based on technologies
    if (technologies.includes('react')) outputs.push('React components', 'hooks');
    if (technologies.includes('docker')) outputs.push('Dockerfile', 'docker-compose.yml');
    if (technologies.includes('typescript')) outputs.push('TypeScript definitions', 'interfaces');
    if (technologies.some(t => ['jest', 'mocha', 'cypress'].includes(t))) outputs.push('test suites');

    // Look for explicit output mentions
    const outputPatterns = [
      /generate\s+(?:a\s+)?([^\s,]+)/gi,
      /create\s+(?:a\s+)?([^\s,]+)/gi,
      /build\s+(?:a\s+)?([^\s,]+)/gi,
      /output\s+(?:a\s+)?([^\s,]+)/gi,
    ];

    for (const pattern of outputPatterns) {
      const matches = prompt.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) outputs.push(match[1]);
      }
    }

    return [...new Set(outputs)];
  }

  private extractKeywords(prompt: string): string[] {
    // Remove common words
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'can', 'shall', 'that',
      'this', 'these', 'those', 'i', 'you', 'we', 'they', 'it', 'me'
    ]);

    const words = prompt.toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    // Prioritize technical terms
    const technicalWeight = new Map<string, number>();

    for (const word of words) {
      let weight = 1;

      // Increase weight for technical terms
      if (word.match(/^(api|auth|database|server|client|test|config|component|service|model|controller)/)) weight = 3;
      if (word.includes('-') || word.includes('_')) weight = 2; // Compound words
      if (word.match(/\d/)) weight = 2; // Contains numbers

      technicalWeight.set(word, (technicalWeight.get(word) || 0) + weight);
    }

    // Sort by weight and return top keywords
    return Array.from(technicalWeight.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
  }

  private assessComplexity(
    prompt: string,
    requirements: string[],
    technologies: string[]
  ): PromptAnalysis['complexity'] {
    let score = 0;

    // Length of prompt
    if (prompt.length > 500) score += 2;
    else if (prompt.length > 200) score += 1;

    // Number of requirements
    if (requirements.length > 10) score += 3;
    else if (requirements.length > 5) score += 2;
    else if (requirements.length > 2) score += 1;

    // Number of technologies
    if (technologies.length > 5) score += 2;
    else if (technologies.length > 2) score += 1;

    // Complex keywords
    const complexKeywords = [
      'distributed', 'scalable', 'microservice', 'real-time', 'concurrent',
      'parallel', 'async', 'machine learning', 'ai', 'blockchain',
      'encryption', 'security', 'authentication', 'authorization',
      'optimization', 'performance', 'architecture', 'design pattern'
    ];

    const lowerPrompt = prompt.toLowerCase();
    for (const keyword of complexKeywords) {
      if (lowerPrompt.includes(keyword)) score += 1;
    }

    // Determine complexity level
    if (score >= 8) return 'advanced';
    if (score >= 5) return 'complex';
    if (score >= 2) return 'moderate';
    return 'simple';
  }

  // ============================================================================
  // Yield Detection
  // ============================================================================

  public async detectYield(
    farmId: string,
    agentId: number,
    filePath: string,
    content: string,
    activity?: string
  ): Promise<IntelligentYield | null> {
    const context = this.contexts.get(farmId);
    if (!context) {
      logger.warn(LogCategory.TERMINAL, `No context found for farm ${farmId}`);
      return null;
    }

    // Generate unique ID
    const yieldId = createHash('sha256')
      .update(`${farmId}-${agentId}-${filePath}-${Date.now()}`)
      .digest('hex')
      .substring(0, 12);

    // Determine yield type and category
    const type = this.determineYieldType(filePath, content);
    const category = this.determineCategory(type, context.promptAnalysis);

    // Extract metadata
    const metadata = await this.extractMetadata(filePath, content);

    // Calculate correlation with prompt
    const correlation = this.calculateCorrelation(content, filePath, context);

    // Only proceed if correlation is significant
    if (correlation.relevanceScore < 30) {
      logger.debug(LogCategory.TERMINAL, `Low relevance yield ignored: ${filePath} (score: ${correlation.relevanceScore})`);
      return null;
    }

    // Generate preview
    const preview = this.generatePreview(content, type);

    // Extract tags
    const autoTags = this.extractAutoTags(content, filePath, type, context.promptAnalysis);

    // Calculate quality metrics
    const quality = this.calculateQuality(content, type, correlation, metadata);

    // Determine incubation potential
    const incubation = this.assessIncubationPotential(type, quality, context.promptAnalysis);

    // Create yield object
    const yieldItem: IntelligentYield = {
      id: yieldId,
      farmId,
      harvestId: context.harvestId,
      agentId,
      agentName: context.agentMap.get(agentId) || `Agent ${agentId}`,
      type,
      category,
      title: this.generateTitle(filePath, type, content),
      description: this.generateDescription(content, type, activity),
      path: filePath,
      content: content.substring(0, 50000), // Limit content size
      preview,
      quality,
      metadata,
      correlation,
      relationships: {
        dependsOn: [],
        usedBy: [],
        relatedTo: []
      },
      tags: [...new Set([...autoTags, ...context.promptAnalysis.technologies])],
      autoTags,
      incubation
    };

    // Detect relationships with other yields
    this.detectRelationships(yieldItem, context);

    // Store in context
    context.detectedYields.set(yieldId, yieldItem);

    // Broadcast yield detection
    await this.broadcastYieldDetection(yieldItem);

    // Emit event
    this.emit('yield:detected', yieldItem);

    logger.info(LogCategory.TERMINAL, `Detected intelligent yield: ${yieldItem.title} (quality: ${quality.grade}, relevance: ${correlation.relevanceScore})`);

    return yieldItem;
  }

  private determineYieldType(filePath: string, content: string): IntelligentYield['type'] {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath).toLowerCase();

    // Check for test files
    if (fileName.includes('test') || fileName.includes('spec')) return 'test';

    // Check for documentation
    if (['.md', '.txt', '.rst', '.adoc'].includes(ext)) return 'documentation';

    // Check for configuration
    if (['.json', '.yaml', '.yml', '.toml', '.ini', '.env'].includes(ext) ||
        fileName.includes('config')) return 'configuration';

    // Check for UI components
    if (['.tsx', '.jsx'].includes(ext) && content.includes('return (')) return 'ui_component';

    // Check for API definitions
    if (content.match(/app\.(get|post|put|delete|patch)|router\.(get|post|put|delete|patch)/)) return 'api';

    // Check for database files
    if (ext === '.sql' || content.includes('CREATE TABLE')) return 'database';

    // Check for deployment files
    if (fileName.includes('dockerfile') || fileName.includes('docker-compose') ||
        ext === '.yaml' && content.includes('apiVersion')) return 'deployment';

    // Check for data files
    if (['.csv', '.tsv', '.parquet', '.json', '.xml'].includes(ext)) return 'data';

    // Default to code for programming files
    if (['.ts', '.js', '.py', '.java', '.go', '.rs', '.cpp', '.c'].includes(ext)) return 'code';

    // Check content for analysis/reports
    if (content.includes('Analysis') || content.includes('Report') ||
        content.includes('Results')) return 'analysis';

    return 'code'; // Default
  }

  private determineCategory(
    type: IntelligentYield['type'],
    promptAnalysis: PromptAnalysis
  ): IntelligentYield['category'] {
    // Map type to category
    const typeMap: Record<IntelligentYield['type'], IntelligentYield['category']> = {
      'code': 'implementation',
      'test': 'testing',
      'documentation': 'documentation',
      'configuration': 'infrastructure',
      'data': 'research',
      'api': 'implementation',
      'ui_component': 'implementation',
      'database': 'infrastructure',
      'deployment': 'infrastructure',
      'analysis': 'research'
    };

    // Override based on prompt intent
    if (promptAnalysis.intent === 'optimize') return 'optimization';
    if (promptAnalysis.intent === 'test') return 'testing';
    if (promptAnalysis.intent === 'document') return 'documentation';

    return typeMap[type] || 'implementation';
  }

  private async extractMetadata(filePath: string, content: string): Promise<IntelligentYield['metadata']> {
    const stats = {
      size: Buffer.byteLength(content, 'utf-8'),
      checksum: createHash('sha256').update(content).digest('hex'),
      createdAt: new Date(),
      mimeType: this.getMimeType(filePath),
      encoding: 'utf-8'
    };

    // Extract language
    const ext = path.extname(filePath).toLowerCase();
    const language = this.getLanguage(ext);

    // Count lines of code
    const lines = content.split('\n');
    const linesOfCode = lines.filter(line => line.trim() && !line.trim().startsWith('//')).length;

    // Calculate complexity (simplified McCabe complexity)
    const complexity = this.calculateComplexity(content);

    // Detect framework
    const framework = this.detectFramework(content, language);

    // Extract dependencies
    const dependencies = this.extractDependencies(content, language);

    return {
      ...stats,
      language,
      framework,
      dependencies,
      linesOfCode,
      complexity
    };
  }

  private calculateComplexity(content: string): number {
    // Simplified cyclomatic complexity calculation
    let complexity = 1;

    // Count decision points
    const decisionPatterns = [
      /\bif\b/g,
      /\belse\s+if\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /\&\&/g,
      /\|\|/g,
      /\?.*:/g // Ternary operators
    ];

    for (const pattern of decisionPatterns) {
      const matches = content.match(pattern);
      if (matches) complexity += matches.length;
    }

    return Math.min(complexity, 100); // Cap at 100
  }

  private detectFramework(content: string, language?: string): string | undefined {
    const frameworkPatterns: Record<string, RegExp> = {
      'React': /import.*from ['"]react['"]/,
      'Vue': /import.*from ['"]vue['"]/,
      'Angular': /import.*from ['"]@angular/,
      'Express': /require\(['"]express['"]|import.*from ['"]express['"]/,
      'Django': /from django/,
      'Flask': /from flask/,
      'Spring': /@SpringBootApplication|@RestController/,
      'Rails': /class.*<.*ApplicationController|Rails\./,
      'Next.js': /import.*from ['"]next\//,
      'Svelte': /import.*from ['"]svelte/,
    };

    for (const [framework, pattern] of Object.entries(frameworkPatterns)) {
      if (pattern.test(content)) return framework;
    }

    return undefined;
  }

  private extractDependencies(content: string, language?: string): string[] {
    const deps = new Set<string>();

    // JavaScript/TypeScript imports
    const jsImports = content.matchAll(/import.*from ['"]([^'"]+)['"]/g);
    for (const match of jsImports) {
      if (match[1] && !match[1].startsWith('.')) {
        deps.add(match[1].split('/')[0]);
      }
    }

    // Python imports
    const pyImports = content.matchAll(/(?:from|import)\s+(\w+)/g);
    for (const match of pyImports) {
      if (match[1]) deps.add(match[1]);
    }

    // Package.json style
    const packageMatch = content.match(/"dependencies":\s*{([^}]+)}/);
    if (packageMatch) {
      const depMatches = packageMatch[1].matchAll(/"([^"]+)":/g);
      for (const match of depMatches) {
        if (match[1]) deps.add(match[1]);
      }
    }

    return Array.from(deps);
  }

  private calculateCorrelation(
    content: string,
    filePath: string,
    context: YieldContext
  ): IntelligentYield['correlation'] {
    const { promptAnalysis, userPrompt } = context;
    const lowerContent = content.toLowerCase();
    const lowerPath = filePath.toLowerCase();

    // Find matched keywords
    const matchedKeywords = promptAnalysis.keywords.filter(keyword =>
      lowerContent.includes(keyword.toLowerCase()) || lowerPath.includes(keyword.toLowerCase())
    );

    // Extract context snippets
    const contextSnippets: string[] = [];
    for (const keyword of matchedKeywords.slice(0, 3)) {
      const index = lowerContent.indexOf(keyword.toLowerCase());
      if (index >= 0) {
        const start = Math.max(0, index - 50);
        const end = Math.min(content.length, index + keyword.length + 50);
        contextSnippets.push(content.substring(start, end).trim());
      }
    }

    // Calculate relevance score
    let relevanceScore = 0;

    // Keyword matching (40 points max)
    const keywordRatio = matchedKeywords.length / Math.max(promptAnalysis.keywords.length, 1);
    relevanceScore += keywordRatio * 40;

    // Expected output matching (30 points max)
    const expectedMatches = promptAnalysis.expectedOutputs.filter(output =>
      lowerContent.includes(output.toLowerCase()) || lowerPath.includes(output.toLowerCase())
    );
    const expectedRatio = expectedMatches.length / Math.max(promptAnalysis.expectedOutputs.length, 1);
    relevanceScore += expectedRatio * 30;

    // Technology matching (20 points max)
    const techMatches = promptAnalysis.technologies.filter(tech =>
      lowerContent.includes(tech.toLowerCase())
    );
    const techRatio = techMatches.length / Math.max(promptAnalysis.technologies.length, 1);
    relevanceScore += techRatio * 20;

    // File path relevance (10 points max)
    if (promptAnalysis.keywords.some(kw => lowerPath.includes(kw.toLowerCase()))) {
      relevanceScore += 10;
    }

    // Calculate confidence
    const confidence = Math.min(
      (matchedKeywords.length / 3) * 0.5 + // At least 3 keywords
      (expectedMatches.length > 0 ? 0.3 : 0) + // Has expected outputs
      (techMatches.length > 0 ? 0.2 : 0), // Uses expected technology
      1
    );

    // Generate reasoning
    const reasoning = this.generateCorrelationReasoning(
      matchedKeywords,
      expectedMatches,
      techMatches,
      filePath
    );

    return {
      promptKeywords: promptAnalysis.keywords,
      matchedKeywords,
      contextSnippets,
      relevanceScore: Math.min(Math.round(relevanceScore), 100),
      confidence,
      reasoning
    };
  }

  private generateCorrelationReasoning(
    matchedKeywords: string[],
    expectedMatches: string[],
    techMatches: string[],
    filePath: string
  ): string {
    const parts: string[] = [];

    if (matchedKeywords.length > 0) {
      parts.push(`Matches keywords: ${matchedKeywords.slice(0, 3).join(', ')}`);
    }

    if (expectedMatches.length > 0) {
      parts.push(`Contains expected outputs: ${expectedMatches.slice(0, 2).join(', ')}`);
    }

    if (techMatches.length > 0) {
      parts.push(`Uses technologies: ${techMatches.join(', ')}`);
    }

    const fileName = path.basename(filePath);
    parts.push(`File: ${fileName}`);

    return parts.join('. ');
  }

  private calculateQuality(
    content: string,
    type: IntelligentYield['type'],
    correlation: IntelligentYield['correlation'],
    metadata: IntelligentYield['metadata']
  ): IntelligentYield['quality'] {
    let score = 0;

    // Apply quality rules
    const mockYield = { type, content, metadata, correlation, tags: [] } as IntelligentYield;
    for (const [ruleName, ruleFunc] of this.qualityRules.entries()) {
      score += ruleFunc(mockYield);
    }

    // Additional quality checks
    const additionalChecks = {
      completeness: this.assessCompleteness(content, type),
      correctness: this.assessCorrectness(content),
      readability: this.assessReadability(content),
      performance: this.assessPerformance(content, type)
    };

    // Calculate final score
    score = Math.min(score, 100);

    // Determine grade
    let grade: IntelligentYield['quality']['grade'];
    if (score >= 90) grade = 'A';
    else if (score >= 80) grade = 'B';
    else if (score >= 70) grade = 'C';
    else if (score >= 60) grade = 'D';
    else grade = 'F';

    return {
      score,
      grade,
      confidence: correlation.confidence,
      ...additionalChecks
    };
  }

  private assessCompleteness(content: string, type: IntelligentYield['type']): number {
    let score = 70; // Base score

    // Type-specific completeness checks
    switch (type) {
      case 'code':
      case 'api':
      case 'ui_component':
        if (content.includes('TODO') || content.includes('FIXME')) score -= 20;
        if (content.includes('throw new Error("Not implemented")')) score -= 30;
        if (content.length < 100) score -= 20;
        break;

      case 'test':
        if (!content.match(/expect|assert/i)) score -= 30;
        if (!content.match(/describe|test|it/)) score -= 20;
        break;

      case 'documentation':
        if (content.length < 200) score -= 30;
        if (!content.includes('#')) score -= 10; // No headers
        break;

      case 'configuration':
        if (content.includes('CHANGEME') || content.includes('PLACEHOLDER')) score -= 40;
        break;
    }

    return Math.max(0, Math.min(100, score));
  }

  private assessCorrectness(content: string): number {
    let score = 90; // Assume correct unless issues found

    // Check for common errors
    if (content.match(/undefined|null reference|cannot read property/i)) score -= 30;
    if (content.match(/syntax error|parse error/i)) score -= 40;
    if (content.match(/\berror\b|\bexception\b/i)) score -= 20;

    // Check for good practices
    if (content.includes('try') && content.includes('catch')) score += 5;
    if (content.includes('async') && content.includes('await')) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  private assessReadability(content: string): number {
    let score = 70;

    // Check for comments
    const hasComments = content.match(/\/\/|\/\*|\*\//);
    if (hasComments) score += 15;

    // Check for reasonable line length
    const lines = content.split('\n');
    const longLines = lines.filter(line => line.length > 120).length;
    if (longLines / lines.length > 0.2) score -= 10;

    // Check for consistent indentation
    const indentationStyles = new Set(lines.map(line => line.match(/^(\s+)/)?.[1]?.length || 0));
    if (indentationStyles.size <= 3) score += 10; // Consistent indentation

    // Check for meaningful variable names
    if (content.match(/\b[a-z]{15,}\b/)) score += 5; // Has descriptive names

    return Math.max(0, Math.min(100, score));
  }

  private assessPerformance(content: string, type: IntelligentYield['type']): number {
    if (type !== 'code' && type !== 'api') return 75; // N/A for non-code

    let score = 80;

    // Check for performance anti-patterns
    if (content.match(/SELECT \* FROM/i)) score -= 15;
    if (content.match(/for.*for.*for/)) score -= 20; // Triple nested loops
    if (content.includes('.forEach') && content.includes('.forEach')) score -= 10; // Nested forEach

    // Check for performance optimizations
    if (content.includes('useMemo') || content.includes('useCallback')) score += 10;
    if (content.includes('INDEX') || content.includes('UNIQUE')) score += 5;
    if (content.includes('cache') || content.includes('memo')) score += 10;

    return Math.max(0, Math.min(100, score));
  }

  private checkNamingConventions(yieldItem: Partial<IntelligentYield>): boolean {
    if (!yieldItem.content) return false;

    // Check for common naming patterns
    const hasGoodNames =
      yieldItem.content.match(/[a-z][a-zA-Z0-9]*/) && // camelCase
      !yieldItem.content.match(/\b[a-z]\b/); // Single letter variables

    return Boolean(hasGoodNames);
  }

  private generatePreview(content: string, type: IntelligentYield['type']): string {
    const maxLength = 500;

    if (type === 'code' || type === 'api' || type === 'ui_component') {
      // Find the most interesting part (first function or class)
      const functionMatch = content.match(/(function|class|const|interface)\s+\w+[\s\S]{0,400}/);
      if (functionMatch) {
        return functionMatch[0].substring(0, maxLength);
      }
    }

    if (type === 'documentation') {
      // Get first paragraph after header
      const lines = content.split('\n');
      const preview = lines.slice(0, 10).join('\n');
      return preview.substring(0, maxLength);
    }

    // Default: First N characters
    return content.substring(0, maxLength);
  }

  private extractAutoTags(
    content: string,
    filePath: string,
    type: IntelligentYield['type'],
    promptAnalysis: PromptAnalysis
  ): string[] {
    const tags = new Set<string>();

    // Add type as tag
    tags.add(type);

    // Add category based tags
    tags.add(promptAnalysis.domain);

    // Add technology tags
    promptAnalysis.technologies.forEach(tech => tags.add(tech));

    // Add file extension
    const ext = path.extname(filePath).substring(1);
    if (ext) tags.add(ext);

    // Pattern-based tags
    if (content.includes('async')) tags.add('async');
    if (content.match(/test|spec/i)) tags.add('testing');
    if (content.match(/api|endpoint/i)) tags.add('api');
    if (content.match(/component|render/i)) tags.add('ui');
    if (content.includes('SELECT') || content.includes('INSERT')) tags.add('sql');

    // Quality-based tags
    if (content.includes('TODO')) tags.add('incomplete');
    if (content.length > 1000) tags.add('comprehensive');

    return Array.from(tags);
  }

  private generateTitle(filePath: string, type: IntelligentYield['type'], content: string): string {
    const fileName = path.basename(filePath);

    // Try to extract a meaningful title from content
    if (type === 'code' || type === 'api' || type === 'ui_component') {
      // Look for main class/function name
      const classMatch = content.match(/(?:export\s+)?(?:default\s+)?class\s+(\w+)/);
      if (classMatch) return `${classMatch[1]} (${fileName})`;

      const functionMatch = content.match(/(?:export\s+)?(?:default\s+)?function\s+(\w+)/);
      if (functionMatch) return `${functionMatch[1]} (${fileName})`;

      const componentMatch = content.match(/(?:export\s+)?(?:default\s+)?const\s+(\w+).*?=.*?(?:React\.)?FC/);
      if (componentMatch) return `${componentMatch[1]} Component`;
    }

    if (type === 'documentation') {
      // Look for main header
      const headerMatch = content.match(/^#\s+(.+)/m);
      if (headerMatch) return headerMatch[1];
    }

    // Default to formatted filename
    return fileName.replace(/[-_]/g, ' ').replace(/\.\w+$/, '');
  }

  private generateDescription(content: string, type: IntelligentYield['type'], activity?: string): string {
    const lines = content.split('\n').filter(line => line.trim());

    // Look for JSDoc or similar comments
    const commentMatch = content.match(/\/\*\*[\s\S]*?\*\/|"""[\s\S]*?"""|#\s+.+/);
    if (commentMatch) {
      const comment = commentMatch[0]
        .replace(/\/\*\*|\*\/|"""|#/g, '')
        .replace(/\*/g, '')
        .trim();
      if (comment.length > 20) {
        return comment.substring(0, 200);
      }
    }

    // Use activity if provided
    if (activity && activity.length > 20) {
      return activity.substring(0, 200);
    }

    // Generate based on type
    switch (type) {
      case 'code':
        return `Implementation containing ${lines.length} lines of code`;
      case 'api':
        const endpoints = content.match(/\.(get|post|put|delete|patch)\(/g);
        return `API with ${endpoints?.length || 0} endpoints`;
      case 'ui_component':
        return `UI component implementation`;
      case 'test':
        const tests = content.match(/test\(|it\(|describe\(/g);
        return `Test suite with ${tests?.length || 0} test cases`;
      case 'documentation':
        return `Documentation with ${lines.length} lines`;
      case 'configuration':
        return `Configuration file`;
      default:
        return `${type} file with ${lines.length} lines`;
    }
  }

  private assessIncubationPotential(
    type: IntelligentYield['type'],
    quality: IntelligentYield['quality'],
    promptAnalysis: PromptAnalysis
  ): IntelligentYield['incubation'] {
    const canIncubate = quality.score >= 60; // Only incubate decent quality yields

    const suggestedPrompts: string[] = [];
    const improvementAreas: string[] = [];

    // Type-specific suggestions
    switch (type) {
      case 'code':
      case 'api':
      case 'ui_component':
        if (quality.completeness < 80) {
          improvementAreas.push('Complete implementation');
          suggestedPrompts.push('Complete the TODOs and unimplemented functions');
        }
        if (!quality.score || quality.score < 70) {
          improvementAreas.push('Add unit tests');
          suggestedPrompts.push('Create comprehensive unit tests with >80% coverage');
        }
        if (quality.readability < 70) {
          improvementAreas.push('Improve code documentation');
          suggestedPrompts.push('Add JSDoc comments and improve variable naming');
        }
        if (quality.performance < 70) {
          improvementAreas.push('Optimize performance');
          suggestedPrompts.push('Optimize the code for better performance');
        }
        break;

      case 'test':
        improvementAreas.push('Increase coverage');
        suggestedPrompts.push('Add edge case tests and error scenarios');
        break;

      case 'documentation':
        improvementAreas.push('Add examples');
        suggestedPrompts.push('Add code examples and usage scenarios');
        improvementAreas.push('Improve formatting');
        suggestedPrompts.push('Format with proper markdown and add diagrams');
        break;

      case 'configuration':
        improvementAreas.push('Add environment variants');
        suggestedPrompts.push('Create dev, staging, and production configurations');
        break;
    }

    // General improvements
    if (promptAnalysis.complexity === 'advanced' || promptAnalysis.complexity === 'complex') {
      suggestedPrompts.push('Refactor for better maintainability and scalability');
      suggestedPrompts.push('Add monitoring and logging capabilities');
    }

    // Estimate effort
    let estimatedEffort: IntelligentYield['incubation']['estimatedEffort'] = 'low';
    if (improvementAreas.length > 3) estimatedEffort = 'high';
    else if (improvementAreas.length > 1) estimatedEffort = 'medium';

    return {
      canIncubate,
      suggestedPrompts: suggestedPrompts.slice(0, 3), // Top 3 suggestions
      improvementAreas: improvementAreas.slice(0, 3),
      estimatedEffort
    };
  }

  private detectRelationships(yieldItem: IntelligentYield, context: YieldContext): void {
    // Check imports/dependencies to find relationships
    const imports = this.extractImports(yieldItem.content || '');

    for (const [otherId, otherYield] of context.detectedYields.entries()) {
      if (otherId === yieldItem.id) continue;

      // Check if this yield imports the other
      const otherFileName = path.basename(otherYield.path);
      if (imports.some(imp => imp.includes(otherFileName.replace(/\.\w+$/, '')))) {
        yieldItem.relationships.dependsOn = yieldItem.relationships.dependsOn || [];
        yieldItem.relationships.dependsOn.push(otherId);

        otherYield.relationships.usedBy = otherYield.relationships.usedBy || [];
        otherYield.relationships.usedBy.push(yieldItem.id);
      }

      // Check if they're in the same directory (likely related)
      if (path.dirname(yieldItem.path) === path.dirname(otherYield.path)) {
        yieldItem.relationships.relatedTo = yieldItem.relationships.relatedTo || [];
        yieldItem.relationships.relatedTo.push(otherId);
      }
    }

    // Update relationship graph
    if (!context.yieldGraph.has(yieldItem.id)) {
      context.yieldGraph.set(yieldItem.id, new Set());
    }
    if (yieldItem.relationships.dependsOn) {
      yieldItem.relationships.dependsOn.forEach(depId => {
        context.yieldGraph.get(yieldItem.id)?.add(depId);
      });
    }
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];

    // JavaScript/TypeScript imports
    const jsImports = content.matchAll(/import.*from ['"]([^'"]+)['"]/g);
    for (const match of jsImports) {
      if (match[1]) imports.push(match[1]);
    }

    // Python imports
    const pyImports = content.matchAll(/from\s+(\S+)\s+import|import\s+(\S+)/g);
    for (const match of pyImports) {
      if (match[1] || match[2]) imports.push(match[1] || match[2]);
    }

    // Include/require statements
    const includes = content.matchAll(/(?:include|require)(?:_once)?\s*\(['"]([^'"]+)['"]\)/g);
    for (const match of includes) {
      if (match[1]) imports.push(match[1]);
    }

    return imports;
  }

  private getLanguage(ext: string): string | undefined {
    const langMap: Record<string, string> = {
      '.ts': 'TypeScript', '.tsx': 'TypeScript',
      '.js': 'JavaScript', '.jsx': 'JavaScript',
      '.py': 'Python', '.java': 'Java',
      '.go': 'Go', '.rs': 'Rust',
      '.cpp': 'C++', '.c': 'C',
      '.cs': 'C#', '.rb': 'Ruby',
      '.php': 'PHP', '.swift': 'Swift',
      '.kt': 'Kotlin', '.scala': 'Scala',
      '.r': 'R', '.jl': 'Julia'
    };
    return langMap[ext];
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
    };
    return mimeMap[ext] || 'application/octet-stream';
  }

  // ============================================================================
  // Broadcasting & Events
  // ============================================================================

  private async broadcastYieldDetection(yieldItem: IntelligentYield): Promise<void> {
    const event = 'yield:detected';
    const data = {
      yield: yieldItem,
      timestamp: new Date()
    };

    await unifiedWebSocketManager.broadcast(event, data, {
      farmId: yieldItem.farmId,
      includeRooms: [`farm:${yieldItem.farmId}`, `harvest:${yieldItem.harvestId}`]
    });
  }

  // ============================================================================
  // Public API
  // ============================================================================

  public getFarmYields(farmId: string): IntelligentYield[] {
    const context = this.contexts.get(farmId);
    if (!context) return [];

    return Array.from(context.detectedYields.values());
  }

  public getHighQualityYields(farmId: string): IntelligentYield[] {
    return this.getFarmYields(farmId)
      .filter(y => y.quality.score >= 80)
      .sort((a, b) => b.quality.score - a.quality.score);
  }

  public getYieldsByType(farmId: string, type: IntelligentYield['type']): IntelligentYield[] {
    return this.getFarmYields(farmId).filter(y => y.type === type);
  }

  public getIncubationCandidates(farmId: string): IntelligentYield[] {
    return this.getFarmYields(farmId)
      .filter(y => y.incubation.canIncubate)
      .sort((a, b) => {
        // Sort by effort (low first) then by quality
        const effortOrder = { low: 0, medium: 1, high: 2 };
        const effortDiff = effortOrder[a.incubation.estimatedEffort] - effortOrder[b.incubation.estimatedEffort];
        if (effortDiff !== 0) return effortDiff;
        return b.quality.score - a.quality.score;
      });
  }

  public async saveYields(farmId: string): Promise<void> {
    const context = this.contexts.get(farmId);
    if (!context) return;

    const yields = Array.from(context.detectedYields.values());

    // Save to database
    for (const yieldItem of yields) {
      await db.query(`
        INSERT INTO yields (
          id, farm_id, harvest_id, agent_id, agent_name,
          type, category, title, description, path,
          quality_score, quality_grade, relevance_score,
          metadata, correlation, relationships, tags,
          incubation, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (id) DO UPDATE SET
          quality_score = $11,
          relevance_score = $13,
          metadata = $14,
          updated_at = NOW()
      `, [
        yieldItem.id,
        yieldItem.farmId,
        yieldItem.harvestId,
        yieldItem.agentId,
        yieldItem.agentName,
        yieldItem.type,
        yieldItem.category,
        yieldItem.title,
        yieldItem.description,
        yieldItem.path,
        yieldItem.quality.score,
        yieldItem.quality.grade,
        yieldItem.correlation.relevanceScore,
        JSON.stringify(yieldItem.metadata),
        JSON.stringify(yieldItem.correlation),
        JSON.stringify(yieldItem.relationships),
        JSON.stringify(yieldItem.tags),
        JSON.stringify(yieldItem.incubation),
        new Date()
      ]).catch(error => {
        logger.error(LogCategory.TERMINAL, `Failed to save yield ${yieldItem.id}`, error);
      });
    }

    logger.info(LogCategory.TERMINAL, `Saved ${yields.length} yields for farm ${farmId}`);
  }

  public clearFarmContext(farmId: string): void {
    const context = this.contexts.get(farmId);
    if (context) {
      this.saveYields(farmId); // Save before clearing
      this.contexts.delete(farmId);
      logger.info(LogCategory.TERMINAL, `Cleared yield context for farm ${farmId}`);
    }
  }
}

// Export singleton instance
export const intelligentYieldDetectionService = IntelligentYieldDetectionService.getInstance();