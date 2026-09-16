#!/bin/bash

# Live monitoring script for farm creation and harvest completion
echo "🔍 Starting MaiFarm Creation Monitor..."
echo "================================================"
echo "Monitoring for:"
echo "  - API connection issues"
echo "  - WebSocket drops"
echo "  - Farm status transitions"
echo "  - Harvest collection"
echo "  - Barn updates"
echo "================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# API Base URL
API_BASE="http://localhost:4567/api"

# Function to check API endpoint
check_endpoint() {
    local endpoint=$1
    local response=$(curl -s -w "\n%{http_code}" "$API_BASE/$endpoint" 2>/dev/null)
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" == "200" ]; then
        echo -e "${GREEN}✓${NC} $endpoint: Connected"
        echo "  Response: $(echo $body | head -c 100)..."
    else
        echo -e "${RED}✗${NC} $endpoint: Failed (HTTP $http_code)"
    fi
}

# Function to monitor farms
monitor_farms() {
    local farms=$(curl -s "$API_BASE/farms" 2>/dev/null)
    if [ ! -z "$farms" ]; then
        local farm_count=$(echo "$farms" | grep -o '"id"' | wc -l)
        echo -e "${BLUE}📦 Active Farms:${NC} $farm_count"
        
        # Check for status changes
        echo "$farms" | grep -o '"status":"[^"]*"' | while read -r status; do
            if [[ $status == *"completed"* ]]; then
                echo -e "  ${GREEN}✓ Farm COMPLETED!${NC}"
            elif [[ $status == *"failed"* ]]; then
                echo -e "  ${RED}✗ Farm FAILED${NC}"
            elif [[ $status == *"running"* ]]; then
                echo -e "  ${YELLOW}⚡ Farm Running${NC}"
            fi
        done
    fi
}

# Function to monitor harvests
monitor_harvests() {
    local harvests=$(curl -s "$API_BASE/harvests" 2>/dev/null)
    if [ ! -z "$harvests" ]; then
        local harvest_count=$(echo "$harvests" | grep -o '"id"' | wc -l)
        if [ "$harvest_count" -gt 0 ]; then
            echo -e "${GREEN}🌾 Harvests Available:${NC} $harvest_count"
        fi
    fi
}

# Function to check WebSocket health
check_websocket() {
    local ws_health=$(curl -s "$API_BASE/websocket/health" 2>/dev/null)
    if [[ $ws_health == *"healthy"* ]]; then
        echo -e "${GREEN}✓${NC} WebSocket: Healthy"
    else
        echo -e "${RED}✗${NC} WebSocket: Issue detected"
        echo "  $ws_health"
    fi
}

# Main monitoring loop
iteration=0
while true; do
    clear
    echo "🔍 MaiFarm Monitor - $(date '+%H:%M:%S')"
    echo "================================================"
    echo ""
    
    # Check core endpoints
    echo "📡 API Status:"
    check_endpoint "health"
    check_endpoint "farms"
    check_endpoint "harvests"
    echo ""
    
    # Monitor WebSocket
    echo "🔌 WebSocket Status:"
    check_websocket
    echo ""
    
    # Monitor farms
    monitor_farms
    echo ""
    
    # Monitor harvests
    monitor_harvests
    echo ""
    
    # Check for errors in process
    echo "⚠️  Recent Errors:"
    if command -v lsof >/dev/null 2>&1; then
        # Check if server is listening
        if lsof -i :4567 | grep -q LISTEN; then
            echo -e "  ${GREEN}✓${NC} Server listening on port 4567"
        else
            echo -e "  ${RED}✗${NC} Server NOT listening on port 4567!"
        fi
    fi
    
    # Increment counter
    ((iteration++))
    echo ""
    echo "Monitoring iteration: $iteration"
    echo "Press Ctrl+C to stop monitoring"
    
    # Wait before next check
    sleep 2
done