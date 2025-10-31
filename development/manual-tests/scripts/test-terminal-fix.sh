#!/bin/bash

echo "🔧 Testing Terminal Output Fix"
echo "================================"

# Check if server is running
echo "1. Checking server health..."
HEALTH=$(curl -s http://localhost:4567/health | jq -r '.status' 2>/dev/null)
if [ "$HEALTH" != "ok" ]; then
    echo "❌ Server not running or unhealthy. Please start the server first."
    exit 1
fi
echo "✅ Server is healthy"

# Check debug endpoint
echo ""
echo "2. Checking terminal debug endpoint..."
DEBUG_INFO=$(curl -s http://localhost:4567/api/debug/terminal 2>/dev/null)
if [ -z "$DEBUG_INFO" ]; then
    echo "⚠️  Debug endpoint not available (might still be loading)"
    sleep 2
    DEBUG_INFO=$(curl -s http://localhost:4567/api/debug/terminal 2>/dev/null)
fi

if [ ! -z "$DEBUG_INFO" ]; then
    echo "✅ Debug endpoint available"
    echo "   Terminal rooms: $(echo $DEBUG_INFO | jq -r '.data.terminalRoomCount // 0')"
    echo "   Connected clients: $(echo $DEBUG_INFO | jq -r '.data.totalConnectedClients // 0')"
else
    echo "⚠️  Debug endpoint not responding"
fi

# Test broadcast
echo ""
echo "3. Testing terminal broadcast..."
BROADCAST_RESULT=$(curl -s -X POST http://localhost:4567/api/debug/terminal/broadcast \
    -H "Content-Type: application/json" \
    -d '{"sessionId": "test-session", "farmId": "test-farm"}' 2>/dev/null)

if echo "$BROADCAST_RESULT" | grep -q "success.*true"; then
    echo "✅ Broadcast test successful"
else
    echo "⚠️  Broadcast test failed or unavailable"
fi

echo ""
echo "================================"
echo "📝 Summary:"
echo "The terminal fix has been applied. To fully test:"
echo "1. Create a Quick Task in the UI"
echo "2. Navigate to the Harvest Terminal"
echo "3. Terminal output should appear (not 'Waiting for output...')"
echo ""
echo "If issues persist, check:"
echo "- Server logs for [TerminalStreamFix] entries"
echo "- Debug endpoint: http://localhost:4567/api/debug/terminal"
echo "- WebSocket connection in browser console"