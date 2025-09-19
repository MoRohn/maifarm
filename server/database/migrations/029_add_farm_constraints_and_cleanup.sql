-- Migration: Add farm constraints and zombie cleanup improvements
-- Description: Add database constraints to prevent orphaned farms and improve cleanup tracking

-- Add cleanup tracking columns to farms table if they don't exist
DO $$ 
BEGIN
    -- Add session_name column for easier tracking
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'session_name') THEN
        ALTER TABLE farms ADD COLUMN session_name VARCHAR(255);
        -- Populate existing farms with computed session names
        UPDATE farms SET session_name = 'farm-' || SUBSTRING(CAST(id AS TEXT), 1, 8) WHERE session_name IS NULL;
    END IF;
    
    -- Add last_health_check column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'last_health_check') THEN
        ALTER TABLE farms ADD COLUMN last_health_check TIMESTAMP;
    END IF;
    
    -- Add error_message column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'error_message') THEN
        ALTER TABLE farms ADD COLUMN error_message TEXT;
    END IF;
    
    -- Add cleanup_attempts column to track recovery attempts
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'cleanup_attempts') THEN
        ALTER TABLE farms ADD COLUMN cleanup_attempts INTEGER DEFAULT 0;
    END IF;
    
    -- Add is_zombie flag
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'is_zombie') THEN
        ALTER TABLE farms ADD COLUMN is_zombie BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Create index on session_name for faster lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_farms_session_name ON farms(session_name) WHERE session_name IS NOT NULL;

-- Create index for zombie farm cleanup queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_farms_zombie_cleanup ON farms(status, updated_at, created_at) 
WHERE status IN ('launching', 'active', 'running');

-- Create index for health check queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_farms_health_check ON farms(last_health_check, status) 
WHERE status IN ('launching', 'active', 'running');

-- Add constraint to prevent farms without proper IDs
ALTER TABLE farms ADD CONSTRAINT chk_farm_id_format 
CHECK (
    CAST(id AS TEXT) ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    OR CAST(id AS TEXT) LIKE 'quick_%'
    OR CAST(id AS TEXT) LIKE 'quicktask%'
    OR CAST(id AS TEXT) LIKE 'qt_%'
    OR CAST(id AS TEXT) LIKE 'goWild-%'
);

-- Create a function to automatically set session_name
CREATE OR REPLACE FUNCTION set_farm_session_name()
RETURNS TRIGGER AS $$
BEGIN
    -- Set session_name if not provided
    IF NEW.session_name IS NULL THEN
        IF CAST(NEW.id AS TEXT) LIKE 'quick_%' THEN
            NEW.session_name = CAST(NEW.id AS TEXT);
        ELSIF CAST(NEW.id AS TEXT) LIKE 'goWild-%' THEN
            NEW.session_name = 'goWild-' || SUBSTRING(CAST(NEW.id AS TEXT), 8, 8);
        ELSE
            NEW.session_name = 'farm-' || SUBSTRING(CAST(NEW.id AS TEXT), 1, 8);
        END IF;
    END IF;
    
    -- Update last_health_check on status changes
    IF NEW.status != OLD.status AND NEW.status IN ('active', 'running') THEN
        NEW.last_health_check = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic session_name setting
DROP TRIGGER IF EXISTS trigger_set_farm_session_name ON farms;
CREATE TRIGGER trigger_set_farm_session_name
    BEFORE INSERT OR UPDATE ON farms
    FOR EACH ROW
    EXECUTE FUNCTION set_farm_session_name();

-- Create function to clean up orphaned agents when farm is deleted
CREATE OR REPLACE FUNCTION cleanup_orphaned_agents()
RETURNS TRIGGER AS $$
BEGIN
    -- When a farm is marked as failed or deleted, clean up its agents
    IF OLD.status IN ('launching', 'active', 'running') AND NEW.status IN ('failed', 'completed') THEN
        UPDATE agents 
        SET status = 'failed', 
            updated_at = CURRENT_TIMESTAMP,
            error_message = 'Farm cleanup - parent farm marked as ' || NEW.status
        WHERE farm_id = NEW.id 
        AND status NOT IN ('completed', 'failed');
        
        -- Log the cleanup
        INSERT INTO farm_lifecycle_events (farm_id, event_type, event_data)
        VALUES (NEW.id, 'agent_cleanup', json_build_object(
            'reason', 'parent_farm_status_change',
            'old_status', OLD.status,
            'new_status', NEW.status,
            'timestamp', NOW()
        ));
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for orphaned agent cleanup
DROP TRIGGER IF EXISTS trigger_cleanup_orphaned_agents ON farms;
CREATE TRIGGER trigger_cleanup_orphaned_agents
    AFTER UPDATE ON farms
    FOR EACH ROW
    WHEN (OLD.status != NEW.status)
    EXECUTE FUNCTION cleanup_orphaned_agents();

