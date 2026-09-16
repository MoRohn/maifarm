#!/bin/bash

# MaiFarm Backup Automation Script
# Comprehensive backup solution for production environments

set -euo pipefail

# Configuration
BACKUP_BASE_DIR="${BACKUP_DIR:-/var/backups/maifarm}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_BASE_DIR}/${TIMESTAMP}"
LOG_FILE="${BACKUP_BASE_DIR}/backup.log"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
S3_BUCKET="${S3_BACKUP_BUCKET:-}"
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"

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

    # Send to Slack if webhook configured
    if [ -n "$SLACK_WEBHOOK" ]; then
        send_slack_notification "$level" "$message"
    fi
}

# Error handler
error_handler() {
    local line_no=$1
    log "ERROR" "Backup failed at line $line_no"
    cleanup_on_error
    exit 1
}

trap 'error_handler $LINENO' ERR

# Slack notification function
send_slack_notification() {
    local level=$1
    local message=$2

    if [ -n "$SLACK_WEBHOOK" ]; then
        local color="good"
        [ "$level" = "ERROR" ] && color="danger"
        [ "$level" = "WARNING" ] && color="warning"

        curl -X POST "$SLACK_WEBHOOK" \
            -H 'Content-Type: application/json' \
            -d "{
                \"attachments\": [{
                    \"color\": \"$color\",
                    \"title\": \"MaiFarm Backup $level\",
                    \"text\": \"$message\",
                    \"footer\": \"Backup System\",
                    \"ts\": $(date +%s)
                }]
            }" 2>/dev/null || true
    fi
}

# Cleanup on error
cleanup_on_error() {
    log "INFO" "Cleaning up partial backup..."
    if [ -d "$BACKUP_DIR" ]; then
        rm -rf "$BACKUP_DIR"
    fi
}

# Create backup directory structure
create_backup_dirs() {
    log "INFO" "Creating backup directory structure..."
    mkdir -p "$BACKUP_DIR"/{database,redis,files,config,logs}
    mkdir -p "$BACKUP_BASE_DIR"/daily
    mkdir -p "$BACKUP_BASE_DIR"/weekly
    mkdir -p "$BACKUP_BASE_DIR"/monthly
}

# Backup PostgreSQL database
backup_database() {
    log "INFO" "Starting PostgreSQL backup..."

    local db_backup_file="$BACKUP_DIR/database/${DB_NAME}_${TIMESTAMP}.sql.gz"

    # Export password for pg_dump
    export PGPASSWORD="$DB_PASSWORD"

    # Dump database with compression
    pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --verbose \
        --no-owner \
        --no-acl \
        --clean \
        --if-exists \
        --compress=0 \
        | gzip -9 > "$db_backup_file"

    # Unset password
    unset PGPASSWORD

    # Verify backup
    if [ -f "$db_backup_file" ]; then
        local size=$(du -h "$db_backup_file" | cut -f1)
        log "INFO" "Database backup completed: $size"
    else
        log "ERROR" "Database backup failed"
        return 1
    fi

    # Create checksum
    sha256sum "$db_backup_file" > "$db_backup_file.sha256"
}

# Backup Redis data
backup_redis() {
    log "INFO" "Starting Redis backup..."

    local redis_backup_file="$BACKUP_DIR/redis/redis_${TIMESTAMP}.rdb"

    # Trigger Redis BGSAVE
    if [ -n "$REDIS_PASSWORD" ]; then
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" BGSAVE
    else
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" BGSAVE
    fi

    # Wait for background save to complete
    log "INFO" "Waiting for Redis background save..."
    sleep 5

    while true; do
        if [ -n "$REDIS_PASSWORD" ]; then
            lastsave=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" LASTSAVE 2>/dev/null)
        else
            lastsave=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LASTSAVE 2>/dev/null)
        fi

        if [ $? -eq 0 ]; then
            break
        fi
        sleep 1
    done

    # Copy Redis dump file
    if [ -f "/var/lib/redis/dump.rdb" ]; then
        cp /var/lib/redis/dump.rdb "$redis_backup_file"
        gzip -9 "$redis_backup_file"
        log "INFO" "Redis backup completed"
    else
        log "WARNING" "Redis dump file not found at default location"
    fi
}

