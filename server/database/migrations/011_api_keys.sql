-- Create API Keys table for secure storage
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  service VARCHAR(50) NOT NULL,
  key_encrypted TEXT NOT NULL, -- Store encrypted
  key_hash VARCHAR(64) NOT NULL, -- For quick lookups without decryption
  name VARCHAR(100),
  permissions TEXT[], -- Array of permission strings
  created_by VARCHAR(100) DEFAULT 'system',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(service, key_hash)
);

-- Index for quick lookups
CREATE INDEX idx_api_keys_service ON api_keys(service);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_active ON api_keys(is_active);

-- Add comment
COMMENT ON TABLE api_keys IS 'Stores API keys for external service integrations';
COMMENT ON COLUMN api_keys.key_encrypted IS 'Encrypted API key value';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA256 hash for uniqueness check without decryption';