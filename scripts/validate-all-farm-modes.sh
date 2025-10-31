#!/bin/bash

# Validate All Farm Modes
# Comprehensive testing for Harvest, Quick Task, and Go Wild modes
# Ensures terminal streaming, agent counts, and monitoring work correctly

set -e

echo "============================================"
echo "   MaiFarm Mode Validation Suite"
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
TERMINAL_BASE="/Users/rohnspringfield/maifarm/var/maibarn/terminals"

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0
FARM_IDS=()

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
    ((TESTS_PASSED++))
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
    ((TESTS_FAILED++))
}

log_warning() {
    echo -e "${YELLOW}[⚠]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    echo -e "\n${PURPLE}=== Checking Prerequisites ===${NC}"

    # Check API service
    if curl -sf "$API_URL/api/health" > /dev/null; then
        log_success "API service is running"
    else
        log_error "API service not running. Start with: npm run dev"
        exit 1
    fi

    # Check database
    if PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -c "SELECT 1" > /dev/null 2>&1; then
        log_success "Database connection successful"
    else
        log_error "Database connection failed"
        exit 1
    fi

    # Check WebSocket
    WS_HEALTH=$(curl -s "$API_URL/api/websocket-health")
    if [ "$(echo $WS_HEALTH | jq -r '.connected')" == "true" ]; then
        log_success "WebSocket server is running"
    else
        log_warning "WebSocket server may have issues"
    fi
}

# Test Harvest Mode
test_harvest_mode() {
    echo -e "\n${PURPLE}=== Testing Harvest Mode (3 Agents) ===${NC}"

    log_info "Creating Harvest farm..."

    RESPONSE=$(curl -s -X POST "$API_URL/api/farms/create" \
        -H "Content-Type: application/json" \
        -d '{
            "name": "Test Harvest Farm",
            "prompt": "Design a sustainable vertical farming system",
            "mode": "harvest",
            "agentCount": 3,
            "timeout": 300,
            "provider": "claude"
        }')

    FARM_ID=$(echo $RESPONSE | jq -r '.farmId')

    if [ "$FARM_ID" == "null" ] || [ -z "$FARM_ID" ]; then
        log_error "Failed to create Harvest farm"
        return 1
    fi

    FARM_IDS+=("$FARM_ID")
    log_success "Harvest farm created: $FARM_ID"

    # Wait for initialization
    sleep 5

    # Validate farm components
    validate_farm "$FARM_ID" "harvest" 3
}

# Test Quick Task Mode
test_quick_task_mode() {
    echo -e "\n${PURPLE}=== Testing Quick Task Mode (1 Agent) ===${NC}"

    log_info "Creating Quick Task..."

    RESPONSE=$(curl -s -X POST "$API_URL/api/farms/quicktask" \
        -H "Content-Type: application/json" \
        -d '{
            "prompt": "Write a simple Python script for data analysis"
        }')

    FARM_ID=$(echo $RESPONSE | jq -r '.farmId')

    if [ "$FARM_ID" == "null" ] || [ -z "$FARM_ID" ]; then
        log_error "Failed to create Quick Task"
        return 1
    fi

    FARM_IDS+=("$FARM_ID")
    log_success "Quick Task created: $FARM_ID"

    # Wait for initialization
    sleep 3

    # Validate farm components
    validate_farm "$FARM_ID" "quicktask" 1
}

# Test Go Wild Mode
test_gowild_mode() {
    echo -e "\n${PURPLE}=== Testing Go Wild Mode (5 Agents) ===${NC}"

    log_info "Creating Go Wild farm..."

    RESPONSE=$(curl -s -X POST "$API_URL/api/farms/gowild" \
        -H "Content-Type: application/json" \
        -d '{
            "prompt": "Create an innovative AI-powered agricultural ecosystem",
            "creativityLevel": 8,
            "agentCount": 5,
            "timeout": 600
        }')

    FARM_ID=$(echo $RESPONSE | jq -r '.farmId')

    if [ "$FARM_ID" == "null" ] || [ -z "$FARM_ID" ]; then
        log_error "Failed to create Go Wild farm"
        return 1
    fi

    FARM_IDS+=("$FARM_ID")
    log_success "Go Wild farm created: $FARM_ID"

    # Wait for initialization
    sleep 5

    # Validate farm components
    validate_farm "$FARM_ID" "gowild" 5
}

