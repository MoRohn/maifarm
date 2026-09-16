#!/usr/bin/env bash
#
# Terminal Streaming Debug Script
# Comprehensive diagnostic tool for investigating terminal streaming issues
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Check if farm ID was provided
if [ -z "$1" ]; then
  echo -e "${RED}Usage: $0 <farm-id>${NC}"
  echo ""
  echo "Examples:"
  echo "  $0 cc550732-4f9b-4839-a2c2-405c4c59c284"
  echo "  $0 cc550732  # Short ID also works"
  exit 1
fi

FARM_ID="$1"
SHORT_ID="${FARM_ID:0:8}"
SESSION_NAME="farm-$SHORT_ID"
API_URL="${API_URL:-http://localhost:4567}"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Terminal Streaming Diagnostic Report${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "Farm ID:  ${CYAN}$FARM_ID${NC}"
echo -e "Short ID: ${CYAN}$SHORT_ID${NC}"
echo -e "Session:  ${CYAN}$SESSION_NAME${NC}"
echo ""

# Check 1: Farm exists in database
echo -e "${YELLOW}[1/10]${NC} Checking farm in database..."
FARM_DATA=$(curl -s "$API_URL/api/farms/$FARM_ID" -H "Authorization: Bearer test-token" 2>/dev/null || echo "{}")

if echo "$FARM_DATA" | jq -e '.data.id' > /dev/null 2>&1 || echo "$FARM_DATA" | jq -e '.id' > /dev/null 2>&1; then
  STATUS=$(echo "$FARM_DATA" | jq -r '.data.status // .status // "unknown"')
  AGENT_COUNT=$(echo "$FARM_DATA" | jq -r '.data.agents | length // 0')
  echo -e "${GREEN}✓ Farm found in database${NC}"
  echo -e "  Status: ${CYAN}$STATUS${NC}"
  echo -e "  Agents: ${CYAN}$AGENT_COUNT${NC}"
else
  echo -e "${RED}✗ Farm not found in database${NC}"
  echo "$FARM_DATA" | jq '.' 2>/dev/null || echo "$FARM_DATA"
  exit 1
fi

# Check 2: Agent names
echo -e "\n${YELLOW}[2/10]${NC} Checking agent names..."
AGENTS=$(echo "$FARM_DATA" | jq -r '.data.agents // .agents // []')
AGENT_NAMES=$(echo "$AGENTS" | jq -r '.[].name')

if [ -z "$AGENT_NAMES" ]; then
  echo -e "${RED}✗ No agents found${NC}"
else
  echo -e "${GREEN}✓ Agent names:${NC}"
  echo "$AGENT_NAMES" | nl -w2 -s'. '

  # Check for duplicates
  UNIQUE_COUNT=$(echo "$AGENT_NAMES" | sort -u | wc -l | tr -d ' ')
  TOTAL_COUNT=$(echo "$AGENT_NAMES" | wc -l | tr -d ' ')

  if [ "$UNIQUE_COUNT" -ne "$TOTAL_COUNT" ]; then
    echo -e "${RED}✗ WARNING: Duplicate agent names detected!${NC}"
  else
    echo -e "${GREEN}✓ All names are unique${NC}"
  fi
fi

# Check 3: Tmux session exists
echo -e "\n${YELLOW}[3/10]${NC} Checking tmux session..."
if env TMUX_TMPDIR=/tmp tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo -e "${GREEN}✓ Tmux session exists: $SESSION_NAME${NC}"

  # Check panes
  PANE_COUNT=$(env TMUX_TMPDIR=/tmp tmux list-panes -t "$SESSION_NAME" 2>/dev/null | wc -l | tr -d ' ')
  echo -e "  Panes: ${CYAN}$PANE_COUNT${NC}"

  if [ "$PANE_COUNT" -ne "$AGENT_COUNT" ]; then
    echo -e "${YELLOW}⚠ Pane count ($PANE_COUNT) doesn't match agent count ($AGENT_COUNT)${NC}"
  fi
else
  echo -e "${RED}✗ Tmux session not found: $SESSION_NAME${NC}"
  echo -e "  Check if farm is still running or if TMUX_TMPDIR is set correctly"
fi

# Check 4: Terminal directory
echo -e "\n${YELLOW}[4/10]${NC} Checking terminal directory..."
TERMINAL_DIR="$PROJECT_ROOT/var/maibarn/terminals/$FARM_ID"

if [ -d "$TERMINAL_DIR" ]; then
  echo -e "${GREEN}✓ Terminal directory exists${NC}"
  echo -e "  Path: ${CYAN}$TERMINAL_DIR${NC}"
else
  echo -e "${RED}✗ Terminal directory not found${NC}"
  echo -e "  Expected: $TERMINAL_DIR"

  # Check if using short ID instead
  SHORT_TERMINAL_DIR="$PROJECT_ROOT/var/maibarn/terminals/$SHORT_ID"
  if [ -d "$SHORT_TERMINAL_DIR" ]; then
    echo -e "${YELLOW}⚠ Found directory using SHORT_ID instead: $SHORT_TERMINAL_DIR${NC}"
    TERMINAL_DIR="$SHORT_TERMINAL_DIR"
  fi
fi

# Check 5: Terminal log files
echo -e "\n${YELLOW}[5/10]${NC} Checking terminal log files..."
if [ -d "$TERMINAL_DIR" ]; then
  LOG_FILES=$(find "$TERMINAL_DIR" -name "*.log" 2>/dev/null)

  if [ -z "$LOG_FILES" ]; then
    echo -e "${RED}✗ No log files found${NC}"
  else
    LOG_COUNT=$(echo "$LOG_FILES" | wc -l | tr -d ' ')
    echo -e "${GREEN}✓ Found $LOG_COUNT log files${NC}"

    for log in $LOG_FILES; do
      basename=$(basename "$log")
      size=$(wc -c < "$log" | tr -d ' ')
      lines=$(wc -l < "$log" | tr -d ' ')

      if [ "$size" -gt 0 ]; then
        echo -e "  ${GREEN}✓ $basename: $size bytes, $lines lines${NC}"

        # Show last 3 lines as preview
        echo -e "${CYAN}    Last 3 lines:${NC}"
        tail -3 "$log" | sed 's/^/      /'
      else
        echo -e "  ${RED}✗ $basename: 0 bytes (EMPTY!)${NC}"
      fi
    done
  fi
else
  echo -e "${YELLOW}⚠ Skipping log files check (directory not found)${NC}"
fi

# Check 6: Tmux pipe-pane status
echo -e "\n${YELLOW}[6/10]${NC} Checking tmux pipe-pane configuration..."
if env TMUX_TMPDIR=/tmp tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  for i in $(seq 0 $((AGENT_COUNT - 1))); do
    PANE_TARGET="$SESSION_NAME:agents.$i"

    # Check if pane exists
    if env TMUX_TMPDIR=/tmp tmux list-panes -t "$PANE_TARGET" -F "#{pane_id}" > /dev/null 2>&1; then
      # Get pipe status
      PIPE_STATUS=$(env TMUX_TMPDIR=/tmp tmux list-panes -t "$PANE_TARGET" -F "#{pane_pipe}" 2>/dev/null || echo "0")

      if [ "$PIPE_STATUS" = "1" ]; then
        echo -e "  ${GREEN}✓ Agent $i: pipe-pane is active${NC}"
      else
        echo -e "  ${RED}✗ Agent $i: pipe-pane is NOT active${NC}"
      fi
    else
      echo -e "  ${RED}✗ Agent $i: pane does not exist${NC}"
    fi
  done
else
  echo -e "${YELLOW}⚠ Skipping pipe-pane check (session not found)${NC}"
fi

# Check 7: WebSocket connectivity
echo -e "\n${YELLOW}[7/10]${NC} Checking WebSocket server..."
WS_HEALTH=$(curl -s "$API_URL/api/websocket-health" 2>/dev/null || echo "{}")

if echo "$WS_HEALTH" | jq -e '.status' > /dev/null 2>&1; then
  WS_STATUS=$(echo "$WS_HEALTH" | jq -r '.status')
  CONNECTED_CLIENTS=$(echo "$WS_HEALTH" | jq -r '.connectedClients // 0')

  echo -e "${GREEN}✓ WebSocket server is $WS_STATUS${NC}"
  echo -e "  Connected clients: ${CYAN}$CONNECTED_CLIENTS${NC}"
else
  echo -e "${RED}✗ WebSocket server unreachable${NC}"
fi

# Check 8: Orchestrator health files
echo -e "\n${YELLOW}[8/10]${NC} Checking orchestrator health files..."
COORD_DIR="$PROJECT_ROOT/var/maibarn/coordination"
HEALTH_SUMMARY="$COORD_DIR/agents_health_summary.json"

if [ -f "$HEALTH_SUMMARY" ]; then
  echo -e "${GREEN}✓ Health summary file exists${NC}"

  HEALTH_DATA=$(cat "$HEALTH_SUMMARY")
  OVERALL_STATUS=$(echo "$HEALTH_DATA" | jq -r '.overall_status // "unknown"')
  HEALTH_FARM_ID=$(echo "$HEALTH_DATA" | jq -r '.farm_id // "unknown"')

  if [ "$HEALTH_FARM_ID" = "$FARM_ID" ] || [ "$HEALTH_FARM_ID" = "$SHORT_ID" ]; then
    echo -e "  Overall status: ${CYAN}$OVERALL_STATUS${NC}"

    # Show individual agent health
    echo "$HEALTH_DATA" | jq -r '.agents[] | "  Agent \(.agent_id): \(.status) - \(.agent_name)"'
  else
    echo -e "${YELLOW}⚠ Health file is for different farm: $HEALTH_FARM_ID${NC}"
  fi
else
  echo -e "${YELLOW}⚠ No health summary file found${NC}"
  echo -e "  Expected: $HEALTH_SUMMARY"
fi

# Check 9: Recent terminal activity
echo -e "\n${YELLOW}[9/10]${NC} Checking for recent terminal activity..."
if [ -d "$TERMINAL_DIR" ]; then
  RECENT_FILES=$(find "$TERMINAL_DIR" -name "*.log" -mmin -2 2>/dev/null)

  if [ -z "$RECENT_FILES" ]; then
    echo -e "${YELLOW}⚠ No log files modified in last 2 minutes${NC}"
  else
    echo -e "${GREEN}✓ Recently active log files:${NC}"
    for log in $RECENT_FILES; do
      basename=$(basename "$log")
      mtime=$(stat -f "%Sm" -t "%H:%M:%S" "$log" 2>/dev/null || stat -c "%y" "$log" 2>/dev/null | cut -d' ' -f2)
      echo -e "  ${CYAN}$basename (modified: $mtime)${NC}"
    done
  fi
else
  echo -e "${YELLOW}⚠ Skipping activity check (directory not found)${NC}"
fi

# Check 10: Orchestrator process
echo -e "\n${YELLOW}[10/10]${NC} Checking orchestrator process..."
ORCHESTRATOR_PIDS=$(pgrep -f "orchestrator.py.*$FARM_ID" 2>/dev/null || echo "")

if [ -z "$ORCHESTRATOR_PIDS" ]; then
  echo -e "${YELLOW}⚠ No orchestrator.py process found for this farm${NC}"
else
  echo -e "${GREEN}✓ Orchestrator process running${NC}"
  echo "$ORCHESTRATOR_PIDS" | while read pid; do
    PROC_INFO=$(ps -p "$pid" -o pid,etime,command 2>/dev/null || echo "")
    echo -e "  ${CYAN}$PROC_INFO${NC}"
  done
fi

# Summary
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}              Diagnostic Summary${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

if env TMUX_TMPDIR=/tmp tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo -e "Useful commands:"
  echo -e "  ${CYAN}# Attach to tmux session${NC}"
  echo -e "  env TMUX_TMPDIR=/tmp tmux attach -t $SESSION_NAME"
  echo ""
  echo -e "  ${CYAN}# View pane output${NC}"
  echo -e "  env TMUX_TMPDIR=/tmp tmux capture-pane -t $SESSION_NAME:agents.0 -p"
  echo ""
fi

if [ -d "$TERMINAL_DIR" ]; then
  echo -e "  ${CYAN}# Tail log files${NC}"
  echo -e "  tail -f $TERMINAL_DIR/agent-0.log"
  echo ""
fi

echo -e "  ${CYAN}# Get farm status${NC}"
echo -e "  curl -s $API_URL/api/farms/$FARM_ID | jq '.'"
echo ""
echo -e "  ${CYAN}# Get health status${NC}"
echo -e "  curl -s $API_URL/api/farms/$FARM_ID/health | jq '.'"
echo ""
