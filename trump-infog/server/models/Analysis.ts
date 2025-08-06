import { query, queryOne } from '../database/connection.js'

export interface Analysis {
  id: string
  article_id: string
  sentiment_score: number
  sentiment_label: string
  themes: string[]
  entities: {
    people?: string[]
    organizations?: string[]
    locations?: string[]
    events?: string[]
    dates?: string[]
  }
  key_phrases: string[]
  summary: string
  word_count: number
  reading_time_minutes: number
  analyzed_at: Date
  created_at: Date
  updated_at: Date
}

export interface CreateAnalysisInput {
  article_id: string
  sentiment_score: number
  sentiment_label: string
  themes: string[]
  entities: Analysis['entities']
  key_phrases: string[]
  summary: string
  word_count: number
  reading_time_minutes: number
}

export interface AnalysisFilter {
  article_ids?: string[]
  min_sentiment_score?: number
  max_sentiment_score?: number
  themes?: string[]
  limit?: number
  offset?: number
}

export class AnalysisModel {
  /**
   * Create a new analysis
   */
  static async create(input: CreateAnalysisInput): Promise<Analysis> {
    const sql = `
      INSERT INTO analysis (
        article_id, sentiment_score, sentiment_label, themes,
        entities, key_phrases, summary, word_count, reading_time_minutes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (article_id) DO UPDATE SET
        sentiment_score = EXCLUDED.sentiment_score,
        sentiment_label = EXCLUDED.sentiment_label,
        themes = EXCLUDED.themes,
        entities = EXCLUDED.entities,
        key_phrases = EXCLUDED.key_phrases,
        summary = EXCLUDED.summary,
        word_count = EXCLUDED.word_count,
        reading_time_minutes = EXCLUDED.reading_time_minutes,
        analyzed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `

    const params = [
      input.article_id,
      input.sentiment_score,
      input.sentiment_label,
      input.themes,
      JSON.stringify(input.entities),
      input.key_phrases,
      input.summary,
      input.word_count,
      input.reading_time_minutes
    ]

    const analysis = await queryOne<Analysis>(sql, params)
    if (!analysis) throw new Error('Failed to create analysis')
    
    return analysis
  }

  /**
   * Find analysis by ID
   */
  static async findById(id: string): Promise<Analysis | null> {
    const sql = 'SELECT * FROM analysis WHERE id = $1'
    return queryOne<Analysis>(sql, [id])
  }

  /**
   * Find analysis by article ID
   */
  static async findByArticleId(articleId: string): Promise<Analysis | null> {
    const sql = 'SELECT * FROM analysis WHERE article_id = $1'
    return queryOne<Analysis>(sql, [articleId])
  }

  /**
   * Find analyses with filters
   */
  static async find(filter: AnalysisFilter = {}): Promise<Analysis[]> {
    let sql = 'SELECT * FROM analysis WHERE 1=1'
    const params: any[] = []
    let paramCount = 0

    if (filter.article_ids && filter.article_ids.length > 0) {
      paramCount++
      sql += ` AND article_id = ANY($${paramCount})`
      params.push(filter.article_ids)
    }

    if (filter.min_sentiment_score !== undefined) {
      paramCount++
      sql += ` AND sentiment_score >= $${paramCount}`
      params.push(filter.min_sentiment_score)
    }

    if (filter.max_sentiment_score !== undefined) {
      paramCount++
      sql += ` AND sentiment_score <= $${paramCount}`
      params.push(filter.max_sentiment_score)
    }

    if (filter.themes && filter.themes.length > 0) {
      paramCount++
      sql += ` AND themes && $${paramCount}`
      params.push(filter.themes)
    }

    sql += ' ORDER BY analyzed_at DESC'

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

    return query<Analysis>(sql, params)
  }

  /**
   * Get sentiment distribution
   */
  static async getSentimentDistribution(): Promise<any> {
    const sql = `
      SELECT 
        sentiment_label,
        COUNT(*) as count,
        AVG(sentiment_score) as avg_score
      FROM analysis
      GROUP BY sentiment_label
      ORDER BY count DESC
    `
    return query(sql)
  }

  /**
   * Get top themes
   */
  static async getTopThemes(limit: number = 20): Promise<any> {
    const sql = `
      SELECT 
        theme,
        COUNT(*) as count
      FROM analysis, unnest(themes) as theme
      GROUP BY theme
      ORDER BY count DESC
      LIMIT $1
    `
    return query(sql, [limit])
  }

  /**
   * Get entity statistics
   */
  static async getEntityStats(): Promise<any> {
    const sql = `
      SELECT 
        COUNT(*) as total_analyses,
        AVG(jsonb_array_length(entities->'people')) as avg_people_per_article,
        AVG(jsonb_array_length(entities->'organizations')) as avg_orgs_per_article,
        AVG(jsonb_array_length(entities->'locations')) as avg_locations_per_article
      FROM analysis
      WHERE entities IS NOT NULL
    `

    const stats = await queryOne(sql)

    // Get top entities
    const topPeople = await query(`
      SELECT 
        person,
        COUNT(*) as mentions
      FROM analysis,
        jsonb_array_elements_text(entities->'people') as person
      GROUP BY person
      ORDER BY mentions DESC
      LIMIT 10
    `)

    const topOrgs = await query(`
      SELECT 
        org,
        COUNT(*) as mentions
      FROM analysis,
        jsonb_array_elements_text(entities->'organizations') as org
      GROUP BY org
      ORDER BY mentions DESC
      LIMIT 10
    `)

    return {
      ...stats,
      top_people: topPeople,
      top_organizations: topOrgs
    }
  }

  /**
   * Get analyses with articles
   */
  static async getWithArticles(limit: number = 50): Promise<any[]> {
    const sql = `
      SELECT 
        a.*,
        art.title,
        art.source_name,
        art.published_at,
        art.url
      FROM analysis a
      JOIN articles art ON a.article_id = art.id
      ORDER BY a.analyzed_at DESC
      LIMIT $1
    `
    return query(sql, [limit])
  }

  /**
   * Get sentiment trends over time
   */
  static async getSentimentTrends(days: number = 30): Promise<any[]> {
    const sql = `
      SELECT 
        DATE(art.published_at) as date,
        AVG(a.sentiment_score) as avg_sentiment,
        COUNT(*) as article_count
      FROM analysis a
      JOIN articles art ON a.article_id = art.id
      WHERE art.published_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(art.published_at)
      ORDER BY date DESC
    `
    return query(sql)
  }

  /**
   * Delete analysis
   */
  static async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM analysis WHERE id = $1'
    await query(sql, [id])
    return true
  }

  /**
   * Delete analyses for article
   */
  static async deleteByArticleId(articleId: string): Promise<boolean> {
    const sql = 'DELETE FROM analysis WHERE article_id = $1'
    await query(sql, [articleId])
    return true
  }
}