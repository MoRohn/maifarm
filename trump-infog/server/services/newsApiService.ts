import NewsAPI from 'newsapi';
import type { NewsArticle } from '../../src/types/news.js';

export class NewsApiService {
  private newsapi: NewsAPI | null = null;
  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.NEWS_API_KEY;
    if (this.apiKey) {
      this.newsapi = new NewsAPI(this.apiKey);
    }
  }

  async fetchTrumpArticles(
    from?: Date,
    to?: Date,
    pageSize: number = 100
  ): Promise<NewsArticle[]> {
    if (!this.newsapi) {
      console.warn('NewsAPI key not configured, skipping NewsAPI fetch');
      return [];
    }

    try {
      const fromDate = from || new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago
      const toDate = to || new Date();

      const response = await this.newsapi.v2.everything({
        q: 'Trump OR "Donald Trump" OR "President Trump"',
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        language: 'en',
        sortBy: 'publishedAt',
        pageSize,
      });

      if (response.status === 'ok' && response.articles) {
        return response.articles.map((article: any) => ({
          id: `newsapi-${Buffer.from(article.url).toString('base64').substring(0, 12)}`,
          title: article.title || '',
          description: article.description || '',
          content: article.content || '',
          url: article.url,
          urlToImage: article.urlToImage,
          publishedAt: new Date(article.publishedAt),
          source: {
            id: article.source.id,
            name: article.source.name,
          },
          author: article.author,
        }));
      }

      return [];
    } catch (error) {
      console.error('Error fetching from NewsAPI:', error);
      throw new Error(`NewsAPI fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async searchArticles(
    query: string,
    options?: {
      from?: Date;
      to?: Date;
      sources?: string[];
      domains?: string[];
      pageSize?: number;
    }
  ): Promise<NewsArticle[]> {
    if (!this.newsapi) {
      return [];
    }

    try {
      const response = await this.newsapi.v2.everything({
        q: query,
        from: options?.from?.toISOString(),
        to: options?.to?.toISOString(),
        sources: options?.sources?.join(','),
        domains: options?.domains?.join(','),
        language: 'en',
        sortBy: 'relevancy',
        pageSize: options?.pageSize || 50,
      });

      if (response.status === 'ok' && response.articles) {
        return response.articles.map((article: any) => ({
          id: `newsapi-${Buffer.from(article.url).toString('base64').substring(0, 12)}`,
          title: article.title || '',
          description: article.description || '',
          content: article.content || '',
          url: article.url,
          urlToImage: article.urlToImage,
          publishedAt: new Date(article.publishedAt),
          source: {
            id: article.source.id,
            name: article.source.name,
          },
          author: article.author,
        }));
      }

      return [];
    } catch (error) {
      console.error('Error searching NewsAPI:', error);
      throw error;
    }
  }

  isConfigured(): boolean {
    return this.newsapi !== null;
  }
}