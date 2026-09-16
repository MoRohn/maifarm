#!/bin/bash

MAIFARM_ROOT="${MAIFARM_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
export MAIFARM_ROOT
# Farm Diagnostic Script
# Usage: ./scripts/diagnostics/diagnose-farm.sh <farm-id>

set -e

FARM_ID="${1}"
if [ -z "$FARM_ID" ]; then
  echo "❌ Usage: $0 <farm-id>"
  exit 1
fi

echo "🔍 Diagnosing Farm: $FARM_ID"
echo "================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
check_passed() {
  echo -e "${GREEN}✓${NC} $1"
}

check_failed() {
  echo -e "${RED}✗${NC} $1"
}

check_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

# 1. Check Database Record
echo "1. Checking Database Record..."
DB_RESULT=$(PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -t -c "SELECT status, mode, created_at FROM farms WHERE id = '$FARM_ID';" 2>/dev/null || echo "")

if [ -n "$DB_RESULT" ]; then
  check_passed "Farm exists in database"
  echo "   $DB_RESULT"
else
  check_failed "Farm not found in database"
  exit 1
fi

# 2. Check Tmux Session
echo ""
echo "2. Checking Tmux Session..."
SESSION_NAME="farm-${FARM_ID:0:8}"
TMUX_SESSION=$(TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null | grep "$SESSION_NAME" || echo "")

if [ -n "$TMUX_SESSION" ]; then
  check_passed "Tmux session exists: $SESSION_NAME"

  # Check panes
  PANE_COUNT=$(TMUX_TMPDIR=/tmp tmux list-panes -t "$SESSION_NAME" 2>/dev/null | wc -l)
  echo "   Panes: $PANE_COUNT"

  # Check if processes are running in panes
  echo "   Pane Processes:"
  TMUX_TMPDIR=/tmp tmux list-panes -t "$SESSION_NAME" -F "   - Pane #{pane_index}: PID=#{pane_pid} CMD=#{pane_current_command}" 2>/dev/null
else
  check_failed "Tmux session not found"
fi

# 3. Check Terminal Log Files
echo ""
echo "3. Checking Terminal Logs..."
TERMINAL_DIR="${MAIFARM_ROOT}/var/maibarn/terminals/$FARM_ID"

if [ -d "$TERMINAL_DIR" ]; then
  check_passed "Terminal directory exists"

  LOG_COUNT=$(ls -1 "$TERMINAL_DIR"/agent-*.log 2>/dev/null | wc -l)
  echo "   Log files: $LOG_COUNT"

  # Check log sizes and last update
  echo "   Log Status:"
  for log in "$TERMINAL_DIR"/agent-*.log; do
    if [ -f "$log" ]; then
      SIZE=$(wc -l < "$log")
      MODIFIED=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$log")
      BASENAME=$(basename "$log")
      echo "   - $BASENAME: $SIZE lines (last: $MODIFIED)"
    fi
  done
else
  check_failed "Terminal directory not found"
fi

# 4. Check Orchestrator Status
echo ""
echo "4. Checking Orchestrator..."
ORCHESTRATOR_PID=$(ps aux | grep "orchestrator.py.*$FARM_ID" | grep -v grep | awk '{print $2}' | head -1)

if [ -n "$ORCHESTRATOR_PID" ]; then
  check_passed "Orchestrator running (PID: $ORCHESTRATOR_PID)"

  # Check orchestrator status file
  STATUS_FILE="${MAIFARM_ROOT}/var/maibarn/coordination/${FARM_ID}-status.json"
  if [ -f "$STATUS_FILE" ]; then
    check_passed "Status file exists"
    echo "   Status:"
    cat "$STATUS_FILE" | jq '.' 2>/dev/null || cat "$STATUS_FILE"
  else
    check_warning "Status file not found"
  fi
else
  check_failed "Orchestrator process not running"
fi

# 5. Check Agent Processes
echo ""
echo "5. Checking Agent Activity..."
if [ -n "$TMUX_SESSION" ]; then
  for i in {0..4}; do
    PANE_TARGET="$SESSION_NAME:agents.$i"

    # Try to capture last 5 lines from pane
    RECENT_OUTPUT=$(TMUX_TMPDIR=/tmp tmux capture-pane -t "$PANE_TARGET" -p -S -5 2>/dev/null | tail -1)

    if [ -n "$RECENT_OUTPUT" ]; then
      # Check if agent is doing work (not just sitting at prompt)
      if echo "$RECENT_OUTPUT" | grep -q "Claude Code"; then
        check_warning "Agent $i at prompt (may be idle)"
      else
        check_passed "Agent $i active"
      fi
    else
      check_warning "Agent $i - no recent output"
    fi
  done
