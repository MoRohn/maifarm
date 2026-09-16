#!/bin/bash
# Debug script to test XenoSync launch

echo "Testing XenoSync launcher..."

# Create test prompt file
TEST_PROMPT="/tmp/test-prompt.txt"
echo "Test task for debugging" > "$TEST_PROMPT"

# Create test config file
TEST_CONFIG="/tmp/test-config.json"
cat > "$TEST_CONFIG" << EOF
{
  "farmId": "test-farm",
  "agents": 2,
  "mode": "parallel"
}
EOF

# Test the launcher
echo "Running XenoSync with test configuration..."
python3 scripts/python/xenosync_cli.py \
  "$TEST_PROMPT" \
  --agents 2 \
  --mode parallel \
  --config "$TEST_CONFIG" \
  --sessions-dir /tmp/xenosync-sessions \
  --session-id test-session \
  --farm-id test-farm \
  --debug 2>&1 | head -100

echo "Exit code: $?"