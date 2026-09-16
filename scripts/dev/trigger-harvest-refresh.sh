#!/bin/bash

MAIFARM_ROOT="${MAIFARM_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
export MAIFARM_ROOT

# Trigger harvest page refresh by generating output and calling API

FARM_ID="325dca22-4d8e-4365-bbd5-8a333d44ea7a"
SESSION_NAME="farm-325dca22"
TERMINAL_DIR="${MAIFARM_ROOT}/var/maibarn/terminals/$FARM_ID"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Harvest Page Auto-Refresh Trigger${NC}"
echo -e "${BLUE}========================================${NC}"
echo

echo -e "${YELLOW}This will append output to log files and trigger refresh${NC}"
echo -e "Press Ctrl+C to stop"
echo

COUNT=0
AGENT_NAMES=("Bessie the Cow 🐄" "Cluck the Chicken 🐔" "Wilbur the Pig 🐷")

# Messages pool
MESSAGES=(
  "🚀 Processing your request..."
  "📊 Analyzing the data patterns..."
  "💡 Found an interesting solution!"
  "🔍 Deep diving into the problem..."
  "⚡ Speed optimization complete!"
  "🎯 Target achieved successfully!"
  "🌱 Growing the solution tree..."
  "🔧 Building the components..."
  "✨ Magic happening here..."
  "🏗️ Architecture established!"
  "🎨 Crafting beautiful output..."
  "📝 Writing documentation..."
  "🔬 Testing the implementation..."
  "🌟 Excellence achieved!"
  "🔥 Performance boost activated!"
)

while true; do
    # Generate output for each agent
    for i in 0 1 2; do
        LOG_FILE="$TERMINAL_DIR/agent-$i.log"
        AGENT="${AGENT_NAMES[$i]}"

        # Random message
        MSG_INDEX=$((RANDOM % ${#MESSAGES[@]}))
        MESSAGE="${MESSAGES[$MSG_INDEX]}"

        # Append to log file with timestamp
        TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
        OUTPUT="[$TIMESTAMP] $AGENT: $MESSAGE (Update #$COUNT)"

        echo "$OUTPUT" >> "$LOG_FILE"
    done

    # Also capture current tmux pane content
    for i in 0 1 2; do
        CAPTURE_FILE="$TERMINAL_DIR/agent-$i-capture.txt"
        TMUX_TMPDIR=/tmp tmux capture-pane -t "$SESSION_NAME:0.$i" -p > "$CAPTURE_FILE" 2>/dev/null || true
    done

    COUNT=$((COUNT + 1))
    echo -e "${GREEN}✓ Generated update #$COUNT for all agents${NC}"

    # Trigger API refresh endpoint (if exists)
    curl -s -X POST "http://localhost:4567/api/farms/$FARM_ID/refresh" \
        -H "Content-Type: application/json" \
        -d '{"type": "terminal_update"}' >/dev/null 2>&1 || true

    # Emit WebSocket event via simple curl
    curl -s -X POST "http://localhost:4567/api/terminal/broadcast" \
        -H "Content-Type: application/json" \
        -d "{\"farmId\": \"$FARM_ID\", \"event\": \"terminal:update\", \"count\": $COUNT}" >/dev/null 2>&1 || true

    # Show file sizes
    echo -e "${YELLOW}Log file sizes:${NC}"
    for i in 0 1 2; do
        SIZE=$(wc -c < "$TERMINAL_DIR/agent-$i.log")
        echo "  agent-$i.log: $SIZE bytes"
    done

    # Update heartbeat
    echo "$(date +%s)" > "$TERMINAL_DIR/orchestrator.heartbeat"

    # Wait before next update
    sleep 2
done