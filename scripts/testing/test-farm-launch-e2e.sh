#!/bin/bash

MAIFARM_ROOT="${MAIFARM_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
export MAIFARM_ROOT

# End-to-End Farm Launch Test Script
# Tests all three farm modes with comprehensive validation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# API endpoint
API_URL="http://localhost:4567/api"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   MaiFarm E2E Launch Test Suite${NC}"
echo -e "${BLUE}========================================${NC}"
echo

# Function to test farm creation
test_farm_mode() {
    local mode=$1
    local prompt=$2
    local expected_agents=$3

    echo -e "${YELLOW}Testing ${mode} mode...${NC}"

    # Create farm
    response=$(curl -s -X POST "${API_URL}/farms" \
        -H "Content-Type: application/json" \
        -d "{
            \"mode\": \"${mode}\",
            \"prompt\": \"${prompt}\",
            \"agentCount\": ${expected_agents},
            \"provider\": \"claude\"
        }")

    farm_id=$(echo "$response" | jq -r '.farmId // .data.farmId // .farm.id')

    if [ "$farm_id" = "null" ] || [ -z "$farm_id" ]; then
        echo -e "${RED}✗ Failed to create ${mode} farm${NC}"
        echo "Response: $response"
        return 1
    fi

    echo -e "${GREEN}✓ Created ${mode} farm: ${farm_id}${NC}"

    # Wait for farm to initialize
    sleep 5

    # Check farm health
    health_response=$(curl -s "${API_URL}/farms/${farm_id}/health")
    health_status=$(echo "$health_response" | jq -r '.data.overall // "unknown"')

    if [ "$health_status" = "healthy" ] || [ "$health_status" = "degraded" ]; then
        echo -e "${GREEN}✓ Farm health: ${health_status}${NC}"
    else
        echo -e "${YELLOW}⚠ Farm health: ${health_status}${NC}"
    fi

    # Check tmux session
    session_name="farm-${farm_id:0:8}"
    if [ "$mode" = "quick_task" ]; then
        session_name="quick-${farm_id:0:8}"
    elif [ "$mode" = "go_wild" ]; then
        session_name="wild-${farm_id:0:8}"
    fi

    if TMUX_TMPDIR=/tmp tmux has-session -t "$session_name" 2>/dev/null; then
        echo -e "${GREEN}✓ Tmux session exists: ${session_name}${NC}"

        # Count panes
        pane_count=$(TMUX_TMPDIR=/tmp tmux list-panes -t "${session_name}:agents" 2>/dev/null | wc -l || echo 0)
        if [ "$pane_count" -eq "$expected_agents" ]; then
            echo -e "${GREEN}✓ Correct number of panes: ${pane_count}${NC}"
        else
            echo -e "${RED}✗ Wrong number of panes: ${pane_count} (expected ${expected_agents})${NC}"
        fi
    else
        echo -e "${RED}✗ Tmux session not found: ${session_name}${NC}"
    fi

    # Check terminal streaming
    terminal_response=$(curl -s "${API_URL}/terminal-health")
    active_farms=$(echo "$terminal_response" | jq -r '.data.farms[]' 2>/dev/null | grep "$farm_id" || echo "")

    if [ -n "$active_farms" ]; then
        echo -e "${GREEN}✓ Terminal streaming active${NC}"
    else
        echo -e "${YELLOW}⚠ Terminal streaming not detected${NC}"
    fi

    # Check WebSocket health
    ws_response=$(curl -s "${API_URL}/websocket-health")
    ws_connected=$(echo "$ws_response" | jq -r '.data.connected // false')

    if [ "$ws_connected" = "true" ]; then
        echo -e "${GREEN}✓ WebSocket server healthy${NC}"
    else
        echo -e "${YELLOW}⚠ WebSocket server issues${NC}"
    fi

    # Check orchestrator heartbeat
    heartbeat_file="${MAIFARM_ROOT}/var/maibarn/terminals/${farm_id}/orchestrator.heartbeat"
    if [ -f "$heartbeat_file" ]; then
        last_modified=$(stat -f "%m" "$heartbeat_file" 2>/dev/null || stat -c "%Y" "$heartbeat_file" 2>/dev/null || echo "0")
        current_time=$(date +%s)
        age=$((current_time - last_modified))

        if [ "$age" -lt 20 ]; then
            echo -e "${GREEN}✓ Orchestrator heartbeat active (${age}s ago)${NC}"
        else
            echo -e "${YELLOW}⚠ Orchestrator heartbeat stale (${age}s ago)${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ Orchestrator heartbeat not found${NC}"
    fi

    # Check log files
    log_dir="${MAIFARM_ROOT}/var/maibarn/terminals/${farm_id}"
    if [ -d "$log_dir" ]; then
        log_count=$(ls -1 "$log_dir"/agent-*.log 2>/dev/null | wc -l || echo 0)
        if [ "$log_count" -eq "$expected_agents" ]; then
            echo -e "${GREEN}✓ All agent log files present: ${log_count}${NC}"

            # Check if logs have content
            for log_file in "$log_dir"/agent-*.log; do
                if [ -s "$log_file" ]; then
                    echo -e "${GREEN}  ✓ $(basename $log_file) has content${NC}"
                else
                    echo -e "${YELLOW}  ⚠ $(basename $log_file) is empty${NC}"
                fi
            done
        else
            echo -e "${RED}✗ Wrong number of log files: ${log_count} (expected ${expected_agents})${NC}"
        fi
    else
        echo -e "${RED}✗ Terminal log directory not found${NC}"
    fi

    echo
    return 0
}

# Test 1: Quick Task Mode (1 agent, 5 min timeout)
echo -e "${BLUE}=== Test 1: Quick Task Mode ===${NC}"
test_farm_mode "quick_task" "Write a simple hello world function in Python" 1

# Test 2: Harvest Mode (3 agents, standard)
echo -e "${BLUE}=== Test 2: Harvest Mode ===${NC}"
test_farm_mode "harvest" "Create a REST API with user authentication" 3

# Test 3: Go Wild Mode (5 agents, creative)
echo -e "${BLUE}=== Test 3: Go Wild Mode ===${NC}"
test_farm_mode "go_wild" "Build an innovative AI-powered application that solves a real-world problem" 5

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"

# Check overall system health
overall_health=$(curl -s "${API_URL}/health" | jq -r '.status // "unknown"')
echo -e "Overall system health: ${overall_health}"

# List all active farms
active_farms=$(curl -s "${API_URL}/farms" | jq -r '.data[] | select(.status == "active" or .status == "running") | .id' 2>/dev/null | wc -l || echo 0)
echo -e "Active farms: ${active_farms}"

# Check all farms health
all_farms_health=$(curl -s "${API_URL}/farms/health")
healthy_farms=$(echo "$all_farms_health" | jq -r '.data[] | select(.overall == "healthy") | .farmId' 2>/dev/null | wc -l || echo 0)
degraded_farms=$(echo "$all_farms_health" | jq -r '.data[] | select(.overall == "degraded") | .farmId' 2>/dev/null | wc -l || echo 0)
failed_farms=$(echo "$all_farms_health" | jq -r '.data[] | select(.overall == "failed") | .farmId' 2>/dev/null | wc -l || echo 0)

echo -e "Farm health distribution:"
echo -e "  Healthy: ${healthy_farms}"
echo -e "  Degraded: ${degraded_farms}"
echo -e "  Failed: ${failed_farms}"

echo
echo -e "${GREEN}✓ E2E test completed${NC}"
echo -e "${YELLOW}Note: Some warnings are expected during initial setup${NC}"