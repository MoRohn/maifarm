#!/bin/bash

# Blue-Green Deployment Script for MaiFarm
# This script handles zero-downtime deployments using blue-green strategy

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT=""
VERSION=""
IMAGE=""
HEALTH_CHECK_RETRIES=30
HEALTH_CHECK_INTERVAL=10
ROLLBACK_ON_FAILURE=true

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --version)
            VERSION="$2"
            shift 2
            ;;
        --image)
            IMAGE="$2"
            shift 2
            ;;
        --health-check-retries)
            HEALTH_CHECK_RETRIES="$2"
            shift 2
            ;;
        --no-rollback)
            ROLLBACK_ON_FAILURE=false
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Validate required parameters
if [[ -z "$ENVIRONMENT" ]] || [[ -z "$VERSION" ]] || [[ -z "$IMAGE" ]]; then
    echo -e "${RED}Error: Missing required parameters${NC}"
    echo "Usage: $0 --environment <blue|green> --version <version> --image <image>"
    exit 1
fi

# Function to log with timestamp
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# Function to log errors
error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

# Function to log success
success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1"
}

# Function to check if environment is healthy
check_health() {
    local env=$1
    local endpoint=$2
    local retries=$3
    
    log "Checking health of $env environment..."
    
    for i in $(seq 1 $retries); do
        if curl -f -s -o /dev/null "$endpoint/api/health"; then
            success "$env environment is healthy"
            return 0
        fi
        
        if [[ $i -lt $retries ]]; then
            log "Health check failed, retrying in ${HEALTH_CHECK_INTERVAL}s... ($i/$retries)"
            sleep $HEALTH_CHECK_INTERVAL
        fi
    done
    
    error "$env environment health check failed after $retries attempts"
    return 1
}

# Function to get current active environment
get_active_environment() {
    local active_env=$(aws elbv2 describe-target-groups \
        --names maifarm-production-tg \
        --query 'TargetGroups[0].Tags[?Key==`ActiveEnvironment`].Value' \
        --output text)
    
    echo "$active_env"
}

# Function to deploy to environment
deploy_to_environment() {
    local env=$1
    local image=$2
    
    log "Deploying $image to $env environment..."
    
    # Update ECS task definition
    local task_def=$(aws ecs describe-task-definition \
        --task-definition "maifarm-$env" \
        --query 'taskDefinition' | \
        jq --arg IMAGE "$image" '.containerDefinitions[0].image = $IMAGE | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)')
    
    # Register new task definition
    local new_task_arn=$(aws ecs register-task-definition \
        --cli-input-json "$task_def" \
        --query 'taskDefinition.taskDefinitionArn' \
        --output text)
    
    # Update service with new task definition
    aws ecs update-service \
        --cluster maifarm-production \
        --service "maifarm-$env-service" \
        --task-definition "$new_task_arn" \
        --force-new-deployment
    
    # Wait for service to stabilize
    log "Waiting for $env service to stabilize..."
    aws ecs wait services-stable \
        --cluster maifarm-production \
        --services "maifarm-$env-service"
    
    success "Deployment to $env environment completed"
}

# Function to switch traffic between environments
switch_traffic() {
    local from_env=$1
    local to_env=$2
    local percentage=$3
    
    log "Switching ${percentage}% traffic from $from_env to $to_env..."
    
    # Get target group ARNs
    local from_tg_arn=$(aws elbv2 describe-target-groups \
        --names "maifarm-$from_env-tg" \
        --query 'TargetGroups[0].TargetGroupArn' \
        --output text)
    
    local to_tg_arn=$(aws elbv2 describe-target-groups \
        --names "maifarm-$to_env-tg" \
        --query 'TargetGroups[0].TargetGroupArn' \
        --output text)
    
    # Get listener ARN
    local listener_arn=$(aws elbv2 describe-listeners \
        --load-balancer-arn "$(aws elbv2 describe-load-balancers \
            --names maifarm-production-alb \
            --query 'LoadBalancers[0].LoadBalancerArn' \
            --output text)" \
        --query 'Listeners[?Port==`443`].ListenerArn' \
        --output text)
    
    # Update listener rules for traffic distribution
    if [[ "$percentage" -eq 100 ]]; then
        # Full switch
        aws elbv2 modify-listener \
            --listener-arn "$listener_arn" \
            --default-actions "Type=forward,TargetGroupArn=$to_tg_arn"
    else
        # Weighted traffic distribution
        aws elbv2 modify-listener \
            --listener-arn "$listener_arn" \
            --default-actions "Type=forward,ForwardConfig={TargetGroups=[{TargetGroupArn=$from_tg_arn,Weight=$((100-percentage))},{TargetGroupArn=$to_tg_arn,Weight=$percentage}]}"
    fi
    
    # Update active environment tag
    if [[ "$percentage" -eq 100 ]]; then
        aws elbv2 add-tags \
            --resource-arns "$to_tg_arn" \
            --tags "Key=ActiveEnvironment,Value=$to_env"
        
        aws elbv2 remove-tags \
            --resource-arns "$from_tg_arn" \
            --tag-keys "ActiveEnvironment"
    fi
    
    success "Traffic switch completed: ${percentage}% now going to $to_env"
}

