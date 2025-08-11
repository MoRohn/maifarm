-- Security Audits Table
CREATE TABLE IF NOT EXISTS security_audits (
    id VARCHAR(255) PRIMARY KEY,
    farm_id VARCHAR(255),
    scan_type VARCHAR(50) NOT NULL CHECK (scan_type IN ('full', 'incremental', 'dependency', 'code', 'configuration')),
    status VARCHAR(50) NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    vulnerabilities JSONB DEFAULT '[]'::jsonb,
    statistics JSONB DEFAULT '{}'::jsonb,
    recommendations JSONB DEFAULT '[]'::jsonb,
    compliance_status JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
);

-- Security Vulnerabilities Table (for detailed tracking)
CREATE TABLE IF NOT EXISTS security_vulnerabilities (
    id VARCHAR(255) PRIMARY KEY,
    audit_id VARCHAR(255) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    type VARCHAR(255) NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    file_path TEXT,
    line_number INTEGER,
    column_number INTEGER,
    fix_suggestion TEXT,
    cwe_id VARCHAR(50),
    owasp_category VARCHAR(100),
    detected_at TIMESTAMP NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('open', 'fixed', 'false_positive', 'accepted_risk')),
    fixed_at TIMESTAMP,
    fixed_by VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (audit_id) REFERENCES security_audits(id) ON DELETE CASCADE
);

-- Security Rules Table (custom rules)
CREATE TABLE IF NOT EXISTS security_rules (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    pattern TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    description TEXT,
    fix_suggestion TEXT,
    enabled BOOLEAN DEFAULT true,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Security Configurations Table
CREATE TABLE IF NOT EXISTS security_configurations (
    id SERIAL PRIMARY KEY,
    farm_id VARCHAR(255),
    enable_auto_scan BOOLEAN DEFAULT false,
    scan_interval INTEGER DEFAULT 24, -- in hours
    scan_depth VARCHAR(20) DEFAULT 'medium' CHECK (scan_depth IN ('shallow', 'medium', 'deep')),
    include_patterns JSONB DEFAULT '["**/*.ts", "**/*.js", "**/*.tsx", "**/*.jsx"]'::jsonb,
    exclude_patterns JSONB DEFAULT '["node_modules/**", "dist/**", "build/**", ".git/**"]'::jsonb,
    notification_settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
);

-- Security Events Table (for audit trail)
CREATE TABLE IF NOT EXISTS security_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20),
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    user_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_security_audits_farm_id ON security_audits(farm_id);
CREATE INDEX idx_security_audits_status ON security_audits(status);
CREATE INDEX idx_security_audits_scan_type ON security_audits(scan_type);
CREATE INDEX idx_security_audits_started_at ON security_audits(started_at DESC);

CREATE INDEX idx_security_vulnerabilities_audit_id ON security_vulnerabilities(audit_id);
CREATE INDEX idx_security_vulnerabilities_severity ON security_vulnerabilities(severity);
CREATE INDEX idx_security_vulnerabilities_status ON security_vulnerabilities(status);
CREATE INDEX idx_security_vulnerabilities_type ON security_vulnerabilities(type);

CREATE INDEX idx_security_events_event_type ON security_events(event_type);
CREATE INDEX idx_security_events_created_at ON security_events(created_at DESC);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_security_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_security_audits_updated_at
    BEFORE UPDATE ON security_audits
    FOR EACH ROW
    EXECUTE FUNCTION update_security_updated_at();

CREATE TRIGGER update_security_vulnerabilities_updated_at
    BEFORE UPDATE ON security_vulnerabilities
    FOR EACH ROW
    EXECUTE FUNCTION update_security_updated_at();

CREATE TRIGGER update_security_rules_updated_at
    BEFORE UPDATE ON security_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_security_updated_at();

CREATE TRIGGER update_security_configurations_updated_at
    BEFORE UPDATE ON security_configurations
    FOR EACH ROW
    EXECUTE FUNCTION update_security_updated_at();