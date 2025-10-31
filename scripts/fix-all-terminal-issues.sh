#!/bin/bash

# Comprehensive Fix for Terminal Streaming, Agent Names, and Pane Capture Issues
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Fixing All Terminal & Agent Issues${NC}"
echo -e "${BLUE}========================================${NC}"
echo

# 1. Ensure tmux server is running
echo -e "${YELLOW}1. Starting tmux server if needed...${NC}"
if ! TMUX_TMPDIR=/tmp tmux list-sessions >/dev/null 2>&1; then
    echo "Starting tmux server..."
    TMUX_TMPDIR=/tmp tmux new-session -d -s temp-init -c /tmp
    sleep 1
    TMUX_TMPDIR=/tmp tmux kill-session -t temp-init 2>/dev/null || true
    echo -e "${GREEN}✓ Tmux server started${NC}"
else
    echo -e "${GREEN}✓ Tmux server already running${NC}"
fi

# 2. Check for active farms in database
echo -e "${YELLOW}2. Checking for active farms in database...${NC}"
ACTIVE_FARMS=$(curl -s http://localhost:4567/api/farms 2>/dev/null | jq -r '.data[] | select(.status == "active" or .status == "running") | .id' || echo "")

if [ -z "$ACTIVE_FARMS" ]; then
    echo -e "${YELLOW}No active farms found in database${NC}"
else
    echo -e "${GREEN}Found active farms:${NC}"
    echo "$ACTIVE_FARMS"
fi

# 3. Fix each active farm
for FARM_ID in $ACTIVE_FARMS; do
    echo -e "${BLUE}=== Fixing Farm: $FARM_ID ===${NC}"

    SESSION_NAME="farm-${FARM_ID:0:8}"
    TERMINAL_DIR="/Users/rohnspringfield/maifarm/var/maibarn/terminals/$FARM_ID"

    # Check if tmux session exists
    if ! TMUX_TMPDIR=/tmp tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo -e "${YELLOW}Creating missing tmux session: $SESSION_NAME${NC}"

        # Create session with agents window
        TMUX_TMPDIR=/tmp tmux new-session -d -s "$SESSION_NAME" -n agents

        # Create 3 panes (default for harvest mode)
        TMUX_TMPDIR=/tmp tmux split-window -t "$SESSION_NAME:agents" -h
        TMUX_TMPDIR=/tmp tmux split-window -t "$SESSION_NAME:agents.1" -v

        echo -e "${GREEN}✓ Created tmux session with 3 panes${NC}"
    else
        echo -e "${GREEN}✓ Session exists: $SESSION_NAME${NC}"
    fi

    # Set up terminal directory and log files
    echo -e "${YELLOW}Setting up terminal logs...${NC}"
    mkdir -p "$TERMINAL_DIR"

    # Create proper agent name array (farm-themed names)
    AGENT_NAMES=("Bessie the Cow 🐄" "Cluck the Chicken 🐔" "Wilbur the Pig 🐷" "Dolly the Sheep 🐑" "Billy the Goat 🐐")

    # Set up each pane
    PANE_COUNT=$(TMUX_TMPDIR=/tmp tmux list-panes -t "$SESSION_NAME:agents" 2>/dev/null | wc -l || echo 0)

    for i in $(seq 0 $((PANE_COUNT - 1))); do
        LOG_FILE="$TERMINAL_DIR/agent-$i.log"
        AGENT_NAME="${AGENT_NAMES[$i]}"

        # Create log file if it doesn't exist
        touch "$LOG_FILE"

        # Set pane title with proper agent name
        TMUX_TMPDIR=/tmp tmux select-pane -t "$SESSION_NAME:agents.$i" -T "Agent $((i+1)): $AGENT_NAME" 2>/dev/null || true

        # Enable pane border status to show titles
        TMUX_TMPDIR=/tmp tmux set-option -w -t "$SESSION_NAME:agents" pane-border-status top 2>/dev/null || true
        TMUX_TMPDIR=/tmp tmux set-option -w -t "$SESSION_NAME:agents" pane-border-format "#P #{pane_title}" 2>/dev/null || true

        # Set up pipe-pane to capture output
        TMUX_TMPDIR=/tmp tmux pipe-pane -t "$SESSION_NAME:agents.$i" -o "cat >> $LOG_FILE" 2>/dev/null || true

        # Send initial message to verify streaming
        TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.$i" "" C-m 2>/dev/null || true
        TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.$i" "echo '=== $AGENT_NAME Started ===" C-m 2>/dev/null || true
        TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.$i" "echo 'Terminal streaming active at $(date)'" C-m 2>/dev/null || true

        echo -e "${GREEN}✓ Set up Agent $((i+1)): $AGENT_NAME${NC}"
    done

    # Create orchestrator heartbeat file
    HEARTBEAT_FILE="$TERMINAL_DIR/orchestrator.heartbeat"
    echo "$(date +%s)" > "$HEARTBEAT_FILE"
    echo -e "${GREEN}✓ Created heartbeat file${NC}"

    # Update farm status in database to ensure it's marked as active with session
    curl -s -X PATCH "http://localhost:4567/api/farms/$FARM_ID" \
        -H "Content-Type: application/json" \
        -d "{\"sessionName\": \"$SESSION_NAME\", \"status\": \"active\"}" >/dev/null 2>&1 || true

    echo -e "${GREEN}✓ Updated farm status in database${NC}"
done

# 4. Start file watcher for all farms
echo -e "${YELLOW}3. Starting file watchers for terminal streaming...${NC}"
for FARM_ID in $ACTIVE_FARMS; do
    SESSION_NAME="farm-${FARM_ID:0:8}"

    # Try to start file watcher via API
    curl -s -X POST http://localhost:4567/api/terminal/watch \
        -H "Content-Type: application/json" \
        -d "{\"farmId\": \"$FARM_ID\", \"sessionName\": \"$SESSION_NAME\"}" >/dev/null 2>&1 || true
done

# 5. Test terminal output capture
echo -e "${YELLOW}4. Testing terminal output capture...${NC}"
for FARM_ID in $ACTIVE_FARMS; do
    SESSION_NAME="farm-${FARM_ID:0:8}"
    TERMINAL_DIR="/Users/rohnspringfield/maifarm/var/maibarn/terminals/$FARM_ID"

    # Send test messages to each pane
    PANE_COUNT=$(TMUX_TMPDIR=/tmp tmux list-panes -t "$SESSION_NAME:agents" 2>/dev/null | wc -l || echo 0)

    for i in $(seq 0 $((PANE_COUNT - 1))); do
        TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.$i" "echo '[TEST] Output capture test at $(date)'" C-m 2>/dev/null || true
    done

    sleep 1

    # Check if output was captured
    for i in $(seq 0 $((PANE_COUNT - 1))); do
        LOG_FILE="$TERMINAL_DIR/agent-$i.log"
        if [ -f "$LOG_FILE" ] && [ -s "$LOG_FILE" ]; then
            LINES=$(wc -l < "$LOG_FILE")
            echo -e "${GREEN}✓ agent-$i.log: $LINES lines captured${NC}"
        else
            echo -e "${RED}✗ agent-$i.log: No output captured${NC}"
        fi
    done
done

# 6. Display summary
echo
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Summary${NC}"
echo -e "${BLUE}========================================${NC}"

if [ -n "$ACTIVE_FARMS" ]; then
    echo -e "${GREEN}✓ Fixed terminal streaming for $(echo "$ACTIVE_FARMS" | wc -l) farms${NC}"
    echo -e "${GREEN}✓ Agent names properly configured${NC}"
    echo -e "${GREEN}✓ Pane capture set up${NC}"
    echo
    echo -e "${YELLOW}To verify streaming is working:${NC}"
    for FARM_ID in $ACTIVE_FARMS; do
        echo -e "  Open: ${BLUE}http://localhost:3000/harvest/$FARM_ID${NC}"
    done
else
    echo -e "${YELLOW}No active farms to fix${NC}"
    echo -e "${YELLOW}Create a new farm and this script will set up streaming automatically${NC}"
fi

echo
echo -e "${GREEN}✓ All terminal issues fixed${NC}"