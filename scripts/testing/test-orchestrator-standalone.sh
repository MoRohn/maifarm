#!/bin/bash
# Test script to validate orchestrator.py works standalone
# This helps diagnose orchestrator issues independent of the Node.js backend

set -e  # Exit on error

echo "🔧 MaiFarm Orchestrator Standalone Test"
echo "========================================"
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
TEST_SESSION="test-orchestrator-$$"
TEST_FARM_ID="test-farm-$(date +%s)"
WORKSPACE_DIR="var/maibarn/workspaces"
COORDINATION_DIR="var/maibarn/coordination"
TERMINALS_DIR="var/maibarn/terminals"
NUM_AGENTS=2

# Cleanup function
cleanup() {
    echo
    echo "🧹 Cleaning up..."
    TMUX_TMPDIR=/tmp tmux kill-session -t "$TEST_SESSION" 2>/dev/null || true
    rm -f /tmp/test-prompt-$$.yaml
    echo "✅ Cleanup complete"
}

# Register cleanup on exit
trap cleanup EXIT

echo "📋 Test Configuration:"
echo "  Session: $TEST_SESSION"
echo "  Farm ID: $TEST_FARM_ID"
echo "  Agents: $NUM_AGENTS"
echo "  Workspace: $WORKSPACE_DIR"
echo

# Step 1: Check prerequisites
echo "1️⃣ Checking prerequisites..."

if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ python3 not found${NC}"
    exit 1
fi
echo -e "${GREEN}  ✓ python3 found:${NC} $(which python3)"

if ! command -v tmux &> /dev/null; then
    echo -e "${RED}❌ tmux not found${NC}"
    exit 1
fi
echo -e "${GREEN}  ✓ tmux found:${NC} $(which tmux)"

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo -e "${YELLOW}  ⚠ ANTHROPIC_API_KEY not set - will use mock agents${NC}"
else
    echo -e "${GREEN}  ✓ ANTHROPIC_API_KEY is set${NC}"
fi

# Step 2: Create test prompt file
echo
echo "2️⃣ Creating test prompt file..."

cat > /tmp/test-prompt-$$.yaml << 'EOF'
name: 'Orchestrator Test Farm'
description: 'Test farm to validate orchestrator functionality'
initial_prompt: 'Write a simple hello world message with your agent name and the current time'
numberOfAgents: 2
agents:
  - name: "Test Agent Alpha"
    role: "Primary test agent"
    type: "primary"
    tasks: []
    capabilities: []
  - name: "Test Agent Beta"
    role: "Secondary test agent"
    type: "secondary"
    tasks: []
    capabilities: []
steps: []
EOF

echo -e "${GREEN}  ✓ Created test prompt at /tmp/test-prompt-$$.yaml${NC}"

# Step 3: Ensure directories exist
echo
echo "3️⃣ Ensuring required directories exist..."

mkdir -p "$WORKSPACE_DIR"
mkdir -p "$COORDINATION_DIR"
mkdir -p "$TERMINALS_DIR"

echo -e "${GREEN}  ✓ Directories created${NC}"

# Step 4: Run orchestrator
echo
echo "4️⃣ Launching orchestrator..."
echo "  Command: python3 scripts/python/orchestrator.py \\"
echo "    --prompt-file /tmp/test-prompt-$$.yaml \\"
echo "    --num-agents $NUM_AGENTS \\"
echo "    --farm-id $TEST_FARM_ID \\"
echo "    --session $TEST_SESSION \\"
echo "    --workspace-dir $WORKSPACE_DIR \\"
echo "    --coordination-dir $COORDINATION_DIR \\"
echo "    --provider claude \\"
echo "    --debug \\"
echo "    --no-kill-on-exit \\"
echo "    --fast-launch \\"
echo "    --max-runtime 30"
echo

# Run orchestrator with timeout
timeout 35 python3 scripts/python/orchestrator.py \
  --prompt-file /tmp/test-prompt-$$.yaml \
  --num-agents $NUM_AGENTS \
  --farm-id $TEST_FARM_ID \
  --session $TEST_SESSION \
  --workspace-dir $WORKSPACE_DIR \
  --coordination-dir $COORDINATION_DIR \
  --provider claude \
  --debug \
  --no-kill-on-exit \
  --fast-launch \
  --max-runtime 30 &

ORCHESTRATOR_PID=$!

echo "  Orchestrator PID: $ORCHESTRATOR_PID"
echo

# Step 5: Wait for session creation and verify
echo "5️⃣ Waiting for tmux session creation..."

