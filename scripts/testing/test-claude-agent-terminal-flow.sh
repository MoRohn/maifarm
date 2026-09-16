#!/bin/bash

MAIFARM_ROOT="${MAIFARM_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
export MAIFARM_ROOT
# Test Claude Agent Terminal Flow
# Validates that Claude agents properly launch and display terminal output

set -e

echo "=== Claude Agent Terminal Flow Validation ==="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
TEST_FARM_ID="test-agent-$(date +%s)"
SESSION_NAME="farm-${TEST_FARM_ID:0:8}"
TERMINALS_DIR="${MAIFARM_ROOT}/var/maibarn/terminals/${TEST_FARM_ID}"
WORKSPACE_DIR="${MAIFARM_ROOT}/var/maibarn/workspaces/${TEST_FARM_ID}"
COORD_DIR="${MAIFARM_ROOT}/var/maibarn/coordination"

echo "Test Farm ID: $TEST_FARM_ID"
echo "Session Name: $SESSION_NAME"
echo ""

# Step 1: Verify Claude CLI
echo "Step 1: Verifying Claude CLI..."
if ! command -v claude &> /dev/null; then
    echo -e "${RED}✗ Claude CLI not found${NC}"
    exit 1
fi
CLAUDE_VERSION=$(claude --version 2>&1 || echo "unknown")
echo -e "${GREEN}✓ Claude CLI found: $CLAUDE_VERSION${NC}"
echo ""

# Step 2: Check API Key
echo "Step 2: Checking ANTHROPIC_API_KEY..."
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo -e "${YELLOW}⚠ ANTHROPIC_API_KEY not set - will use mock agent${NC}"
    USE_MOCK=true
else
    echo -e "${GREEN}✓ ANTHROPIC_API_KEY is set${NC}"
    USE_MOCK=false
fi
echo ""

# Step 3: Create test directories
echo "Step 3: Creating test workspace and terminal directories..."
mkdir -p "$TERMINALS_DIR"
mkdir -p "$WORKSPACE_DIR"
mkdir -p "$COORD_DIR"
echo -e "${GREEN}✓ Directories created${NC}"
echo ""

# Step 4: Create test tmux session
echo "Step 4: Creating test tmux session..."
export TMUX_TMPDIR=/tmp

# Kill existing test session if it exists
if TMUX_TMPDIR=/tmp tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Cleaning up existing session..."
    TMUX_TMPDIR=/tmp tmux kill-session -t "$SESSION_NAME"
    sleep 1
fi

# Create new session
TMUX_TMPDIR=/tmp tmux new-session -d -s "$SESSION_NAME" -n agents
echo -e "${GREEN}✓ Tmux session created: $SESSION_NAME${NC}"
echo ""

# Step 5: Set up pipe-pane for terminal capture
echo "Step 5: Setting up pipe-pane for terminal logging..."
LOG_FILE="$TERMINALS_DIR/agent-0.log"
touch "$LOG_FILE"
echo "# Terminal output for Agent 0" > "$LOG_FILE"

# Wait for pane to be ready
sleep 0.5

# Set up pipe-pane
TMUX_TMPDIR=/tmp tmux pipe-pane -t "$SESSION_NAME:agents.0" -o "cat >> $LOG_FILE"
echo -e "${GREEN}✓ Pipe-pane configured: $LOG_FILE${NC}"
echo ""

# Step 6: Test pipe-pane capture
echo "Step 6: Testing pipe-pane capture..."
INITIAL_SIZE=$(wc -c < "$LOG_FILE")
TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.0" "echo '[TEST] Pipe-pane capture test'" Enter
sleep 1

NEW_SIZE=$(wc -c < "$LOG_FILE")
if [ "$NEW_SIZE" -gt "$INITIAL_SIZE" ]; then
    echo -e "${GREEN}✓ Pipe-pane is capturing output${NC}"
    echo "  Initial size: $INITIAL_SIZE bytes"
    echo "  New size: $NEW_SIZE bytes"
else
    echo -e "${RED}✗ Pipe-pane not capturing - troubleshooting...${NC}"

    # Retry with explicit setup
    TMUX_TMPDIR=/tmp tmux pipe-pane -t "$SESSION_NAME:agents.0" -o "exec cat >> $LOG_FILE"
    sleep 0.5
    TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.0" "echo '[RETRY] Testing again'" Enter
    sleep 1

    RETRY_SIZE=$(wc -c < "$LOG_FILE")
    if [ "$RETRY_SIZE" -gt "$NEW_SIZE" ]; then
        echo -e "${GREEN}✓ Pipe-pane working after retry${NC}"
    else
        echo -e "${RED}✗ Pipe-pane still not working${NC}"
        exit 1
    fi
fi
echo ""

# Step 7: Test workspace setup
echo "Step 7: Setting up agent workspace..."
TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.0" "cd '$WORKSPACE_DIR'" Enter
sleep 0.5
TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.0" "pwd" Enter
sleep 0.5

