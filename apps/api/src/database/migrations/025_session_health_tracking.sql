-- Migration 025: Session Health Tracking
-- Adds columns and tables for tracking tmux session health and crashes

BEGIN;

-- ============================================
-- ADD HEALTH TRACKING COLUMNS TO FARMS
-- ============================================

-- Add health check tracking
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'farms' 
        AND column_name = 'last_health_check'
    ) THEN
        ALTER TABLE farms ADD COLUMN last_health_check TIMESTAMP;
    END IF;

    -- Add crash tracking
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'farms' 
        AND column_name = 'crash_count'
    ) THEN
        ALTER TABLE farms ADD COLUMN crash_count INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'farms' 
        AND column_name = 'last_crash_at'
    ) THEN
        ALTER TABLE farms ADD COLUMN last_crash_at TIMESTAMP;
    END IF;

    -- Add recovery tracking
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'farms' 
        AND column_name = 'recovery_attempts'
    ) THEN
        ALTER TABLE farms ADD COLUMN recovery_attempts INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'farms' 
        AND column_name = 'last_recovery_at'
    ) THEN
        ALTER TABLE farms ADD COLUMN last_recovery_at TIMESTAMP;
    END IF;

    -- Add session PID tracking for better monitoring
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'farms' 
        AND column_name = 'session_pid'
    ) THEN
        ALTER TABLE farms ADD COLUMN session_pid INTEGER;
    END IF;

    -- Add session start time
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'farms' 
        AND column_name = 'session_started_at'
    ) THEN
        ALTER TABLE farms ADD COLUMN session_started_at TIMESTAMP;
    END IF;
END $$;

-- ============================================
-- ADD NEW FARM STATUS VALUES
-- ============================================

-- Add new status values for better state tracking
DO $$
BEGIN
    -- Check if 'crashed' status exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'crashed' 
        AND enumtypid = (
            SELECT oid FROM pg_type WHERE typname = 'farm_status'
        )
    ) THEN
        ALTER TYPE farm_status ADD VALUE 'crashed' AFTER 'failed';
    END IF;

    -- Check if 'recovering' status exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'recovering' 
        AND enumtypid = (
            SELECT oid FROM pg_type WHERE typname = 'farm_status'
        )
    ) THEN
        ALTER TYPE farm_status ADD VALUE 'recovering' AFTER 'crashed';
    END IF;

    -- Check if 'terminated' status exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'terminated' 
        AND enumtypid = (
            SELECT oid FROM pg_type WHERE typname = 'farm_status'
        )
    ) THEN
        ALTER TYPE farm_status ADD VALUE 'terminated' AFTER 'completed';
    END IF;

    -- Check if 'stale' status exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'stale' 
        AND enumtypid = (
            SELECT oid FROM pg_type WHERE typname = 'farm_status'
        )
    ) THEN
        ALTER TYPE farm_status ADD VALUE 'stale' AFTER 'terminated';
    END IF;
END $$;

-- ============================================
-- SESSION HEALTH LOG TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS session_health_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
    session_name VARCHAR(255) NOT NULL,
    
    -- Health check details
    check_type VARCHAR(50) NOT NULL, -- 'routine', 'manual', 'startup', 'recovery'
    session_exists BOOLEAN NOT NULL,
    pane_count INTEGER DEFAULT 0,
    expected_pane_count INTEGER DEFAULT 0,
    
    -- Session details
    session_pid INTEGER,
    session_uptime INTEGER, -- seconds
    
    -- Result
    health_status VARCHAR(50) NOT NULL, -- 'healthy', 'degraded', 'dead', 'unknown'
    issues JSONB DEFAULT '[]',
    
    -- Timestamps
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT health_check_type CHECK (check_type IN (
        'routine', 'manual', 'startup', 'recovery', 'shutdown'
    )),
    CONSTRAINT health_status_check CHECK (health_status IN (
        'healthy', 'degraded', 'dead', 'unknown', 'recovering'
    ))
);

-- ============================================
-- SESSION CRASH LOG TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS session_crash_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
    session_name VARCHAR(255) NOT NULL,
    
    -- Crash details
    crash_type VARCHAR(50) DEFAULT 'unexpected', -- 'unexpected', 'timeout', 'memory', 'manual'
    crash_reason TEXT,
    last_known_status VARCHAR(50),
    
    -- Session state at crash
    runtime_seconds INTEGER,
    agents_affected INTEGER,
    tasks_lost INTEGER,
    
    -- Recovery info
    recovery_attempted BOOLEAN DEFAULT FALSE,
    recovery_successful BOOLEAN DEFAULT FALSE,
    recovery_method VARCHAR(50), -- 'restart', 'resume', 'manual', 'none'
    
    -- Metadata
    error_logs TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    crashed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    recovered_at TIMESTAMP,
    
    CONSTRAINT crash_type_check CHECK (crash_type IN (
        'unexpected', 'timeout', 'memory', 'manual', 'unknown'
    ))
);