# Backup application files
backup_files() {
    log "INFO" "Starting application files backup..."

    local files_backup="$BACKUP_DIR/files/maifarm_files_${TIMESTAMP}.tar.gz"

    # Backup maibarn directory (harvest data)
    tar -czf "$files_backup" \
        --exclude='*/node_modules' \
        --exclude='*/dist' \
        --exclude='*/.git' \
        --exclude='*/logs' \
        --exclude='*/coverage' \
        /var/www/maifarm/maibarn 2>/dev/null || true

    if [ -f "$files_backup" ]; then
        local size=$(du -h "$files_backup" | cut -f1)
        log "INFO" "Files backup completed: $size"
    else
        log "WARNING" "Files backup may be incomplete"
    fi
}

# Backup configuration files
backup_config() {
    log "INFO" "Starting configuration backup..."

    local config_backup="$BACKUP_DIR/config/config_${TIMESTAMP}.tar.gz"

    # List of config files to backup
    local config_files=(
        "/var/www/maifarm/.env.production"
        "/var/www/maifarm/ecosystem.config.js"
        "/etc/nginx/sites-available/maifarm"
        "/etc/systemd/system/maifarm.service"
        "/etc/redis/redis.conf"
        "/etc/postgresql/*/main/postgresql.conf"
    )

    # Create temporary directory for configs
    local temp_config="/tmp/maifarm_config_${TIMESTAMP}"
    mkdir -p "$temp_config"

    # Copy config files
    for file in "${config_files[@]}"; do
        if [ -f "$file" ]; then
            cp --parents "$file" "$temp_config" 2>/dev/null || true
        fi
    done

    # Create archive
    tar -czf "$config_backup" -C "$temp_config" . 2>/dev/null
    rm -rf "$temp_config"

    log "INFO" "Configuration backup completed"
}

# Backup logs
backup_logs() {
    log "INFO" "Starting logs backup..."

    local logs_backup="$BACKUP_DIR/logs/logs_${TIMESTAMP}.tar.gz"

    # Compress and backup recent logs
    find /var/www/maifarm/logs -type f -name "*.log" -mtime -7 | \
        tar -czf "$logs_backup" -T - 2>/dev/null || true

    if [ -f "$logs_backup" ]; then
        local size=$(du -h "$logs_backup" | cut -f1)
        log "INFO" "Logs backup completed: $size"
    fi
}

# Upload to S3 (if configured)
upload_to_s3() {
    if [ -z "$S3_BUCKET" ]; then
        log "INFO" "S3 backup skipped (not configured)"
        return 0
    fi

    log "INFO" "Uploading backup to S3..."

    # Check if AWS CLI is installed
    if ! command -v aws &> /dev/null; then
        log "WARNING" "AWS CLI not installed, skipping S3 upload"
        return 0
    fi

    # Create tarball of entire backup
    local s3_backup="/tmp/maifarm_backup_${TIMESTAMP}.tar.gz"
    tar -czf "$s3_backup" -C "$BACKUP_BASE_DIR" "$TIMESTAMP"

    # Upload to S3
    if aws s3 cp "$s3_backup" "s3://$S3_BUCKET/backups/" --storage-class STANDARD_IA; then
        log "INFO" "Backup uploaded to S3 successfully"
    else
        log "ERROR" "Failed to upload backup to S3"
    fi

    # Cleanup temporary file
    rm -f "$s3_backup"
}

