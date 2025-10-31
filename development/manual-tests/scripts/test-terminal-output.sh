#!/bin/bash

# Test that terminals show output after farm launch

echo "============================================"
echo "MaiFarm Terminal Output Test"
echo "============================================"
echo ""

API_URL="http://localhost:4567"

# Check server
if ! curl -s "$API_URL/api/health" > /dev/null 2>&1; then
    echo "❌ Server not running. Start with: npm run start"
    exit 1
fi

echo "✅ Server is running"
echo ""

# Create a Quick Task farm
echo "Creating Quick Task farm..."
RESPONSE=$(curl -s -X POST "$API_URL/api/farms/quick-task" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Test terminal output visibility",
    "agentCount": 2
  }')

FARM_ID=$(echo "$RESPONSE" | grep -o '"farmId":"[^"]*' | cut -d'"' -f4)

if [ -z "$FARM_ID" ]; then
    echo "❌ Failed to create farm"
    echo "Response: $RESPONSE"
    exit 1
fi

echo "✅ Farm created: $FARM_ID"
SESSION_NAME="quick_${FARM_ID:0:8}"
echo "Session name: $SESSION_NAME"
echo ""

# Wait for agents to launch
echo "⏳ Waiting 8 seconds for agents to launch and produce output..."
sleep 8

# Check tmux session
echo ""
echo "Checking tmux session..."
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "✅ Session exists"
    
    # Count panes
    PANE_COUNT=$(tmux list-panes -t "$SESSION_NAME:0" 2>/dev/null | wc -l)
    echo "Found $PANE_COUNT panes"
    
    # Check each pane for output
    echo ""
    echo "Checking agent output:"
    echo "----------------------------------------"
    
    for i in 0 1; do
        echo ""
        echo "Agent $i:"
        OUTPUT=$(tmux capture-pane -t "$SESSION_NAME:0.$i" -p 2>/dev/null)
        OUTPUT_LENGTH=$(echo "$OUTPUT" | wc -c)
        
        if [ "$OUTPUT_LENGTH" -gt 10 ]; then
            echo "✅ Has output ($OUTPUT_LENGTH bytes)"
            
            # Show first 5 non-empty lines
            echo "Preview:"
            echo "$OUTPUT" | grep -v "^$" | head -5 | sed 's/^/  /'
            
            # Check for mock agent indicators
            if echo "$OUTPUT" | grep -qE "(Mock Claude Agent|Starting|Thinking|Processing|Agent Active)"; then
                echo "✅ Mock agent is running correctly"
            fi
        else
            echo "❌ No output detected"
        fi
    done
else
    echo "❌ Session not found"
    
    # List all sessions
    echo ""
    echo "Available sessions:"
    tmux list-sessions -F "  #{session_name}" 2>/dev/null || echo "  None"
fi

echo ""
echo "----------------------------------------"
echo "Test complete!"
echo ""
echo "To see live output:"
echo "  tmux attach -t $SESSION_NAME"
echo ""
echo "To cleanup:"
echo "  tmux kill-session -t $SESSION_NAME"