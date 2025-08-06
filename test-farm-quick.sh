#!/bin/bash

# Quick test script for MaiFarm farm creation
# This script tests the farm creation without requiring the full setup

echo "=== MaiFarm Quick Farm Test ==="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:4567}"
BYPASS_AUTH="${BYPASS_AUTH:-true}"

# Check if server is running
echo -e "${BLUE}Checking if server is running at $API_URL...${NC}"
if curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/health" | grep -q "200"; then
    echo -e "${GREEN}✓ Server is running${NC}"
else
    echo -e "${RED}✗ Server is not responding. Starting server...${NC}"
    
    # Try to start the server in the background
    if [ -f "package.json" ]; then
        echo -e "${YELLOW}Starting development server...${NC}"
        BYPASS_AUTH=true npm run dev:server > /tmp/maifarm-server.log 2>&1 &
        SERVER_PID=$!
        echo "Server PID: $SERVER_PID"
        
        # Wait for server to start
        echo -n "Waiting for server to start"
        for i in {1..30}; do
            if curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/health" | grep -q "200"; then
                echo -e "\n${GREEN}✓ Server started successfully${NC}"
                break
            fi
            echo -n "."
            sleep 1
        done
        echo ""
    else
        echo -e "${RED}Cannot find package.json. Please run from the MaiFarm project root.${NC}"
        exit 1
    fi
fi

# Create a simple test farm using curl
echo ""
echo -e "${BLUE}Creating test farm...${NC}"

# Create farm JSON payload
FARM_JSON=$(cat <<EOF
{
  "name": "Quick Test Farm",
  "description": "Quick test to verify farm creation",
  "type": "sequential",
  "config": {
    "maxAgents": 1,
    "timeout": 60,
    "prompt": "This is a quick test. List the current directory and exit.",
    "autoScale": false
  },
  "tags": ["test", "quick"]
}
EOF
)

# Send request to create farm
RESPONSE=$(curl -s -X POST "$API_URL/api/farms" \
  -H "Content-Type: application/json" \
  -d "$FARM_JSON")

# Check if farm was created
if echo "$RESPONSE" | grep -q '"success":true'; then
    FARM_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*' | grep -o '[^"]*$' | head -1)
    echo -e "${GREEN}✓ Farm created successfully${NC}"
    echo -e "  Farm ID: ${YELLOW}$FARM_ID${NC}"
    
    # Try to get farm status
    echo ""
    echo -e "${BLUE}Checking farm status...${NC}"
    STATUS_RESPONSE=$(curl -s "$API_URL/api/farms/$FARM_ID")
    
    if echo "$STATUS_RESPONSE" | grep -q '"success":true'; then
        FARM_STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"status":"[^"]*' | grep -o '[^"]*$' | head -1)
        echo -e "${GREEN}✓ Farm status: $FARM_STATUS${NC}"
    else
        echo -e "${YELLOW}⚠ Could not retrieve farm status${NC}"
    fi
    
    # Monitor for a few seconds using WebSocket (if wscat is available)
    if command -v wscat &> /dev/null; then
        echo ""
        echo -e "${BLUE}Monitoring farm via WebSocket (5 seconds)...${NC}"
        timeout 5 wscat -c "ws://localhost:4567" -x "{\"type\":\"subscribe\",\"farmId\":\"$FARM_ID\"}" || true
    else
        echo ""
        echo -e "${YELLOW}wscat not installed. Skipping WebSocket monitoring.${NC}"
        echo "Install with: npm install -g wscat"
    fi
    
else
    echo -e "${RED}✗ Failed to create farm${NC}"
    echo "Response: $RESPONSE"
    exit 1
fi

echo ""
echo -e "${GREEN}=== Test Complete ===${NC}"

# Cleanup: Kill server if we started it
if [ ! -z "$SERVER_PID" ]; then
    echo ""
    echo -e "${YELLOW}Stopping test server (PID: $SERVER_PID)...${NC}"
    kill $SERVER_PID 2>/dev/null || true
fi

exit 0