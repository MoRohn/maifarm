#!/bin/bash
set -euo pipefail

# MaiFarm Production Deployment Script

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-staging}
VERSION=${2:-latest}
DEPLOYMENT_TYPE=${3:-blue-green}
REGISTRY=${REGISTRY:-ghcr.io}
IMAGE_NAME=${IMAGE_NAME:-maifarm/maifarm-pro}

# Functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Pre-deployment checks
pre_deployment_checks() {
    log "Running pre-deployment checks..."
    
    # Check if required tools are installed
    command -v docker >/dev/null 2>&1 || error "Docker is required but not installed"
    command -v kubectl >/dev/null 2>&1 || error "kubectl is required but not installed"
    
    # Verify environment
    if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
        error "Invalid environment: $ENVIRONMENT. Must be 'staging' or 'production'"
    fi
    
    # Verify deployment type
    if [[ ! "$DEPLOYMENT_TYPE" =~ ^(blue-green|canary|rolling)$ ]]; then
        error "Invalid deployment type: $DEPLOYMENT_TYPE"
    fi
    
    # Check if image exists
    if ! docker manifest inspect "$REGISTRY/$IMAGE_NAME:$VERSION" >/dev/null 2>&1; then
        error "Image $REGISTRY/$IMAGE_NAME:$VERSION not found"
    fi
    
    log "Pre-deployment checks passed"
}

# Blue-Green Deployment
deploy_blue_green() {
    log "Starting blue-green deployment..."
    
    # Determine current active environment
    CURRENT_ENV=$(kubectl get service maifarm-active -o jsonpath='{.spec.selector.env}' 2>/dev/null || echo "green")
    NEW_ENV=$([[ "$CURRENT_ENV" == "blue" ]] && echo "green" || echo "blue")
    
    log "Current environment: $CURRENT_ENV, deploying to: $NEW_ENV"
    
    # Deploy to new environment
    kubectl set image deployment/maifarm-$NEW_ENV \
        app=$REGISTRY/$IMAGE_NAME:$VERSION \
        --namespace=$ENVIRONMENT
    
    # Wait for rollout
    kubectl rollout status deployment/maifarm-$NEW_ENV \
        --namespace=$ENVIRONMENT \
        --timeout=10m
    
    # Run health checks
    ./scripts/health-check.sh $NEW_ENV $ENVIRONMENT
    
    # Switch traffic
    log "Switching traffic to $NEW_ENV environment..."
    kubectl patch service maifarm-active \
        -p '{"spec":{"selector":{"env":"'$NEW_ENV'"}}}' \
        --namespace=$ENVIRONMENT
    
    log "Blue-green deployment completed successfully"
}

# Canary Deployment
deploy_canary() {
    log "Starting canary deployment..."
    
    # Deploy canary version
    kubectl set image deployment/maifarm-canary \
        app=$REGISTRY/$IMAGE_NAME:$VERSION \
        --namespace=$ENVIRONMENT
    
    # Scale canary to 10%
    kubectl scale deployment/maifarm-canary --replicas=1 --namespace=$ENVIRONMENT
    kubectl scale deployment/maifarm-stable --replicas=9 --namespace=$ENVIRONMENT
    
    log "Canary deployed at 10% traffic"
    
    # Monitor canary
    log "Monitoring canary deployment for 30 minutes..."
    ./scripts/monitor-canary.sh 1800
    
    if [ $? -eq 0 ]; then
        log "Canary metrics look good, promoting to stable..."
        
        # Promote canary to stable
        kubectl set image deployment/maifarm-stable \
            app=$REGISTRY/$IMAGE_NAME:$VERSION \
            --namespace=$ENVIRONMENT
        
        # Scale back
        kubectl scale deployment/maifarm-stable --replicas=10 --namespace=$ENVIRONMENT
        kubectl scale deployment/maifarm-canary --replicas=0 --namespace=$ENVIRONMENT
        
        log "Canary deployment completed successfully"
    else
        error "Canary deployment failed metrics check"
    fi
}

# Rolling Deployment
deploy_rolling() {
    log "Starting rolling deployment..."
    
    # Update deployment
    kubectl set image deployment/maifarm \
        app=$REGISTRY/$IMAGE_NAME:$VERSION \
        --namespace=$ENVIRONMENT
    
    # Monitor rollout
    kubectl rollout status deployment/maifarm \
        --namespace=$ENVIRONMENT \
        --timeout=20m
    
    log "Rolling deployment completed successfully"
}

# Post-deployment tasks
post_deployment() {
    log "Running post-deployment tasks..."
    
    # Update deployment record
    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: deployment-info
  namespace: $ENVIRONMENT
data:
  version: "$VERSION"
  timestamp: "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  deployed_by: "${USER:-system}"
  deployment_type: "$DEPLOYMENT_TYPE"
EOF
    
    # Clear CDN cache
    if [ "$ENVIRONMENT" == "production" ]; then
        log "Clearing CDN cache..."
        # Add CDN cache clearing logic here
    fi
    
    # Send notifications
    ./scripts/notify-deployment.sh "$ENVIRONMENT" "$VERSION" "success"
    
    log "Post-deployment tasks completed"
}

# Main execution
main() {
    log "Starting deployment to $ENVIRONMENT with version $VERSION using $DEPLOYMENT_TYPE strategy"
    
    pre_deployment_checks
    
    case "$DEPLOYMENT_TYPE" in
        blue-green)
            deploy_blue_green
            ;;
        canary)
            deploy_canary
            ;;
        rolling)
            deploy_rolling
            ;;
        *)
            error "Unknown deployment type: $DEPLOYMENT_TYPE"
            ;;
    esac
    
    post_deployment
    
    log "Deployment completed successfully!"
}

# Run main function
main