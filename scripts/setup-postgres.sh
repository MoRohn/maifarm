#!/bin/bash

# PostgreSQL Auto-Setup Script for MaiFarm
# This script automatically detects, installs, and configures PostgreSQL for development

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_NAME=${DB_NAME:-"maifarm_dev"}
DB_USER=${DB_USER:-"maifarm"}
DB_PASSWORD=${DB_PASSWORD:-"maifarm123"}
POSTGRES_VERSION=${POSTGRES_VERSION:-"15"}

echo -e "${BLUE}🐘 MaiFarm PostgreSQL Auto-Setup${NC}"
echo "=================================="

# Setup PostgreSQL PATH for macOS (same as startup.sh)
if [[ "$OSTYPE" == "darwin"* ]]; then
    postgres_paths=(
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

# Check if PostgreSQL is installed
check_postgres_installed() {
    if command -v psql &> /dev/null; then
        POSTGRES_INSTALLED=true
        POSTGRES_VERSION_INSTALLED=$(psql --version | grep -oE '[0-9]+\.[0-9]+' | head -1)
        log_info "PostgreSQL $POSTGRES_VERSION_INSTALLED is already installed"
    else
        POSTGRES_INSTALLED=false
        log_info "PostgreSQL is not installed"
    fi
}

# Check if PostgreSQL service is running
check_postgres_running() {
    if pg_isready &> /dev/null; then
        POSTGRES_RUNNING=true
        log_success "PostgreSQL service is running"
    else
        POSTGRES_RUNNING=false
        log_warning "PostgreSQL service is not running"
    fi
}

# Install PostgreSQL on macOS using Homebrew
install_postgres_macos() {
    log_info "Installing PostgreSQL $POSTGRES_VERSION using Homebrew..."
    
    # Check if Homebrew is installed
    if ! command -v brew &> /dev/null; then
        log_error "Homebrew is required but not installed. Please install it first:"
        log_error "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        exit 1
    fi
    
    # Install PostgreSQL
    brew install postgresql@$POSTGRES_VERSION
    
    # Add to PATH if not already there
    if ! echo $PATH | grep -q "/opt/homebrew/bin\|/usr/local/bin"; then
        echo 'export PATH="/opt/homebrew/bin:$PATH"' >> ~/.zshrc
        echo 'export PATH="/opt/homebrew/bin:$PATH"' >> ~/.bash_profile
        export PATH="/opt/homebrew/bin:$PATH"
    fi
    
    log_success "PostgreSQL $POSTGRES_VERSION installed successfully"
}

# Install PostgreSQL on Linux
install_postgres_linux() {
    log_info "Installing PostgreSQL $POSTGRES_VERSION on Linux..."
    
    # Detect Linux distribution
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO=$ID
    else
        log_error "Cannot detect Linux distribution"
        exit 1
    fi
    
    case $DISTRO in
        ubuntu|debian)
            sudo apt update
            sudo apt install -y postgresql postgresql-contrib
            ;;
        centos|rhel|fedora)
            sudo yum install -y postgresql postgresql-server postgresql-contrib
            # Initialize database on CentOS/RHEL
            sudo postgresql-setup initdb
            ;;
        *)
            log_error "Unsupported Linux distribution: $DISTRO"
            exit 1
            ;;
    esac
    
    log_success "PostgreSQL installed successfully"
}

# Start PostgreSQL service
start_postgres_service() {
    log_info "Starting PostgreSQL service..."
    
    case $OS in
        macos)
            brew services start postgresql@$POSTGRES_VERSION
            ;;
        linux)
            if command -v systemctl &> /dev/null; then
                sudo systemctl start postgresql
                sudo systemctl enable postgresql
            else
                sudo service postgresql start
            fi
            ;;
    esac
    
    # Wait for PostgreSQL to be ready
    log_info "Waiting for PostgreSQL to be ready..."
    for i in {1..30}; do
        if pg_isready &> /dev/null; then
            log_success "PostgreSQL service is ready"
            return 0
        fi
        sleep 1
    done
    
    log_error "PostgreSQL failed to start within 30 seconds"
    exit 1
}

# Create database user and database
setup_database() {
    log_info "Setting up MaiFarm database and user..."
    
    # Determine the superuser to use (current user or postgres)
    local SUPERUSER="$USER"
    if ! psql -U "$SUPERUSER" postgres -c "SELECT 1" &> /dev/null; then
        SUPERUSER="postgres"
        if ! psql -U "$SUPERUSER" postgres -c "SELECT 1" &> /dev/null; then
            log_error "Cannot connect to PostgreSQL. Please ensure it's properly installed and you have permissions."
            exit 1
        fi
    fi
    
    # Create user if it doesn't exist
    if ! psql -U "$SUPERUSER" postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
        log_info "Creating user '$DB_USER'..."
        psql -U "$SUPERUSER" postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
        psql -U "$SUPERUSER" postgres -c "ALTER USER $DB_USER CREATEDB;"
        log_success "User '$DB_USER' created"
    else
        log_info "User '$DB_USER' already exists"
    fi
    
    # Create database if it doesn't exist
    if ! psql -U "$SUPERUSER" postgres -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
        log_info "Creating database '$DB_NAME'..."
        createdb -U "$SUPERUSER" -O $DB_USER $DB_NAME
        log_success "Database '$DB_NAME' created"
    else
        log_info "Database '$DB_NAME' already exists"
    fi
    
    # Grant all privileges on database to user
    psql -U "$SUPERUSER" postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" &> /dev/null
    
    # Test connection
    if PGPASSWORD=$DB_PASSWORD psql -h localhost -U $DB_USER -d $DB_NAME -c "SELECT version();" &> /dev/null; then
        log_success "Database connection test successful"
    else
        log_error "Database connection test failed"
        exit 1
    fi
}

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    local migration_dir="server/database/migrations"
    
    if [ ! -d "$migration_dir" ]; then
        log_warning "Migration directory not found: $migration_dir"
        return 1
    fi
    
    # Create migrations table if not exists
    PGPASSWORD=$DB_PASSWORD psql -h localhost -U $DB_USER -d $DB_NAME <<EOF 2>/dev/null
CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) UNIQUE NOT NULL,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
EOF
    
    # Count migrations
    local total_migrations=$(ls -1 "$migration_dir"/*.sql 2>/dev/null | wc -l)
    local applied_migrations=0
    
    # Run each migration file in order
    for migration_file in "$migration_dir"/*.sql; do
        if [ -f "$migration_file" ]; then
            local filename=$(basename "$migration_file")
            
            # Check if migration was already executed
            local already_run=$(PGPASSWORD=$DB_PASSWORD psql -h localhost -U $DB_USER -d $DB_NAME -tAc "SELECT 1 FROM migrations WHERE filename='$filename'" 2>/dev/null)
            
            if [ "$already_run" != "1" ]; then
                log_info "Applying migration: $filename"
                
                if PGPASSWORD=$DB_PASSWORD psql -h localhost -U $DB_USER -d $DB_NAME -f "$migration_file" &>/dev/null; then
                    # Record successful migration
                    PGPASSWORD=$DB_PASSWORD psql -h localhost -U $DB_USER -d $DB_NAME -c "INSERT INTO migrations (filename) VALUES ('$filename')" 2>/dev/null
                    log_success "Applied: $filename"
                    applied_migrations=$((applied_migrations + 1))
                else
                    log_warning "Skipped (may already exist): $filename"
                fi
            fi
        fi
    done
    
    if [ $applied_migrations -gt 0 ]; then
        log_success "Applied $applied_migrations new migrations"
    else
        log_info "All migrations already up to date"
    fi
}

# Create or update environment file
setup_env_file() {
    log_info "Setting up environment configuration..."
    
    ENV_FILE=".env.development"
    
    # Create .env.development if it doesn't exist
    if [ ! -f "$ENV_FILE" ]; then
        log_info "Creating $ENV_FILE from .env.example..."
        cp .env.example "$ENV_FILE"
    fi
    
    # Update database configuration
    log_info "Updating database configuration in $ENV_FILE..."
    
    # Use sed to update or add database configuration
    update_env_var() {
        local key=$1
        local value=$2
        local file=$3
        
        if grep -q "^${key}=" "$file"; then
            # Update existing line
            sed -i.bak "s|^${key}=.*|${key}=${value}|" "$file"
        else
            # Add new line
            echo "${key}=${value}" >> "$file"
        fi
    }
    
    update_env_var "DB_HOST" "localhost" "$ENV_FILE"
    update_env_var "DB_PORT" "5432" "$ENV_FILE"
    update_env_var "DB_NAME" "$DB_NAME" "$ENV_FILE"
    update_env_var "DB_USER" "$DB_USER" "$ENV_FILE"
    update_env_var "DB_PASSWORD" "$DB_PASSWORD" "$ENV_FILE"
    
    # Remove backup file created by sed
    rm -f "${ENV_FILE}.bak"
    
    log_success "Environment configuration updated"
}

# Main setup function
main() {
    echo ""
    log_info "Starting PostgreSQL setup process..."
    
    detect_os
    check_postgres_installed
    
    # Install PostgreSQL if not installed
    if [ "$POSTGRES_INSTALLED" = false ]; then
        case $OS in
            macos)
                install_postgres_macos
                ;;
            linux)
                install_postgres_linux
                ;;
        esac
    fi
    
    # Check if service is running and start if needed
    check_postgres_running
    if [ "$POSTGRES_RUNNING" = false ]; then
        start_postgres_service
    fi
    
    # Setup database and user
    setup_database
    
    # Setup environment file
    setup_env_file
    
    # Run migrations
    run_migrations
    
    echo ""
    log_success "PostgreSQL setup completed successfully!"
    echo ""
    echo -e "${GREEN}Database Configuration:${NC}"
    echo "  Host: localhost"
    echo "  Port: 5432"
    echo "  Database: $DB_NAME"
    echo "  Username: $DB_USER"
    echo "  Password: $DB_PASSWORD"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "  1. Run 'npm run start' to launch MaiFarm"
    echo "  2. The application will automatically run database migrations"
    echo ""
    echo -e "${YELLOW}Useful commands:${NC}"
    echo "  - Connect to database: PGPASSWORD=$DB_PASSWORD psql -h localhost -U $DB_USER -d $DB_NAME"
    echo "  - Check service status: pg_isready"
    echo "  - Stop service: brew services stop postgresql@$POSTGRES_VERSION (macOS)"
    echo ""
}

# Handle script interruption
trap 'log_error "Setup interrupted by user"; exit 1' INT TERM

# Run main function
main "$@"