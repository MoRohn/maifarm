#!/bin/bash

# Fix terminal streaming for an existing farm by creating tmux session and setting up pipe-pane

set -e

echo "======================================="
echo "Fix Farm Terminal Streaming"
echo "======================================="
echo ""

# Get the farm ID from API
FARM_DATA=$(curl -s "http://localhost:4567/api/farms?limit=1")
FARM_ID=$(echo "$FARM_DATA" | jq -r '.data[0].id')
FARM_NAME=$(echo "$FARM_DATA" | jq -r '.data[0].name')
AGENT_COUNT=$(echo "$FARM_DATA" | jq -r '.data[0].agents | length')

if [ -z "$FARM_ID" ] || [ "$FARM_ID" == "null" ]; then
    echo "No active farms found in API"
    exit 1
fi

SHORT_FARM_ID=${FARM_ID:0:8}
SESSION_NAME="farm-$SHORT_FARM_ID"
TERMINAL_DIR="/Users/rohnspringfield/maifarm/var/maibarn/terminals/$FARM_ID"

echo "Farm: $FARM_NAME"
echo "Farm ID: $FARM_ID"
echo "Session Name: $SESSION_NAME"
echo "Agent Count: $AGENT_COUNT"
echo "Terminal Dir: $TERMINAL_DIR"
echo ""

# Create terminal directory
echo "Creating terminal directory..."
mkdir -p "$TERMINAL_DIR"

# Check if session exists
if env TMUX_TMPDIR=/tmp tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Session already exists, will reuse it"
else
    echo "Creating tmux session: $SESSION_NAME"
    env TMUX_TMPDIR=/tmp tmux new-session -d -s "$SESSION_NAME" -n agents

    # Create panes for each agent
    echo "Creating $AGENT_COUNT agent panes..."
    for i in $(seq 2 $AGENT_COUNT); do
        if [ $i -eq 2 ]; then
            # First split: horizontal
            env TMUX_TMPDIR=/tmp tmux split-window -t "$SESSION_NAME:agents" -h
        elif [ $i -eq 3 ]; then
            # Second split: vertical on left pane
            env TMUX_TMPDIR=/tmp tmux split-window -t "$SESSION_NAME:agents.0" -v
        elif [ $i -eq 4 ]; then
            # Third split: vertical on right top pane
            env TMUX_TMPDIR=/tmp tmux split-window -t "$SESSION_NAME:agents.1" -v
        elif [ $i -eq 5 ]; then
            # Fourth split: vertical on right bottom pane
            env TMUX_TMPDIR=/tmp tmux split-window -t "$SESSION_NAME:agents.3" -v
        fi
        sleep 0.2
    done
fi

# List panes
echo ""
echo "Panes in session:"
env TMUX_TMPDIR=/tmp tmux list-panes -t "$SESSION_NAME:agents" -F "Pane #{pane_index}: #{pane_width}x#{pane_height}"

# Setup pipe-pane for each agent
echo ""
echo "Setting up terminal capture..."
for i in $(seq 0 $((AGENT_COUNT - 1))); do
    LOG_FILE="$TERMINAL_DIR/agent-$i.log"

    # Create log file if it doesn't exist
    touch "$LOG_FILE"

    # Kill any existing pipe-pane
    env TMUX_TMPDIR=/tmp tmux pipe-pane -t "$SESSION_NAME:agents.$i" 2>/dev/null || true

    # Setup new pipe-pane
    echo "Setting up pipe-pane for agent $i -> $LOG_FILE"
    env TMUX_TMPDIR=/tmp tmux pipe-pane -t "$SESSION_NAME:agents.$i" -o "cat >> '$LOG_FILE'"

    # Send initial message to generate output
    EMOJI_ARRAY=("🚀" "🌟" "🎯" "💡" "⚡")
    EMOJI=${EMOJI_ARRAY[$i]}
    MESSAGE="[$EMOJI Agent $((i+1))] Terminal streaming activated at $(date '+%H:%M:%S')"
    env TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.$i" "echo '$MESSAGE'" Enter
done

# Wait for output
echo ""
echo "Waiting for output to be captured..."
sleep 2

# Check log files
echo ""
echo "Checking log files:"
SUCCESS=true
for i in $(seq 0 $((AGENT_COUNT - 1))); do
    LOG_FILE="$TERMINAL_DIR/agent-$i.log"
    if [ -f "$LOG_FILE" ]; then
        SIZE=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo "0")
        if [ "$SIZE" -gt 0 ]; then
            echo "✓ agent-$i.log: $SIZE bytes"
            echo "  Last line: $(tail -n 1 "$LOG_FILE")"
        else
            echo "✗ agent-$i.log: empty"
            SUCCESS=false
        fi
    else
        echo "✗ agent-$i.log: not found"
        SUCCESS=false
    fi
done

# Send continuous test messages for real-time testing
echo ""
echo "Sending continuous test messages..."
for i in $(seq 0 $((AGENT_COUNT - 1))); do
    (
        for j in {1..5}; do
            MESSAGE="[Agent $((i+1))] Real-time message $j at $(date '+%H:%M:%S.%3N')"
            env TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.$i" "echo '$MESSAGE'" Enter
            sleep 0.5
        done
    ) &
done

wait

echo ""
echo "======================================="
if [ "$SUCCESS" = true ]; then
    echo "✓ Terminal streaming setup complete!"
    echo ""
    echo "The tmux session is running and capturing output."
    echo "Check the UI to see if messages appear in real-time."
else
    echo "⚠ Terminal streaming setup had issues"
    echo "Some log files may not be capturing correctly."
fi
echo "======================================="