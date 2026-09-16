#!/bin/bash

# MaiFarm Backup Restoration Script
# Comprehensive restore solution for disaster recovery

set -euo pipefail

# Configuration
BACKUP_BASE_DIR="${BACKUP_DIR:-/var/backups/maifarm}"
LOG_FILE="${BACKUP_BASE_DIR}/restore.log"

# Database configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-maifarm_prod}"
DB_USER="${DB_USER:-maifarm}"
DB_PASSWORD="${DB_PASSWORD:-}"

# Redis configuration
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    local level=$1
    shift
    local message="$@"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $message" | tee -a "$LOG_FILE"
}

# Error handler
error_handler() {
    local line_no=$1
    log "ERROR" "Restore failed at line $line_no"
    exit 1
}

trap 'error_handler $LINENO' ERR

# List available backups
list_backups() {
    echo -e "${GREEN}Available Backups:${NC}"
    echo "=================="

    # List timestamped backups
    for backup in "$BACKUP_BASE_DIR"/[0-9]*; do
        if [ -d "$backup" ]; then
            local timestamp=$(basename "$backup")
            local size=$(du -sh "$backup" | cut -f1)
            echo "$timestamp - Size: $size"
        fi
    done

    # Show latest link
    if [ -L "$BACKUP_BASE_DIR/latest" ]; then
        local latest=$(readlink "$BACKUP_BASE_DIR/latest")
        echo ""
        echo "Latest backup: $(basename "$latest")"
    fi
}

# Select backup to restore
select_backup() {
    local backup_timestamp="$1"

    if [ -z "$backup_timestamp" ]; then
        list_backups
        echo ""
        read -p "Enter backup timestamp to restore (or 'latest'): " backup_timestamp
    fi

    if [ "$backup_timestamp" = "latest" ]; then
        RESTORE_DIR="$BACKUP_BASE_DIR/latest"
    else
        RESTORE_DIR="$BACKUP_BASE_DIR/$backup_timestamp"
    fi

    if [ ! -d "$RESTORE_DIR" ]; then
        log "ERROR" "Backup directory not found: $RESTORE_DIR"
        exit 1
    fi

    log "INFO" "Selected backup: $RESTORE_DIR"
}

# Verify backup integrity before restore
verify_backup() {
    log "INFO" "Verifying backup integrity..."

    # Check for required backup components
    local required_dirs=("database" "config")

    for dir in "${required_dirs[@]}"; do
        if [ ! -d "$RESTORE_DIR/$dir" ]; then
            log "ERROR" "Required backup directory missing: $dir"
            exit 1
        fi
    done

    # Verify checksums if available
    if find "$RESTORE_DIR" -name "*.sha256" -print -quit | grep -q .; then
        log "INFO" "Verifying checksums..."

        cd "$RESTORE_DIR"
        for checksum_file in $(find . -name "*.sha256"); do
            local file="${checksum_file%.sha256}"
            if [ -f "$file" ]; then
                if sha256sum -c "$checksum_file" > /dev/null 2>&1; then
                    log "INFO" "Checksum verified: $file"
                else
                    log "ERROR" "Checksum verification failed: $file"
                    exit 1
                fi
            fi
        done
        cd - > /dev/null
    fi

    log "INFO" "Backup verification completed"
}

# Confirm restore action
confirm_restore() {
    echo -e "${YELLOW}WARNING: This will restore the following:${NC}"
    echo "- PostgreSQL database: $DB_NAME"
    echo "- Redis data (if available)"
    echo "- Application files (if selected)"
    echo "- Configuration files (if selected)"
    echo ""
    echo -e "${RED}This operation will OVERWRITE existing data!${NC}"
    echo ""
    read -p "Are you sure you want to continue? (yes/NO): " confirm

    if [ "$confirm" != "yes" ]; then
        log "INFO" "Restore cancelled by user"
        exit 0
    fi
}

