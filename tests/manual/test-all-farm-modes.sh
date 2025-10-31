#!/bin/bash

# Test All Farm Modes with XenoSync
# Tests Quick Task (1 agent), Harvest (3 agents), and Go Wild (5 agents) modes

set -e

echo "============================================"
echo "   Testing All Farm Modes with XenoSync"
echo "============================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Configuration
API_URL="http://localhost:4567"
TMUX_TMPDIR="/tmp"

# Test results
QUICK_TASK_RESULT="PENDING"
HARVEST_RESULT="PENDING"
GO_WILD_RESULT="PENDING"

# Helper functions
check_service() {
    if curl -sf "$API_URL/api/health" > /dev/null; then
        echo -e "${GREEN}✓${NC} API service is running"
        return 0
    else
        echo -e "${RED}✗${NC} API service not running"
        echo "Please start with: npm run dev"
        exit 1
    fi
}

test_quick_task() {
    echo -e "\n${PURPLE}=== Testing Quick Task Mode (1 Agent) ===${NC}"

    # Create Quick Task
    RESPONSE=$(curl -s -X POST "$API_URL/api/quick-actions/farm" \
        -H "Content-Type: application/json" \
        -d '{
            "prompt": "Write a simple Python function to calculate fibonacci numbers",
            "mode": "quicktask",
            "agentCount": 1,
            "timeoutMinutes": 5,
            "provider": "claude"
        }')

    FARM_ID=$(echo "$RESPONSE" | jq -r '.data.farmId // .farmId')

    if [ "$FARM_ID" != "null" ] && [ -n "$FARM_ID" ]; then
        echo -e "${GREEN}✓${NC} Quick Task created: $FARM_ID"

        # Wait for initialization (Quick Task needs more time)
        sleep 8

        # Check tmux session (Quick Task uses "quick-" prefix)
        SESSION="quick-${FARM_ID:0:8}"
        PANE_COUNT=$(TMUX_TMPDIR=$TMUX_TMPDIR tmux list-panes -t "$SESSION:0" 2>/dev/null | wc -l || echo "0")

        if [ "$PANE_COUNT" -eq "1" ]; then
            echo -e "${GREEN}✓${NC} Tmux session has 1 pane (correct for Quick Task)"

            # Check terminal log
            LOG_FILE="/Users/rohnspringfield/maifarm/var/maibarn/terminals/$FARM_ID/agent-0.log"
            if [ -f "$LOG_FILE" ]; then
                SIZE=$(stat -f%z "$LOG_FILE" 2>/dev/null || echo "0")
                if [ "$SIZE" -gt "0" ]; then
                    echo -e "${GREEN}✓${NC} Terminal log exists with $SIZE bytes"

                    # Check agents in database
                    AGENT_COUNT=$(PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -tc \
                        "SELECT COUNT(*) FROM agents WHERE farm_id='$FARM_ID';" 2>/dev/null | tr -d ' ')
                    if [ "$AGENT_COUNT" -eq "1" ]; then
                        echo -e "${GREEN}✓${NC} Agent persisted in database"
                        QUICK_TASK_RESULT="PASSED"
                    else
                        echo -e "${YELLOW}⚠${NC} Agent not in database"
                        QUICK_TASK_RESULT="PARTIAL"
                    fi
                else
                    echo -e "${YELLOW}⚠${NC} Terminal log empty"
                    QUICK_TASK_RESULT="PARTIAL"
                fi
            else
                echo -e "${RED}✗${NC} Terminal log missing"
                QUICK_TASK_RESULT="FAILED"
            fi
        else
            echo -e "${RED}✗${NC} Wrong pane count: $PANE_COUNT (expected 1)"
            QUICK_TASK_RESULT="FAILED"
        fi

        # Cleanup
        TMUX_TMPDIR=$TMUX_TMPDIR tmux kill-session -t "$SESSION" 2>/dev/null || true
        PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -c "DELETE FROM agents WHERE farm_id='$FARM_ID'; DELETE FROM farms WHERE id='$FARM_ID';" > /dev/null 2>&1
    else
        echo -e "${RED}✗${NC} Failed to create Quick Task"
        QUICK_TASK_RESULT="FAILED"
    fi
}

