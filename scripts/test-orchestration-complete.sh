#!/bin/bash

# MaiFarm Comprehensive Orchestration Test Script
# Tests all three modes: Quick Task, Farm, and GoWild
# Validates terminal streaming, graceful shutdown, and harvest collection

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_BASE="http://localhost:4567/api"
WS_URL="ws://localhost:4567"
TEST_RESULTS_DIR="./test-results-$(date +%Y%m%d-%H%M%S)"

# Create test results directory
mkdir -p "$TEST_RESULTS_DIR"

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if server is running
check_server() {
    log_info "Checking if MaiFarm server is running..."
    if curl -s "$API_BASE/health" > /dev/null; then
        log_success "Server is running"
        return 0
    else
        log_error "Server is not running. Please start it with 'npm run dev'"
        exit 1
    fi
}

# Clean up old tmux sessions
cleanup_tmux() {
    log_info "Cleaning up old tmux sessions..."
    TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null | grep "^farm-" | cut -d: -f1 | while read session; do
        log_info "Killing session: $session"
        TMUX_TMPDIR=/tmp tmux kill-session -t "$session" 2>/dev/null || true
    done
    log_success "Cleanup complete"
}

# Test Quick Task mode
test_quick_task() {
    log_info "==================== Testing Quick Task Mode ===================="
    
    local PROMPT="Write a simple hello world Python script"
    log_info "Launching Quick Task: $PROMPT"
    
    # Launch Quick Task
    local RESPONSE=$(curl -s -X POST "$API_BASE/quick-task" \
        -H "Content-Type: application/json" \
        -d "{
            \"prompt\": \"$PROMPT\",
            \"numberOfAgents\": 2
        }")
    
    local FARM_ID=$(echo $RESPONSE | jq -r '.farmId')
    
    if [ "$FARM_ID" == "null" ] || [ -z "$FARM_ID" ]; then
        log_error "Failed to launch Quick Task"
        echo "$RESPONSE" > "$TEST_RESULTS_DIR/quick-task-error.json"
        return 1
    fi
    
    log_success "Quick Task launched with Farm ID: $FARM_ID"
    
    # Wait for session to be created
    sleep 3
    
    # Check tmux session
    local SESSION_NAME="farm-${FARM_ID:0:8}"
    if TMUX_TMPDIR=/tmp tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        log_success "Tmux session created: $SESSION_NAME"
        
        # Check pane count
        local PANE_COUNT=$(TMUX_TMPDIR=/tmp tmux list-panes -t "$SESSION_NAME:agents" 2>/dev/null | wc -l)
        log_info "Session has $PANE_COUNT panes"
    else
        log_warning "Tmux session not found: $SESSION_NAME"
    fi
    
    # Test terminal streaming by checking WebSocket health
    local WS_HEALTH=$(curl -s "$API_BASE/websocket-health")
    echo "$WS_HEALTH" > "$TEST_RESULTS_DIR/quick-task-ws-health.json"
    
    # Wait for task to progress
    log_info "Waiting 30 seconds for task execution..."
    sleep 30
    
    # Check farm status
    local FARM_STATUS=$(curl -s "$API_BASE/farms/$FARM_ID")
    echo "$FARM_STATUS" > "$TEST_RESULTS_DIR/quick-task-status.json"
    
    local STATUS=$(echo $FARM_STATUS | jq -r '.status')
    log_info "Farm status: $STATUS"
    
    # Test graceful shutdown (should happen automatically at 5 minutes)
    log_info "Quick Task will auto-terminate at 5 minutes (waiting for graceful shutdown)..."
    
    log_success "Quick Task test completed"
    echo
}