-- Create function to prevent deletion of farms with active agents
CREATE OR REPLACE FUNCTION prevent_farm_deletion_with_active_agents()
RETURNS TRIGGER AS $$
DECLARE
    active_agent_count INTEGER;
BEGIN
    -- Check for active agents before allowing farm deletion
    SELECT COUNT(*) INTO active_agent_count
    FROM agents 
    WHERE farm_id = OLD.id 
    AND status IN ('active', 'running', 'launching');
    
    IF active_agent_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete farm % with % active agents. Mark agents as completed or failed first.', 
                        OLD.id, active_agent_count;
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to prevent farm deletion with active agents
DROP TRIGGER IF EXISTS trigger_prevent_farm_deletion_with_active_agents ON farms;
CREATE TRIGGER trigger_prevent_farm_deletion_with_active_agents
    BEFORE DELETE ON farms
    FOR EACH ROW
    EXECUTE FUNCTION prevent_farm_deletion_with_active_agents();

-- Create a view for zombie farm identification
CREATE OR REPLACE VIEW zombie_farms AS
SELECT 
    f.id as farm_id,
    f.session_name,
    f.status,
    f.created_at,
    f.updated_at,
    f.last_health_check,
    f.cleanup_attempts,
    f.error_message,
    EXTRACT(EPOCH FROM (NOW() - f.updated_at)) / 3600 as hours_since_update,
    EXTRACT(EPOCH FROM (NOW() - f.created_at)) / 3600 as hours_since_creation,
    CASE 
        WHEN f.last_health_check IS NULL THEN NULL
        ELSE EXTRACT(EPOCH FROM (NOW() - f.last_health_check)) / 3600
    END as hours_since_health_check,
    COUNT(a.id) as agent_count,
    COUNT(a.id) FILTER (WHERE a.status IN ('active', 'running')) as active_agent_count
FROM farms f
LEFT JOIN agents a ON f.id = a.farm_id
WHERE f.status IN ('launching', 'active', 'running')
    AND f.updated_at < NOW() - INTERVAL '30 minutes'
    AND f.created_at < NOW() - INTERVAL '30 minutes'
    -- Exclude quick tasks
    AND NOT (
        CAST(f.id AS TEXT) LIKE 'quick_%' 
        OR CAST(f.id AS TEXT) LIKE 'quicktask%' 
        OR CAST(f.id AS TEXT) LIKE 'qt_%'
        OR LENGTH(CAST(f.id AS TEXT)) < 20
    )
GROUP BY f.id, f.session_name, f.status, f.created_at, f.updated_at, f.last_health_check, f.cleanup_attempts, f.error_message
ORDER BY f.updated_at ASC;

-- Grant permissions on the view
GRANT SELECT ON zombie_farms TO maifarm;

-- Create a function to get zombie farm statistics
CREATE OR REPLACE FUNCTION get_zombie_farm_stats()
RETURNS TABLE (
    total_zombies BIGINT,
    zombies_1hr BIGINT,
    zombies_2hr BIGINT, 
    zombies_6hr BIGINT,
    zombies_12hr BIGINT,
    recent_cleanups BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_zombies,
        COUNT(*) FILTER (WHERE hours_since_update >= 1) as zombies_1hr,
        COUNT(*) FILTER (WHERE hours_since_update >= 2) as zombies_2hr,
        COUNT(*) FILTER (WHERE hours_since_update >= 6) as zombies_6hr,
        COUNT(*) FILTER (WHERE hours_since_update >= 12) as zombies_12hr,
        (SELECT COUNT(*) FROM farms 
         WHERE status = 'failed' 
         AND error_message LIKE '%zombie%' 
         AND updated_at >= NOW() - INTERVAL '1 hour') as recent_cleanups
    FROM zombie_farms;
END;
$$ LANGUAGE plpgsql;

-- Update existing farms to have session_name populated
UPDATE farms 
SET session_name = CASE 
    WHEN CAST(id AS TEXT) LIKE 'quick_%' THEN CAST(id AS TEXT)
    WHEN CAST(id AS TEXT) LIKE 'goWild-%' THEN 'goWild-' || SUBSTRING(CAST(id AS TEXT), 8, 8)
    ELSE 'farm-' || SUBSTRING(CAST(id AS TEXT), 1, 8)
END
WHERE session_name IS NULL;

-- Create index on agent farm_id for faster lookups (if not exists)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agents_farm_id_status ON agents(farm_id, status);

-- Add a comment to document the zombie farm cleanup strategy
COMMENT ON VIEW zombie_farms IS 'View to identify farms that may be zombies (no active tmux session)';
COMMENT ON FUNCTION get_zombie_farm_stats() IS 'Function to get statistics about zombie farms for monitoring';
COMMENT ON FUNCTION cleanup_orphaned_agents() IS 'Automatically cleanup agents when parent farm status changes';
COMMENT ON FUNCTION prevent_farm_deletion_with_active_agents() IS 'Prevent deletion of farms that still have active agents';