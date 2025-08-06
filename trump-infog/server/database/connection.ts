import { Pool, PoolConfig } from 'pg'
import { config } from 'dotenv'

config()

const poolConfig: PoolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'trump_infog',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: parseInt(process.env.DB_POOL_MAX || '20'),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000'),
}

export const pool = new Pool(poolConfig)

// Test database connection
pool.on('connect', () => {
  console.log('Database pool: client connected')
})

pool.on('error', (err) => {
  console.error('Unexpected database error:', err)
  process.exit(-1)
})

/**
 * Initialize database tables
 */
export async function initializeDatabase() {
  try {
    // Create tables if they don't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS articles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_id VARCHAR(255),
        source_name VARCHAR(255) NOT NULL,
        author VARCHAR(255),
        title TEXT NOT NULL,
        description TEXT,
        url TEXT NOT NULL UNIQUE,
        url_to_image TEXT,
        published_at TIMESTAMP WITH TIME ZONE NOT NULL,
        content TEXT,
        categories TEXT[],
        collected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS analysis (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
        sentiment_score FLOAT,
        sentiment_label VARCHAR(50),
        themes TEXT[],
        entities JSONB,
        key_phrases TEXT[],
        summary TEXT,
        word_count INTEGER,
        reading_time_minutes INTEGER,
        analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS infographics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        template_type VARCHAR(100),
        design_config JSONB,
        content_data JSONB,
        visualization_data JSONB,
        file_paths JSONB,
        status VARCHAR(50) DEFAULT 'pending',
        processing_started_at TIMESTAMP WITH TIME ZONE,
        processing_completed_at TIMESTAMP WITH TIME ZONE,
        error_message TEXT,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS infographic_articles (
        infographic_id UUID REFERENCES infographics(id) ON DELETE CASCADE,
        article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
        PRIMARY KEY (infographic_id, article_id)
      )
    `)

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
      CREATE INDEX IF NOT EXISTS idx_articles_source_name ON articles(source_name);
      CREATE INDEX IF NOT EXISTS idx_articles_collected_at ON articles(collected_at DESC);
      CREATE INDEX IF NOT EXISTS idx_analysis_article_id ON analysis(article_id);
      CREATE INDEX IF NOT EXISTS idx_analysis_sentiment_score ON analysis(sentiment_score);
      CREATE INDEX IF NOT EXISTS idx_infographics_status ON infographics(status);
      CREATE INDEX IF NOT EXISTS idx_infographics_created_at ON infographics(created_at DESC);
    `)

    // Create update trigger for updated_at
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `)

    const tables = ['articles', 'analysis', 'infographics']
    for (const table of tables) {
      await pool.query(`
        DROP TRIGGER IF EXISTS update_${table}_updated_at ON ${table};
        CREATE TRIGGER update_${table}_updated_at
        BEFORE UPDATE ON ${table}
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
      `)
    }

    console.log('Database initialized successfully')
  } catch (error) {
    console.error('Database initialization error:', error)
    throw error
  }
}

/**
 * Close database pool
 */
export async function closeDatabase() {
  await pool.end()
  console.log('Database pool closed')
}

/**
 * Execute a query with automatic error handling
 */
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  try {
    const result = await pool.query(text, params)
    return result.rows
  } catch (error) {
    console.error('Database query error:', error)
    throw error
  }
}

/**
 * Execute a single row query
 */
export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] || null
}

/**
 * Execute a transaction
 */
export async function transaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}