import { query, queryOne, transaction } from '../database/connection.js'
import { v4 as uuidv4 } from 'uuid'

export interface Article {
  id: string
  source_id: string | null
  source_name: string
  author: string | null
  title: string
  description: string | null
  url: string
  url_to_image: string | null
  published_at: Date
  content: string | null
  categories: string[]
  collected_at: Date
  created_at: Date
  updated_at: Date
}

export interface CreateArticleInput {
  source_id?: string | null
  source_name: string
  author?: string | null
  title: string
  description?: string | null
  url: string
  url_to_image?: string | null
  published_at: Date | string
  content?: string | null
  categories?: string[]
}

export interface ArticleFilter {
  startDate?: Date
  endDate?: Date
  sources?: string[]
  categories?: string[]
  searchTerm?: string
  limit?: number
  offset?: number
}

export class ArticleModel {
  /**
   * Create a new article
   */
  static async create(input: CreateArticleInput): Promise<Article> {
    const sql = `
      INSERT INTO articles (
        source_id, source_name, author, title, description,
        url, url_to_image, published_at, content, categories
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (url) DO UPDATE SET
        updated_at = CURRENT_TIMESTAMP,
        content = COALESCE(EXCLUDED.content, articles.content),
        categories = EXCLUDED.categories
      RETURNING *
    `

    const params = [
      input.source_id || null,
      input.source_name,
      input.author || null,
      input.title,
      input.description || null,
      input.url,
      input.url_to_image || null,
      input.published_at,
      input.content || null,
      input.categories || []
    ]

    const article = await queryOne<Article>(sql, params)
    if (!article) throw new Error('Failed to create article')
    
    return article
  }

  /**
   * Create multiple articles in batch
   */
  static async createBatch(inputs: CreateArticleInput[]): Promise<Article[]> {
    if (inputs.length === 0) return []

    return transaction(async (client) => {
      const articles: Article[] = []

      for (const input of inputs) {
        const sql = `
          INSERT INTO articles (
            source_id, source_name, author, title, description,
            url, url_to_image, published_at, content, categories
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (url) DO UPDATE SET
            updated_at = CURRENT_TIMESTAMP,
            content = COALESCE(EXCLUDED.content, articles.content),
            categories = EXCLUDED.categories
          RETURNING *
        `

        const params = [
          input.source_id || null,
          input.source_name,
          input.author || null,
          input.title,
          input.description || null,
          input.url,
          input.url_to_image || null,
          input.published_at,
          input.content || null,
          input.categories || []
        ]

        const result = await client.query(sql, params)
        if (result.rows[0]) {
          articles.push(result.rows[0])
        }
      }

      return articles
    })
  }

  /**
   * Find article by ID
   */
  static async findById(id: string): Promise<Article | null> {
    const sql = 'SELECT * FROM articles WHERE id = $1'
    return queryOne<Article>(sql, [id])
  }

  /**
   * Find article by URL
   */
  static async findByUrl(url: string): Promise<Article | null> {
    const sql = 'SELECT * FROM articles WHERE url = $1'
    return queryOne<Article>(sql, [url])
  }

  /**
   * Find articles with filters
   */
  static async find(filter: ArticleFilter = {}): Promise<Article[]> {
    let sql = 'SELECT * FROM articles WHERE 1=1'
    const params: any[] = []
    let paramCount = 0

    if (filter.startDate) {
      paramCount++
      sql += ` AND published_at >= $${paramCount}`
      params.push(filter.startDate)
    }

    if (filter.endDate) {
      paramCount++
      sql += ` AND published_at <= $${paramCount}`
      params.push(filter.endDate)
    }

    if (filter.sources && filter.sources.length > 0) {
      paramCount++
      sql += ` AND source_name = ANY($${paramCount})`
      params.push(filter.sources)
    }

    if (filter.categories && filter.categories.length > 0) {
      paramCount++
      sql += ` AND categories && $${paramCount}`
      params.push(filter.categories)
    }

    if (filter.searchTerm) {
      paramCount++
      sql += ` AND (
        title ILIKE $${paramCount} OR 
        description ILIKE $${paramCount} OR 
        content ILIKE $${paramCount}
      )`
      params.push(`%${filter.searchTerm}%`)
    }

    sql += ' ORDER BY published_at DESC'

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

    return query<Article>(sql, params)
  }

