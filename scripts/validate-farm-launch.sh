#!/usr/bin/env bash
#
# Farm Launch Validation Script
# Automated end-to-end test for farm launching with agent name verification
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:4567}"
AGENT_COUNT="${AGENT_COUNT:-3}"
TIMEOUT="${TIMEOUT:-60}" # seconds to wait for farm to launch

# Expected agent names (must match apps/api/src/utils/farmAgentNames.ts)
EXPECTED_NAMES=(
  "Bessie the Cow"      # Agent 0
  "Cluck the Chicken"   # Agent 1
  "Wilbur the Pig"      # Agent 2
  "Charlotte the Spider" # Agent 3
  "Babe the Sheep"      # Agent 4
)

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}      Farm Launch Validation Test${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Step 1: Check if server is running
echo -e "${YELLOW}[1/8]${NC} Checking if server is running..."
if ! curl -s -f "$API_URL/api/health" > /dev/null 2>&1; then
  echo -e "${RED}✗ Server not running at $API_URL${NC}"
  echo -e "  Please start the server with: npm run start"
  exit 1
fi
echo -e "${GREEN}✓ Server is running${NC}"

# Step 2: Create a test farm
echo -e "\n${YELLOW}[2/8]${NC} Creating test farm with ${AGENT_COUNT} agents..."
FARM_RESPONSE=$(curl -s -X POST "$API_URL/api/farms" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d "{
    \"name\": \"Test Farm $(date +%s)\",
    \"description\": \"Automated validation test\",
    \"mode\": \"harvest\",
    \"agentCount\": ${AGENT_COUNT},
    \"prompt\": \"Run a simple test task\",
    \"timeout\": 600
  }")

FARM_ID=$(echo "$FARM_RESPONSE" | jq -r '.data.id // .id // empty')

if [ -z "$FARM_ID" ]; then
  echo -e "${RED}✗ Failed to create farm${NC}"
  echo "Response: $FARM_RESPONSE"
  exit 1
fi
echo -e "${GREEN}✓ Farm created: $FARM_ID${NC}"

# Step 3: Launch the farm
echo -e "\n${YELLOW}[3/8]${NC} Launching farm..."
LAUNCH_RESPONSE=$(curl -s -X POST "$API_URL/api/farms/$FARM_ID/launch" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token")

echo "$LAUNCH_RESPONSE" | jq '.' > /dev/null 2>&1 || {
  echo -e "${RED}✗ Invalid launch response${NC}"
  echo "Response: $LAUNCH_RESPONSE"
  exit 1
}
echo -e "${GREEN}✓ Farm launch initiated${NC}"

# Step 4: Wait for farm to become active
echo -e "\n${YELLOW}[4/8]${NC} Waiting for farm to become active (timeout: ${TIMEOUT}s)..."
start_time=$(date +%s)
farm_active=false

while [ $(($(date +%s) - start_time)) -lt $TIMEOUT ]; do
  FARM_STATUS=$(curl -s "$API_URL/api/farms/$FARM_ID" \
    -H "Authorization: Bearer test-token")

  STATUS=$(echo "$FARM_STATUS" | jq -r '.data.status // .status // empty')

  if [ "$STATUS" = "active" ] || [ "$STATUS" = "running" ]; then
    farm_active=true
    echo -e "${GREEN}✓ Farm is active${NC}"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo -e "${RED}✗ Farm failed to launch${NC}"
    echo "$FARM_STATUS" | jq '.'
    exit 1
  fi

  echo -n "."
  sleep 2
done

if [ "$farm_active" = false ]; then
  echo -e "\n${RED}✗ Farm did not become active within ${TIMEOUT} seconds${NC}"
  exit 1
fi

# Step 5: Verify agent count
echo -e "\n${YELLOW}[5/8]${NC} Verifying agent count..."
AGENTS=$(curl -s "$API_URL/api/farms/$FARM_ID" \
  -H "Authorization: Bearer test-token" | jq -r '.data.agents // .agents // []')

ACTUAL_AGENT_COUNT=$(echo "$AGENTS" | jq 'length')

if [ "$ACTUAL_AGENT_COUNT" -ne "$AGENT_COUNT" ]; then
  echo -e "${RED}✗ Expected ${AGENT_COUNT} agents, found ${ACTUAL_AGENT_COUNT}${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Correct agent count: ${ACTUAL_AGENT_COUNT}${NC}"

# Step 6: Verify agent names are unique
echo -e "\n${YELLOW}[6/8]${NC} Verifying agent names are unique..."
AGENT_NAMES=$(echo "$AGENTS" | jq -r '.[].name')
UNIQUE_NAMES=$(echo "$AGENT_NAMES" | sort -u | wc -l | tr -d ' ')

if [ "$UNIQUE_NAMES" -ne "$ACTUAL_AGENT_COUNT" ]; then
  echo -e "${RED}✗ Agent names are not unique${NC}"
  echo "Agent names:"
  echo "$AGENT_NAMES"
  exit 1
fi
echo -e "${GREEN}✓ All agent names are unique${NC}"

# Step 7: Verify agent names match expected values
echo -e "\n${YELLOW}[7/8]${NC} Verifying agent names match expected values..."
names_match=true

for i in $(seq 0 $((AGENT_COUNT - 1))); do
  ACTUAL_NAME=$(echo "$AGENTS" | jq -r ".[$i].name")
  EXPECTED_NAME="${EXPECTED_NAMES[$i]}"

  if [ "$ACTUAL_NAME" != "$EXPECTED_NAME" ]; then
    echo -e "${RED}✗ Agent $i: Expected \"$EXPECTED_NAME\", got \"$ACTUAL_NAME\"${NC}"
    names_match=false
  else
    echo -e "${GREEN}✓ Agent $i: $ACTUAL_NAME${NC}"
  fi
done

if [ "$names_match" = false ]; then
  exit 1
fi

# Step 8: Check terminal files exist
echo -e "\n${YELLOW}[8/8]${NC} Checking terminal log files..."
TERMINAL_DIR="$PROJECT_ROOT/var/maibarn/terminals/$FARM_ID"

sleep 5  # Give tmux pipe-pane time to create files

if [ ! -d "$TERMINAL_DIR" ]; then
  echo -e "${YELLOW}⚠ Terminal directory not found: $TERMINAL_DIR${NC}"
  echo -e "  (This may be normal if terminals haven't started yet)"
else
  LOG_COUNT=$(find "$TERMINAL_DIR" -name "*.log" | wc -l | tr -d ' ')
  echo -e "${GREEN}✓ Found $LOG_COUNT terminal log files${NC}"

  if [ "$LOG_COUNT" -gt 0 ]; then
    # Check if files have content (may take a few seconds)
    sleep 3
    for log in "$TERMINAL_DIR"/*.log; do
      if [ -f "$log" ]; then
        size=$(wc -c < "$log" | tr -d ' ')
        basename=$(basename "$log")
        if [ "$size" -gt 0 ]; then
          echo -e "  ${GREEN}✓ $basename: ${size} bytes${NC}"
        else
          echo -e "  ${YELLOW}⚠ $basename: 0 bytes (output may appear soon)${NC}"
        fi
      fi
    done
  fi
fi

# Summary
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}        All Validation Tests Passed! ✓${NC}"
echo -e "${BLUE}================================================${NC}"
echo -e "\nFarm ID: ${FARM_ID}"
echo -e "Session: farm-${FARM_ID:0:8}"
echo -e "\nNext steps:"
echo -e "  • Monitor farm: curl $API_URL/api/farms/$FARM_ID"
echo -e "  • View health: curl $API_URL/api/farms/$FARM_ID/health"
echo -e "  • Check tmux: env TMUX_TMPDIR=/tmp tmux attach -t farm-${FARM_ID:0:8}"
echo -e "  • View logs: tail -f $TERMINAL_DIR/agent-0.log"
echo ""
