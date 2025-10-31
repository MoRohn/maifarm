#!/bin/bash

# MaiFarm Setup Doctor - Diagnostic and troubleshooting script
# This script helps diagnose and fix common setup issues

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}${BOLD}"
echo "🩺 MaiFarm Setup Doctor"
echo "======================"
echo -e "${NC}"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_check() {
    echo -e "${CYAN}[CHECK]${NC} $1"
}

# Check system requirements
check_system_requirements() {
    log_check "Checking system requirements..."
    
    local issues=0
    
    # Check Node.js
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version | cut -d'v' -f2)
        log_success "Node.js v$NODE_VERSION installed"
        
        # Check if version is adequate
        NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1)
        if [ "$NODE_MAJOR" -lt 18 ]; then
            log_warning "Node.js version is below recommended v18"
            ((issues++))
        fi
    else
        log_error "Node.js not found"
        ((issues++))
    fi
    
    # Check npm
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        log_success "npm v$NPM_VERSION installed"
    else
        log_error "npm not found"
        ((issues++))
    fi

    # Check Poetry (Python dependency management)
    if command -v poetry &> /dev/null; then
        POETRY_VERSION=$(poetry --version 2>/dev/null)
        log_success "Poetry detected ($POETRY_VERSION)"
    else
        log_warning "Poetry not found – Python helpers will require manual pip installation"
    fi
    
    return $issues
}

# Check database connections
check_databases() {
    log_check "Checking database connections..."
    
    local issues=0
    
    # Ensure PostgreSQL CLI is discoverable
    if ! command -v psql &> /dev/null; then
        local psql_candidates=(
            "/opt/homebrew/bin/psql"
            "/usr/local/bin/psql"
            "/opt/homebrew/opt/postgresql/bin/psql"
            "/opt/homebrew/opt/postgresql@15/bin/psql"
            "/usr/local/opt/postgresql@15/bin/psql"
        )

        for candidate in "${psql_candidates[@]}"; do
            if [ -x "$candidate" ]; then
                export PATH="$(dirname "$candidate"):$PATH"
                log_info "Detected psql at $candidate (temporarily added to PATH)"
                break
            fi
        done
    fi

    # Check PostgreSQL
    if command -v psql &> /dev/null; then
        if pg_isready &> /dev/null; then
            log_success "PostgreSQL is running and accessible"
            
            # Test connection with MaiFarm database
            if PGPASSWORD=maifarm123 psql -h localhost -U maifarm -d maifarm_dev -c "SELECT 1;" &> /dev/null; then
                log_success "MaiFarm database connection successful"
            else
                log_warning "MaiFarm database connection failed - may need setup"
                log_info "Try running: npm run setup:postgres"
                ((issues++))
            fi
        else
            log_error "PostgreSQL is not running"
            log_info "Try: brew services start postgresql@15 (macOS) or sudo systemctl start postgresql (Linux)"
            ((issues++))
        fi
    else
        log_warning "PostgreSQL CLI not found in PATH"
        log_info "If Postgres is already installed, ensure 'psql' is available or set PATH before rerunning."
        ((issues++))
    fi
    
    # Check Redis
    if command -v redis-server &> /dev/null; then
        if redis-cli ping &> /dev/null; then
            log_success "Redis is running and accessible"
        else
            log_warning "Redis is not running (optional but recommended)"
            log_info "Try: brew services start redis (macOS) or sudo systemctl start redis (Linux)"
        fi
    else
        log_warning "Redis not installed (optional but recommended)"
        log_info "Try running: npm run setup:all"
    fi
    
    return $issues
}

# Check project dependencies
check_project_dependencies() {
    log_check "Checking project dependencies..."
    
    local issues=0
    
    # Check if node_modules exists
    if [ -d "node_modules" ]; then
        log_success "node_modules directory exists"
        
        # Check if package-lock.json exists
        if [ -f "package-lock.json" ]; then
            log_success "package-lock.json found"
        else
            log_warning "package-lock.json not found - dependencies may be inconsistent"
        fi
        
        # Check for critical dependencies
        critical_deps=("react" "express" "typescript" "vite")
        for dep in "${critical_deps[@]}"; do
            if [ -d "node_modules/$dep" ]; then
                log_success "$dep dependency installed"
            else
                log_error "$dep dependency missing"
                ((issues++))
            fi
        done
    else
        log_error "node_modules directory not found"
        log_info "Try running: npm install"
        ((issues++))
    fi
    
    return $issues
}

# Check environment configuration
check_environment() {
    log_check "Checking environment configuration..."
    
    local issues=0
    
    # Check .env.development
    if [ -f ".env.development" ]; then
        log_success ".env.development file exists"
        
        # Check critical environment variables
        critical_vars=("NODE_ENV" "PORT" "DB_HOST" "DB_NAME" "DB_USER")
        for var in "${critical_vars[@]}"; do
            if grep -q "^${var}=" .env.development; then
                log_success "$var is configured"
            else
                log_warning "$var not found in .env.development"
                ((issues++))
            fi
        done
    else
        log_error ".env.development file not found"
        log_info "Try running: npm run setup:all"
        ((issues++))
    fi
    
    return $issues
}

