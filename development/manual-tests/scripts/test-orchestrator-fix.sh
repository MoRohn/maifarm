#!/bin/bash
# Test the orchestrator fix with mock provider

echo "Testing orchestrator with mock provider..."

# Set up environment for mock provider (no API key needed)
export AI_PROVIDER=mock
export PYTHONUNBUFFERED=1

# Create a test workspace
TEST_WORKSPACE="/tmp/test-orchestrator-$(date +%s)"
mkdir -p "$TEST_WORKSPACE"

echo "Test workspace: $TEST_WORKSPACE"

# Run orchestrator with mock provider
python3 scripts/python/orchestrator.py \
  --num-agents 1 \
  --session "test-fix" \
  --farm-id "test-farm-123" \
  --workspace-dir "$TEST_WORKSPACE" \
  --prompt "Test prompt for mock agent" \
  --provider mock \
  --max-runtime 10 \
  --debug

echo "Test completed. Check tmux session: tmux attach -t test-fix"