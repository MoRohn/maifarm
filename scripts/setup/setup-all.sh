#!/bin/bash

# MaiFarm Complete Auto-Setup Script
# This script automatically sets up all dependencies for MaiFarm development

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration
POSTGRES_VERSION=${POSTGRES_VERSION:-"15"}
REDIS_VERSION=${REDIS_VERSION:-"7"}
NODE_VERSION=${NODE_VERSION:-"18"}

echo -e "${CYAN}${BOLD}"
echo "🌱 MaiFarm Complete Auto-Setup"
echo "=============================="
echo -e "${NC}"

# Function to print colored output
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

# Detect the operating system
detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        log_info "Detected macOS"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
        log_info "Detected Linux"
    else
        log_error "Unsupported operating system: $OSTYPE"
        exit 1
    fi
}

# Check if command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Check Node.js version
check_node() {
    log_step "Checking Node.js installation..."
    
    if command_exists node; then
        NODE_VERSION_INSTALLED=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        log_info "Node.js v$(node --version | cut -d'v' -f2) is installed"
        
        if [ "$NODE_VERSION_INSTALLED" -lt "$NODE_VERSION" ]; then
            log_warning "Node.js version is below recommended v$NODE_VERSION"
            log_info "Consider upgrading Node.js for better performance"
        fi
    else
        log_error "Node.js is not installed. Please install Node.js v$NODE_VERSION or higher"
        log_error "Visit: https://nodejs.org/"
        exit 1
    fi
}

# Install package manager dependencies (Homebrew for macOS)
setup_package_manager() {
    case $OS in
        macos)
            log_step "Setting up Homebrew..."
            if ! command_exists brew; then
                log_info "Installing Homebrew..."
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
                
                # Add to PATH
                echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
                eval "$(/opt/homebrew/bin/brew shellenv)"
                
                log_success "Homebrew installed successfully"
            else
                log_info "Homebrew is already installed"
                brew update
            fi
            ;;
        linux)
            log_step "Updating package manager..."
            if command_exists apt; then
                sudo apt update
            elif command_exists yum; then
                sudo yum update -y
            elif command_exists pacman; then
                sudo pacman -Syu
            fi
            ;;
    esac
}

# Setup PostgreSQL
setup_postgresql() {
    log_step "Setting up PostgreSQL..."
    
    if command_exists psql; then
        POSTGRES_VERSION_INSTALLED=$(psql --version | grep -oE '[0-9]+\.[0-9]+' | head -1)
        log_info "PostgreSQL $POSTGRES_VERSION_INSTALLED is already installed"
        
        # Check if running
        if pg_isready &> /dev/null; then
            log_success "PostgreSQL service is running"
        else
            log_info "Starting PostgreSQL service..."
            case $OS in
                macos)
                    brew services start postgresql@$POSTGRES_VERSION
                    ;;
                linux)
                    sudo systemctl start postgresql
                    ;;
            esac
        fi
    else
        log_info "Installing PostgreSQL $POSTGRES_VERSION..."
        case $OS in
            macos)
                brew install postgresql@$POSTGRES_VERSION
                brew services start postgresql@$POSTGRES_VERSION
                ;;
            linux)
                if command_exists apt; then
                    sudo apt install -y postgresql postgresql-contrib
                    sudo systemctl start postgresql
                    sudo systemctl enable postgresql
                elif command_exists yum; then
                    sudo yum install -y postgresql postgresql-server postgresql-contrib
                    sudo postgresql-setup initdb
                    sudo systemctl start postgresql
                    sudo systemctl enable postgresql
                fi
                ;;
        esac
        
        log_success "PostgreSQL installed and started"
    fi
    
    # Run database setup
    log_info "Running PostgreSQL database setup..."
    if [ -f "./scripts/setup/setup-postgres.sh" ]; then
        ./scripts/setup/setup-postgres.sh
    else
        log_warning "PostgreSQL setup script not found, skipping database configuration"
    fi
}