MAX_WAIT=10
WAIT_COUNT=0
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if TMUX_TMPDIR=/tmp tmux has-session -t "$TEST_SESSION" 2>/dev/null; then
        echo -e "${GREEN}  ✓ Tmux session created successfully${NC}"
        break
    fi
    sleep 1
    WAIT_COUNT=$((WAIT_COUNT + 1))
    echo -n "."
done

if [ $WAIT_COUNT -eq $MAX_WAIT ]; then
    echo -e "${RED}❌ Tmux session not created after ${MAX_WAIT} seconds${NC}"
    kill $ORCHESTRATOR_PID 2>/dev/null || true
    exit 1
fi

# Step 6: Verify panes
echo
echo "6️⃣ Verifying panes..."

PANE_COUNT=$(TMUX_TMPDIR=/tmp tmux list-panes -t "$TEST_SESSION:agents" 2>/dev/null | wc -l)
echo "  Found $PANE_COUNT panes (expected $NUM_AGENTS)"

if [ "$PANE_COUNT" -eq "$NUM_AGENTS" ]; then
    echo -e "${GREEN}  ✓ Correct number of panes created${NC}"
else
    echo -e "${YELLOW}  ⚠ Pane count mismatch${NC}"
fi

# Step 7: Verify terminal log files
echo
echo "7️⃣ Verifying terminal output capture..."

sleep 3  # Give time for pipe-pane to write

for i in $(seq 0 $((NUM_AGENTS - 1))); do
    LOG_FILE="$TERMINALS_DIR/$TEST_FARM_ID/agent-$i.log"
    if [ -f "$LOG_FILE" ]; then
        SIZE=$(wc -c < "$LOG_FILE")
        echo -e "${GREEN}  ✓ agent-$i.log exists (${SIZE} bytes)${NC}"
        if [ "$SIZE" -gt 0 ]; then
            echo "    Preview:"
            head -3 "$LOG_FILE" | sed 's/^/      /'
        fi
    else
        echo -e "${RED}  ❌ agent-$i.log not found${NC}"
    fi
done

# Step 8: Check orchestrator status file
echo
echo "8️⃣ Checking orchestrator status..."

STATUS_FILE="$COORDINATION_DIR/orchestrator_status_$TEST_FARM_ID.json"
if [ -f "$STATUS_FILE" ]; then
    echo -e "${GREEN}  ✓ Orchestrator status file exists${NC}"
    echo "  Content:"
    cat "$STATUS_FILE" | jq '.' | sed 's/^/    /' || cat "$STATUS_FILE" | sed 's/^/    /'
else
    echo -e "${YELLOW}  ⚠ Orchestrator status file not found${NC}"
    echo "  Expected at: $STATUS_FILE"
fi

# Step 9: Display live pane content
echo
echo "9️⃣ Capturing pane content..."

for i in $(seq 0 $((NUM_AGENTS - 1))); do
    echo "  === Pane $i ==="
    TMUX_TMPDIR=/tmp tmux capture-pane -t "$TEST_SESSION:agents.$i" -p 2>/dev/null | tail -5 | sed 's/^/    /' || echo "    (empty)"
done

# Step 10: Wait for orchestrator to finish or timeout
echo
echo "🔟 Waiting for orchestrator to complete (max 30s)..."

wait $ORCHESTRATOR_PID 2>/dev/null
ORCH_EXIT=$?

echo
if [ $ORCH_EXIT -eq 0 ]; then
    echo -e "${GREEN}✅ Orchestrator completed successfully${NC}"
elif [ $ORCH_EXIT -eq 124 ]; then
    echo -e "${GREEN}✅ Orchestrator timed out as expected (30s runtime)${NC}"
else
    echo -e "${YELLOW}⚠ Orchestrator exited with code: $ORCH_EXIT${NC}"
fi

# Final summary
echo
echo "📊 Test Summary"
echo "==============="
echo "  Session: $TEST_SESSION"
echo "  Farm ID: $TEST_FARM_ID"
echo "  Panes created: $PANE_COUNT / $NUM_AGENTS"
echo "  Terminal logs: $(ls $TERMINALS_DIR/$TEST_FARM_ID/*.log 2>/dev/null | wc -l) / $NUM_AGENTS"
echo "  Status file: $([ -f "$STATUS_FILE" ] && echo "✓" || echo "✗")"
echo

echo "🎯 To inspect the session manually:"
echo "  TMUX_TMPDIR=/tmp tmux attach -t $TEST_SESSION"
echo
echo "🧹 Session will be automatically cleaned up on exit"
echo

exit 0
