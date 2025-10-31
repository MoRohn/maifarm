#!/bin/bash

# Terminal Streaming Validation Test
# Tests end-to-end terminal streaming from farm creation to WebSocket delivery

set -e

API_URL="${API_URL:-http://localhost:4567}"
FARM_NAME="Terminal Stream Test $(date +%s)"
COLOR_GREEN='\033[0;32m'
COLOR_RED='\033[0;31m'
COLOR_YELLOW='\033[1;33m'
COLOR_RESET='\033[0m'

echo "=================================================="
echo "  Terminal Streaming Validation Test"
echo "=================================================="
echo ""

# Function to print colored status
print_status() {
    local status=$1
    local message=$2
    if [ "$status" = "PASS" ]; then
        echo -e "${COLOR_GREEN}✓ PASS${COLOR_RESET}: $message"
    elif [ "$status" = "FAIL" ]; then
        echo -e "${COLOR_RED}✗ FAIL${COLOR_RESET}: $message"
    else
        echo -e "${COLOR_YELLOW}ℹ INFO${COLOR_RESET}: $message"
    fi
}

# Test 1: Check API server
echo "Test 1: Checking API server..."
if curl -s "${API_URL}/api/health" > /dev/null 2>&1; then
    print_status "PASS" "API server is running at ${API_URL}"
else
    print_status "FAIL" "API server is not responding"
    exit 1
fi
echo ""

# Test 2: Create a Quick Task farm
echo "Test 2: Creating Quick Task farm..."
FARM_RESPONSE=$(curl -s -X POST "${API_URL}/api/quick-task" \
    -H "Content-Type: application/json" \
    -d "{
        \"name\": \"${FARM_NAME}\",
        \"task\": \"Echo 'Hello from Agent {agent_number}' 10 times with 1 second delay\",
        \"timeout\": 60000
    }")

FARM_ID=$(echo "$FARM_RESPONSE" | jq -r '.data.id // .id // empty')

if [ -z "$FARM_ID" ] || [ "$FARM_ID" = "null" ]; then
    print_status "FAIL" "Failed to create farm"
    echo "Response: $FARM_RESPONSE"
    exit 1
fi

print_status "PASS" "Farm created with ID: $FARM_ID"
echo ""

# Test 3: Wait for farm to become active
echo "Test 3: Waiting for farm to become active..."
MAX_WAIT=30
ELAPSED=0
FARM_STATUS=""

while [ $ELAPSED -lt $MAX_WAIT ]; do
    FARM_DATA=$(curl -s "${API_URL}/api/farms/${FARM_ID}")
    FARM_STATUS=$(echo "$FARM_DATA" | jq -r '.status // .data.status // empty')

    if [ "$FARM_STATUS" = "active" ] || [ "$FARM_STATUS" = "running" ]; then
        print_status "PASS" "Farm is now active (status: $FARM_STATUS)"
        break
    fi

    sleep 1
    ELAPSED=$((ELAPSED + 1))
    echo -n "."
done

echo ""

if [ "$FARM_STATUS" != "active" ] && [ "$FARM_STATUS" != "running" ]; then
    print_status "FAIL" "Farm did not become active (status: $FARM_STATUS)"
    exit 1
fi
echo ""

# Test 4: Check tmux session exists
echo "Test 4: Checking tmux session..."
SHORT_ID="${FARM_ID:0:8}"
SESSION_NAME="farm-${SHORT_ID}"

if TMUX_TMPDIR=/tmp tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    print_status "PASS" "Tmux session exists: $SESSION_NAME"
else
    print_status "FAIL" "Tmux session not found: $SESSION_NAME"
    echo "Available sessions:"
    TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null || echo "  (none)"
    exit 1
fi
echo ""

# Test 5: Check terminal log files
echo "Test 5: Checking terminal log files..."
TERMINAL_DIR="var/maibarn/terminals/${FARM_ID}"

if [ -d "$TERMINAL_DIR" ]; then
    LOG_COUNT=$(find "$TERMINAL_DIR" -name "*.log" 2>/dev/null | wc -l)
    if [ "$LOG_COUNT" -gt 0 ]; then
        print_status "PASS" "Found $LOG_COUNT terminal log files"
        find "$TERMINAL_DIR" -name "*.log" | while read -r logfile; do
            FILE_SIZE=$(stat -f%z "$logfile" 2>/dev/null || stat -c%s "$logfile" 2>/dev/null || echo "0")
            echo "  - $(basename "$logfile"): ${FILE_SIZE} bytes"
        done
    else
        print_status "FAIL" "No log files found in $TERMINAL_DIR"
        exit 1
    fi
