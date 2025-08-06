#!/bin/bash
set -euo pipefail

# Health Check Script for MaiFarm

ENVIRONMENT=${1:-blue}
NAMESPACE=${2:-staging}
MAX_RETRIES=${3:-30}
RETRY_INTERVAL=${4:-10}

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[HEALTH]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Get service endpoint
get_endpoint() {
    if [ "$NAMESPACE" == "production" ]; then
        echo "https://maifarm.production.app"
    else
        kubectl get service maifarm-$ENVIRONMENT \
            -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' \
            --namespace=$NAMESPACE 2>/dev/null || echo "localhost"
    fi
}

# Check endpoint health
check_health() {
    local endpoint=$1
    local path=$2
    local expected_status=${3:-200}
    
    response=$(curl -s -o /dev/null -w "%{http_code}" \
        --connect-timeout 5 \
        --max-time 10 \
        "$endpoint$path" || echo "000")
    
    if [ "$response" == "$expected_status" ]; then
        return 0
    else
        return 1
    fi
}

# Check application metrics
check_metrics() {
    local endpoint=$1
    
    # Check response time
    response_time=$(curl -s -o /dev/null -w "%{time_total}" "$endpoint/api/health" || echo "999")
    
    if (( $(echo "$response_time > 2" | bc -l) )); then
        warning "Response time is high: ${response_time}s"
        return 1
    fi
    
    # Check error rate from metrics endpoint
    error_rate=$(curl -s "$endpoint/api/metrics" | jq -r '.error_rate // 0' || echo "100")
    
    if (( $(echo "$error_rate > 5" | bc -l) )); then
        warning "Error rate is high: ${error_rate}%"
        return 1
    fi
    
    return 0
}

# Main health check
main() {
    log "Starting health checks for $ENVIRONMENT environment in $NAMESPACE namespace"
    
    ENDPOINT=$(get_endpoint)
    log "Checking endpoint: $ENDPOINT"
    
    # Health check endpoints
    declare -a endpoints=(
        "/api/health:200"
        "/api/ready:200"
        "/:200"
        "/dashboard:200"
        "/api/version:200"
    )
    
    # Retry loop
    for i in $(seq 1 $MAX_RETRIES); do
        all_healthy=true
        
        log "Health check attempt $i/$MAX_RETRIES"
        
        # Check each endpoint
        for endpoint_check in "${endpoints[@]}"; do
            IFS=':' read -r path expected_status <<< "$endpoint_check"
            
            if check_health "$ENDPOINT" "$path" "$expected_status"; then
                log "✓ $path is healthy"
            else
                error "✗ $path is not responding correctly"
                all_healthy=false
            fi
        done
        
        # Check metrics if basic health checks pass
        if $all_healthy; then
            if check_metrics "$ENDPOINT"; then
                log "✓ Application metrics are within thresholds"
            else
                warning "Application metrics show potential issues"
                all_healthy=false
            fi
        fi
        
        # If all checks pass, exit successfully
        if $all_healthy; then
            log "All health checks passed!"
            
            # Final verification - check pod status
            ready_pods=$(kubectl get pods -l app=maifarm,env=$ENVIRONMENT \
                --namespace=$NAMESPACE \
                -o jsonpath='{.items[?(@.status.phase=="Running")].metadata.name}' | wc -w)
            
            if [ "$ready_pods" -gt 0 ]; then
                log "$ready_pods pods are running and ready"
                exit 0
            else
                error "No pods are in Running state"
            fi
        fi
        
        # Wait before retry
        if [ $i -lt $MAX_RETRIES ]; then
            warning "Some checks failed, retrying in $RETRY_INTERVAL seconds..."
            sleep $RETRY_INTERVAL
        fi
    done
    
    error "Health checks failed after $MAX_RETRIES attempts"
    exit 1
}

# Run main
main