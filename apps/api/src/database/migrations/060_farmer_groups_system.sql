-- Migration: 060_farmer_groups_system.sql
-- Description: Creates farmer groups system for organizing farmer templates
-- Author: Claude Code
-- Date: 2026-01-01

-- ============================================================================
-- FARMER GROUPS TABLE
-- Collections of farmers organized by purpose/category
-- ============================================================================
CREATE TABLE IF NOT EXISTS farmer_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon VARCHAR(50),              -- emoji or icon identifier
    color VARCHAR(100),            -- gradient or color scheme (e.g., "from-purple-500 to-pink-500")
    display_order INT DEFAULT 0,
    is_system BOOLEAN DEFAULT false,  -- true for built-in groups, false for user-created
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient ordering and filtering
CREATE INDEX IF NOT EXISTS idx_farmer_groups_display_order ON farmer_groups(display_order);
CREATE INDEX IF NOT EXISTS idx_farmer_groups_is_system ON farmer_groups(is_system);
CREATE INDEX IF NOT EXISTS idx_farmer_groups_slug ON farmer_groups(slug);

-- ============================================================================
-- FARMER GROUP MEMBERS TABLE
-- Maps farmers (by template ID) to groups
-- ============================================================================
CREATE TABLE IF NOT EXISTS farmer_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES farmer_groups(id) ON DELETE CASCADE,
    farmer_id VARCHAR(255) NOT NULL,  -- matches YAML template name (e.g., "vision-rooster")
    display_order INT DEFAULT 0,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, farmer_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_farmer_group_members_group_id ON farmer_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_farmer_group_members_farmer_id ON farmer_group_members(farmer_id);

-- ============================================================================
-- FARMER STATS TABLE
-- Tracks real usage statistics for each farmer template
-- ============================================================================
CREATE TABLE IF NOT EXISTS farmer_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id VARCHAR(255) NOT NULL UNIQUE,  -- matches YAML template name
    total_uses INT DEFAULT 0,
    successful_farms INT DEFAULT 0,
    failed_farms INT DEFAULT 0,
    cancelled_farms INT DEFAULT 0,
    total_agents_spawned INT DEFAULT 0,
    avg_completion_time_seconds INT,         -- average time from launch to harvest
    min_completion_time_seconds INT,
    max_completion_time_seconds INT,
    total_rating_sum DECIMAL(10,2) DEFAULT 0,  -- sum of all ratings for averaging
    rating_count INT DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    last_successful_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for stats lookups
CREATE INDEX IF NOT EXISTS idx_farmer_stats_farmer_id ON farmer_stats(farmer_id);
CREATE INDEX IF NOT EXISTS idx_farmer_stats_total_uses ON farmer_stats(total_uses DESC);
CREATE INDEX IF NOT EXISTS idx_farmer_stats_rating ON farmer_stats((total_rating_sum / NULLIF(rating_count, 0)) DESC NULLS LAST);

-- ============================================================================
-- FARMER RATINGS TABLE
-- Individual user ratings for farmer templates (linked to specific farms)
-- ============================================================================
CREATE TABLE IF NOT EXISTS farmer_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id VARCHAR(255) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review TEXT,
    is_public BOOLEAN DEFAULT true,         -- whether review is visible to others
    helpful_count INT DEFAULT 0,            -- upvotes for helpfulness
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, farm_id)                -- one rating per user per farm
);

-- Indexes for ratings
CREATE INDEX IF NOT EXISTS idx_farmer_ratings_farmer_id ON farmer_ratings(farmer_id);
CREATE INDEX IF NOT EXISTS idx_farmer_ratings_user_id ON farmer_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_farmer_ratings_farm_id ON farmer_ratings(farm_id);
CREATE INDEX IF NOT EXISTS idx_farmer_ratings_rating ON farmer_ratings(rating);

-- ============================================================================
-- USER FARMER PREFERENCES TABLE
-- Tracks user favorites and recently used farmers
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_farmer_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    farmer_id VARCHAR(255) NOT NULL,
    is_favorite BOOLEAN DEFAULT false,
    use_count INT DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, farmer_id)
);

-- Indexes for preferences
CREATE INDEX IF NOT EXISTS idx_user_farmer_prefs_user_id ON user_farmer_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_farmer_prefs_farmer_id ON user_farmer_preferences(farmer_id);
CREATE INDEX IF NOT EXISTS idx_user_farmer_prefs_favorites ON user_farmer_preferences(user_id, is_favorite) WHERE is_favorite = true;
CREATE INDEX IF NOT EXISTS idx_user_farmer_prefs_recent ON user_farmer_preferences(user_id, last_used_at DESC);

-- ============================================================================
-- TRIGGERS FOR updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_farmer_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_farmer_groups_updated_at ON farmer_groups;
CREATE TRIGGER trigger_farmer_groups_updated_at
    BEFORE UPDATE ON farmer_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_farmer_groups_updated_at();

DROP TRIGGER IF EXISTS trigger_farmer_stats_updated_at ON farmer_stats;
CREATE TRIGGER trigger_farmer_stats_updated_at
    BEFORE UPDATE ON farmer_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_farmer_groups_updated_at();

DROP TRIGGER IF EXISTS trigger_farmer_ratings_updated_at ON farmer_ratings;
CREATE TRIGGER trigger_farmer_ratings_updated_at
    BEFORE UPDATE ON farmer_ratings
    FOR EACH ROW
    EXECUTE FUNCTION update_farmer_groups_updated_at();