# Setup Redis
setup_redis() {
    log_step "Setting up Redis..."
    
    if command_exists redis-server; then
        log_info "Redis is already installed"
        
        # Check if running
        if redis-cli ping &> /dev/null; then
            log_success "Redis service is running"
        else
            log_info "Starting Redis service..."
            case $OS in
                macos)
                    brew services start redis
                    ;;
                linux)
                    sudo systemctl start redis
                    ;;
            esac
        fi
    else
        log_info "Installing Redis..."
        case $OS in
            macos)
                brew install redis
                brew services start redis
                ;;
            linux)
                if command_exists apt; then
                    sudo apt install -y redis-server
                    sudo systemctl start redis
                    sudo systemctl enable redis
                elif command_exists yum; then
                    sudo yum install -y redis
                    sudo systemctl start redis
                    sudo systemctl enable redis
                fi
                ;;
        esac
        
        log_success "Redis installed and started"
    fi
}

# Setup Python dependencies for LLM proxy
setup_python_deps() {
    log_step "Setting up Python dependencies..."
    
    if command_exists poetry; then
        log_info "Poetry detected – installing Python dependencies"
        poetry install --no-root
        log_success "Poetry environment ready"
        return
    fi

    if command_exists python3 && command_exists pip3; then
        PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
        log_info "Python $PYTHON_VERSION is installed (Poetry not found, falling back to pip)"

        if [ -f "requirements.txt" ]; then
            log_info "Installing Python dependencies from requirements.txt..."
            pip3 install -r requirements.txt
            log_success "Python dependencies installed"
        else
            log_warning "requirements.txt not found – skipping pip install"
            log_info "Run 'poetry install' once Poetry is available to set up Python helpers"
        fi
    else
        log_warning "Python3 or pip3 not found. LLM proxy features may not work."
        log_info "Install Python3 from https://python.org or configure Poetry."
    fi
}

