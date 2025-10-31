#!/bin/bash

# Test script for verifying terminal streaming fixes
# Tests the complete pipeline: tmux session -> pipe-pane -> log files -> file watcher -> WebSocket

echo "================================"
echo "Terminal Streaming Test Script"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
FARM_ID="test-farm-$(date +%s)"
SHORT_ID="${FARM_ID:0:8}"
SESSION_NAME="farm-${SHORT_ID}"
TERMINALS_DIR="/Users/rohnspringfield/maifarm/var/maibarn/terminals/${FARM_ID}"

echo "Test Configuration:"
echo "  Farm ID: $FARM_ID"
echo "  Session: $SESSION_NAME"
echo "  Terminals: $TERMINALS_DIR"
echo ""

# Step 1: Check tmux server
echo -e "${YELLOW}Step 1: Checking tmux server...${NC}"
export TMUX_TMPDIR=/tmp
if tmux info &> /dev/null; then
    echo -e "${GREEN}✓ Tmux server is running${NC}"
else
    echo -e "${RED}✗ Tmux server not running. Starting...${NC}"
    tmux start-server
fi

# Step 2: Create test session with pipe-pane
echo -e "${YELLOW}Step 2: Creating test session with pipe-pane...${NC}"

# Kill existing test session if it exists
tmux kill-session -t "$SESSION_NAME" 2>/dev/null

# Create terminals directory
mkdir -p "$TERMINALS_DIR"
echo -e "${GREEN}✓ Created terminals directory${NC}"

# Create tmux session
tmux new-session -d -s "$SESSION_NAME" -n agents
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Created tmux session: $SESSION_NAME${NC}"
else
    echo -e "${RED}✗ Failed to create tmux session${NC}"
    exit 1
fi

# Wait for session to be ready
sleep 1

# Set up pipe-pane for first pane
LOG_FILE_0="$TERMINALS_DIR/agent-0.log"
echo "[Test] Starting terminal capture at $(date)" > "$LOG_FILE_0"
tmux pipe-pane -t "${SESSION_NAME}:agents.0" -o "cat >> $LOG_FILE_0"
echo -e "${GREEN}✓ Set up pipe-pane for pane 0${NC}"

# Create second pane
tmux split-window -h -t "${SESSION_NAME}:agents"
sleep 0.5

# Set up pipe-pane for second pane
LOG_FILE_1="$TERMINALS_DIR/agent-1.log"
echo "[Test] Starting terminal capture at $(date)" > "$LOG_FILE_1"
tmux pipe-pane -t "${SESSION_NAME}:agents.1" -o "cat >> $LOG_FILE_1"
echo -e "${GREEN}✓ Set up pipe-pane for pane 1${NC}"

# Step 3: Launch mock agents
echo -e "${YELLOW}Step 3: Launching mock agents...${NC}"

# Launch mock agent in pane 0
tmux send-keys -t "${SESSION_NAME}:agents.0" "export AGENT_ID=0" Enter
tmux send-keys -t "${SESSION_NAME}:agents.0" "export AGENT_NAME='Test Agent 0'" Enter
tmux send-keys -t "${SESSION_NAME}:agents.0" "export FARM_ID='$FARM_ID'" Enter
tmux send-keys -t "${SESSION_NAME}:agents.0" "export SESSION_NAME='$SESSION_NAME'" Enter
tmux send-keys -t "${SESSION_NAME}:agents.0" "python3 /Users/rohnspringfield/maifarm/scripts/python/simple_mock_agent.py" Enter

# Launch mock agent in pane 1
tmux send-keys -t "${SESSION_NAME}:agents.1" "export AGENT_ID=1" Enter
tmux send-keys -t "${SESSION_NAME}:agents.1" "export AGENT_NAME='Test Agent 1'" Enter
tmux send-keys -t "${SESSION_NAME}:agents.1" "export FARM_ID='$FARM_ID'" Enter
tmux send-keys -t "${SESSION_NAME}:agents.1" "export SESSION_NAME='$SESSION_NAME'" Enter
tmux send-keys -t "${SESSION_NAME}:agents.1" "python3 /Users/rohnspringfield/maifarm/scripts/python/simple_mock_agent.py" Enter

