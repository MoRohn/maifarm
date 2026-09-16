#!/bin/bash

# MaiFarm Disaster Recovery Script
# This script handles disaster recovery scenarios for the MaiFarm platform

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/maifarm}"
DATA_DIR="${DATA_DIR:-/var/lib/maifarm}"
LOG_DIR="${LOG_DIR:-/var/log/maifarm}"
RECOVERY_LOG="${LOG_DIR}/disaster-recovery-$(date +%Y%m%d-%H%M%S).log"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
DB_HOST="${DB_HOST:-localhost}"
DB_NAME="${DB_NAME:-maifarm}"
DB_USER="${DB_USER:-maifarm}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${2:-}$(date '+%Y-%m-%d %H:%M:%S') - $1${NC}" | tee -a "$RECOVERY_LOG"
}

# Error handler
error_exit() {
    log "ERROR: $1" "$RED"
    exit 1
}

# Check if running as root or with sudo
check_permissions() {
    if [[ $EUID -ne 0 ]]; then
        error_exit "This script must be run as root or with sudo"
    fi
}

# Create necessary directories
setup_directories() {
    log "Setting up directories..." "$BLUE"
    mkdir -p "$BACKUP_DIR" "$LOG_DIR"
    chmod 750 "$BACKUP_DIR" "$LOG_DIR"
}

# Check system health
check_system_health() {
    log "Checking system health..." "$BLUE"
    
    # Check disk space
    local disk_usage=$(df -h "$DATA_DIR" | awk 'NR==2 {print $5}' | sed 's/%//')
    if [[ $disk_usage -gt 90 ]]; then
        log "WARNING: Disk usage is at ${disk_usage}%" "$YELLOW"
    else
        log "Disk usage: ${disk_usage}%" "$GREEN"
    fi
    
    # Check memory
    local mem_usage=$(free | awk '/Mem:/ {printf "%.0f", $3/$2 * 100}')
    log "Memory usage: ${mem_usage}%" "$GREEN"
    
    # Check if services are running
    check_service_status
}

# Check service status
check_service_status() {
    log "Checking service status..." "$BLUE"
    
    # Check Redis
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping &>/dev/null; then
        log "Redis is running" "$GREEN"
    else
        log "Redis is not responding" "$RED"
    fi
    
    # Check database
    if psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" &>/dev/null; then
        log "PostgreSQL is running" "$GREEN"
    else
        log "PostgreSQL is not responding" "$RED"
    fi
    
    # Check MaiFarm services
    if systemctl is-active --quiet maifarm-api; then
        log "MaiFarm API is running" "$GREEN"
    else
        log "MaiFarm API is not running" "$RED"
    fi
}

# Stop all services
stop_services() {
    log "Stopping all services..." "$YELLOW"
    
    systemctl stop maifarm-api || true
    systemctl stop maifarm-worker || true
    systemctl stop nginx || true
    
    log "Services stopped" "$GREEN"
}

# Start all services
start_services() {
    log "Starting all services..." "$YELLOW"
    
    systemctl start redis || error_exit "Failed to start Redis"
    systemctl start postgresql || error_exit "Failed to start PostgreSQL"
    sleep 5  # Give databases time to start
    
    systemctl start maifarm-api || error_exit "Failed to start MaiFarm API"
    systemctl start maifarm-worker || error_exit "Failed to start MaiFarm Worker"
    systemctl start nginx || error_exit "Failed to start Nginx"
    
    log "Services started" "$GREEN"
}

# Backup current state
backup_current_state() {
    log "Creating emergency backup of current state..." "$BLUE"
    
    local backup_name="emergency-backup-$(date +%Y%m%d-%H%M%S)"
    local backup_path="$BACKUP_DIR/$backup_name"
    
    mkdir -p "$backup_path"
    
    # Backup database
    log "Backing up database..." "$BLUE"
    pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -f "$backup_path/database.sql" || \
        log "WARNING: Database backup failed" "$YELLOW"
    
    # Backup Redis
    log "Backing up Redis..." "$BLUE"
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --rdb "$backup_path/redis.rdb" || \
        log "WARNING: Redis backup failed" "$YELLOW"
    
    # Backup application data
    log "Backing up application data..." "$BLUE"
    tar -czf "$backup_path/app-data.tar.gz" -C "$DATA_DIR" . || \
        log "WARNING: Application data backup failed" "$YELLOW"
    
    # Backup configurations
    log "Backing up configurations..." "$BLUE"
    tar -czf "$backup_path/configs.tar.gz" \
        /etc/maifarm \
        /etc/nginx/sites-available/maifarm \
        /etc/systemd/system/maifarm-*.service \
        2>/dev/null || log "WARNING: Some config files not found" "$YELLOW"
    
    log "Emergency backup completed: $backup_path" "$GREEN"
}

# List available backups
list_backups() {
    log "Available backups:" "$BLUE"
    
    if [[ -d "$BACKUP_DIR" ]]; then
        ls -la "$BACKUP_DIR" | grep -E "^d" | awk '{print $9}' | grep -v "^\.$\|^\.\.$" | sort -r
    else
        log "No backups found" "$YELLOW"
    fi
}

