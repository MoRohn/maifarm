#!/bin/bash

# MaiFarm Production Readiness Checklist
# Comprehensive validation of all systems before deployment

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# Helper functions
check_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASS_COUNT++))
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAIL_COUNT++))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARN_COUNT++))
}

check_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

header() {
    echo
    echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
}

# Environment Checks
check_environment() {
    header "1. ENVIRONMENT CONFIGURATION"
    
    # Check Node.js version
    if command -v node >/dev/null 2>&1; then
        NODE_VERSION=$(node -v)
        NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
        if [ "$NODE_MAJOR" -ge 18 ]; then
            check_pass "Node.js version: $NODE_VERSION"
        else
            check_fail "Node.js version $NODE_VERSION (requires >= v18)"
        fi
    else
        check_fail "Node.js not installed"
    fi
    
    # Check required environment files
    if [ -f ".env.production" ]; then
        check_pass "Production environment file exists"
    else
        check_fail "Missing .env.production file"
    fi
    
    # Check API keys (without exposing them)
    if [ -f ".env.production" ]; then
        if grep -q "ANTHROPIC_API_KEY=sk-" .env.production 2>/dev/null; then
            check_pass "Anthropic API key configured"
        else
            check_warn "Anthropic API key may not be configured properly"
        fi
        
        if grep -q "DB_PASSWORD=" .env.production && ! grep -q "DB_PASSWORD=maifarm123" .env.production; then
            check_pass "Database password changed from default"
        else
            check_fail "Database password is still default - SECURITY RISK"
        fi
    fi
    
    # Check SSL certificates
    if [ -d "./ssl" ] && [ -f "./ssl/cert.pem" ] && [ -f "./ssl/key.pem" ]; then
        check_pass "SSL certificates present"
    else
        check_warn "SSL certificates not found (required for production HTTPS)"
    fi
}

# Database Checks
check_database() {
    header "2. DATABASE CONFIGURATION"
    
    # Check PostgreSQL
    if command -v psql >/dev/null 2>&1; then
        check_pass "PostgreSQL installed"
        
        # Check if database is accessible
        if PGPASSWORD=${DB_PASSWORD:-maifarm123} psql -h localhost -U ${DB_USER:-maifarm} -d ${DB_NAME:-maifarm_dev} -c "SELECT 1" >/dev/null 2>&1; then
            check_pass "Database connection successful"
        else
            check_fail "Cannot connect to database"
        fi
    else
        check_fail "PostgreSQL not installed"
    fi
    
    # Check Redis
    if command -v redis-cli >/dev/null 2>&1; then
        check_pass "Redis installed"
        
        if redis-cli ping >/dev/null 2>&1; then
            check_pass "Redis connection successful"
        else
            check_fail "Cannot connect to Redis"
        fi
    else
        check_warn "Redis not installed (optional but recommended for caching)"
    fi
    
    # Check for database backups
    if [ -d "./backups" ] && [ "$(ls -A ./backups 2>/dev/null)" ]; then
        check_pass "Database backup directory exists with backups"
    else
        check_warn "No database backups found"
    fi
}

# Security Checks
check_security() {
    header "3. SECURITY CONFIGURATION"
    
    # Check for exposed secrets in code
    if grep -r "sk-ant-" --include="*.ts" --include="*.tsx" --include="*.js" --exclude-dir=node_modules . 2>/dev/null | grep -v ".env"; then
        check_fail "API keys found in source code - CRITICAL SECURITY ISSUE"
    else
        check_pass "No API keys found in source code"
    fi
    
    # Check file permissions on sensitive files
    if [ -f ".env.production" ]; then
        PERM=$(stat -f "%OLp" .env.production 2>/dev/null || stat -c "%a" .env.production 2>/dev/null)
        if [ "$PERM" == "600" ] || [ "$PERM" == "640" ]; then
            check_pass "Environment file has secure permissions ($PERM)"
        else
            check_warn "Environment file permissions too open ($PERM) - should be 600 or 640"
        fi
    fi
    
    # Check for rate limiting
    if grep -q "rateLimit" server/middleware/rateLimit.ts 2>/dev/null; then
        check_pass "Rate limiting middleware configured"
    else
        check_warn "Rate limiting not configured"
    fi
    
    # Check CORS configuration
    if grep -q "cors" server/middleware/cors.ts 2>/dev/null; then
        check_pass "CORS middleware configured"
    else
        check_fail "CORS not configured - security risk"
    fi
    
    # Check authentication
    if grep -q "authenticateToken" server/middleware/auth.ts 2>/dev/null; then
        check_pass "Authentication middleware present"
    else
        check_fail "Authentication middleware missing"
    fi
}

