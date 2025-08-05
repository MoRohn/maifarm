import Parser from 'rss-parser';
import type { NewsArticle, RSSFeedSource } from '../../src/types/news.js';

export class RssFeedParser {
  private parser: Parser;

  constructor() {
    this.parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'Trump-Infog-Bot/1.0',
      },
    });
  }

  async parseFeeds(sources: RSSFeedSource[]): Promise<NewsArticle[]> {
    const enabledSources = sources.filter(source => source.enabled);
    const articles: NewsArticle[] = [];

    const feedPromises = enabledSources.map(source => 
      this.parseSingleFeed(source).catch(error => {
        console.error(`Error parsing feed ${source.name}:`, error);
        return [];
      })
    );

    const results = await Promise.allSettled(feedPromises);
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        articles.push(...result.value);
      }
    }

    return articles;
  }

  private async parseSingleFeed(source: RSSFeedSource): Promise<NewsArticle[]> {
    try {
      const feed = await this.parser.parseURL(source.url);
      const articles: NewsArticle[] = [];

      for (const item of feed.items) {
        // Check if Trump-related
        const combinedText = `${item.title || ''} ${item.contentSnippet || ''} ${item.content || ''}`.toLowerCase();
        if (!this.isTrumpRelated(combinedText)) {
          continue;
        }

        const article: NewsArticle = {
          id: `rss-${Buffer.from(item.link || item.guid || '').toString('base64').substring(0, 12)}`,
          title: item.title || '',
          description: item.contentSnippet || item.summary || '',
          content: item.content || item.contentSnippet || '',
          url: item.link || item.guid || '',
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
          source: {
            id: source.name.toLowerCase().replace(/\s+/g, '-'),
            name: source.name,
          },
          author: item.creator || item.author || null,
        };

        // Extract image from content if available
        const imageMatch = item.content?.match(/<img[^>]+src="([^"]+)"/);
        if (imageMatch) {
          article.urlToImage = imageMatch[1];
        }

        articles.push(article);
      }

      return articles;
    } catch (error) {
      console.error(`Failed to parse RSS feed from ${source.name}:`, error);
      throw new Error(`RSS parsing failed for ${source.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private isTrumpRelated(text: string): boolean {
    const trumpKeywords = [
      'trump',
      'donald trump',
      'president trump',
      'former president trump',
      'maga',
      'mar-a-lago',
      'trump organization',
      'melania trump',
      'ivanka trump',
      'eric trump',
      'donald trump jr'
    ];

    return trumpKeywords.some(keyword => text.includes(keyword));
  }

  getDefaultRssFeeds(): RSSFeedSource[] {
    return [
      {
        name: 'CNN Politics',
        url: 'http://rss.cnn.com/rss/cnn_allpolitics.rss',
        category: 'politics',
        enabled: true,
      },
      {
        name: 'Fox News Politics',
        url: 'https://feeds.foxnews.com/foxnews/politics',
        category: 'politics',
        enabled: true,
      },
      {
        name: 'Politico',
        url: 'https://www.politico.com/rss/politicopicks.xml',
        category: 'politics',
        enabled: true,
      },
      {
        name: 'The Hill',
        url: 'https://thehill.com/feed/',
        category: 'politics',
        enabled: true,
      },
      {
        name: 'Reuters Politics',
        url: 'https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best',
        category: 'politics',
        enabled: true,
      },
      {
        name: 'NPR Politics',
        url: 'https://feeds.npr.org/1014/rss.xml',
        category: 'politics',
        enabled: true,
      },
      {
        name: 'BBC News US',
        url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml',
        category: 'world',
        enabled: true,
      },
      {
        name: 'Washington Post Politics',
        url: 'https://feeds.washingtonpost.com/rss/politics',
        category: 'politics',
        enabled: true,
      },
    ];
  }
}