#!/bin/bash

# Simulate terminal activity to test auto-refresh
# This script generates activity in tmux panes every 2 seconds

FARM_ID="325dca22-4d8e-4365-bbd5-8a333d44ea7a"
SESSION_NAME="farm-325dca22"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Starting terminal activity simulation...${NC}"
echo -e "${YELLOW}This will generate output every 2 seconds${NC}"
echo -e "Press Ctrl+C to stop"
echo

# Agent messages
MESSAGES=(
  "🚀 Processing request..."
  "📊 Analyzing data..."
  "💡 Generating solution..."
  "🔍 Searching for patterns..."
  "⚡ Optimizing performance..."
  "🎯 Task completed successfully!"
  "🌱 Growing new ideas..."
  "🔧 Building components..."
  "✨ Creating magic..."
  "🏗️ Constructing framework..."
)

COUNT=0

while true; do
    # Select random message
    MSG_INDEX=$((RANDOM % ${#MESSAGES[@]}))
    MESSAGE="${MESSAGES[$MSG_INDEX]}"

    # Send to each agent pane
    for i in 0 1 2; do
        AGENT_NAMES=("Bessie the Cow 🐄" "Cluck the Chicken 🐔" "Wilbur the Pig 🐷")
        AGENT="${AGENT_NAMES[$i]}"

        # Send activity message
        TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:0.$i" \
            "echo '[$(date +%H:%M:%S)] ${AGENT}: ${MESSAGE} (Update #$COUNT)'" C-m 2>/dev/null
    done

    COUNT=$((COUNT + 1))
    echo -e "${GREEN}✓ Sent update #$COUNT to all agents${NC}"

    # Wait before next update
    sleep 2
done