# Performance Checks
check_performance() {
    header "4. PERFORMANCE OPTIMIZATION"
    
    # Check if production build exists
    if [ -d "./dist" ] && [ "$(ls -A ./dist 2>/dev/null)" ]; then
        check_pass "Production build exists"
    else
        check_warn "No production build found - run 'npm run build'"
    fi
    
    # Check for gzip compression
    if grep -q "compression" server/index.ts 2>/dev/null; then
        check_pass "Compression middleware enabled"
    else
        check_warn "Compression not enabled - impacts performance"
    fi
    
    # Check for clustering
    if grep -q "cluster" server/index.ts 2>/dev/null; then
        check_pass "Clustering enabled for multi-core utilization"
    else
        check_info "Clustering not enabled (optional for small deployments)"
    fi
    
    # Check memory limits
    if grep -q "max-old-space-size" package.json 2>/dev/null; then
        check_pass "Node.js memory limits configured"
    else
        check_warn "Node.js memory limits not configured"
    fi
}

# Isolation Checks
check_isolation() {
    header "5. SECURITY ISOLATION (MAIBARN)"
    
    # Check maibarn directory structure
    if [ -d "./maibarn" ]; then
        check_pass "Maibarn isolation directory exists"
        
        # Check subdirectories
        for dir in coordination harvests workspaces terminals barn/items; do
            if [ -d "./maibarn/$dir" ]; then
                check_pass "Maibarn/$dir directory present"
            else
                check_warn "Missing maibarn/$dir directory"
            fi
        done
    else
        check_fail "Maibarn isolation directory missing - CRITICAL"
    fi
    
    # Check path validation
    if grep -q "isPathSafe" server/config/paths.ts 2>/dev/null; then
        check_pass "Path validation implemented"
    else
        check_fail "Path validation not implemented - security risk"
    fi
}

# Monitoring Checks
check_monitoring() {
    header "6. MONITORING & LOGGING"
    
    # Check logging configuration
    if [ -d "./logs" ]; then
        check_pass "Logs directory exists"
    else
        check_warn "Logs directory missing"
    fi
    
    # Check for structured logging
    if grep -q "structuredLogger" server/utils/structuredLogger.ts 2>/dev/null; then
        check_pass "Structured logging implemented"
    else
        check_warn "Structured logging not found"
    fi
    
    # Check for health endpoints
    if grep -q "/health" server/api/health.ts 2>/dev/null; then
        check_pass "Health check endpoint present"
    else
        check_fail "No health check endpoint"
    fi
    
    # Check for metrics
    if grep -q "prometheus" server/monitoring/prometheusExporter.ts 2>/dev/null; then
        check_pass "Prometheus metrics configured"
    else
        check_info "Prometheus metrics not configured (optional)"
    fi
}

# Process Management
check_process_management() {
    header "7. PROCESS MANAGEMENT"
    
    # Check for PM2 configuration
    if [ -f "ecosystem.config.js" ] || [ -f "pm2.config.js" ]; then
        check_pass "PM2 configuration found"
    else
        check_warn "No PM2 configuration (recommended for production)"
    fi
    
    # Check for systemd service
    if [ -f "/etc/systemd/system/maifarm.service" ]; then
        check_pass "Systemd service configured"
    else
        check_info "No systemd service (optional)"
    fi
    
    # Check graceful shutdown
    if grep -q "SIGTERM" server/index.ts 2>/dev/null && grep -q "SIGINT" server/index.ts 2>/dev/null; then
        check_pass "Graceful shutdown handlers present"
    else
        check_fail "Missing graceful shutdown handlers"
    fi
}