# Rotate backups
rotate_backups() {
    log "INFO" "Rotating old backups..."

    # Remove backups older than retention period
    find "$BACKUP_BASE_DIR" -maxdepth 1 -type d -name "[0-9]*" -mtime +$RETENTION_DAYS -exec rm -rf {} \; 2>/dev/null || true

    # Keep daily backups for 7 days
    find "$BACKUP_BASE_DIR/daily" -type f -mtime +7 -delete 2>/dev/null || true

    # Keep weekly backups for 4 weeks
    find "$BACKUP_BASE_DIR/weekly" -type f -mtime +28 -delete 2>/dev/null || true

    # Keep monthly backups for 12 months
    find "$BACKUP_BASE_DIR/monthly" -type f -mtime +365 -delete 2>/dev/null || true

    log "INFO" "Backup rotation completed"
}

# Create backup links for easy access
create_backup_links() {
    log "INFO" "Creating backup links..."

    # Create latest link
    ln -sfn "$BACKUP_DIR" "$BACKUP_BASE_DIR/latest"

    # Create daily link (overwrite if exists)
    ln -sfn "$BACKUP_DIR" "$BACKUP_BASE_DIR/daily/$(date +%Y%m%d)"

    # Create weekly link (on Sundays)
    if [ $(date +%w) -eq 0 ]; then
        ln -sfn "$BACKUP_DIR" "$BACKUP_BASE_DIR/weekly/week_$(date +%Y%W)"
    fi

    # Create monthly link (on 1st of month)
    if [ $(date +%d) -eq 01 ]; then
        ln -sfn "$BACKUP_DIR" "$BACKUP_BASE_DIR/monthly/$(date +%Y%m)"
    fi
}

# Generate backup report
generate_report() {
    log "INFO" "Generating backup report..."

    local report_file="$BACKUP_DIR/backup_report.txt"

    {
        echo "MaiFarm Backup Report"
        echo "====================="
        echo "Timestamp: $TIMESTAMP"
        echo "Backup Directory: $BACKUP_DIR"
        echo ""
        echo "Backup Contents:"
        echo "----------------"
        du -sh "$BACKUP_DIR"/* | sort -h
        echo ""
        echo "Checksums:"
        echo "----------"
        find "$BACKUP_DIR" -name "*.sha256" -exec cat {} \;
        echo ""
        echo "Disk Usage:"
        echo "-----------"
        df -h "$BACKUP_BASE_DIR"
    } > "$report_file"

    cat "$report_file"
}

# Verify backup integrity
verify_backup() {
    log "INFO" "Verifying backup integrity..."

    local errors=0

    # Check database backup
    if [ ! -f "$BACKUP_DIR/database/${DB_NAME}_${TIMESTAMP}.sql.gz" ]; then
        log "ERROR" "Database backup file missing"
        ((errors++))
    fi

    # Check file sizes
    for file in "$BACKUP_DIR"/**/*.gz; do
        if [ -f "$file" ]; then
            local size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
            if [ "$size" -eq 0 ]; then
                log "ERROR" "Empty backup file: $file"
                ((errors++))
            fi
        fi
    done

    if [ $errors -eq 0 ]; then
        log "INFO" "Backup verification passed"
        return 0
    else
        log "ERROR" "Backup verification failed with $errors errors"
        return 1
    fi
}

# Main backup process
main() {
    log "INFO" "=== Starting MaiFarm Backup ==="

    # Check prerequisites
    if [ ! -d "$BACKUP_BASE_DIR" ]; then
        mkdir -p "$BACKUP_BASE_DIR"
    fi

    # Create backup directory structure
    create_backup_dirs

    # Perform backups
    backup_database
    backup_redis
    backup_files
    backup_config
    backup_logs

    # Verify backup integrity
    verify_backup

    # Upload to S3
    upload_to_s3

    # Create backup links
    create_backup_links

    # Rotate old backups
    rotate_backups

    # Generate report
    generate_report

    log "INFO" "=== Backup completed successfully ==="

    # Send success notification
    send_slack_notification "SUCCESS" "Backup completed successfully at $BACKUP_DIR"
}

# Run main function
main "$@"