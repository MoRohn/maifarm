-- ============================================
-- Migration 003: Harvest & Workflow
-- ============================================
-- This migration creates tables for harvests, seeds, barn items, and workflow management
-- Consolidates: 003_harvests_seeds, 004_harvest_update, 009_farmer_templates, 010_enhance_seeds, 
--              014_barn_sync, 020_gowild, 021_consolidation

BEGIN;

-- ============================================
-- HARVESTS (Created first to avoid foreign key issues)
-- ============================================

CREATE TABLE IF NOT EXISTS harvests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
    created_by UUID DEFAULT '00000000-0000-0000-0000-000000000000',
    
    -- Harvest details
    type VARCHAR(50) DEFAULT 'manual',
    category VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending',
    
    -- Data
    data JSONB NOT NULL DEFAULT '{}',
    summary JSONB DEFAULT '{}',
    results JSONB DEFAULT '[]',
    insights JSONB DEFAULT '[]',
    quality JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    
    -- File tracking
    file_count INTEGER DEFAULT 0,
    total_size BIGINT DEFAULT 0,
    export_formats TEXT[] DEFAULT ARRAY['json', 'markdown', 'pdf'],
    
    -- Yield tracking
    yield_value INTEGER DEFAULT 0,
    
    -- Template tracking
    farmer_template_id VARCHAR(255),
    farmer_template_name VARCHAR(255),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    
    CONSTRAINT harvests_status_check CHECK (status IN (
        'pending', 'collecting', 'processing', 'completed', 'failed', 'archived'
    ))
);

-- ============================================
-- SEEDS (Created after harvests to allow foreign key)
-- ============================================

CREATE TABLE IF NOT EXISTS seeds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),

    -- Configuration
    config JSONB NOT NULL DEFAULT '{}',
    yaml_content TEXT,
    yaml_metadata JSONB DEFAULT '{}',
    additional_prompt TEXT,

    -- Source tracking
    source_type VARCHAR(50) DEFAULT 'manual',
    source_seed_id UUID REFERENCES seeds(id),
    harvest_id UUID REFERENCES harvests(id) ON DELETE SET NULL,
    barn_data JSONB DEFAULT '{}',

    -- Visibility and usage
    is_public BOOLEAN DEFAULT FALSE,
    usage_count INTEGER DEFAULT 0,
    rating DECIMAL(3, 2),
    tags TEXT[] DEFAULT '{}',

    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_source_type CHECK (source_type IN (
        'manual', 'harvest', 'template', 'imported', 'generated', 'barn'
    ))
);

-- Add foreign key to farms table


ALTER TABLE farms ADD CONSTRAINT farms_source_seed_id_fkey 
    FOREIGN KEY (source_seed_id) REFERENCES seeds(id) ON DELETE SET NULL;

-- ============================================
-- HARVEST YIELD
-- ============================================

CREATE TABLE IF NOT EXISTS harvest_yield (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    harvest_id UUID NOT NULL REFERENCES harvests(id) ON DELETE CASCADE,
    farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    
    -- Yield details
    item_type VARCHAR(100) NOT NULL,
    item_name VARCHAR(255),
    item_value JSONB NOT NULL DEFAULT '{}',
    quality_score DECIMAL(3, 2),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- HARVEST MANIFESTS
-- ============================================

CREATE TABLE IF NOT EXISTS harvest_manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    harvest_id UUID NOT NULL REFERENCES harvests(id) ON DELETE CASCADE,
    
    -- Manifest data
    files JSONB DEFAULT '[]',
    total_files INTEGER DEFAULT 0,
    total_size BIGINT DEFAULT 0,
    
    -- Processing status
    status VARCHAR(50) DEFAULT 'pending',
    processed_files INTEGER DEFAULT 0,
    failed_files INTEGER DEFAULT 0,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT manifest_status_check CHECK (status IN (
        'pending', 'processing', 'completed', 'failed'
    ))
);

-- ============================================
-- BARN ITEMS
-- ============================================

CREATE TABLE IF NOT EXISTS barn_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    harvest_id UUID REFERENCES harvests(id) ON DELETE SET NULL,
    
    -- Item details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    type VARCHAR(50) DEFAULT 'file',
    
    -- Data
    data JSONB NOT NULL DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    
    -- File tracking
    file_path TEXT,
    file_size BIGINT,
    file_count INTEGER DEFAULT 1,
    mime_type VARCHAR(100),
    
    -- Sync and archive
    sync_status VARCHAR(50) DEFAULT 'pending',
    last_synced_at TIMESTAMP,
    archived_at TIMESTAMP,
    
    -- Template tracking
    farmer_template_id VARCHAR(255),
    farmer_template_name VARCHAR(255),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT barn_sync_status_check CHECK (sync_status IN (
        'pending', 'syncing', 'synced', 'failed', 'archived'
    ))
);

-- ============================================
-- BARN SYNC LOG
-- ============================================