  /**
   * Count articles with filters
   */
  static async count(filter: ArticleFilter = {}): Promise<number> {
    let sql = 'SELECT COUNT(*) as count FROM articles WHERE 1=1'
    const params: any[] = []
    let paramCount = 0

    if (filter.startDate) {
      paramCount++
      sql += ` AND published_at >= $${paramCount}`
      params.push(filter.startDate)
    }

    if (filter.endDate) {
      paramCount++
      sql += ` AND published_at <= $${paramCount}`
      params.push(filter.endDate)
    }

    if (filter.sources && filter.sources.length > 0) {
      paramCount++
      sql += ` AND source_name = ANY($${paramCount})`
      params.push(filter.sources)
    }

    if (filter.categories && filter.categories.length > 0) {
      paramCount++
      sql += ` AND categories && $${paramCount}`
      params.push(filter.categories)
    }

    if (filter.searchTerm) {
      paramCount++
      sql += ` AND (
        title ILIKE $${paramCount} OR 
        description ILIKE $${paramCount} OR 
        content ILIKE $${paramCount}
      )`
      params.push(`%${filter.searchTerm}%`)
    }

    const result = await queryOne<{ count: string }>(sql, params)
    return parseInt(result?.count || '0')
  }

  /**
   * Get recent articles
   */
  static async getRecent(limit: number = 10): Promise<Article[]> {
    const sql = `
      SELECT * FROM articles 
      ORDER BY published_at DESC 
      LIMIT $1
    `
    return query<Article>(sql, [limit])
  }

  /**
   * Get articles by source
   */
  static async getBySource(sourceName: string, limit: number = 50): Promise<Article[]> {
    const sql = `
      SELECT * FROM articles 
      WHERE source_name = $1
      ORDER BY published_at DESC 
      LIMIT $2
    `
    return query<Article>(sql, [sourceName, limit])
  }

  /**
   * Get article statistics
   */
  static async getStats(): Promise<any> {
    const sql = `
      SELECT 
        COUNT(*) as total_articles,
        COUNT(DISTINCT source_name) as unique_sources,
        MIN(published_at) as oldest_article,
        MAX(published_at) as newest_article,
        AVG(LENGTH(content)) as avg_content_length
      FROM articles
    `

    const stats = await queryOne(sql)

    const sourceStats = await query(`
      SELECT 
        source_name,
        COUNT(*) as article_count
      FROM articles
      GROUP BY source_name
      ORDER BY article_count DESC
      LIMIT 10
    `)

    return {
      ...stats,
      top_sources: sourceStats
    }
  }

  /**
   * Update article
   */
  static async update(id: string, updates: Partial<CreateArticleInput>): Promise<Article | null> {
    const fields = []
    const params = []
    let paramCount = 0

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        paramCount++
        fields.push(`${key} = $${paramCount}`)
        params.push(value)
      }
    })

    if (fields.length === 0) {
      return this.findById(id)
    }

    paramCount++
    params.push(id)

    const sql = `
      UPDATE articles 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `

    return queryOne<Article>(sql, params)
  }

  /**
   * Delete article
   */
  static async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM articles WHERE id = $1'
    const result = await query(sql, [id])
    return true
  }

  /**
   * Delete old articles
   */
  static async deleteOld(daysToKeep: number = 30): Promise<number> {
    const sql = `
      DELETE FROM articles 
      WHERE collected_at < NOW() - INTERVAL '${daysToKeep} days'
      RETURNING id
    `
    const deleted = await query(sql)
    return deleted.length
  }
}