#!/bin/bash

# Direct test of mock agent to verify it works

echo "Testing Mock Claude Agent directly..."
echo ""

# Set up test environment
export AGENT_ID=0
export AGENT_NAME="Test Agent"
export AGENT_PROMPT="Test the mock agent output"
export SESSION_NAME="test-session"
export FARM_ID="test-farm-123"
export MAIFARM_WORKSPACE="/tmp/test-workspace"

# Create workspace
mkdir -p "$MAIFARM_WORKSPACE"

# Run the mock agent for 10 seconds
echo "Running mock agent for 10 seconds..."
echo "Press Ctrl+C to stop"
echo ""

# Launch with timeout
timeout 10 python3 /Users/rohnspringfield/maifarm/scripts/python/mock_claude_agent.py 2>&1 || true

echo ""
echo "Test complete. If you saw agent output above, the mock agent is working."