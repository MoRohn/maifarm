#!/bin/bash

# Production Deployment Script for MaiFarm
# This script handles the complete production deployment process

set -e  # Exit on error

# Configuration
ENVIRONMENT="production"
APP_NAME="maifarm"
DEPLOY_DIR="/var/www/maifarm"
BACKUP_DIR="/var/backups/maifarm"
DOCKER_REGISTRY="docker.io"
DOCKER_IMAGE="${DOCKER_REGISTRY}/${APP_NAME}"
COMPOSE_FILE="docker-compose.production.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed"
    fi

    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose is not installed"
    fi

    # Check if user has sudo privileges
    if ! sudo -n true 2>/dev/null; then
        error "This script requires sudo privileges"
    fi

    # Check disk space
    REQUIRED_SPACE=5000000  # 5GB in KB
    AVAILABLE_SPACE=$(df /var | awk 'NR==2 {print $4}')

    if [ "$AVAILABLE_SPACE" -lt "$REQUIRED_SPACE" ]; then
        error "Insufficient disk space. Required: 5GB, Available: $((AVAILABLE_SPACE/1024/1024))GB"
    fi

    success "Prerequisites check passed"
}

# Backup current deployment
backup_current() {
    log "Creating backup of current deployment..."

    BACKUP_NAME="${APP_NAME}_$(date +'%Y%m%d_%H%M%S')"
    BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

    # Create backup directory
    sudo mkdir -p "${BACKUP_PATH}"

    # Backup database
    if docker-compose -f "${DEPLOY_DIR}/${COMPOSE_FILE}" ps | grep -q postgres; then
        log "Backing up database..."
        docker-compose -f "${DEPLOY_DIR}/${COMPOSE_FILE}" exec -T postgres \
            pg_dump -U maifarm maifarm_prod > "${BACKUP_PATH}/database.sql"
    fi

    # Backup volumes
    log "Backing up Docker volumes..."
    docker run --rm -v maifarm_data:/data -v "${BACKUP_PATH}:/backup" \
        alpine tar czf /backup/volumes.tar.gz -C /data .

    # Backup environment files
    if [ -f "${DEPLOY_DIR}/.env.production" ]; then
        cp "${DEPLOY_DIR}/.env.production" "${BACKUP_PATH}/"
    fi

    # Keep only last 5 backups
    ls -t "${BACKUP_DIR}" | tail -n +6 | xargs -I {} rm -rf "${BACKUP_DIR}/{}"

    success "Backup created at ${BACKUP_PATH}"
}

# Pull latest code
pull_latest_code() {
    log "Pulling latest code from repository..."

    cd "${DEPLOY_DIR}"

    # Stash any local changes
    git stash

    # Pull latest from main branch
    git checkout main
    git pull origin main

    # Update submodules if any
    git submodule update --init --recursive

    success "Code updated to latest version"
}

# Build application
build_application() {
    log "Building application..."

    cd "${DEPLOY_DIR}"

    # Build Docker image
    docker build -f Dockerfile.production -t "${DOCKER_IMAGE}:latest" .

    # Tag with version
    VERSION=$(git describe --tags --always)
    docker tag "${DOCKER_IMAGE}:latest" "${DOCKER_IMAGE}:${VERSION}"

    success "Application built successfully"
}

# Run database migrations
run_migrations() {
    log "Running database migrations..."

    docker-compose -f "${COMPOSE_FILE}" run --rm app npm run migrate:up

    success "Database migrations completed"
}

# Deploy with zero downtime
deploy_zero_downtime() {
    log "Starting zero-downtime deployment..."

    cd "${DEPLOY_DIR}"

    # Start new containers
    docker-compose -f "${COMPOSE_FILE}" up -d --scale app=2 --no-recreate

    # Wait for new containers to be healthy
    log "Waiting for new containers to be healthy..."
    sleep 30

    # Health check
    HEALTH_CHECK_URL="http://localhost:4567/api/health"
    MAX_ATTEMPTS=30
    ATTEMPT=0

    while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
        if curl -f "${HEALTH_CHECK_URL}" > /dev/null 2>&1; then
            success "Health check passed"
            break
        fi

        ATTEMPT=$((ATTEMPT + 1))
        if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
            error "Health check failed after ${MAX_ATTEMPTS} attempts"
        fi

        sleep 5
    done

    # Remove old containers
    docker-compose -f "${COMPOSE_FILE}" up -d --scale app=1 --remove-orphans

    success "Zero-downtime deployment completed"
}

