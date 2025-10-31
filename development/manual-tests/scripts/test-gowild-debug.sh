#!/bin/bash

echo "Testing GoWild with enhanced debugging..."
echo ""

# Kill any existing server
pkill -f "tsx.*server/index" 2>/dev/null
sleep 2

# Start server in background
echo "Starting server..."
NODE_ENV=development BYPASS_AUTH=true PORT=4567 npm run dev:server 2>&1 > gowild-debug.log &
SERVER_PID=$!

# Wait for server to start
echo "Waiting for server to initialize..."
sleep 15

# Test GoWild API
echo ""
echo "Creating GoWild session..."
curl -s -X POST http://localhost:4567/api/go-wild \
  -H "Content-Type: application/json" \
  -H "x-bypass-auth: true" \
  -d '{
    "prompt": "Explore innovative testing solutions",
    "timeout": 120
  }' | jq '.'

# Wait to see what happens
echo ""
echo "Monitoring logs for 20 seconds..."
sleep 20

# Check for our debug messages
echo ""
echo "=== Checking for GoWild Manager Debug Messages ==="
grep -E "GoWildManager.*Starting exploration process|About to launch orchestrator|Calling orchestratorService|Critical error|Failed to start exploration" gowild-debug.log | head -20

echo ""
echo "=== Checking for Orchestrator Activity ==="
grep -E "Orchestrator.*Starting farm launch|Python|spawn|Claude CLI" gowild-debug.log | head -20

echo ""
echo "=== Checking for Barn Collection ==="
grep -E "Starting collection|Scheduled collection|High-priority" gowild-debug.log | head -10

echo ""
echo "=== Checking for Errors ==="
grep -E "ERROR|Failed|error:" gowild-debug.log | head -20

# Kill server
echo ""
echo "Cleaning up..."
kill $SERVER_PID 2>/dev/null
pkill -f "tsx.*server/index" 2>/dev/null

echo ""
echo "Test complete. Full log in gowild-debug.log"