echo -e "${GREEN}✓ Launched mock agents${NC}"

# Step 4: Verify log files are being written
echo -e "${YELLOW}Step 4: Verifying log files...${NC}"
sleep 3  # Give agents time to start and produce output

for i in 0 1; do
    LOG_FILE="$TERMINALS_DIR/agent-${i}.log"
    if [ -f "$LOG_FILE" ]; then
        SIZE=$(wc -l < "$LOG_FILE")
        if [ $SIZE -gt 1 ]; then
            echo -e "${GREEN}✓ agent-${i}.log exists with $SIZE lines${NC}"
            echo "  First 3 lines:"
            head -3 "$LOG_FILE" | sed 's/^/    /'
        else
            echo -e "${YELLOW}⚠ agent-${i}.log exists but is empty or has only 1 line${NC}"
        fi
    else
        echo -e "${RED}✗ agent-${i}.log does not exist${NC}"
    fi
done

# Step 5: Test WebSocket endpoint
echo -e "${YELLOW}Step 5: Testing WebSocket health...${NC}"
WS_HEALTH=$(curl -s http://localhost:4567/api/websocket-health 2>/dev/null)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ WebSocket health endpoint responded${NC}"
    echo "  Response: $WS_HEALTH"
else
    echo -e "${RED}✗ WebSocket health endpoint not responding${NC}"
fi

# Step 6: Show tmux session info
echo -e "${YELLOW}Step 6: Tmux session info...${NC}"
echo "Session list:"
tmux list-sessions 2>/dev/null | grep "$SESSION_NAME" | sed 's/^/  /'
echo ""
echo "Panes in session:"
tmux list-panes -t "$SESSION_NAME:agents" -F "  Pane #{pane_index}: #{pane_id}" 2>/dev/null
echo ""

# Step 7: Monitor log file growth
echo -e "${YELLOW}Step 7: Monitoring log file growth (10 seconds)...${NC}"
for i in {1..10}; do
    echo -n "."
    sleep 1
done
echo ""

for i in 0 1; do
    LOG_FILE="$TERMINALS_DIR/agent-${i}.log"
    if [ -f "$LOG_FILE" ]; then
        SIZE=$(wc -l < "$LOG_FILE")
        echo -e "${GREEN}✓ agent-${i}.log now has $SIZE lines${NC}"
    fi
done

# Step 8: Clean up option
echo ""
echo -e "${YELLOW}Test complete!${NC}"
echo ""
echo "To view the tmux session:"
echo "  TMUX_TMPDIR=/tmp tmux attach -t $SESSION_NAME"
echo ""
echo "To clean up:"
echo "  TMUX_TMPDIR=/tmp tmux kill-session -t $SESSION_NAME"
echo "  rm -rf $TERMINALS_DIR"
echo ""
echo "Log files are at:"
echo "  $TERMINALS_DIR"
echo ""

# Summary
echo "================================"
echo "Test Summary"
echo "================================"
if [ -f "$LOG_FILE_0" ] && [ -f "$LOG_FILE_1" ]; then
    SIZE_0=$(wc -l < "$LOG_FILE_0")
    SIZE_1=$(wc -l < "$LOG_FILE_1")
    if [ $SIZE_0 -gt 5 ] && [ $SIZE_1 -gt 5 ]; then
        echo -e "${GREEN}✓ Terminal streaming pipeline is working!${NC}"
        echo "  Both agents are producing output to log files."
        echo "  File watcher should detect and stream these changes."
    else
        echo -e "${YELLOW}⚠ Pipeline partially working${NC}"
        echo "  Log files exist but have limited content."
    fi
else
    echo -e "${RED}✗ Pipeline not working properly${NC}"
    echo "  Log files are missing or not being written."
fi
echo ""
echo "Next steps:"
echo "1. Open http://localhost:3000/harvest/$FARM_ID"
echo "2. Check if terminal output appears in the UI"
echo "3. Check browser console for WebSocket events"
echo ""