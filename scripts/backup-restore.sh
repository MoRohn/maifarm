#!/bin/bash

# MaiFarm Backup and Restore Script
# Handles automated backups and restoration procedures

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/maifarm}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
S3_BUCKET="${S3_BUCKET:-}"
S3_PREFIX="${S3_PREFIX:-maifarm-backups}"
ENCRYPTION_KEY_FILE="${ENCRYPTION_KEY_FILE:-/etc/maifarm/backup.key}"
NOTIFICATION_WEBHOOK="${NOTIFICATION_WEBHOOK:-}"

# Backup configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-maifarm}"
DB_USER="${DB_USER:-maifarm}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging
LOG_FILE="/var/log/maifarm/backup-$(date +%Y%m%d).log"

log() {
    local level="$1"
    shift
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $*" | tee -a "$LOG_FILE"
}

error() {
    log "ERROR" "${RED}$*${NC}"
}

warn() {
    log "WARN" "${YELLOW}$*${NC}"
}

info() {
    log "INFO" "${BLUE}$*${NC}"
}

success() {
    log "SUCCESS" "${GREEN}$*${NC}"
}

# Send notification
send_notification() {
    local status="$1"
    local message="$2"
    local details="${3:-}"
    
    if [[ -n "$NOTIFICATION_WEBHOOK" ]]; then
        local payload=$(cat <<EOF
{
    "status": "$status",
    "service": "MaiFarm Backup",
    "message": "$message",
    "details": "$details",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "hostname": "$(hostname)"
}
EOF
)
        curl -s -X POST "$NOTIFICATION_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "$payload" || warn "Failed to send notification"
    fi
}

# Check prerequisites
check_prerequisites() {
    info "Checking prerequisites..."
    
    # Check required commands
    local required_commands=("pg_dump" "redis-cli" "tar" "openssl")
    if [[ -n "$S3_BUCKET" ]]; then
        required_commands+=("aws")
    fi
    
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            error "Required command not found: $cmd"
            exit 1
        fi
    done
    
    # Check directories
    mkdir -p "$BACKUP_ROOT" "$(dirname "$LOG_FILE")"
    
    # Check encryption key
    if [[ ! -f "$ENCRYPTION_KEY_FILE" ]]; then
        warn "Encryption key not found, generating new key..."
        mkdir -p "$(dirname "$ENCRYPTION_KEY_FILE")"
        openssl rand -base64 32 > "$ENCRYPTION_KEY_FILE"
        chmod 600 "$ENCRYPTION_KEY_FILE"
    fi
    
    success "Prerequisites check passed"
}

# Create backup
create_backup() {
    local backup_type="${1:-full}"
    local backup_name="backup-$(date +%Y%m%d-%H%M%S)-$backup_type"
    local backup_dir="$BACKUP_ROOT/$backup_name"
    
    info "Creating $backup_type backup: $backup_name"
    send_notification "started" "Backup started" "Type: $backup_type"
    
    mkdir -p "$backup_dir"
    
    # Record backup metadata
    cat > "$backup_dir/metadata.json" <<EOF
{
    "backup_name": "$backup_name",
    "backup_type": "$backup_type",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "hostname": "$(hostname)",
    "maifarm_version": "$(cat /opt/maifarm/VERSION 2>/dev/null || echo 'unknown')",
    "components": []
}
EOF
    
    # Backup database
    if backup_database "$backup_dir"; then
        update_metadata "$backup_dir" "postgresql" "success"
    else
        update_metadata "$backup_dir" "postgresql" "failed"
        warn "Database backup failed, continuing with other components..."
    fi
    
    # Backup Redis
    if backup_redis "$backup_dir"; then
        update_metadata "$backup_dir" "redis" "success"
    else
        update_metadata "$backup_dir" "redis" "failed"
        warn "Redis backup failed, continuing with other components..."
    fi
    
    # Backup application files
    if backup_application "$backup_dir"; then
        update_metadata "$backup_dir" "application" "success"
    else
        update_metadata "$backup_dir" "application" "failed"
        warn "Application backup failed, continuing with other components..."
    fi
    
    # Backup configurations
    if backup_configs "$backup_dir"; then
        update_metadata "$backup_dir" "configs" "success"
    else
        update_metadata "$backup_dir" "configs" "failed"
        warn "Config backup failed, continuing with other components..."
    fi
    
    # Create checksum
    create_checksum "$backup_dir"
    
    # Encrypt backup
    if encrypt_backup "$backup_dir"; then
        # Upload to S3 if configured
        if [[ -n "$S3_BUCKET" ]]; then
            upload_to_s3 "$backup_dir"
        fi
        
        success "Backup completed: $backup_name"
        send_notification "success" "Backup completed successfully" "Backup: $backup_name"
    else
        error "Backup encryption failed"
        send_notification "failed" "Backup failed" "Failed to encrypt backup"
        return 1
    fi
}

