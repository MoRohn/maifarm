#!/bin/bash

# MaiFarm Database Migration Script
# This script applies the consolidated migrations in the correct order

set -e  # Exit on error

# Configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-maifarm_dev}"
DB_USER="${DB_USER:-maifarm}"
DB_PASSWORD="${DB_PASSWORD:-maifarm123}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if a table exists
table_exists() {
    local table=$1
    local result=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table');")
    [[ "$result" == "t" ]]
}

# Function to run a migration
run_migration() {
    local migration_file=$1
    local migration_name=$(basename $migration_file .sql)
    
    print_info "Applying migration: $migration_name"
    
    if PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$migration_file" > /dev/null 2>&1; then
        print_info "✓ $migration_name applied successfully"
        return 0
    else
        print_error "✗ Failed to apply $migration_name"
        return 1
    fi
}

# Function to check database connection
check_connection() {
    print_info "Checking database connection..."
    if PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "\q" 2>/dev/null; then
        print_info "✓ Database connection successful"
        return 0
    else
        print_error "✗ Cannot connect to database"
        print_error "Please check your database credentials and ensure PostgreSQL is running"
        return 1
    fi
}

# Function to create backup
create_backup() {
    local backup_file="backup_$(date +%Y%m%d_%H%M%S).sql"
    print_info "Creating backup: $backup_file"
    
    if PGPASSWORD=$DB_PASSWORD pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME > "$backup_file" 2>/dev/null; then
        print_info "✓ Backup created successfully: $backup_file"
        echo "$backup_file"  # Return the backup filename
    else
        print_error "✗ Failed to create backup"
        return 1
    fi
}

# Function to detect migration status
detect_migration_status() {
    print_info "Detecting current migration status..."
    
    local status="fresh"
    
    # Check for core tables
    if table_exists "users"; then
        status="partial"
        print_info "Found existing users table"
    fi
    
    if table_exists "farms"; then
        print_info "Found existing farms table"
    fi
    
    if table_exists "agents"; then
        print_info "Found existing agents table"
    fi
    
    # Check for newer tables to determine how far migrations have progressed
    if table_exists "cluster_nodes"; then
        status="complete"
        print_info "Found cluster_nodes table - migrations appear complete"
    elif table_exists "api_keys"; then
        status="security_done"
        print_info "Found api_keys table - security migrations applied"
    elif table_exists "harvests"; then
        status="harvest_done"
        print_info "Found harvests table - harvest migrations applied"
    elif table_exists "metrics"; then
        status="monitoring_done"
        print_info "Found metrics table - monitoring migrations applied"
    fi
    
    echo "$status"
}

# Main execution
main() {
    echo "====================================="
    echo "MaiFarm Database Migration Tool"
    echo "====================================="
    echo ""
    
    # Check connection
    if ! check_connection; then
        exit 1
    fi
    
    # Detect current status
    MIGRATION_STATUS=$(detect_migration_status)
    echo ""
    print_info "Migration status: $MIGRATION_STATUS"
    echo ""
    
    # Ask user what to do
    if [[ "$MIGRATION_STATUS" != "fresh" ]]; then
        print_warning "Existing database detected!"
        echo "Options:"
        echo "  1) Apply ALL migrations (will use IF NOT EXISTS)"
        echo "  2) Apply only missing migrations"
        echo "  3) Backup and exit"
        echo "  4) Exit without changes"
        read -p "Choose option (1-4): " OPTION
        
        case $OPTION in
            1)
                print_info "Applying all migrations with IF NOT EXISTS..."
                ;;
            2)
                print_info "Applying only missing migrations..."
                ;;
            3)
                create_backup
                print_info "Backup created. Exiting."
                exit 0
                ;;
            4)
                print_info "Exiting without changes."
                exit 0
                ;;
            *)
                print_error "Invalid option"
                exit 1
                ;;
        esac
    else
        print_info "Fresh database detected. Applying all migrations..."
        OPTION=1
    fi
    
    # Create backup if existing database
    if [[ "$MIGRATION_STATUS" != "fresh" ]]; then
        BACKUP_FILE=$(create_backup)
        if [[ $? -ne 0 ]]; then
            print_error "Failed to create backup. Aborting."
            exit 1
        fi
    fi
    
    echo ""
    print_info "Starting migration process..."
    echo ""
    
    # Apply migrations based on option
    MIGRATION_DIR="$(dirname "$0")"
    
    if [[ "$OPTION" == "1" ]]; then
        # Apply all migrations
        run_migration "$MIGRATION_DIR/001_core_schema.sql"
        run_migration "$MIGRATION_DIR/002_monitoring_analytics.sql"
        run_migration "$MIGRATION_DIR/003_harvest_workflow.sql"
        run_migration "$MIGRATION_DIR/004_security_api.sql"
        run_migration "$MIGRATION_DIR/005_cluster_providers.sql"
    elif [[ "$OPTION" == "2" ]]; then
        # Apply only missing migrations
        case $MIGRATION_STATUS in
            "partial")
                run_migration "$MIGRATION_DIR/002_monitoring_analytics.sql"
                run_migration "$MIGRATION_DIR/003_harvest_workflow.sql"
                run_migration "$MIGRATION_DIR/004_security_api.sql"
                run_migration "$MIGRATION_DIR/005_cluster_providers.sql"
                ;;
            "monitoring_done")
                run_migration "$MIGRATION_DIR/003_harvest_workflow.sql"
                run_migration "$MIGRATION_DIR/004_security_api.sql"
                run_migration "$MIGRATION_DIR/005_cluster_providers.sql"
                ;;
            "harvest_done")
                run_migration "$MIGRATION_DIR/004_security_api.sql"
                run_migration "$MIGRATION_DIR/005_cluster_providers.sql"
                ;;
            "security_done")
                run_migration "$MIGRATION_DIR/005_cluster_providers.sql"
                ;;
            "complete")
                print_info "All migrations already applied!"
                ;;
        esac
    fi
    
    echo ""
    print_info "Migration process complete!"
    echo ""
    
    # Verify final state
    print_info "Verifying database state..."
    TABLE_COUNT=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
    print_info "Total tables in database: $TABLE_COUNT"
    
    echo ""
    print_info "✓ Database migration successful!"
    
    if [[ -n "$BACKUP_FILE" ]]; then
        echo ""
        print_info "Backup saved as: $BACKUP_FILE"
        print_info "To restore from backup if needed:"
        echo "  psql -U $DB_USER -d $DB_NAME < $BACKUP_FILE"
    fi
}

# Run main function
main "$@"