#!/bin/bash

echo "Testing Terminal Streaming Fixes"
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create a test tmux session
SESSION_NAME="test-terminal-$(date +%s)"
echo -e "${YELLOW}Creating test tmux session: ${SESSION_NAME}${NC}"

# Create session with 3 panes
tmux new-session -d -s "$SESSION_NAME" -n "agents" -x 120 -y 40
tmux split-window -t "$SESSION_NAME:agents" -h
tmux split-window -t "$SESSION_NAME:agents.1" -v

# Start simulating output in each pane
echo -e "${GREEN}✓ Session created with 3 panes${NC}"

# Function to send test output to a pane
send_test_output() {
    local pane=$1
    local agent_name=$2
    
    # Send initial message
    tmux send-keys -t "$SESSION_NAME:agents.$pane" "echo 'Agent $agent_name started'" Enter
    sleep 0.5
    
    # Send some test commands
    tmux send-keys -t "$SESSION_NAME:agents.$pane" "echo '[PIPE_TEST_$(date +%s)] Testing pipe-pane output'" Enter
    sleep 0.5
    
    tmux send-keys -t "$SESSION_NAME:agents.$pane" "for i in {1..5}; do echo \"[$agent_name] Processing task \$i...\"; sleep 1; done" Enter
}

# Start output in all panes
echo -e "${YELLOW}Starting agent simulations...${NC}"
send_test_output 0 "Claude-1"
send_test_output 1 "Claude-2"
send_test_output 2 "Claude-3"

# Set up pipe-pane for each pane (test new verification)
echo -e "${YELLOW}Setting up pipe-pane for terminal streaming...${NC}"
TERMINAL_DIR="/Users/rohnspringfield/maifarm/data/storage/maibarn/terminals"
mkdir -p "$TERMINAL_DIR"

for i in 0 1 2; do
    LOG_FILE="$TERMINAL_DIR/${SESSION_NAME}_agent_${i}.log"
    echo -e "  Setting up pipe-pane for agent $i -> $LOG_FILE"
    tmux pipe-pane -t "$SESSION_NAME:agents.$i" "cat >> '$LOG_FILE'"
    
    # Test if pipe-pane is working by sending a test marker
    TEST_MARKER="[PIPE_VERIFICATION_$(date +%s)]"
    tmux send-keys -t "$SESSION_NAME:agents.$i" "echo '$TEST_MARKER'" Enter
    sleep 0.5
    
    # Check if marker appears in log
    if grep -q "$TEST_MARKER" "$LOG_FILE" 2>/dev/null; then
        echo -e "  ${GREEN}✓ Pipe-pane verified for agent $i${NC}"
    else
        echo -e "  ${RED}✗ Pipe-pane verification failed for agent $i${NC}"
    fi
done

echo -e "${GREEN}Test session created: ${SESSION_NAME}${NC}"
echo ""
echo "To view the session:"
echo "  tmux attach -t $SESSION_NAME"
echo ""
echo "To check terminal logs:"
echo "  ls -la $TERMINAL_DIR/${SESSION_NAME}_*.log"
echo ""
echo "To kill the test session:"
echo "  tmux kill-session -t $SESSION_NAME"
echo ""
echo -e "${YELLOW}Waiting 10 seconds for output generation...${NC}"
sleep 10

# Check log files
echo -e "${YELLOW}Checking terminal log files:${NC}"
for i in 0 1 2; do
    LOG_FILE="$TERMINAL_DIR/${SESSION_NAME}_agent_${i}.log"
    if [ -f "$LOG_FILE" ]; then
        LINE_COUNT=$(wc -l < "$LOG_FILE")
        echo -e "  Agent $i log: ${GREEN}$LINE_COUNT lines${NC}"
        echo "    Sample output:"
        tail -5 "$LOG_FILE" | sed 's/^/      /'
    else
        echo -e "  Agent $i log: ${RED}NOT FOUND${NC}"
    fi
done

echo ""
echo -e "${GREEN}✓ Terminal streaming test complete${NC}"
echo -e "${YELLOW}Remember to kill the test session when done:${NC}"
echo "  tmux kill-session -t $SESSION_NAME"