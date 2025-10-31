#!/bin/bash

echo "🚀 Real Claude CLI Farm Test with Terminal Streaming"
echo "===================================================="

# Create a test prompt
PROMPT="Create a simple hello world function in Python that prints the current time"

echo -e "\n📋 Step 1: Launching farm with 3 Claude CLI agents..."

# Launch farm using the Python orchestrator
python3 scripts/python/orchestrator.py --num-agents 3 --prompt "$PROMPT" --fast-launch &
ORCHESTRATOR_PID=$!

echo "   Orchestrator PID: $ORCHESTRATOR_PID"
echo "   Waiting for farm to be created..."

# Wait for farm creation
sleep 5

# Get the latest farm from the API
echo -e "\n📋 Step 2: Getting farm details from API..."
FARM_JSON=$(curl -s http://localhost:4567/api/farms | jq '.data[0]')

if [ "$FARM_JSON" == "null" ] || [ -z "$FARM_JSON" ]; then
    echo "❌ No farm found in API"
    exit 1
fi

FARM_ID=$(echo "$FARM_JSON" | jq -r '.id')
SESSION_ID=$(echo "$FARM_JSON" | jq -r '.sessionId // .session_id // empty')
STATUS=$(echo "$FARM_JSON" | jq -r '.status')

if [ -z "$SESSION_ID" ]; then
    SESSION_ID="farm-${FARM_ID:0:8}"
fi

echo "✅ Farm found:"
echo "   ID: $FARM_ID"
echo "   Session: $SESSION_ID"
echo "   Status: $STATUS"

# Check tmux session
echo -e "\n📋 Step 3: Checking tmux session..."
if TMUX_TMPDIR=/tmp tmux has-session -t "$SESSION_ID" 2>/dev/null; then
    echo "✅ Tmux session exists: $SESSION_ID"

    # List panes
    echo "   Panes:"
    TMUX_TMPDIR=/tmp tmux list-panes -t "$SESSION_ID" -F "   - Pane #{pane_index}: #{pane_current_path}"
else
    echo "⚠️ Tmux session not found: $SESSION_ID"
fi

# Check terminal files
echo -e "\n📋 Step 4: Checking terminal output files..."
TERMINAL_DIR="/Users/rohnspringfield/maifarm/var/maibarn/terminals/$FARM_ID"

if [ -d "$TERMINAL_DIR" ]; then
    echo "✅ Terminal directory exists: $TERMINAL_DIR"

    for i in 0 1 2; do
        FILE="$TERMINAL_DIR/agent-$i.log"
        if [ -f "$FILE" ]; then
            SIZE=$(stat -f%z "$FILE" 2>/dev/null || stat -c%s "$FILE" 2>/dev/null || echo "0")
            echo "   ✅ agent-$i.log exists (${SIZE} bytes)"

            if [ "$SIZE" -gt 0 ]; then
                echo "      Preview: $(head -1 "$FILE" | cut -c1-80)..."
            fi
        else
            echo "   ❌ agent-$i.log not found"
        fi
    done
else
    echo "❌ Terminal directory not found: $TERMINAL_DIR"
fi

# Open browser to view the harvest
echo -e "\n📋 Step 5: Opening browser to view harvest..."
URL="http://localhost:3000/harvest/$FARM_ID"
echo "   URL: $URL"
open "$URL"

# Monitor for a bit
echo -e "\n📋 Step 6: Monitoring terminal output for 30 seconds..."
echo "   Watch the browser for real-time updates..."

# Monitor terminal files for changes
for i in {1..30}; do
    sleep 1
    echo -n "."

    # Check if any log files are growing
    if [ -d "$TERMINAL_DIR" ]; then
        for j in 0 1 2; do
            FILE="$TERMINAL_DIR/agent-$j.log"
            if [ -f "$FILE" ]; then
                NEW_SIZE=$(stat -f%z "$FILE" 2>/dev/null || stat -c%s "$FILE" 2>/dev/null || echo "0")
                if [ "$NEW_SIZE" -gt 0 ]; then
                    # File has content
                    :
                fi
            fi
        done
    fi
done

echo -e "\n\n📊 Final Status:"
echo "===================="

# Final check of terminal files
if [ -d "$TERMINAL_DIR" ]; then
    TOTAL_SIZE=0
    for i in 0 1 2; do
        FILE="$TERMINAL_DIR/agent-$i.log"
        if [ -f "$FILE" ]; then
            SIZE=$(stat -f%z "$FILE" 2>/dev/null || stat -c%s "$FILE" 2>/dev/null || echo "0")
            TOTAL_SIZE=$((TOTAL_SIZE + SIZE))
            echo "✅ Agent $i log: ${SIZE} bytes"
        else
            echo "❌ Agent $i log: missing"
        fi
    done
    echo "Total terminal output: ${TOTAL_SIZE} bytes"
else
    echo "❌ Terminal directory still missing"
fi

# Check if Claude agents are actually running
echo -e "\nAgent Processes:"
ps aux | grep -E "(claude|orchestrator)" | grep -v grep | head -5

echo -e "\n✅ Test complete!"
echo "Check the browser to see if terminals are displaying and streaming."
echo ""
echo "To clean up:"
echo "  - Kill orchestrator: kill $ORCHESTRATOR_PID"
echo "  - Kill tmux session: TMUX_TMPDIR=/tmp tmux kill-session -t $SESSION_ID"