# Restore from backup
restore_from_backup() {
    local backup_name="$1"
    local backup_path="$BACKUP_DIR/$backup_name"
    
    if [[ ! -d "$backup_path" ]]; then
        error_exit "Backup not found: $backup_name"
    fi
    
    log "Restoring from backup: $backup_name" "$BLUE"
    
    # Stop services before restore
    stop_services
    
    # Restore database
    if [[ -f "$backup_path/database.sql" ]]; then
        log "Restoring database..." "$BLUE"
        psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME"
        psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME"
        psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -f "$backup_path/database.sql" || \
            error_exit "Database restore failed"
        log "Database restored" "$GREEN"
    fi
    
    # Restore Redis
    if [[ -f "$backup_path/redis.rdb" ]]; then
        log "Restoring Redis..." "$BLUE"
        systemctl stop redis
        cp "$backup_path/redis.rdb" /var/lib/redis/dump.rdb
        chown redis:redis /var/lib/redis/dump.rdb
        systemctl start redis
        log "Redis restored" "$GREEN"
    fi
    
    # Restore application data
    if [[ -f "$backup_path/app-data.tar.gz" ]]; then
        log "Restoring application data..." "$BLUE"
        rm -rf "$DATA_DIR"/*
        tar -xzf "$backup_path/app-data.tar.gz" -C "$DATA_DIR"
        log "Application data restored" "$GREEN"
    fi
    
    # Start services
    start_services
    
    log "Restore completed successfully" "$GREEN"
}

# Perform health checks after recovery
post_recovery_checks() {
    log "Performing post-recovery health checks..." "$BLUE"
    
    sleep 10  # Give services time to fully start
    
    # Check service status
    check_service_status
    
    # Check API endpoint
    if curl -s -f http://localhost:3000/api/health >/dev/null; then
        log "API health check passed" "$GREEN"
    else
        log "API health check failed" "$RED"
    fi
    
    # Check database connectivity
    if psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT COUNT(*) FROM farms" &>/dev/null; then
        log "Database connectivity verified" "$GREEN"
    else
        log "Database connectivity check failed" "$RED"
    fi
}

# Switch to standby node
switch_to_standby() {
    log "Switching to standby node..." "$BLUE"
    
    # Update DNS or load balancer to point to standby
    # This is environment-specific and should be customized
    
    # Example: Update nginx upstream
    if [[ -f /etc/nginx/conf.d/maifarm-upstream.conf ]]; then
        sed -i 's/server primary.maifarm.local/server standby.maifarm.local/g' \
            /etc/nginx/conf.d/maifarm-upstream.conf
        nginx -s reload
        log "Switched to standby node" "$GREEN"
    else
        log "Standby configuration not found" "$YELLOW"
    fi
}

# Clean up old backups
cleanup_old_backups() {
    local retention_days="${1:-7}"
    log "Cleaning up backups older than $retention_days days..." "$BLUE"
    
    find "$BACKUP_DIR" -maxdepth 1 -type d -mtime +"$retention_days" -name "backup-*" -exec rm -rf {} \; || true
    find "$LOG_DIR" -type f -name "disaster-recovery-*.log" -mtime +"$retention_days" -delete || true
    
    log "Cleanup completed" "$GREEN"
}

# Main recovery menu
show_menu() {
    echo -e "\n${BLUE}MaiFarm Disaster Recovery Menu${NC}"
    echo "================================"
    echo "1. Check system health"
    echo "2. Create emergency backup"
    echo "3. List available backups"
    echo "4. Restore from backup"
    echo "5. Switch to standby node"
    echo "6. Stop all services"
    echo "7. Start all services"
    echo "8. Clean up old backups"
    echo "9. Exit"
    echo
}

# Main function
main() {
    check_permissions
    setup_directories
    
    log "MaiFarm Disaster Recovery Tool Started" "$BLUE"
    
    if [[ $# -eq 0 ]]; then
        # Interactive mode
        while true; do
            show_menu
            read -p "Select an option: " choice
            
            case $choice in
                1) check_system_health ;;
                2) backup_current_state ;;
                3) list_backups ;;
                4)
                    list_backups
                    read -p "Enter backup name to restore: " backup_name
                    restore_from_backup "$backup_name"
                    post_recovery_checks
                    ;;
                5) switch_to_standby ;;
                6) stop_services ;;
                7) start_services ;;
                8)
                    read -p "Enter retention days (default: 7): " days
                    cleanup_old_backups "${days:-7}"
                    ;;
                9) 
                    log "Exiting disaster recovery tool" "$BLUE"
                    exit 0
                    ;;
                *) log "Invalid option" "$RED" ;;
            esac
        done
    else
        # Command line mode
        case "$1" in
            health) check_system_health ;;
            backup) backup_current_state ;;
            list) list_backups ;;
            restore)
                if [[ -z "${2:-}" ]]; then
                    error_exit "Backup name required"
                fi
                restore_from_backup "$2"
                post_recovery_checks
                ;;
            standby) switch_to_standby ;;
            stop) stop_services ;;
            start) start_services ;;
            cleanup) cleanup_old_backups "${2:-7}" ;;
            *)
                echo "Usage: $0 [health|backup|list|restore <backup>|standby|stop|start|cleanup [days]]"
                exit 1
                ;;
        esac
    fi
}

# Run main function
main "$@"