fi

# 6. Check Backend Server
echo ""
echo "6. Checking Backend Server..."
SERVER_RESPONSE=$(curl -s http://localhost:4567/api/farms/$FARM_ID 2>/dev/null || echo "")

if [ -n "$SERVER_RESPONSE" ]; then
  check_passed "Backend server responding"
  echo "   Farm Status:"
  echo "$SERVER_RESPONSE" | jq '.data[0] | {status, agentCount: .agents | length}' 2>/dev/null || echo "   Could not parse response"
else
  check_failed "Backend server not responding"
fi

# 7. Check WebSocket Server
echo ""
echo "7. Checking WebSocket..."
WS_CHECK=$(curl -s http://localhost:4567/api/websocket-health 2>/dev/null || echo "")

if [ -n "$WS_CHECK" ]; then
  check_passed "WebSocket health endpoint responding"
  echo "$WS_CHECK" | jq '.' 2>/dev/null
else
  check_warning "WebSocket health check failed"
fi

# 8. Check Terminal Streaming Service
echo ""
echo "8. Checking Terminal Streaming..."
TERMINAL_HEALTH=$(curl -s http://localhost:4567/api/terminal-health/health/farm/$FARM_ID 2>/dev/null || echo "")

if [ -n "$TERMINAL_HEALTH" ]; then
  HEALTH_STATUS=$(echo "$TERMINAL_HEALTH" | jq -r '.overallHealth' 2>/dev/null || echo "unknown")

  if [ "$HEALTH_STATUS" == "healthy" ]; then
    check_passed "Terminal streaming healthy"
  else
    check_warning "Terminal streaming: $HEALTH_STATUS"
  fi

  echo "$TERMINAL_HEALTH" | jq '.metrics' 2>/dev/null
else
  check_warning "Terminal health endpoint not available"
fi

# 9. Summary
echo ""
echo "================================"
echo "📊 Diagnostic Summary"
echo "================================"

# Calculate health score
CHECKS_PASSED=0
CHECKS_TOTAL=8

if [ -n "$DB_RESULT" ]; then ((CHECKS_PASSED++)); fi
if [ -n "$TMUX_SESSION" ]; then ((CHECKS_PASSED++)); fi
if [ -d "$TERMINAL_DIR" ]; then ((CHECKS_PASSED++)); fi
if [ -n "$ORCHESTRATOR_PID" ]; then ((CHECKS_PASSED++)); fi
if [ -n "$SERVER_RESPONSE" ]; then ((CHECKS_PASSED++)); fi

HEALTH_PERCENT=$((CHECKS_PASSED * 100 / CHECKS_TOTAL))

echo "Health Score: $CHECKS_PASSED/$CHECKS_TOTAL ($HEALTH_PERCENT%)"
echo ""

if [ $HEALTH_PERCENT -ge 80 ]; then
  echo -e "${GREEN}✓ Farm appears healthy${NC}"
  echo ""
  echo "💡 If agents are not displaying activity:"
  echo "   1. Check browser console for WebSocket errors"
  echo "   2. Verify frontend is connected to farm room"
  echo "   3. Check if agents have received prompts"
elif [ $HEALTH_PERCENT -ge 50 ]; then
  echo -e "${YELLOW}⚠ Farm has issues but may be recoverable${NC}"
  echo ""
  echo "🔧 Recommended actions:"
  echo "   1. Try recovery: curl -X POST http://localhost:4567/api/farms/$FARM_ID/recover"
  echo "   2. Check orchestrator logs for errors"
  echo "   3. Restart backend if not responding"
else
  echo -e "${RED}✗ Farm is unhealthy${NC}"
  echo ""
  echo "🔧 Recommended actions:"
  echo "   1. Stop farm: curl -X POST http://localhost:4567/api/farms/$FARM_ID/stop"
  echo "   2. Kill tmux session: TMUX_TMPDIR=/tmp tmux kill-session -t $SESSION_NAME"
  echo "   3. Launch new farm with simpler prompt"
fi

echo ""
echo "📝 For detailed logs:"
echo "   Orchestrator: Check terminal panes in tmux session"
echo "   Backend: Check server console output"
echo "   Terminal Logs: $TERMINAL_DIR"
