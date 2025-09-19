#!/bin/bash

# GoWild Farm API Validation Test
# This script tests GoWild farm creation and validates all components work correctly

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
NC='\033[0m' # No Color

API_URL="http://localhost:4567/api"

echo -e "${BLUE}=== GoWild Farm API Validation Test ===${NC}\n"

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0

# Function to test a condition
test_condition() {
    local description="$1"
    local condition="$2"
    
    if eval "$condition"; then
        echo -e "${GREEN}✓${NC} $description"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} $description"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Step 1: Check server health
echo -e "${YELLOW}Step 1: Checking server health...${NC}"
HEALTH_RESPONSE=$(curl -s "$API_URL/health")
HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
test_condition "Server is healthy" "[ '$HEALTH_STATUS' = 'healthy' ]"
echo ""

# Step 2: Create a GoWild farm
echo -e "${YELLOW}Step 2: Creating GoWild farm...${NC}"
CREATE_RESPONSE=$(curl -s -X POST "$API_URL/farms" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GoWild API Test Farm",
    "description": "Test GoWild farm created via API",
    "type": "collaborative",
    "config": {
      "maxAgents": 3,
      "provider": "claude",
      "isGoWildMode": true,
      "timeout": 300,
      "goWildMode": {
        "enabled": true,
        "creativityLevel": 0.7,
        "safetyLevel": 0.8,
        "maxDuration": 5,
        "explorationDepth": 5,
        "allowBacktracking": true
      },
      "prompt": "Explore creative ways to optimize code and improve performance"
    }
  }')

# Extract farm ID from response
FARM_ID=$(echo "$CREATE_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
FARM_STATUS=$(echo "$CREATE_RESPONSE" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)

test_condition "Farm created successfully" "[ -n '$FARM_ID' ]"
if [ -n "$FARM_ID" ]; then
    echo "  Farm ID: $FARM_ID"
    echo "  Initial status: $FARM_STATUS"
fi
echo ""

# Step 3: Wait for farm to launch (10 seconds)
echo -e "${YELLOW}Step 3: Waiting for farm to launch...${NC}"
sleep 10

# Step 4: Check farm status
echo -e "${YELLOW}Step 4: Checking farm status...${NC}"
STATUS_RESPONSE=$(curl -s "$API_URL/farms/$FARM_ID")
CURRENT_STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
AGENT_COUNT=$(echo "$STATUS_RESPONSE" | grep -o '"agents":\[[^]]*\]' | grep -o '{' | wc -l | tr -d ' ')

test_condition "Farm is active" "[ '$CURRENT_STATUS' = 'active' ] || [ '$CURRENT_STATUS' = 'running' ] || [ '$CURRENT_STATUS' = 'launching' ]"
test_condition "Farm has agents" "[ $AGENT_COUNT -gt 0 ]"

if [ "$CURRENT_STATUS" = "active" ] || [ "$CURRENT_STATUS" = "running" ]; then
    echo "  Current status: $CURRENT_STATUS"
    echo "  Agent count: $AGENT_COUNT"
fi
echo ""

# Step 5: Check tmux session
echo -e "${YELLOW}Step 5: Verifying tmux session...${NC}"
SESSION_NAME="farm-$FARM_ID"
tmux has-session -t "$SESSION_NAME" 2>/dev/null
TMUX_EXISTS=$?

test_condition "Tmux session exists" "[ $TMUX_EXISTS -eq 0 ]"

if [ $TMUX_EXISTS -eq 0 ]; then
    PANE_COUNT=$(tmux list-panes -t "$SESSION_NAME:0" 2>/dev/null | wc -l | tr -d ' ')
    echo "  Session: $SESSION_NAME"
    echo "  Pane count: $PANE_COUNT"
    test_condition "Tmux has multiple panes" "[ $PANE_COUNT -gt 1 ]"
fi
echo ""

# Step 6: Check terminal logs
echo -e "${YELLOW}Step 6: Checking terminal streaming...${NC}"
TERMINAL_DIR="/Users/rohnspringfield/maifarm/data/storage/maibarn/terminals/$SESSION_NAME"

if [ -d "$TERMINAL_DIR" ]; then
    LOG_COUNT=$(ls -1 "$TERMINAL_DIR"/*.log 2>/dev/null | wc -l | tr -d ' ')
    test_condition "Terminal log directory exists" "[ -d '$TERMINAL_DIR' ]"
    test_condition "Terminal logs are being created" "[ $LOG_COUNT -gt 0 ]"
    
    if [ $LOG_COUNT -gt 0 ]; then
        echo "  Log files: $LOG_COUNT"
        for log in "$TERMINAL_DIR"/*.log; do
            if [ -f "$log" ]; then
                LINE_COUNT=$(wc -l < "$log" | tr -d ' ')
                echo "    $(basename "$log"): $LINE_COUNT lines"
            fi
        done
    fi
else
    test_condition "Terminal log directory exists" "false"
fi
echo ""

# Step 7: Monitor for 10 seconds
echo -e "${YELLOW}Step 7: Monitoring farm stability for 10 seconds...${NC}"
sleep 10

STATUS_RESPONSE=$(curl -s "$API_URL/farms/$FARM_ID")
FINAL_STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)

test_condition "Farm is still active after 10s" "[ '$FINAL_STATUS' = 'active' ] || [ '$FINAL_STATUS' = 'running' ]"
echo "  Final status: $FINAL_STATUS"
echo ""

# Step 8: Test WebSocket connection
echo -e "${YELLOW}Step 8: Testing WebSocket endpoint...${NC}"
WS_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/../socket.io/?transport=polling")
test_condition "WebSocket endpoint accessible" "[ '$WS_CHECK' = '200' ]"
echo ""

# Step 9: Clean up - Stop the farm
echo -e "${YELLOW}Step 9: Stopping GoWild farm...${NC}"
if [ -n "$FARM_ID" ]; then
    STOP_RESPONSE=$(curl -s -X POST "$API_URL/farms/$FARM_ID/stop")
    STOP_SUCCESS=$(echo "$STOP_RESPONSE" | grep -o '"success":true')
    test_condition "Farm stopped successfully" "[ -n '$STOP_SUCCESS' ]"
    
    # Kill tmux session if it still exists
    tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
fi
echo ""

# Summary
echo -e "${BLUE}=== Validation Summary ===${NC}"
TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))
SUCCESS_RATE=$((TESTS_PASSED * 100 / TOTAL_TESTS))

echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo -e "Success Rate: $SUCCESS_RATE%"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All validation tests passed! GoWild farms are working correctly.${NC}"
    exit 0
elif [ $SUCCESS_RATE -ge 70 ]; then
    echo -e "${YELLOW}⚠️ Most tests passed but some issues were found. Review the failures above.${NC}"
    exit 1
else
    echo -e "${RED}❌ Significant issues found. GoWild farms need debugging.${NC}"
    exit 2
fi