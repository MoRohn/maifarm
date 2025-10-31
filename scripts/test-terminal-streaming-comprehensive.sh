#!/bin/bash

# Comprehensive test for terminal streaming with fixed orchestrator
# Tests both mock and real Claude agents

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BLUE}${BOLD}========================================${NC}"
echo -e "${BLUE}${BOLD}   Terminal Streaming Fix Test${NC}"
echo -e "${BLUE}${BOLD}========================================${NC}"
echo

# Test configuration
FARM_ID="test-terminal-$(date +%s)"
SESSION_NAME="farm-${FARM_ID:0:8}"
WORKSPACE_DIR="/Users/rohnspringfield/maifarm/var/maibarn/workspaces"
COORDINATION_DIR="/Users/rohnspringfield/maifarm/maibarn/coordination"
TERMINALS_DIR="/Users/rohnspringfield/maifarm/var/maibarn/terminals/${FARM_ID}"
NUM_AGENTS=3

echo -e "${YELLOW}Test Configuration:${NC}"
echo "  Farm ID: $FARM_ID"
echo "  Session: $SESSION_NAME"
echo "  Agents: $NUM_AGENTS"
echo "  Terminals: $TERMINALS_DIR"
echo

# Function to check if tmux session exists
check_session() {
    TMUX_TMPDIR=/tmp tmux has-session -t "$1" 2>/dev/null
}

# Function to capture pane output
capture_pane() {
    TMUX_TMPDIR=/tmp tmux capture-pane -t "$1" -p 2>/dev/null || echo "[Empty]"
}

# Function to check log file
check_log() {
    if [ -f "$1" ]; then
        SIZE=$(wc -c < "$1")
        LINES=$(wc -l < "$1")
        echo "  Size: $SIZE bytes, Lines: $LINES"
        if [ $SIZE -gt 0 ]; then
            echo "  Last line: $(tail -1 "$1")"
            return 0
        else
            echo "  ${RED}[EMPTY FILE]${NC}"
            return 1
        fi
    else
        echo "  ${RED}[FILE NOT FOUND]${NC}"
        return 1
    fi
}

# Clean up any existing session
if check_session "$SESSION_NAME"; then
    echo -e "${YELLOW}Cleaning up existing session...${NC}"
    TMUX_TMPDIR=/tmp tmux kill-session -t "$SESSION_NAME"
    sleep 1
fi

# Create test prompt file
PROMPT_FILE="${COORDINATION_DIR}/test_prompt.yaml"
mkdir -p "$COORDINATION_DIR"
cat > "$PROMPT_FILE" << 'EOF'
name: "Terminal Test Farm"
description: "Testing terminal streaming fixes"
prompt: |
  This is a test of the terminal streaming system.
  Your job is to output messages periodically to verify streaming works.
  Please output a message every 2 seconds.
agents:
  - name: "Bessie the Cow"
    role: "Lead tester"
    lead: true
  - name: "Cluck the Chicken"
    role: "Support tester"
  - name: "Wilbur the Pig"
    role: "Quality checker"
EOF

echo -e "${GREEN}✓ Created test prompt file${NC}"

# Test 1: Mock agents (no API key required)
echo
echo -e "${BOLD}Test 1: Mock Agents${NC}"
echo "================================"

# Launch orchestrator with mock agents
echo -e "${YELLOW}Launching orchestrator with mock agents...${NC}"
cd /Users/rohnspringfield/maifarm

# Use mock provider to avoid needing API keys
python3 scripts/python/orchestrator.py \
    --prompt-file "$PROMPT_FILE" \
    --num-agents $NUM_AGENTS \
    --farm-id "$FARM_ID" \
    --session "$SESSION_NAME" \
    --workspace-dir "$WORKSPACE_DIR" \
    --provider mock &

ORCHESTRATOR_PID=$!
echo "Orchestrator PID: $ORCHESTRATOR_PID"

# Wait for session to be created
echo -e "${YELLOW}Waiting for tmux session...${NC}"
for i in {1..10}; do
    if check_session "$SESSION_NAME"; then
        echo -e "${GREEN}✓ Session created${NC}"
        break
    fi
    sleep 1
done

# Wait a bit more for pipe-pane setup
sleep 5

# Check panes
echo -e "${YELLOW}Checking panes...${NC}"
TMUX_TMPDIR=/tmp tmux list-panes -t "$SESSION_NAME:agents" -F "Pane #{pane_index}: #{pane_id}"

# Check terminal directory
echo -e "${YELLOW}Checking terminal directory...${NC}"
if [ -d "$TERMINALS_DIR" ]; then
    echo -e "${GREEN}✓ Terminal directory exists${NC}"
    ls -la "$TERMINALS_DIR"
else
    echo -e "${RED}✗ Terminal directory not found${NC}"
fi

# Wait for agents to start outputting
echo -e "${YELLOW}Waiting for agent output...${NC}"
sleep 5

# Check each agent's log file
echo -e "${YELLOW}Checking log files...${NC}"
ALL_GOOD=true
for i in 0 1 2; do
    echo "Agent $i log:"
    if ! check_log "$TERMINALS_DIR/agent-$i.log"; then
        ALL_GOOD=false
    fi
done

# Capture pane content
echo
echo -e "${YELLOW}Capturing pane content...${NC}"
for i in 0 1 2; do
    echo "Pane $i content:"
    CONTENT=$(capture_pane "$SESSION_NAME:agents.$i")
    if [ "$CONTENT" = "[Empty]" ]; then
        echo -e "  ${RED}[EMPTY PANE]${NC}"
        ALL_GOOD=false
    else
        echo "$CONTENT" | head -5
        echo "  ..."
    fi
done

# Send test message to each pane
echo
echo -e "${YELLOW}Sending test messages...${NC}"
for i in 0 1 2; do
    TEST_MSG="[TEST] Manual test message for Agent $i at $(date +%H:%M:%S)"
    TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.$i" "echo '$TEST_MSG'" Enter
done

sleep 2

# Check if test messages appeared in logs
echo -e "${YELLOW}Verifying test messages in logs...${NC}"
for i in 0 1 2; do
    if grep -q "\[TEST\] Manual test message for Agent $i" "$TERMINALS_DIR/agent-$i.log"; then
        echo -e "${GREEN}✓ Test message found in agent-$i.log${NC}"
    else
        echo -e "${RED}✗ Test message NOT found in agent-$i.log${NC}"
        ALL_GOOD=false
    fi
done

# Summary
echo
echo -e "${BOLD}Test Results:${NC}"
echo "================================"

if [ "$ALL_GOOD" = true ]; then
    echo -e "${GREEN}${BOLD}✓ ALL TESTS PASSED!${NC}"
    echo -e "${GREEN}Terminal streaming is working correctly!${NC}"
else
    echo -e "${RED}${BOLD}✗ SOME TESTS FAILED${NC}"
    echo -e "${YELLOW}Check the log files manually:${NC}"
    echo "  tail -f $TERMINALS_DIR/agent-*.log"
fi

# Show live output
echo
echo -e "${YELLOW}Showing live output (press Ctrl+C to stop):${NC}"
echo "================================"

# Kill orchestrator after showing some output
(sleep 15 && kill $ORCHESTRATOR_PID 2>/dev/null) &

# Tail the log files
tail -f "$TERMINALS_DIR"/agent-*.log 2>/dev/null || true

# Cleanup
echo
echo -e "${YELLOW}Cleaning up...${NC}"
kill $ORCHESTRATOR_PID 2>/dev/null || true
TMUX_TMPDIR=/tmp tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true

echo -e "${GREEN}Test complete!${NC}"