CREATE TABLE IF NOT EXISTS barn_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_id VARCHAR(255) UNIQUE NOT NULL,
    
    -- Sync details
    operation VARCHAR(50) NOT NULL,
    source VARCHAR(100),
    destination VARCHAR(100),
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending',
    items_total INTEGER DEFAULT 0,
    items_synced INTEGER DEFAULT 0,
    items_failed INTEGER DEFAULT 0,
    bytes_total BIGINT DEFAULT 0,
    bytes_synced BIGINT DEFAULT 0,
    
    -- Error tracking
    error_message TEXT,
    error_details JSONB DEFAULT '{}',
    
    -- Timestamps
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT sync_operation_check CHECK (operation IN (
        'upload', 'download', 'sync', 'archive', 'restore', 'delete'
    )),
    CONSTRAINT sync_status_check CHECK (status IN (
        'pending', 'running', 'completed', 'failed', 'cancelled'
    ))
);

-- ============================================
-- QUICK TASKS
-- ============================================

CREATE TABLE IF NOT EXISTS quick_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Task details
    title VARCHAR(255),
    description TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    
    -- Configuration
    config JSONB DEFAULT '{}',
    timeout_ms INTEGER DEFAULT 300000, -- 5 minutes
    
    -- Results
    result JSONB,
    output TEXT,
    error TEXT,
    
    -- Template tracking
    farmer_template_id VARCHAR(255),
    farmer_template_name VARCHAR(255),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    CONSTRAINT quick_task_status_check CHECK (status IN (
        'pending', 'running', 'completed', 'failed', 'timeout', 'cancelled'
    ))
);

-- ============================================
-- GOWILD SESSIONS
-- ============================================

CREATE TABLE IF NOT EXISTS gowild_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
    
    -- Session configuration
    config JSONB NOT NULL DEFAULT '{}',
    boundaries JSONB DEFAULT '{}',
    focus_areas TEXT[] DEFAULT '{}',
    
    -- Session state
    status VARCHAR(50) DEFAULT 'initializing',
    phase VARCHAR(50) DEFAULT 'exploration',
    exploration_depth INTEGER DEFAULT 0,
    creativity_level DECIMAL(3, 2) DEFAULT 0.5,
    
    -- Progress tracking
    discoveries_count INTEGER DEFAULT 0,
    checkpoints_count INTEGER DEFAULT 0,
    rollbacks_count INTEGER DEFAULT 0,
    
    -- Results
    summary JSONB DEFAULT '{}',
    insights JSONB DEFAULT '[]',
    
    -- Timestamps
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paused_at TIMESTAMP,
    resumed_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    CONSTRAINT gowild_status_check CHECK (status IN (
        'initializing', 'running', 'paused', 'completed', 'failed', 'rolled_back'
    )),
    CONSTRAINT gowild_phase_check CHECK (phase IN (
        'exploration', 'exploitation', 'refinement', 'validation', 'completion'
    ))
);

-- ============================================
-- GOWILD DISCOVERIES
-- ============================================

CREATE TABLE IF NOT EXISTS gowild_discoveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES gowild_sessions(id) ON DELETE CASCADE,
    
    -- Discovery details
    type VARCHAR(100) NOT NULL,
    title VARCHAR(255),
    description TEXT,
    
    -- Impact and value
    impact_score DECIMAL(3, 2),
    novelty_score DECIMAL(3, 2),
    confidence DECIMAL(3, 2),
    
    -- Data
    data JSONB NOT NULL DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    
    -- Validation
    validated BOOLEAN DEFAULT FALSE,
    validation_results JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- GOWILD CHECKPOINTS
-- ============================================

CREATE TABLE IF NOT EXISTS gowild_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES gowild_sessions(id) ON DELETE CASCADE,
    
    -- Checkpoint details
    checkpoint_number INTEGER NOT NULL,
    state JSONB NOT NULL,
    
    -- Metrics at checkpoint
    discoveries_count INTEGER DEFAULT 0,
    exploration_depth INTEGER DEFAULT 0,
    quality_score DECIMAL(3, 2),
    
    -- Rollback info
    is_active BOOLEAN DEFAULT TRUE,
    rolled_back_to BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- TASK CHECKPOINTS
-- ============================================

CREATE TABLE IF NOT EXISTS task_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    
    -- Checkpoint data
    checkpoint_number INTEGER NOT NULL,
    state JSONB NOT NULL,
    progress INTEGER DEFAULT 0,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(task_id, checkpoint_number)
);

-- ============================================
-- WORKSPACE POOL
-- ============================================

CREATE TABLE IF NOT EXISTS workspace_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Workspace details
    workspace_path TEXT UNIQUE NOT NULL,
    farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'available',
    locked_by UUID REFERENCES farms(id) ON DELETE SET NULL,
    locked_at TIMESTAMP,
    
    -- Cleanup tracking
    last_cleaned_at TIMESTAMP,
    size_bytes BIGINT DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT workspace_status_check CHECK (status IN (
        'available', 'locked', 'cleaning', 'corrupted'
    ))
);

