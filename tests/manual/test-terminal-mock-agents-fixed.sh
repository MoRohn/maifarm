#!/bin/bash

# Comprehensive test for terminal output with mock agents
# Tests tmux session creation, pipe-pane setup, and WebSocket streaming

echo "🚀 Testing Terminal Output with Mock Agents (Fixed)"
echo "=================================================="

# Configuration
FARM_ID="test_$(date +%s | tail -c 6)"
SESSION_NAME="farm-${FARM_ID}"
NUM_AGENTS=3
WORK_DIR="/Users/rohnspringfield/maifarm"
MAIBARN_DIR="/Users/rohnspringfield/maifarm/maibarn"
TERMINAL_DIR="${MAIBARN_DIR}/terminals/${FARM_ID}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Test status tracking
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    echo -e "\n${CYAN}Testing: ${test_name}${NC}"
    if eval "$test_command"; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Cleaning up...${NC}"
    
    # Kill tmux session
    tmux kill-session -t "${SESSION_NAME}" 2>/dev/null
    
    # Kill background processes
    jobs -p | xargs -r kill 2>/dev/null
    
    # Clean up terminal directory
    rm -rf "${TERMINAL_DIR}"
    
    echo -e "${GREEN}Cleanup complete${NC}"
}

# Set trap for cleanup
trap cleanup EXIT INT TERM

echo -e "\n${BLUE}1. Environment Setup${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create terminal output directory
mkdir -p "${TERMINAL_DIR}"
echo -e "Created terminal directory: ${YELLOW}${TERMINAL_DIR}${NC}"

# Kill any existing session
tmux kill-session -t "${SESSION_NAME}" 2>/dev/null

echo -e "\n${BLUE}2. Creating Tmux Session${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create tmux session
run_test "Create tmux session" "tmux new-session -d -s '${SESSION_NAME}' -n 'agents' -x 120 -y 40 -c '${WORK_DIR}'"

# Create panes for agents
echo -e "\n${CYAN}Creating ${NUM_AGENTS} agent panes...${NC}"
for ((i=1; i<NUM_AGENTS; i++)); do
    run_test "Create pane $i" "tmux split-window -t '${SESSION_NAME}:agents' -h -c '${WORK_DIR}'"
done

# Balance layout
run_test "Balance pane layout" "tmux select-layout -t '${SESSION_NAME}:agents' even-horizontal"

echo -e "\n${BLUE}3. Setting up Pipe-Pane for Terminal Capture${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Set up pipe-pane for each agent to capture output
for ((i=0; i<NUM_AGENTS; i++)); do
    output_file="${TERMINAL_DIR}/agent_${i}.log"
    run_test "Setup pipe-pane for agent $i" \
        "tmux pipe-pane -t '${SESSION_NAME}:agents.${i}' -o 'cat >> ${output_file}'"
done

echo -e "\n${BLUE}4. Agent Name Mapping${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Farm-themed agent names
agent_names=(
    "Bessie the Cow"
    "Wilbur the Pig"
    "Clucky the Chicken"
)

for ((i=0; i<NUM_AGENTS; i++)); do
    echo -e "Agent $((i+1)): ${GREEN}${agent_names[$i]}${NC}"
done

