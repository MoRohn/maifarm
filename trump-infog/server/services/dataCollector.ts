import { EventEmitter } from 'events';
import NodeCache from 'node-cache';
import fs from 'fs/promises';
import path from 'path';
import { NewsApiService } from './newsApiService.js';
import { RssFeedParser } from './rssFeedParser.js';
import { ContentValidator } from './contentValidator.js';
import { DeduplicationService } from './deduplicationService.js';
import type { 
  NewsArticle, 
  CollectorConfig, 
  CollectionResult,
  DataCollectionEvent 
} from '../../src/types/news.js';

export class DataCollector extends EventEmitter {
  private newsApiService: NewsApiService;
  private rssFeedParser: RssFeedParser;
  private contentValidator: ContentValidator;
  private deduplicationService: DeduplicationService;
  private cache: NodeCache;
  private config: CollectorConfig;
  private isCollecting: boolean = false;

  constructor(config: Partial<CollectorConfig> = {}) {
    super();
    
    this.config = {
      newsApiKey: config.newsApiKey || process.env.NEWS_API_KEY,
      rssFeeds: config.rssFeeds || this.getDefaultRssFeeds(),
      validationRules: config.validationRules || this.getDefaultValidationRules(),
      deduplicationThreshold: config.deduplicationThreshold || 0.8,
      maxArticles: config.maxArticles || 200,
      cacheTimeout: config.cacheTimeout || 300, // 5 minutes
    };

    this.newsApiService = new NewsApiService(this.config.newsApiKey);
    this.rssFeedParser = new RssFeedParser();
    this.contentValidator = new ContentValidator();
    this.deduplicationService = new DeduplicationService(this.config.deduplicationThreshold);
    this.cache = new NodeCache({ stdTTL: this.config.cacheTimeout });
  }

  async collectArticles(): Promise<CollectionResult> {
    if (this.isCollecting) {
      throw new Error('Collection already in progress');
    }

    this.isCollecting = true;
    
    try {
      // Check cache first
      const cached = this.cache.get<CollectionResult>('latest_collection');
      if (cached) {
        return cached;
      }

      // Emit start event
      this.emitEvent('collection_started', {
        timestamp: new Date(),
      });

      const allArticles: NewsArticle[] = [];
      const sources: Set<string> = new Set();
      const errors: string[] = [];

      // Collect from NewsAPI
      try {
        if (this.newsApiService.isConfigured()) {
          const newsApiArticles = await this.newsApiService.fetchTrumpArticles(
            this.config.validationRules.dateRange?.from,
            this.config.validationRules.dateRange?.to
          );
          allArticles.push(...newsApiArticles);
          sources.add('NewsAPI');
        }
      } catch (error) {
        const errorMsg = `NewsAPI error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        console.error(errorMsg);
      }

      // Collect from RSS feeds
      try {
        const rssArticles = await this.rssFeedParser.parseFeeds(this.config.rssFeeds);
        allArticles.push(...rssArticles);
        this.config.rssFeeds.forEach(feed => {
          if (feed.enabled) sources.add(feed.name);
        });
      } catch (error) {
        const errorMsg = `RSS parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        console.error(errorMsg);
      }

      // Validate articles
      const validatedArticles = this.contentValidator.validateArticles(
        allArticles,
        this.config.validationRules
      );

      // Deduplicate
      const { unique, duplicatesRemoved } = this.deduplicationService.deduplicateArticles(
        validatedArticles
      );

      // Sort by relevance and date
      const sortedArticles = unique
        .sort((a, b) => {
          // First sort by relevance score
          const scoreA = a.relevanceScore || 0;
          const scoreB = b.relevanceScore || 0;
          if (scoreA !== scoreB) {
            return scoreB - scoreA;
          }
          // Then by date
          return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        })
        .slice(0, this.config.maxArticles);

      const result: CollectionResult = {
        success: true,
        articlesFound: allArticles.length,
        articlesFiltered: allArticles.length - validatedArticles.length,
        duplicatesRemoved,
        articles: sortedArticles,
        sources: Array.from(sources),
        timestamp: new Date(),
        errors: errors.length > 0 ? errors : undefined,
      };

      // Cache the result
      this.cache.set('latest_collection', result);

      // Save to file
      await this.saveToFile(result);

      // Emit completion event
      this.emitEvent('data_collected', {
        articleCount: sortedArticles.length,
        sources: Array.from(sources),
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      
      this.emitEvent('collection_error', {
        error: errorMsg,
        timestamp: new Date(),
      });

      throw error;
    } finally {
      this.isCollecting = false;
    }
  }

  private async saveToFile(result: CollectionResult): Promise<void> {
    const outputDir = '/tmp/trump_infog/raw_data';
    const outputPath = path.join(outputDir, 'articles.json');

    try {
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(
        outputPath,
        JSON.stringify(result, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Error saving articles to file:', error);
    }
  }

  private emitEvent(type: DataCollectionEvent['type'], payload: DataCollectionEvent['payload']): void {
    const event: DataCollectionEvent = { type, payload };
    this.emit('collection_event', event);
    
    // Also emit specific event types
    this.emit(type, payload);
  }

  private getDefaultRssFeeds() {
    return new RssFeedParser().getDefaultRssFeeds();
  }

  private getDefaultValidationRules() {
    return new ContentValidator().getDefaultValidationRules();
  }

  // Public methods for configuration
  updateConfig(config: Partial<CollectorConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (config.deduplicationThreshold !== undefined) {
      this.deduplicationService = new DeduplicationService(config.deduplicationThreshold);
    }
    
    if (config.newsApiKey !== undefined) {
      this.newsApiService = new NewsApiService(config.newsApiKey);
    }
    
    if (config.cacheTimeout !== undefined) {
      this.cache = new NodeCache({ stdTTL: config.cacheTimeout });
    }
  }

  clearCache(): void {
    this.cache.flushAll();
    this.deduplicationService.clearCache();
  }

  getConfig(): CollectorConfig {
    return { ...this.config };
  }

  isRunning(): boolean {
    return this.isCollecting;
  }

  // Utility method to get trending topics from collected articles
  async getTrendingTopics(limit: number = 10): Promise<string[]> {
    const cached = this.cache.get<CollectionResult>('latest_collection');
    if (!cached || !cached.articles.length) {
      return [];
    }

    const topicCounts = new Map<string, number>();
    
    cached.articles.forEach(article => {
      const text = `${article.title} ${article.description || ''}`;
      const keyPhrases = this.contentValidator.extractKeyPhrases(text, 5);
      
      keyPhrases.forEach(phrase => {
        topicCounts.set(phrase, (topicCounts.get(phrase) || 0) + 1);
      });
    });

    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([topic]) => topic);
  }
}