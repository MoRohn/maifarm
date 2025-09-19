-- ============================================
-- Migration 003a: Fix Harvest Seeds Foreign Key
-- ============================================
-- This migration fixes the foreign key constraint issue between seeds and harvests tables

BEGIN;

-- First, check if the constraint exists and drop it if it does
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'seeds_harvest_id_fkey'
        AND table_name = 'seeds'
    ) THEN
        ALTER TABLE seeds DROP CONSTRAINT seeds_harvest_id_fkey;
    END IF;
END $$;

-- Check if harvest_id column exists in seeds table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'seeds'
        AND column_name = 'harvest_id'
    ) THEN
        -- Make harvest_id nullable if it isn't already
        ALTER TABLE seeds ALTER COLUMN harvest_id DROP NOT NULL;

        -- Add the foreign key constraint with proper cascade behavior
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'seeds_harvest_id_fkey'
            AND table_name = 'seeds'
        ) THEN
            ALTER TABLE seeds
            ADD CONSTRAINT seeds_harvest_id_fkey
            FOREIGN KEY (harvest_id)
            REFERENCES harvests(id)
            ON DELETE SET NULL
            DEFERRABLE INITIALLY DEFERRED;
        END IF;
    END IF;
END $$;

-- Create index on harvest_id for better query performance
CREATE INDEX IF NOT EXISTS idx_seeds_harvest_id ON seeds(harvest_id);

-- Ensure harvests table has proper indexes
CREATE INDEX IF NOT EXISTS idx_harvests_farm_id ON harvests(farm_id);
CREATE INDEX IF NOT EXISTS idx_harvests_status ON harvests(status);
CREATE INDEX IF NOT EXISTS idx_harvests_created_at ON harvests(created_at DESC);

COMMIT;