# Standard deployment
deploy_standard() {
    log "Starting standard deployment..."

    cd "${DEPLOY_DIR}"

    # Stop current deployment
    docker-compose -f "${COMPOSE_FILE}" down

    # Start new deployment
    docker-compose -f "${COMPOSE_FILE}" up -d

    # Wait for services to be ready
    sleep 10

    success "Standard deployment completed"
}

# Post-deployment checks
post_deployment_checks() {
    log "Running post-deployment checks..."

    # Check if containers are running
    if ! docker-compose -f "${DEPLOY_DIR}/${COMPOSE_FILE}" ps | grep -q "Up"; then
        error "Some containers are not running"
    fi

    # Check application health
    HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4567/api/health)
    if [ "$HEALTH_RESPONSE" != "200" ]; then
        error "Application health check failed with status: ${HEALTH_RESPONSE}"
    fi

    # Check database connectivity
    docker-compose -f "${DEPLOY_DIR}/${COMPOSE_FILE}" exec -T postgres \
        psql -U maifarm -d maifarm_prod -c "SELECT 1" > /dev/null 2>&1 || \
        error "Database connectivity check failed"

    # Check Redis connectivity
    docker-compose -f "${DEPLOY_DIR}/${COMPOSE_FILE}" exec -T redis \
        redis-cli ping > /dev/null 2>&1 || \
        warning "Redis connectivity check failed"

    success "Post-deployment checks passed"
}

# Clean up old resources
cleanup() {
    log "Cleaning up old resources..."

    # Remove dangling Docker images
    docker image prune -f

    # Remove old containers
    docker container prune -f

    # Clean build cache
    docker builder prune -f --keep-storage=5GB

    success "Cleanup completed"
}

# Send deployment notification
send_notification() {
    local STATUS=$1
    local MESSAGE=$2

    # Send to Slack (if configured)
    if [ -n "${SLACK_WEBHOOK_URL}" ]; then
        curl -X POST "${SLACK_WEBHOOK_URL}" \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"Deployment ${STATUS}: ${MESSAGE}\"}"
    fi

    # Log to file
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] Deployment ${STATUS}: ${MESSAGE}" >> "${DEPLOY_DIR}/deployment.log"
}

# Rollback function
rollback() {
    error "Deployment failed, initiating rollback..."

    cd "${DEPLOY_DIR}"

    # Get the last backup
    LAST_BACKUP=$(ls -t "${BACKUP_DIR}" | head -1)

    if [ -z "${LAST_BACKUP}" ]; then
        error "No backup found for rollback"
    fi

    log "Rolling back to ${LAST_BACKUP}..."

    # Restore database
    if [ -f "${BACKUP_DIR}/${LAST_BACKUP}/database.sql" ]; then
        docker-compose -f "${COMPOSE_FILE}" exec -T postgres \
            psql -U maifarm maifarm_prod < "${BACKUP_DIR}/${LAST_BACKUP}/database.sql"
    fi

    # Restore volumes
    if [ -f "${BACKUP_DIR}/${LAST_BACKUP}/volumes.tar.gz" ]; then
        docker run --rm -v maifarm_data:/data -v "${BACKUP_DIR}/${LAST_BACKUP}:/backup" \
            alpine tar xzf /backup/volumes.tar.gz -C /data
    fi

    # Restart with previous version
    docker-compose -f "${COMPOSE_FILE}" down
    docker-compose -f "${COMPOSE_FILE}" up -d

    send_notification "ROLLBACK" "Deployment rolled back to ${LAST_BACKUP}"

    exit 1
}

# Main deployment flow
main() {
    log "Starting MaiFarm production deployment..."

    # Set trap for rollback on error
    trap rollback ERR

    # Parse arguments
    DEPLOYMENT_TYPE="standard"
    SKIP_BACKUP=false

    while [[ "$#" -gt 0 ]]; do
        case $1 in
            --zero-downtime) DEPLOYMENT_TYPE="zero-downtime" ;;
            --skip-backup) SKIP_BACKUP=true ;;
            --help)
                echo "Usage: $0 [--zero-downtime] [--skip-backup]"
                exit 0
                ;;
            *) error "Unknown parameter: $1" ;;
        esac
        shift
    done

    # Execute deployment steps
    check_prerequisites

    if [ "$SKIP_BACKUP" = false ]; then
        backup_current
    fi

    pull_latest_code
    build_application
    run_migrations

    if [ "$DEPLOYMENT_TYPE" = "zero-downtime" ]; then
        deploy_zero_downtime
    else
        deploy_standard
    fi

    post_deployment_checks
    cleanup

    # Remove error trap
    trap - ERR

    send_notification "SUCCESS" "Deployment completed successfully"

    success "🚀 MaiFarm deployment completed successfully!"
}

# Run main function
main "$@"