#!/bin/bash

# Test script to verify agent launch and prompt delivery fixes
# This tests the complete orchestration flow for production readiness

echo "=================================="
echo "MaiFarm Agent Launch Fix Test"
echo "=================================="
echo ""

# Configuration
API_URL="http://localhost:4567/api"
NUM_AGENTS=3
FARM_NAME="test-agent-fix-$(date +%s)"
PROMPT="Please introduce yourself and tell me what tasks you're working on today. Be brief."

echo "Test Configuration:"
echo "  - Farm: $FARM_NAME"
echo "  - Agents: $NUM_AGENTS"
echo "  - Prompt: $PROMPT"
echo ""

# Create a simple YAML configuration
YAML_CONTENT=$(cat <<EOF
name: $FARM_NAME
description: Testing agent launch and prompt delivery
initial_prompt: "$PROMPT"
agents:
  - name: "Alice"
    role: "Frontend Developer"
    tasks:
      - "Review UI components"
      - "Test user interactions"
  - name: "Bob"
    role: "Backend Developer"
    tasks:
      - "Check API endpoints"
      - "Validate data flow"
  - name: "Charlie"
    role: "QA Engineer"
    tasks:
      - "Run test suite"
      - "Document findings"
EOF
)

echo "Step 1: Creating farm with $NUM_AGENTS agents..."
echo ""

# Create farm via API
RESPONSE=$(curl -s -X POST "$API_URL/farms" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$FARM_NAME\",
    \"description\": \"Testing agent launch fixes\",
    \"yamlContent\": $(echo "$YAML_CONTENT" | jq -Rs .),
    \"numberOfAgents\": $NUM_AGENTS,
    \"provider\": \"claude\",
    \"timeout\": 60000
  }")

FARM_ID=$(echo "$RESPONSE" | jq -r '.farmId // .data.farmId // .data.id // empty')

if [ -z "$FARM_ID" ]; then
  echo "❌ Failed to create farm!"
  echo "Response: $RESPONSE"
  exit 1
fi

echo "✅ Farm created: $FARM_ID"
echo ""

# Get session name
SESSION_NAME=$(echo "$RESPONSE" | jq -r '.sessionName // .data.sessionName // empty')
if [ -z "$SESSION_NAME" ]; then
  SESSION_NAME="farm-${FARM_ID:0:8}"
fi

echo "Step 2: Waiting for agents to initialize..."
sleep 5

echo ""
echo "Step 3: Checking agent activity in tmux session..."
echo ""

# Check each agent pane
for i in $(seq 0 $((NUM_AGENTS - 1))); do
  echo "Agent $((i + 1)) Output:"
  echo "-------------------"
  tmux capture-pane -t "$SESSION_NAME:0.$i" -p 2>/dev/null | head -20 | sed 's/^/  /'
  echo ""
done

echo "Step 4: Checking terminal streaming..."
echo ""

# Check if terminal logs are being captured
TERMINAL_DIR="/Users/rohnspringfield/maifarm/maibarn/terminals/$SESSION_NAME"
if [ -d "$TERMINAL_DIR" ]; then
  echo "✅ Terminal log directory exists"
  for log in "$TERMINAL_DIR"/*.log; do
    if [ -f "$log" ]; then
      echo "  - $(basename "$log"): $(wc -l < "$log") lines"
    fi
  done
else
  echo "⚠️  Terminal log directory not found"
fi

echo ""
echo "Step 5: Harvest collection test..."
echo ""

# Trigger harvest
echo "Triggering harvest collection..."
HARVEST_RESPONSE=$(curl -s -X POST "$API_URL/farms/$FARM_ID/harvest" \
  -H "Content-Type: application/json")

HARVEST_ID=$(echo "$HARVEST_RESPONSE" | jq -r '.harvestId // .data.harvestId // empty')

if [ -n "$HARVEST_ID" ]; then
  echo "✅ Harvest initiated: $HARVEST_ID"
else
  echo "⚠️  Harvest initiation failed"
fi

echo ""
echo "=================================="
echo "Test Summary:"
echo "=================================="

# Check if agents are actually running
AGENT_ACTIVE=false
for i in $(seq 0 $((NUM_AGENTS - 1))); do
  OUTPUT=$(tmux capture-pane -t "$SESSION_NAME:0.$i" -p 2>/dev/null | grep -E "schlepping|working|processing|✓|✗|⏺" | head -1)
  if [ -n "$OUTPUT" ]; then
    AGENT_ACTIVE=true
    break
  fi
done

if [ "$AGENT_ACTIVE" = true ]; then
  echo "✅ Agents are ACTIVE and processing tasks!"
else
  echo "❌ Agents appear to be IDLE - prompt delivery may have failed"
fi

echo ""
echo "Cleanup: Run 'tmux kill-session -t $SESSION_NAME' to stop the test farm"
echo ""