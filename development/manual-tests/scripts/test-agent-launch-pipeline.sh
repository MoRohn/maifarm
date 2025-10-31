#!/bin/bash

# Test script to verify agent launch pipeline
# This tests that agents launch with visible output when Claude CLI is unavailable

echo "============================================"
echo "MaiFarm Agent Launch Pipeline Test"
echo "============================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
TEST_FARM_NAME="test-agent-pipeline-$(date +%s)"
API_URL="http://localhost:4567"

echo "🔍 Checking system status..."
echo ""

# Check if server is running
if ! curl -s "$API_URL/api/health" > /dev/null 2>&1; then
    echo -e "${RED}❌ Server is not running. Start with: npm run start${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Server is running${NC}"

# Check Claude CLI availability
if which claude > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Claude CLI is installed${NC}"
    CLAUDE_AVAILABLE=true
else
    echo -e "${YELLOW}⚠️  Claude CLI not found - will use mock agents${NC}"
    CLAUDE_AVAILABLE=false
fi

# Check API keys
if [ -n "$ANTHROPIC_API_KEY" ] && [ ${#ANTHROPIC_API_KEY} -gt 30 ] && [[ ! "$ANTHROPIC_API_KEY" =~ "test-" ]]; then
    echo -e "${GREEN}✅ Valid ANTHROPIC_API_KEY found${NC}"
    API_KEY_AVAILABLE=true
else
    echo -e "${YELLOW}⚠️  No valid ANTHROPIC_API_KEY - will use mock agents${NC}"
    API_KEY_AVAILABLE=false
fi

echo ""
echo "============================================"
echo "Testing Quick Task Launch"
echo "============================================"
echo ""

# Launch a Quick Task farm
echo "📝 Creating Quick Task with prompt: 'Test agent pipeline'"
RESPONSE=$(curl -s -X POST "$API_URL/api/farms/quick-task" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Test agent pipeline - verify output is visible",
    "agentCount": 2
  }')

# Extract farm ID
FARM_ID=$(echo "$RESPONSE" | grep -o '"farmId":"[^"]*' | cut -d'"' -f4)

if [ -z "$FARM_ID" ]; then
    echo -e "${RED}❌ Failed to create farm${NC}"
    echo "Response: $RESPONSE"
    exit 1
fi

echo -e "${GREEN}✅ Farm created: $FARM_ID${NC}"
echo ""

# Wait for agents to launch
echo "⏳ Waiting for agents to launch (5 seconds)..."
sleep 5

# Check tmux session
SESSION_NAME="quick_${FARM_ID:0:8}"
echo ""
echo "🔍 Checking tmux session: $SESSION_NAME"

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo -e "${GREEN}✅ Tmux session exists${NC}"
    
    # List panes
    PANE_COUNT=$(tmux list-panes -t "$SESSION_NAME:0" 2>/dev/null | wc -l)
    echo "   Found $PANE_COUNT panes"
    
    # Check each pane for output
    echo ""
    echo "📊 Checking agent output:"
    for i in 0 1; do
        echo ""
        echo "   Agent $i:"
        OUTPUT=$(tmux capture-pane -t "$SESSION_NAME:0.$i" -p 2>/dev/null | head -20)
        
        if [ -n "$OUTPUT" ]; then
            # Check for agent activity indicators
            if echo "$OUTPUT" | grep -qE "(Mock Claude Agent|Starting|Agent|Ready|Thinking|python|Session:|Workspace:)"; then
                echo -e "   ${GREEN}✅ Agent $i is active${NC}"
                echo "   Preview (first 3 lines):"
                echo "$OUTPUT" | head -3 | sed 's/^/      /'
            else
                echo -e "   ${YELLOW}⚠️  Agent $i has output but no clear activity${NC}"
                echo "   Output length: $(echo "$OUTPUT" | wc -c) bytes"
            fi
        else
            echo -e "   ${RED}❌ Agent $i has no output${NC}"
        fi
    done
else
    echo -e "${RED}❌ Tmux session not found${NC}"
fi

# Check terminal streaming
echo ""
echo "🔍 Checking terminal streaming..."
TERMINAL_LOGS="/Users/rohnspringfield/maifarm/maibarn/terminals/$SESSION_NAME"
if [ -d "$TERMINAL_LOGS" ]; then
    echo -e "${GREEN}✅ Terminal log directory exists${NC}"
    LOG_COUNT=$(ls -1 "$TERMINAL_LOGS"/*.log 2>/dev/null | wc -l)
    if [ "$LOG_COUNT" -gt 0 ]; then
        echo -e "   ${GREEN}✅ Found $LOG_COUNT log files${NC}"
        for log in "$TERMINAL_LOGS"/*.log; do
            SIZE=$(wc -c < "$log")
            echo "   $(basename "$log"): $SIZE bytes"
        done
    else
        echo -e "   ${YELLOW}⚠️  No log files found${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Terminal log directory not found${NC}"
fi

# Check farm status via API
echo ""
echo "🔍 Checking farm status via API..."
FARM_STATUS=$(curl -s "$API_URL/api/farms/$FARM_ID" | grep -o '"status":"[^"]*' | cut -d'"' -f4)
echo "   Farm status: $FARM_STATUS"

if [ "$FARM_STATUS" = "active" ] || [ "$FARM_STATUS" = "running" ]; then
    echo -e "   ${GREEN}✅ Farm is active${NC}"
else
    echo -e "   ${YELLOW}⚠️  Farm status: $FARM_STATUS${NC}"
fi

# Summary
echo ""
echo "============================================"
echo "Test Summary"
echo "============================================"

if [ "$CLAUDE_AVAILABLE" = "false" ] || [ "$API_KEY_AVAILABLE" = "false" ]; then
    echo -e "${YELLOW}Running in MOCK MODE (no Claude CLI or API key)${NC}"
else
    echo -e "${GREEN}Running with REAL Claude agents${NC}"
fi

echo ""
echo "Farm ID: $FARM_ID"
echo "Session: $SESSION_NAME"
echo ""

# Cleanup option
echo "To view agent terminals:"
echo "  tmux attach -t $SESSION_NAME"
echo ""
echo "To clean up test farm:"
echo "  tmux kill-session -t $SESSION_NAME"
echo ""

echo "✅ Test complete!"