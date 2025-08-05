import axios from 'axios';
import crypto from 'crypto';
import { INewsService, NewsArticle, NewsSearchOptions } from './types.js';
import { cacheService } from './cacheService.js';
import { rateLimiter } from './rateLimiter.js';

export class NewsService implements INewsService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://newsapi.org/v2';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.NEWS_API_KEY || '';
    if (!this.apiKey) {
      console.warn('NewsAPI key not provided. Service will operate in limited mode.');
    }
  }

  async searchArticles(options: NewsSearchOptions): Promise<NewsArticle[]> {
    const cacheKey = this.generateCacheKey(options);
    
    const cached = await cacheService.get<NewsArticle[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const articles = await rateLimiter.schedule(() => this.fetchArticles(options));
      const validArticles = articles.filter(article => this.validateArticle(article));
      const uniqueArticles = this.removeDuplicates(validArticles);
      
      await cacheService.set(cacheKey, uniqueArticles, { ttl: 3600 });
      
      return uniqueArticles;
    } catch (error) {
      console.error('Error searching articles:', error);
      return [];
    }
  }

  private async fetchArticles(options: NewsSearchOptions): Promise<NewsArticle[]> {
    const params = {
      q: options.query,
      from: options.from?.toISOString(),
      to: options.to?.toISOString(),
      sources: options.sources?.join(','),
      language: options.language || 'en',
      sortBy: options.sortBy || 'relevancy',
      pageSize: options.pageSize || 100,
      page: options.page || 1,
      apiKey: this.apiKey
    };

    try {
      const response = await axios.get(`${this.baseUrl}/everything`, { params });
      
      if (response.data.status === 'ok') {
        return response.data.articles.map(this.transformArticle);
      } else {
        throw new Error(`NewsAPI error: ${response.data.message}`);
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 426) {
        return this.getMockArticles(options);
      }
      throw error;
    }
  }

  private transformArticle(article: any): NewsArticle {
    return {
      id: crypto.createHash('md5').update(article.url).digest('hex'),
      title: article.title || '',
      description: article.description || '',
      content: article.content || '',
      source: {
        id: article.source?.id || null,
        name: article.source?.name || 'Unknown'
      },
      author: article.author || null,
      url: article.url || '',
      urlToImage: article.urlToImage || null,
      publishedAt: article.publishedAt || new Date().toISOString()
    };
  }

  async getArticleById(id: string): Promise<NewsArticle | null> {
    const cacheKey = `article:${id}`;
    const cached = await cacheService.get<NewsArticle>(cacheKey);
    
    if (cached) {
      return cached;
    }

    return null;
  }

  validateArticle(article: NewsArticle): boolean {
    if (!article.title || !article.url) {
      return false;
    }

    if (article.title === '[Removed]' || article.content === '[Removed]') {
      return false;
    }

    if (!article.publishedAt || isNaN(Date.parse(article.publishedAt))) {
      return false;
    }

    const minContentLength = 50;
    const contentLength = (article.content || article.description || '').length;
    if (contentLength < minContentLength) {
      return false;
    }

    return true;
  }

  removeDuplicates(articles: NewsArticle[]): NewsArticle[] {
    const seen = new Map<string, NewsArticle>();
    const titleHashes = new Map<string, string>();

    for (const article of articles) {
      const urlHash = crypto.createHash('md5').update(article.url).digest('hex');
      
      if (seen.has(urlHash)) {
        continue;
      }

      const normalizedTitle = article.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      const titleHash = crypto.createHash('md5').update(normalizedTitle).digest('hex');
      
      if (titleHashes.has(titleHash)) {
        const existingId = titleHashes.get(titleHash)!;
        const existing = seen.get(existingId)!;
        
        if (this.calculateSimilarity(article.content, existing.content) > 0.8) {
          continue;
        }
      }

      seen.set(urlHash, article);
      titleHashes.set(titleHash, urlHash);
    }

    return Array.from(seen.values());
  }

  private calculateSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;

    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private generateCacheKey(options: NewsSearchOptions): string {
    const keyData = JSON.stringify({
      query: options.query,
      from: options.from?.toISOString(),
      to: options.to?.toISOString(),
      sources: options.sources?.sort(),
      language: options.language,
      sortBy: options.sortBy
    });
    
    return `news:${crypto.createHash('md5').update(keyData).digest('hex')}`;
  }

  private getMockArticles(options: NewsSearchOptions): NewsArticle[] {
    const mockArticles: NewsArticle[] = [
      {
        id: '1',
        title: 'Trump Announces New Policy Initiative',
        description: 'Former President Trump unveiled a comprehensive policy framework...',
        content: 'In a major announcement today, former President Donald Trump outlined his vision for a new policy initiative that he claims will transform the American political landscape. The comprehensive framework addresses key issues including economic growth, border security, and foreign policy. Trump emphasized the importance of putting "America First" in all policy decisions.',
        source: { id: null, name: 'Political News Network' },
        author: 'Jane Reporter',
        url: 'https://example.com/trump-policy-1',
        urlToImage: null,
        publishedAt: new Date().toISOString()
      },
      {
        id: '2',
        title: 'Trump Leads in Latest Primary Polls',
        description: 'Recent polling data shows Trump maintaining a significant lead...',
        content: 'The latest primary polls released this week show former President Trump maintaining a commanding lead over his rivals. According to multiple polling organizations, Trump continues to dominate the field with support from a broad coalition of Republican voters. Analysts point to his strong messaging on economic issues and border security as key factors in his sustained popularity.',
        source: { id: null, name: 'Election Analytics Today' },
        author: 'John Pollster',
        url: 'https://example.com/trump-polls-2',
        urlToImage: null,
        publishedAt: new Date(Date.now() - 86400000).toISOString()
      },
      {
        id: '3',
        title: 'Trump Campaign Rally Draws Massive Crowd',
        description: 'Thousands gather for Trump campaign event in key swing state...',
        content: 'A massive crowd gathered yesterday evening for a Trump campaign rally in a crucial swing state. Local authorities estimated attendance at over 20,000 supporters, with many more watching via livestream. Trump delivered a fiery speech touching on his signature issues including immigration reform, economic policy, and criticism of the current administration.',
        source: { id: null, name: 'Campaign Trail Report' },
        author: 'Sarah Correspondent',
        url: 'https://example.com/trump-rally-3',
        urlToImage: null,
        publishedAt: new Date(Date.now() - 172800000).toISOString()
      }
    ];

    return mockArticles.filter(article => 
      article.title.toLowerCase().includes(options.query.toLowerCase()) ||
      article.content.toLowerCase().includes(options.query.toLowerCase())
    );
  }
}

export const newsService = new NewsService();