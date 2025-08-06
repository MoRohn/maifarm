import { query, queryOne, transaction } from '../database/connection.js'

export interface Infographic {
  id: string
  title: string
  description: string | null
  template_type: string | null
  design_config: any
  content_data: any
  visualization_data: any
  file_paths: {
    png?: string
    pdf?: string
    svg?: string
  }
  status: 'pending' | 'processing' | 'completed' | 'failed'
  processing_started_at: Date | null
  processing_completed_at: Date | null
  error_message: string | null
  metadata: any
  created_at: Date
  updated_at: Date
}

export interface CreateInfographicInput {
  title: string
  description?: string
  template_type?: string
  design_config?: any
  content_data?: any
  visualization_data?: any
  metadata?: any
}

export interface InfographicFilter {
  status?: Infographic['status'][]
  template_type?: string
  start_date?: Date
  end_date?: Date
  limit?: number
  offset?: number
}

export class InfographicModel {
  /**
   * Create a new infographic
   */
  static async create(input: CreateInfographicInput): Promise<Infographic> {
    const sql = `
      INSERT INTO infographics (
        title, description, template_type, design_config,
        content_data, visualization_data, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `

    const params = [
      input.title,
      input.description || null,
      input.template_type || null,
      JSON.stringify(input.design_config || {}),
      JSON.stringify(input.content_data || {}),
      JSON.stringify(input.visualization_data || {}),
      JSON.stringify(input.metadata || {})
    ]

    const infographic = await queryOne<Infographic>(sql, params)
    if (!infographic) throw new Error('Failed to create infographic')
    
    return infographic
  }

  /**
   * Find infographic by ID
   */
  static async findById(id: string): Promise<Infographic | null> {
    const sql = 'SELECT * FROM infographics WHERE id = $1'
    return queryOne<Infographic>(sql, [id])
  }

  /**
   * Find infographics with filters
   */
  static async find(filter: InfographicFilter = {}): Promise<Infographic[]> {
    let sql = 'SELECT * FROM infographics WHERE 1=1'
    const params: any[] = []
    let paramCount = 0

    if (filter.status && filter.status.length > 0) {
      paramCount++
      sql += ` AND status = ANY($${paramCount})`
      params.push(filter.status)
    }

    if (filter.template_type) {
      paramCount++
      sql += ` AND template_type = $${paramCount}`
      params.push(filter.template_type)
    }

    if (filter.start_date) {
      paramCount++
      sql += ` AND created_at >= $${paramCount}`
      params.push(filter.start_date)
    }

    if (filter.end_date) {
      paramCount++
      sql += ` AND created_at <= $${paramCount}`
      params.push(filter.end_date)
    }

    sql += ' ORDER BY created_at DESC'

    if (filter.limit) {
      paramCount++
      sql += ` LIMIT $${paramCount}`
      params.push(filter.limit)
    }

    if (filter.offset) {
      paramCount++
      sql += ` OFFSET $${paramCount}`
      params.push(filter.offset)
    }

    return query<Infographic>(sql, params)
  }

  /**
   * Update infographic status
   */
  static async updateStatus(
    id: string,
    status: Infographic['status'],
    errorMessage?: string
  ): Promise<Infographic | null> {
    let sql: string
    let params: any[]

    if (status === 'processing') {
      sql = `
        UPDATE infographics 
        SET status = $1, processing_started_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `
      params = [status, id]
    } else if (status === 'completed') {
      sql = `
        UPDATE infographics 
        SET status = $1, processing_completed_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `
      params = [status, id]
    } else if (status === 'failed') {
      sql = `
        UPDATE infographics 
        SET status = $1, error_message = $2, processing_completed_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `
      params = [status, errorMessage || 'Unknown error', id]
    } else {
      sql = `
        UPDATE infographics 
        SET status = $1
        WHERE id = $2
        RETURNING *
      `
      params = [status, id]
    }

    return queryOne<Infographic>(sql, params)
  }

  /**
   * Update infographic file paths
   */
  static async updateFilePaths(
    id: string,
    filePaths: Infographic['file_paths']
  ): Promise<Infographic | null> {
    const sql = `
      UPDATE infographics 
      SET file_paths = $1
      WHERE id = $2
      RETURNING *
    `
    return queryOne<Infographic>(sql, [JSON.stringify(filePaths), id])
  }

