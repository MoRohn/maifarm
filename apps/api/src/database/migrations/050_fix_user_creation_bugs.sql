-- Migration 050: Fix user creation bugs and add auth infrastructure

-- 1. Allow NULL passwords for passwordless auth
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- 2. Add missing indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email_active ON users(email, is_active) WHERE is_active = true;

-- 3. Add email verification infrastructure
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMP;

-- 4. Add password reset infrastructure
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_requested_at TIMESTAMP;

-- 4b. Track authentication mode selection
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_mode VARCHAR(20) DEFAULT 'password';

UPDATE users
SET auth_mode = 'password'
WHERE auth_mode IS NULL;

-- 4c. Track setup completion timestamp
ALTER TABLE users ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMP WITH TIME ZONE;

-- Mark existing admins as having completed setup to avoid blocking upgrades
UPDATE users
SET setup_completed_at = COALESCE(setup_completed_at, NOW())
WHERE is_admin = true;

-- 5. Consolidate timestamp fields (remove duplicate last_login/last_login_at)
UPDATE users
SET last_login_at = last_login
WHERE last_login IS NOT NULL AND last_login_at IS NULL;

ALTER TABLE users DROP COLUMN IF EXISTS last_login;