# Stop application services
stop_services() {
    log "INFO" "Stopping MaiFarm services..."

    # Stop PM2 processes
    if command -v pm2 &> /dev/null; then
        pm2 stop all 2>/dev/null || true
    fi

    # Stop systemd service
    if systemctl is-active --quiet maifarm; then
        sudo systemctl stop maifarm
    fi

    log "INFO" "Services stopped"
}

# Start application services
start_services() {
    log "INFO" "Starting MaiFarm services..."

    # Start systemd service
    if systemctl is-enabled --quiet maifarm; then
        sudo systemctl start maifarm
    fi

    # Start PM2 processes
    if command -v pm2 &> /dev/null; then
        cd /var/www/maifarm
        pm2 start ecosystem.config.js --env production
    fi

    log "INFO" "Services started"
}

# Restore PostgreSQL database
restore_database() {
    log "INFO" "Restoring PostgreSQL database..."

    # Find database backup file
    local db_backup=$(find "$RESTORE_DIR/database" -name "*.sql.gz" -type f | head -1)

    if [ -z "$db_backup" ]; then
        log "ERROR" "No database backup file found"
        return 1
    fi

    log "INFO" "Using backup file: $db_backup"

    # Export password for psql
    export PGPASSWORD="$DB_PASSWORD"

    # Create backup of current database
    log "INFO" "Creating safety backup of current database..."
    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        | gzip > "/tmp/${DB_NAME}_pre_restore_$(date +%Y%m%d_%H%M%S).sql.gz"

    # Drop existing connections
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres <<EOF
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();
EOF

    # Restore database
    gunzip -c "$db_backup" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"

    # Unset password
    unset PGPASSWORD

    log "INFO" "Database restore completed"
}

# Restore Redis data
restore_redis() {
    log "INFO" "Restoring Redis data..."

    # Find Redis backup file
    local redis_backup=$(find "$RESTORE_DIR/redis" -name "*.rdb.gz" -type f | head -1)

    if [ -z "$redis_backup" ]; then
        log "WARNING" "No Redis backup file found, skipping"
        return 0
    fi

    log "INFO" "Using backup file: $redis_backup"

    # Stop Redis
    if systemctl is-active --quiet redis; then
        sudo systemctl stop redis
    fi

    # Backup current Redis data
    if [ -f "/var/lib/redis/dump.rdb" ]; then
        cp /var/lib/redis/dump.rdb "/var/lib/redis/dump.rdb.pre_restore_$(date +%Y%m%d_%H%M%S)"
    fi

    # Restore Redis dump
    gunzip -c "$redis_backup" > /var/lib/redis/dump.rdb
    sudo chown redis:redis /var/lib/redis/dump.rdb

    # Start Redis
    sudo systemctl start redis

    log "INFO" "Redis restore completed"
}

# Restore application files
restore_files() {
    local restore_files="$1"

    if [ "$restore_files" != "yes" ]; then
        log "INFO" "Skipping files restore"
        return 0
    fi

    log "INFO" "Restoring application files..."

    # Find files backup
    local files_backup=$(find "$RESTORE_DIR/files" -name "*.tar.gz" -type f | head -1)

    if [ -z "$files_backup" ]; then
        log "WARNING" "No files backup found, skipping"
        return 0
    fi

    # Create backup of current files
    log "INFO" "Creating safety backup of current files..."
    tar -czf "/tmp/maibarn_pre_restore_$(date +%Y%m%d_%H%M%S).tar.gz" /var/www/maifarm/maibarn 2>/dev/null || true

    # Extract files
    tar -xzf "$files_backup" -C /

    log "INFO" "Files restore completed"
}