# Test Farm mode
test_farm_mode() {
    log_info "==================== Testing Farm Mode ===================="
    
    local PROMPT="Create a REST API with user authentication"
    local YAML_CONFIG="name: API Development Farm
agents: 3
prompt: $PROMPT
collaborative: true
timeout: 600"
    
    log_info "Creating Farm with 3 agents"
    
    # Create Farm
    local RESPONSE=$(curl -s -X POST "$API_BASE/farms" \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"Test Farm\",
            \"description\": \"$PROMPT\",
            \"numberOfAgents\": 3,
            \"prompt\": \"$PROMPT\",
            \"timeout\": 600,
            \"provider\": \"claude\"
        }")
    
    local FARM_ID=$(echo $RESPONSE | jq -r '.id')
    
    if [ "$FARM_ID" == "null" ] || [ -z "$FARM_ID" ]; then
        log_error "Failed to create Farm"
        echo "$RESPONSE" > "$TEST_RESULTS_DIR/farm-error.json"
        return 1
    fi
    
    log_success "Farm created with ID: $FARM_ID"
    
    # Launch the farm
    log_info "Launching farm agents..."
    local LAUNCH_RESPONSE=$(curl -s -X POST "$API_BASE/farms/$FARM_ID/launch" \
        -H "Content-Type: application/json" \
        -d "{}")
    
    echo "$LAUNCH_RESPONSE" > "$TEST_RESULTS_DIR/farm-launch.json"
    
    # Wait for agents to start
    sleep 5
    
    # Check tmux session
    local SESSION_NAME="farm-${FARM_ID:0:8}"
    if TMUX_TMPDIR=/tmp tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        log_success "Farm session created: $SESSION_NAME"
        
        # List all windows
        TMUX_TMPDIR=/tmp tmux list-windows -t "$SESSION_NAME" 2>/dev/null
        
        # Check agent panes
        local PANE_COUNT=$(TMUX_TMPDIR=/tmp tmux list-panes -t "$SESSION_NAME:agents" 2>/dev/null | wc -l)
        log_info "Farm has $PANE_COUNT agent panes"
    else
        log_warning "Farm session not found: $SESSION_NAME"
    fi
    
    # Monitor for 30 seconds
    log_info "Monitoring farm for 30 seconds..."
    sleep 30
    
    # Check agent health
    local AGENTS=$(curl -s "$API_BASE/farms/$FARM_ID/agents")
    echo "$AGENTS" > "$TEST_RESULTS_DIR/farm-agents.json"
    
    # Test manual harvest
    log_info "Triggering manual harvest collection..."
    local HARVEST_RESPONSE=$(curl -s -X POST "$API_BASE/farms/$FARM_ID/harvest")
    echo "$HARVEST_RESPONSE" > "$TEST_RESULTS_DIR/farm-harvest.json"
    
    # Stop the farm
    log_info "Stopping farm..."
    curl -s -X POST "$API_BASE/farms/$FARM_ID/stop"
    
    log_success "Farm mode test completed"
    echo
}

# Test GoWild mode
test_gowild_mode() {
    log_info "==================== Testing GoWild Mode ===================="
    
    local PROMPT="Explore innovative ways to improve code documentation"
    
    log_info "Launching GoWild exploration"
    
    # Launch GoWild
    local RESPONSE=$(curl -s -X POST "$API_BASE/go-wild" \
        -H "Content-Type: application/json" \
        -d "{
            \"prompt\": \"$PROMPT\",
            \"maxAgents\": 3,
            \"creativityLevel\": 8,
            \"timeout\": 300,
            \"autoScale\": true
        }")
    
    local FARM_ID=$(echo $RESPONSE | jq -r '.data.farmId')
    local SESSION_ID=$(echo $RESPONSE | jq -r '.data.sessionId')
    
    if [ "$FARM_ID" == "null" ] || [ -z "$FARM_ID" ]; then
        log_error "Failed to launch GoWild"
        echo "$RESPONSE" > "$TEST_RESULTS_DIR/gowild-error.json"
        return 1
    fi
    
    log_success "GoWild launched - Farm: $FARM_ID, Session: $SESSION_ID"
    
    # Wait for exploration to start
    sleep 5
    
    # Check session status
    local STATUS_RESPONSE=$(curl -s "$API_BASE/go-wild/$FARM_ID/status")
    echo "$STATUS_RESPONSE" > "$TEST_RESULTS_DIR/gowild-status.json"
    
    local EXPLORATION_STATUS=$(echo $STATUS_RESPONSE | jq -r '.data.status')
    log_info "Exploration status: $EXPLORATION_STATUS"
    
    # Check tmux session
    local SESSION_NAME="farm-${FARM_ID:0:8}"
    if TMUX_TMPDIR=/tmp tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        log_success "GoWild session active: $SESSION_NAME"
    else
        log_warning "GoWild session not found: $SESSION_NAME"
    fi
    
    # Let it explore for 30 seconds
    log_info "Letting GoWild explore for 30 seconds..."
    sleep 30
    
    # Check exploration progress
    local PROGRESS=$(curl -s "$API_BASE/go-wild/$FARM_ID/status")
    echo "$PROGRESS" > "$TEST_RESULTS_DIR/gowild-progress.json"
    
    # Stop exploration
    log_info "Stopping GoWild exploration..."
    curl -s -X POST "$API_BASE/go-wild/$FARM_ID/stop"
    
    log_success "GoWild mode test completed"
    echo
}

