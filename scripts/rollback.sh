#!/bin/bash
set -euo pipefail

# MaiFarm Rollback Script

# Configuration
DEPLOYMENT_TYPE=${1:-blue-green}
REASON=${2:-"Manual rollback requested"}
NAMESPACE=${3:-production}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[ROLLBACK]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Get previous version
get_previous_version() {
    kubectl get configmap deployment-info \
        --namespace=$NAMESPACE \
        -o jsonpath='{.data.previous_version}' 2>/dev/null || echo "unknown"
}

# Blue-Green Rollback
rollback_blue_green() {
    log "Starting blue-green rollback..."
    
    # Get current active environment
    CURRENT_ENV=$(kubectl get service maifarm-active \
        -o jsonpath='{.spec.selector.env}' \
        --namespace=$NAMESPACE)
    
    PREVIOUS_ENV=$([[ "$CURRENT_ENV" == "blue" ]] && echo "green" || echo "blue")
    
    log "Rolling back from $CURRENT_ENV to $PREVIOUS_ENV"
    
    # Verify previous environment is healthy
    ./scripts/health-check.sh $PREVIOUS_ENV $NAMESPACE 5 5
    
    if [ $? -eq 0 ]; then
        # Switch traffic back
        kubectl patch service maifarm-active \
            -p '{"spec":{"selector":{"env":"'$PREVIOUS_ENV'"}}}' \
            --namespace=$NAMESPACE
        
        log "Traffic switched back to $PREVIOUS_ENV environment"
    else
        error "Previous environment $PREVIOUS_ENV is not healthy, cannot rollback"
    fi
}

# Canary Rollback
rollback_canary() {
    log "Starting canary rollback..."
    
    # Scale canary to 0
    kubectl scale deployment/maifarm-canary --replicas=0 --namespace=$NAMESPACE
    
    # Scale stable back to full
    kubectl scale deployment/maifarm-stable --replicas=10 --namespace=$NAMESPACE
    
    log "Canary deployment rolled back"
}

# Rolling Rollback
rollback_rolling() {
    log "Starting rolling deployment rollback..."
    
    # Get rollout history
    PREVIOUS_REVISION=$(kubectl rollout history deployment/maifarm \
        --namespace=$NAMESPACE | tail -2 | head -1 | awk '{print $1}')
    
    if [ -z "$PREVIOUS_REVISION" ]; then
        error "No previous revision found"
    fi
    
    log "Rolling back to revision $PREVIOUS_REVISION"
    
    # Rollback to previous revision
    kubectl rollout undo deployment/maifarm \
        --to-revision=$PREVIOUS_REVISION \
        --namespace=$NAMESPACE
    
    # Wait for rollback to complete
    kubectl rollout status deployment/maifarm \
        --namespace=$NAMESPACE \
        --timeout=10m
}

# Create rollback record
record_rollback() {
    local previous_version=$1
    
    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: rollback-record-$(date +%s)
  namespace: $NAMESPACE
  labels:
    type: rollback
data:
  timestamp: "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  reason: "$REASON"
  rolled_back_by: "${USER:-system}"
  previous_version: "$previous_version"
  deployment_type: "$DEPLOYMENT_TYPE"
EOF
}

# Send notifications
send_notifications() {
    local status=$1
    
    # Slack notification
    if [ -n "${SLACK_WEBHOOK:-}" ]; then
        curl -X POST "$SLACK_WEBHOOK" \
            -H 'Content-type: application/json' \
            -d "{
                \"text\": \"🔄 MaiFarm Rollback $status\",
                \"attachments\": [{
                    \"color\": \"$([ "$status" == "completed" ] && echo "warning" || echo "danger")\",
                    \"fields\": [{
                        \"title\": \"Environment\",
                        \"value\": \"$NAMESPACE\",
                        \"short\": true
                    }, {
                        \"title\": \"Reason\",
                        \"value\": \"$REASON\",
                        \"short\": false
                    }, {
                        \"title\": \"Initiated by\",
                        \"value\": \"${USER:-system}\",
                        \"short\": true
                    }]
                }]
            }"
    fi
    
    # Log to monitoring system
    echo "rollback_$status{environment=\"$NAMESPACE\",type=\"$DEPLOYMENT_TYPE\"} 1" | \
        curl -X POST http://prometheus-pushgateway:9091/metrics/job/rollback \
        --data-binary @- 2>/dev/null || true
}

# Main execution
main() {
    log "Starting rollback for $DEPLOYMENT_TYPE deployment in $NAMESPACE"
    log "Reason: $REASON"
    
    # Get previous version before rollback
    PREVIOUS_VERSION=$(get_previous_version)
    
    # Send start notification
    send_notifications "started"
    
    case "$DEPLOYMENT_TYPE" in
        blue-green)
            rollback_blue_green
            ;;
        canary)
            rollback_canary
            ;;
        rolling)
            rollback_rolling
            ;;
        *)
            error "Unknown deployment type: $DEPLOYMENT_TYPE"
            ;;
    esac
    
    # Verify rollback success
    sleep 10
    ./scripts/health-check.sh "active" $NAMESPACE 10 5
    
    if [ $? -eq 0 ]; then
        log "Rollback completed successfully"
        record_rollback "$PREVIOUS_VERSION"
        send_notifications "completed"
        exit 0
    else
        error "Rollback verification failed"
        send_notifications "failed"
        exit 1
    fi
}

# Confirm rollback
if [ "$NAMESPACE" == "production" ] && [ -t 0 ]; then
    warning "You are about to rollback the PRODUCTION deployment!"
    read -p "Are you sure? (yes/no): " confirmation
    if [ "$confirmation" != "yes" ]; then
        log "Rollback cancelled"
        exit 0
    fi
fi

# Run main
main