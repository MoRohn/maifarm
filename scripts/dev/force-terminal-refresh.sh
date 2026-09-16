#!/bin/bash
# Force Terminal Refresh Script
# Forces terminal output to be captured and streamed via WebSocket

set -e

FARM_ID=${1:-"d7e86bb7-90d5-415b-853b-2160e5f689d6"}
API_URL=${2:-"http://localhost:4567"}

echo "=== Force Terminal Refresh for Farm: $FARM_ID ==="
echo ""

# Step 1: Force refresh via API
echo "Step 1: Triggering force refresh via API..."
curl -X POST "$API_URL/api/terminal-refresh/$FARM_ID" \
  -H "Content-Type: application/json" \
  2>/dev/null | jq '.'

echo ""

# Step 2: Check refresh service stats
echo "Step 2: Checking refresh service statistics..."
curl -s "$API_URL/api/terminal-refresh/stats" | jq '.'

echo ""

# Step 3: Capture direct from tmux and send test output
echo "Step 3: Capturing terminal output directly from tmux..."

SESSION_NAME="farm-${FARM_ID:0:8}"
TERMINALS_DIR="var/maibarn/terminals/$FARM_ID"

# Check if tmux session exists
if TMUX_TMPDIR=/tmp tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "✓ Tmux session '$SESSION_NAME' found"

  # List panes
  echo ""
  echo "Active panes:"
  TMUX_TMPDIR=/tmp tmux list-panes -t "$SESSION_NAME" -F "  Agent #{pane_index}: PID #{pane_pid}, Command: #{pane_current_command}"

  # Capture from each pane
  for i in {0..4}; do
    PANE="$SESSION_NAME:agents.$i"
    LOG_FILE="$TERMINALS_DIR/agent-$i.log"

    if TMUX_TMPDIR=/tmp tmux list-panes -t "$PANE" 2>/dev/null | grep -q .; then
      echo ""
      echo "Capturing from $PANE..."

      # Capture last 20 lines
      CONTENT=$(TMUX_TMPDIR=/tmp tmux capture-pane -t "$PANE" -p -S -20 2>/dev/null || echo "Failed to capture")

      if [ ! -z "$CONTENT" ] && [ "$CONTENT" != "Failed to capture" ]; then
        echo "✓ Captured $(echo "$CONTENT" | wc -l) lines"
        echo "  First 3 lines:"
        echo "$CONTENT" | head -3 | sed 's/^/    /'

        # Check log file
        if [ -f "$LOG_FILE" ]; then
          SIZE=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo "0")
          echo "  Log file size: $SIZE bytes"
        else
          echo "  ⚠ Log file not found: $LOG_FILE"
        fi
      else
        echo "✗ No content captured"
      fi
    else
      echo "  ⚠ Pane $PANE not found"
    fi
  done
else
  echo "✗ Tmux session '$SESSION_NAME' not found"
  echo ""
  echo "Available sessions:"
  TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null | sed 's/^/  /' || echo "  No tmux sessions found"
fi

echo ""
echo "=== Refresh Complete ==="
