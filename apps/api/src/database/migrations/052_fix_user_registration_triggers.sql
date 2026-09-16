-- Migration 052: Fix User Registration Trigger Conflicts
-- Fixes the conflict between enforce_single_admin and set_first_user_admin triggers

-- Drop the problematic enforce_single_admin trigger that blocks all registrations
DROP TRIGGER IF EXISTS enforce_single_admin_trigger ON users;

-- Drop the old function
DROP FUNCTION IF EXISTS enforce_single_admin();

-- Create a smarter function that only enforces single admin when setting is_admin to true
CREATE OR REPLACE FUNCTION enforce_single_admin()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check if we're trying to SET is_admin to true
  -- Don't block regular user creation (when is_admin is false or null)
  IF NEW.is_admin = true THEN
    -- Check if there's already an active admin (excluding the current user on UPDATE)
    IF EXISTS (
      SELECT 1 FROM users
      WHERE is_admin = true
      AND id != NEW.id
      AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Only one administrator can be active at a time. Please deactivate the current administrator first.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger with the fixed logic
CREATE TRIGGER enforce_single_admin_trigger
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION enforce_single_admin();

-- Also improve the set_first_user_as_admin function
CREATE OR REPLACE FUNCTION set_first_user_as_admin()
RETURNS TRIGGER AS $$
DECLARE
  user_count INTEGER;
BEGIN
  -- Only run on INSERT, not UPDATE
  -- Count active users (excluding the one being inserted)
  SELECT COUNT(*) INTO user_count
  FROM users
  WHERE is_active = true;

  -- If this is the first active user, make them admin
  IF user_count = 0 THEN
    NEW.is_admin := true;
    NEW.roles := array_append(COALESCE(NEW.roles, ARRAY['user']::text[]), 'admin');
  ELSE
    -- Ensure is_admin is set to false if not explicitly set for non-first users
    NEW.is_admin := COALESCE(NEW.is_admin, false);
    -- Ensure roles array includes at least 'user' role
    IF NEW.roles IS NULL OR array_length(NEW.roles, 1) = 0 THEN
      NEW.roles := ARRAY['user']::text[];
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Make sure the trigger is properly set
DROP TRIGGER IF EXISTS set_first_user_admin_trigger ON users;
CREATE TRIGGER set_first_user_admin_trigger
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_first_user_as_admin();

-- Add helpful comment
COMMENT ON FUNCTION enforce_single_admin() IS 'Ensures only one admin can be active at a time, but allows regular user creation';
COMMENT ON FUNCTION set_first_user_as_admin() IS 'Automatically makes the first user an admin, subsequent users are regular users';