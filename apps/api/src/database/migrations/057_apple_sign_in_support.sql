-- Migration: 057_apple_sign_in_support
-- Add support for Sign in with Apple

-- Add apple_user_id column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_user_id VARCHAR(255) UNIQUE;

-- Add index for faster Apple user lookups
CREATE INDEX IF NOT EXISTS idx_users_apple_user_id ON users(apple_user_id) WHERE apple_user_id IS NOT NULL;

-- Update auth_mode enum to include 'apple'
-- First check if the column exists and update constraint
DO $$
BEGIN
    -- Check if auth_mode column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'users' AND column_name = 'auth_mode') THEN
        -- Drop existing constraint if exists
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_auth_mode_check;

        -- Add new constraint with apple option
        ALTER TABLE users ADD CONSTRAINT users_auth_mode_check
            CHECK (auth_mode IN ('password', 'passwordless', 'apple', 'oauth'));
    END IF;
END $$;

COMMENT ON COLUMN users.apple_user_id IS 'Apple Sign In unique user identifier (sub claim from identity token)';
