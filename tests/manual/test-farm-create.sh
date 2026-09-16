#!/bin/bash

MAIFARM_ROOT="${MAIFARM_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
export MAIFARM_ROOT

echo "Testing farm creation with fixed YAML..."

# Create a harvest farm using the quick-actions endpoint
RESPONSE=$(curl -s -X POST http://localhost:4567/api/quick-actions/farm \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Harvest Farm","prompt":"Design a sustainable irrigation system","mode":"harvest","agentCount":3,"timeoutMinutes":10,"provider":"claude"}')

echo "Response:"
echo "$RESPONSE" | jq '.' || echo "$RESPONSE"

# Extract farm ID from either format
FARM_ID=$(echo "$RESPONSE" | jq -r '.data.farmId // .farmId' 2>/dev/null)

if [ "$FARM_ID" != "null" ] && [ -n "$FARM_ID" ]; then
  echo ""
  echo "Farm created: $FARM_ID"

  # Wait for initialization
  sleep 3

  # Check tmux session
  SESSION="farm-${FARM_ID:0:8}"
  echo ""
  echo "Checking tmux session: $SESSION"
  TMUX_TMPDIR=/tmp tmux list-panes -t "$SESSION:agents" 2>/dev/null | wc -l

  # Check YAML file
  echo ""
  echo "Checking YAML file:"
  ls -la ${MAIFARM_ROOT}/var/maibarn/xenosync-sessions/prompt-farm-${FARM_ID:0:8}.yaml 2>/dev/null

  if [ -f "${MAIFARM_ROOT}/var/maibarn/xenosync-sessions/prompt-farm-${FARM_ID:0:8}.yaml" ]; then
    echo ""
    echo "YAML content:"
    cat "${MAIFARM_ROOT}/var/maibarn/xenosync-sessions/prompt-farm-${FARM_ID:0:8}.yaml"
  fi

  # Check agents in database
  echo ""
  echo "Agents in database:"
  PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -c \
    "SELECT pane_index, name, status FROM agents WHERE farm_id='$FARM_ID' ORDER BY pane_index;"
else
  echo "Failed to create farm"
fi