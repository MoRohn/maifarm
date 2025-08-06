import { NewsService } from '../newsService';
import axios from 'axios';
import { cacheService } from '../cacheService';
import { rateLimiter } from '../rateLimiter';
import { NewsArticle, NewsSearchOptions } from '../types';

jest.mock('axios');
jest.mock('../cacheService');
jest.mock('../rateLimiter');

describe('NewsService', () => {
  let newsService: NewsService;
  const mockApiKey = 'test-api-key';
  
  beforeEach(() => {
    jest.clearAllMocks();
    newsService = new NewsService(mockApiKey);
    
    // Mock rateLimiter to execute immediately
    (rateLimiter.schedule as jest.Mock) = jest.fn((fn) => fn());
  });

  describe('searchArticles', () => {
    const mockOptions: NewsSearchOptions = {
      query: 'Trump policy',
      from: new Date('2024-01-01'),
      to: new Date('2024-12-31'),
      sources: ['cnn', 'fox-news'],
      language: 'en',
      sortBy: 'relevancy',
      pageSize: 10,
      page: 1
    };

    const mockArticles: NewsArticle[] = [
      {
        id: '1',
        title: 'Trump Announces New Policy',
        description: 'Former President Trump unveiled a new policy framework',
        content: 'In a major announcement today, former President Donald Trump outlined his vision for a new policy initiative.',
        source: { id: 'cnn', name: 'CNN' },
        author: 'Jane Reporter',
        url: 'https://example.com/article1',
        urlToImage: 'https://example.com/image1.jpg',
        publishedAt: '2024-06-15T10:00:00Z'
      },
      {
        id: '2',
        title: 'Trump Leads in Polls',
        description: 'Latest polling shows Trump with significant lead',
        content: 'Recent polls indicate that former President Trump maintains a commanding lead in the Republican primary.',
        source: { id: 'fox-news', name: 'Fox News' },
        author: 'John Analyst',
        url: 'https://example.com/article2',
        urlToImage: 'https://example.com/image2.jpg',
        publishedAt: '2024-06-14T15:30:00Z'
      }
    ];

    it('should return cached articles if available', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(mockArticles);

      const result = await newsService.searchArticles(mockOptions);

      expect(cacheService.get).toHaveBeenCalledTimes(1);
      expect(axios.get).not.toHaveBeenCalled();
      expect(result).toEqual(mockArticles);
    });

    it('should fetch articles from API when cache is empty', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);
      (cacheService.set as jest.Mock).mockResolvedValue(undefined);
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          status: 'ok',
          articles: mockArticles.map(article => ({
            ...article,
            source: article.source
          }))
        }
      });

      const result = await newsService.searchArticles(mockOptions);

      expect(cacheService.get).toHaveBeenCalledTimes(1);
      expect(axios.get).toHaveBeenCalledWith(
        'https://newsapi.org/v2/everything',
        expect.objectContaining({
          params: expect.objectContaining({
            q: mockOptions.query,
            apiKey: mockApiKey
          })
        })
      );
      expect(cacheService.set).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it('should filter out invalid articles', async () => {
      const invalidArticles = [
        ...mockArticles,
        {
          id: '3',
          title: '[Removed]',
          description: 'This article was removed',
          content: 'Content removed',
          source: { id: null, name: 'Unknown' },
          author: null,
          url: 'https://example.com/removed',
          urlToImage: null,
          publishedAt: '2024-06-13T12:00:00Z'
        },
        {
          id: '4',
          title: '',
          description: 'No title',
          content: 'Article without title',
          source: { id: null, name: 'Source' },
          author: null,
          url: 'https://example.com/notitle',
          urlToImage: null,
          publishedAt: '2024-06-13T12:00:00Z'
        }
      ];

      (cacheService.get as jest.Mock).mockResolvedValue(null);
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          status: 'ok',
          articles: invalidArticles
        }
      });

      const result = await newsService.searchArticles(mockOptions);

      expect(result).toHaveLength(2);
      expect(result.every(article => article.title && article.title !== '[Removed]')).toBe(true);
    });

    it('should handle API errors gracefully', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);
      (axios.get as jest.Mock).mockRejectedValue(new Error('API Error'));

      const result = await newsService.searchArticles(mockOptions);

      expect(result).toEqual([]);
      expect(console.error).toHaveBeenCalledWith('Error searching articles:', expect.any(Error));
    });

    it('should return mock articles when API returns 426 (upgrade required)', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);
      const axiosError = new Error('Upgrade Required');
      (axiosError as any).response = { status: 426 };
      (axiosError as any).isAxiosError = true;
      (axios.isAxiosError as any) = jest.fn().mockReturnValue(true);
      (axios.get as jest.Mock).mockRejectedValue(axiosError);

      const result = await newsService.searchArticles(mockOptions);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('title');
      expect(result[0]).toHaveProperty('content');
    });
  });

  describe('validateArticle', () => {
    it('should validate a proper article', () => {
      const validArticle: NewsArticle = {
        id: '1',
        title: 'Valid Article Title',
        description: 'This is a valid article with sufficient content to pass validation',
        content: 'This is the main content of the article which is definitely long enough to meet the minimum requirements',
        source: { id: 'source-1', name: 'Valid Source' },
        author: 'Author Name',
        url: 'https://example.com/valid',
        urlToImage: 'https://example.com/image.jpg',
        publishedAt: '2024-06-15T10:00:00Z'
      };

      expect(newsService.validateArticle(validArticle)).toBe(true);
    });

    it('should reject article without title', () => {
      const invalidArticle: NewsArticle = {
        id: '1',
        title: '',
        description: 'Description without title',
        content: 'Content without title but long enough to meet other requirements',
        source: { id: null, name: 'Source' },
        author: null,
        url: 'https://example.com/notitle',
        urlToImage: null,
        publishedAt: '2024-06-15T10:00:00Z'
      };

      expect(newsService.validateArticle(invalidArticle)).toBe(false);
    });

    it('should reject article with [Removed] markers', () => {
      const removedArticle: NewsArticle = {
        id: '1',
        title: '[Removed]',
        description: 'This article was removed',
        content: 'Content that should not be displayed',
        source: { id: null, name: 'Source' },
        author: null,
        url: 'https://example.com/removed',
        urlToImage: null,
        publishedAt: '2024-06-15T10:00:00Z'
      };

      expect(newsService.validateArticle(removedArticle)).toBe(false);
    });

    it('should reject article with insufficient content', () => {
      const shortArticle: NewsArticle = {
        id: '1',
        title: 'Short Article',
        description: 'Too short',
        content: 'Brief',
        source: { id: null, name: 'Source' },
        author: null,
        url: 'https://example.com/short',
        urlToImage: null,
        publishedAt: '2024-06-15T10:00:00Z'
      };

      expect(newsService.validateArticle(shortArticle)).toBe(false);
    });

    it('should reject article with invalid date', () => {
      const invalidDateArticle: NewsArticle = {
        id: '1',
        title: 'Invalid Date Article',
        description: 'Article with invalid publication date that should be rejected',
        content: 'This article has an invalid date format that cannot be parsed properly',
        source: { id: null, name: 'Source' },
        author: null,
        url: 'https://example.com/invalid-date',
        urlToImage: null,
        publishedAt: 'invalid-date-format'
      };

      expect(newsService.validateArticle(invalidDateArticle)).toBe(false);
    });
  });

  describe('removeDuplicates', () => {
    it('should remove duplicate articles by URL', () => {
      const duplicateArticles: NewsArticle[] = [
        {
          id: '1',
          title: 'Article One',
          description: 'First article',
          content: 'Content of the first article',
          source: { id: null, name: 'Source' },
          author: null,
          url: 'https://example.com/article1',
          urlToImage: null,
          publishedAt: '2024-06-15T10:00:00Z'
        },
        {
          id: '2',
          title: 'Article One',
          description: 'First article duplicate',
          content: 'Content of the first article',
          source: { id: null, name: 'Source' },
          author: null,
          url: 'https://example.com/article1',
          urlToImage: null,
          publishedAt: '2024-06-15T10:00:00Z'
        },
        {
          id: '3',
          title: 'Article Two',
          description: 'Second article',
          content: 'Content of the second article',
          source: { id: null, name: 'Source' },
          author: null,
          url: 'https://example.com/article2',
          urlToImage: null,
          publishedAt: '2024-06-15T11:00:00Z'
        }
      ];

      const result = newsService.removeDuplicates(duplicateArticles);

      expect(result).toHaveLength(2);
      expect(result.map(a => a.url)).toEqual([
        'https://example.com/article1',
        'https://example.com/article2'
      ]);
    });

    it('should detect similar articles by title and content', () => {
      const similarArticles: NewsArticle[] = [
        {
          id: '1',
          title: 'Trump Policy Announcement',
          description: 'Policy news',
          content: 'President Trump announced a new policy initiative today focusing on economic growth and job creation',
          source: { id: 'cnn', name: 'CNN' },
          author: 'Reporter A',
          url: 'https://cnn.com/article1',
          urlToImage: null,
          publishedAt: '2024-06-15T10:00:00Z'
        },
        {
          id: '2',
          title: 'TRUMP POLICY ANNOUNCEMENT!!!',
          description: 'Breaking policy news',
          content: 'President Trump announced a new policy initiative today focusing on economic growth and job creation',
          source: { id: 'fox', name: 'Fox News' },
          author: 'Reporter B',
          url: 'https://fox.com/article2',
          urlToImage: null,
          publishedAt: '2024-06-15T10:05:00Z'
        },
        {
          id: '3',
          title: 'Different News Story',
          description: 'Other news',
          content: 'A completely different story about technology and innovation in Silicon Valley',
          source: { id: 'tech', name: 'TechNews' },
          author: 'Tech Writer',
          url: 'https://tech.com/article3',
          urlToImage: null,
          publishedAt: '2024-06-15T11:00:00Z'
        }
      ];

      const result = newsService.removeDuplicates(similarArticles);

      expect(result).toHaveLength(2);
      expect(result.some(a => a.title === 'Different News Story')).toBe(true);
    });
  });

  describe('getArticleById', () => {
    it('should return cached article if available', async () => {
      const mockArticle: NewsArticle = {
        id: '123',
        title: 'Cached Article',
        description: 'This article is from cache',
        content: 'Full content of the cached article',
        source: { id: 'cache', name: 'Cache Source' },
        author: 'Cache Author',
        url: 'https://example.com/cached',
        urlToImage: null,
        publishedAt: '2024-06-15T10:00:00Z'
      };

      (cacheService.get as jest.Mock).mockResolvedValue(mockArticle);

      const result = await newsService.getArticleById('123');

      expect(cacheService.get).toHaveBeenCalledWith('article:123');
      expect(result).toEqual(mockArticle);
    });

    it('should return null if article not in cache', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);

      const result = await newsService.getArticleById('nonexistent');

      expect(cacheService.get).toHaveBeenCalledWith('article:nonexistent');
      expect(result).toBeNull();
    });
  });
});