  /**
   * Update infographic data
   */
  static async update(
    id: string,
    updates: Partial<CreateInfographicInput>
  ): Promise<Infographic | null> {
    const fields = []
    const params = []
    let paramCount = 0

    if (updates.title !== undefined) {
      paramCount++
      fields.push(`title = $${paramCount}`)
      params.push(updates.title)
    }

    if (updates.description !== undefined) {
      paramCount++
      fields.push(`description = $${paramCount}`)
      params.push(updates.description)
    }

    if (updates.design_config !== undefined) {
      paramCount++
      fields.push(`design_config = $${paramCount}`)
      params.push(JSON.stringify(updates.design_config))
    }

    if (updates.content_data !== undefined) {
      paramCount++
      fields.push(`content_data = $${paramCount}`)
      params.push(JSON.stringify(updates.content_data))
    }

    if (updates.visualization_data !== undefined) {
      paramCount++
      fields.push(`visualization_data = $${paramCount}`)
      params.push(JSON.stringify(updates.visualization_data))
    }

    if (fields.length === 0) {
      return this.findById(id)
    }

    paramCount++
    params.push(id)

    const sql = `
      UPDATE infographics 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `

    return queryOne<Infographic>(sql, params)
  }

  /**
   * Link articles to infographic
   */
  static async linkArticles(
    infographicId: string,
    articleIds: string[]
  ): Promise<void> {
    if (articleIds.length === 0) return

    await transaction(async (client) => {
      // Remove existing links
      await client.query(
        'DELETE FROM infographic_articles WHERE infographic_id = $1',
        [infographicId]
      )

      // Add new links
      for (const articleId of articleIds) {
        await client.query(
          'INSERT INTO infographic_articles (infographic_id, article_id) VALUES ($1, $2)',
          [infographicId, articleId]
        )
      }
    })
  }

  /**
   * Get articles linked to infographic
   */
  static async getLinkedArticles(infographicId: string): Promise<any[]> {
    const sql = `
      SELECT a.*
      FROM articles a
      JOIN infographic_articles ia ON a.id = ia.article_id
      WHERE ia.infographic_id = $1
      ORDER BY a.published_at DESC
    `
    return query(sql, [infographicId])
  }

  /**
   * Get infographic with full data
   */
  static async getWithFullData(id: string): Promise<any> {
    const infographic = await this.findById(id)
    if (!infographic) return null

    const articles = await this.getLinkedArticles(id)
    
    return {
      ...infographic,
      articles
    }
  }

  /**
   * Get statistics
   */
  static async getStats(): Promise<any> {
    const sql = `
      SELECT 
        status,
        COUNT(*) as count
      FROM infographics
      GROUP BY status
    `
    const statusCounts = await query(sql)

    const templateStats = await query(`
      SELECT 
        template_type,
        COUNT(*) as count
      FROM infographics
      WHERE template_type IS NOT NULL
      GROUP BY template_type
      ORDER BY count DESC
    `)

    const processingTimeStats = await queryOne(`
      SELECT 
        AVG(EXTRACT(EPOCH FROM (processing_completed_at - processing_started_at))) as avg_processing_seconds,
        MIN(EXTRACT(EPOCH FROM (processing_completed_at - processing_started_at))) as min_processing_seconds,
        MAX(EXTRACT(EPOCH FROM (processing_completed_at - processing_started_at))) as max_processing_seconds
      FROM infographics
      WHERE status = 'completed' 
        AND processing_started_at IS NOT NULL 
        AND processing_completed_at IS NOT NULL
    `)

    return {
      status_distribution: statusCounts,
      template_distribution: templateStats,
      processing_time: processingTimeStats
    }
  }

  /**
   * Delete infographic
   */
  static async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM infographics WHERE id = $1'
    await query(sql, [id])
    return true
  }

  /**
   * Clean up old failed infographics
   */
  static async cleanupFailed(daysOld: number = 7): Promise<number> {
    const sql = `
      DELETE FROM infographics 
      WHERE status = 'failed' 
        AND created_at < NOW() - INTERVAL '${daysOld} days'
      RETURNING id
    `
    const deleted = await query(sql)
    return deleted.length
  }
}