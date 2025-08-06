import { Router, Request, Response, NextFunction } from 'express'
import { InfographicModel, InfographicFilter } from '../models/Infographic.js'
import { ArticleModel } from '../models/Article.js'
import { AnalysisModel } from '../models/Analysis.js'

const router = Router()

// GET /api/infographics - List all infographics
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filter: InfographicFilter = {
      status: req.query.status ? [req.query.status as any] : undefined,
      template_type: req.query.templateType as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0
    }

    const infographics = await InfographicModel.find(filter)
    
    res.json({
      data: infographics,
      meta: {
        limit: filter.limit || 20,
        offset: filter.offset || 0
      }
    })
  } catch (error) {
    next(error)
  }
})

// GET /api/infographics/:id - Get single infographic
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const includeArticles = req.query.includeArticles === 'true'
    
    if (includeArticles) {
      const infographic = await InfographicModel.getWithFullData(req.params.id)
      if (!infographic) {
        return res.status(404).json({ error: { message: 'Infographic not found' } })
      }
      res.json({ data: infographic })
    } else {
      const infographic = await InfographicModel.findById(req.params.id)
      if (!infographic) {
        return res.status(404).json({ error: { message: 'Infographic not found' } })
      }
      res.json({ data: infographic })
    }
  } catch (error) {
    next(error)
  }
})

// POST /api/infographics - Create new infographic
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description, template_type, design_config, content_data, metadata, article_ids } = req.body
    
    // Validation
    if (!title) {
      return res.status(400).json({ error: { message: 'Title is required' } })
    }
    
    const infographic = await InfographicModel.create({
      title,
      description,
      template_type,
      design_config,
      content_data,
      metadata
    })
    
    // Link articles if provided
    if (article_ids && article_ids.length > 0) {
      await InfographicModel.linkArticles(infographic.id, article_ids)
    }
    
    res.status(201).json({ data: infographic })
  } catch (error) {
    next(error)
  }
})

// PUT /api/infographics/:id - Update infographic
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description, design_config, content_data, visualization_data } = req.body
    
    const infographic = await InfographicModel.update(req.params.id, {
      title,
      description,
      design_config,
      content_data,
      visualization_data
    })
    
    if (!infographic) {
      return res.status(404).json({ error: { message: 'Infographic not found' } })
    }
    
    res.json({ data: infographic })
  } catch (error) {
    next(error)
  }
})

// DELETE /api/infographics/:id - Delete infographic
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const infographic = await InfographicModel.findById(req.params.id)
    
    if (!infographic) {
      return res.status(404).json({ error: { message: 'Infographic not found' } })
    }
    
    await InfographicModel.delete(req.params.id)
    
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

// POST /api/infographics/:id/generate - Generate infographic
router.post('/:id/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const infographic = await InfographicModel.findById(req.params.id)
    
    if (!infographic) {
      return res.status(404).json({ error: { message: 'Infographic not found' } })
    }
    
    // Update status to processing
    await InfographicModel.updateStatus(req.params.id, 'processing')
    
    // Emit WebSocket event to trigger agent processing
    const io = (global as any).io
    if (io) {
      io.emit('infographic:generate', {
        infographicId: req.params.id,
        timestamp: new Date().toISOString()
      })
    }
    
    res.json({
      data: {
        id: infographic.id,
        status: 'processing',
        message: 'Infographic generation started'
      }
    })
  } catch (error) {
    next(error)
  }
})

// GET /api/infographics/stats - Get infographic statistics
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await InfographicModel.getStats()
    res.json(stats)
  } catch (error) {
    next(error)
  }
})

// POST /api/infographics/:id/link-articles - Link articles to infographic
router.post('/:id/link-articles', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { article_ids } = req.body
    
    if (!article_ids || !Array.isArray(article_ids)) {
      return res.status(400).json({ error: { message: 'article_ids array is required' } })
    }
    
    const infographic = await InfographicModel.findById(req.params.id)
    if (!infographic) {
      return res.status(404).json({ error: { message: 'Infographic not found' } })
    }
    
    await InfographicModel.linkArticles(req.params.id, article_ids)
    
    res.json({ message: 'Articles linked successfully' })
  } catch (error) {
    next(error)
  }
})

// PUT /api/infographics/:id/status - Update infographic status
router.put('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, error_message } = req.body
    
    if (!status) {
      return res.status(400).json({ error: { message: 'Status is required' } })
    }
    
    const infographic = await InfographicModel.updateStatus(
      req.params.id,
      status,
      error_message
    )
    
    if (!infographic) {
      return res.status(404).json({ error: { message: 'Infographic not found' } })
    }
    
    // Emit WebSocket event for status update
    const io = (global as any).io
    if (io) {
      io.emit('infographic:status', {
        infographicId: req.params.id,
        status,
        timestamp: new Date().toISOString()
      })
    }
    
    res.json({ data: infographic })
  } catch (error) {
    next(error)
  }
})

// PUT /api/infographics/:id/files - Update infographic file paths
router.put('/:id/files', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { file_paths } = req.body
    
    if (!file_paths) {
      return res.status(400).json({ error: { message: 'file_paths object is required' } })
    }
    
    const infographic = await InfographicModel.updateFilePaths(
      req.params.id,
      file_paths
    )
    
    if (!infographic) {
      return res.status(404).json({ error: { message: 'Infographic not found' } })
    }
    
    res.json({ data: infographic })
  } catch (error) {
    next(error)
  }
})

export default router