# Check log file for pwd output
if grep -q "$WORKSPACE_DIR" "$LOG_FILE"; then
    echo -e "${GREEN}✓ Agent working directory set correctly${NC}"
else
    echo -e "${YELLOW}⚠ Working directory may not be set (check log manually)${NC}"
fi
echo ""

# Step 8: Create test prompt file
echo "Step 8: Creating test prompt file..."
PROMPT_FILE="$COORD_DIR/test_agent_0_prompt.txt"
cat > "$PROMPT_FILE" << 'EOF'
You are a test agent validating terminal output capture.

Your task:
1. Echo "Agent starting validation test"
2. Create a test file named "validation.txt" with the content "Terminal capture working"
3. Echo "Validation test complete"
4. List the files in the current directory

This is a simple test to ensure terminal output is being captured correctly.
EOF
echo -e "${GREEN}✓ Test prompt created: $PROMPT_FILE${NC}"
echo ""

# Step 9: Launch Claude agent or mock
echo "Step 9: Launching agent..."
if [ "$USE_MOCK" = true ]; then
    echo "Using mock agent (no API key)..."
    TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.0" "echo '[MOCK AGENT] Starting test agent'" Enter
    sleep 0.5
    TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.0" "echo '[MOCK AGENT] Agent starting validation test'" Enter
    sleep 0.5
    TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.0" "echo 'Terminal capture working' > validation.txt" Enter
    sleep 0.5
    TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.0" "echo '[MOCK AGENT] Validation test complete'" Enter
    sleep 0.5
    TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.0" "ls -la" Enter
    sleep 1
else
    echo "Launching real Claude agent..."
    # Set API key in pane environment
    TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.0" "export ANTHROPIC_API_KEY='$ANTHROPIC_API_KEY'" Enter
    sleep 0.2

    # Launch Claude with prompt file
    CLAUDE_CMD="claude --dangerously-skip-permissions -p \"\$(cat '$PROMPT_FILE')\""
    TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.0" "$CLAUDE_CMD" Enter

    echo "Waiting for Claude to initialize (10 seconds)..."
    sleep 10
fi
echo ""

# Step 10: Verify terminal output capture
echo "Step 10: Verifying terminal output capture..."
sleep 2

if [ -f "$LOG_FILE" ]; then
    LOG_SIZE=$(wc -c < "$LOG_FILE")
    LINE_COUNT=$(wc -l < "$LOG_FILE")

    echo "Log file stats:"
    echo "  Size: $LOG_SIZE bytes"
    echo "  Lines: $LINE_COUNT"
    echo ""

    if [ "$LOG_SIZE" -gt 100 ]; then
        echo -e "${GREEN}✓ Terminal output is being captured${NC}"
        echo ""
        echo "Last 20 lines of terminal output:"
        echo "-----------------------------------"
        tail -20 "$LOG_FILE"
        echo "-----------------------------------"
    else
        echo -e "${RED}✗ Log file is too small - output may not be capturing${NC}"
    fi
else
    echo -e "${RED}✗ Log file not found: $LOG_FILE${NC}"
    exit 1
fi
echo ""

# Step 11: Check tmux pane content
echo "Step 11: Checking tmux pane content..."
PANE_OUTPUT=$(TMUX_TMPDIR=/tmp tmux capture-pane -t "$SESSION_NAME:agents.0" -p)
echo "Current pane content (last 10 lines):"
echo "-----------------------------------"
echo "$PANE_OUTPUT" | tail -10
echo "-----------------------------------"
echo ""

# Step 12: Session info
echo "Step 12: Session information..."
echo "Session: $SESSION_NAME"
TMUX_TMPDIR=/tmp tmux list-panes -t "$SESSION_NAME:agents" -F "Pane #{pane_index}: #{pane_title} (#{pane_width}x#{pane_height})"
echo ""

# Step 13: Summary
echo "=== VALIDATION SUMMARY ==="
echo ""
echo "✓ Claude CLI: Available ($CLAUDE_VERSION)"
if [ "$USE_MOCK" = true ]; then
    echo "⚠ Mode: Mock agent (no API key)"
else
    echo "✓ Mode: Real Claude agent"
fi
echo "✓ Tmux session: $SESSION_NAME"
echo "✓ Terminal logs: $TERMINALS_DIR"
echo "✓ Workspace: $WORKSPACE_DIR"
echo "✓ Log file size: $(wc -c < "$LOG_FILE") bytes"
echo ""

echo -e "${GREEN}=== TEST COMPLETE ===${NC}"
echo ""
echo "To view real-time terminal output:"
echo "  tail -f $LOG_FILE"
echo ""
echo "To attach to tmux session:"
echo "  TMUX_TMPDIR=/tmp tmux attach -t $SESSION_NAME"
echo ""
echo "To clean up test session:"
echo "  TMUX_TMPDIR=/tmp tmux kill-session -t $SESSION_NAME"
echo ""
