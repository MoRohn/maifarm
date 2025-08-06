import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';
import { BaseAgent } from './BaseAgent.js';
import { 
  IDataCollectorAgent,
  AgentConfig,
  AgentMessage,
  DataCollectionResult,
  NewsArticle,
  AgentRole
} from './types.js';

export class DataCollectorAgent extends BaseAgent implements IDataCollectorAgent {
  private newsApiKey: string;
  private newsApiUrl = 'https://newsapi.org/v2';
  private maxArticles = 100;
  private relevanceThreshold = 0.6;

  constructor(config: AgentConfig) {
    super({
      ...config,
      role: AgentRole.DATA_COLLECTOR
    });
    
    this.newsApiKey = process.env.NEWS_API_KEY || '';
  }

  async initializeAgent(): Promise<void> {
    if (!this.newsApiKey) {
      throw new Error('NEWS_API_KEY environment variable is required');
    }
    
    console.log(`Data Collector Agent initialized with API key: ${this.newsApiKey.substring(0, 8)}...`);
  }

  async startAgent(): Promise<void> {
    console.log('Data Collector Agent started, waiting for collection tasks...');
    
    // Start collecting news automatically
    await this.collectNews('Trump');
  }

  async stopAgent(): Promise<void> {
    console.log('Data Collector Agent stopping...');
  }

