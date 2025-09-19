#!/bin/bash
# Mock Claude Agent Script for MaiFarm
# Launches Python-based mock agents with realistic output when Claude CLI is not available

# Get environment variables passed from orchestrator
FARM_ID=${FARM_ID:-"test-farm"}
AGENT_COUNT=${AGENT_COUNT:-3}
SESSION_NAME=${SESSION_NAME:-"farm-${FARM_ID:0:8}"}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[Mock Claude Agent] Starting for farm $FARM_ID with $AGENT_COUNT agents..."
echo "[Mock Claude Agent] Session name: $SESSION_NAME"

# Get the prompt from environment or use default
PROMPT="${AGENT_PROMPT:-Help me with this project}"

# Check if tmux session exists
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "[Mock Claude Agent] Session $SESSION_NAME already exists"
    
    # Launch Python mock agent in each existing pane
    for i in $(seq 0 $((AGENT_COUNT-1))); do
        PANE_TARGET="${SESSION_NAME}:agents.${i}"
        
        # Clear the pane and set up environment
        tmux send-keys -t "$PANE_TARGET" C-c C-m  # Stop any existing process
        sleep 0.1
        tmux send-keys -t "$PANE_TARGET" "clear" C-m
        
        # Export environment variables for the Python script
        tmux send-keys -t "$PANE_TARGET" "export AGENT_ID=$i" C-m
        tmux send-keys -t "$PANE_TARGET" "export SESSION_NAME='$SESSION_NAME'" C-m
        tmux send-keys -t "$PANE_TARGET" "export FARM_ID='$FARM_ID'" C-m
        tmux send-keys -t "$PANE_TARGET" "export AGENT_PROMPT='$PROMPT'" C-m
        tmux send-keys -t "$PANE_TARGET" "export MAIFARM_WORKSPACE='${MAIFARM_WORKSPACE:-/tmp/maifarm-workspace}'" C-m
        
        # Launch the Python mock agent with all environment already set
        tmux send-keys -t "$PANE_TARGET" "cd '${MAIFARM_WORKSPACE:-/tmp/maifarm-workspace}' && python3 '${SCRIPT_DIR}/python/mock_claude_agent.py' 2>&1" C-m
        
        echo "[Mock Claude Agent] Launched Python mock agent $i in pane $PANE_TARGET"
        
        # Small delay between launches for visual effect
        sleep 0.2
    done
    
    echo "[Mock Claude Agent] All mock agents launched successfully"
    echo "[Mock Claude Agent] Agents will continue running with realistic output"
    
else
    echo "[Mock Claude Agent] ERROR: Session $SESSION_NAME does not exist"
    echo "[Mock Claude Agent] The orchestrator should have created it already"
    exit 1
fi

# Keep the script running for a moment to ensure all agents start
sleep 2
echo "[Mock Claude Agent] Mock agent launcher completed"
echo "[Mock Claude Agent] Session $SESSION_NAME remains active with $AGENT_COUNT agents producing output"