#!/bin/bash
# Test script for orphaned session detection
# Demonstrates the detection logic without requiring server to be running

set -e

echo "==========================================="
echo "Orphaned Session Detection Test"
echo "==========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. List all tmux sessions with farm- prefix
echo "Step 1: Listing tmux sessions with 'farm-' prefix..."
echo ""

tmux_sessions=$(TMUX_TMPDIR=/tmp tmux list-sessions -F '#{session_name}' 2>/dev/null | grep "^farm-" || echo "")

if [ -z "$tmux_sessions" ]; then
  echo -e "${YELLOW}No farm- tmux sessions found${NC}"
  exit 0
fi

echo "Found tmux sessions:"
echo "$tmux_sessions" | while read -r session; do
  echo "  - $session"
done
echo ""

# 2. Check each session against database
echo "Step 2: Checking database records for each session..."
echo ""

orphaned_count=0
synced_count=0

# Use process substitution to avoid subshell
while read -r session_name; do
  # Extract farm ID from session name (remove 'farm-' prefix)
  farm_id="${session_name#farm-}"

  # Query database for matching farm
  db_result=$(PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql \
    -U maifarm -d maifarm_dev -t -c \
    "SELECT id::text FROM farms WHERE id::text LIKE '${farm_id}%' OR session_name = '${session_name}' LIMIT 1;" \
    2>/dev/null | xargs || echo "")

  if [ -z "$db_result" ]; then
    echo -e "${RED}ORPHANED${NC}: $session_name (No database record)"
    orphaned_count=$((orphaned_count + 1))

    # Get session age and pane count
    session_info=$(TMUX_TMPDIR=/tmp tmux list-sessions -F '#{session_name}:#{session_created}:#{session_windows}' 2>/dev/null | grep "^${session_name}:" || echo "")
    if [ -n "$session_info" ]; then
      created=$(echo "$session_info" | cut -d: -f2)
      pane_count=$(echo "$session_info" | cut -d: -f3)
      age=$(($(date +%s) - created))
      echo "  Farm ID: $farm_id"
      echo "  Age: ${age}s ($(($age / 60)) minutes)"
      echo "  Pane count: $pane_count"
    fi
  else
    echo -e "${GREEN}SYNCED${NC}: $session_name (Database record exists: $db_result)"
    synced_count=$((synced_count + 1))
  fi
  echo ""
done < <(echo "$tmux_sessions")

# 3. Summary
echo "==========================================="
echo "Summary"
echo "==========================================="
echo "Total tmux sessions: $(echo "$tmux_sessions" | wc -l | xargs)"
echo -e "Orphaned sessions: ${RED}${orphaned_count}${NC}"
echo -e "Synced sessions: ${GREEN}${synced_count}${NC}"
echo ""

if [ $orphaned_count -gt 0 ]; then
  echo -e "${YELLOW}Action Required:${NC}"
  echo "  1. Start the server: npm run dev"
  echo "  2. Automatic recovery will run within 5 minutes"
  echo "  3. Or trigger manual recovery:"
  echo "     curl -X POST http://localhost:4567/api/recovery/scan \\"
  echo "       -H \"Authorization: Bearer \$ADMIN_TOKEN\""
  echo ""
  echo "  4. Or use the comprehensive fix:"
  echo "     curl -X POST http://localhost:4567/api/system-health/sync/fix \\"
  echo "       -H \"Authorization: Bearer \$ADMIN_TOKEN\""
else
  echo -e "${GREEN}System is healthy - all sessions are synced!${NC}"
fi
echo ""

exit 0