DROP TRIGGER IF EXISTS trigger_user_farmer_prefs_updated_at ON user_farmer_preferences;
CREATE TRIGGER trigger_user_farmer_prefs_updated_at
    BEFORE UPDATE ON user_farmer_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_farmer_groups_updated_at();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get average rating for a farmer
CREATE OR REPLACE FUNCTION get_farmer_avg_rating(p_farmer_id VARCHAR(255))
RETURNS DECIMAL(3,2) AS $$
DECLARE
    avg_rating DECIMAL(3,2);
BEGIN
    SELECT COALESCE(total_rating_sum / NULLIF(rating_count, 0), 0)
    INTO avg_rating
    FROM farmer_stats
    WHERE farmer_id = p_farmer_id;

    RETURN COALESCE(avg_rating, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to get success rate for a farmer
CREATE OR REPLACE FUNCTION get_farmer_success_rate(p_farmer_id VARCHAR(255))
RETURNS DECIMAL(5,2) AS $$
DECLARE
    success_rate DECIMAL(5,2);
BEGIN
    SELECT CASE
        WHEN total_uses > 0 THEN (successful_farms::DECIMAL / total_uses * 100)
        ELSE 0
    END
    INTO success_rate
    FROM farmer_stats
    WHERE farmer_id = p_farmer_id;

    RETURN COALESCE(success_rate, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to increment farmer usage (called when farm is created)
CREATE OR REPLACE FUNCTION increment_farmer_usage(
    p_farmer_id VARCHAR(255),
    p_agents_count INT DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO farmer_stats (farmer_id, total_uses, total_agents_spawned, last_used_at)
    VALUES (p_farmer_id, 1, p_agents_count, NOW())
    ON CONFLICT (farmer_id) DO UPDATE SET
        total_uses = farmer_stats.total_uses + 1,
        total_agents_spawned = farmer_stats.total_agents_spawned + p_agents_count,
        last_used_at = NOW(),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to record farm completion (called when farm completes/fails)
CREATE OR REPLACE FUNCTION record_farmer_completion(
    p_farmer_id VARCHAR(255),
    p_success BOOLEAN,
    p_completion_time_seconds INT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    IF p_success THEN
        UPDATE farmer_stats SET
            successful_farms = successful_farms + 1,
            last_successful_at = NOW(),
            avg_completion_time_seconds = CASE
                WHEN avg_completion_time_seconds IS NULL THEN p_completion_time_seconds
                WHEN p_completion_time_seconds IS NOT NULL THEN
                    ((avg_completion_time_seconds * successful_farms) + p_completion_time_seconds) / (successful_farms + 1)
                ELSE avg_completion_time_seconds
            END,
            min_completion_time_seconds = CASE
                WHEN min_completion_time_seconds IS NULL THEN p_completion_time_seconds
                WHEN p_completion_time_seconds < min_completion_time_seconds THEN p_completion_time_seconds
                ELSE min_completion_time_seconds
            END,
            max_completion_time_seconds = CASE
                WHEN max_completion_time_seconds IS NULL THEN p_completion_time_seconds
                WHEN p_completion_time_seconds > max_completion_time_seconds THEN p_completion_time_seconds
                ELSE max_completion_time_seconds
            END,
            updated_at = NOW()
        WHERE farmer_id = p_farmer_id;
    ELSE
        UPDATE farmer_stats SET
            failed_farms = failed_farms + 1,
            updated_at = NOW()
        WHERE farmer_id = p_farmer_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to add/update rating
CREATE OR REPLACE FUNCTION add_farmer_rating(
    p_farmer_id VARCHAR(255),
    p_user_id UUID,
    p_farm_id UUID,
    p_rating INT,
    p_review TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    rating_id UUID;
    old_rating INT;
BEGIN
    -- Check if rating exists
    SELECT id, rating INTO rating_id, old_rating
    FROM farmer_ratings
    WHERE user_id = p_user_id AND farm_id = p_farm_id;

    IF rating_id IS NOT NULL THEN
        -- Update existing rating
        UPDATE farmer_ratings SET
            rating = p_rating,
            review = COALESCE(p_review, review),
            updated_at = NOW()
        WHERE id = rating_id;

        -- Update stats (adjust for changed rating)
        UPDATE farmer_stats SET
            total_rating_sum = total_rating_sum - old_rating + p_rating,
            updated_at = NOW()
        WHERE farmer_id = p_farmer_id;
    ELSE
        -- Insert new rating
        INSERT INTO farmer_ratings (farmer_id, user_id, farm_id, rating, review)
        VALUES (p_farmer_id, p_user_id, p_farm_id, p_rating, p_review)
        RETURNING id INTO rating_id;

        -- Update stats
        UPDATE farmer_stats SET
            total_rating_sum = total_rating_sum + p_rating,
            rating_count = rating_count + 1,
            updated_at = NOW()
        WHERE farmer_id = p_farmer_id;

        -- Initialize stats if not exists
        IF NOT FOUND THEN
            INSERT INTO farmer_stats (farmer_id, total_rating_sum, rating_count)
            VALUES (p_farmer_id, p_rating, 1);
        END IF;
    END IF;

    RETURN rating_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE farmer_groups IS 'Collections of farmer templates organized by category/purpose';
COMMENT ON TABLE farmer_group_members IS 'Mapping of farmer templates to groups';
COMMENT ON TABLE farmer_stats IS 'Aggregated usage statistics for each farmer template';
COMMENT ON TABLE farmer_ratings IS 'Individual user ratings and reviews for farmer templates';
COMMENT ON TABLE user_farmer_preferences IS 'User-specific farmer preferences (favorites, recently used)';
