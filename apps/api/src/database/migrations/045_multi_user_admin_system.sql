-- Migration 045: Multi-User Administrator System
-- Adds user roles, admin capabilities, and farm/barn ownership tracking

-- Add admin flag and profile fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create index for admin queries
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = true;
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;

-- Add owner tracking to farms table
ALTER TABLE farms ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT false;

-- Create index for farm ownership queries
CREATE INDEX IF NOT EXISTS idx_farms_owner_id ON farms(owner_id);
CREATE INDEX IF NOT EXISTS idx_farms_created_by ON farms(created_by_user_id);

-- Add owner tracking to barn_items table (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'barn_items') THEN
    ALTER TABLE barn_items ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE barn_items ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT false;
    CREATE INDEX IF NOT EXISTS idx_barn_items_owner_id ON barn_items(owner_id);
  END IF;
END
$$;

-- Add owner tracking to harvests table
ALTER TABLE harvests ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_harvests_owner_id ON harvests(owner_id);

-- Create function to ensure only one admin at a time
CREATE OR REPLACE FUNCTION enforce_single_admin()
RETURNS TRIGGER AS $$
BEGIN
  -- If trying to set a user as admin
  IF NEW.is_admin = true THEN
    -- Check if there's already an admin
    IF EXISTS (
      SELECT 1 FROM users 
      WHERE is_admin = true 
      AND id != NEW.id
      AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Only one administrator can be active at a time. Please deselect the current administrator first.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce single admin rule
DROP TRIGGER IF EXISTS enforce_single_admin_trigger ON users;
CREATE TRIGGER enforce_single_admin_trigger
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION enforce_single_admin();

-- Create function to set first user as admin
CREATE OR REPLACE FUNCTION set_first_user_as_admin()
RETURNS TRIGGER AS $$
DECLARE
  user_count INTEGER;
BEGIN
  -- Count total users BEFORE this insert (excluding the current user being inserted)
  SELECT COUNT(*) INTO user_count FROM users WHERE is_active = true;

  -- If there are no existing users, make this user admin
  IF user_count = 0 THEN
    NEW.is_admin := true;
  ELSE
    -- Ensure new user is NOT admin if they're not the first
    NEW.is_admin := COALESCE(NEW.is_admin, false);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for first user auto-admin
DROP TRIGGER IF EXISTS set_first_user_admin_trigger ON users;
CREATE TRIGGER set_first_user_admin_trigger
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_first_user_as_admin();

-- Update existing farms to have owner (default to first user if exists)
DO $$
DECLARE
  first_user_id UUID;
BEGIN
  -- Get the first user
  SELECT id INTO first_user_id FROM users ORDER BY created_at LIMIT 1;
  
  IF first_user_id IS NOT NULL THEN
    -- Update farms without owner
    UPDATE farms 
    SET owner_id = first_user_id, created_by_user_id = first_user_id
    WHERE owner_id IS NULL;
    
    -- Update harvests without owner
    UPDATE harvests
    SET owner_id = first_user_id
    WHERE owner_id IS NULL;
    
    -- Make first user admin if no admin exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE is_admin = true) THEN
      UPDATE users SET is_admin = true WHERE id = first_user_id;
    END IF;
  END IF;
END
$$;

-- Add comments for documentation
COMMENT ON COLUMN users.is_admin IS 'Administrator flag - only one user can be admin at a time';
COMMENT ON COLUMN users.display_name IS 'User friendly display name';
COMMENT ON COLUMN users.preferences IS 'User preferences and settings as JSON';
COMMENT ON COLUMN farms.owner_id IS 'User who owns this farm';
COMMENT ON COLUMN farms.is_shared IS 'Whether farm is shared with other users';
COMMENT ON COLUMN harvests.owner_id IS 'User who owns this harvest';