# Update backup metadata
update_metadata() {
    local backup_dir="$1"
    local component="$2"
    local status="$3"
    
    local temp_file=$(mktemp)
    jq ".components += [{\"name\": \"$component\", \"status\": \"$status\", \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}]" \
        "$backup_dir/metadata.json" > "$temp_file"
    mv "$temp_file" "$backup_dir/metadata.json"
}

# Backup database
backup_database() {
    local backup_dir="$1"
    info "Backing up PostgreSQL database..."
    
    export PGPASSWORD="${DB_PASSWORD:-}"
    
    # Dump database
    if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --verbose --no-owner --no-acl \
        -f "$backup_dir/database.sql" 2>&1 | tee -a "$LOG_FILE"; then
        
        # Compress
        gzip "$backup_dir/database.sql"
        
        # Get statistics
        local table_count=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
            -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'")
        
        echo "{\"tables\": $table_count, \"size\": $(stat -f%z "$backup_dir/database.sql.gz" 2>/dev/null || stat -c%s "$backup_dir/database.sql.gz")}" \
            > "$backup_dir/database.info"
        
        success "Database backup completed"
        return 0
    else
        error "Database backup failed"
        return 1
    fi
}

# Backup Redis
backup_redis() {
    local backup_dir="$1"
    info "Backing up Redis..."
    
    # Force Redis to save
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" BGSAVE; then
        # Wait for save to complete
        while [[ $(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LASTSAVE) == $(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LASTSAVE) ]]; do
            sleep 1
        done
        
        # Copy RDB file
        local redis_dir=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" CONFIG GET dir | tail -1)
        local redis_file=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" CONFIG GET dbfilename | tail -1)
        
        if cp "$redis_dir/$redis_file" "$backup_dir/redis.rdb"; then
            gzip "$backup_dir/redis.rdb"
            success "Redis backup completed"
            return 0
        fi
    fi
    
    error "Redis backup failed"
    return 1
}

