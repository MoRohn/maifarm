#!/bin/bash

MAIFARM_ROOT="${MAIFARM_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
export MAIFARM_ROOT
# Orchestrator Monitor Script
# Monitors orchestrator process and logs for a specific farm
# Usage: ./scripts/diagnostics/monitor-orchestrator.sh <farm-id>

set -e

FARM_ID="${1}"
if [ -z "$FARM_ID" ]; then
  echo "❌ Usage: $0 <farm-id>"
  exit 1
fi

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SESSION_NAME="farm-${FARM_ID:0:8}"
COORDINATION_DIR="${MAIFARM_ROOT}/var/maibarn/coordination"
STATUS_FILE="${COORDINATION_DIR}/${FARM_ID}-status.json"
TERMINAL_DIR="${MAIFARM_ROOT}/var/maibarn/terminals/$FARM_ID"

echo -e "${BLUE}==================================${NC}"
echo -e "${BLUE}🔍 Orchestrator Monitor${NC}"
echo -e "${BLUE}==================================${NC}"
echo ""
echo "Farm ID: $FARM_ID"
echo "Session: $SESSION_NAME"
echo ""

# Function to display a line
display_line() {
  echo -e "${1}"
}

# 1. Check if orchestrator process is running
echo -e "${YELLOW}1. Orchestrator Process${NC}"
ORCHESTRATOR_PID=$(ps aux | grep "orchestrator.py.*$FARM_ID" | grep -v grep | awk '{print $2}' | head -1)

if [ -n "$ORCHESTRATOR_PID" ]; then
  display_line "${GREEN}✓${NC} Running (PID: $ORCHESTRATOR_PID)"

  # Show process details
  PS_INFO=$(ps -p $ORCHESTRATOR_PID -o pid,ppid,etime,command | tail -1)
  echo "  $PS_INFO"

  # Show resource usage
  CPU=$(ps -p $ORCHESTRATOR_PID -o %cpu | tail -1 | xargs)
  MEM=$(ps -p $ORCHESTRATOR_PID -o %mem | tail -1 | xargs)
  echo "  CPU: ${CPU}%, Memory: ${MEM}%"
else
  display_line "${RED}✗${NC} Not running"
fi

echo ""

# 2. Check orchestrator status file
echo -e "${YELLOW}2. Orchestrator Status File${NC}"
if [ -f "$STATUS_FILE" ]; then
  display_line "${GREEN}✓${NC} Status file exists"

  # Parse and display status
  STATUS=$(jq -r '.status' "$STATUS_FILE" 2>/dev/null || echo "unknown")
  AGENTS_LAUNCHED=$(jq -r '.agentsLaunched' "$STATUS_FILE" 2>/dev/null || echo "0")
  PANES_CREATED=$(jq -r '.panesCreated' "$STATUS_FILE" 2>/dev/null || echo "0")
  UPDATED_AT=$(jq -r '.updatedAt' "$STATUS_FILE" 2>/dev/null || echo "unknown")

  echo "  Status: $STATUS"
  echo "  Agents Launched: $AGENTS_LAUNCHED"
  echo "  Panes Created: $PANES_CREATED"
  echo "  Last Update: $UPDATED_AT"

  # Show full status if verbose
  if [ "$2" == "-v" ] || [ "$2" == "--verbose" ]; then
    echo ""
    echo "  Full Status:"
    cat "$STATUS_FILE" | jq '.' | sed 's/^/    /'
  fi
else
  display_line "${RED}✗${NC} Status file not found"
  echo "  Expected at: $STATUS_FILE"
fi

echo ""

# 3. Check if agents received prompts
echo -e "${YELLOW}3. Prompt Delivery Status${NC}"

if [ -d "$TERMINAL_DIR" ]; then
  PROMPT_RECEIVED=0
  AGENTS_READY=0
  AGENTS_WORKING=0

  for log in "$TERMINAL_DIR"/agent-*.log; do
    if [ -f "$log" ]; then
      AGENT_NUM=$(basename "$log" | sed 's/agent-//;s/.log//')

      # Check if agent received prompt
      if grep -q "Pasted text" "$log" 2>/dev/null; then
        ((PROMPT_RECEIVED++))
      fi

      # Check if agent is ready
      if grep -q "Claude Code" "$log" 2>/dev/null; then
        ((AGENTS_READY++))
      fi

      # Check if agent is working (has actual output beyond setup)
      LINE_COUNT=$(wc -l < "$log")
      if [ "$LINE_COUNT" -gt 20 ]; then
        ((AGENTS_WORKING++))
      fi
    fi
  done

  echo "  Agents Ready: $AGENTS_READY"
  echo "  Prompts Received: $PROMPT_RECEIVED"
  echo "  Agents Working: $AGENTS_WORKING"

  if [ $AGENTS_WORKING -eq 0 ] && [ $AGENTS_READY -gt 0 ]; then
    display_line "  ${YELLOW}⚠${NC} Agents are ready but not working yet"
  fi
