/**
 * Viral Seeds Service
 *
 * Internet-sourced Seed generation pipeline that:
 * 1. Searches for trending AI tasks/requests
 * 2. Extracts viral intents from search results
 * 3. Generates exactly 3 new Seeds from those intents
 * 4. Stores snapshots for reproducible regeneration
 *
 * Safety: Includes content filtering at retrieval, generation, and persistence stages.
 */

import { randomUUID } from 'crypto';
import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/client';
import Ajv from 'ajv';
import {
  Seed,
  ViralSeedGenerationConfig,
  ViralSeedGenerationResult,
  ViralSeedSnapshot,
  ViralIntent,
  SearchResult,
  GeneratedSeedData,
  VIRAL_SEED_JSON_SCHEMA
} from '../types/seed';
import { enhancedSeedService } from './enhancedSeedService';
import { SEED_UUID } from '../utils/systemUuids';

// Content safety blocklist
const BLOCKED_CATEGORIES = [
  'weapons', 'hacking', 'malware', 'illegal', 'adult', 'violence',
  'drugs', 'gambling', 'phishing', 'scam', 'fraud', 'harassment'
];

const BLOCKED_TERMS = [
  'hack', 'crack', 'exploit', 'bypass', 'ddos', 'botnet',
  'ransomware', 'keylogger', 'spyware', 'deepfake', 'doxx'
];

// Default search queries for viral seed discovery
const DEFAULT_SEARCH_QUERIES = [
  // General AI tasks
  'top tasks people ask AI to build 2025',
  'most popular AI assistant requests productivity',
  'what are people using ChatGPT Claude for trending',
  // Developer/build focused
  'trending AI coding projects developers building',
  'popular AI automation workflows programming',
  'what AI tools are developers creating',
  // Business/productivity focused
  'AI business automation most requested features',
  'popular AI productivity tools being built',
  'enterprise AI assistant use cases trending'
];

// Seed generation prompt
const SEED_GENERATION_PROMPT = `You are a Seed Generator for MaiFarm, an AI farming platform.

Based on the following viral intents (what people are asking AI to build/do), generate EXACTLY 3 Seeds.

Each Seed must be:
1. DISTINCT in category and purpose (no overlap)
2. ACTIONABLE with clear success criteria
3. Compatible with multi-agent collaboration
4. Safe and ethical (no harmful content)

Viral Intents:
{INTENTS}

Generate a JSON response with this EXACT structure:
{
  "seeds": [
    {
      "title": "Max 6 words",
      "description": "1-2 sentences describing what this seed does",
      "tags": ["3-6 relevant tags"],
      "seedPrompt": "Detailed prompt text (50+ chars) that will guide AI agents",
      "recommendedModes": ["harvest" | "quick_task" | "go_wild"],
      "recommendedEngines": ["claude" | "openai" | "grok" | "gpt-oss" | "ollama" | "any"],
      "successChecklist": ["3-6 checkboxes for success criteria"],
      "category": "development" | "data" | "research" | "creative" | "business" | "automation"
    }
  ]
}

Requirements:
- Exactly 3 seeds, no more, no less
- Each seed must have all required fields
- seedPrompt must be at least 50 characters
- tags must have 3-6 items
- successChecklist must have 3-6 items
- No duplicate categories between seeds

Return ONLY valid JSON, no markdown or explanation.`;

// JSON Schema validator
const ajv = new Ajv({ allErrors: true });

interface SearchProvider {
  search(query: string): Promise<SearchResult[]>;
}

class WebSearchProvider implements SearchProvider {
  async search(query: string): Promise<SearchResult[]> {
    // In production, this would call a real search API (Brave, Serper, Google, etc.)
    // For now, we return mock results to demonstrate the pipeline
    logger.info(LogCategory.SEED, `WebSearch: "${query}"`);

    // Simulate search delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Generate mock results based on query
    const mockResults = this.generateMockResults(query);
    return mockResults;
  }

