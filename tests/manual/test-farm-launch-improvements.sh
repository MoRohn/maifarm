#!/bin/bash

MAIFARM_ROOT="${MAIFARM_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
export MAIFARM_ROOT

# Test Script for Robust Farm Launch Improvements
# Tests all farm modes with various configurations to ensure high success rate

set -e

echo "=========================================="
echo "  FARM LAUNCH IMPROVEMENT TEST SUITE     "
echo "=========================================="
echo ""

# Configuration
API_BASE="http://localhost:4567/api"
LOG_FILE="farm-launch-test-$(date +%Y%m%d-%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to log messages
log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

# Function to run a test
run_test() {
    local test_name="$1"
    local endpoint="$2"
    local payload="$3"
    local expected_status="$4"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    log "${BLUE}[TEST $TOTAL_TESTS] $test_name${NC}"
    log "Endpoint: $endpoint"
    log "Payload: $payload"

    # Make the API call
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "$API_BASE$endpoint" 2>/dev/null || echo '{"success": false, "error": "Connection failed"}')

    # Check if response is valid JSON
    if ! echo "$response" | jq . >/dev/null 2>&1; then
        log "${RED}✗ Invalid JSON response${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi

    # Extract success status
    success=$(echo "$response" | jq -r '.success')
    farmId=$(echo "$response" | jq -r '.farmId // "none"')
    sessionName=$(echo "$response" | jq -r '.sessionName // "none"')
    error=$(echo "$response" | jq -r '.error // "none"')

    if [ "$success" = "$expected_status" ]; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
        log "${GREEN}✓ Test passed${NC}"
        log "  Farm ID: $farmId"
        log "  Session: $sessionName"

        # If farm was created, wait and check terminal streaming
        if [ "$success" = "true" ] && [ "$farmId" != "none" ]; then
            sleep 5
            check_terminal_streaming "$farmId"
        fi
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
        log "${RED}✗ Test failed${NC}"
        log "  Expected: success=$expected_status"
        log "  Got: success=$success"
        log "  Error: $error"
    fi

    echo ""
    return 0
}

# Function to check terminal streaming
check_terminal_streaming() {
    local farmId="$1"

    log "  Checking terminal streaming for farm $farmId..."

    # Check if terminal output files exist
    terminal_dir="${MAIFARM_ROOT}/var/maibarn/terminals/$farmId"

    if [ -d "$terminal_dir" ]; then
        file_count=$(ls -1 "$terminal_dir"/agent-*.log 2>/dev/null | wc -l)
        if [ "$file_count" -gt 0 ]; then
            log "  ${GREEN}✓ Terminal files created: $file_count agents${NC}"

            # Check if files have content (wait up to 10 seconds)
            for i in {1..10}; do
                total_size=$(du -b "$terminal_dir"/agent-*.log 2>/dev/null | awk '{sum+=$1} END {print sum}')
                if [ "$total_size" -gt 0 ]; then
                    log "  ${GREEN}✓ Terminal output detected: ${total_size} bytes${NC}"
                    break
                fi
                sleep 1
            done
        else
            log "  ${YELLOW}⚠ No terminal files found${NC}"
        fi
    else
        log "  ${YELLOW}⚠ Terminal directory not created${NC}"
    fi
}

# Function to cleanup test farms
cleanup_farms() {
    log "${YELLOW}Cleaning up test farms...${NC}"

    # Kill all test tmux sessions
    TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null | grep -E "^(farm|quick|wild)-" | cut -d: -f1 | while read session; do
        log "  Killing session: $session"
        TMUX_TMPDIR=/tmp tmux kill-session -t "$session" 2>/dev/null || true
    done

    log "${GREEN}Cleanup complete${NC}"
}

# Start testing
log "${YELLOW}Starting Farm Launch Test Suite${NC}"
log "Timestamp: $(date)"
log "Log file: $LOG_FILE"
echo ""

# Test 1: Quick Task Mode (Single Agent)
run_test "Quick Task - Single Agent" \
    "/farms" \
    '{
        "mode": "quick_task",
        "prompt": "Write a hello world function in Python",
        "agentCount": 1
    }' \
    "true"

sleep 2

# Test 2: Quick Task Mode (Multiple Agents)
run_test "Quick Task - Multiple Agents" \
    "/farms" \
    '{
        "mode": "quick_task",
        "prompt": "Analyze this code for improvements",
        "agentCount": 2
    }' \
    "true"

sleep 2

# Test 3: Harvest Mode (Standard)
run_test "Harvest Mode - Standard (3 agents)" \
    "/farms" \
    '{
        "mode": "harvest",
        "prompt": "Build a REST API with authentication",
        "agentCount": 3,
        "provider": "claude"
    }' \
    "true"

sleep 3

