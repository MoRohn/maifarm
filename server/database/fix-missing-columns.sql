-- Fix missing columns in database tables
-- This script adds columns that the application expects but are missing

BEGIN;

-- Add farm_id column to barn_items table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'barn_items' 
        AND column_name = 'farm_id'
    ) THEN
        ALTER TABLE barn_items ADD COLUMN farm_id UUID;
        CREATE INDEX idx_barn_items_farm_id ON barn_items(farm_id);
        -- Add foreign key constraint
        ALTER TABLE barn_items 
        ADD CONSTRAINT barn_items_farm_id_fkey 
        FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE SET NULL;
        
        RAISE NOTICE 'Added farm_id column to barn_items table';
    ELSE
        RAISE NOTICE 'farm_id column already exists in barn_items table';
    END IF;
END $$;

-- Add metrics column to farms table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'farms' 
        AND column_name = 'metrics'
    ) THEN
        ALTER TABLE farms ADD COLUMN metrics JSONB NOT NULL DEFAULT '{}';
        CREATE INDEX idx_farms_metrics ON farms USING gin(metrics);
        
        RAISE NOTICE 'Added metrics column to farms table';
    ELSE
        RAISE NOTICE 'metrics column already exists in farms table';
    END IF;
END $$;

-- Add any other commonly missing columns

-- Add permissions column to users table if missing (from logs)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'permissions'
    ) THEN
        ALTER TABLE users ADD COLUMN permissions TEXT[] DEFAULT '{}'::TEXT[];
        
        RAISE NOTICE 'Added permissions column to users table';
    ELSE
        RAISE NOTICE 'permissions column already exists in users table';
    END IF;
END $$;

-- Verify all changes
SELECT 'barn_items.farm_id exists' AS check_result, 
       EXISTS (
           SELECT 1 FROM information_schema.columns 
           WHERE table_schema = 'public' 
           AND table_name = 'barn_items' 
           AND column_name = 'farm_id'
       ) AS status
UNION ALL
SELECT 'farms.metrics exists' AS check_result,
       EXISTS (
           SELECT 1 FROM information_schema.columns 
           WHERE table_schema = 'public' 
           AND table_name = 'farms' 
           AND column_name = 'metrics'
       ) AS status
UNION ALL
SELECT 'users.permissions exists' AS check_result,
       EXISTS (
           SELECT 1 FROM information_schema.columns 
           WHERE table_schema = 'public' 
           AND table_name = 'users' 
           AND column_name = 'permissions'
       ) AS status;

COMMIT;