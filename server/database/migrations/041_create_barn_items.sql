-- Migration 041: Create barn_items and barn_catalog tables
-- This creates the barn tables independently to fix startup errors

BEGIN;

-- Create barn_items table if it doesn't exist
CREATE TABLE IF NOT EXISTS barn_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) CHECK (type IN ('harvest', 'seed', 'template', 'artifact', 'resource')) DEFAULT 'resource',
    description TEXT,
    harvest_id VARCHAR(255) REFERENCES harvests(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    content TEXT,
    user_id VARCHAR(255),
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    accessed_at TIMESTAMPTZ,
    access_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    size_bytes BIGINT DEFAULT 0,
    mime_type TEXT,
    tags TEXT[] DEFAULT '{}',
    is_shared BOOLEAN DEFAULT false,
    share_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMPTZ,
    checksum TEXT,
    compression_type TEXT,
    original_size_bytes BIGINT
);

-- Create indexes for barn_items
CREATE INDEX IF NOT EXISTS idx_barn_items_harvest_id ON barn_items(harvest_id);
CREATE INDEX IF NOT EXISTS idx_barn_items_type ON barn_items(type);
CREATE INDEX IF NOT EXISTS idx_barn_items_user_id ON barn_items(user_id);
CREATE INDEX IF NOT EXISTS idx_barn_items_is_shared ON barn_items(is_shared) WHERE is_shared = true;
CREATE INDEX IF NOT EXISTS idx_barn_items_is_public ON barn_items(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_barn_items_tags ON barn_items USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_barn_items_metadata ON barn_items USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_barn_items_created_at ON barn_items(created_at DESC);

-- Create barn_catalog table for searchable barn items
CREATE TABLE IF NOT EXISTS barn_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barn_item_id UUID REFERENCES barn_items(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    keywords TEXT[] DEFAULT '{}',
    description TEXT,
    rating DECIMAL(3, 2),
    downloads INTEGER DEFAULT 0,
    last_used TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for barn_catalog
CREATE INDEX IF NOT EXISTS idx_barn_catalog_barn_item_id ON barn_catalog(barn_item_id);
CREATE INDEX IF NOT EXISTS idx_barn_catalog_category ON barn_catalog(category);
CREATE INDEX IF NOT EXISTS idx_barn_catalog_keywords ON barn_catalog USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_barn_catalog_rating ON barn_catalog(rating DESC);
CREATE INDEX IF NOT EXISTS idx_barn_catalog_downloads ON barn_catalog(downloads DESC);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_barn_items_updated_at ON barn_items;
CREATE TRIGGER update_barn_items_updated_at
    BEFORE UPDATE ON barn_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comment to the table
COMMENT ON TABLE barn_items IS 'Stores harvest output files and directories for reuse across farms';

COMMIT;