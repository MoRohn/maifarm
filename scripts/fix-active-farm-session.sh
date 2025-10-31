#!/bin/bash

# Fix the active farm session by creating missing panes and setting up terminal streaming

echo "======================================="
echo "Fixing Active Farm Session"
echo "======================================="

FARM_ID="c491d474-1375-4872-92da-345c08a8598d"
SESSION_NAME="farm-${FARM_ID:0:8}"
TERMINAL_DIR="/Users/rohnspringfield/maifarm/var/maibarn/terminals/$FARM_ID"
EXPECTED_PANES=5

echo "Farm ID: $FARM_ID"
echo "Session: $SESSION_NAME"
echo "Expected panes: $EXPECTED_PANES"
echo ""

# Check current pane count
CURRENT_PANES=$(env TMUX_TMPDIR=/tmp tmux list-panes -t "$SESSION_NAME:agents" 2>/dev/null | wc -l)
echo "Current panes: $CURRENT_PANES"

if [ "$CURRENT_PANES" -lt "$EXPECTED_PANES" ]; then
    echo ""
    echo "Creating missing panes..."

    # Create additional panes
    for ((i=$CURRENT_PANES; i<$EXPECTED_PANES; i++)); do
        echo "Creating pane $i..."

        if [ $i -eq 1 ]; then
            # First split: horizontal
            env TMUX_TMPDIR=/tmp tmux split-window -t "$SESSION_NAME:agents.0" -h
        elif [ $i -eq 2 ]; then
            # Second split: vertical on left pane
            env TMUX_TMPDIR=/tmp tmux split-window -t "$SESSION_NAME:agents.0" -v
        elif [ $i -eq 3 ]; then
            # Third split: vertical on right top pane
            env TMUX_TMPDIR=/tmp tmux split-window -t "$SESSION_NAME:agents.1" -v
        elif [ $i -eq 4 ]; then
            # Fourth split: vertical on bottom right pane
            env TMUX_TMPDIR=/tmp tmux split-window -t "$SESSION_NAME:agents.3" -v
        fi

        sleep 0.5
    done

    # Apply tiled layout
    env TMUX_TMPDIR=/tmp tmux select-layout -t "$SESSION_NAME:agents" tiled

    echo "Created $(($EXPECTED_PANES - $CURRENT_PANES)) new panes"
fi

# Verify final pane count
FINAL_PANES=$(env TMUX_TMPDIR=/tmp tmux list-panes -t "$SESSION_NAME:agents" 2>/dev/null | wc -l)
echo ""
echo "Final pane count: $FINAL_PANES"

# Setup pipe-pane for each agent
echo ""
echo "Setting up terminal capture for all panes..."

for ((i=0; i<$EXPECTED_PANES; i++)); do
    LOG_FILE="$TERMINAL_DIR/agent-$i.log"

    # Kill existing pipe-pane if any
    env TMUX_TMPDIR=/tmp tmux pipe-pane -t "$SESSION_NAME:agents.$i" 2>/dev/null || true

    # Create/touch the log file
    touch "$LOG_FILE"

    # Setup new pipe-pane
    echo "Setting up pipe-pane for agent $i -> $LOG_FILE"
    env TMUX_TMPDIR=/tmp tmux pipe-pane -t "$SESSION_NAME:agents.$i" -o "cat >> '$LOG_FILE'"

    # Send a test message to generate some output
    AGENT_NAME="Agent $((i+1))"
    TEST_MSG="[$AGENT_NAME] Terminal streaming activated at $(date '+%H:%M:%S')"
    env TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.$i" "echo '$TEST_MSG'" Enter
done

# Send some activity to trigger streaming
echo ""
echo "Generating test output in all panes..."

for ((i=0; i<$EXPECTED_PANES; i++)); do
    AGENT_NAME="Agent $((i+1))"

    # Send multiple messages to generate activity
    env TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.$i" "echo '============================'" Enter
    sleep 0.1
    env TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.$i" "echo '🤖 $AGENT_NAME is online'" Enter
    sleep 0.1
    env TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.$i" "echo 'Ready to process tasks...'" Enter
    sleep 0.1
    env TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.$i" "echo '============================'" Enter
done

# Check log file sizes
echo ""
echo "Verifying log files:"
for ((i=0; i<$EXPECTED_PANES; i++)); do
    LOG_FILE="$TERMINAL_DIR/agent-$i.log"
    if [ -f "$LOG_FILE" ]; then
        SIZE=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo "0")
        echo "agent-$i.log: $SIZE bytes"
    else
        echo "agent-$i.log: NOT FOUND"
    fi
done

echo ""
echo "======================================="
echo "Fix Complete!"
echo "======================================="
echo ""
echo "The session now has $FINAL_PANES panes with terminal streaming active."
echo "Check the UI to see if terminal output is now updating."