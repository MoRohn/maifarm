#!/bin/bash

# Test Session Persistence for MaiFarm
# This script validates that sessions remain active and don't get prematurely terminated

set -e

echo "================================================"
echo "Session Persistence Test Suite for MaiFarm"
echo "================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to check session status
check_session() {
    local session_name=$1
    local expected_state=$2
    
    if TMUX_TMPDIR=/tmp tmux has-session -t "$session_name" 2>/dev/null; then
        echo -e "${GREEN}✓ Session $session_name exists${NC}"
        
        # Get pane count for both window 0 and agents window
        local panes_w0=$(TMUX_TMPDIR=/tmp tmux list-panes -t "$session_name:0" 2>/dev/null | wc -l | tr -d ' ')
        local panes_agents=$(TMUX_TMPDIR=/tmp tmux list-panes -t "$session_name:agents" 2>/dev/null | wc -l | tr -d ' ')
        local total_panes=$((panes_w0 + panes_agents))
        
        echo -e "  Panes in window 0: $panes_w0"
        echo -e "  Panes in agents window: $panes_agents"
        echo -e "  Total panes: $total_panes"
        
        if [ "$expected_state" = "active" ] && [ "$total_panes" -gt 0 ]; then
            echo -e "${GREEN}✓ Session is active with $total_panes panes${NC}"
            return 0
        fi
    else
        if [ "$expected_state" = "none" ]; then
            echo -e "${GREEN}✓ Session $session_name does not exist (as expected)${NC}"
            return 0
        else
            echo -e "${RED}✗ Session $session_name not found (expected: $expected_state)${NC}"
            return 1
        fi
    fi
}

# Main test sequence
echo "Test 1: TMUX_TMPDIR Consistency"
echo "--------------------------------"
echo "Checking if sessions are visible with TMUX_TMPDIR=/tmp..."

sessions_count=$(TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null | wc -l | tr -d ' ')
echo -e "Found ${BLUE}$sessions_count${NC} sessions with TMUX_TMPDIR=/tmp"

sessions_without=$(tmux list-sessions 2>/dev/null | wc -l | tr -d ' ')
echo -e "Found ${BLUE}$sessions_without${NC} sessions without TMUX_TMPDIR"

if [ "$sessions_count" -ge "$sessions_without" ]; then
    echo -e "${GREEN}✓ TMUX_TMPDIR consistency verified${NC}"
else
    echo -e "${YELLOW}⚠ Warning: More sessions visible without TMUX_TMPDIR${NC}"
fi

echo ""
echo "Test 2: Active Farm Sessions"
echo "----------------------------"

# List all farm sessions
echo "Active farm sessions:"
TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null | grep -E '^(farm-|quick_|goWild-)' | while read -r line; do
    session_name=$(echo "$line" | cut -d: -f1)
    session_info=$(echo "$line" | cut -d: -f2-)
    echo -e "  ${BLUE}$session_name${NC}: $session_info"
    
    # Check window names
    windows=$(TMUX_TMPDIR=/tmp tmux list-windows -t "$session_name" -F '#{window_name}' 2>/dev/null | tr '\n' ' ')
    echo -e "    Windows: $windows"
done

echo ""
echo "Test 3: Grace Period Verification"
echo "----------------------------------"

# Check if any sessions are very new (created within last 30 seconds)
recent_sessions=0
TMUX_TMPDIR=/tmp tmux list-sessions -F '#{session_name}:#{session_created}' 2>/dev/null | while read -r line; do
    session_name=$(echo "$line" | cut -d: -f1)
    created_time=$(echo "$line" | cut -d: -f2)
    current_time=$(date +%s)
    age=$((current_time - created_time))
    
    if [[ "$session_name" =~ ^(farm-|quick_|goWild-) ]] && [ "$age" -lt 30 ]; then
        echo -e "${YELLOW}⚠ Session $session_name is in grace period (${age}s old)${NC}"
        recent_sessions=$((recent_sessions + 1))
    fi
done

if [ "$recent_sessions" -eq 0 ]; then
    echo -e "${GREEN}✓ No sessions currently in startup grace period${NC}"
fi

echo ""
echo "Test 4: Terminal Log Files"
echo "--------------------------"

if [ -d "maibarn/terminals" ]; then
    active_logs=$(find maibarn/terminals -name "*.log" -mmin -1 2>/dev/null | wc -l | tr -d ' ')
    echo -e "Active log files (modified in last minute): ${BLUE}$active_logs${NC}"
    
    if [ "$active_logs" -gt 0 ]; then
        echo "Recent terminal activity:"
        find maibarn/terminals -name "*.log" -mmin -1 2>/dev/null | head -5 | while read -r logfile; do
            size=$(du -h "$logfile" | cut -f1)
            lines=$(wc -l < "$logfile" | tr -d ' ')
            session_dir=$(basename "$(dirname "$logfile")")
            agent_file=$(basename "$logfile")
            echo -e "  ${BLUE}$session_dir/$agent_file${NC}: $lines lines ($size)"
        done
    fi
else
    echo -e "${YELLOW}⚠ No terminals directory found${NC}"
fi

echo ""
echo "Test 5: Health Check Status"
echo "---------------------------"

# Check server health endpoint
if curl -s http://localhost:4567/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Server health check passed${NC}"
    
    # Check WebSocket health
    ws_health=$(curl -s http://localhost:4567/api/websocket-health 2>/dev/null | jq -r '.connected' 2>/dev/null || echo "false")
    if [ "$ws_health" = "true" ]; then
        echo -e "${GREEN}✓ WebSocket connection healthy${NC}"
    else
        echo -e "${YELLOW}⚠ WebSocket not connected${NC}"
    fi
else
    echo -e "${RED}✗ Server not responding${NC}"
fi

echo ""
echo "================================================"
echo "Session Persistence Test Complete"
echo "================================================"
echo ""
echo "Summary:"
echo "- Total active sessions: $sessions_count"
echo "- Sessions with active logs: $active_logs"
echo ""
echo "If sessions are persisting correctly, they should:"
echo "1. Remain visible with TMUX_TMPDIR=/tmp"
echo "2. Not be marked as crashed during grace period"
echo "3. Have active terminal log files"
echo "4. Continue running until their configured timeout"