else
    print_status "FAIL" "Terminal directory not found: $TERMINAL_DIR"
    exit 1
fi
echo ""

# Test 6: Check agents in database
echo "Test 6: Checking agents in database..."
AGENT_COUNT=$(PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql \
    -U maifarm -d maifarm_dev -t -c \
    "SELECT COUNT(*) FROM agents WHERE farm_id='${FARM_ID}';" 2>/dev/null || echo "0")

AGENT_COUNT=$(echo "$AGENT_COUNT" | tr -d ' ')

if [ "$AGENT_COUNT" -gt 0 ]; then
    print_status "PASS" "Found $AGENT_COUNT agents in database"

    # Show agent details
    echo "Agent Details:"
    PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql \
        -U maifarm -d maifarm_dev -c \
        "SELECT name, type, status, pane_index FROM agents WHERE farm_id='${FARM_ID}' ORDER BY pane_index;" \
        2>/dev/null || echo "  (could not fetch details)"
else
    print_status "FAIL" "No agents found in database"
    exit 1
fi
echo ""

# Test 7: Capture terminal output
echo "Test 7: Capturing terminal output..."
sleep 2  # Give agents time to produce output

PANE_COUNT=$(TMUX_TMPDIR=/tmp tmux list-panes -t "${SESSION_NAME}:0" -F "#{pane_index}" 2>/dev/null | wc -l || echo "0")

if [ "$PANE_COUNT" -gt 0 ]; then
    print_status "PASS" "Found $PANE_COUNT panes in session"

    for i in $(seq 0 $((PANE_COUNT - 1))); do
        OUTPUT=$(TMUX_TMPDIR=/tmp tmux capture-pane -t "${SESSION_NAME}:0.${i}" -p 2>/dev/null | grep -v "^$" | tail -5 || echo "")
        if [ -n "$OUTPUT" ]; then
            echo "  Pane $i output (last 5 lines):"
            echo "$OUTPUT" | sed 's/^/    /'
        else
            echo "  Pane $i: (no output yet)"
        fi
    done
else
    print_status "FAIL" "No panes found in session"
    exit 1
fi
echo ""

# Test 8: Check WebSocket health
echo "Test 8: Checking WebSocket health..."
WS_HEALTH=$(curl -s "${API_URL}/api/websocket-health")
WS_CONNECTED=$(echo "$WS_HEALTH" | jq -r '.connected // false')

if [ "$WS_CONNECTED" = "true" ]; then
    WS_CLIENTS=$(echo "$WS_HEALTH" | jq -r '.clientCount // 0')
    print_status "PASS" "WebSocket server is healthy ($WS_CLIENTS clients connected)"
else
    print_status "FAIL" "WebSocket server is not healthy"
    echo "Response: $WS_HEALTH"
fi
echo ""

# Test 9: Check file watcher status
echo "Test 9: Checking terminal file watcher..."
# Try to read one of the log files to see if pipe-pane is writing
if [ -f "${TERMINAL_DIR}/agent-0.log" ]; then
    LOG_SIZE=$(stat -f%z "${TERMINAL_DIR}/agent-0.log" 2>/dev/null || stat -c%s "${TERMINAL_DIR}/agent-0.log" 2>/dev/null || echo "0")
    if [ "$LOG_SIZE" -gt 0 ]; then
        print_status "PASS" "File watcher capturing output (${LOG_SIZE} bytes in agent-0.log)"

        # Show last few lines
        echo "  Last 3 lines from agent-0.log:"
        tail -3 "${TERMINAL_DIR}/agent-0.log" | sed 's/^/    /'
    else
        print_status "FAIL" "Log file exists but is empty (pipe-pane may not be working)"
    fi
else
    print_status "FAIL" "agent-0.log not found"
fi
echo ""

# Summary
echo "=================================================="
echo "  Test Summary"
echo "=================================================="
echo "Farm ID: $FARM_ID"
echo "Session: $SESSION_NAME"
echo "Status: $FARM_STATUS"
echo "Agents: $AGENT_COUNT"
echo "Terminal Logs: $TERMINAL_DIR"
echo ""
echo "Manual Verification Steps:"
echo "1. Open browser: http://localhost:3000/harvest/${FARM_ID}"
echo "2. Verify terminal output is streaming"
echo "3. Verify agent names match database"
echo "4. Check browser console for errors"
echo ""
echo "Cleanup Command:"
echo "  TMUX_TMPDIR=/tmp tmux kill-session -t ${SESSION_NAME}"
echo "=================================================="
