-- Migration: 064_create_refresh_tokens_table
-- Creates the missing refresh_tokens table for auth token management
-- This table is referenced by migration 058 but was never created

BEGIN;

-- ============================================
-- REFRESH TOKENS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Token details
    token_hash VARCHAR(255) UNIQUE NOT NULL,

    -- Device information for multi-device support
    device_id VARCHAR(255),
    device_name VARCHAR(255),
    device_info JSONB DEFAULT '{}',

    -- Security
    is_revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,

    -- IP tracking for security
    created_ip INET,
    last_used_ip INET
);

-- ============================================
-- USER DEVICES TABLE (for biometric auth)
-- ============================================

CREATE TABLE IF NOT EXISTS user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Device identification
    device_id VARCHAR(255) NOT NULL,
    device_name VARCHAR(255),
    device_model VARCHAR(255),
    os_version VARCHAR(100),

    -- Security
    biometric_enabled BOOLEAN DEFAULT FALSE,
    biometric_public_key TEXT,
    trusted BOOLEAN DEFAULT TRUE,

    -- Activity tracking
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint per user per device
    CONSTRAINT user_device_unique UNIQUE (user_id, device_id)
);

-- ============================================
-- INDEXES
-- ============================================

-- Refresh tokens indexes
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_device ON refresh_tokens(device_id) WHERE device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- User devices indexes
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_device_id ON user_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_biometric ON user_devices(user_id) WHERE biometric_enabled = true;

-- ============================================
-- Now apply the constraints from migration 058
-- ============================================

-- Add unique constraint for device management (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refresh_tokens_user_device_unique') THEN
        ALTER TABLE refresh_tokens
        ADD CONSTRAINT refresh_tokens_user_device_unique
        UNIQUE (user_id, device_id);
    END IF;
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'Constraint already exists or could not be created: %', SQLERRM;
END $$;

COMMENT ON TABLE refresh_tokens IS 'Stores refresh tokens for JWT authentication. Supports multi-device login.';
COMMENT ON TABLE user_devices IS 'Tracks user devices for biometric authentication and device management.';

COMMIT;
