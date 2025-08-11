-- Seeds and Harvests tables for MaiFarm

-- Seeds table (templates for creating farms)
CREATE TABLE IF NOT EXISTS seeds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    type VARCHAR(50) DEFAULT 'custom',
    yaml TEXT NOT NULL,
    config JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    is_public BOOLEAN DEFAULT FALSE,
    usage_count INTEGER DEFAULT 0,
    rating NUMERIC(3,2) DEFAULT 0,
    last_used TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Harvests table (saved outputs from farms)
CREATE TABLE IF NOT EXISTS harvests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
    farm_name VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL,
    category VARCHAR(100),
    tags TEXT[] DEFAULT '{}',
    yield JSONB DEFAULT '[]',
    config JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    parent_harvest_id UUID REFERENCES harvests(id),
    version VARCHAR(20) DEFAULT '1.0.0',
    status VARCHAR(50) DEFAULT 'saved',
    created_by UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP,
    use_count INTEGER DEFAULT 0,
    CHECK (type IN ('app', 'tool', 'script', 'workflow', 'component', 'api', 'documentation', 'dataset', 'model', 'other')),
    CHECK (status IN ('saved', 'archived', 'processing', 'failed'))
);

-- GoWild sessions table
CREATE TABLE IF NOT EXISTS gowild_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'active',
    config JSONB NOT NULL,
    boundaries JSONB NOT NULL,
    discoveries JSONB DEFAULT '[]',
    checkpoints JSONB DEFAULT '[]',
    metrics JSONB DEFAULT '{}',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paused_at TIMESTAMP,
    completed_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (status IN ('active', 'paused', 'completed', 'failed', 'stopped'))
);

-- Quick tasks table (for simple one-off tasks)
CREATE TABLE IF NOT EXISTS quick_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL,
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(50) DEFAULT 'created',
    result JSONB,
    error JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    CHECK (status IN ('created', 'queued', 'processing', 'completed', 'failed', 'cancelled'))
);

-- Barn items table (organized harvest storage)
CREATE TABLE IF NOT EXISTS barn_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    harvest_id UUID REFERENCES harvests(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    favorite BOOLEAN DEFAULT FALSE,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Farm-seed relationship
ALTER TABLE farms ADD COLUMN IF NOT EXISTS seed_id UUID REFERENCES seeds(id);

-- Indexes for performance
CREATE INDEX idx_seeds_user_id ON seeds(user_id);
CREATE INDEX idx_seeds_is_public ON seeds(is_public);
CREATE INDEX idx_seeds_category ON seeds(category);
CREATE INDEX idx_seeds_created_at ON seeds(created_at DESC);

CREATE INDEX idx_harvests_farm_id ON harvests(farm_id);
CREATE INDEX idx_harvests_created_by ON harvests(created_by);
CREATE INDEX idx_harvests_type ON harvests(type);
CREATE INDEX idx_harvests_category ON harvests(category);
CREATE INDEX idx_harvests_status ON harvests(status);
CREATE INDEX idx_harvests_created_at ON harvests(created_at DESC);

CREATE INDEX idx_gowild_sessions_farm_id ON gowild_sessions(farm_id);
CREATE INDEX idx_gowild_sessions_status ON gowild_sessions(status);
CREATE INDEX idx_gowild_sessions_started_at ON gowild_sessions(started_at DESC);

CREATE INDEX idx_quick_tasks_user_id ON quick_tasks(user_id);
CREATE INDEX idx_quick_tasks_status ON quick_tasks(status);
CREATE INDEX idx_quick_tasks_created_at ON quick_tasks(created_at DESC);

CREATE INDEX idx_barn_items_user_id ON barn_items(user_id);
CREATE INDEX idx_barn_items_harvest_id ON barn_items(harvest_id);
CREATE INDEX idx_barn_items_category ON barn_items(category);

-- Update triggers
CREATE TRIGGER update_seeds_updated_at BEFORE UPDATE ON seeds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_harvests_updated_at BEFORE UPDATE ON harvests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gowild_sessions_updated_at BEFORE UPDATE ON gowild_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quick_tasks_updated_at BEFORE UPDATE ON quick_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_barn_items_updated_at BEFORE UPDATE ON barn_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();