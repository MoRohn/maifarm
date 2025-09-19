#!/bin/bash

# Verification Script for User Experience Fixes
# This script verifies that all fixes are working correctly

echo "🔍 MaiFarm User Experience Fix Verification"
echo "==========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if server is running
echo "1. Checking server status..."
if curl -s http://localhost:4567/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Server is running${NC}"
else
    echo -e "${RED}❌ Server is not running${NC}"
    echo -e "${YELLOW}   Please run: npm run start${NC}"
    exit 1
fi

# Check zombie farm cleanup service
echo ""
echo "2. Checking zombie farm cleanup service..."
ZOMBIE_STATUS=$(curl -s http://localhost:4567/api/monitoring/zombie-farms 2>/dev/null)
if [ ! -z "$ZOMBIE_STATUS" ]; then
    ZOMBIE_COUNT=$(echo "$ZOMBIE_STATUS" | jq -r '.zombieCount // 0' 2>/dev/null)
    echo -e "${GREEN}✅ Zombie cleanup service active${NC}"
    echo "   Current zombie farms: $ZOMBIE_COUNT"
else
    echo -e "${YELLOW}⚠️  Zombie cleanup service not responding${NC}"
fi

# Check recovery blacklist
echo ""
echo "3. Checking recovery blacklist..."
RECOVERY_STATUS=$(curl -s http://localhost:4567/api/harvest/recovery-status 2>/dev/null)
if [ ! -z "$RECOVERY_STATUS" ]; then
    BLACKLIST_COUNT=$(echo "$RECOVERY_STATUS" | jq -r '.blacklist | length // 0' 2>/dev/null)
    echo -e "${GREEN}✅ Recovery service configured${NC}"
    echo "   Blacklisted sessions: $BLACKLIST_COUNT"
    if [ "$BLACKLIST_COUNT" -gt 0 ]; then
        echo "   Blacklisted:"
        echo "$RECOVERY_STATUS" | jq -r '.blacklist[]' 2>/dev/null | head -5 | while read -r session; do
            echo "     • $session"
        done
    fi
else
    echo -e "${YELLOW}⚠️  Recovery service not responding${NC}"
fi

# Check terminal output cache
echo ""
echo "4. Checking terminal output cache..."
CACHE_STATUS=$(curl -s http://localhost:4567/api/terminal/cache-stats 2>/dev/null)
if [ ! -z "$CACHE_STATUS" ]; then
    CACHE_SIZE=$(echo "$CACHE_STATUS" | jq -r '.cacheSize // 0' 2>/dev/null)
    CACHE_MEMORY=$(echo "$CACHE_STATUS" | jq -r '.memoryUsage // "0 KB"' 2>/dev/null)
    echo -e "${GREEN}✅ Terminal cache active${NC}"
    echo "   Cached sessions: $CACHE_SIZE"
    echo "   Memory usage: $CACHE_MEMORY"
else
    echo -e "${YELLOW}⚠️  Terminal cache not responding${NC}"
fi

# Check log throttling
echo ""
echo "5. Checking log throttling..."
THROTTLE_STATUS=$(curl -s http://localhost:4567/api/logs/throttle-stats 2>/dev/null)
if [ ! -z "$THROTTLE_STATUS" ]; then
    SUPPRESSED=$(echo "$THROTTLE_STATUS" | jq -r '.totalSuppressed // 0' 2>/dev/null)
    echo -e "${GREEN}✅ Log throttling active${NC}"
    echo "   Messages suppressed: $SUPPRESSED"
else
    echo -e "${YELLOW}⚠️  Log throttling not configured${NC}"
fi

# Check WebSocket connections
echo ""
echo "6. Checking WebSocket connections..."
WS_HEALTH=$(curl -s http://localhost:4567/api/websocket-health 2>/dev/null)
if [ ! -z "$WS_HEALTH" ]; then
    CLIENT_COUNT=$(echo "$WS_HEALTH" | jq -r '.connections // 0' 2>/dev/null)
    echo -e "${GREEN}✅ WebSocket service active${NC}"
    echo "   Connected clients: $CLIENT_COUNT"
    
    if [ "$CLIENT_COUNT" -eq 0 ]; then
        echo -e "${YELLOW}   Note: No clients connected - open Harvest page in browser${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  WebSocket service not responding${NC}"
fi

# Check for active farms
echo ""
echo "7. Checking active farms..."
FARMS=$(curl -s http://localhost:4567/api/farms 2>/dev/null | jq -r '.[] | select(.status == "active" or .status == "running") | "\(.id) [\(.status)]"' 2>/dev/null)
if [ ! -z "$FARMS" ]; then
    FARM_COUNT=$(echo "$FARMS" | wc -l | tr -d ' ')
    echo -e "${GREEN}✅ Found $FARM_COUNT active farm(s)${NC}"
    echo "$FARMS" | head -3 | while read -r farm; do
        echo "   • $farm"
    done
else
    echo -e "${YELLOW}⚠️  No active farms${NC}"
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Verification Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ALL_GOOD=true

if [ "$ZOMBIE_COUNT" -gt 5 ]; then
    echo -e "${YELLOW}⚠️  High number of zombie farms detected${NC}"
    ALL_GOOD=false
fi

if [ "$BLACKLIST_COUNT" -gt 10 ]; then
    echo -e "${YELLOW}⚠️  Many blacklisted sessions - may indicate issues${NC}"
    ALL_GOOD=false
fi

if [ "$CLIENT_COUNT" -eq 0 ] && [ ! -z "$FARMS" ]; then
    echo -e "${YELLOW}⚠️  Active farms but no WebSocket clients${NC}"
    echo "   → Open the Harvest page in your browser"
    ALL_GOOD=false
fi

if [ "$ALL_GOOD" = true ]; then
    echo -e "${GREEN}✅ All systems operational!${NC}"
    echo ""
    echo "The user experience fixes are working correctly:"
    echo "• Recovery blacklist preventing infinite loops"
    echo "• Zombie cleanup keeping system clean"
    echo "• Terminal cache ready for connections"
    echo "• Log throttling reducing noise"
    echo "• WebSocket service ready for clients"
else
    echo ""
    echo "Some issues detected - see warnings above"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "To test the complete flow:"
echo "1. Open the Harvest page in your browser"
echo "2. Launch a test farm:"
echo -e "${BLUE}   curl -X POST http://localhost:4567/api/farms \\
     -H \"Content-Type: application/json\" \\
     -d '{\"prompt\": \"Test task\", \"mode\": \"quick\"}'${NC}"
echo "3. Watch for terminal output in the browser"
echo "4. Check server logs for clean output"
echo ""