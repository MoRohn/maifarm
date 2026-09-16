-- ============================================
-- Migration 004: Security & API Management
-- ============================================
-- This migration creates security, API keys, and authentication-related tables
-- Consolidates: 005_provider_api_keys, 008_api_keys, 011_security_audits, 015_security_audits

BEGIN;

-- ============================================
-- API KEYS
-- ============================================

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Key identification
    name VARCHAR(255) NOT NULL,
    service VARCHAR(100) NOT NULL,
    key_encrypted TEXT NOT NULL,
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    
    -- Permissions and access
    permissions TEXT[] DEFAULT '{}'::TEXT[],
    rate_limit INTEGER DEFAULT 1000,
    
    -- Usage tracking
    usage_count INTEGER DEFAULT 0,
    last_used TIMESTAMP,
    
    -- Status and lifecycle
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP,
    revoked_at TIMESTAMP,
    revoked_reason TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT api_key_service_check CHECK (service IN (
        'anthropic', 'openai', 'google', 'azure', 'aws', 'groq', 
        'together', 'replicate', 'huggingface', 'cohere', 'internal'
    ))
);

-- ============================================
-- SECURITY AUDITS
-- ============================================

CREATE TABLE IF NOT EXISTS security_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Audit identification
    audit_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    
    -- Findings
    title VARCHAR(255) NOT NULL,
    description TEXT,
    findings JSONB DEFAULT '[]',
    vulnerabilities JSONB DEFAULT '[]',
    recommendations JSONB DEFAULT '[]',
    
    -- Risk assessment
    risk_score INTEGER,
    impact_level VARCHAR(20),
    
    -- Remediation
    remediation_status VARCHAR(50) DEFAULT 'not_started',
    remediation_notes TEXT,
    remediated_by UUID REFERENCES users(id),
    remediated_at TIMESTAMP,
    
    -- Resource tracking
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    affected_resources JSONB DEFAULT '[]',
    
    -- Compliance
    compliance_standards TEXT[] DEFAULT '{}'::TEXT[],
    compliance_status JSONB DEFAULT '{}',
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT audit_severity_check CHECK (severity IN (
        'info', 'low', 'medium', 'high', 'critical'
    )),
    CONSTRAINT audit_status_check CHECK (status IN (
        'pending', 'in_progress', 'completed', 'failed', 'archived'
    )),
    CONSTRAINT remediation_status_check CHECK (remediation_status IN (
        'not_started', 'in_progress', 'completed', 'verified', 'accepted_risk'
    ))
);

-- ============================================
-- VULNERABILITY TRACKING
-- ============================================

CREATE TABLE IF NOT EXISTS vulnerabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id UUID REFERENCES security_audits(id) ON DELETE CASCADE,
    
    -- Vulnerability details
    cve_id VARCHAR(50),
    type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    
    -- Description
    title VARCHAR(255) NOT NULL,
    description TEXT,
    technical_details JSONB DEFAULT '{}',
    
    -- Impact
    cvss_score DECIMAL(3, 1),
    impact_description TEXT,
    affected_components TEXT[],
    
    -- Remediation
    status VARCHAR(50) DEFAULT 'open',
    patch_available BOOLEAN DEFAULT FALSE,
    patch_url TEXT,
    workaround TEXT,
    
    -- Tracking
    discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    patched_at TIMESTAMP,
    verified_at TIMESTAMP,
    
    CONSTRAINT vuln_severity_check CHECK (severity IN (
        'info', 'low', 'medium', 'high', 'critical'
    )),
    CONSTRAINT vuln_status_check CHECK (status IN (
        'open', 'in_progress', 'patched', 'mitigated', 'accepted', 'false_positive'
    ))
);

-- ============================================
-- ACCESS TOKENS
-- ============================================

CREATE TABLE IF NOT EXISTS access_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Token details
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    token_type VARCHAR(50) NOT NULL DEFAULT 'bearer',
    scope TEXT[] DEFAULT '{}'::TEXT[],
    
    -- Client information
    client_id VARCHAR(255),
    client_name VARCHAR(255),
    device_info JSONB DEFAULT '{}',
    
    -- Security
    refresh_token_hash VARCHAR(255),
    revoked BOOLEAN DEFAULT FALSE,
    revoked_reason TEXT,
    
    -- Timestamps
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    last_used TIMESTAMP,
    
    CONSTRAINT token_type_check CHECK (token_type IN (
        'bearer', 'api_key', 'personal', 'service', 'temporary'
    ))
);

-- ============================================
-- PERMISSION GRANTS
-- ============================================

CREATE TABLE IF NOT EXISTS permission_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Grant target
    grantee_type VARCHAR(50) NOT NULL,
    grantee_id UUID NOT NULL,
    
    -- Resource
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255),
    
    -- Permissions
    permissions TEXT[] NOT NULL,
    conditions JSONB DEFAULT '{}',
    
    -- Lifecycle
    granted_by UUID REFERENCES users(id),
    expires_at TIMESTAMP,
    revoked BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT grantee_type_check CHECK (grantee_type IN (
        'user', 'api_key', 'service', 'role', 'group'
    ))
);

-- ============================================
-- RATE LIMITS
-- ============================================

CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Target
    target_type VARCHAR(50) NOT NULL,
    target_id VARCHAR(255) NOT NULL,
    
    -- Limits
    requests_per_minute INTEGER DEFAULT 60,
    requests_per_hour INTEGER DEFAULT 1000,
    requests_per_day INTEGER DEFAULT 10000,
    
    -- Current usage
    current_minute_count INTEGER DEFAULT 0,
    current_hour_count INTEGER DEFAULT 0,
    current_day_count INTEGER DEFAULT 0,
    
    -- Reset times
    minute_reset_at TIMESTAMP,
    hour_reset_at TIMESTAMP,
    day_reset_at TIMESTAMP,
    
    -- Override
    override_enabled BOOLEAN DEFAULT FALSE,
    override_limit INTEGER,
    override_expires_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT target_type_check CHECK (target_type IN (
        'user', 'api_key', 'ip_address', 'service', 'global'
    )),
    UNIQUE(target_type, target_id)
);

-- ============================================
-- ENCRYPTION KEYS
-- ============================================

CREATE TABLE IF NOT EXISTS encryption_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Key identification
    key_id VARCHAR(255) UNIQUE NOT NULL,
    key_type VARCHAR(50) NOT NULL,
    algorithm VARCHAR(50) NOT NULL,
    
    -- Key material (encrypted)
    encrypted_key TEXT NOT NULL,
    key_metadata JSONB DEFAULT '{}',
    
    -- Usage
    purpose VARCHAR(100),
    active BOOLEAN DEFAULT TRUE,
    
    -- Rotation
    rotation_scheduled_at TIMESTAMP,
    rotated_from UUID REFERENCES encryption_keys(id),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    
    CONSTRAINT key_type_check CHECK (key_type IN (
        'master', 'data', 'signing', 'encryption', 'api'
    )),
    CONSTRAINT algorithm_check CHECK (algorithm IN (
        'AES-256-GCM', 'RSA-2048', 'RSA-4096', 'ED25519', 'ECDSA-P256'
    ))
);

-- ============================================
-- AUDIT TRAIL
-- ============================================

CREATE TABLE IF NOT EXISTS security_audit_trail (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Event details
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    
    -- Actor
    actor_type VARCHAR(50),
    actor_id VARCHAR(255),
    actor_ip INET,
    actor_user_agent TEXT,
    
    -- Target
    target_type VARCHAR(100),
    target_id VARCHAR(255),
    
    -- Event data
    action VARCHAR(100) NOT NULL,
    result VARCHAR(50) NOT NULL,
    details JSONB DEFAULT '{}',
    
    -- Context
    session_id VARCHAR(255),
    correlation_id VARCHAR(255),
    
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT event_category_check CHECK (event_category IN (
        'authentication', 'authorization', 'data_access', 
        'configuration', 'system', 'api', 'security'
    )),
    CONSTRAINT result_check CHECK (result IN (
        'success', 'failure', 'error', 'blocked', 'suspicious'
    ))
);

-- ============================================
-- INDEXES
-- ============================================

-- API Keys indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_service ON api_keys(service);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at);

-- Security audits indexes
CREATE INDEX IF NOT EXISTS idx_security_audits_type ON security_audits(audit_type);
CREATE INDEX IF NOT EXISTS idx_security_audits_severity ON security_audits(severity);
CREATE INDEX IF NOT EXISTS idx_security_audits_status ON security_audits(status);
CREATE INDEX IF NOT EXISTS idx_security_audits_created_at ON security_audits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audits_resource ON security_audits(resource_type, resource_id);

-- Vulnerabilities indexes
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_audit_id ON vulnerabilities(audit_id);
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_severity ON vulnerabilities(severity);
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_status ON vulnerabilities(status);
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_cve ON vulnerabilities(cve_id);

-- Access tokens indexes
CREATE INDEX IF NOT EXISTS idx_access_tokens_user_id ON access_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_access_tokens_token_hash ON access_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_access_tokens_expires_at ON access_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_access_tokens_client_id ON access_tokens(client_id);

-- Permission grants indexes
CREATE INDEX IF NOT EXISTS idx_permission_grants_grantee ON permission_grants(grantee_type, grantee_id);
CREATE INDEX IF NOT EXISTS idx_permission_grants_resource ON permission_grants(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_permission_grants_expires ON permission_grants(expires_at);

-- Rate limits indexes
CREATE INDEX IF NOT EXISTS idx_rate_limits_target ON rate_limits(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(minute_reset_at, hour_reset_at);

-- Encryption keys indexes
CREATE INDEX IF NOT EXISTS idx_encryption_keys_key_id ON encryption_keys(key_id);
CREATE INDEX IF NOT EXISTS idx_encryption_keys_active ON encryption_keys(active);
CREATE INDEX IF NOT EXISTS idx_encryption_keys_expires ON encryption_keys(expires_at);

-- Audit trail indexes
CREATE INDEX IF NOT EXISTS idx_audit_trail_timestamp ON security_audit_trail(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trail_event_type ON security_audit_trail(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_trail_actor ON security_audit_trail(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_target ON security_audit_trail(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_correlation ON security_audit_trail(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_severity ON security_audit_trail(severity);

COMMIT;