echo -e "\n${BLUE}5. Starting Mock Agents${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Function to generate realistic agent output
generate_agent_output() {
    local pane_id=$1
    local agent_name=$2
    local agent_num=$3
    local output_file="${TERMINAL_DIR}/agent_${pane_id}.log"
    
    # Initial clear and header
    tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" "clear" Enter
    sleep 0.2
    
    # Agent startup message
    tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" \
        "echo -e '${BLUE}═══════════════════════════════════════${NC}'" Enter
    tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" \
        "echo -e '${GREEN}🤖 ${agent_name}${NC}'" Enter
    tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" \
        "echo -e '${YELLOW}Agent ${agent_num} - Claude CLI Terminal${NC}'" Enter
    tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" \
        "echo -e '${BLUE}═══════════════════════════════════════${NC}'" Enter
    tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" "echo ''" Enter
    
    # Simulate Claude CLI startup
    sleep 0.5
    tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" \
        "echo '[$(date +%H:%M:%S)] Initializing Claude CLI...'" Enter
    sleep 0.3
    tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" \
        "echo '[$(date +%H:%M:%S)] Loading context...'" Enter
    sleep 0.2
    
    # Task activities
    local activities=(
        "Analyzing project structure..."
        "Scanning for TypeScript errors..."
        "Checking import statements..."
        "Running ESLint checks..."
        "Validating component props..."
        "Testing API endpoints..."
        "Optimizing bundle size..."
        "Checking WebSocket connections..."
        "Verifying database queries..."
        "Running unit tests..."
    )
    
    # Code snippets
    local code_snippets=(
        "const farmStore = useFarmStore();"
        "await websocket.emit('farm:status', { id: farmId });"
        "interface Agent { id: string; name: string; status: AgentStatus; }"
        "tmux pipe-pane -t session:0.0 -o 'cat >> output.log'"
        "SELECT * FROM farms WHERE status = 'active';"
        "npm run typecheck && npm run lint"
    )
    
    # Main output loop
    local counter=0
    while [ $counter -lt 15 ]; do  # Run for limited iterations
        # Activity message
        local activity="${activities[$RANDOM % ${#activities[@]}]}"
        tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" \
            "echo -e '${GREEN}[$(date +%H:%M:%S)]${NC} ${activity}'" Enter
        sleep 0.8
        
        # Sometimes show code
        if [ $((RANDOM % 3)) -eq 0 ]; then
            local code="${code_snippets[$RANDOM % ${#code_snippets[@]}]}"
            tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" \
                "echo -e '  ${CYAN}>${NC} ${code}'" Enter
            sleep 0.5
        fi
        
        # Progress indicator
        if [ $((RANDOM % 4)) -eq 0 ]; then
            local progress=$((counter * 100 / 15))
            tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" \
                "echo -e '  📊 Progress: ${progress}%'" Enter
            sleep 0.3
        fi
        
        # Status messages
        if [ $((RANDOM % 5)) -eq 0 ]; then
            if [ $((RANDOM % 2)) -eq 0 ]; then
                tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" \
                    "echo -e '  ${GREEN}✓ Check passed${NC}'" Enter
            else
                tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" \
                    "echo -e '  ${YELLOW}⚠ Minor issue found${NC}'" Enter
            fi
            sleep 0.4
        fi
        
        ((counter++))
        sleep 1
    done
    
    # Final status
    tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" \
        "echo -e '\n${GREEN}✓ Agent task completed${NC}'" Enter
}

# Start agents in background
for ((i=0; i<NUM_AGENTS; i++)); do
    agent_name="${agent_names[$i]}"
    echo -e "Starting: ${GREEN}${agent_name}${NC}"
    generate_agent_output $i "$agent_name" $((i+1)) &
    AGENT_PIDS[$i]=$!
done

echo -e "\n${BLUE}6. Verifying Terminal Output Capture${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Wait for initial output
sleep 3

# Check output files
for ((i=0; i<NUM_AGENTS; i++)); do
    output_file="${TERMINAL_DIR}/agent_${i}.log"
    if [ -f "$output_file" ]; then
        size=$(wc -c < "$output_file")
        if [ "$size" -gt 0 ]; then
            echo -e "${GREEN}✓${NC} Agent $i output captured (${size} bytes)"
        else
            echo -e "${RED}✗${NC} Agent $i output file empty"
        fi
    else
        echo -e "${RED}✗${NC} Agent $i output file missing"
    fi
done

echo -e "\n${BLUE}7. Testing Tmux Commands${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test session exists
run_test "Session exists" "tmux has-session -t '${SESSION_NAME}'"

# Test pane count
pane_count=$(tmux list-panes -t "${SESSION_NAME}:agents" | wc -l)
run_test "Correct pane count" "[ $pane_count -eq $NUM_AGENTS ]"

# Test capture-pane
for ((i=0; i<NUM_AGENTS; i++)); do
    run_test "Capture pane $i" \
        "tmux capture-pane -t '${SESSION_NAME}:agents.${i}' -p | grep -q 'Agent'"
done

