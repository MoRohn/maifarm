#!/bin/bash

# Test Terminal Monitoring for MaiFarm
# This script tests terminal output monitoring across all three modes

set -e

echo "================================================"
echo "Terminal Monitoring Test Suite for MaiFarm"
echo "================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if terminal output is captured
check_terminal_output() {
    local session_name=$1
    local mode=$2
    
    echo -e "${YELLOW}Testing $mode mode (session: $session_name)...${NC}"
    
    # Check if session exists
    if TMUX_TMPDIR=/tmp tmux has-session -t "$session_name" 2>/dev/null; then
        echo -e "${GREEN}✓ Session exists${NC}"
        
        # Check terminal logs directory
        log_dir="maibarn/terminals/$session_name"
        if [ -d "$log_dir" ]; then
            echo -e "${GREEN}✓ Log directory exists${NC}"
            
            # Check for agent log files
            log_count=$(ls -1 "$log_dir"/agent-*.log 2>/dev/null | wc -l)
            if [ "$log_count" -gt 0 ]; then
                echo -e "${GREEN}✓ Found $log_count agent log files${NC}"
                
                # Check if logs have content
                for log_file in "$log_dir"/agent-*.log; do
                    if [ -s "$log_file" ]; then
                        lines=$(wc -l < "$log_file")
                        echo -e "${GREEN}  ✓ $(basename "$log_file"): $lines lines${NC}"
                    else
                        echo -e "${RED}  ✗ $(basename "$log_file"): Empty${NC}"
                    fi
                done
            else
                echo -e "${RED}✗ No agent log files found${NC}"
            fi
        else
            echo -e "${RED}✗ Log directory not found${NC}"
        fi
        
        # Check WebSocket health
        ws_health=$(curl -s http://localhost:4567/api/websocket-health | jq -r '.connected')
        if [ "$ws_health" = "true" ]; then
            echo -e "${GREEN}✓ WebSocket connected${NC}"
        else
            echo -e "${YELLOW}⚠ WebSocket not connected${NC}"
        fi
        
    else
        echo -e "${RED}✗ Session not found${NC}"
        return 1
    fi
    
    echo ""
}

# Main test sequence
echo "Pre-flight checks..."
echo "-------------------"

# Check if server is running
if curl -s http://localhost:4567/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Server is running${NC}"
else
    echo -e "${RED}✗ Server not running. Please start with 'npm run dev'${NC}"
    exit 1
fi

# Check tmux
if command -v tmux > /dev/null 2>&1; then
    echo -e "${GREEN}✓ tmux is installed${NC}"
else
    echo -e "${RED}✗ tmux not found${NC}"
    exit 1
fi

echo ""
echo "Running Terminal Monitoring Tests"
echo "=================================="
echo ""

# Test 1: Quick Task Mode
echo "Test 1: Quick Task Mode"
echo "-----------------------"
quick_session=$(TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null | grep -E '^quick_' | head -1 | cut -d: -f1)
if [ -n "$quick_session" ]; then
    check_terminal_output "$quick_session" "Quick Task"
else
    echo -e "${YELLOW}No Quick Task sessions found. Launch one to test.${NC}"
fi

# Test 2: Farm Mode  
echo "Test 2: Farm Mode"
echo "-----------------"
farm_session=$(TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null | grep -E '^farm-' | head -1 | cut -d: -f1)
if [ -n "$farm_session" ]; then
    check_terminal_output "$farm_session" "Farm"
else
    echo -e "${YELLOW}No Farm sessions found. Launch one to test.${NC}"
fi

# Test 3: GoWild Mode
echo "Test 3: GoWild Mode"
echo "-------------------"
gowild_session=$(TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null | grep -E '^goWild-' | head -1 | cut -d: -f1)
if [ -n "$gowild_session" ]; then
    check_terminal_output "$gowild_session" "GoWild"
else
    echo -e "${YELLOW}No GoWild sessions found. Launch one to test.${NC}"
fi

echo ""
echo "Terminal Monitoring Summary"
echo "=========================="

# Count active sessions
total_sessions=$(TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null | wc -l)
echo "Active tmux sessions: $total_sessions"

# Check terminal log directories
if [ -d "maibarn/terminals" ]; then
    terminal_dirs=$(ls -1 maibarn/terminals 2>/dev/null | wc -l)
    echo "Terminal log directories: $terminal_dirs"
    
    # Show recent activity
    echo ""
    echo "Recent terminal activity (last 5 minutes):"
    find maibarn/terminals -name "*.log" -mmin -5 2>/dev/null | while read -r logfile; do
        size=$(du -h "$logfile" | cut -f1)
        echo "  - $(basename "$(dirname "$logfile")")/$(basename "$logfile"): $size"
    done
fi

echo ""
echo "================================================"
echo "Terminal Monitoring Test Complete"
echo "================================================"