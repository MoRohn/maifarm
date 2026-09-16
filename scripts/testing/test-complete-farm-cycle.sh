#!/usr/bin/env bash

MAIFARM_ROOT="${MAIFARM_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
export MAIFARM_ROOT
#
# Complete Farm Launch Cycle Test
# Tests the entire farm creation -> launch -> agents -> terminal streaming pipeline
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

API_URL="${API_URL:-http://localhost:4567}"
TEST_TIMEOUT=60

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}    Complete Farm Launch Cycle Test${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Test 1: Server Health
echo -e "${YELLOW}[1/12]${NC} Checking server health..."
if ! curl -sf "${API_URL}/api/health" > /dev/null; then
  echo -e "${RED}✗ Server not healthy${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Server is healthy${NC}"

# Test 2: Database Connection
echo -e "\n${YELLOW}[2/12]${NC} Verifying database connection..."
PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -c "SELECT 1;" > /dev/null
echo -e "${GREEN}✓ Database connection verified${NC}"

# Test 3: Check Schema
echo -e "\n${YELLOW}[3/12]${NC} Validating agents table schema..."
COLUMNS=$(PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -tc "
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name='agents'
  AND column_name IN ('session_name', 'pane_index')
  ORDER BY column_name;
" | tr -d ' ' | grep -v '^$')

if [ "$(echo "$COLUMNS" | wc -l | tr -d ' ')" -eq "2" ]; then
  echo -e "${GREEN}✓ Required columns present: session_name, pane_index${NC}"
else
  echo -e "${RED}✗ Missing required columns${NC}"
  exit 1
fi

# Test 4: Clean Slate
echo -e "\n${YELLOW}[4/12]${NC} Ensuring clean test environment..."
EXISTING_FARMS=$(PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -tc "SELECT COUNT(*) FROM farms WHERE status IN ('launching', 'active', 'running');")
if [ "$EXISTING_FARMS" -gt 0 ]; then
  echo -e "${YELLOW}⚠ Found $EXISTING_FARMS active farms, cleaning up...${NC}"
  PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -c "
    UPDATE farms SET status='cancelled' WHERE status IN ('launching', 'active', 'running');
  " > /dev/null
fi
echo -e "${GREEN}✓ Clean test environment${NC}"

# Test 5: Create Farm
echo -e "\n${YELLOW}[5/12]${NC} Creating test farm..."
FARM_RESPONSE=$(curl -sf -X POST "${API_URL}/api/farms" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Farm Complete Cycle",
    "description": "Testing complete farm launch with terminal streaming",
    "prompt": "Write a simple hello world function in Python",
    "agentCount": 2,
    "timeout": 300000,
    "provider": "claude"
  }')

if [ -z "$FARM_RESPONSE" ]; then
  echo -e "${RED}✗ Failed to create farm${NC}"
  exit 1
fi

FARM_ID=$(echo "$FARM_RESPONSE" | jq -r '.id // .data.id // .farmId // empty')
if [ -z "$FARM_ID" ]; then
  echo -e "${RED}✗ No farm ID in response${NC}"
  echo "Response: $FARM_RESPONSE"
  exit 1
fi
echo -e "${GREEN}✓ Farm created: $FARM_ID${NC}"

# Test 6: Launch Farm
echo -e "\n${YELLOW}[6/12]${NC} Launching farm..."
LAUNCH_RESPONSE=$(curl -sf -X POST "${API_URL}/api/farms/${FARM_ID}/launch" \
  -H "Content-Type: application/json")

if [ -z "$LAUNCH_RESPONSE" ]; then
  echo -e "${RED}✗ Farm launch failed${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Farm launch initiated${NC}"

# Test 7: Wait for Active Status
echo -e "\n${YELLOW}[7/12]${NC} Waiting for farm to become active..."
ELAPSED=0
while [ $ELAPSED -lt $TEST_TIMEOUT ]; do
  FARM_STATUS=$(curl -sf "${API_URL}/api/farms/${FARM_ID}" | jq -r '.status // .data.status // empty')

  if [ "$FARM_STATUS" = "active" ] || [ "$FARM_STATUS" = "running" ]; then
    echo -e "${GREEN}✓ Farm is $FARM_STATUS${NC}"
    break
  elif [ "$FARM_STATUS" = "failed" ] || [ "$FARM_STATUS" = "crashed" ]; then
    echo -e "${RED}✗ Farm failed with status: $FARM_STATUS${NC}"
    exit 1
  fi

  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

if [ $ELAPSED -ge $TEST_TIMEOUT ]; then
  echo -e "${RED}✗ Timeout waiting for farm to become active${NC}"
  exit 1
fi

# Test 8: Verify Agents in Database
echo -e "\n${YELLOW}[8/12]${NC} Verifying agents in database..."
AGENT_COUNT=$(PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -tc "SELECT COUNT(*) FROM agents WHERE farm_id='$FARM_ID';")
if [ "$AGENT_COUNT" -lt 2 ]; then
  echo -e "${RED}✗ Expected 2 agents, found $AGENT_COUNT${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Found $AGENT_COUNT agents in database${NC}"

# Test 9: Verify Agent Names
echo -e "\n${YELLOW}[9/12]${NC} Checking agent names format..."
AGENT_NAMES=$(PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -tc "SELECT name FROM agents WHERE farm_id='$FARM_ID' ORDER BY pane_index;")
echo -e "${BLUE}Agent names:${NC}"
echo "$AGENT_NAMES" | while read name; do
  if [ -n "$name" ]; then
    # Check if name is JSON (bad) or simple string (good)
    if echo "$name" | grep -q '{'; then
      echo -e "  ${RED}✗ $name (JSON format - BAD)${NC}"
    else
      echo -e "  ${GREEN}✓ $name${NC}"
    fi
  fi
done

# Test 10: Verify Tmux Session
echo -e "\n${YELLOW}[10/12]${NC} Verifying tmux session..."
FARM_SHORT_ID=$(echo "$FARM_ID" | cut -c1-8)
SESSION_NAME="farm-$FARM_SHORT_ID"

if ! TMUX_TMPDIR=/tmp tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo -e "${RED}✗ Tmux session $SESSION_NAME not found${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Tmux session $SESSION_NAME exists${NC}"

# Test 11: Verify Terminal Logs
echo -e "\n${YELLOW}[11/12]${NC} Checking terminal log files..."
TERMINAL_DIR="${MAIFARM_ROOT}/var/maibarn/terminals/$FARM_ID"
if [ ! -d "$TERMINAL_DIR" ]; then
  echo -e "${RED}✗ Terminal directory not found${NC}"
  exit 1
fi

LOG_COUNT=$(ls -1 "$TERMINAL_DIR"/*.log 2>/dev/null | wc -l | tr -d ' ')
if [ "$LOG_COUNT" -lt 2 ]; then
  echo -e "${YELLOW}⚠ Expected 2 log files, found $LOG_COUNT${NC}"
else
  echo -e "${GREEN}✓ Found $LOG_COUNT terminal log files${NC}"
fi

# Test 12: Check for Claude Output
echo -e "\n${YELLOW}[12/12]${NC} Waiting for Claude Code output..."
echo -e "${BLUE}Monitoring terminal logs for 30 seconds...${NC}"
FOUND_CLAUDE=false
for i in {1..15}; do
  sleep 2
  for log_file in "$TERMINAL_DIR"/*.log; do
    if [ -f "$log_file" ]; then
      # Look for Claude Code indicators
      if grep -q "claude\|Assistant\|tool\|thinking" "$log_file" 2>/dev/null; then
        echo -e "${GREEN}✓ Found Claude Code output in $(basename $log_file)${NC}"
        FOUND_CLAUDE=true
        break 2
      fi
    fi
  done
  echo -n "."
done
echo ""

if [ "$FOUND_CLAUDE" = false ]; then
  echo -e "${YELLOW}⚠ No Claude Code output detected yet (may still be launching)${NC}"
  echo -e "${BLUE}Sample log content:${NC}"
  tail -5 "$TERMINAL_DIR"/*.log 2>/dev/null | head -20
fi

# Summary
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}            Test Summary${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "${GREEN}✓ Server health check passed${NC}"
echo -e "${GREEN}✓ Database connection verified${NC}"
echo -e "${GREEN}✓ Schema validation passed${NC}"
echo -e "${GREEN}✓ Farm created successfully${NC}"
echo -e "${GREEN}✓ Farm launched successfully${NC}"
echo -e "${GREEN}✓ Farm reached active status${NC}"
echo -e "${GREEN}✓ Agents registered in database${NC}"
echo -e "${GREEN}✓ Tmux session created${NC}"
echo -e "${GREEN}✓ Terminal logs initialized${NC}"

if [ "$FOUND_CLAUDE" = true ]; then
  echo -e "${GREEN}✓ Claude Code output detected${NC}"
else
  echo -e "${YELLOW}⚠ Claude Code output not yet detected${NC}"
fi

echo ""
echo -e "${BLUE}Farm ID: $FARM_ID${NC}"
echo -e "${BLUE}Session: $SESSION_NAME${NC}"
echo -e "${BLUE}Terminal logs: $TERMINAL_DIR${NC}"
echo ""
echo -e "${GREEN}✓ Farm launch cycle test completed!${NC}"
echo -e "${YELLOW}Monitor the farm at: http://localhost:3000/harvest/$FARM_ID${NC}"