test_harvest() {
    echo -e "\n${PURPLE}=== Testing Harvest Mode (3 Agents with XenoSync) ===${NC}"

    # Create Harvest farm
    RESPONSE=$(curl -s -X POST "$API_URL/api/quick-actions/farm" \
        -H "Content-Type: application/json" \
        -d '{
            "name": "Test Harvest Farm",
            "prompt": "Design a sustainable water management system for urban gardens",
            "mode": "harvest",
            "agentCount": 3,
            "timeoutMinutes": 10,
            "provider": "claude",
            "useXenoSync": true
        }')

    FARM_ID=$(echo "$RESPONSE" | jq -r '.data.farmId // .farmId')

    if [ "$FARM_ID" != "null" ] && [ -n "$FARM_ID" ]; then
        echo -e "${GREEN}✓${NC} Harvest farm created: $FARM_ID"

        # Wait longer for XenoSync orchestrator to launch agents
        echo -e "${YELLOW}...${NC} Waiting for XenoSync orchestrator to launch agents..."
        sleep 12

        # Check tmux session
        SESSION="farm-${FARM_ID:0:8}"
        PANE_COUNT=$(TMUX_TMPDIR=$TMUX_TMPDIR tmux list-panes -t "$SESSION:agents" 2>/dev/null | wc -l || echo "0")

        if [ "$PANE_COUNT" -eq "3" ]; then
            echo -e "${GREEN}✓${NC} Tmux session has 3 panes (correct for Harvest)"

            # Check terminal logs
            LOGS_OK=true
            for i in 0 1 2; do
                LOG_FILE="/Users/rohnspringfield/maifarm/var/maibarn/terminals/$FARM_ID/agent-$i.log"
                if [ -f "$LOG_FILE" ]; then
                    SIZE=$(stat -f%z "$LOG_FILE" 2>/dev/null || echo "0")
                    if [ "$SIZE" -gt "0" ]; then
                        echo -e "  ${GREEN}✓${NC} Agent $i log: $SIZE bytes"
                    else
                        echo -e "  ${YELLOW}⚠${NC} Agent $i log: empty"
                        LOGS_OK=false
                    fi
                else
                    echo -e "  ${RED}✗${NC} Agent $i log: missing"
                    LOGS_OK=false
                fi
            done

            if [ "$LOGS_OK" = true ]; then
                HARVEST_RESULT="PASSED"
            else
                HARVEST_RESULT="PARTIAL"
            fi
        else
            echo -e "${RED}✗${NC} Wrong pane count: $PANE_COUNT (expected 3)"
            HARVEST_RESULT="FAILED"
        fi

        # Check agent names and count in database
        echo -e "\nChecking agents in database:"
        AGENT_COUNT=$(PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -tc \
            "SELECT COUNT(*) FROM agents WHERE farm_id='$FARM_ID';" 2>/dev/null | tr -d ' ')
        if [ "$AGENT_COUNT" -eq "3" ]; then
            echo -e "${GREEN}✓${NC} All 3 agents persisted in database"
            echo "Agent Names:"
            PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -tc \
                "SELECT pane_index, name FROM agents WHERE farm_id='$FARM_ID' ORDER BY pane_index;" | head -5
        else
            echo -e "${RED}✗${NC} Only $AGENT_COUNT agents in database (expected 3)"
        fi

        # Cleanup
        TMUX_TMPDIR=$TMUX_TMPDIR tmux kill-session -t "$SESSION" 2>/dev/null || true
        PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -c "DELETE FROM agents WHERE farm_id='$FARM_ID'; DELETE FROM farms WHERE id='$FARM_ID';" > /dev/null 2>&1
    else
        echo -e "${RED}✗${NC} Failed to create Harvest farm"
        HARVEST_RESULT="FAILED"
    fi
}