# Setup development environment files
setup_env_files() {
    log_step "Setting up environment configuration..."
    
    # Create .env.development from .env.example if it doesn't exist
    if [ ! -f ".env.development" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env.development
            log_success "Created .env.development from template"
        else
            log_warning ".env.example not found, creating basic .env.development"
            cat > .env.development << EOF
# MaiFarm Development Configuration
NODE_ENV=development
PORT=4567
BYPASS_AUTH=true

# Database Configuration (automatically configured by setup)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=maifarm_dev
DB_USER=maifarm
DB_PASSWORD=maifarm123

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# AI Provider Configuration
AI_PROVIDER=claude
CLAUDE_API_KEY=your-claude-api-key-here
QWEN_ENABLED=false

# LLM Proxy Configuration
USE_LLM_PROXY=false
LLM_PROXY_URL=http://localhost:8001

# WebSocket Configuration
WEBSOCKET_PORT=4567
WEBSOCKET_PATH=/socket.io

# Security Configuration
JWT_SECRET=your-jwt-secret-here
SESSION_SECRET=your-session-secret-here

# Monitoring Configuration
PROMETHEUS_ENABLED=false
GRAFANA_ENABLED=false
EOF
        fi
        log_success "Environment configuration created"
    else
        log_info "Environment file .env.development already exists"
    fi
}

# Install Node.js dependencies
install_node_deps() {
    log_step "Installing Node.js dependencies..."
    
    if [ -f "package-lock.json" ]; then
        npm ci
    else
        npm install
    fi
    
    log_success "Node.js dependencies installed"
}

# Run initial database migrations and setup
run_initial_setup() {
    log_step "Running initial application setup..."
    
    # Create necessary directories
    mkdir -p var/maibarn/coordination
    mkdir -p var/maibarn/harvests/active
    mkdir -p var/maibarn/harvests/completed
    mkdir -p var/maibarn/workspaces/active
    mkdir -p var/maibarn/workspaces/archived
    mkdir -p var/maibarn/logs
    mkdir -p var/data/storage/barn/items
    mkdir -p var/data/temp
    mkdir -p logs
    mkdir -p coverage
    mkdir -p reports
    
    log_success "Application directories created"
}

# Setup Docker (optional)
setup_docker_optional() {
    log_step "Checking Docker availability..."

    if command_exists docker; then
        log_info "Docker is available"

        if [ -f "docker-compose.yml" ]; then
            log_info "Docker Compose configuration found"
            log_info "You can use 'npm run docker:up' to run the full stack with Docker"
        fi
    else
        log_info "Docker not found (optional for development)"
        log_info "Install Docker Desktop from: https://docker.com/products/docker-desktop"
    fi
}

# Setup CLI commands
setup_cli_commands() {
    log_step "Installing CLI commands..."

    if [ -f "./install-farm-command.sh" ]; then
        log_info "Running CLI installation script..."
        chmod +x ./install-farm-command.sh
        ./install-farm-command.sh
        log_success "CLI commands installed (farm, fart, konami, secrets)"
    else
        log_warning "CLI installation script not found, skipping"
    fi
}

# Verify setup
verify_setup() {
    log_step "Verifying setup..."
    
    local errors=0
    
    # Check Node.js
    if ! command_exists node; then
        log_error "Node.js not found"
        ((errors++))
    fi
    
    # Check PostgreSQL
    if ! command_exists psql; then
        log_error "PostgreSQL not found"
        ((errors++))
    elif ! pg_isready &> /dev/null; then
        log_warning "PostgreSQL not running"
    fi
    
    # Check Redis
    if ! command_exists redis-server; then
        log_warning "Redis not found (optional but recommended)"
    elif ! redis-cli ping &> /dev/null; then
        log_warning "Redis not running"
    fi
    
    # Check environment file
    if [ ! -f ".env.development" ]; then
        log_error "Environment file .env.development not found"
        ((errors++))
    fi
    
    # Check node_modules
    if [ ! -d "node_modules" ]; then
        log_error "Node.js dependencies not installed"
        ((errors++))
    fi
    
    if [ $errors -eq 0 ]; then
        log_success "Setup verification passed!"
    else
        log_error "Setup verification failed with $errors error(s)"
        return 1
    fi
}

# Show completion message with next steps
show_completion() {
    echo ""
    echo -e "${GREEN}${BOLD}🎉 MaiFarm Setup Complete!${NC}"
    echo "=========================="
    echo ""
    echo -e "${CYAN}Services Status:${NC}"
    
    # PostgreSQL status
    if pg_isready &> /dev/null; then
        echo -e "  ✅ PostgreSQL: ${GREEN}Running${NC}"
    else
        echo -e "  ❌ PostgreSQL: ${RED}Not running${NC}"
    fi
    
    # Redis status
    if redis-cli ping &> /dev/null; then
        echo -e "  ✅ Redis: ${GREEN}Running${NC}"
    else
        echo -e "  ⚠️  Redis: ${YELLOW}Not running (optional)${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}Next Steps:${NC}"
    echo "  1. ${BOLD}npm run start${NC} - Start the development server"
    echo "  2. ${BOLD}npm test${NC} - Run the test suite"
    echo "  3. ${BOLD}npm run typecheck${NC} - Check TypeScript types"
    echo ""
    echo -e "${CYAN}Additional Commands:${NC}"
    echo "  • ${BOLD}npm run docker:up${NC} - Start with Docker"
    echo "  • ${BOLD}npm run setup:clean${NC} - Clean setup and restart"
    echo "  • ${BOLD}npm run setup:verify${NC} - Verify setup"
    echo ""
    echo -e "${CYAN}Configuration Files:${NC}"
    echo "  • .env.development - Environment variables"
    echo "  • package.json - Project configuration"
    echo "  • docker-compose.yml - Docker setup"
    echo ""
    echo -e "${YELLOW}Note:${NC} If you encounter issues, run ${BOLD}npm run setup:doctor${NC} for diagnostics"
    echo ""
}

# Handle script interruption
cleanup_on_interrupt() {
    log_error "Setup interrupted by user"
    exit 1
}

# Main setup function
main() {
    log_step "Starting MaiFarm complete setup..."
    
    detect_os
    check_node
    setup_package_manager
    setup_postgresql
    setup_redis
    setup_python_deps
    setup_env_files
    install_node_deps
    run_initial_setup
    setup_docker_optional
    setup_cli_commands
    
    if verify_setup; then
        show_completion
        return 0
    else
        log_error "Setup completed with issues. Run 'npm run setup:doctor' for help."
        return 1
    fi
}

# Set up trap to handle Ctrl+C
trap cleanup_on_interrupt INT TERM

# Run main function
main "$@"
