#!/bin/bash

echo "Testing GoWild with all fixes applied..."
echo ""

# Start server in background
echo "Starting server..."
NODE_ENV=development BYPASS_AUTH=true PORT=4567 npm run dev:server 2>&1 | tee server-test.log &
SERVER_PID=$!

# Wait for server to start
echo "Waiting for server to initialize..."
sleep 15

# Test GoWild API
echo ""
echo "Creating GoWild session..."
RESPONSE=$(curl -s -X POST http://localhost:4567/api/go-wild \
  -H "Content-Type: application/json" \
  -H "x-bypass-auth: true" \
  -d '{
    "prompt": "Test exploration with fixed YAML",
    "timeout": 120
  }')

# Extract farmId
FARM_ID=$(echo "$RESPONSE" | jq -r '.farmId' 2>/dev/null)
SUCCESS=$(echo "$RESPONSE" | jq -r '.success' 2>/dev/null)

if [ "$SUCCESS" = "true" ]; then
  echo "✅ GoWild session created successfully!"
  echo "Farm ID: $FARM_ID"
  
  # Wait a bit for agents to start
  echo ""
  echo "Waiting for agents to launch..."
  sleep 10
  
  # Check tmux sessions
  echo ""
  echo "Checking tmux sessions..."
  tmux list-sessions 2>&1 | grep "farm-" || echo "No farm sessions found"
  
  # Check logs for Python errors
  echo ""
  echo "Checking for Python orchestrator activity..."
  grep -A 5 "Python orchestrator spawned" server-test.log | head -20
  grep "Python stdout\|Python stderr" server-test.log | head -20
  
else
  echo "❌ Failed to create GoWild session"
  echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
fi

# Kill server
echo ""
echo "Cleaning up..."
kill $SERVER_PID 2>/dev/null
pkill -f "tsx.*server/index" 2>/dev/null

echo ""
echo "Test complete. Check server-test.log for full output."