# Validate farm components
validate_farm() {
    local FARM_ID=$1
    local MODE=$2
    local EXPECTED_AGENTS=$3

    log_info "Validating $MODE farm $FARM_ID..."

    # Check tmux session
    local SESSION_NAME="farm-${FARM_ID:0:8}"

    if [ "$MODE" == "quicktask" ]; then
        SESSION_NAME="quick-${FARM_ID:0:8}"
    elif [ "$MODE" == "gowild" ]; then
        SESSION_NAME="wild-${FARM_ID:0:8}"
    fi

    if env TMUX_TMPDIR="$TMUX_TMPDIR" tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        log_success "Tmux session exists: $SESSION_NAME"

        # Check window name
        local WINDOW="agents"
        if [ "$MODE" == "quicktask" ]; then
            WINDOW="0"
        fi

        # Count panes
        local PANE_COUNT=$(env TMUX_TMPDIR="$TMUX_TMPDIR" tmux list-panes -t "$SESSION_NAME:$WINDOW" 2>/dev/null | wc -l | tr -d ' ')

        if [ "$PANE_COUNT" -eq "$EXPECTED_AGENTS" ]; then
            log_success "Correct pane count: $PANE_COUNT"
        else
            log_error "Incorrect pane count: $PANE_COUNT (expected $EXPECTED_AGENTS)"
        fi

        # Check each pane
        for ((i=0; i<$EXPECTED_AGENTS; i++)); do
            if env TMUX_TMPDIR="$TMUX_TMPDIR" tmux list-panes -t "$SESSION_NAME:$WINDOW.$i" > /dev/null 2>&1; then
                echo -e "  ${GREEN}✓${NC} Pane $i exists"
            else
                echo -e "  ${RED}✗${NC} Pane $i missing"
            fi
        done
    else
        log_error "Tmux session not found: $SESSION_NAME"
    fi

    # Check terminal logs
    local TERMINAL_DIR="$TERMINAL_BASE/$FARM_ID"

    if [ -d "$TERMINAL_DIR" ]; then
        log_success "Terminal directory exists"

        local LOGS_WITH_CONTENT=0
        for ((i=0; i<$EXPECTED_AGENTS; i++)); do
            local LOG_FILE="$TERMINAL_DIR/agent-$i.log"
            if [ -f "$LOG_FILE" ]; then
                local SIZE=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo "0")
                if [ "$SIZE" -gt 0 ]; then
                    echo -e "  ${GREEN}✓${NC} Agent $i log: ${SIZE} bytes"
                    ((LOGS_WITH_CONTENT++))
                else
                    echo -e "  ${YELLOW}⚠${NC} Agent $i log: empty"
                fi
            else
                echo -e "  ${RED}✗${NC} Agent $i log: missing"
            fi
        done

        if [ "$LOGS_WITH_CONTENT" -eq "$EXPECTED_AGENTS" ]; then
            log_success "All agent logs have content"
        elif [ "$LOGS_WITH_CONTENT" -gt 0 ]; then
            log_warning "Only $LOGS_WITH_CONTENT/$EXPECTED_AGENTS logs have content"
        else
            log_error "No logs have content"
        fi
    else
        log_error "Terminal directory not found"
    fi

    # Check database state
    local DB_STATUS=$(PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -tc \
        "SELECT status FROM farms WHERE id = '$FARM_ID';" | xargs)

    if [ -n "$DB_STATUS" ]; then
        log_success "Farm in database with status: $DB_STATUS"
    else
        log_error "Farm not found in database"
    fi

    # Check agent count in database
    local DB_AGENT_COUNT=$(PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -tc \
        "SELECT COUNT(*) FROM agents WHERE farm_id = '$FARM_ID';" | xargs)

    if [ "$DB_AGENT_COUNT" -eq "$EXPECTED_AGENTS" ]; then
        log_success "Correct agent count in database: $DB_AGENT_COUNT"
    else
        log_error "Incorrect agent count in database: $DB_AGENT_COUNT (expected $EXPECTED_AGENTS)"
    fi

    # Check agent names
    echo -e "\n  Agent Names:"
    PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -c \
        "SELECT pane_index, name, status FROM agents WHERE farm_id = '$FARM_ID' ORDER BY pane_index;" 2>/dev/null | sed 's/^/    /'
}