test_go_wild() {
    echo -e "\n${PURPLE}=== Testing Go Wild Mode (5 Agents) ===${NC}"

    # Create Go Wild farm
    RESPONSE=$(curl -s -X POST "$API_URL/api/quick-actions/go-wild" \
        -H "Content-Type: application/json" \
        -d '{
            "prompt": "Create an innovative smart city concept",
            "creativityLevel": 8,
            "agentCount": 5,
            "timeoutMinutes": 15
        }')

    FARM_ID=$(echo "$RESPONSE" | jq -r '.data.farmId // .farmId')

    if [ "$FARM_ID" != "null" ] && [ -n "$FARM_ID" ]; then
        echo -e "${GREEN}✓${NC} Go Wild farm created: $FARM_ID"

        # Wait for initialization
        sleep 5

        # Check tmux session (should be wild-XXX for Go Wild)
        SESSION="wild-${FARM_ID:0:8}"
        PANE_COUNT=$(TMUX_TMPDIR=$TMUX_TMPDIR tmux list-panes -t "$SESSION:agents" 2>/dev/null | wc -l || echo "0")

        # Go Wild might use farm- prefix, check that too
        if [ "$PANE_COUNT" -eq "0" ]; then
            SESSION="farm-${FARM_ID:0:8}"
            PANE_COUNT=$(TMUX_TMPDIR=$TMUX_TMPDIR tmux list-panes -t "$SESSION:agents" 2>/dev/null | wc -l || echo "0")
        fi

        if [ "$PANE_COUNT" -eq "5" ]; then
            echo -e "${GREEN}✓${NC} Tmux session has 5 panes (correct for Go Wild)"

            # Check terminal logs
            LOGS_OK=true
            for i in 0 1 2 3 4; do
                LOG_FILE="/Users/rohnspringfield/maifarm/var/maibarn/terminals/$FARM_ID/agent-$i.log"
                if [ -f "$LOG_FILE" ]; then
                    SIZE=$(stat -f%z "$LOG_FILE" 2>/dev/null || echo "0")
                    if [ "$SIZE" -gt "0" ]; then
                        echo -e "  ${GREEN}✓${NC} Agent $i log: $SIZE bytes"
                    else
                        echo -e "  ${YELLOW}⚠${NC} Agent $i log: empty"
                        LOGS_OK=false
                    fi
                else
                    echo -e "  ${RED}✗${NC} Agent $i log: missing"
                    LOGS_OK=false
                fi
            done

            if [ "$LOGS_OK" = true ]; then
                GO_WILD_RESULT="PASSED"
            else
                GO_WILD_RESULT="PARTIAL"
            fi
        else
            echo -e "${RED}✗${NC} Wrong pane count: $PANE_COUNT (expected 5)"
            GO_WILD_RESULT="FAILED"
        fi

        # Check agent names (should be creative names for Go Wild)
        echo -e "\nAgent Names:"
        PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -tc \
            "SELECT pane_index, name FROM agents WHERE farm_id='$FARM_ID' ORDER BY pane_index;" | head -6

        # Cleanup
        TMUX_TMPDIR=$TMUX_TMPDIR tmux kill-session -t "$SESSION" 2>/dev/null || true
        PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -c "DELETE FROM agents WHERE farm_id='$FARM_ID'; DELETE FROM farms WHERE id='$FARM_ID';" > /dev/null 2>&1
    else
        echo -e "${RED}✗${NC} Failed to create Go Wild farm"
        GO_WILD_RESULT="FAILED"
    fi
}

# Main test flow
main() {
    echo -e "\n${YELLOW}Checking prerequisites...${NC}"
    check_service

    # Clean up any orphaned sessions
    echo -e "\n${YELLOW}Cleaning up orphaned sessions...${NC}"
    TMUX_TMPDIR=$TMUX_TMPDIR tmux list-sessions 2>/dev/null | grep -E "farm-|quick-|wild-" | cut -d: -f1 | while read session; do
        echo "Killing orphaned session: $session"
        TMUX_TMPDIR=$TMUX_TMPDIR tmux kill-session -t "$session" 2>/dev/null || true
    done

    # Run tests
    test_quick_task
    test_harvest
    test_go_wild

    # Summary
    echo -e "\n${PURPLE}=== Test Results Summary ===${NC}"
    echo -e "Quick Task Mode: $([ "$QUICK_TASK_RESULT" = "PASSED" ] && echo -e "${GREEN}$QUICK_TASK_RESULT${NC}" || echo -e "${RED}$QUICK_TASK_RESULT${NC}")"
    echo -e "Harvest Mode:    $([ "$HARVEST_RESULT" = "PASSED" ] && echo -e "${GREEN}$HARVEST_RESULT${NC}" || echo -e "${RED}$HARVEST_RESULT${NC}")"
    echo -e "Go Wild Mode:    $([ "$GO_WILD_RESULT" = "PASSED" ] && echo -e "${GREEN}$GO_WILD_RESULT${NC}" || echo -e "${RED}$GO_WILD_RESULT${NC}")"

    if [ "$QUICK_TASK_RESULT" = "PASSED" ] && [ "$HARVEST_RESULT" = "PASSED" ] && [ "$GO_WILD_RESULT" = "PASSED" ]; then
        echo -e "\n${GREEN}✓ All farm modes are working correctly with XenoSync!${NC}"
        exit 0
    else
        echo -e "\n${YELLOW}⚠ Some tests did not pass fully. Check the output above for details.${NC}"
        exit 1
    fi
}

# Handle interrupts
trap 'echo -e "\n${RED}Test interrupted${NC}"; exit 1' INT TERM

# Run main
main