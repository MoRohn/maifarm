import Parser from 'rss-parser'
import Bottleneck from 'bottleneck'
import axios from 'axios'

export interface RSSFeedItem {
  title: string
  link: string
  pubDate: string
  creator?: string
  content?: string
  contentSnippet?: string
  guid?: string
  categories?: string[]
  isoDate?: string
}

export interface RSSFeed {
  title: string
  description?: string
  link: string
  items: RSSFeedItem[]
  lastBuildDate?: string
}

export interface FeedSource {
  name: string
  url: string
  category: string
}

// Major news outlets RSS feeds
export const NEWS_FEEDS: FeedSource[] = [
  {
    name: 'CNN Politics',
    url: 'http://rss.cnn.com/rss/cnn_allpolitics.rss',
    category: 'politics'
  },
  {
    name: 'Fox News Politics',
    url: 'https://moxie.foxnews.com/google-publisher/politics.xml',
    category: 'politics'
  },
  {
    name: 'BBC News US & Canada',
    url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml',
    category: 'world'
  },
  {
    name: 'Reuters Politics',
    url: 'https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best',
    category: 'politics'
  },
  {
    name: 'The Guardian US',
    url: 'https://www.theguardian.com/us-news/rss',
    category: 'us-news'
  },
  {
    name: 'Politico',
    url: 'https://rss.politico.com/playbook.xml',
    category: 'politics'
  },
  {
    name: 'The Hill',
    url: 'https://thehill.com/news/feed/',
    category: 'politics'
  },
  {
    name: 'NPR Politics',
    url: 'https://feeds.npr.org/1014/rss.xml',
    category: 'politics'
  }
]

export class RSSFeedParser {
  private parser: Parser
  private limiter: Bottleneck
  private feedCache: Map<string, { data: RSSFeed; timestamp: number }>

  constructor() {
    this.parser = new Parser({
      headers: {
        'User-Agent': 'Trump-Infog-Bot/1.0'
      },
      timeout: 10000,
      customFields: {
        item: [
          ['media:content', 'media'],
          ['dc:creator', 'creator']
        ]
      }
    })

    // Rate limiter to prevent overwhelming RSS servers
    this.limiter = new Bottleneck({
      maxConcurrent: 2,
      minTime: 1000 // 1 second between requests
    })

    this.feedCache = new Map()
  }

  /**
   * Parse a single RSS feed
   */
  async parseFeed(feedUrl: string): Promise<RSSFeed> {
    try {
      // Check cache first (5 minutes cache)
      const cached = this.feedCache.get(feedUrl)
      if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
        return cached.data
      }

      const feed = await this.limiter.schedule(() => 
        this.parser.parseURL(feedUrl)
      )

      const parsedFeed: RSSFeed = {
        title: feed.title || 'Unknown Feed',
        description: feed.description,
        link: feed.link || feedUrl,
        lastBuildDate: feed.lastBuildDate,
        items: feed.items.map(item => ({
          title: item.title || '',
          link: item.link || '',
          pubDate: item.pubDate || new Date().toISOString(),
          creator: item.creator || item.author,
          content: item.content,
          contentSnippet: item.contentSnippet,
          guid: item.guid,
          categories: item.categories,
          isoDate: item.isoDate
        }))
      }

      // Cache the result
      this.feedCache.set(feedUrl, {
        data: parsedFeed,
        timestamp: Date.now()
      })

      return parsedFeed
    } catch (error) {
      console.error(`Error parsing feed ${feedUrl}:`, error)
      throw new Error(`Failed to parse RSS feed: ${feedUrl}`)
    }
  }

  /**
   * Parse multiple feeds in parallel
   */
  async parseMultipleFeeds(feedUrls: string[]): Promise<RSSFeed[]> {
    const results = await Promise.allSettled(
      feedUrls.map(url => this.parseFeed(url))
    )

    return results
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<RSSFeed>).value)
  }

  /**
   * Get Trump-related articles from all configured feeds
   */
  async getTrumpArticles(
    feeds: FeedSource[] = NEWS_FEEDS,
    keywords: string[] = ['Trump', 'Donald Trump', 'MAGA']
  ): Promise<RSSFeedItem[]> {
    const allFeeds = await this.parseMultipleFeeds(feeds.map(f => f.url))
    const trumpArticles: RSSFeedItem[] = []

    for (let i = 0; i < allFeeds.length; i++) {
      const feed = allFeeds[i]
      const source = feeds[i]

      const relevantItems = feed.items.filter(item => {
        const searchText = `${item.title} ${item.contentSnippet || ''} ${item.content || ''}`.toLowerCase()
        return keywords.some(keyword => searchText.includes(keyword.toLowerCase()))
      })

      // Add source metadata
      relevantItems.forEach(item => {
        trumpArticles.push({
          ...item,
          categories: [...(item.categories || []), source.category, source.name]
        })
      })
    }

    // Sort by publication date (newest first)
    return trumpArticles.sort((a, b) => {
      const dateA = new Date(a.pubDate || a.isoDate || 0)
      const dateB = new Date(b.pubDate || b.isoDate || 0)
      return dateB.getTime() - dateA.getTime()
    })
  }

  /**
   * Get articles from specific time period
   */
  async getArticlesByTimeRange(
    startDate: Date,
    endDate: Date = new Date(),
    feeds: FeedSource[] = NEWS_FEEDS
  ): Promise<RSSFeedItem[]> {
    const articles = await this.getTrumpArticles(feeds)
    
    return articles.filter(article => {
      const articleDate = new Date(article.pubDate || article.isoDate || 0)
      return articleDate >= startDate && articleDate <= endDate
    })
  }

  /**
   * Extract full article content (if possible)
   */
  async extractFullContent(articleUrl: string): Promise<string | null> {
    try {
      const response = await axios.get(articleUrl, {
        headers: {
          'User-Agent': 'Trump-Infog-Bot/1.0'
        },
        timeout: 10000
      })

      // Basic content extraction (would need more sophisticated parsing in production)
      const html = response.data
      const contentMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
      
      if (contentMatch) {
        // Strip HTML tags
        return contentMatch[1].replace(/<[^>]*>/g, '').trim()
      }

      return null
    } catch (error) {
      console.error(`Error extracting content from ${articleUrl}:`, error)
      return null
    }
  }

  /**
   * Clear feed cache
   */
  clearCache(): void {
    this.feedCache.clear()
  }

  /**
   * Get feed statistics
   */
  async getFeedStats(feeds: FeedSource[] = NEWS_FEEDS): Promise<any> {
    const stats: any = {
      totalFeeds: feeds.length,
      feedStatus: [],
      totalArticles: 0,
      trumpArticles: 0
    }

    for (const feed of feeds) {
      try {
        const parsedFeed = await this.parseFeed(feed.url)
        const trumpCount = parsedFeed.items.filter(item => 
          item.title.toLowerCase().includes('trump')
        ).length

        stats.feedStatus.push({
          name: feed.name,
          status: 'active',
          articleCount: parsedFeed.items.length,
          trumpArticleCount: trumpCount,
          lastUpdate: parsedFeed.lastBuildDate
        })

        stats.totalArticles += parsedFeed.items.length
        stats.trumpArticles += trumpCount
      } catch (error) {
        stats.feedStatus.push({
          name: feed.name,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return stats
  }
}

// Singleton instance
let rssFeedParser: RSSFeedParser | null = null

export function getRSSFeedParser(): RSSFeedParser {
  if (!rssFeedParser) {
    rssFeedParser = new RSSFeedParser()
  }
  return rssFeedParser
}