  private generateMockResults(query: string): SearchResult[] {
    // Mock results that simulate real search data
    const results: SearchResult[] = [];
    const topics = [
      { title: 'Build AI-powered code review tool', snippet: 'Developers want automated code review with security scanning' },
      { title: 'Create document summarization agent', snippet: 'Users asking for AI to summarize long documents and reports' },
      { title: 'Automate data pipeline with AI', snippet: 'Growing demand for AI-driven ETL and data transformation' },
      { title: 'Build AI writing assistant', snippet: 'Content creators need help with blog posts and marketing copy' },
      { title: 'Create AI research assistant', snippet: 'Researchers want AI to help gather and synthesize information' },
      { title: 'Automate customer support with AI', snippet: 'Businesses looking for AI chatbots and support automation' },
      { title: 'Build AI image generation workflow', snippet: 'Designers want automated image creation pipelines' },
      { title: 'Create AI testing framework', snippet: 'QA teams asking for AI-powered test generation' }
    ];

    for (let i = 0; i < Math.min(5, topics.length); i++) {
      results.push({
        url: `https://example.com/article-${i + 1}`,
        title: topics[i].title,
        snippet: topics[i].snippet,
        query,
        position: i + 1
      });
    }

    return results;
  }
}

class ViralSeedsService {
  private static instance: ViralSeedsService;
  private searchProvider: SearchProvider;
  private isRunning: boolean = false;

  private constructor() {
    this.searchProvider = new WebSearchProvider();
  }

  static getInstance(): ViralSeedsService {
    if (!ViralSeedsService.instance) {
      ViralSeedsService.instance = new ViralSeedsService();
    }
    return ViralSeedsService.instance;
  }