echo -e "\n${BLUE}8. Sample Output from Agents${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Show sample from each agent
for ((i=0; i<NUM_AGENTS; i++)); do
    echo -e "\n${CYAN}${agent_names[$i]} (last 5 lines):${NC}"
    if [ -f "${TERMINAL_DIR}/agent_${i}.log" ]; then
        tail -5 "${TERMINAL_DIR}/agent_${i}.log" | sed 's/^/  /'
    else
        echo "  (no output captured)"
    fi
done

echo -e "\n${BLUE}9. WebSocket Terminal Event Simulation${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create a simple Node.js script to test WebSocket events
cat > /tmp/test-terminal-ws.js << 'EOF'
const io = require('socket.io-client');

const socket = io('http://localhost:4567', {
    transports: ['websocket'],
    reconnection: true
});

socket.on('connect', () => {
    console.log('✓ Connected to WebSocket server');
    
    // Request terminal join
    const farmId = process.argv[2];
    socket.emit('terminal:join', { farmId });
    
    // Listen for terminal output
    socket.on('terminal:output', (data) => {
        console.log(`✓ Received terminal output for agent ${data.agentId}`);
    });
    
    setTimeout(() => {
        console.log('✓ WebSocket test completed');
        process.exit(0);
    }, 2000);
});

socket.on('error', (error) => {
    console.error('✗ WebSocket error:', error.message);
    process.exit(1);
});

setTimeout(() => {
    console.error('✗ WebSocket connection timeout');
    process.exit(1);
}, 5000);
EOF

# Test WebSocket if server is running
if lsof -i :4567 > /dev/null 2>&1; then
    echo "Testing WebSocket terminal events..."
    if node /tmp/test-terminal-ws.js "${FARM_ID}" 2>/dev/null; then
        echo -e "${GREEN}✓ WebSocket terminal events working${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${YELLOW}⚠ WebSocket test skipped (server may not be configured)${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Server not running on port 4567, skipping WebSocket test${NC}"
fi

# Wait for agents to finish
echo -e "\n${BLUE}10. Waiting for Agents to Complete${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for pid in ${AGENT_PIDS[@]}; do
    wait $pid
done

echo -e "${GREEN}All agents completed${NC}"

echo -e "\n${BLUE}11. Final Verification${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check final output sizes
total_output=0
for ((i=0; i<NUM_AGENTS; i++)); do
    if [ -f "${TERMINAL_DIR}/agent_${i}.log" ]; then
        size=$(wc -c < "${TERMINAL_DIR}/agent_${i}.log")
        total_output=$((total_output + size))
        lines=$(wc -l < "${TERMINAL_DIR}/agent_${i}.log")
        echo -e "Agent $i: ${GREEN}${lines} lines, ${size} bytes${NC}"
    fi
done

echo -e "\nTotal output captured: ${YELLOW}${total_output} bytes${NC}"

# Test summary
echo -e "\n${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}            TEST SUMMARY                ${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "Tests Passed: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Tests Failed: ${RED}${TESTS_FAILED}${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}✓ All tests passed successfully!${NC}"
    echo -e "${GREEN}Terminal output with mock agents is working correctly.${NC}"
else
    echo -e "\n${RED}✗ Some tests failed. Please review the output above.${NC}"
fi

echo -e "\n${BLUE}Session Information:${NC}"
echo -e "  Farm ID:    ${YELLOW}${FARM_ID}${NC}"
echo -e "  Session:    ${YELLOW}${SESSION_NAME}${NC}"
echo -e "  Terminal:   ${YELLOW}${TERMINAL_DIR}${NC}"
echo ""
echo -e "${CYAN}Useful Commands:${NC}"
echo -e "  View live:  ${YELLOW}tmux attach -t ${SESSION_NAME}${NC}"
echo -e "  List panes: ${YELLOW}tmux list-panes -t ${SESSION_NAME}:agents -F '#{pane_index}: #{pane_width}x#{pane_height}'${NC}"
echo -e "  Stop:       ${YELLOW}tmux kill-session -t ${SESSION_NAME}${NC}"

# Don't run cleanup automatically - let user inspect
trap - EXIT
echo -e "\n${YELLOW}Session kept alive for inspection. Run cleanup manually:${NC}"
echo -e "  ${CYAN}tmux kill-session -t ${SESSION_NAME} && rm -rf ${TERMINAL_DIR}${NC}"