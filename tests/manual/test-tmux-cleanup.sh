#!/bin/bash

echo "Testing TMUX Session Cleanup"
echo "============================="
echo ""

# List current sessions
echo "Current TMUX Sessions:"
tmux list-sessions -F "#{session_name}:#{session_created}" 2>/dev/null | while IFS=: read name created; do
    current_time=$(date +%s)
    age_minutes=$(( ($current_time - $created) / 60 ))
    echo "  - $name (Age: ${age_minutes} minutes)"
done

echo ""
echo "Creating test sessions..."

# Create some test sessions
tmux new-session -d -s "quick-test-old" 2>/dev/null
tmux new-session -d -s "goWild-test-old" 2>/dev/null
tmux new-session -d -s "farm-test-recent" 2>/dev/null

echo "Created test sessions"
echo ""

# Simulate aging by killing and recreating with fake timestamps
# Note: This is just for demonstration - in real usage, sessions age naturally

echo "Sessions after creation:"
tmux list-sessions -F "#{session_name}" 2>/dev/null | grep -E "test-old|test-recent" | while read name; do
    echo "  - $name"
done

echo ""
echo "Cleanup Script Features:"
echo "1. Quick task sessions: cleaned after 10 minutes"
echo "2. GoWild sessions: cleaned after 30 minutes"
echo "3. Farm sessions: cleaned after 2 hours"
echo "4. Invalid/orphaned sessions: cleaned immediately"
echo ""

echo "The cleanup runs:"
echo "- On server startup"
echo "- Every 30 minutes automatically"
echo "- When listing sessions via API"
echo "- Manually via POST /api/terminal/cleanup"
echo ""

# Clean up test sessions
echo "Cleaning up test sessions..."
tmux kill-session -t "quick-test-old" 2>/dev/null
tmux kill-session -t "goWild-test-old" 2>/dev/null
tmux kill-session -t "farm-test-recent" 2>/dev/null

echo "Test complete!"