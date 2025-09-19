#!/bin/bash

# Comprehensive test of mock agents for MaiFarm
# Tests both standalone and tmux-based mock agents

set -e

echo "============================================"
echo "MaiFarm Mock Agent Comprehensive Test"
echo "============================================"
echo ""

SCRIPT_DIR="/Users/rohnspringfield/maifarm/scripts/python"
TIMESTAMP=$(date +%s)

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Function to check test result
check_test() {
    local test_name="$1"
    local condition="$2"
    
    if [ "$condition" -eq 0 ]; then
        echo -e "${GREEN}✅ PASS${NC}: $test_name"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC}: $test_name"
        ((TESTS_FAILED++))
    fi
}

# Test 1: Verify mock agent scripts exist
echo "Test 1: Checking mock agent scripts..."
echo "----------------------------------------"

if [ -f "$SCRIPT_DIR/mock_claude_agent.py" ]; then
    echo "✅ mock_claude_agent.py exists"
    check_test "mock_claude_agent.py exists" 0
else
    echo "❌ mock_claude_agent.py not found"
    check_test "mock_claude_agent.py exists" 1
fi

if [ -f "$SCRIPT_DIR/simple_mock_agent.py" ]; then
    echo "✅ simple_mock_agent.py exists"
    check_test "simple_mock_agent.py exists" 0
else
    echo "❌ simple_mock_agent.py not found"
    check_test "simple_mock_agent.py exists" 1
fi

echo ""

# Test 2: Direct Python execution test
echo "Test 2: Testing direct Python execution..."
echo "----------------------------------------"

export AGENT_ID=0
export AGENT_NAME="Direct Test Agent"
export AGENT_PROMPT="Test direct execution"
export SESSION_NAME="test-direct-$TIMESTAMP"
export FARM_ID="test-farm-direct"
export MAIFARM_WORKSPACE="/tmp/test-workspace-$TIMESTAMP"

mkdir -p "$MAIFARM_WORKSPACE"

# Run mock agent for 3 seconds and capture output
echo "Running mock_claude_agent.py for 3 seconds..."
OUTPUT=$(python3 "$SCRIPT_DIR/mock_claude_agent.py" 2>&1 &
    PID=$!
    sleep 3
    kill $PID 2>/dev/null || true
    wait $PID 2>/dev/null || true
)

if echo "$OUTPUT" | grep -q "Mock Claude Agent"; then
    check_test "Direct execution produces output" 0
else
    check_test "Direct execution produces output" 1
fi

# Check if workspace files were created
if [ -f "$MAIFARM_WORKSPACE/analysis-report.md" ]; then
    check_test "Workspace files created" 0
else
    check_test "Workspace files created" 1
fi

echo ""

# Test 3: Tmux session test
echo "Test 3: Testing tmux session with multiple agents..."
echo "----------------------------------------------------"

SESSION_NAME="test-mock-$TIMESTAMP"
NUM_AGENTS=3

# Kill any existing test session
tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true

# Create new session with multiple panes
echo "Creating tmux session: $SESSION_NAME with $NUM_AGENTS agents"
tmux new-session -d -s "$SESSION_NAME" -n "agents"

# Create additional panes
for ((i=1; i<$NUM_AGENTS; i++)); do
    tmux split-window -t "$SESSION_NAME:agents" -h
done
tmux select-layout -t "$SESSION_NAME:agents" even-horizontal

# Launch mock agents in each pane
for ((i=0; i<$NUM_AGENTS; i++)); do
    echo "Launching mock agent $i..."
    
    # Set environment variables
    tmux send-keys -t "$SESSION_NAME:agents.$i" "export AGENT_ID=$i" Enter
    tmux send-keys -t "$SESSION_NAME:agents.$i" "export AGENT_NAME='Mock Agent $i'" Enter
    tmux send-keys -t "$SESSION_NAME:agents.$i" "export AGENT_PROMPT='Test tmux agent $i output'" Enter
    tmux send-keys -t "$SESSION_NAME:agents.$i" "export SESSION_NAME='$SESSION_NAME'" Enter
    tmux send-keys -t "$SESSION_NAME:agents.$i" "export FARM_ID='test-farm-tmux'" Enter
    
    # Launch the simple mock agent
    tmux send-keys -t "$SESSION_NAME:agents.$i" "python3 '$SCRIPT_DIR/simple_mock_agent.py' 2>&1" Enter