# Restore configuration files
restore_config() {
    local restore_config="$1"

    if [ "$restore_config" != "yes" ]; then
        log "INFO" "Skipping configuration restore"
        return 0
    fi

    log "INFO" "Restoring configuration files..."

    # Find config backup
    local config_backup=$(find "$RESTORE_DIR/config" -name "*.tar.gz" -type f | head -1)

    if [ -z "$config_backup" ]; then
        log "WARNING" "No configuration backup found, skipping"
        return 0
    fi

    # Create backup of current configs
    log "INFO" "Creating safety backup of current configuration..."
    local config_safety_backup="/tmp/config_pre_restore_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$config_safety_backup"

    # Copy current configs
    cp /var/www/maifarm/.env.production "$config_safety_backup/" 2>/dev/null || true
    cp /var/www/maifarm/ecosystem.config.js "$config_safety_backup/" 2>/dev/null || true

    # Extract configs to temporary location
    local temp_config="/tmp/restore_config_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$temp_config"
    tar -xzf "$config_backup" -C "$temp_config"

    # Selective restore with prompts
    echo "Found configuration files:"
    find "$temp_config" -type f -name "*" | while read file; do
        echo "- $file"
    done

    read -p "Restore all configuration files? (yes/no): " restore_all

    if [ "$restore_all" = "yes" ]; then
        cp -r "$temp_config"/* /
    else
        log "INFO" "Manual configuration restore required"
    fi

    rm -rf "$temp_config"

    log "INFO" "Configuration restore completed"
}

# Run post-restore tasks
post_restore_tasks() {
    log "INFO" "Running post-restore tasks..."

    # Run database migrations
    cd /var/www/maifarm
    npm run migrate:up || true

    # Clear Redis cache
    if [ -n "$REDIS_PASSWORD" ]; then
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" FLUSHDB
    else
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" FLUSHDB
    fi

    # Rebuild application
    npm run build

    # Fix permissions
    sudo chown -R www-data:www-data /var/www/maifarm

    log "INFO" "Post-restore tasks completed"
}

# Verify restoration
verify_restoration() {
    log "INFO" "Verifying restoration..."

    local errors=0

    # Check database connection
    export PGPASSWORD="$DB_PASSWORD"
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
        log "INFO" "Database connection verified"
    else
        log "ERROR" "Database connection failed"
        ((errors++))
    fi
    unset PGPASSWORD

    # Check Redis
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping > /dev/null 2>&1; then
        log "INFO" "Redis connection verified"
    else
        log "ERROR" "Redis connection failed"
        ((errors++))
    fi

    # Check application health
    sleep 5
    if curl -s http://localhost:4567/health | grep -q "ok"; then
        log "INFO" "Application health check passed"
    else
        log "WARNING" "Application health check failed"
        ((errors++))
    fi

    if [ $errors -eq 0 ]; then
        log "INFO" "Restoration verification passed"
    else
        log "ERROR" "Restoration verification failed with $errors errors"
    fi
}

# Main restore process
main() {
    log "INFO" "=== Starting MaiFarm Restore ==="

    # Select backup to restore
    select_backup "${1:-}"

    # Verify backup integrity
    verify_backup

    # Confirm restore action
    confirm_restore

    # Stop services
    stop_services

    # Ask what to restore
    echo ""
    read -p "Restore database? (yes/NO): " restore_db
    read -p "Restore Redis data? (yes/NO): " restore_redis_data
    read -p "Restore application files? (yes/NO): " restore_app_files
    read -p "Restore configuration? (yes/NO): " restore_app_config

    # Perform restoration
    if [ "$restore_db" = "yes" ]; then
        restore_database
    fi

    if [ "$restore_redis_data" = "yes" ]; then
        restore_redis
    fi

    restore_files "$restore_app_files"
    restore_config "$restore_app_config"

    # Run post-restore tasks
    post_restore_tasks

    # Start services
    start_services

    # Verify restoration
    verify_restoration

    log "INFO" "=== Restore completed ==="
    echo ""
    echo -e "${GREEN}Restore completed successfully!${NC}"
    echo "Please verify application functionality."
}

# Run main function
main "$@"