else
  display_line "${RED}✗${NC} Terminal directory not found"
fi

echo ""

# 4. Check tmux panes and their state
echo -e "${YELLOW}4. Tmux Panes Status${NC}"

if TMUX_TMPDIR=/tmp tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  display_line "${GREEN}✓${NC} Session exists"

  # List all panes
  echo "  Panes:"
  TMUX_TMPDIR=/tmp tmux list-panes -t "$SESSION_NAME" -F "    #{pane_index}: PID=#{pane_pid} Active=#{pane_active} #{pane_current_command}" 2>/dev/null

  # Check if any pane has recent activity
  echo ""
  echo "  Recent Activity (last 3 lines per pane):"
  for i in {0..4}; do
    PANE_TARGET="$SESSION_NAME:agents.$i"
    RECENT=$(TMUX_TMPDIR=/tmp tmux capture-pane -t "$PANE_TARGET" -p -S -3 2>/dev/null | tail -1 | sed 's/[[:space:]]*$//' || echo "")

    if [ -n "$RECENT" ] && [ "${#RECENT}" -gt 5 ]; then
      # Truncate long lines
      TRUNCATED=$(echo "$RECENT" | cut -c1-60)
      echo "    Pane $i: $TRUNCATED"
    else
      echo "    Pane $i: (no recent output)"
    fi
  done
else
  display_line "${RED}✗${NC} Session does not exist"
fi

echo ""

# 5. Live tail of orchestrator output (optional)
if [ "$2" == "--tail" ] || [ "$3" == "--tail" ]; then
  echo -e "${YELLOW}5. Live Orchestrator Output${NC}"
  echo "  Press Ctrl+C to stop"
  echo ""

  # Find most recently modified agent log
  LATEST_LOG=$(ls -t "$TERMINAL_DIR"/agent-*.log 2>/dev/null | head -1)

  if [ -n "$LATEST_LOG" ]; then
    tail -f "$LATEST_LOG"
  else
    echo "  No log files found"
  fi
fi

echo ""
echo -e "${BLUE}==================================${NC}"
echo -e "${BLUE}📊 Summary${NC}"
echo -e "${BLUE}==================================${NC}"

# Calculate health score
HEALTH_SCORE=0
if [ -n "$ORCHESTRATOR_PID" ]; then ((HEALTH_SCORE+=25)); fi
if [ -f "$STATUS_FILE" ]; then ((HEALTH_SCORE+=25)); fi
if [ $AGENTS_READY -gt 0 ]; then ((HEALTH_SCORE+=25)); fi
if [ $AGENTS_WORKING -gt 0 ]; then ((HEALTH_SCORE+=25)); fi

echo "Health Score: $HEALTH_SCORE/100"

if [ $HEALTH_SCORE -ge 75 ]; then
  echo -e "${GREEN}✓ Orchestrator appears healthy${NC}"
elif [ $HEALTH_SCORE -ge 50 ]; then
  echo -e "${YELLOW}⚠ Orchestrator has some issues${NC}"

  if [ $AGENTS_READY -gt 0 ] && [ $AGENTS_WORKING -eq 0 ]; then
    echo ""
    echo "💡 Possible issues:"
    echo "   - Agents are stuck at prompt"
    echo "   - Prompt not delivered correctly"
    echo "   - CLAUDE.md file size warning blocking agents"
    echo ""
    echo "🔧 Try:"
    echo "   - Check if prompts were sent: grep 'Pasted text' $TERMINAL_DIR/agent-0.log"
    echo "   - Manually send prompt to agent 0:"
    echo "     TMUX_TMPDIR=/tmp tmux send-keys -t $SESSION_NAME:agents.0 'echo \"Starting work\"' Enter"
  fi
else
  echo -e "${RED}✗ Orchestrator is unhealthy${NC}"
  echo ""
  echo "🔧 Recommended actions:"
  echo "   1. Check orchestrator logs"
  echo "   2. Verify tmux session"
  echo "   3. Restart farm if necessary"
fi

echo ""