# Backup application files
backup_application() {
    local backup_dir="$1"
    info "Backing up application files..."
    
    local app_dirs=(
        "/opt/maifarm/data"
        "/var/lib/maifarm"
        "/usr/local/share/maifarm"
    )
    
    local existing_dirs=()
    for dir in "${app_dirs[@]}"; do
        if [[ -d "$dir" ]]; then
            existing_dirs+=("$dir")
        fi
    done
    
    if [[ ${#existing_dirs[@]} -gt 0 ]]; then
        if tar -czf "$backup_dir/application.tar.gz" \
            --exclude="*.log" \
            --exclude="*.tmp" \
            --exclude="node_modules" \
            "${existing_dirs[@]}" 2>&1 | tee -a "$LOG_FILE"; then
            success "Application backup completed"
            return 0
        fi
    else
        warn "No application directories found"
        return 1
    fi
}

# Backup configurations
backup_configs() {
    local backup_dir="$1"
    info "Backing up configurations..."
    
    local config_files=(
        "/etc/maifarm"
        "/etc/nginx/sites-available/maifarm"
        "/etc/systemd/system/maifarm*.service"
        "/etc/supervisor/conf.d/maifarm*.conf"
    )
    
    local existing_configs=()
    for pattern in "${config_files[@]}"; do
        for file in $pattern; do
            if [[ -e "$file" ]]; then
                existing_configs+=("$file")
            fi
        done
    done
    
    if [[ ${#existing_configs[@]} -gt 0 ]]; then
        if tar -czf "$backup_dir/configs.tar.gz" "${existing_configs[@]}" 2>&1 | tee -a "$LOG_FILE"; then
            success "Configuration backup completed"
            return 0
        fi
    else
        warn "No configuration files found"
        return 1
    fi
}

# Create checksum
create_checksum() {
    local backup_dir="$1"
    info "Creating checksums..."
    
    cd "$backup_dir"
    find . -type f -not -name "checksums.sha256" -exec sha256sum {} \; > checksums.sha256
    cd - > /dev/null
    
    success "Checksums created"
}

# Encrypt backup
encrypt_backup() {
    local backup_dir="$1"
    local encrypted_file="$backup_dir.tar.gz.enc"
    
    info "Encrypting backup..."
    
    # Create tar archive
    if tar -czf - -C "$(dirname "$backup_dir")" "$(basename "$backup_dir")" | \
        openssl enc -aes-256-cbc -salt -pbkdf2 -in - -out "$encrypted_file" -pass file:"$ENCRYPTION_KEY_FILE"; then
        
        # Remove unencrypted backup
        rm -rf "$backup_dir"
        
        success "Backup encrypted"
        return 0
    else
        error "Encryption failed"
        return 1
    fi
}

# Upload to S3
upload_to_s3() {
    local backup_dir="$1"
    local encrypted_file="$backup_dir.tar.gz.enc"
    local s3_path="s3://$S3_BUCKET/$S3_PREFIX/$(basename "$encrypted_file")"
    
    info "Uploading to S3: $s3_path"
    
    if aws s3 cp "$encrypted_file" "$s3_path" \
        --storage-class STANDARD_IA \
        --metadata "backup-type=full,hostname=$(hostname),timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)"; then
        
        # Remove local copy if S3 upload successful
        rm -f "$encrypted_file"
        
        success "Uploaded to S3"
        return 0
    else
        error "S3 upload failed"
        return 1
    fi
}

# List backups
list_backups() {
    info "Available backups:"
    
    # List local backups
    echo -e "\n${BLUE}Local backups:${NC}"
    if [[ -d "$BACKUP_ROOT" ]]; then
        find "$BACKUP_ROOT" -name "*.tar.gz.enc" -type f -printf "%f\t%s\t%TY-%Tm-%Td %TH:%TM\n" | \
            sort -r | column -t
    else
        echo "No local backups found"
    fi
    
    # List S3 backups
    if [[ -n "$S3_BUCKET" ]]; then
        echo -e "\n${BLUE}S3 backups:${NC}"
        aws s3 ls "s3://$S3_BUCKET/$S3_PREFIX/" --recursive | \
            grep -E "\.tar\.gz\.enc$" | \
            awk '{print $4"\t"$3"\t"$1" "$2}' | \
            sort -r | column -t
    fi
}

# Restore backup
restore_backup() {
    local backup_file="$1"
    local restore_dir="/tmp/maifarm-restore-$(date +%Y%m%d-%H%M%S)"
    
    info "Restoring from backup: $backup_file"
    send_notification "started" "Restore started" "Backup: $backup_file"
    
    # Download from S3 if needed
    if [[ ! -f "$backup_file" ]] && [[ -n "$S3_BUCKET" ]]; then
        local s3_path="s3://$S3_BUCKET/$S3_PREFIX/$(basename "$backup_file")"
        info "Downloading from S3: $s3_path"
        aws s3 cp "$s3_path" "$backup_file" || {
            error "Failed to download from S3"
            return 1
        }
    fi
    
    # Decrypt backup
    info "Decrypting backup..."
    mkdir -p "$restore_dir"
    
    if ! openssl enc -aes-256-cbc -d -pbkdf2 -in "$backup_file" -pass file:"$ENCRYPTION_KEY_FILE" | \
        tar -xzf - -C "$restore_dir"; then
        error "Failed to decrypt backup"
        return 1
    fi
    
    # Find the actual backup directory
    local backup_content=$(find "$restore_dir" -maxdepth 1 -name "backup-*" -type d | head -1)
    if [[ -z "$backup_content" ]]; then
        error "Invalid backup format"
        return 1
    fi
    
    # Verify checksums
    info "Verifying backup integrity..."
    cd "$backup_content"
    if ! sha256sum -c checksums.sha256; then
        error "Backup integrity check failed"
        cd - > /dev/null
        return 1
    fi
    cd - > /dev/null
    
    # Stop services
    info "Stopping services..."
    systemctl stop maifarm-api maifarm-worker || true
    
    # Restore components
    local restore_success=true
    
    # Restore database
    if [[ -f "$backup_content/database.sql.gz" ]]; then
        if restore_database "$backup_content"; then
            success "Database restored"
        else
            error "Database restore failed"
            restore_success=false
        fi
    fi
    
    # Restore Redis
    if [[ -f "$backup_content/redis.rdb.gz" ]]; then
        if restore_redis "$backup_content"; then
            success "Redis restored"
        else
            error "Redis restore failed"
            restore_success=false
        fi
    fi
    
    # Restore application files
    if [[ -f "$backup_content/application.tar.gz" ]]; then
        if restore_application "$backup_content"; then
            success "Application files restored"
        else
            error "Application restore failed"
            restore_success=false
        fi
    fi
    
    # Restore configurations
    if [[ -f "$backup_content/configs.tar.gz" ]]; then
        if restore_configs "$backup_content"; then
            success "Configurations restored"
        else
            error "Configuration restore failed"
            restore_success=false
        fi
    fi
    
    # Start services
    info "Starting services..."
    systemctl start maifarm-api maifarm-worker
    
    # Cleanup
    rm -rf "$restore_dir"
    
    if [[ "$restore_success" = true ]]; then
        success "Restore completed successfully"
        send_notification "success" "Restore completed successfully" "Backup: $backup_file"
    else
        error "Restore completed with errors"
        send_notification "failed" "Restore completed with errors" "Backup: $backup_file"
        return 1
    fi
}

# Restore database
restore_database() {
    local backup_content="$1"
    info "Restoring database..."
    
    export PGPASSWORD="${DB_PASSWORD:-}"
    
    # Drop and recreate database
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres <<EOF
DROP DATABASE IF EXISTS ${DB_NAME}_old;
ALTER DATABASE $DB_NAME RENAME TO ${DB_NAME}_old;
CREATE DATABASE $DB_NAME;
EOF
    
    # Restore data
    if gunzip -c "$backup_content/database.sql.gz" | \
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"; then
        # Drop old database
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE ${DB_NAME}_old"
        return 0
    else
        # Restore original database
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres <<EOF
DROP DATABASE IF EXISTS $DB_NAME;
ALTER DATABASE ${DB_NAME}_old RENAME TO $DB_NAME;
EOF
        return 1
    fi
}

# Restore Redis
restore_redis() {
    local backup_content="$1"
    info "Restoring Redis..."
    
    systemctl stop redis
    
    local redis_dir=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" CONFIG GET dir | tail -1)
    local redis_file=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" CONFIG GET dbfilename | tail -1)
    
    # Backup current Redis data
    if [[ -f "$redis_dir/$redis_file" ]]; then
        mv "$redis_dir/$redis_file" "$redis_dir/$redis_file.bak"
    fi
    
    # Restore
    if gunzip -c "$backup_content/redis.rdb.gz" > "$redis_dir/$redis_file"; then
        chown redis:redis "$redis_dir/$redis_file"
        systemctl start redis
        return 0
    else
        # Restore original
        if [[ -f "$redis_dir/$redis_file.bak" ]]; then
            mv "$redis_dir/$redis_file.bak" "$redis_dir/$redis_file"
        fi
        systemctl start redis
        return 1
    fi
}

# Restore application files
restore_application() {
    local backup_content="$1"
    info "Restoring application files..."
    
    # Create backup of current files
    local app_backup="/tmp/maifarm-app-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    tar -czf "$app_backup" /opt/maifarm/data /var/lib/maifarm 2>/dev/null || true
    
    # Restore
    if tar -xzf "$backup_content/application.tar.gz" -C /; then
        rm -f "$app_backup"
        return 0
    else
        # Restore original
        tar -xzf "$app_backup" -C / 2>/dev/null || true
        rm -f "$app_backup"
        return 1
    fi
}

# Restore configurations
restore_configs() {
    local backup_content="$1"
    info "Restoring configurations..."
    
    # Create backup of current configs
    local config_backup="/tmp/maifarm-config-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    tar -czf "$config_backup" /etc/maifarm /etc/nginx/sites-available/maifarm 2>/dev/null || true
    
    # Restore
    if tar -xzf "$backup_content/configs.tar.gz" -C /; then
        # Reload services
        systemctl daemon-reload
        nginx -s reload || true
        rm -f "$config_backup"
        return 0
    else
        # Restore original
        tar -xzf "$config_backup" -C / 2>/dev/null || true
        rm -f "$config_backup"
        return 1
    fi
}

# Cleanup old backups
cleanup_backups() {
    info "Cleaning up old backups..."
    
    # Clean local backups
    find "$BACKUP_ROOT" -name "*.tar.gz.enc" -type f -mtime +$BACKUP_RETENTION_DAYS -delete
    
    # Clean S3 backups if configured
    if [[ -n "$S3_BUCKET" ]]; then
        # List old backups
        local cutoff_date=$(date -d "$BACKUP_RETENTION_DAYS days ago" +%Y-%m-%d)
        aws s3 ls "s3://$S3_BUCKET/$S3_PREFIX/" --recursive | \
            while read -r date time size file; do
                if [[ "$date" < "$cutoff_date" ]]; then
                    info "Deleting old S3 backup: $file"
                    aws s3 rm "s3://$S3_BUCKET/$file"
                fi
            done
    fi
    
    success "Cleanup completed"
}

# Verify backup
verify_backup() {
    local backup_file="$1"
    local temp_dir="/tmp/maifarm-verify-$(date +%Y%m%d-%H%M%S)"
    
    info "Verifying backup: $backup_file"
    
    # Decrypt to temp directory
    mkdir -p "$temp_dir"
    if ! openssl enc -aes-256-cbc -d -pbkdf2 -in "$backup_file" -pass file:"$ENCRYPTION_KEY_FILE" | \
        tar -xzf - -C "$temp_dir"; then
        error "Failed to decrypt backup for verification"
        rm -rf "$temp_dir"
        return 1
    fi
    
    # Find backup content
    local backup_content=$(find "$temp_dir" -maxdepth 1 -name "backup-*" -type d | head -1)
    if [[ -z "$backup_content" ]]; then
        error "Invalid backup format"
        rm -rf "$temp_dir"
        return 1
    fi
    
    # Verify checksums
    cd "$backup_content"
    if sha256sum -c checksums.sha256; then
        success "Backup verification passed"
        cd - > /dev/null
        rm -rf "$temp_dir"
        return 0
    else
        error "Backup verification failed"
        cd - > /dev/null
        rm -rf "$temp_dir"
        return 1
    fi
}

# Main function
main() {
    # Create log directory
    mkdir -p "$(dirname "$LOG_FILE")"
    
    case "${1:-}" in
        backup)
            check_prerequisites
            create_backup "${2:-full}"
            ;;
        restore)
            if [[ -z "${2:-}" ]]; then
                error "Backup file required"
                echo "Usage: $0 restore <backup-file>"
                exit 1
            fi
            check_prerequisites
            restore_backup "$2"
            ;;
        list)
            list_backups
            ;;
        verify)
            if [[ -z "${2:-}" ]]; then
                error "Backup file required"
                echo "Usage: $0 verify <backup-file>"
                exit 1
            fi
            verify_backup "$2"
            ;;
        cleanup)
            cleanup_backups
            ;;
        schedule)
            # Add cron job for scheduled backups
            local cron_schedule="${2:-0 2 * * *}"  # Default: 2 AM daily
            local cron_line="$cron_schedule $SCRIPT_DIR/$(basename "$0") backup full >> $LOG_FILE 2>&1"
            (crontab -l 2>/dev/null | grep -v "maifarm.*backup"; echo "$cron_line") | crontab -
            success "Backup scheduled: $cron_schedule"
            ;;
        *)
            cat <<EOF
MaiFarm Backup and Restore Tool

Usage: $0 <command> [options]

Commands:
    backup [type]     Create a backup (type: full, incremental)
    restore <file>    Restore from backup file
    list             List available backups
    verify <file>    Verify backup integrity
    cleanup          Remove old backups
    schedule [cron]  Schedule automatic backups (default: daily at 2 AM)

Environment Variables:
    BACKUP_ROOT              Backup directory (default: /var/backups/maifarm)
    BACKUP_RETENTION_DAYS    Days to keep backups (default: 30)
    S3_BUCKET               S3 bucket for remote backups (optional)
    S3_PREFIX               S3 prefix (default: maifarm-backups)
    DB_HOST                 Database host (default: localhost)
    DB_NAME                 Database name (default: maifarm)
    DB_USER                 Database user (default: maifarm)
    DB_PASSWORD             Database password
    REDIS_HOST              Redis host (default: localhost)
    REDIS_PORT              Redis port (default: 6379)
    NOTIFICATION_WEBHOOK    Webhook URL for notifications (optional)
EOF
            exit 1
            ;;
    esac
}

# Run main function
main "$@"