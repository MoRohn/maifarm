-- Fix missing columns in database schema
-- Run this to add missing columns that are causing errors

-- Add harvest_id column to farms table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'farms'
        AND column_name = 'harvest_id'
    ) THEN
        ALTER TABLE farms ADD COLUMN harvest_id UUID;
        RAISE NOTICE 'Added harvest_id column to farms table';
    ELSE
        RAISE NOTICE 'harvest_id column already exists in farms table';
    END IF;
END $$;

-- Add name column to harvests table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'harvests'
        AND column_name = 'name'
    ) THEN
        ALTER TABLE harvests ADD COLUMN name VARCHAR(255);
        RAISE NOTICE 'Added name column to harvests table';
    ELSE
        RAISE NOTICE 'name column already exists in harvests table';
    END IF;
END $$;

-- Add foreign key constraint for harvest_id if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'farms_harvest_id_fkey'
    ) THEN
        ALTER TABLE farms
        ADD CONSTRAINT farms_harvest_id_fkey
        FOREIGN KEY (harvest_id)
        REFERENCES harvests(id)
        ON DELETE SET NULL;
        RAISE NOTICE 'Added foreign key constraint for harvest_id';
    ELSE
        RAISE NOTICE 'Foreign key constraint for harvest_id already exists';
    END IF;
END $$;

-- Create index on harvest_id for better performance
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'farms'
        AND indexname = 'idx_farms_harvest_id'
    ) THEN
        CREATE INDEX idx_farms_harvest_id ON farms(harvest_id);
        RAISE NOTICE 'Created index on harvest_id';
    ELSE
        RAISE NOTICE 'Index on harvest_id already exists';
    END IF;
END $$;

-- Create index on harvests name for better query performance
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'harvests'
        AND indexname = 'idx_harvests_name'
    ) THEN
        CREATE INDEX idx_harvests_name ON harvests(name);
        RAISE NOTICE 'Created index on harvests name';
    ELSE
        RAISE NOTICE 'Index on harvests name already exists';
    END IF;
END $$;