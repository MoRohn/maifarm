#!/bin/bash

# MaiFarm Clean Setup Script
# This script cleans and resets the entire development environment

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
echo "🧹 MaiFarm Clean Setup"
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

log_step() {
    echo -e "${CYAN}${BOLD}[STEP]${NC} $1"
}

# Confirm destructive action
confirm_clean() {
    echo -e "${YELLOW}${BOLD}WARNING:${NC} This will remove:"
    echo "  • node_modules directory"
    echo "  • package-lock.json"
    echo "  • All build artifacts"
    echo "  • All cached files"
    echo "  • All log files"
    echo "  • Test coverage reports"
    echo ""
    echo -e "${RED}This action cannot be undone!${NC}"
    echo ""
    
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Clean setup cancelled by user"
        exit 0
    fi
}

# Stop all running processes
stop_processes() {
    log_step "Stopping all running processes..."
    
    # Kill MaiFarm processes
    pkill -f "tsx.*server/index.ts" || true
    pkill -f "vite" || true
    pkill -f "node.*server" || true
    
    # Wait for processes to stop
    sleep 2
    
    log_success "Processes stopped"
}

# Clean Node.js dependencies
clean_node_deps() {
    log_step "Cleaning Node.js dependencies..."
    
    # Remove node_modules
    if [ -d "node_modules" ]; then
        rm -rf node_modules
        log_success "Removed node_modules"
    fi
    
    # Remove package-lock.json
    if [ -f "package-lock.json" ]; then
        rm -f package-lock.json
        log_success "Removed package-lock.json"
    fi
    
    # Clear npm cache
    npm cache clean --force
    log_success "Cleared npm cache"
}

# Clean build artifacts
clean_build_artifacts() {
    log_step "Cleaning build artifacts..."
    
    # Remove dist directory
    if [ -d "dist" ]; then
        rm -rf dist
        log_success "Removed dist directory"
    fi
    
    # Remove build directory
    if [ -d "build" ]; then
        rm -rf build
        log_success "Removed build directory"
    fi
    
    # Clear Vite cache
    if [ -d "node_modules/.vite" ]; then
        rm -rf node_modules/.vite
        log_success "Cleared Vite cache"
    fi
    
    # Remove TypeScript build info
    if [ -f "tsconfig.tsbuildinfo" ]; then
        rm -f tsconfig.tsbuildinfo
        log_success "Removed TypeScript build info"
    fi
}

# Clean logs and reports
clean_logs_reports() {
    log_step "Cleaning logs and reports..."
    
    # Clean logs directory but keep the directory structure
    if [ -d "logs" ]; then
        rm -rf logs/*
        log_success "Cleared logs directory"
    fi
    
    # Clean coverage reports
    if [ -d "coverage" ]; then
        rm -rf coverage
        log_success "Removed coverage directory"
    fi
    
    # Clean test reports
    if [ -d "reports" ]; then
        rm -rf reports
        log_success "Removed reports directory"
    fi
    
    # Clean Cypress artifacts
    if [ -d "cypress/screenshots" ]; then
        rm -rf cypress/screenshots
        log_success "Removed Cypress screenshots"
    fi
    
    if [ -d "cypress/videos" ]; then
        rm -rf cypress/videos
        log_success "Removed Cypress videos"
    fi
}

# Clean temporary files
clean_temp_files() {
    log_step "Cleaning temporary files..."
    
    # Remove editor temp files
    find . -name "*.tmp" -type f -delete 2>/dev/null || true
    find . -name "*.temp" -type f -delete 2>/dev/null || true
    find . -name ".DS_Store" -type f -delete 2>/dev/null || true
    
    # Remove backup files
    find . -name "*.bak" -type f -delete 2>/dev/null || true
    find . -name "*~" -type f -delete 2>/dev/null || true
    
    log_success "Removed temporary files"
}

# Reset environment files
reset_env_files() {
    log_step "Resetting environment files..."
    
    # Backup existing .env.development
    if [ -f ".env.development" ]; then
        cp .env.development .env.development.backup
        log_info "Backed up .env.development to .env.development.backup"
        rm -f .env.development
    fi
    
    log_success "Environment files reset"
}

# Clean database (optional)
clean_database_optional() {
    echo ""
    read -p "Do you want to reset the database as well? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_step "Resetting database..."
        
        # Drop and recreate database
        if command -v psql &> /dev/null; then
            dropdb maifarm_dev --if-exists 2>/dev/null || true
            log_success "Dropped existing database"
        fi
        
        log_info "Database will be recreated during next setup"
    else
        log_info "Database left unchanged"
    fi
}

# Reinstall everything
reinstall_everything() {
    log_step "Reinstalling dependencies..."
    
    # Install Node.js dependencies
    npm install
    log_success "Node.js dependencies installed"
    
    # Run setup
    log_info "Running complete setup..."
    if [ -x "scripts/setup-all.sh" ]; then
        ./scripts/setup-all.sh
    else
        log_warning "Setup script not found or not executable"
        log_info "You may need to run setup manually"
    fi
}

# Main function
main() {
    confirm_clean
    
    stop_processes
    clean_node_deps
    clean_build_artifacts
    clean_logs_reports
    clean_temp_files
    reset_env_files
    clean_database_optional
    
    echo ""
    read -p "Do you want to reinstall everything now? (Y/n): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        reinstall_everything
        
        echo ""
        log_success "Clean setup completed successfully!"
        echo ""
        echo -e "${CYAN}Next steps:${NC}"
        echo "  1. npm run start - Start development server"
        echo "  2. npm test - Run tests"
        echo "  3. npm run setup:doctor - Verify everything is working"
    else
        echo ""
        log_success "Clean completed. Run 'npm run setup:all' when ready to reinstall."
    fi
}

main "$@"