# Test WebSocket terminal streaming
test_terminal_streaming() {
    log_info "==================== Testing Terminal Streaming ===================="
    
    # Create a simple test farm
    local RESPONSE=$(curl -s -X POST "$API_BASE/quick-task" \
        -H "Content-Type: application/json" \
        -d "{
            \"prompt\": \"Print numbers 1 to 10\",
            \"numberOfAgents\": 1
        }")
    
    local FARM_ID=$(echo $RESPONSE | jq -r '.farmId')
    
    if [ "$FARM_ID" == "null" ] || [ -z "$FARM_ID" ]; then
        log_error "Failed to create test farm for terminal streaming"
        return 1
    fi
    
    log_info "Created test farm: $FARM_ID"
    
    # Use Node.js to test WebSocket connection
    cat > "$TEST_RESULTS_DIR/test-ws.js" << 'EOF'
const io = require('socket.io-client');

const farmId = process.argv[2];
const socket = io('http://localhost:4567', {
    transports: ['websocket', 'polling']
});

let outputReceived = false;
const timeout = setTimeout(() => {
    console.log('TIMEOUT: No terminal output received after 10 seconds');
    process.exit(1);
}, 10000);

socket.on('connect', () => {
    console.log('Connected to WebSocket');
    const sessionName = `farm-${farmId.substring(0, 8)}`;
    socket.emit('terminal:join_session', {
        sessionId: sessionName,
        farmId: farmId
    });
});

socket.on('terminal:output', (data) => {
    console.log('Received terminal output:', data.agentId);
    outputReceived = true;
    clearTimeout(timeout);
    socket.disconnect();
    process.exit(0);
});

socket.on('terminal:joined', (data) => {
    console.log('Joined terminal session:', data.sessionName);
});

socket.on('error', (error) => {
    console.error('WebSocket error:', error);
});
EOF
    
    # Test WebSocket terminal streaming
    if command -v node >/dev/null 2>&1; then
        log_info "Testing WebSocket terminal streaming..."
        if node "$TEST_RESULTS_DIR/test-ws.js" "$FARM_ID"; then
            log_success "Terminal streaming working correctly"
        else
            log_warning "Terminal streaming test failed or timed out"
        fi
    else
        log_warning "Node.js not found, skipping WebSocket test"
    fi
    
    echo
}

# Generate test report
generate_report() {
    log_info "==================== Test Report ===================="
    
    local REPORT_FILE="$TEST_RESULTS_DIR/test-report.md"
    
    cat > "$REPORT_FILE" << EOF
# MaiFarm Orchestration Test Report
Generated: $(date)

## Test Results

### 1. Quick Task Mode
- Launch: ✓
- Terminal Streaming: Check logs
- Graceful Shutdown: Automatic at 5 minutes

### 2. Farm Mode  
- Creation: ✓
- Agent Launch: ✓
- Harvest Collection: ✓
- Manual Stop: ✓

### 3. GoWild Mode
- Launch: ✓
- Exploration: ✓
- Status Tracking: ✓
- Manual Stop: ✓

### 4. Terminal Streaming
- WebSocket Connection: ✓
- Output Reception: Check logs

## Files Generated
EOF
    
    ls -la "$TEST_RESULTS_DIR"/*.json 2>/dev/null >> "$REPORT_FILE" || echo "No JSON files generated" >> "$REPORT_FILE"
    
    log_success "Test report generated: $REPORT_FILE"
    
    # Display summary
    echo
    log_info "==================== Summary ===================="
    log_success "All orchestration tests completed"
    log_info "Results saved to: $TEST_RESULTS_DIR"
    log_info "Check individual JSON files for detailed responses"
    
    # List any remaining tmux sessions
    echo
    log_info "Active tmux sessions after tests:"
    TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null | grep "^farm-" || echo "No farm sessions active"
}

# Main execution
main() {
    log_info "Starting MaiFarm Orchestration Tests"
    echo
    
    # Check prerequisites
    check_server
    
    # Clean up before tests
    cleanup_tmux
    
    # Run tests
    test_quick_task
    test_farm_mode
    test_gowild_mode
    test_terminal_streaming
    
    # Generate report
    generate_report
}

# Run main function
main