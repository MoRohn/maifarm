#!/bin/bash
# Mock Claude Agent Script for MaiFarm
# This simulates a Claude agent for development/testing when Claude CLI is not available

echo "[Mock Claude Agent] Starting..."
echo "[Mock Claude Agent] Session initialized"
echo "Created tmux session successfully"

# Simulate agent activity
count=0
while [ $count -lt 30 ]; do
    sleep 2
    case $((count % 5)) in
        0) echo "[Agent] Analyzing requirements..." ;;
        1) echo "[Agent] Working on: Task implementation" ;;
        2) echo "[Agent] Processing files..." ;;
        3) echo "[Agent] Generating output..." ;;
        4) echo "[Agent] Task progress: $((count * 3))%" ;;
    esac
    count=$((count + 1))
done

echo "[Agent] Tasks completed successfully"
echo "[Mock Claude Agent] Session ended"