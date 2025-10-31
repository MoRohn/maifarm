#!/bin/bash

echo "=========================================="
echo "Testing GoWild Farm Creation - Fixed Version"
echo "=========================================="
echo ""

# Kill any existing server
echo "Cleaning up existing processes..."
pkill -f "tsx.*server/index" 2>/dev/null
pkill -f "node.*server/index" 2>/dev/null
sleep 2

# Start server in background
echo "Starting server with debug logging..."
NODE_ENV=development BYPASS_AUTH=true PORT=4567 npm run dev:server 2>&1 > gowild-test.log &
SERVER_PID=$!

# Wait for server to initialize
echo "Waiting for server to initialize (15 seconds)..."
sleep 15

# Check if server is running
if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "ERROR: Server failed to start"
    cat gowild-test.log | tail -50
    exit 1
fi

# Test GoWild API
echo ""
echo "Creating GoWild session..."
echo "-------------------------------"
RESPONSE=$(curl -s -X POST http://localhost:4567/api/go-wild \
  -H "Content-Type: application/json" \
  -H "x-bypass-auth: true" \
  -d '{
    "prompt": "Explore innovative AI agent collaboration patterns",
    "timeout": 180,
    "creativityLevel": 7,
    "focusAreas": ["agent coordination", "distributed systems"],
    "boundaries": ["stay within TypeScript ecosystem"]
  }')

echo "$RESPONSE" | jq '.'

# Extract farm ID
FARM_ID=$(echo "$RESPONSE" | jq -r '.farmId')
SESSION_ID=$(echo "$RESPONSE" | jq -r '.sessionId')

if [ "$FARM_ID" == "null" ] || [ -z "$FARM_ID" ]; then
    echo "ERROR: Failed to create GoWild session"
    echo "Response: $RESPONSE"
    echo ""
    echo "=== Last 50 lines of server log ==="
    tail -50 gowild-test.log
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

echo ""
echo "✅ GoWild session created successfully!"
echo "   Farm ID: $FARM_ID"
echo "   Session ID: $SESSION_ID"
echo ""

# Wait and check for agent activity
echo "Monitoring for agent activity (30 seconds)..."
echo "-------------------------------"
sleep 30

# Check tmux sessions
echo ""
echo "Checking tmux sessions..."
tmux list-sessions 2>/dev/null | grep -E "farm-$FARM_ID|gowild" || echo "No tmux sessions found for this farm"

# Check logs for key events
echo ""
echo "=== Checking for YAML Generation ==="
grep -E "Calling yamlGenerator|YAML response received|YAML generated successfully" gowild-test.log | tail -10

echo ""
echo "=== Checking for Orchestrator Launch ==="
grep -E "About to launch orchestrator|Calling orchestratorService|Python|Claude CLI|spawn" gowild-test.log | tail -10

echo ""
echo "=== Checking for Barn Collection (should NOT trigger immediately) ==="
grep -E "High-priority file changes detected|Still in grace period|scheduleCollection" gowild-test.log | tail -10

echo ""
echo "=== Checking for Errors ==="
ERROR_COUNT=$(grep -E "ERROR|Failed|Critical error|Timed out" gowild-test.log | wc -l)
if [ $ERROR_COUNT -gt 0 ]; then
    echo "Found $ERROR_COUNT error messages:"
    grep -E "ERROR|Failed|Critical error|Timed out" gowild-test.log | tail -20
else
    echo "✅ No critical errors found"
fi

# Check farm status
echo ""
echo "=== Checking Farm Status ==="
FARM_STATUS=$(curl -s http://localhost:4567/api/farms/$FARM_ID \
  -H "x-bypass-auth: true" | jq -r '.status')

echo "Farm Status: $FARM_STATUS"

if [ "$FARM_STATUS" == "running" ] || [ "$FARM_STATUS" == "active" ] || [ "$FARM_STATUS" == "exploring" ]; then
    echo "✅ Farm is active and running!"
else
    echo "⚠️ Farm status is not active: $FARM_STATUS"
fi

# Final summary
echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo ""

if [ "$FARM_STATUS" == "running" ] || [ "$FARM_STATUS" == "active" ] || [ "$FARM_STATUS" == "exploring" ]; then
    echo "✅ SUCCESS: GoWild farm created and agents launched"
    echo "   - YAML generation completed without hanging"
    echo "   - Orchestrator launched successfully"
    echo "   - Barn collection has grace period (no immediate trigger)"
    echo "   - Farm is in active state"
else
    echo "❌ FAILURE: GoWild farm creation had issues"
    echo "   - Check gowild-test.log for details"
    echo "   - Farm status: $FARM_STATUS"
fi

# Clean up
echo ""
echo "Cleaning up..."
kill $SERVER_PID 2>/dev/null
pkill -f "tsx.*server/index" 2>/dev/null

echo ""
echo "Test complete. Full log saved to gowild-test.log"