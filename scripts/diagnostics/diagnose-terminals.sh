#!/bin/bash

# Terminal Diagnostics Script for MaiFarm
# This script checks and diagnoses terminal streaming issues

echo "🔍 MaiFarm Terminal Diagnostics"
echo "================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if backend is running
echo "1. Checking backend server..."
if curl -s http://localhost:4567/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend server is running${NC}"
else
    echo -e "${RED}❌ Backend server is NOT running${NC}"
    echo -e "${YELLOW}   Run: npm run start${NC}"
    exit 1
fi

# Check WebSocket health
echo ""
echo "2. Checking WebSocket health..."
WS_HEALTH=$(curl -s http://localhost:4567/api/websocket-health 2>/dev/null)
if [ ! -z "$WS_HEALTH" ]; then
    echo -e "${GREEN}✅ WebSocket service is active${NC}"
    echo "   $WS_HEALTH" | jq -r '.connections' 2>/dev/null | head -3
else
    echo -e "${YELLOW}⚠️  WebSocket health check failed${NC}"
fi

# Check tmux sessions
echo ""
echo "3. Checking tmux sessions..."
SESSIONS=$(TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null)
if [ ! -z "$SESSIONS" ]; then
    echo -e "${GREEN}✅ Active tmux sessions found:${NC}"
    echo "$SESSIONS" | while read -r line; do
        echo "   • $line"
    done
else
    echo -e "${YELLOW}⚠️  No tmux sessions found${NC}"
    echo "   This is normal if no farms are running"
fi

# Check active farms
echo ""
echo "4. Checking active farms..."
FARMS=$(curl -s http://localhost:4567/api/farms 2>/dev/null | jq -r '.[] | select(.status == "active" or .status == "running") | "\(.id) - \(.status)"' 2>/dev/null)
if [ ! -z "$FARMS" ]; then
    echo -e "${GREEN}✅ Active farms found:${NC}"
    echo "$FARMS" | while read -r line; do
        echo "   • $line"
    done
else
    echo -e "${YELLOW}⚠️  No active farms found${NC}"
    echo "   Launch a farm to test terminal streaming"
fi

# Check terminal sessions API
echo ""
echo "5. Checking terminal sessions API..."
TERMINAL_SESSIONS=$(curl -s http://localhost:4567/api/harvest/terminal/sessions 2>/dev/null)
if [ ! -z "$TERMINAL_SESSIONS" ]; then
    SESSION_COUNT=$(echo "$TERMINAL_SESSIONS" | jq -r '.data | length' 2>/dev/null)
    if [ "$SESSION_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✅ Terminal sessions API working (${SESSION_COUNT} sessions)${NC}"
        echo "$TERMINAL_SESSIONS" | jq -r '.data[] | "   • \(.sessionName) - \(.paneCount) panes"' 2>/dev/null | head -5
    else
        echo -e "${YELLOW}⚠️  No terminal sessions returned by API${NC}"
    fi
else
    echo -e "${RED}❌ Terminal sessions API not responding${NC}"
fi

# Check terminal streaming service
echo ""
echo "6. Checking terminal streaming service..."
DEBUG_INFO=$(curl -s http://localhost:4567/api/terminal/debug 2>/dev/null)
if [ ! -z "$DEBUG_INFO" ]; then
    STREAMING_COUNT=$(echo "$DEBUG_INFO" | jq -r '.streaming.activeStreams | length' 2>/dev/null || echo "0")
    echo -e "${GREEN}✅ Terminal debug endpoint working${NC}"
    echo "   Active streams: $STREAMING_COUNT"
else
    echo -e "${YELLOW}⚠️  Terminal debug endpoint not available${NC}"
fi

# Check for XenoSync
echo ""
echo "7. Checking XenoSync integration..."
if [ -d "/xenosync" ]; then
    echo -e "${GREEN}✅ XenoSync directory found${NC}"
else
    echo -e "${YELLOW}⚠️  XenoSync directory not found${NC}"
    echo "   XenoSync may not be configured"
fi

# Recommendations
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Diagnostic Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -z "$SESSIONS" ] && [ -z "$FARMS" ]; then
    echo -e "${YELLOW}No active farms or sessions detected.${NC}"
    echo ""
    echo "To test terminal streaming:"
    echo "1. Launch a test farm:"
    echo -e "${BLUE}   curl -X POST http://localhost:4567/api/farms \\
     -H \"Content-Type: application/json\" \\
     -d '{\"prompt\": \"Test task\", \"mode\": \"quick\"}'${NC}"
    echo ""
    echo "2. Then check the Harvest page in your browser"
elif [ -z "$SESSIONS" ] && [ ! -z "$FARMS" ]; then
    echo -e "${RED}Active farms found but no tmux sessions!${NC}"
    echo ""
    echo "This indicates a session creation problem. Try:"
    echo "1. Restart the backend:"
    echo -e "${BLUE}   npm run start${NC}"
    echo ""
    echo "2. Force recover sessions:"
    FARM_ID=$(echo "$FARMS" | head -1 | cut -d' ' -f1)
    echo -e "${BLUE}   curl -X POST http://localhost:4567/api/terminal/recover/$FARM_ID${NC}"
elif [ ! -z "$SESSIONS" ] && [ "$STREAMING_COUNT" = "0" ]; then
    echo -e "${YELLOW}Sessions exist but streaming not active.${NC}"
    echo ""
    echo "Force restart streaming:"
    echo -e "${BLUE}   curl -X POST http://localhost:4567/api/terminal/debug/restart \\
     -H \"Content-Type: application/json\" \\
     -d '{\"sessionName\": \"$(echo "$SESSIONS" | head -1 | cut -d: -f1)\"}'${NC}"
else
    echo -e "${GREEN}System appears to be working correctly!${NC}"
    echo ""
    echo "If terminals still don't appear:"
    echo "1. Check browser console for errors"
    echo "2. Ensure WebSocket connection is established"
    echo "3. Try refreshing the Harvest page"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "For more details, check:"
echo "• Server logs: npm run start (look for terminal-related messages)"
echo "• Browser console: Check for WebSocket errors"
echo "• Network tab: Look for failed API calls"
echo ""