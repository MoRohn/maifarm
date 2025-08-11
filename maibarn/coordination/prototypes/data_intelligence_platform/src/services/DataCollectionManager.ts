import axios from 'axios';
import * as cheerio from 'cheerio';
import Parser from 'rss-parser';
import { logger } from '../utils/logger';

interface DataSource {
  id: string;
  name: string;
  type: 'web_scraping' | 'api' | 'rss' | 'social_media' | 'financial' | 'news';
  url: string;
  frequency: 'realtime' | 'hourly' | 'daily' | 'weekly';
  active: boolean;
  last_collected: Date | null;
  config: Record<string, any>;
}

interface CollectedData {
  source_id: string;
  content: any;
  timestamp: Date;
  metadata: Record<string, any>;
}

export class DataCollectionManager {
  private dataSources: Map<string, DataSource> = new Map();
  private rssParser: Parser;
  private isInitialized = false;
  private collectionJobs: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.rssParser = new Parser({
      customFields: {
        feed: ['language', 'country'],
        item: ['category', 'author']
      }
    });
  }

  async initialize(): Promise<void> {
    try {
      logger.info('🔄 Initializing Data Collection Manager...');
      
      await this.loadDataSources();
      await this.startAutonomousCollection();
      
      this.isInitialized = true;
      logger.info('✅ Data Collection Manager initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize Data Collection Manager:', error);
      throw error;
    }
  }

  private async loadDataSources(): Promise<void> {
    // Define autonomous data collection sources
    const sources: DataSource[] = [
      // Tech Industry News
      {
        id: 'techcrunch',
        name: 'TechCrunch RSS',
        type: 'rss',
        url: 'https://techcrunch.com/feed/',
        frequency: 'hourly',
        active: true,
        last_collected: null,
        config: { category: 'technology' }
      },
      {
        id: 'hackernews',
        name: 'Hacker News API',
        type: 'api',
        url: 'https://hacker-news.firebaseio.com/v0/topstories.json',
        frequency: 'hourly',
        active: true,
        last_collected: null,
        config: { limit: 50, category: 'technology' }
      },
      
      // Business & Finance
      {
        id: 'reuters_business',
        name: 'Reuters Business',
        type: 'rss',
        url: 'https://www.reuters.com/business/finance/',
        frequency: 'hourly', 
        active: true,
        last_collected: null,
        config: { category: 'business' }
      },
      {
        id: 'coindesk',
        name: 'CoinDesk Crypto',
        type: 'rss',
        url: 'https://www.coindesk.com/feed/',
        frequency: 'hourly',
        active: true,
        last_collected: null,
        config: { category: 'cryptocurrency' }
      },

      // Market Data
      {
        id: 'stock_prices',
        name: 'Stock Market Data',
        type: 'api',
        url: 'https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/2023-01-09',
        frequency: 'hourly',
        active: true,
        last_collected: null,
        config: { category: 'stocks', symbols: ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA'] }
      },

      // Social Media Trends (using public APIs)
      {
        id: 'reddit_trends',
        name: 'Reddit Trends',
        type: 'api',
        url: 'https://www.reddit.com/r/all/hot.json',
        frequency: 'hourly',
        active: true,
        last_collected: null,
        config: { category: 'social', limit: 25 }
      },

      // Product Hunt
      {
        id: 'product_hunt',
        name: 'Product Hunt',
        type: 'api',
        url: 'https://api.producthunt.com/v1/posts',
        frequency: 'daily',
        active: true,
        last_collected: null,
        config: { category: 'products' }
      },

      // Industry Analysis
      {
        id: 'github_trending',
        name: 'GitHub Trending',
        type: 'web_scraping',
        url: 'https://github.com/trending',
        frequency: 'daily',
        active: true,
        last_collected: null,
        config: { category: 'development' }
      },

      // Patent Data (public)
      {
        id: 'patent_trends',
        name: 'USPTO Patents',
        type: 'web_scraping',
        url: 'https://www.uspto.gov/patents/search',
        frequency: 'weekly',
        active: true,
        last_collected: null,
        config: { category: 'patents' }
      }
    ];

    sources.forEach(source => {
      this.dataSources.set(source.id, source);
    });

    logger.info(`📊 Loaded ${sources.length} data sources for autonomous collection`);
  }

  private async startAutonomousCollection(): Promise<void> {
    for (const [sourceId, source] of this.dataSources) {
      if (source.active) {
        await this.scheduleCollection(source);
      }
    }
    
    logger.info('⚡ Autonomous data collection jobs scheduled');
  }

  private async scheduleCollection(source: DataSource): Promise<void> {
    const intervalMap = {
      'realtime': 1000 * 60 * 5,      // 5 minutes
      'hourly': 1000 * 60 * 60,       // 1 hour
      'daily': 1000 * 60 * 60 * 24,   // 24 hours  
      'weekly': 1000 * 60 * 60 * 24 * 7 // 7 days
    };

    const interval = intervalMap[source.frequency];
    
    // Start immediate collection
    await this.collectFromSource(source);
    
    // Schedule recurring collection
    const jobId = setInterval(async () => {
      await this.collectFromSource(source);
    }, interval);

    this.collectionJobs.set(source.id, jobId);
    logger.info(`⏰ Scheduled ${source.name} for ${source.frequency} collection`);
  }

  /**
   * Collect real-time data from all active sources
   */
  async collectRealTimeData(): Promise<CollectedData[]> {
    const realtimeSources = Array.from(this.dataSources.values())
      .filter(source => source.frequency === 'realtime' && source.active);

    const collectionPromises = realtimeSources.map(source => 
      this.collectFromSource(source)
    );

    const results = await Promise.allSettled(collectionPromises);
    const collected: CollectedData[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        collected.push(...result.value);
      } else {
        logger.error(`❌ Failed to collect from ${realtimeSources[index].name}:`, result.reason);
      }
    });

    logger.info(`✅ Collected ${collected.length} real-time data points`);
    return collected;
  }

  private async collectFromSource(source: DataSource): Promise<CollectedData[]> {
    try {
      logger.info(`🔍 Collecting data from ${source.name}`);
      
      let data: CollectedData[] = [];

      switch (source.type) {
        case 'rss':
          data = await this.collectRSSData(source);
          break;
        case 'api':
          data = await this.collectAPIData(source);
          break;
        case 'web_scraping':
          data = await this.collectWebScrapingData(source);
          break;
        default:
          logger.warn(`⚠️ Unsupported source type: ${source.type}`);
      }

      // Update last collected timestamp
      source.last_collected = new Date();
      this.dataSources.set(source.id, source);

      logger.info(`✅ Collected ${data.length} items from ${source.name}`);
      return data;

    } catch (error) {
      logger.error(`❌ Collection failed for ${source.name}:`, error);
      return [];
    }
  }

  private async collectRSSData(source: DataSource): Promise<CollectedData[]> {
    try {
      const feed = await this.rssParser.parseURL(source.url);
      
      return feed.items.slice(0, 50).map(item => ({
        source_id: source.id,
        content: {
          title: item.title,
          description: item.contentSnippet || item.content,
          link: item.link,
          published: item.pubDate,
          author: item.creator || item.author
        },
        timestamp: new Date(),
        metadata: {
          source_name: source.name,
          category: source.config.category,
          type: 'rss_article'
        }
      }));

    } catch (error) {
      logger.error(`❌ RSS collection failed for ${source.url}:`, error);
      return [];
    }
  }

  private async collectAPIData(source: DataSource): Promise<CollectedData[]> {
    try {
      // Handle different API types
      if (source.id === 'hackernews') {
        return await this.collectHackerNewsData(source);
      } else if (source.id === 'reddit_trends') {
        return await this.collectRedditData(source);
      } else if (source.id === 'stock_prices') {
        return await this.collectStockData(source);
      } else {
        // Generic API collection
        const response = await axios.get(source.url, {
          timeout: 10000,
          headers: {
            'User-Agent': 'AutonomousDataIntelligencePlatform/1.0'
          }
        });

        return [{
          source_id: source.id,
          content: response.data,
          timestamp: new Date(),
          metadata: {
            source_name: source.name,
            category: source.config.category,
            type: 'api_data'
          }
        }];
      }

    } catch (error) {
      logger.error(`❌ API collection failed for ${source.url}:`, error);
      return [];
    }
  }

  private async collectHackerNewsData(source: DataSource): Promise<CollectedData[]> {
    try {
      const response = await axios.get(source.url);
      const topStoryIds = response.data.slice(0, 30);
      
      const storyPromises = topStoryIds.map(async (id: number) => {
        const storyResponse = await axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        return storyResponse.data;
      });

      const stories = await Promise.all(storyPromises);
      
      return stories.filter(story => story && story.title).map(story => ({
        source_id: source.id,
        content: {
          title: story.title,
          url: story.url,
          score: story.score,
          comments: story.descendants,
          author: story.by,
          time: new Date(story.time * 1000)
        },
        timestamp: new Date(),
        metadata: {
          source_name: source.name,
          category: source.config.category,
          type: 'hackernews_story'
        }
      }));

    } catch (error) {
      logger.error(`❌ Hacker News collection failed:`, error);
      return [];
    }
  }

  private async collectRedditData(source: DataSource): Promise<CollectedData[]> {
    try {
      const response = await axios.get(source.url, {
        headers: {
          'User-Agent': 'AutonomousDataIntelligencePlatform/1.0'
        }
      });

      const posts = response.data.data.children;
      
      return posts.slice(0, 25).map((post: any) => ({
        source_id: source.id,
        content: {
          title: post.data.title,
          text: post.data.selftext,
          subreddit: post.data.subreddit,
          score: post.data.score,
          comments: post.data.num_comments,
          url: post.data.url,
          created: new Date(post.data.created_utc * 1000)
        },
        timestamp: new Date(),
        metadata: {
          source_name: source.name,
          category: source.config.category,
          type: 'reddit_post'
        }
      }));

    } catch (error) {
      logger.error(`❌ Reddit collection failed:`, error);
      return [];
    }
  }

  private async collectStockData(source: DataSource): Promise<CollectedData[]> {
    // This would integrate with a real stock API like Alpha Vantage or Polygon
    // For now, return mock data structure
    return [{
      source_id: source.id,
      content: {
        symbol: 'MOCK',
        price: 100,
        change: 2.5,
        volume: 1000000,
        timestamp: new Date()
      },
      timestamp: new Date(),
      metadata: {
        source_name: source.name,
        category: source.config.category,
        type: 'stock_data'
      }
    }];
  }

  private async collectWebScrapingData(source: DataSource): Promise<CollectedData[]> {
    try {
      const response = await axios.get(source.url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      
      if (source.id === 'github_trending') {
        return this.scrapeGitHubTrending($, source);
      }

      // Generic scraping fallback
      return [{
        source_id: source.id,
        content: {
          html: response.data,
          title: $('title').text(),
          headings: $('h1, h2, h3').map((i, el) => $(el).text()).get()
        },
        timestamp: new Date(),
        metadata: {
          source_name: source.name,
          category: source.config.category,
          type: 'web_scraping'
        }
      }];

    } catch (error) {
      logger.error(`❌ Web scraping failed for ${source.url}:`, error);
      return [];
    }
  }

  private scrapeGitHubTrending($: cheerio.CheerioAPI, source: DataSource): CollectedData[] {
    const repos: CollectedData[] = [];
    
    $('.Box-row').each((index, element) => {
      const repoName = $(element).find('h2 a').attr('href')?.replace('/', '');
      const description = $(element).find('p').text().trim();
      const language = $(element).find('[itemprop="programmingLanguage"]').text();
      const stars = $(element).find('.octicon-star').parent().text().trim();
      
      if (repoName) {
        repos.push({
          source_id: source.id,
          content: {
            name: repoName,
            description,
            language,
            stars,
            url: `https://github.com${$(element).find('h2 a').attr('href')}`
          },
          timestamp: new Date(),
          metadata: {
            source_name: source.name,
            category: source.config.category,
            type: 'github_repo'
          }
        });
      }
    });

    return repos;
  }

  /**
   * Get latest collected data for intelligence processing
   */
  async getLatestData(hours: number = 24): Promise<CollectedData[]> {
    // In a real implementation, this would query the database
    // For now, return mock data structure
    return [];
  }

  /**
   * Optimize data sources based on performance
   */
  async optimizeDataSources(): Promise<void> {
    logger.info('⚡ Optimizing data collection sources');
    
    // Analyze source performance and adjust collection frequencies
    for (const [sourceId, source] of this.dataSources) {
      const performance = await this.analyzeSourcePerformance(source);
      
      if (performance.success_rate < 0.5) {
        logger.warn(`⚠️ Poor performance from ${source.name}, reducing frequency`);
        // Reduce collection frequency for poor performers
      } else if (performance.value_score > 0.8) {
        logger.info(`⚡ High value from ${source.name}, increasing priority`);
        // Increase priority for high-value sources
      }
    }
  }

  private async analyzeSourcePerformance(source: DataSource): Promise<{success_rate: number; value_score: number}> {
    // Analyze source performance metrics
    return {
      success_rate: 0.85, // Mock data
      value_score: 0.75   // Mock data
    };
  }

  isHealthy(): boolean {
    return this.isInitialized && this.dataSources.size > 0;
  }

  async shutdown(): Promise<void> {
    logger.info('🛑 Shutting down Data Collection Manager');
    
    // Clear all collection jobs
    for (const [sourceId, jobId] of this.collectionJobs) {
      clearInterval(jobId);
    }
    
    this.collectionJobs.clear();
    this.dataSources.clear();
    this.isInitialized = false;
  }
}