done

# Wait for agents to produce output
echo "Waiting 5 seconds for agents to initialize..."
sleep 5

# Check each agent's output
ALL_AGENTS_RUNNING=true
for ((i=0; i<$NUM_AGENTS; i++)); do
    OUTPUT=$(tmux capture-pane -t "$SESSION_NAME:agents.$i" -p 2>/dev/null || echo "")
    OUTPUT_LENGTH=${#OUTPUT}
    
    if [ "$OUTPUT_LENGTH" -gt 100 ]; then
        echo "✅ Agent $i is producing output ($OUTPUT_LENGTH bytes)"
        
        # Check for expected content
        if echo "$OUTPUT" | grep -q "Mock Claude Agent"; then
            echo "  ✅ Agent $i header found"
        fi
        
        if echo "$OUTPUT" | grep -q "Agent Active"; then
            echo "  ✅ Agent $i is active"
        fi
    else
        echo "❌ Agent $i has no output or very little output"
        ALL_AGENTS_RUNNING=false
    fi
done

if [ "$ALL_AGENTS_RUNNING" = true ]; then
    check_test "All tmux agents running" 0
else
    check_test "All tmux agents running" 1
fi

echo ""

# Test 4: Terminal output streaming test
echo "Test 4: Testing terminal output capture..."
echo "------------------------------------------"

# Set up pipe-pane for terminal output capture
TERMINAL_DIR="/tmp/terminals-$TIMESTAMP"
mkdir -p "$TERMINAL_DIR"

for ((i=0; i<$NUM_AGENTS; i++)); do
    OUTPUT_FILE="$TERMINAL_DIR/agent-$i.log"
    tmux pipe-pane -t "$SESSION_NAME:agents.$i" "cat >> '$OUTPUT_FILE'"
done

echo "Waiting 3 seconds for terminal output capture..."
sleep 3

# Check if output files are being written
FILES_WRITTEN=true
for ((i=0; i<$NUM_AGENTS; i++)); do
    OUTPUT_FILE="$TERMINAL_DIR/agent-$i.log"
    if [ -f "$OUTPUT_FILE" ] && [ -s "$OUTPUT_FILE" ]; then
        FILE_SIZE=$(wc -c < "$OUTPUT_FILE")
        echo "✅ Agent $i terminal log: $FILE_SIZE bytes"
    else
        echo "❌ Agent $i terminal log not found or empty"
        FILES_WRITTEN=false
    fi
done

if [ "$FILES_WRITTEN" = true ]; then
    check_test "Terminal output capture working" 0
else
    check_test "Terminal output capture working" 1
fi

echo ""

# Test 5: Agent responsiveness test
echo "Test 5: Testing agent responsiveness..."
echo "---------------------------------------"

# Send a command to one of the agents
tmux send-keys -t "$SESSION_NAME:agents.0" C-c Enter
sleep 1
tmux send-keys -t "$SESSION_NAME:agents.0" "echo 'Agent restarted'" Enter
tmux send-keys -t "$SESSION_NAME:agents.0" "python3 '$SCRIPT_DIR/simple_mock_agent.py' 2>&1" Enter

sleep 3

# Check if agent restarted
OUTPUT=$(tmux capture-pane -t "$SESSION_NAME:agents.0" -p | tail -20)
if echo "$OUTPUT" | grep -q "Agent restarted"; then
    check_test "Agent restart capability" 0
else
    check_test "Agent restart capability" 1
fi

echo ""

# Cleanup
echo "Cleaning up test resources..."
echo "-----------------------------"

# Kill tmux session
tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
echo "✅ Tmux session cleaned up"

# Remove test directories
rm -rf "$MAIFARM_WORKSPACE" "$TERMINAL_DIR" 2>/dev/null || true
echo "✅ Test directories cleaned up"

echo ""

# Summary
echo "============================================"
echo "Test Summary"
echo "============================================"
echo -e "${GREEN}Tests Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Tests Failed: $TESTS_FAILED${NC}"

if [ "$TESTS_FAILED" -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 All tests passed! Mock agents are working correctly.${NC}"
    exit 0
else
    echo ""
    echo -e "${YELLOW}⚠️  Some tests failed. Check the output above for details.${NC}"
    exit 1
fi