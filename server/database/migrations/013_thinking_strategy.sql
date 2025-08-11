-- Migration: Add thinking strategy tables
-- Purpose: Support tracking and optimization of Claude's extended thinking capabilities

-- Create thinking_metrics table to track performance
CREATE TABLE IF NOT EXISTS thinking_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id VARCHAR(255) NOT NULL,
  level VARCHAR(50) NOT NULL, -- none, basic, moderate, deep, ultra
  processing_time INTEGER NOT NULL, -- milliseconds
  quality_score INTEGER, -- 0-100 quality rating
  success BOOLEAN NOT NULL DEFAULT true,
  errors JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes for performance
  INDEX idx_thinking_metrics_task_id ON thinking_metrics(task_id),
  INDEX idx_thinking_metrics_level ON thinking_metrics(level),
  INDEX idx_thinking_metrics_created_at ON thinking_metrics(created_at)
);

-- Create thinking_preferences table for user settings
CREATE TABLE IF NOT EXISTS thinking_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL UNIQUE,
  default_level VARCHAR(50) NOT NULL DEFAULT 'basic',
  enable_auto_selection BOOLEAN DEFAULT true,
  show_recommendations BOOLEAN DEFAULT true,
  max_allowed_level VARCHAR(50) DEFAULT 'deep',
  speed_quality_balance INTEGER DEFAULT 50, -- 0=speed, 100=quality
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create thinking_recommendations table to cache recommendations
CREATE TABLE IF NOT EXISTS thinking_recommendations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt_hash VARCHAR(64) NOT NULL, -- SHA256 hash of prompt for caching
  task_type VARCHAR(50),
  recommended_level VARCHAR(50) NOT NULL,
  complexity_score INTEGER NOT NULL,
  confidence DECIMAL(3,2) NOT NULL, -- 0.00 to 1.00
  reasoning TEXT,
  hit_count INTEGER DEFAULT 0, -- Track cache hits
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Index for fast lookups
  INDEX idx_thinking_recommendations_hash ON thinking_recommendations(prompt_hash)
);

-- Add thinking-related columns to farms table
ALTER TABLE farms ADD COLUMN IF NOT EXISTS thinking_level VARCHAR(50) DEFAULT NULL;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS thinking_auto_escalate BOOLEAN DEFAULT false;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS thinking_complexity_score INTEGER DEFAULT NULL;

-- Add thinking-related columns to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS thinking_level VARCHAR(50) DEFAULT NULL;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS thinking_overhead_ms INTEGER DEFAULT NULL;

-- Create view for thinking strategy analytics
CREATE OR REPLACE VIEW thinking_analytics AS
SELECT 
  level,
  COUNT(*) as usage_count,
  AVG(processing_time) as avg_processing_time,
  AVG(quality_score) as avg_quality_score,
  SUM(CASE WHEN success THEN 1 ELSE 0 END)::FLOAT / COUNT(*) as success_rate,
  DATE_TRUNC('day', created_at) as date
FROM thinking_metrics
GROUP BY level, DATE_TRUNC('day', created_at)
ORDER BY date DESC, level;

-- Create function to clean up old recommendations (older than 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_thinking_recommendations()
RETURNS void AS $$
BEGIN
  DELETE FROM thinking_recommendations 
  WHERE last_used_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
    AND hit_count < 5; -- Keep frequently used recommendations longer
END;
$$ LANGUAGE plpgsql;

-- Add comment documentation
COMMENT ON TABLE thinking_metrics IS 'Tracks performance metrics for thinking strategy application';
COMMENT ON TABLE thinking_preferences IS 'Stores user preferences for thinking strategy behavior';
COMMENT ON TABLE thinking_recommendations IS 'Caches thinking level recommendations to improve performance';
COMMENT ON COLUMN thinking_metrics.level IS 'Thinking level: none, basic, moderate, deep, ultra';
COMMENT ON COLUMN thinking_preferences.speed_quality_balance IS 'Balance preference: 0=fastest, 100=highest quality';
COMMENT ON COLUMN thinking_recommendations.prompt_hash IS 'SHA256 hash of prompt for cache lookup';