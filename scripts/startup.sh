#!/bin/bash

# MaiFarm Enhanced Startup Script
# Automatically handles setup verification and dependency checks

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

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

# Setup PostgreSQL PATH for macOS
setup_postgres_path() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # Add Homebrew PostgreSQL to PATH if installed
        local postgres_paths=(
            "/opt/homebrew/Cellar/postgresql@15/*/bin"
            "/usr/local/opt/postgresql@15/bin"
            "/opt/homebrew/bin"
            "/usr/local/bin"
        )
        
        for path_pattern in "${postgres_paths[@]}"; do
            # Use glob expansion to find actual paths
            for actual_path in $path_pattern; do
                if [[ -d "$actual_path" ]] && [[ -x "$actual_path/psql" ]]; then
                    if [[ ":$PATH:" != *":$actual_path:"* ]]; then
                        export PATH="$actual_path:$PATH"
                        break 2  # Break out of both loops
                    fi
                fi
            done
        done
    fi
}

echo -e "${CYAN}${BOLD}🌱 MaiFarm Startup${NC}"
echo "=================="

# Setup PostgreSQL PATH before any checks
setup_postgres_path

# Ensure PostgreSQL is running before anything else
ensure_postgres_running() {
    log_info "Checking PostgreSQL status..."
    
    if ! pg_isready &> /dev/null; then
        log_warning "PostgreSQL is not running. Attempting to start..."
        
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # Try to start PostgreSQL on macOS
            if command -v brew &> /dev/null; then
                brew services start postgresql@15 2>/dev/null || brew services start postgresql@14 2>/dev/null
                
                # Wait for PostgreSQL to start
                local retries=10
                while [ $retries -gt 0 ]; do
                    if pg_isready &> /dev/null; then
                        log_success "PostgreSQL started successfully"
                        break
                    fi
                    sleep 1
                    retries=$((retries - 1))
                done
                
                if [ $retries -eq 0 ]; then
                    log_error "PostgreSQL failed to start"
                    log_info "Please run: ./scripts/setup-postgres.sh"
                    exit 1
                fi
            fi
        else
            log_error "PostgreSQL is not running. Please start it manually or run:"
            log_info "  ./scripts/setup-postgres.sh"
            exit 1
        fi
    else
        log_success "PostgreSQL is running"
    fi
    
    # Quick database connectivity check
    if PGPASSWORD="${DB_PASSWORD:-maifarm123}" psql -h localhost -U "${DB_USER:-maifarm}" -d "${DB_NAME:-maifarm_dev}" -c "SELECT 1" &> /dev/null; then
        log_success "Database connection verified"
    else
        log_warning "Database not accessible. Running setup..."
        ./scripts/setup-postgres.sh
    fi
}

# Ensure PostgreSQL is running
ensure_postgres_running

# Check if this is first run or setup is needed
check_setup_needed() {
    local needs_setup=false
    
    # Check if dependencies are installed
    if [ ! -d "node_modules" ]; then
        log_warning "Node.js dependencies not found"
        needs_setup=true
    fi
    
    # Check if PostgreSQL is accessible and properly configured
    if ! pg_isready &> /dev/null; then
        log_warning "PostgreSQL not running or not accessible"
        needs_setup=true
    else
        # Check if database exists and is accessible
        if ! PGPASSWORD="${DB_PASSWORD:-maifarm123}" psql -h localhost -U "${DB_USER:-maifarm}" -d "${DB_NAME:-maifarm_dev}" -c "SELECT 1" &> /dev/null; then
            log_warning "Database not accessible or not configured"
            needs_setup=true
        fi
    fi
    
    # Check if environment is configured
    if [ ! -f ".env.development" ]; then
        log_warning "Environment configuration missing"
        needs_setup=true
    fi
    
    if [ "$needs_setup" = true ]; then
        echo ""
        log_info "Setup verification recommended..."
        read -p "Would you like to run automatic setup? (Y/n): " -n 1 -r
        echo
        
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            log_info "Running automatic setup..."
            if [ -x "./scripts/setup-all.sh" ]; then
                ./scripts/setup-all.sh
            else
                log_error "Setup script not found. Please run: npm run setup:all"
                exit 1
            fi
        else
            log_warning "Continuing without setup verification..."
        fi
    fi
}

# Run setup check
check_setup_needed

# Kill any existing processes
log_info "Stopping any existing processes..."
pkill -f "tsx.*apps/api/src/index.ts" || true
pkill -f "vite" || true
sleep 2

# Start the server
log_info "Starting MaiFarm server on port 4567..."
NODE_ENV=development BYPASS_AUTH=true PORT=4567 npx tsx apps/api/src/index.ts &
SERVER_PID=$!

# Wait for server to be ready
log_info "Waiting for server to start..."
for i in {1..30}; do
  if curl -s http://localhost:4567/health > /dev/null 2>&1; then
    log_success "Server is ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    log_error "Server failed to start in time"
    log_error "Try running: npm run setup:doctor"
    exit 1
  fi
  sleep 1
done

# Start the client
log_info "Starting Vite development server on port 3000..."
npx vite --config apps/dashboard/vite.config.ts &
CLIENT_PID=$!

echo ""
log_success "✨ MaiFarm is running!"
echo -e "${CYAN}   Client: http://localhost:3000${NC}"
echo -e "${CYAN}   Server: http://localhost:4567${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop both servers${NC}"

# Function to handle cleanup
cleanup() {
  echo ""
  log_info "Stopping servers..."
  kill $SERVER_PID 2>/dev/null || true
  kill $CLIENT_PID 2>/dev/null || true
  pkill -f "tsx.*apps/api/src/index.ts" || true
  pkill -f "vite" || true
  log_success "Servers stopped."
  exit 0
}

# Set up trap to handle Ctrl+C
trap cleanup INT TERM

# Wait for either process to exit
wait $SERVER_PID $CLIENT_PID
