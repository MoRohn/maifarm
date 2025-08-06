import { Router, Request, Response } from 'express'
import { AnalysisModel, AnalysisFilter } from '../models/Analysis.js'
import { ArticleModel } from '../models/Article.js'
import { handleValidationErrors, validatePagination } from '../middleware/validation.js'
import { generalLimiter } from '../middleware/rateLimiter.js'
import {
  validateAnalysisQuery,
  validateCreateAnalysis,
  validateAnalysisId,
  validateArticleIdParam,
  validateSentimentTrends,
  validateTopThemes
} from '../schemas/analysisSchema.js'

const router = Router()

// Apply general rate limiting to all routes
router.use(generalLimiter)

/**
 * GET /api/analysis
 * Get analyses with optional filters
 */
router.get('/',
  validateAnalysisQuery,
  handleValidationErrors,
  validatePagination,
  async (req: Request, res: Response) => {
  try {
    const filter: AnalysisFilter = {
      article_ids: req.query.articleIds ? (req.query.articleIds as string).split(',') : undefined,
      min_sentiment_score: req.query.minSentiment ? parseFloat(req.query.minSentiment as string) : undefined,
      max_sentiment_score: req.query.maxSentiment ? parseFloat(req.query.maxSentiment as string) : undefined,
      themes: req.query.themes ? (req.query.themes as string).split(',') : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0
    }

    const analyses = await AnalysisModel.find(filter)

    res.json({
      analyses,
      pagination: {
        limit: filter.limit || 50,
        offset: filter.offset || 0
      }
    })
  } catch (error) {
    console.error('Error fetching analyses:', error)
    res.status(500).json({ error: 'Failed to fetch analyses' })
  }
})

/**
 * GET /api/analysis/with-articles
 * Get analyses with article data
 */
router.get('/with-articles', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50
    const analysesWithArticles = await AnalysisModel.getWithArticles(limit)
    res.json({ analyses: analysesWithArticles })
  } catch (error) {
    console.error('Error fetching analyses with articles:', error)
    res.status(500).json({ error: 'Failed to fetch analyses with articles' })
  }
})

/**
 * GET /api/analysis/sentiment-distribution
 * Get sentiment distribution statistics
 */
router.get('/sentiment-distribution', async (req: Request, res: Response) => {
  try {
    const distribution = await AnalysisModel.getSentimentDistribution()
    res.json({ distribution })
  } catch (error) {
    console.error('Error fetching sentiment distribution:', error)
    res.status(500).json({ error: 'Failed to fetch sentiment distribution' })
  }
})

/**
 * GET /api/analysis/sentiment-trends
 * Get sentiment trends over time
 */
router.get('/sentiment-trends',
  validateSentimentTrends,
  handleValidationErrors,
  async (req: Request, res: Response) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string) : 30
    const trends = await AnalysisModel.getSentimentTrends(days)
    res.json({ trends })
  } catch (error) {
    console.error('Error fetching sentiment trends:', error)
    res.status(500).json({ error: 'Failed to fetch sentiment trends' })
  }
})

/**
 * GET /api/analysis/top-themes
 * Get top themes
 */
router.get('/top-themes',
  validateTopThemes,
  handleValidationErrors,
  async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20
    const themes = await AnalysisModel.getTopThemes(limit)
    res.json({ themes })
  } catch (error) {
    console.error('Error fetching top themes:', error)
    res.status(500).json({ error: 'Failed to fetch top themes' })
  }
})

/**
 * GET /api/analysis/entity-stats
 * Get entity statistics
 */
router.get('/entity-stats', async (req: Request, res: Response) => {
  try {
    const stats = await AnalysisModel.getEntityStats()
    res.json(stats)
  } catch (error) {
    console.error('Error fetching entity stats:', error)
    res.status(500).json({ error: 'Failed to fetch entity statistics' })
  }
})

/**
 * GET /api/analysis/:id
 * Get single analysis by ID
 */
router.get('/:id',
  validateAnalysisId,
  handleValidationErrors,
  async (req: Request, res: Response) => {
  try {
    const analysis = await AnalysisModel.findById(req.params.id)
    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' })
    }
    res.json(analysis)
  } catch (error) {
    console.error('Error fetching analysis:', error)
    res.status(500).json({ error: 'Failed to fetch analysis' })
  }
})

/**
 * GET /api/analysis/article/:articleId
 * Get analysis for specific article
 */
router.get('/article/:articleId',
  validateArticleIdParam,
  handleValidationErrors,
  async (req: Request, res: Response) => {
  try {
    const analysis = await AnalysisModel.findByArticleId(req.params.articleId)
    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found for this article' })
    }
    res.json(analysis)
  } catch (error) {
    console.error('Error fetching analysis by article:', error)
    res.status(500).json({ error: 'Failed to fetch analysis' })
  }
})

/**
 * POST /api/analysis
 * Create or update analysis for an article
 * Note: This endpoint would typically be called by the Content Analyzer agent
 */
router.post('/',
  validateCreateAnalysis,
  handleValidationErrors,
  async (req: Request, res: Response) => {
  try {
    const {
      article_id,
      sentiment_score,
      sentiment_label,
      themes,
      entities,
      key_phrases,
      summary,
      word_count,
      reading_time_minutes
    } = req.body

    // Validate article exists
    const article = await ArticleModel.findById(article_id)
    if (!article) {
      return res.status(404).json({ error: 'Article not found' })
    }

    // Create analysis
    const analysis = await AnalysisModel.create({
      article_id,
      sentiment_score,
      sentiment_label,
      themes,
      entities,
      key_phrases,
      summary,
      word_count,
      reading_time_minutes
    })

    // Emit WebSocket event
    const io = (global as any).io
    if (io) {
      io.emit('analysis:completed', {
        articleId: article_id,
        analysisId: analysis.id,
        sentiment: sentiment_label
      })
    }

    res.status(201).json(analysis)
  } catch (error) {
    console.error('Error creating analysis:', error)
    res.status(500).json({ error: 'Failed to create analysis' })
  }
})

/**
 * DELETE /api/analysis/:id
 * Delete an analysis
 */
router.delete('/:id',
  validateAnalysisId,
  handleValidationErrors,
  async (req: Request, res: Response) => {
  try {
    await AnalysisModel.delete(req.params.id)
    res.json({ message: 'Analysis deleted successfully' })
  } catch (error) {
    console.error('Error deleting analysis:', error)
    res.status(500).json({ error: 'Failed to delete analysis' })
  }
})

export default router