# Test 4: Harvest Mode (Large Team)
run_test "Harvest Mode - Large Team (5 agents)" \
    "/farms" \
    '{
        "mode": "harvest",
        "prompt": "Refactor this codebase for better performance",
        "agentCount": 5,
        "timeout": 1800
    }' \
    "true"

sleep 3

# Test 5: Go Wild Mode
run_test "Go Wild Mode - High Creativity" \
    "/farms" \
    '{
        "mode": "go_wild",
        "prompt": "Create an innovative solution for task management",
        "agentCount": 5,
        "creativityLevel": 90,
        "timeout": 1800
    }' \
    "true"

sleep 3

# Test 6: XenoSync Integration
run_test "XenoSync Multi-Agent" \
    "/farms" \
    '{
        "mode": "harvest",
        "prompt": "Implement a distributed system",
        "agentCount": 4,
        "provider": "claude",
        "useXenoSync": true
    }' \
    "true"

sleep 3

# Test 7: Error Recovery (Invalid Provider)
run_test "Error Handling - Invalid Provider" \
    "/farms" \
    '{
        "mode": "harvest",
        "prompt": "Test error handling",
        "provider": "invalid_provider"
    }' \
    "false"

# Test 8: Boundary Testing (Min Agents)
run_test "Boundary Test - Minimum Agents" \
    "/farms" \
    '{
        "mode": "harvest",
        "prompt": "Test with minimum agents",
        "agentCount": 1
    }' \
    "true"

sleep 2

# Test 9: Boundary Testing (Max Agents)
run_test "Boundary Test - Maximum Agents" \
    "/farms" \
    '{
        "mode": "go_wild",
        "prompt": "Test with maximum agents",
        "agentCount": 10
    }' \
    "true"

sleep 3

# Test 10: Rapid Sequential Launches
log "${BLUE}[TEST BATCH] Rapid Sequential Launches${NC}"
for i in {1..3}; do
    run_test "Rapid Launch $i" \
        "/farms" \
        "{
            \"mode\": \"quick_task\",
            \"prompt\": \"Rapid test $i\",
            \"agentCount\": 1
        }" \
        "true"
    sleep 1
done

# Performance Test: Parallel Launch Timing
log "${BLUE}[PERFORMANCE TEST] Launch Speed Test${NC}"
start_time=$(date +%s%3N)

response=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d '{
        "mode": "harvest",
        "prompt": "Performance test",
        "agentCount": 3
    }' \
    "$API_BASE/farms")

end_time=$(date +%s%3N)
launch_time=$((end_time - start_time))

if echo "$response" | jq -r '.success' | grep -q "true"; then
    log "${GREEN}✓ Launch completed in ${launch_time}ms${NC}"
    if [ "$launch_time" -lt 5000 ]; then
        log "  ${GREEN}✓ Excellent performance (<5s)${NC}"
    elif [ "$launch_time" -lt 10000 ]; then
        log "  ${YELLOW}⚠ Good performance (<10s)${NC}"
    else
        log "  ${RED}✗ Poor performance (>10s)${NC}"
    fi
else
    log "${RED}✗ Launch failed${NC}"
fi

echo ""

# WebSocket Connection Test
log "${BLUE}[WEBSOCKET TEST] Terminal Streaming${NC}"
if command -v websocat &> /dev/null; then
    # Test WebSocket connection if websocat is available
    timeout 5 websocat -t ws://localhost:4567/socket.io/ 2>/dev/null | head -n 1 && \
        log "${GREEN}✓ WebSocket connection successful${NC}" || \
        log "${YELLOW}⚠ WebSocket connection timeout${NC}"
else
    log "${YELLOW}⚠ websocat not installed, skipping WebSocket test${NC}"
fi

echo ""

# Summary
log "=========================================="
log "              TEST SUMMARY                "
log "=========================================="
log "Total Tests:  $TOTAL_TESTS"
log "${GREEN}Passed:       $PASSED_TESTS${NC}"
log "${RED}Failed:       $FAILED_TESTS${NC}"

success_rate=$((PASSED_TESTS * 100 / TOTAL_TESTS))
log "Success Rate: ${success_rate}%"

if [ "$success_rate" -ge 90 ]; then
    log "${GREEN}✓ EXCELLENT: Success rate is ${success_rate}%${NC}"
elif [ "$success_rate" -ge 80 ]; then
    log "${YELLOW}⚠ GOOD: Success rate is ${success_rate}%${NC}"
else
    log "${RED}✗ NEEDS IMPROVEMENT: Success rate is ${success_rate}%${NC}"
fi

echo ""

# Cleanup option
read -p "Do you want to cleanup test farms? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    cleanup_farms
fi

log ""
log "Test suite completed. Full log saved to: $LOG_FILE"

# Exit with appropriate code
if [ "$FAILED_TESTS" -gt 0 ]; then
    exit 1
else
    exit 0
fi