# Check port availability
check_ports() {
    log_check "Checking port availability..."
    
    local issues=0
    
    # Check if ports are in use
    ports=(4567 3000 5173 5432 6379)
    port_names=("API Server" "Dev Client" "Vite Dev" "PostgreSQL" "Redis")
    
    for i in "${!ports[@]}"; do
        port=${ports[$i]}
        name=${port_names[$i]}
        
        if lsof -Pi :$port -sTCP:LISTEN -t &> /dev/null; then
            log_warning "Port $port ($name) is in use"
            # Show what's using the port
            if command -v lsof &> /dev/null; then
                process=$(lsof -Pi :$port -sTCP:LISTEN | grep -v COMMAND | awk '{print $1}' | head -1)
                log_info "Process using port $port: $process"
            fi
        else
            log_success "Port $port ($name) is available"
        fi
    done
    
    return $issues
}

# Check file permissions
check_permissions() {
    log_check "Checking file permissions..."
    
    local issues=0
    
    # Check if scripts are executable
    scripts=("scripts/startup.sh" "scripts/setup-all.sh" "scripts/setup-postgres.sh")
    for script in "${scripts[@]}"; do
        if [ -f "$script" ]; then
            if [ -x "$script" ]; then
                log_success "$script is executable"
            else
                log_warning "$script is not executable"
                log_info "Run: chmod +x $script"
                ((issues++))
            fi
        else
            log_warning "$script not found"
        fi
    done
    
    # Check maibarn directory permissions
    if [ -d "var/maibarn" ]; then
        if [ -w "var/maibarn" ]; then
            log_success "var/maibarn directory is writable"
        else
            log_error "var/maibarn directory is not writable"
            log_info "Try: sudo chown -R $(whoami) var/maibarn"
            ((issues++))
        fi
    else
        log_warning "var/maibarn directory not found"
        log_info "Try running: npm run setup:all"
    fi
    
    return $issues
}

# Auto-fix common issues
auto_fix() {
    log_check "Attempting to auto-fix common issues..."
    
    # Fix executable permissions
    if [ -f "scripts/startup.sh" ] && [ ! -x "scripts/startup.sh" ]; then
        chmod +x scripts/startup.sh
        log_success "Fixed permissions for startup.sh"
    fi
    
    if [ -f "scripts/setup-all.sh" ] && [ ! -x "scripts/setup-all.sh" ]; then
        chmod +x scripts/setup-all.sh
        log_success "Fixed permissions for setup-all.sh"
    fi
    
    if [ -f "scripts/setup-postgres.sh" ] && [ ! -x "scripts/setup-postgres.sh" ]; then
        chmod +x scripts/setup-postgres.sh
        log_success "Fixed permissions for setup-postgres.sh"
    fi
    
    # Create missing directories
    dirs=("var/maibarn/coordination" "var/maibarn/harvests/active" "var/maibarn/harvests/completed" "var/maibarn/logs" "coverage")
    for dir in "${dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            mkdir -p "$dir"
            log_success "Created directory: $dir"
        fi
    done
    
    # Install dependencies if missing
    if [ ! -d "node_modules" ]; then
        log_info "Installing Node.js dependencies..."
        npm install
        log_success "Node.js dependencies installed"
    fi
}

# Show recommendations
show_recommendations() {
    echo ""
    echo -e "${CYAN}${BOLD}Recommendations:${NC}"
    echo "================"
    
    echo -e "${YELLOW}Development:${NC}"
    echo "  • Use 'npm run start' for development with auto-reload"
    echo "  • Run 'npm test' regularly to catch issues early"
    echo "  • Use 'npm run typecheck' to verify TypeScript"
    
    echo -e "${YELLOW}Database:${NC}"
    echo "  • Keep PostgreSQL running during development"
    echo "  • Use Redis for better caching performance"
    echo "  • Backup your database before major changes"
    
    echo -e "${YELLOW}Troubleshooting:${NC}"
    echo "  • Run 'npm run setup:clean' to reset everything"
    echo "  • Use 'npm run setup:doctor' when issues arise"
    echo "  • Check logs in the 'logs' directory"
    
    echo ""
}

# Main diagnostic function
main() {
    local total_issues=0
    
    check_system_requirements
    total_issues=$((total_issues + $?))
    
    check_databases
    total_issues=$((total_issues + $?))
    
    check_project_dependencies
    total_issues=$((total_issues + $?))
    
    check_environment
    total_issues=$((total_issues + $?))
    
    check_ports
    total_issues=$((total_issues + $?))
    
    check_permissions
    total_issues=$((total_issues + $?))
    
    echo ""
    if [ $total_issues -eq 0 ]; then
        log_success "No issues found! Your setup looks good."
    else
        log_warning "Found $total_issues issue(s). Attempting auto-fix..."
        auto_fix
        echo ""
        log_info "If issues persist, try running 'npm run setup:all' for a complete reset."
    fi
    
    show_recommendations
}

# Handle --fix option
if [ "$1" = "--fix" ]; then
    auto_fix
    exit 0
fi

main "$@"
