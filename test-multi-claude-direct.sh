#!/bin/bash

# Test multi_claude.py directly
echo "Testing multi_claude.py launch..."

# Kill any existing test session
tmux kill-session -t test_farm 2>/dev/null

# Launch with a simple prompt
python3 /Users/rohnspringfield/maifarm/multi_claude.py \
  -n 2 \
  -p "Create a simple hello world program in Python" \
  -s test_farm \
  --debug \
  --no-kill-on-exit &

PYTHON_PID=$!
echo "Launched multi_claude.py with PID: $PYTHON_PID"

# Wait a moment for tmux session to be created
sleep 3

# Check if tmux session exists
if tmux has-session -t test_farm 2>/dev/null; then
    echo "✓ Tmux session created successfully"
    
    # List panes
    echo "Panes in session:"
    tmux list-panes -t test_farm
    
    # Check agent status
    echo "Checking coordination directory..."
    if [ -f /tmp/claude_coordination/active_agents.json ]; then
        echo "Active agents:"
        cat /tmp/claude_coordination/active_agents.json | jq '.'
    else
        echo "No active_agents.json found yet"
    fi
else
    echo "✗ Tmux session not created"
    echo "Checking Python process output..."
    ps aux | grep $PYTHON_PID
fi

echo ""
echo "To view the session: tmux attach -t test_farm"
echo "To kill the session: tmux kill-session -t test_farm"