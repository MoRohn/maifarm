#!/bin/bash

# Test script to verify pipe-pane works with XenoSync sessions

SESSION_NAME="test-xenosync"
TMUX_TMPDIR=/tmp

echo "Testing pipe-pane with XenoSync-style tmux session..."

# Create a test session with 'agents' window (like XenoSync does)
echo "Creating session $SESSION_NAME with 'agents' window..."
TMUX_TMPDIR=$TMUX_TMPDIR tmux new-session -d -s $SESSION_NAME -n agents
TMUX_TMPDIR=$TMUX_TMPDIR tmux split-window -t $SESSION_NAME:agents
TMUX_TMPDIR=$TMUX_TMPDIR tmux select-layout -t $SESSION_NAME:agents tiled

# List windows to verify
echo "Windows in session:"
TMUX_TMPDIR=$TMUX_TMPDIR tmux list-windows -t $SESSION_NAME

# List panes
echo "Panes in agents window:"
TMUX_TMPDIR=$TMUX_TMPDIR tmux list-panes -t $SESSION_NAME:agents

# Test pipe-pane with correct window reference
TEST_LOG="/tmp/test-pipe-${SESSION_NAME}.log"
echo "Setting up pipe-pane to $TEST_LOG..."
TMUX_TMPDIR=$TMUX_TMPDIR tmux pipe-pane -t "$SESSION_NAME:agents.0" -o "cat >> '$TEST_LOG'"

# Send test output
echo "Sending test message..."
TMUX_TMPDIR=$TMUX_TMPDIR tmux send-keys -t "$SESSION_NAME:agents.0" "echo 'Test message from pipe-pane'" Enter

# Wait and check if log captured the output
sleep 1
if [ -f "$TEST_LOG" ]; then
    echo "✅ Log file created"
    echo "Log contents:"
    cat "$TEST_LOG"
    if grep -q "Test message" "$TEST_LOG"; then
        echo "✅ Pipe-pane is working correctly!"
    else
        echo "❌ Pipe-pane created file but didn't capture output"
    fi
else
    echo "❌ Pipe-pane failed to create log file"
fi

# Cleanup
echo "Cleaning up..."
TMUX_TMPDIR=$TMUX_TMPDIR tmux kill-session -t $SESSION_NAME 2>/dev/null
rm -f "$TEST_LOG"

echo "Test complete!"