  async processTask(task: any): Promise<any> {
    this.updateProgress(0, 'Processing data collection task');
    
    try {
      const { query, options } = task;
      const result = await this.collectNews(query || 'Trump', options);
      
      this.notifyComplete(result);
      return result;
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  protected async handleAgentMessage(message: AgentMessage): Promise<void> {
    switch (message.type) {
      case 'collect:start':
        await this.collectNews(message.payload.query, message.payload.options);
        break;
      case 'validate:articles':
        await this.validateArticles(message.payload.articles);
        break;
      default:
        console.log(`Unknown message type: ${message.type}`);
    }
  }

  async collectNews(query: string, options?: any): Promise<DataCollectionResult> {
    try {
      this.updateProgress(10, 'Fetching news articles');
      
      // Fetch from multiple endpoints for comprehensive coverage
      const [topHeadlines, everything] = await Promise.all([
        this.fetchTopHeadlines(query),
        this.fetchEverything(query, options)
      ]);

      this.updateProgress(40, 'Combining and deduplicating articles');
      
      // Combine and deduplicate articles
      const allArticles = [...topHeadlines, ...everything];
      const uniqueArticles = this.deduplicateArticles(allArticles);
      
      this.updateProgress(60, 'Validating articles');
      
      // Validate and score articles
      const validatedArticles = await this.validateArticles(uniqueArticles);
      
      this.updateProgress(80, 'Preparing results');
      
      const result: DataCollectionResult = {
        articles: validatedArticles,
        sources: [...new Set(validatedArticles.map(a => a.source))],
        totalCount: uniqueArticles.length,
        validatedCount: validatedArticles.length,
        timestamp: new Date()
      };

      // Save raw data
      await this.saveRawData(result);
      
      this.updateProgress(100, 'Collection complete');
      this.addOutput(path.join(this.config.workingDirectory, 'outputs', 'raw_data.json'));
      
      // Mark data collection stage as complete
      await this.completeStage('data_collection', {
        articleCount: result.validatedCount,
        sources: result.sources
      });
      
      return result;
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  private async fetchTopHeadlines(query: string): Promise<NewsArticle[]> {
    try {
      const response = await axios.get(`${this.newsApiUrl}/top-headlines`, {
        params: {
          q: query,
          apiKey: this.newsApiKey,
          language: 'en',
          pageSize: 50
        }
      });

      return this.parseNewsApiResponse(response.data);
    } catch (error) {
      console.error('Error fetching top headlines:', error);
      return [];
    }
  }

  private async fetchEverything(query: string, options?: any): Promise<NewsArticle[]> {
    try {
      const fromDate = options?.fromDate || new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      
      const response = await axios.get(`${this.newsApiUrl}/everything`, {
        params: {
          q: query,
          apiKey: this.newsApiKey,
          language: 'en',
          sortBy: 'relevancy',
          from: fromDate,
          pageSize: 100
        }
      });

      return this.parseNewsApiResponse(response.data);
    } catch (error) {
      console.error('Error fetching everything:', error);
      return [];
    }
  }

  private parseNewsApiResponse(data: any): NewsArticle[] {
    if (!data.articles || !Array.isArray(data.articles)) {
      return [];
    }

    return data.articles
      .filter((article: any) => article.title && article.content)
      .map((article: any, index: number) => ({
        id: `news_${Date.now()}_${index}`,
        title: article.title,
        content: article.content || article.description || '',
        source: article.source?.name || 'Unknown',
        author: article.author,
        publishedAt: new Date(article.publishedAt),
        url: article.url,
        relevanceScore: 0, // Will be calculated during validation
        metadata: {
          urlToImage: article.urlToImage,
          description: article.description
        }
      }));
  }

  private deduplicateArticles(articles: NewsArticle[]): NewsArticle[] {
    const seen = new Set<string>();
    const unique: NewsArticle[] = [];

    for (const article of articles) {
      // Create a simple hash for deduplication
      const hash = `${article.title.toLowerCase()}_${article.source}`;
      
      if (!seen.has(hash)) {
        seen.add(hash);
        unique.push(article);
      }
    }

    return unique;
  }

  async validateArticles(articles: NewsArticle[]): Promise<NewsArticle[]> {
    const validated: NewsArticle[] = [];
    
    for (const article of articles) {
      // Calculate relevance score
      const score = this.calculateRelevanceScore(article);
      
      if (score >= this.relevanceThreshold) {
        validated.push({
          ...article,
          relevanceScore: score
        });
      }
    }

    // Sort by relevance score
    return validated.sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, this.maxArticles);
  }

  private calculateRelevanceScore(article: NewsArticle): number {
    let score = 0;
    const text = `${article.title} ${article.content}`.toLowerCase();
    
    // Keywords and their weights
    const keywords = {
      'trump': 0.3,
      'president': 0.1,
      'donald': 0.2,
      'administration': 0.1,
      'white house': 0.1,
      'policy': 0.05,
      'election': 0.1,
      'republican': 0.05
    };

    // Calculate keyword score
    for (const [keyword, weight] of Object.entries(keywords)) {
      if (text.includes(keyword)) {
        score += weight;
      }
    }

    // Boost score for recent articles
    const hoursSincePublished = (Date.now() - article.publishedAt.getTime()) / (1000 * 60 * 60);
    if (hoursSincePublished < 24) {
      score += 0.2;
    } else if (hoursSincePublished < 48) {
      score += 0.1;
    }

    // Boost for reputable sources
    const reputableSources = ['CNN', 'BBC', 'Reuters', 'AP', 'Bloomberg', 'The New York Times', 'The Washington Post'];
    if (reputableSources.some(source => article.source.includes(source))) {
      score += 0.1;
    }

    return Math.min(1, score);
  }

  async saveRawData(data: DataCollectionResult): Promise<void> {
    const outputPath = path.join(this.config.workingDirectory, 'outputs', 'raw_data.json');
    const pipelinePath = path.join(this.coordinationPath, 'trump_infog', 'data_pipeline', 'raw_data.json');
    
    // Save to both locations
    await Promise.all([
      fs.writeFile(outputPath, JSON.stringify(data, null, 2)),
      fs.writeFile(pipelinePath, JSON.stringify(data, null, 2))
    ]);

    // Also save a summary for quick reference
    const summaryPath = path.join(this.config.workingDirectory, 'outputs', 'collection_summary.json');
    const summary = {
      timestamp: data.timestamp,
      totalArticles: data.totalCount,
      validatedArticles: data.validatedCount,
      sources: data.sources,
      topArticles: data.articles.slice(0, 5).map(a => ({
        title: a.title,
        source: a.source,
        relevanceScore: a.relevanceScore
      }))
    };
    
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
  }
}