# Tmux Health
check_tmux_health() {
    header "8. TMUX SESSION MANAGEMENT"
    
    # Check tmux installation
    if command -v tmux >/dev/null 2>&1; then
        check_pass "Tmux installed"
        
        # Check for orphaned sessions
        ORPHANED=$(TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null | grep "^farm-" | wc -l)
        if [ "$ORPHANED" -eq 0 ]; then
            check_pass "No orphaned tmux sessions"
        else
            check_warn "$ORPHANED orphaned tmux session(s) found"
        fi
    else
        check_fail "Tmux not installed - REQUIRED"
    fi
    
    # Check cleanup service
    if grep -q "AgentCleanupService" server/services/agentCleanupService.ts 2>/dev/null; then
        check_pass "Agent cleanup service implemented"
    else
        check_fail "Agent cleanup service missing"
    fi
}

# Dependencies Check
check_dependencies() {
    header "9. DEPENDENCY MANAGEMENT"
    
    # Check for vulnerabilities
    if command -v npm >/dev/null 2>&1; then
        check_info "Running npm audit..."
        AUDIT_RESULT=$(npm audit --json 2>/dev/null | jq '.metadata.vulnerabilities.high + .metadata.vulnerabilities.critical' 2>/dev/null || echo "0")
        
        if [ "$AUDIT_RESULT" == "0" ]; then
            check_pass "No high or critical vulnerabilities"
        else
            check_fail "$AUDIT_RESULT high/critical vulnerabilities found"
        fi
    fi
    
    # Check package-lock
    if [ -f "package-lock.json" ]; then
        check_pass "Package-lock.json present"
    else
        check_warn "Package-lock.json missing - inconsistent dependencies"
    fi
}

# Final Report
generate_report() {
    header "PRODUCTION READINESS REPORT"
    
    TOTAL=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))
    SCORE=$((PASS_COUNT * 100 / TOTAL))
    
    echo
    echo -e "Checks Passed:  ${GREEN}$PASS_COUNT${NC}"
    echo -e "Checks Failed:  ${RED}$FAIL_COUNT${NC}"
    echo -e "Warnings:       ${YELLOW}$WARN_COUNT${NC}"
    echo -e "Total Checks:   $TOTAL"
    echo -e "Score:          $SCORE%"
    echo
    
    if [ "$FAIL_COUNT" -eq 0 ]; then
        echo -e "${GREEN}✓ PRODUCTION READY${NC}"
        echo "All critical checks passed!"
    elif [ "$FAIL_COUNT" -le 3 ]; then
        echo -e "${YELLOW}⚠ ALMOST READY${NC}"
        echo "Fix the failed checks before deploying to production."
    else
        echo -e "${RED}✗ NOT PRODUCTION READY${NC}"
        echo "Multiple critical issues found. Address all failures before deployment."
    fi
    
    # Save report
    REPORT_FILE="production-readiness-$(date +%Y%m%d-%H%M%S).txt"
    {
        echo "MaiFarm Production Readiness Report"
        echo "Generated: $(date)"
        echo "Score: $SCORE%"
        echo "Passed: $PASS_COUNT | Failed: $FAIL_COUNT | Warnings: $WARN_COUNT"
    } > "$REPORT_FILE"
    
    echo
    echo "Report saved to: $REPORT_FILE"
}

# Main execution
main() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║         MaiFarm Production Readiness Check            ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
    
    check_environment
    check_database
    check_security
    check_performance
    check_isolation
    check_monitoring
    check_process_management
    check_tmux_health
    check_dependencies
    
    generate_report
}

# Run checks
main