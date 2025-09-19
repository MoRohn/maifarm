#!/bin/bash

# Simple Terminal Output Streaming Test
# This script verifies that terminal output is being streamed live

echo "🔍 Terminal Output Live Streaming Test"
echo "======================================"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
FARM_ID="test-stream-$(date +%s)"
SERVER_URL="http://localhost:4567"

echo -e "${YELLOW}Step 1: Checking server status...${NC}"
if curl -s "${SERVER_URL}/api/health" > /dev/null; then
    echo -e "${GREEN}✓ Server is running${NC}"
else
    echo -e "${RED}❌ Server is not running. Please start with: npm run dev${NC}"
    exit 1
fi

echo -e "\n${YELLOW}Step 2: Creating test farm with continuous output...${NC}"

# Create a test prompt that generates continuous output
cat > /tmp/test-stream-prompt.txt << 'EOF'
Generate continuous output by counting from 1 to 20.
For each number:
1. Print "Count: [number] at [timestamp]"
2. Wait 1 second before the next number
3. Include your agent name in each line

Start counting immediately.
EOF

echo -e "${BLUE}Test prompt created${NC}"

echo -e "\n${YELLOW}Step 3: Launching farm with 2 agents...${NC}"
cd /Users/rohnspringfield/maifarm

# Launch farm using Quick Task (5 minute timeout, perfect for testing)
RESPONSE=$(curl -s -X POST "${SERVER_URL}/api/tasks/quick" \
  -H "Content-Type: application/json" \
  -d "{
    \"prompt\": \"$(cat /tmp/test-stream-prompt.txt | tr '\n' ' ')\",
    \"agentCount\": 2,
    \"provider\": \"claude\"
  }")

FARM_ID=$(echo "$RESPONSE" | grep -o '"farmId":"[^"]*' | cut -d'"' -f4)

if [ -z "$FARM_ID" ]; then
    echo -e "${RED}❌ Failed to launch farm${NC}"
    echo "Response: $RESPONSE"
    exit 1
fi

echo -e "${GREEN}✓ Farm launched with ID: $FARM_ID${NC}"

echo -e "\n${YELLOW}Step 4: Monitoring terminal output (30 seconds)...${NC}"
echo "Expected: You should see continuous counting output from both agents"
echo "------------------------------------------------------------"

# Monitor terminal output files directly
TERMINAL_DIR="/Users/rohnspringfield/maifarm/maibarn/terminals"
START_TIME=$(date +%s)
OUTPUT_COUNT=0
LAST_SIZE=0

while [ $(($(date +%s) - START_TIME)) -lt 30 ]; do
    # Find terminal files for this farm
    TERMINAL_FILES=$(find "$TERMINAL_DIR" -name "*${FARM_ID}*" -type f 2>/dev/null)
    
    if [ -n "$TERMINAL_FILES" ]; then
        for FILE in $TERMINAL_FILES; do
            if [ -f "$FILE" ]; then
                CURRENT_SIZE=$(stat -f%z "$FILE" 2>/dev/null || stat -c%s "$FILE" 2>/dev/null)
                
                if [ "$CURRENT_SIZE" -gt "$LAST_SIZE" ]; then
                    # New content detected
                    echo -e "${GREEN}[LIVE]${NC} New output from $(basename $FILE):"
                    tail -n 5 "$FILE" | sed 's/^/  /'
                    OUTPUT_COUNT=$((OUTPUT_COUNT + 1))
                    LAST_SIZE=$CURRENT_SIZE
                fi
            fi
        done
    fi
    
    # Also check via API
    FARM_STATUS=$(curl -s "${SERVER_URL}/api/farms/${FARM_ID}/status" 2>/dev/null)
    if echo "$FARM_STATUS" | grep -q "active\|running"; then
        printf "${GREEN}.${NC}"
    else
        printf "${YELLOW}!${NC}"
    fi
    
    sleep 1
done

echo -e "\n\n${YELLOW}Step 5: Test Summary${NC}"
echo "======================================"

if [ $OUTPUT_COUNT -gt 0 ]; then
    echo -e "${GREEN}✅ SUCCESS: Terminal output is streaming live!${NC}"
    echo -e "   • Detected $OUTPUT_COUNT output updates"
    echo -e "   • Terminal files are being written in real-time"
    
    # Show final terminal content snippet
    echo -e "\n${BLUE}Sample terminal output:${NC}"
    for FILE in $TERMINAL_FILES; do
        if [ -f "$FILE" ]; then
            echo "From $(basename $FILE):"
            tail -n 10 "$FILE" | head -n 5 | sed 's/^/  /'
            echo ""
        fi
    done
else
    echo -e "${RED}❌ FAILURE: No live terminal output detected${NC}"
    echo "Possible issues:"
    echo "  • Terminal streaming service not active"
    echo "  • Agents not producing output"
    echo "  • File watching not working"
fi

# Check WebSocket streaming
echo -e "\n${YELLOW}WebSocket Streaming Check:${NC}"
WS_HEALTH=$(curl -s "${SERVER_URL}/api/websocket-health")
if echo "$WS_HEALTH" | grep -q "connected"; then
    echo -e "${GREEN}✓ WebSocket server is healthy${NC}"
else
    echo -e "${YELLOW}⚠ WebSocket may have issues${NC}"
fi

# Cleanup
echo -e "\n${YELLOW}Cleaning up test farm...${NC}"
curl -s -X POST "${SERVER_URL}/api/farms/${FARM_ID}/stop" > /dev/null
rm -f /tmp/test-stream-prompt.txt

echo -e "${GREEN}✓ Test complete${NC}"