-- ============================================
-- INDEXES
-- ============================================

-- Seeds indexes
CREATE INDEX idx_seeds_user_id ON seeds(user_id);
CREATE INDEX idx_seeds_harvest_id ON seeds(harvest_id);
CREATE INDEX idx_seeds_is_public ON seeds(is_public);
CREATE INDEX idx_seeds_category ON seeds(category);
CREATE INDEX idx_seeds_source_type ON seeds(source_type);
CREATE INDEX idx_seeds_usage ON seeds(usage_count DESC);
CREATE INDEX idx_seeds_created_at ON seeds(created_at DESC);

-- Harvests indexes
CREATE INDEX idx_harvests_farm_id ON harvests(farm_id);
CREATE INDEX idx_harvests_created_by ON harvests(created_by);
CREATE INDEX idx_harvests_status ON harvests(status);
CREATE INDEX idx_harvests_type ON harvests(type);
CREATE INDEX idx_harvests_category ON harvests(category);
CREATE INDEX idx_harvests_farmer_template_id ON harvests(farmer_template_id);
CREATE INDEX idx_harvests_created_at ON harvests(created_at DESC);
CREATE INDEX idx_harvests_quality ON harvests(CAST((quality->>'score') AS numeric)) 
    WHERE quality->>'score' IS NOT NULL;

-- Harvest yield indexes
CREATE INDEX idx_harvest_yield_harvest_id ON harvest_yield(harvest_id);
CREATE INDEX idx_harvest_yield_farm_id ON harvest_yield(farm_id);
CREATE INDEX idx_harvest_yield_agent_id ON harvest_yield(agent_id);
CREATE INDEX idx_harvest_yield_item_type ON harvest_yield(item_type);
CREATE INDEX idx_harvest_yield_created_at ON harvest_yield(created_at DESC);

-- Harvest manifests indexes
CREATE INDEX idx_harvest_manifest_harvest_id ON harvest_manifests(harvest_id);
CREATE INDEX idx_harvest_manifest_status ON harvest_manifests(status);

-- Barn items indexes
CREATE INDEX idx_barn_items_user_id ON barn_items(user_id);
CREATE INDEX idx_barn_items_harvest_id ON barn_items(harvest_id);
CREATE INDEX idx_barn_items_category ON barn_items(category);
CREATE INDEX idx_barn_items_archived_at ON barn_items(archived_at) 
    WHERE archived_at IS NOT NULL;
CREATE INDEX idx_barn_items_last_synced_at ON barn_items(last_synced_at);
CREATE INDEX idx_barn_items_file_size ON barn_items(file_size);
CREATE INDEX idx_barn_items_farmer_template_id ON barn_items(farmer_template_id);

-- Barn sync log indexes
CREATE INDEX idx_barn_sync_log_sync_id ON barn_sync_log(sync_id);
CREATE INDEX idx_barn_sync_log_status ON barn_sync_log(status);
CREATE INDEX idx_barn_sync_log_operation ON barn_sync_log(operation);
CREATE INDEX idx_barn_sync_log_created_at ON barn_sync_log(created_at DESC);

-- Quick tasks indexes
CREATE INDEX idx_quick_tasks_user_id ON quick_tasks(user_id);
CREATE INDEX idx_quick_tasks_status ON quick_tasks(status);
CREATE INDEX idx_quick_tasks_farmer_template_id ON quick_tasks(farmer_template_id);
CREATE INDEX idx_quick_tasks_created_at ON quick_tasks(created_at DESC);

-- GoWild indexes
CREATE INDEX idx_gowild_sessions_farm_id ON gowild_sessions(farm_id);
CREATE INDEX idx_gowild_sessions_status ON gowild_sessions(status);
CREATE INDEX idx_gowild_sessions_started_at ON gowild_sessions(started_at DESC);

CREATE INDEX idx_gowild_discoveries_session_id ON gowild_discoveries(session_id);
CREATE INDEX idx_gowild_discoveries_impact ON gowild_discoveries(impact_score DESC);

CREATE INDEX idx_gowild_checkpoints_session_id ON gowild_checkpoints(session_id);
CREATE INDEX idx_gowild_checkpoints_timestamp ON gowild_checkpoints(created_at DESC);

-- Task checkpoints index
CREATE INDEX idx_checkpoint_task ON task_checkpoints(task_id);
CREATE INDEX idx_checkpoint_created ON task_checkpoints(created_at DESC);

-- Workspace pool indexes
CREATE INDEX idx_workspace_pool_status ON workspace_pool(status);
CREATE INDEX idx_workspace_pool_farm ON workspace_pool(farm_id);

-- Template tracking indexes (across multiple tables)
CREATE INDEX idx_farms_farmer_template_id ON farms(farmer_template_id);


-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation



-- Foreign keys added after table creation
ALTER TABLE farms ADD CONSTRAINT farms_seed_id_fkey 
    FOREIGN KEY (seed_id) REFERENCES seeds(id) ON DELETE SET NULL;

COMMIT;