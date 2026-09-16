-- Migration: 058_apple_only_auth_simplification
-- Simplify authentication to Apple Sign-In only
-- This migration makes password-related columns optional and adds soft-delete support

-- Add deleted_at column for soft-delete support (App Store requirement)
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create index for active users (excluding deleted)
CREATE INDEX IF NOT EXISTS idx_users_active
ON users(id) WHERE deleted_at IS NULL AND is_active = true;

-- Create index for Apple user lookups (primary auth method)
DROP INDEX IF EXISTS idx_users_apple_user_id;
CREATE UNIQUE INDEX idx_users_apple_user_id
ON users(apple_user_id) WHERE apple_user_id IS NOT NULL AND deleted_at IS NULL;

-- Add updated_at column to refresh_tokens if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'refresh_tokens' AND column_name = 'updated_at') THEN
        ALTER TABLE refresh_tokens ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- Ensure refresh_tokens has proper unique constraint for device management
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refresh_tokens_user_device_unique') THEN
        -- First, remove duplicates if any exist
        DELETE FROM refresh_tokens a USING refresh_tokens b
        WHERE a.ctid < b.ctid
          AND a.user_id = b.user_id
          AND a.device_id = b.device_id;

        -- Then create the unique constraint
        ALTER TABLE refresh_tokens
        ADD CONSTRAINT refresh_tokens_user_device_unique
        UNIQUE (user_id, device_id);
    END IF;
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'Constraint already exists or could not be created: %', SQLERRM;
END $$;

-- Create index for expired token cleanup
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires
ON refresh_tokens(expires_at) WHERE expires_at IS NOT NULL;

-- Update auth_mode constraint to include 'apple' as primary option
DO $$
BEGIN
    -- Drop old constraint if exists
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_auth_mode_check;

    -- Add updated constraint
    ALTER TABLE users ADD CONSTRAINT users_auth_mode_check
        CHECK (auth_mode IS NULL OR auth_mode IN ('apple', 'password', 'passwordless', 'oauth'));

    -- Set default auth_mode to 'apple' for new users
    ALTER TABLE users ALTER COLUMN auth_mode SET DEFAULT 'apple';
END $$;

-- Make password_hash nullable (no longer required for Apple Sign-In users)
-- This is safe as new users won't have passwords
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Make email nullable (Apple may hide it)
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- Add column to track if email is from Apple's private relay
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_is_private_relay BOOLEAN DEFAULT false;

-- Ensure display_name has a reasonable default
ALTER TABLE users ALTER COLUMN display_name SET DEFAULT 'MaiFarm User';

-- Create function to automatically clean up expired refresh tokens
CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens()
RETURNS void AS $$
BEGIN
    DELETE FROM refresh_tokens WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Comment on columns for documentation
COMMENT ON COLUMN users.apple_user_id IS 'Unique identifier from Apple Sign-In (sub claim). Primary authentication method.';
COMMENT ON COLUMN users.email IS 'User email. May be NULL if user chose Hide My Email. May be Apple private relay address.';
COMMENT ON COLUMN users.email_is_private_relay IS 'True if email is an Apple private relay address (@privaterelay.appleid.com)';
COMMENT ON COLUMN users.password_hash IS 'Legacy field. NULL for Apple Sign-In users. Kept for migration compatibility.';
COMMENT ON COLUMN users.deleted_at IS 'Soft-delete timestamp. Required for App Store compliance.';
COMMENT ON COLUMN users.auth_mode IS 'Authentication method: apple (primary), password (legacy), passwordless (legacy), oauth';

-- Add helpful index for email lookups (for account linking)
CREATE INDEX IF NOT EXISTS idx_users_email_active
ON users(email) WHERE email IS NOT NULL AND deleted_at IS NULL;

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 058: Apple-only auth simplification completed successfully';
END $$;
