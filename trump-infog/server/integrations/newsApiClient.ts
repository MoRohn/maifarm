import NewsAPI from 'newsapi'
import Bottleneck from 'bottleneck'
import { config } from 'dotenv'

config()

export interface NewsArticle {
  source: {
    id: string | null
    name: string
  }
  author: string | null
  title: string
  description: string | null
  url: string
  urlToImage: string | null
  publishedAt: string
  content: string | null
}

export interface NewsAPIQueryParams {
  q?: string
  sources?: string
  domains?: string
  from?: string
  to?: string
  language?: string
  sortBy?: 'relevancy' | 'popularity' | 'publishedAt'
  pageSize?: number
  page?: number
}

export interface NewsAPIResponse {
  status: 'ok' | 'error'
  totalResults?: number
  articles?: NewsArticle[]
  code?: string
  message?: string
}

export class NewsAPIClient {
  private newsapi: NewsAPI
  private limiter: Bottleneck
  private readonly MAX_PAGE_SIZE = 100
  private readonly DEFAULT_PAGE_SIZE = 20

  constructor(apiKey?: string) {
    if (!apiKey && !process.env.NEWS_API_KEY) {
      throw new Error('NewsAPI key is required. Set NEWS_API_KEY environment variable.')
    }

    this.newsapi = new NewsAPI(apiKey || process.env.NEWS_API_KEY!)

    // Rate limiter: NewsAPI allows 500 requests per day (free tier)
    // That's roughly 20 requests per hour
    this.limiter = new Bottleneck({
      maxConcurrent: 1,
      minTime: 3000, // 3 seconds between requests
      reservoir: 20, // 20 requests per hour
      reservoirRefreshAmount: 20,
      reservoirRefreshInterval: 60 * 60 * 1000 // 1 hour
    })
  }

  /**
   * Search for Trump-related news articles
   */
  async searchTrumpNews(params: NewsAPIQueryParams = {}): Promise<NewsAPIResponse> {
    try {
      const searchParams = {
        q: params.q || 'Trump',
        language: params.language || 'en',
        sortBy: params.sortBy || 'publishedAt',
        pageSize: Math.min(params.pageSize || this.DEFAULT_PAGE_SIZE, this.MAX_PAGE_SIZE),
        page: params.page || 1,
        from: params.from || this.getDefaultFromDate(),
        to: params.to || new Date().toISOString(),
        ...params
      }

      const response = await this.limiter.schedule(() => 
        this.newsapi.v2.everything(searchParams)
      )

      return this.formatResponse(response)
    } catch (error) {
      return this.handleError(error)
    }
  }

  /**
   * Get top headlines about Trump
   */
  async getTrumpHeadlines(country: string = 'us'): Promise<NewsAPIResponse> {
    try {
      const response = await this.limiter.schedule(() => 
        this.newsapi.v2.topHeadlines({
          q: 'Trump',
          country,
          pageSize: this.DEFAULT_PAGE_SIZE
        })
      )

      return this.formatResponse(response)
    } catch (error) {
      return this.handleError(error)
    }
  }

  /**
   * Search articles from specific sources
   */
  async searchBySources(sources: string[], query: string = 'Trump'): Promise<NewsAPIResponse> {
    try {
      const response = await this.limiter.schedule(() => 
        this.newsapi.v2.everything({
          q: query,
          sources: sources.join(','),
          sortBy: 'publishedAt',
          pageSize: this.DEFAULT_PAGE_SIZE
        })
      )

      return this.formatResponse(response)
    } catch (error) {
      return this.handleError(error)
    }
  }

  /**
   * Get all available news sources
   */
  async getSources(category?: string, country?: string): Promise<any> {
    try {
      const params: any = {}
      if (category) params.category = category
      if (country) params.country = country

      const response = await this.limiter.schedule(() => 
        this.newsapi.v2.sources(params)
      )

      return response
    } catch (error) {
      return this.handleError(error)
    }
  }

  /**
   * Batch fetch articles with pagination
   */
  async batchFetchArticles(
    query: string = 'Trump',
    maxArticles: number = 100
  ): Promise<NewsArticle[]> {
    const articles: NewsArticle[] = []
    let page = 1
    const pageSize = this.MAX_PAGE_SIZE

    while (articles.length < maxArticles) {
      const response = await this.searchTrumpNews({
        q: query,
        pageSize,
        page
      })

      if (response.status === 'error' || !response.articles) {
        break
      }

      articles.push(...response.articles)

      if (response.articles.length < pageSize) {
        break // No more articles
      }

      page++
    }

    return articles.slice(0, maxArticles)
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus() {
    return {
      remaining: this.limiter.reservoir,
      resetTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      maxPerHour: 20
    }
  }

  private formatResponse(response: any): NewsAPIResponse {
    if (response.status === 'ok') {
      return {
        status: 'ok',
        totalResults: response.totalResults,
        articles: response.articles
      }
    }

    return {
      status: 'error',
      code: response.code,
      message: response.message
    }
  }

  private handleError(error: any): NewsAPIResponse {
    console.error('NewsAPI Error:', error)
    
    return {
      status: 'error',
      code: error.code || 'UNKNOWN_ERROR',
      message: error.message || 'An unknown error occurred'
    }
  }

  private getDefaultFromDate(): string {
    const date = new Date()
    date.setDate(date.getDate() - 7) // 7 days ago
    return date.toISOString()
  }
}

// Singleton instance
let newsAPIClient: NewsAPIClient | null = null

export function getNewsAPIClient(): NewsAPIClient {
  if (!newsAPIClient) {
    newsAPIClient = new NewsAPIClient()
  }
  return newsAPIClient
}