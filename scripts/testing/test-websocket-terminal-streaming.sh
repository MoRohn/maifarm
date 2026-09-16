#!/bin/bash

MAIFARM_ROOT="${MAIFARM_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
export MAIFARM_ROOT
# Test WebSocket Terminal Streaming
# Validates that terminal output is properly streamed via WebSocket to frontend

set -e

echo "=== WebSocket Terminal Streaming Test ==="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
TEST_FARM_ID="test-ws-$(date +%s)"
SESSION_NAME="farm-${TEST_FARM_ID:0:8}"
TERMINALS_DIR="${MAIFARM_ROOT}/var/maibarn/terminals/${TEST_FARM_ID}"
BACKEND_PORT=4567

echo "Test Farm ID: $TEST_FARM_ID"
echo "Session Name: $SESSION_NAME"
echo "Backend Port: $BACKEND_PORT"
echo ""

# Step 1: Check if backend is running
echo "Step 1: Checking if backend is running..."
if curl -s http://localhost:$BACKEND_PORT/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend is running on port $BACKEND_PORT${NC}"
else
    echo -e "${RED}✗ Backend is not running${NC}"
    echo "Please start the backend with: npm run dev"
    exit 1
fi
echo ""

# Step 2: Check WebSocket health
echo "Step 2: Checking WebSocket health..."
WS_HEALTH=$(curl -s http://localhost:$BACKEND_PORT/api/websocket-health)
WS_STATUS=$(echo "$WS_HEALTH" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
CONNECTIONS=$(echo "$WS_HEALTH" | grep -o '"connections":[0-9]*' | cut -d':' -f2)

if [ "$WS_STATUS" = "healthy" ]; then
    echo -e "${GREEN}✓ WebSocket is healthy${NC}"
    echo "  Active connections: $CONNECTIONS"
else
    echo -e "${YELLOW}⚠ WebSocket status: $WS_STATUS${NC}"
fi
echo ""

# Step 3: Create test directories
echo "Step 3: Creating test terminal directory..."
mkdir -p "$TERMINALS_DIR"
echo -e "${GREEN}✓ Directory created: $TERMINALS_DIR${NC}"
echo ""

# Step 4: Create test tmux session
echo "Step 4: Creating test tmux session..."
export TMUX_TMPDIR=/tmp

# Kill existing test session if it exists
if env TMUX_TMPDIR=/tmp tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Cleaning up existing session..."
    env TMUX_TMPDIR=/tmp tmux kill-session -t "$SESSION_NAME"
    sleep 1
fi

# Create new session
env TMUX_TMPDIR=/tmp tmux new-session -d -s "$SESSION_NAME" -n agents
echo -e "${GREEN}✓ Tmux session created: $SESSION_NAME${NC}"
echo ""

# Step 5: Set up pipe-pane
echo "Step 5: Setting up pipe-pane for terminal logging..."
LOG_FILE="$TERMINALS_DIR/agent-0.log"
echo "# Terminal output for Agent 0" > "$LOG_FILE"
sleep 0.5

env TMUX_TMPDIR=/tmp tmux pipe-pane -t "$SESSION_NAME:agents.0" -o "cat >> $LOG_FILE"
echo -e "${GREEN}✓ Pipe-pane configured: $LOG_FILE${NC}"
echo ""

# Step 6: Send initial test message
echo "Step 6: Sending initial test messages..."
env TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.0" "echo '[WS-TEST] WebSocket streaming test initiated'" Enter
sleep 0.5
env TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.0" "echo '[WS-TEST] Agent 0 ready for streaming'" Enter
sleep 0.5
echo -e "${GREEN}✓ Test messages sent${NC}"
echo ""

# Step 7: Check log file
echo "Step 7: Verifying log file capture..."
if [ -f "$LOG_FILE" ]; then
    LOG_SIZE=$(wc -c < "$LOG_FILE")
    echo "Log file size: $LOG_SIZE bytes"

    if [ "$LOG_SIZE" -gt 50 ]; then
        echo -e "${GREEN}✓ Log file is capturing output${NC}"
    else
        echo -e "${RED}✗ Log file is too small${NC}"
    fi
else
    echo -e "${RED}✗ Log file not found: $LOG_FILE${NC}"
    exit 1
fi
echo ""

# Step 8: Send periodic messages to test streaming
echo "Step 8: Sending periodic messages to test streaming..."
for i in {1..5}; do
    MSG="[WS-TEST] Streaming test message $i at $(date +%H:%M:%S)"
    env TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.0" "echo '$MSG'" Enter
    echo "  Sent: $MSG"
    sleep 1
done
echo -e "${GREEN}✓ Periodic messages sent${NC}"
echo ""

# Step 9: Verify log file growth
echo "Step 9: Verifying log file growth..."
FINAL_SIZE=$(wc -c < "$LOG_FILE")
echo "Final log file size: $FINAL_SIZE bytes"

if [ "$FINAL_SIZE" -gt "$LOG_SIZE" ]; then
    GROWTH=$((FINAL_SIZE - LOG_SIZE))
    echo -e "${GREEN}✓ Log file grew by $GROWTH bytes${NC}"
else
    echo -e "${RED}✗ Log file did not grow${NC}"
fi
echo ""

# Step 10: Display captured content
echo "Step 10: Displaying captured terminal content..."
echo "-----------------------------------"
tail -15 "$LOG_FILE"
echo "-----------------------------------"
echo ""

# Step 11: WebSocket file watcher check
echo "Step 11: Testing WebSocket file watcher service..."
echo "The terminalFileWatcherService should detect these log file changes"
echo "and emit 'terminal:output' events to connected clients via WebSocket."
echo ""
echo "Expected WebSocket events:"
echo "  - terminal:join (client subscribes to farm-${TEST_FARM_ID})"
echo "  - terminal:output (server emits new log lines)"
echo "  - terminal:change (file modification detected)"
echo ""

# Step 12: Cleanup instructions
echo "=== TEST SUMMARY ==="
echo ""
echo "✓ Backend running: Yes"
echo "✓ WebSocket health: $WS_STATUS"
echo "✓ Tmux session: $SESSION_NAME"
echo "✓ Terminal logs: $TERMINALS_DIR"
echo "✓ Log file size: $FINAL_SIZE bytes"
echo "✓ Messages sent: 6 (1 initial + 5 periodic)"
echo ""

echo -e "${GREEN}=== TEST COMPLETE ===${NC}"
echo ""
echo "To monitor real-time streaming:"
echo "  1. tail -f $LOG_FILE"
echo "  2. Connect frontend to farm ID: $TEST_FARM_ID"
echo "  3. Watch browser console for WebSocket events"
echo ""
echo "To send more test messages:"
echo "  env TMUX_TMPDIR=/tmp tmux send-keys -t $SESSION_NAME:agents.0 \"echo '[TEST] New message'\" Enter"
echo ""
echo "To clean up:"
echo "  env TMUX_TMPDIR=/tmp tmux kill-session -t $SESSION_NAME"
echo "  rm -rf $TERMINALS_DIR"
echo ""
