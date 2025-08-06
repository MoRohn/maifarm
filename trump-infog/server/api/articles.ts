import { Router, Request, Response } from 'express'
import { ArticleModel, ArticleFilter } from '../models/Article.js'
import { getNewsAPIClient } from '../integrations/newsApiClient.js'
import { getRSSFeedParser, NEWS_FEEDS } from '../integrations/rssFeedParser.js'
import { handleValidationErrors, validatePagination } from '../middleware/validation.js'
import { generalLimiter, collectionLimiter } from '../middleware/rateLimiter.js'
import {
  validateArticleQuery,
  validateNewsAPICollection,
  validateRSSCollection,
  validateArticleId,
  validateSourceName,
  validateCleanup
} from '../schemas/articleSchema.js'

const router = Router()

// Apply general rate limiting to all routes
router.use(generalLimiter)

/**
 * GET /api/articles
 * Get articles with optional filters
 */
router.get('/', 
  validateArticleQuery,
  handleValidationErrors,
  validatePagination,
  async (req: Request, res: Response) => {
  try {
    const filter: ArticleFilter = {
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      sources: req.query.sources ? (req.query.sources as string).split(',') : undefined,
      categories: req.query.categories ? (req.query.categories as string).split(',') : undefined,
      searchTerm: req.query.search as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0
    }

    const [articles, total] = await Promise.all([
      ArticleModel.find(filter),
      ArticleModel.count(filter)
    ])

    res.json({
      articles,
      pagination: {
        total,
        limit: filter.limit || 50,
        offset: filter.offset || 0,
        hasMore: (filter.offset || 0) + articles.length < total
      }
    })
  } catch (error) {
    console.error('Error fetching articles:', error)
    res.status(500).json({ error: 'Failed to fetch articles' })
  }
})

/**
 * GET /api/articles/recent
 * Get recent articles
 */
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10
    const articles = await ArticleModel.getRecent(limit)
    res.json({ articles })
  } catch (error) {
    console.error('Error fetching recent articles:', error)
    res.status(500).json({ error: 'Failed to fetch recent articles' })
  }
})

/**
 * GET /api/articles/stats
 * Get article statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await ArticleModel.getStats()
    res.json(stats)
  } catch (error) {
    console.error('Error fetching article stats:', error)
    res.status(500).json({ error: 'Failed to fetch article statistics' })
  }
})

/**
 * GET /api/articles/:id
 * Get single article by ID
 */
router.get('/:id',
  validateArticleId,
  handleValidationErrors,
  async (req: Request, res: Response) => {
  try {
    const article = await ArticleModel.findById(req.params.id)
    if (!article) {
      return res.status(404).json({ error: 'Article not found' })
    }
    res.json(article)
  } catch (error) {
    console.error('Error fetching article:', error)
    res.status(500).json({ error: 'Failed to fetch article' })
  }
})

/**
 * POST /api/articles/collect/newsapi
 * Collect articles from NewsAPI
 */
router.post('/collect/newsapi',
  collectionLimiter,
  validateNewsAPICollection,
  handleValidationErrors,
  async (req: Request, res: Response) => {
  try {
    const { query = 'Trump', maxArticles = 50 } = req.body
    const newsClient = getNewsAPIClient()

    // Start collection in background
    const io = (global as any).io
    if (io) {
      io.emit('collection:started', { source: 'newsapi', query })
    }

    // Fetch articles
    const articles = await newsClient.batchFetchArticles(query, maxArticles)
    
    // Transform to our format
    const articlesToSave = articles.map(article => ({
      source_id: article.source.id,
      source_name: article.source.name,
      author: article.author,
      title: article.title,
      description: article.description,
      url: article.url,
      url_to_image: article.urlToImage,
      published_at: article.publishedAt,
      content: article.content,
      categories: ['newsapi']
    }))

    // Save to database
    const savedArticles = await ArticleModel.createBatch(articlesToSave)

    if (io) {
      io.emit('collection:completed', { 
        source: 'newsapi', 
        count: savedArticles.length 
      })
    }

    res.json({
      message: 'Articles collected successfully',
      collected: savedArticles.length,
      articles: savedArticles
    })
  } catch (error) {
    console.error('Error collecting from NewsAPI:', error)
    res.status(500).json({ error: 'Failed to collect articles from NewsAPI' })
  }
})

/**
 * POST /api/articles/collect/rss
 * Collect articles from RSS feeds
 */
router.post('/collect/rss',
  collectionLimiter,
  validateRSSCollection,
  handleValidationErrors,
  async (req: Request, res: Response) => {
  try {
    const { feeds = NEWS_FEEDS.map(f => f.url), keywords = ['Trump'] } = req.body
    const rssParser = getRSSFeedParser()

    // Start collection in background
    const io = (global as any).io
    if (io) {
      io.emit('collection:started', { source: 'rss', feeds: feeds.length })
    }

    // Fetch articles
    const feedSources = feeds.map((url: string) => {
      const matchingFeed = NEWS_FEEDS.find(f => f.url === url)
      return matchingFeed || { url, name: 'Unknown', category: 'general' }
    })

    const rssArticles = await rssParser.getTrumpArticles(feedSources, keywords)
    
    // Transform to our format
    const articlesToSave = rssArticles.map(item => ({
      source_name: item.categories?.[item.categories.length - 1] || 'RSS Feed',
      author: item.creator,
      title: item.title,
      description: item.contentSnippet || item.content?.substring(0, 200),
      url: item.link,
      published_at: item.pubDate || item.isoDate || new Date().toISOString(),
      content: item.content,
      categories: item.categories || ['rss']
    }))

    // Save to database
    const savedArticles = await ArticleModel.createBatch(articlesToSave)

    if (io) {
      io.emit('collection:completed', { 
        source: 'rss', 
        count: savedArticles.length 
      })
    }

    res.json({
      message: 'RSS articles collected successfully',
      collected: savedArticles.length,
      articles: savedArticles
    })
  } catch (error) {
    console.error('Error collecting from RSS:', error)
    res.status(500).json({ error: 'Failed to collect articles from RSS feeds' })
  }
})

/**
 * GET /api/articles/source/:sourceName
 * Get articles by source
 */
router.get('/source/:sourceName',
  validateSourceName,
  handleValidationErrors,
  async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50
    const articles = await ArticleModel.getBySource(req.params.sourceName, limit)
    res.json({ articles })
  } catch (error) {
    console.error('Error fetching articles by source:', error)
    res.status(500).json({ error: 'Failed to fetch articles by source' })
  }
})

/**
 * DELETE /api/articles/:id
 * Delete an article
 */
router.delete('/:id',
  validateArticleId,
  handleValidationErrors,
  async (req: Request, res: Response) => {
  try {
    await ArticleModel.delete(req.params.id)
    res.json({ message: 'Article deleted successfully' })
  } catch (error) {
    console.error('Error deleting article:', error)
    res.status(500).json({ error: 'Failed to delete article' })
  }
})

/**
 * POST /api/articles/cleanup
 * Clean up old articles
 */
router.post('/cleanup',
  validateCleanup,
  handleValidationErrors,
  async (req: Request, res: Response) => {
  try {
    const daysToKeep = req.body.daysToKeep || 30
    const deletedCount = await ArticleModel.deleteOld(daysToKeep)
    res.json({ 
      message: 'Cleanup completed successfully',
      deleted: deletedCount 
    })
  } catch (error) {
    console.error('Error cleaning up articles:', error)
    res.status(500).json({ error: 'Failed to clean up old articles' })
  }
})

export default router