-- ============================================
-- INDEXES
-- ============================================

-- Indexes for health tracking
CREATE INDEX IF NOT EXISTS idx_farms_health_check ON farms(last_health_check DESC);
CREATE INDEX IF NOT EXISTS idx_farms_crash_count ON farms(crash_count) WHERE crash_count > 0;
CREATE INDEX IF NOT EXISTS idx_farms_status_health ON farms(status, last_health_check);

-- Indexes for health log
CREATE INDEX IF NOT EXISTS idx_health_log_farm ON session_health_log(farm_id);
CREATE INDEX IF NOT EXISTS idx_health_log_status ON session_health_log(health_status);
CREATE INDEX IF NOT EXISTS idx_health_log_checked ON session_health_log(checked_at DESC);

-- Indexes for crash log
CREATE INDEX IF NOT EXISTS idx_crash_log_farm ON session_crash_log(farm_id);
CREATE INDEX IF NOT EXISTS idx_crash_log_crashed ON session_crash_log(crashed_at DESC);
CREATE INDEX IF NOT EXISTS idx_crash_log_recovery ON session_crash_log(recovery_attempted, recovery_successful);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get farm health status
CREATE OR REPLACE FUNCTION get_farm_health_status(p_farm_id UUID)
RETURNS TABLE (
    farm_id UUID,
    session_name VARCHAR,
    status VARCHAR,
    last_health_check TIMESTAMP,
    crash_count INTEGER,
    health_status VARCHAR,
    uptime_hours NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        f.id as farm_id,
        f.tmux_session as session_name,
        f.status::VARCHAR,
        f.last_health_check,
        COALESCE(f.crash_count, 0) as crash_count,
        COALESCE(
            (SELECT h.health_status 
             FROM session_health_log h 
             WHERE h.farm_id = f.id 
             ORDER BY h.checked_at DESC 
             LIMIT 1),
            'unknown'
        ) as health_status,
        CASE 
            WHEN f.session_started_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (NOW() - f.session_started_at)) / 3600
            ELSE 0
        END as uptime_hours
    FROM farms f
    WHERE f.id = p_farm_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger to log health checks
CREATE OR REPLACE FUNCTION log_health_check() 
RETURNS TRIGGER AS $$
BEGIN
    -- Only log if health check time actually changed
    IF OLD.last_health_check IS DISTINCT FROM NEW.last_health_check THEN
        INSERT INTO session_health_log (
            farm_id,
            session_name,
            check_type,
            session_exists,
            health_status,
            checked_at
        ) VALUES (
            NEW.id,
            NEW.tmux_session,
            'routine',
            NEW.status IN ('active', 'running'),
            CASE 
                WHEN NEW.status = 'crashed' THEN 'dead'
                WHEN NEW.status IN ('active', 'running') THEN 'healthy'
                ELSE 'unknown'
            END,
            NEW.last_health_check
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS farm_health_check_trigger ON farms;
CREATE TRIGGER farm_health_check_trigger
    AFTER UPDATE OF last_health_check ON farms
    FOR EACH ROW
    EXECUTE FUNCTION log_health_check();

-- ============================================
-- DATA MIGRATION
-- ============================================

-- Set initial health check time for active farms
UPDATE farms 
SET last_health_check = NOW() 
WHERE status IN ('active', 'running', 'launching')
  AND last_health_check IS NULL;

-- Initialize crash count to 0
UPDATE farms 
SET crash_count = 0 
WHERE crash_count IS NULL;

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
DECLARE
    missing_items TEXT := '';
BEGIN
    -- Check for required columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'last_health_check') THEN
        missing_items := missing_items || 'farms.last_health_check, ';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'crash_count') THEN
        missing_items := missing_items || 'farms.crash_count, ';
    END IF;
    
    -- Check for new tables
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'session_health_log') THEN
        missing_items := missing_items || 'session_health_log table, ';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'session_crash_log') THEN
        missing_items := missing_items || 'session_crash_log table, ';
    END IF;
    
    -- Report results
    IF missing_items != '' THEN
        RAISE WARNING 'Missing items after migration: %', rtrim(missing_items, ', ');
    ELSE
        RAISE NOTICE '✅ All session health tracking components created successfully';
    END IF;
END $$;

COMMIT;

-- Migration complete