# Function to run smoke tests
run_smoke_tests() {
    local env=$1
    local endpoint=$2
    
    log "Running smoke tests on $env environment..."
    
    # Basic connectivity test
    if ! curl -f -s "$endpoint/api/health" > /dev/null; then
        error "Basic connectivity test failed"
        return 1
    fi
    
    # Check critical endpoints
    local endpoints=(
        "/api/farms"
        "/api/agents"
        "/api/monitoring/metrics"
    )
    
    for ep in "${endpoints[@]}"; do
        if ! curl -f -s "$endpoint$ep" > /dev/null; then
            error "Endpoint test failed: $ep"
            return 1
        fi
    done
    
    # Check WebSocket connectivity
    if ! timeout 5 bash -c "echo 'test' | websocat -t -n '$endpoint/ws' > /dev/null 2>&1"; then
        error "WebSocket connectivity test failed"
        return 1
    fi
    
    success "All smoke tests passed"
    return 0
}

# Function to monitor deployment metrics
monitor_deployment() {
    local env=$1
    local duration=$2
    local error_threshold=$3
    
    log "Monitoring $env deployment for ${duration}s..."
    
    local start_time=$(date +%s)
    local end_time=$((start_time + duration))
    local errors=0
    local requests=0
    
    while [[ $(date +%s) -lt $end_time ]]; do
        # Get current metrics
        local metrics=$(curl -s "$ENDPOINT/api/metrics")
        local current_errors=$(echo "$metrics" | jq '.errors_total')
        local current_requests=$(echo "$metrics" | jq '.requests_total')
        
        local error_rate=0
        if [[ $current_requests -gt 0 ]]; then
            error_rate=$(echo "scale=4; $current_errors / $current_requests" | bc)
        fi
        
        if (( $(echo "$error_rate > $error_threshold" | bc -l) )); then
            error "Error rate ${error_rate} exceeds threshold ${error_threshold}"
            return 1
        fi
        
        log "Current error rate: ${error_rate} (${current_errors}/${current_requests})"
        sleep 10
    done
    
    success "Monitoring completed successfully"
    return 0
}

# Function to rollback deployment
rollback() {
    local from_env=$1
    local to_env=$2
    
    error "Deployment failed, initiating rollback..."
    
    # Switch traffic back
    switch_traffic "$from_env" "$to_env" 100
    
    # Mark deployment as failed
    aws ecs tag-resource \
        --resource-arn "arn:aws:ecs:us-east-1:123456789012:service/maifarm-production/maifarm-$from_env-service" \
        --tags "key=DeploymentStatus,value=Failed" "key=FailedVersion,value=$VERSION"
    
    error "Rollback completed. Deployment of version $VERSION failed."
    exit 1
}

# Main deployment flow
main() {
    log "Starting blue-green deployment"
    log "Environment: $ENVIRONMENT"
    log "Version: $VERSION"
    log "Image: $IMAGE"
    
    # Determine inactive environment
    local active_env=$(get_active_environment)
    local inactive_env="blue"
    if [[ "$active_env" == "blue" ]]; then
        inactive_env="green"
    fi
    
    log "Active environment: $active_env"
    log "Deploying to inactive environment: $inactive_env"
    
    # Deploy to inactive environment
    deploy_to_environment "$inactive_env" "$IMAGE"
    
    # Get endpoints
    local inactive_endpoint="https://${inactive_env}.maifarm.production.app"
    local active_endpoint="https://${active_env}.maifarm.production.app"
    
    # Health check on new deployment
    if ! check_health "$inactive_env" "$inactive_endpoint" "$HEALTH_CHECK_RETRIES"; then
        error "Health check failed on $inactive_env environment"
        if [[ "$ROLLBACK_ON_FAILURE" == true ]]; then
            rollback "$inactive_env" "$active_env"
        fi
        exit 1
    fi
    
    # Run smoke tests
    if ! run_smoke_tests "$inactive_env" "$inactive_endpoint"; then
        error "Smoke tests failed on $inactive_env environment"
        if [[ "$ROLLBACK_ON_FAILURE" == true ]]; then
            rollback "$inactive_env" "$active_env"
        fi
        exit 1
    fi
    
    # Gradual traffic switch
    log "Starting gradual traffic switch..."
    
    # 10% canary
    switch_traffic "$active_env" "$inactive_env" 10
    sleep 60
    
    if ! monitor_deployment "$inactive_env" 300 0.05; then
        error "Canary deployment monitoring failed"
        if [[ "$ROLLBACK_ON_FAILURE" == true ]]; then
            rollback "$inactive_env" "$active_env"
        fi
        exit 1
    fi
    
    # 50% traffic
    switch_traffic "$active_env" "$inactive_env" 50
    sleep 60
    
    if ! monitor_deployment "$inactive_env" 300 0.05; then
        error "50% deployment monitoring failed"
        if [[ "$ROLLBACK_ON_FAILURE" == true ]]; then
            rollback "$inactive_env" "$active_env"
        fi
        exit 1
    fi
    
    # 100% traffic
    switch_traffic "$active_env" "$inactive_env" 100
    
    # Final monitoring
    if ! monitor_deployment "$inactive_env" 600 0.05; then
        error "Final deployment monitoring failed"
        if [[ "$ROLLBACK_ON_FAILURE" == true ]]; then
            rollback "$inactive_env" "$active_env"
        fi
        exit 1
    fi
    
    # Tag successful deployment
    aws ecs tag-resource \
        --resource-arn "arn:aws:ecs:us-east-1:123456789012:service/maifarm-production/maifarm-$inactive_env-service" \
        --tags "key=DeploymentStatus,value=Success" "key=Version,value=$VERSION" "key=DeployedAt,value=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    
    success "Blue-green deployment completed successfully!"
    success "Version $VERSION is now live on $inactive_env environment"
}

# Run main function
main