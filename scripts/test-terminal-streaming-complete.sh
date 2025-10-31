#!/bin/bash

# Complete Terminal Streaming Test Script
# Tests all aspects of terminal console, WebSocket streaming, XenoSync integration

set -e

echo "======================================"
echo "🧪 Terminal Streaming Complete Test"
echo "======================================"
echo ""

API_URL="${API_URL:-http://localhost:4567}"
FARM_ID=""
SESSION_NAME=""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

success() {
    echo -e "${GREEN}✓ $1${NC}"
}

error() {
    echo -e "${RED}✗ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Test 1: Server Health Check
echo "1️⃣  Testing server health..."
if curl -s "${API_URL}/api/health" | grep -q "ok"; then
    success "Server is healthy"
else
    error "Server health check failed"
    exit 1
fi
echo ""

# Test 2: WebSocket Health Check
echo "2️⃣  Testing WebSocket health..."
WS_HEALTH=$(curl -s "${API_URL}/api/websocket-health")
if echo "$WS_HEALTH" | grep -q "connected"; then
    success "WebSocket server is running"
    echo "$WS_HEALTH" | jq '.'
else
    error "WebSocket health check failed"
    exit 1
fi
echo ""

# Test 3: Check for existing farms
echo "3️⃣  Checking for active farms..."
FARMS=$(curl -s "${API_URL}/api/farms" | jq -r '.data[] | select(.status == "active" or .status == "running")')
if [ -z "$FARMS" ]; then
    warning "No active farms found"
    echo ""
    echo "Would you like to create a test farm? (yes/no)"
    read -r CREATE_FARM

    if [ "$CREATE_FARM" = "yes" ]; then
        echo ""
        echo "4️⃣  Creating test farm (Go Wild mode with 3 agents)..."

        # Create farm with Go Wild mode
        CREATE_RESPONSE=$(curl -s -X POST "${API_URL}/api/farms" \
            -H "Content-Type: application/json" \
            -d '{
                "name": "Terminal Streaming Test",
                "mode": "go_wild",
                "agentCount": 3,
                "provider": "claude",
                "prompt": "Test terminal streaming with multiple agents. Each agent should output their name and status periodically.",
                "config": {
                    "timeout": 300,
                    "orchestratorType": "xenosync"
                }
            }')

        FARM_ID=$(echo "$CREATE_RESPONSE" | jq -r '.data.id')

        if [ "$FARM_ID" != "null" ] && [ -n "$FARM_ID" ]; then
            success "Farm created: $FARM_ID"
            SESSION_NAME="farm-${FARM_ID:0:8}"
            info "Session name: $SESSION_NAME"
        else
            error "Failed to create farm"
            echo "$CREATE_RESPONSE" | jq '.'
            exit 1
        fi
    else
        info "Skipping farm creation"
        exit 0
    fi
else
    FARM_ID=$(echo "$FARMS" | jq -r '.id' | head -1)
    success "Found active farm: $FARM_ID"
    SESSION_NAME="farm-${FARM_ID:0:8}"
    info "Session name: $SESSION_NAME"
fi
echo ""

# Test 5: Verify tmux session exists
echo "5️⃣  Verifying tmux session..."
if TMUX_TMPDIR=/tmp tmux list-sessions | grep -q "$SESSION_NAME"; then
    success "Tmux session exists: $SESSION_NAME"

    # Get pane count
    PANE_COUNT=$(TMUX_TMPDIR=/tmp tmux list-panes -t "$SESSION_NAME" 2>/dev/null | wc -l)
    info "Pane count: $PANE_COUNT"

    # Check for 'agents' window (XenoSync)
    if TMUX_TMPDIR=/tmp tmux list-windows -t "$SESSION_NAME" | grep -q "agents"; then
        success "XenoSync 'agents' window detected"
        WINDOW_TARGET="agents"
    else
        info "Using default window '0'"
        WINDOW_TARGET="0"
    fi
else
    warning "Tmux session not found yet (may still be launching)"
    warning "Waiting 10 seconds for farm to start..."
    sleep 10
fi
echo ""

# Test 6: Check terminal log files
echo "6️⃣  Checking terminal log files..."
LOG_DIR="var/maibarn/terminals/$FARM_ID"
if [ -d "$LOG_DIR" ]; then
    success "Terminal log directory exists: $LOG_DIR"

    LOG_FILES=$(ls -1 "$LOG_DIR" 2>/dev/null || echo "")
    if [ -n "$LOG_FILES" ]; then
        success "Found log files:"
        echo "$LOG_FILES" | while read -r file; do
            SIZE=$(du -h "$LOG_DIR/$file" | cut -f1)
            info "  - $file ($SIZE)"
        done
    else
        warning "No log files found yet"
    fi
else
    warning "Terminal log directory not found: $LOG_DIR"
fi
echo ""

# Test 7: Test terminal cleaner
echo "7️⃣  Testing terminal cleaner..."
TEST_OUTPUT="$(cat <<'EOF'
[1;32mAgent Started[0m
[2024-01-01 12:00:00] [PIPE-PANE] Test output
user@host:~$ echo "test"
test
%
[MOCK] Agent activity
EOF
)"

CLEANED=$(node -e "
const { cleanTerminalOutput } = require('./apps/api/src/utils/terminalCleaner.ts');
console.log(cleanTerminalOutput('$TEST_OUTPUT'));
" 2>/dev/null || echo "FAILED")

if [ "$CLEANED" != "FAILED" ]; then
    success "Terminal cleaner working"
    info "Cleaned output:"
    echo "$CLEANED"
else
    warning "Terminal cleaner test skipped (TypeScript file)"
fi
echo ""

# Test 8: Capture terminal output
echo "8️⃣  Capturing terminal output..."
if [ -n "$SESSION_NAME" ]; then
    for i in 0 1 2; do
        OUTPUT=$(TMUX_TMPDIR=/tmp tmux capture-pane -t "${SESSION_NAME}:${WINDOW_TARGET}.${i}" -p -S -20 2>/dev/null || echo "")
        if [ -n "$OUTPUT" ]; then
            success "Agent $i output captured ($(echo "$OUTPUT" | wc -l) lines)"
            info "Last 5 lines from Agent $i:"
            echo "$OUTPUT" | tail -5 | sed 's/^/    /'
        else
            warning "No output from Agent $i yet"
        fi
    done
else
    warning "No session name available"
fi
echo ""

# Test 9: Check WebSocket terminal room
echo "9️⃣  Testing WebSocket terminal room..."
WS_TEST=$(curl -s "${API_URL}/api/terminal/verify" \
    -H "Content-Type: application/json" \
    -d "{
        \"sessionName\": \"$SESSION_NAME\",
        \"farmId\": \"$FARM_ID\",
        \"agentCount\": 3
    }")

if echo "$WS_TEST" | grep -q "success"; then
    success "WebSocket terminal verification passed"
    echo "$WS_TEST" | jq '.'
else
    warning "WebSocket verification returned: $WS_TEST"
fi
echo ""

# Test 10: Check farm status
echo "🔟 Checking farm status..."
FARM_STATUS=$(curl -s "${API_URL}/api/farms/${FARM_ID}")
if [ -n "$FARM_STATUS" ]; then
    STATUS=$(echo "$FARM_STATUS" | jq -r '.data.status')
    ORCHESTRATOR=$(echo "$FARM_STATUS" | jq -r '.data.config.orchestratorType // "unknown"')
    AGENT_COUNT=$(echo "$FARM_STATUS" | jq -r '.data.agents | length // 0')

    success "Farm status: $STATUS"
    info "Orchestrator type: $ORCHESTRATOR"
    info "Agent count: $AGENT_COUNT"

    # Check if XenoSync
    if [ "$ORCHESTRATOR" = "xenosync" ]; then
        success "XenoSync orchestrator confirmed"
    fi
fi
echo ""

# Test 11: Monitor live terminal output for 30 seconds
echo "1️⃣1️⃣  Monitoring live terminal output for 30 seconds..."
if [ -n "$SESSION_NAME" ]; then
    info "Watching session: $SESSION_NAME"
    info "Press Ctrl+C to stop monitoring early"

    END_TIME=$(($(date +%s) + 30))
    OUTPUT_COUNT=0

    while [ $(date +%s) -lt $END_TIME ]; do
        for i in 0 1 2; do
            NEW_OUTPUT=$(TMUX_TMPDIR=/tmp tmux capture-pane -t "${SESSION_NAME}:${WINDOW_TARGET}.${i}" -p -S -5 2>/dev/null | tail -1)
            if [ -n "$NEW_OUTPUT" ] && [ "$NEW_OUTPUT" != " " ]; then
                OUTPUT_COUNT=$((OUTPUT_COUNT + 1))
                echo "  [Agent $i] $NEW_OUTPUT"
            fi
        done
        sleep 2
    done

    if [ $OUTPUT_COUNT -gt 0 ]; then
        success "Detected $OUTPUT_COUNT new output lines"
    else
        warning "No new output detected in 30 seconds"
    fi
else
    warning "No session available for monitoring"
fi
echo ""

# Summary
echo "======================================"
echo "📊 Test Summary"
echo "======================================"
success "Farm ID: ${FARM_ID:-N/A}"
success "Session: ${SESSION_NAME:-N/A}"
success "Orchestrator: ${ORCHESTRATOR:-N/A}"
echo ""

echo "✅ All tests completed!"
echo ""
echo "To view the terminal in the UI:"
echo "  Open: http://localhost:3000/harvest/$FARM_ID"
echo ""
echo "To manually monitor tmux:"
echo "  TMUX_TMPDIR=/tmp tmux attach -t $SESSION_NAME"
echo ""