  /**
   * Run the viral seeds generation pipeline
   */
  async runPipeline(
    config: ViralSeedGenerationConfig,
    userId: string
  ): Promise<ViralSeedGenerationResult> {
    // Prevent concurrent runs
    if (this.isRunning) {
      return {
        success: false,
        seeds: [],
        snapshotId: '',
        snapshotMeta: { queriesUsed: [], intentsFound: 0, blockedCount: 0, durationMs: 0 },
        error: 'Pipeline is already running'
      };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const snapshotId = randomUUID();

    logger.info(LogCategory.SEED, `Starting viral seeds pipeline: ${snapshotId}`);

    try {
      // Check for snapshot-based regeneration
      if (config.snapshotId) {
        return await this.regenerateFromSnapshot(config.snapshotId, userId);
      }

      // Phase 1: Search
      const searchStart = Date.now();
      const queries = config.searchQueries || DEFAULT_SEARCH_QUERIES.slice(0, 3);
      const searchResults = await this.executeSearches(queries, config.maxResultsPerQuery || 5);
      const searchDuration = Date.now() - searchStart;

      logger.info(LogCategory.SEED, `Search completed: ${searchResults.length} results in ${searchDuration}ms`);

      // Phase 2: Extract intents
      const extractStart = Date.now();
      const { intents, blockedCount } = await this.extractViralIntents(searchResults);
      const extractDuration = Date.now() - extractStart;

      logger.info(LogCategory.SEED, `Extraction completed: ${intents.length} intents, ${blockedCount} blocked`);

      if (intents.length === 0) {
        return {
          success: false,
          seeds: [],
          snapshotId,
          snapshotMeta: {
            queriesUsed: queries,
            intentsFound: 0,
            blockedCount,
            durationMs: Date.now() - startTime
          },
          error: 'No valid intents found from search results'
        };
      }

      // Phase 3: Generate seeds
      const generateStart = Date.now();
      const generatedSeeds = await this.generateSeeds(intents, userId);
      const generateDuration = Date.now() - generateStart;

      logger.info(LogCategory.SEED, `Generation completed: ${generatedSeeds.length} seeds in ${generateDuration}ms`);

      // Phase 4: Save snapshot
      const totalDuration = Date.now() - startTime;
      await this.saveSnapshot({
        id: snapshotId,
        userId,
        searchQueries: queries,
        searchProvider: 'websearch',
        searchResults,
        viralIntents: intents,
        generationPromptVersion: 'v1',
        modelUsed: 'claude', // Would be dynamic in production
        generatedSeedIds: generatedSeeds.map(s => s.id),
        status: 'completed',
        searchDurationMs: searchDuration,
        extractionDurationMs: extractDuration,
        generationDurationMs: generateDuration,
        totalDurationMs: totalDuration,
        blockedContentCount: blockedCount,
        safetyFlags: [],
        createdAt: new Date(),
        completedAt: new Date()
      });

      return {
        success: true,
        seeds: generatedSeeds,
        snapshotId,
        snapshotMeta: {
          queriesUsed: queries,
          intentsFound: intents.length,
          blockedCount,
          durationMs: totalDuration
        }
      };
    } catch (error) {
      logger.error(LogCategory.SEED, 'Viral seeds pipeline failed:', error);
      return {
        success: false,
        seeds: [],
        snapshotId,
        snapshotMeta: {
          queriesUsed: config.searchQueries || [],
          intentsFound: 0,
          blockedCount: 0,
          durationMs: Date.now() - startTime
        },
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Execute searches across multiple queries
   */
  private async executeSearches(
    queries: string[],
    maxResultsPerQuery: number
  ): Promise<SearchResult[]> {
    const allResults: SearchResult[] = [];

    for (const query of queries) {
      try {
        const results = await this.searchProvider.search(query);
        allResults.push(...results.slice(0, maxResultsPerQuery));
      } catch (error) {
        logger.warn(LogCategory.SEED, `Search failed for query "${query}":`, error);
      }
    }

    return allResults;
  }

  /**
   * Extract viral intents from search results
   */
  private async extractViralIntents(
    results: SearchResult[]
  ): Promise<{ intents: ViralIntent[]; blockedCount: number }> {
    const intents: ViralIntent[] = [];
    let blockedCount = 0;

    // Deduplicate by combining similar snippets
    const seen = new Set<string>();

    for (const result of results) {
      // Safety filter
      if (this.isBlockedContent(result.title + ' ' + result.snippet)) {
        blockedCount++;
        continue;
      }

      // Deduplicate
      const key = result.title.toLowerCase().substring(0, 30);
      if (seen.has(key)) continue;
      seen.add(key);

      // Extract intent
      const intent: ViralIntent = {
        id: randomUUID(),
        intent: this.extractIntentFromResult(result),
        category: this.categorizeIntent(result),
        rationale: result.snippet,
        sourceQuery: result.query,
        sourceSnippets: [result.snippet],
        relevanceScore: this.calculateRelevance(result)
      };

      intents.push(intent);
    }

    // Sort by relevance and take top intents
    intents.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return { intents: intents.slice(0, 10), blockedCount };
  }

  /**
   * Extract a clean intent statement from a search result
   */
  private extractIntentFromResult(result: SearchResult): string {
    // Clean up the title to get a clear intent
    let intent = result.title
      .replace(/^(how to|build|create|make|develop)\s+/i, '')
      .replace(/\s+(tutorial|guide|example|demo)$/i, '')
      .trim();

    // Capitalize first letter
    return intent.charAt(0).toUpperCase() + intent.slice(1);
  }

  /**
   * Categorize an intent based on content
   */
  private categorizeIntent(result: SearchResult): string {
    const text = (result.title + ' ' + result.snippet).toLowerCase();

    if (text.includes('code') || text.includes('develop') || text.includes('programming')) {
      return 'development';
    }
    if (text.includes('data') || text.includes('etl') || text.includes('pipeline')) {
      return 'data';
    }
    if (text.includes('research') || text.includes('analyze') || text.includes('study')) {
      return 'research';
    }
    if (text.includes('write') || text.includes('content') || text.includes('creative')) {
      return 'creative';
    }
    if (text.includes('business') || text.includes('enterprise') || text.includes('customer')) {
      return 'business';
    }
    return 'automation';
  }

  /**
   * Calculate relevance score for an intent
   */
  private calculateRelevance(result: SearchResult): number {
    let score = 0.5; // Base score

    // Position bonus (earlier = more relevant)
    score += (10 - result.position) * 0.05;

    // Keyword bonuses
    const text = (result.title + ' ' + result.snippet).toLowerCase();
    if (text.includes('ai')) score += 0.1;
    if (text.includes('automate')) score += 0.1;
    if (text.includes('popular') || text.includes('trending')) score += 0.1;
    if (text.includes('2025') || text.includes('2024')) score += 0.05;

    return Math.min(1.0, score);
  }

  /**
   * Check if content contains blocked terms
   */
  private isBlockedContent(text: string): boolean {
    const lowerText = text.toLowerCase();

    for (const term of BLOCKED_TERMS) {
      if (lowerText.includes(term)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate seeds from viral intents
   */
  private async generateSeeds(intents: ViralIntent[], userId: string): Promise<Seed[]> {
    // Build the prompt with intents
    const intentsText = intents
      .slice(0, 6) // Use top 6 intents
      .map((intent, i) => `${i + 1}. ${intent.intent} (${intent.category}): ${intent.rationale}`)
      .join('\n');

    const prompt = SEED_GENERATION_PROMPT.replace('{INTENTS}', intentsText);

    // In production, this would call the AI API
    // For now, we generate mock seeds based on intents
    const generatedData = await this.callAIForSeedGeneration(prompt, intents);

    // Validate the generated data
    const validatedData = this.validateGeneratedSeeds(generatedData);

    if (!validatedData) {
      // Try auto-repair
      const repairedData = this.attemptAutoRepair(generatedData);
      if (!repairedData) {
        throw new Error('Generated seeds failed validation and auto-repair');
      }
      return this.persistGeneratedSeeds(repairedData, userId, intents);
    }

    return this.persistGeneratedSeeds(validatedData, userId, intents);
  }

  /**
   * Call AI to generate seeds (mock implementation)
   */
  private async callAIForSeedGeneration(
    prompt: string,
    intents: ViralIntent[]
  ): Promise<{ seeds: GeneratedSeedData[] }> {
    // In production, this would call Claude/OpenAI API
    // For now, generate based on intents
    logger.info(LogCategory.SEED, 'Generating seeds from intents (mock)');

    const categories = ['development', 'data', 'research', 'creative', 'business', 'automation'];
    const usedCategories = new Set<string>();

    const seeds: GeneratedSeedData[] = [];

    for (let i = 0; i < 3 && i < intents.length; i++) {
      const intent = intents[i];

      // Ensure unique categories
      let category = intent.category;
      while (usedCategories.has(category)) {
        category = categories.find(c => !usedCategories.has(c)) || 'automation';
      }
      usedCategories.add(category);

      seeds.push({
        title: this.generateTitle(intent),
        description: `AI-powered solution for: ${intent.rationale}`,
        tags: this.generateTags(intent),
        seedPrompt: this.generateSeedPrompt(intent),
        recommendedModes: this.getRecommendedModes(intent.category),
        recommendedEngines: ['claude', 'openai'],
        successChecklist: this.generateChecklist(intent),
        category
      });
    }

    return { seeds };
  }

  /**
   * Generate a seed title from intent
   */
  private generateTitle(intent: ViralIntent): string {
    const words = intent.intent.split(' ').slice(0, 6);
    return words.join(' ');
  }

  /**
   * Generate tags from intent
   */
  private generateTags(intent: ViralIntent): string[] {
    const baseTags = [intent.category, 'viral', 'ai-generated'];
    const words = intent.intent.toLowerCase().split(' ');

    // Add relevant words as tags
    const relevantWords = words.filter(w =>
      w.length > 3 && !['the', 'and', 'for', 'with'].includes(w)
    );

    return [...baseTags, ...relevantWords.slice(0, 3)];
  }

  /**
   * Generate a detailed seed prompt
   */
  private generateSeedPrompt(intent: ViralIntent): string {
    return `You are an AI agent specialized in: ${intent.intent}

OBJECTIVE:
${intent.rationale}

APPROACH:
1. Analyze the requirements carefully
2. Break down the task into manageable steps
3. Execute each step with attention to quality
4. Validate outputs against success criteria
5. Document your work for reproducibility

GUIDELINES:
- Work systematically and methodically
- Ask clarifying questions if requirements are unclear
- Report progress at key milestones
- Flag any blockers or concerns immediately

This task falls under the "${intent.category}" domain.`;
  }

  /**
   * Get recommended modes based on category
   */
  private getRecommendedModes(category: string): Array<'harvest' | 'quick_task' | 'go_wild'> {
    switch (category) {
      case 'research':
        return ['go_wild', 'harvest'];
      case 'development':
        return ['harvest', 'quick_task'];
      case 'creative':
        return ['go_wild'];
      default:
        return ['harvest'];
    }
  }

  /**
   * Generate success checklist
   */
  private generateChecklist(intent: ViralIntent): string[] {
    return [
      'Task requirements fully understood',
      'Implementation approach defined',
      `${intent.category}-specific best practices followed`,
      'Output quality validated',
      'Documentation completed',
      'Results summarized'
    ];
  }

  /**
   * Validate generated seeds against JSON schema
   */
  private validateGeneratedSeeds(data: any): { seeds: GeneratedSeedData[] } | null {
    const validate = ajv.compile(VIRAL_SEED_JSON_SCHEMA);
    const valid = validate(data);

    if (!valid) {
      logger.warn(LogCategory.SEED, 'Seed validation failed:', validate.errors);
      return null;
    }

    return data;
  }

  /**
   * Attempt to auto-repair invalid seed data
   */
  private attemptAutoRepair(data: any): { seeds: GeneratedSeedData[] } | null {
    if (!data || !data.seeds || !Array.isArray(data.seeds)) {
      return null;
    }

    try {
      const repaired = {
        seeds: data.seeds.slice(0, 3).map((s: any, i: number) => ({
          title: String(s.title || `Generated Seed ${i + 1}`).substring(0, 50),
          description: String(s.description || 'AI-generated seed').substring(0, 200),
          tags: Array.isArray(s.tags) ? s.tags.slice(0, 6) : ['viral', 'generated', 'ai'],
          seedPrompt: String(s.seedPrompt || s.description || 'Complete the assigned task.'),
          recommendedModes: Array.isArray(s.recommendedModes) ? s.recommendedModes : ['harvest'],
          recommendedEngines: Array.isArray(s.recommendedEngines) ? s.recommendedEngines : ['claude'],
          successChecklist: Array.isArray(s.successChecklist)
            ? s.successChecklist.slice(0, 6)
            : ['Task completed', 'Quality validated', 'Results documented'],
          category: String(s.category || 'automation')
        }))
      };

      // Ensure exactly 3 seeds
      while (repaired.seeds.length < 3) {
        repaired.seeds.push({
          title: `Auto-Generated Seed ${repaired.seeds.length + 1}`,
          description: 'Automatically generated seed for AI tasks',
          tags: ['viral', 'auto-generated', 'ai'],
          seedPrompt: 'Complete the assigned AI task using best practices.',
          recommendedModes: ['harvest'] as Array<'harvest' | 'quick_task' | 'go_wild'>,
          recommendedEngines: ['claude', 'openai'] as Array<'claude' | 'openai' | 'grok' | 'gpt-oss' | 'ollama'>,
          successChecklist: ['Task understood', 'Implementation complete', 'Results validated'],
          category: 'automation'
        });
      }

      // Validate repaired data
      const validate = ajv.compile(VIRAL_SEED_JSON_SCHEMA);
      if (validate(repaired)) {
        logger.info(LogCategory.SEED, 'Successfully auto-repaired seed data');
        return repaired;
      }

      return null;
    } catch (error) {
      logger.error(LogCategory.SEED, 'Auto-repair failed:', error);
      return null;
    }
  }

  /**
   * Persist generated seeds to database
   */
  private async persistGeneratedSeeds(
    data: { seeds: GeneratedSeedData[] },
    userId: string,
    intents: ViralIntent[]
  ): Promise<Seed[]> {
    const seeds: Seed[] = [];

    for (let i = 0; i < data.seeds.length; i++) {
      const seedData = data.seeds[i];
      const sourceIntent = intents[i];

      // Final safety check
      if (this.isBlockedContent(seedData.seedPrompt)) {
        logger.warn(LogCategory.SEED, `Blocked seed ${i} due to content filter`);
        continue;
      }

      const seed = await enhancedSeedService.create({
        name: seedData.title,
        description: seedData.description,
        yaml: this.generateYamlFromSeed(seedData),
        farmType: 'collaborative',
        category: seedData.category,
        tags: [...seedData.tags, 'viral-seed'],
        isPublic: true,
        seedPrompt: seedData.seedPrompt,
        modeCompatibility: 'all',
        engineCompatibility: 'all',
        successChecklist: seedData.successChecklist,
        recommendedModes: seedData.recommendedModes,
        recommendedEngines: seedData.recommendedEngines as any,
        sources: sourceIntent ? [{
          title: sourceIntent.intent,
          snippet: sourceIntent.rationale,
          query: sourceIntent.sourceQuery
        }] : []
      }, userId);

      seeds.push(seed);
    }

    return seeds;
  }

  /**
   * Generate YAML from seed data
   */
  private generateYamlFromSeed(seedData: GeneratedSeedData): string {
    return `# ${seedData.title}
# Category: ${seedData.category}
# Tags: ${seedData.tags.join(', ')}

agents:
  - name: lead-agent
    type: coordinator
    role: Lead the task execution
    tasks:
      - Understand requirements
      - Coordinate with other agents
      - Validate outputs
  - name: worker-agent
    type: executor
    role: Execute assigned tasks
    tasks:
      - Implement solutions
      - Test results
      - Document work

initial_prompt: |
  ${seedData.seedPrompt.split('\n').join('\n  ')}

success_criteria:
${seedData.successChecklist.map(item => `  - ${item}`).join('\n')}
`;
  }

  /**
   * Save snapshot for reproducibility
   */
  private async saveSnapshot(snapshot: ViralSeedSnapshot): Promise<void> {
    if (!db) return;

    try {
      await db.query(
        `INSERT INTO viral_seed_snapshots (
          id, user_id, search_queries, search_provider, search_results,
          viral_intents, generation_prompt_version, model_used,
          generated_seed_ids, status, search_duration_ms, extraction_duration_ms,
          generation_duration_ms, total_duration_ms, blocked_content_count,
          safety_flags, created_at, completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          snapshot.id,
          snapshot.userId,
          JSON.stringify(snapshot.searchQueries),
          snapshot.searchProvider,
          JSON.stringify(snapshot.searchResults),
          JSON.stringify(snapshot.viralIntents),
          snapshot.generationPromptVersion,
          snapshot.modelUsed,
          JSON.stringify(snapshot.generatedSeedIds),
          snapshot.status,
          snapshot.searchDurationMs,
          snapshot.extractionDurationMs,
          snapshot.generationDurationMs,
          snapshot.totalDurationMs,
          snapshot.blockedContentCount,
          JSON.stringify(snapshot.safetyFlags),
          snapshot.createdAt,
          snapshot.completedAt
        ]
      );

      logger.info(LogCategory.SEED, `Saved viral seeds snapshot: ${snapshot.id}`);
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to save snapshot:', error);
    }
  }

  /**
   * Regenerate seeds from a stored snapshot
   */
  async regenerateFromSnapshot(
    snapshotId: string,
    userId: string
  ): Promise<ViralSeedGenerationResult> {
    if (!db) {
      return {
        success: false,
        seeds: [],
        snapshotId,
        snapshotMeta: { queriesUsed: [], intentsFound: 0, blockedCount: 0, durationMs: 0 },
        error: 'Database not available'
      };
    }

    try {
      const result = await db.query(
        'SELECT * FROM viral_seed_snapshots WHERE id = $1',
        [snapshotId]
      );

      if (!result.rows[0]) {
        return {
          success: false,
          seeds: [],
          snapshotId,
          snapshotMeta: { queriesUsed: [], intentsFound: 0, blockedCount: 0, durationMs: 0 },
          error: 'Snapshot not found'
        };
      }

      const snapshot = result.rows[0];
      const intents = snapshot.viral_intents || [];

      // Regenerate using stored intents
      const startTime = Date.now();
      const seeds = await this.generateSeeds(intents, userId);
      const duration = Date.now() - startTime;

      return {
        success: true,
        seeds,
        snapshotId,
        snapshotMeta: {
          queriesUsed: snapshot.search_queries || [],
          intentsFound: intents.length,
          blockedCount: snapshot.blocked_content_count || 0,
          durationMs: duration
        }
      };
    } catch (error) {
      logger.error(LogCategory.SEED, 'Regeneration from snapshot failed:', error);
      return {
        success: false,
        seeds: [],
        snapshotId,
        snapshotMeta: { queriesUsed: [], intentsFound: 0, blockedCount: 0, durationMs: 0 },
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get recent snapshots for a user
   */
  async getRecentSnapshots(userId: string, limit: number = 10): Promise<ViralSeedSnapshot[]> {
    if (!db) return [];

    try {
      const result = await db.query(
        `SELECT * FROM viral_seed_snapshots
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit]
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        searchQueries: row.search_queries || [],
        searchProvider: row.search_provider,
        searchResults: row.search_results || [],
        viralIntents: row.viral_intents || [],
        generationPromptVersion: row.generation_prompt_version,
        modelUsed: row.model_used,
        generatedSeedIds: row.generated_seed_ids || [],
        status: row.status,
        errorMessage: row.error_message,
        searchDurationMs: row.search_duration_ms,
        extractionDurationMs: row.extraction_duration_ms,
        generationDurationMs: row.generation_duration_ms,
        totalDurationMs: row.total_duration_ms,
        blockedContentCount: row.blocked_content_count || 0,
        safetyFlags: row.safety_flags || [],
        createdAt: row.created_at,
        completedAt: row.completed_at
      }));
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to get snapshots:', error);
      return [];
    }
  }

  /**
   * Check if pipeline is currently running
   */
  isPipelineRunning(): boolean {
    return this.isRunning;
  }
}

export const viralSeedsService = ViralSeedsService.getInstance();
