#!/bin/bash

# Direct test of mock agents in tmux without server

echo "============================================"
echo "Direct Mock Agent Tmux Test"
echo "============================================"
echo ""

SESSION_NAME="test-mock-$(date +%s)"
SCRIPT_DIR="/Users/rohnspringfield/maifarm/scripts/python"

echo "Creating tmux session: $SESSION_NAME"

# Kill any existing test sessions
tmux kill-session -t "$SESSION_NAME" 2>/dev/null

# Create new session with 2 panes
tmux new-session -d -s "$SESSION_NAME" -n "agents"
tmux split-window -t "$SESSION_NAME:agents" -h
tmux select-layout -t "$SESSION_NAME:agents" even-horizontal

echo "✅ Session created with 2 panes"
echo ""

# Launch mock agents in each pane
for i in 0 1; do
    echo "Launching mock agent $i..."
    
    # Set environment variables
    tmux send-keys -t "$SESSION_NAME:agents.$i" "export AGENT_ID=$i" Enter
    tmux send-keys -t "$SESSION_NAME:agents.$i" "export AGENT_NAME='Test Agent $i'" Enter
    tmux send-keys -t "$SESSION_NAME:agents.$i" "export AGENT_PROMPT='Test mock agent output in tmux'" Enter
    tmux send-keys -t "$SESSION_NAME:agents.$i" "export SESSION_NAME='$SESSION_NAME'" Enter
    tmux send-keys -t "$SESSION_NAME:agents.$i" "export FARM_ID='test-farm'" Enter
    
    # Launch the simple mock agent
    tmux send-keys -t "$SESSION_NAME:agents.$i" "python3 '$SCRIPT_DIR/simple_mock_agent.py' 2>&1" Enter
done

echo "✅ Mock agents launched"
echo ""

# Wait for output
echo "⏳ Waiting 5 seconds for agents to produce output..."
sleep 5

# Check output
echo ""
echo "Checking agent output:"
echo "============================================"

for i in 0 1; do
    echo ""
    echo "Agent $i output:"
    echo "--------------------------------------------"
    
    OUTPUT=$(tmux capture-pane -t "$SESSION_NAME:agents.$i" -p 2>/dev/null)
    OUTPUT_LENGTH=$(echo "$OUTPUT" | wc -c)
    
    if [ "$OUTPUT_LENGTH" -gt 50 ]; then
        echo "✅ Has output ($OUTPUT_LENGTH bytes)"
        echo ""
        echo "First 10 lines:"
        echo "$OUTPUT" | head -10 | sed 's/^/  /'
        
        # Check for expected content
        if echo "$OUTPUT" | grep -q "Mock Claude Agent"; then
            echo ""
            echo "✅ Mock agent header found"
        fi
        
        if echo "$OUTPUT" | grep -q "Agent Active"; then
            echo "✅ Agent is active and producing output"
        fi
    else
        echo "❌ No output or very little output ($OUTPUT_LENGTH bytes)"
        echo "Raw output:"
        echo "$OUTPUT"
    fi
done

echo ""
echo "============================================"
echo "Test complete!"
echo ""
echo "To see live agents in action:"
echo "  tmux attach -t $SESSION_NAME"
echo ""
echo "To cleanup:"
echo "  tmux kill-session -t $SESSION_NAME"
echo ""
echo "If agents are producing output above, the mock system is working."
echo "If not, there may be an issue with Python or the script path."