# Test concurrent farms
test_concurrent_farms() {
    echo -e "\n${PURPLE}=== Testing Concurrent Farms ===${NC}"

    log_info "Creating 2 concurrent farms..."

    # Create first farm
    RESPONSE1=$(curl -s -X POST "$API_URL/api/farms/create" \
        -H "Content-Type: application/json" \
        -d '{
            "name": "Concurrent Farm 1",
            "prompt": "Design a hydroponic system",
            "mode": "harvest",
            "agentCount": 2,
            "timeout": 300,
            "provider": "claude"
        }')

    FARM1_ID=$(echo $RESPONSE1 | jq -r '.farmId')

    # Create second farm immediately
    RESPONSE2=$(curl -s -X POST "$API_URL/api/farms/create" \
        -H "Content-Type: application/json" \
        -d '{
            "name": "Concurrent Farm 2",
            "prompt": "Design an aquaponics system",
            "mode": "harvest",
            "agentCount": 2,
            "timeout": 300,
            "provider": "claude"
        }')

    FARM2_ID=$(echo $RESPONSE2 | jq -r '.farmId')

    if [ "$FARM1_ID" != "null" ] && [ "$FARM2_ID" != "null" ]; then
        log_success "Created 2 concurrent farms"
        FARM_IDS+=("$FARM1_ID")
        FARM_IDS+=("$FARM2_ID")

        # Wait for initialization
        sleep 5

        # Check both are running
        validate_farm "$FARM1_ID" "harvest" 2
        validate_farm "$FARM2_ID" "harvest" 2
    else
        log_error "Failed to create concurrent farms"
    fi
}

# Monitor activity
monitor_activity() {
    echo -e "\n${PURPLE}=== Monitoring Activity (15 seconds) ===${NC}"

    for i in {1..3}; do
        sleep 5
        log_info "Checking activity..."

        for FARM_ID in "${FARM_IDS[@]}"; do
            local TERMINAL_DIR="$TERMINAL_BASE/$FARM_ID"
            if [ -d "$TERMINAL_DIR" ]; then
                local TOTAL_SIZE=0
                for LOG in "$TERMINAL_DIR"/*.log; do
                    if [ -f "$LOG" ]; then
                        local SIZE=$(stat -f%z "$LOG" 2>/dev/null || stat -c%s "$LOG" 2>/dev/null || echo "0")
                        TOTAL_SIZE=$((TOTAL_SIZE + SIZE))
                    fi
                done
                echo -e "  Farm ${FARM_ID:0:8}: ${TOTAL_SIZE} bytes total output"
            fi
        done
    done
}

# Cleanup farms
cleanup_farms() {
    echo -e "\n${PURPLE}=== Cleanup ===${NC}"

    for FARM_ID in "${FARM_IDS[@]}"; do
        log_info "Cleaning up farm $FARM_ID..."

        # Stop via API
        curl -s -X POST "$API_URL/api/farms/$FARM_ID/stop" > /dev/null

        # Kill tmux sessions
        for PREFIX in "farm" "quick" "wild"; do
            SESSION_NAME="$PREFIX-${FARM_ID:0:8}"
            env TMUX_TMPDIR="$TMUX_TMPDIR" tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
        done

        # Clean database
        PGPASSWORD=maifarm123 /opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -c \
            "DELETE FROM agents WHERE farm_id = '$FARM_ID'; DELETE FROM farms WHERE id = '$FARM_ID';" > /dev/null 2>&1
    done

    log_success "Cleanup complete"
}

# Main test flow
main() {
    clear
    echo -e "${BLUE}Starting comprehensive farm mode validation...${NC}\n"

    # Run tests
    check_prerequisites

    test_harvest_mode
    test_quick_task_mode
    test_gowild_mode
    test_concurrent_farms

    monitor_activity

    # Results summary
    echo -e "\n${PURPLE}=== Test Results ===${NC}"
    echo -e "${GREEN}Passed:${NC} $TESTS_PASSED"
    echo -e "${RED}Failed:${NC} $TESTS_FAILED"

    if [ "$TESTS_FAILED" -eq 0 ]; then
        echo -e "\n${GREEN}✓ All tests passed! The platform is working optimally.${NC}"
    else
        echo -e "\n${RED}✗ Some tests failed. Review the output above.${NC}"
    fi

    # Cleanup
    echo ""
    read -p "Clean up test farms? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cleanup_farms
    fi

    exit $TESTS_FAILED
}

# Handle interrupts
trap 'echo -e "\n${RED}Test interrupted. Cleaning up...${NC}"; cleanup_farms; exit 1' INT TERM

# Run main
main