#!/bin/bash

# Comprehensive Terminal Output Test Script
# Tests all terminal functionality with recent fixes

set -e

echo "======================================"
echo "COMPREHENSIVE TERMINAL OUTPUT TEST"
echo "======================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
API_URL="http://localhost:4567/api"
WS_URL="ws://localhost:4567"

# Helper function to print colored output
print_status() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')]${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Start the server in background
print_status "Starting MaiFarm server..."
NODE_ENV=development BYPASS_AUTH=true PORT=4567 npm run dev:server &
SERVER_PID=$!
sleep 5

# Function to cleanup on exit
cleanup() {
    print_status "Cleaning up..."
    
    # Kill all tmux sessions created during test
    for session in $(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E '^(farm-|quick_|goWild-)'); do
        tmux kill-session -t "$session" 2>/dev/null || true
    done
    
    # Kill the server
    kill $SERVER_PID 2>/dev/null || true
    
    print_success "Cleanup complete"
}

trap cleanup EXIT

# Wait for server to be ready
print_status "Waiting for server to be ready..."
for i in {1..10}; do
    if curl -s http://localhost:4567/health > /dev/null; then
        print_success "Server is ready!"
        break
    fi
    if [ $i -eq 10 ]; then
        print_error "Server failed to start"
        exit 1
    fi
    sleep 1
done

echo ""
echo "======================================"
echo "TEST 1: QUICK TASK TERMINAL OUTPUT"
echo "======================================"
echo ""

# Create a Quick Task with mock output
print_status "Creating Quick Task..."
QUICK_TASK_RESPONSE=$(curl -s -X POST $API_URL/farms/quick-task \
    -H "Content-Type: application/json" \
    -d '{
        "prompt": "Test terminal output with comprehensive checks",
        "provider": "mock",
        "model": "mock-claude",
        "numAgents": 2
    }')

FARM_ID=$(echo $QUICK_TASK_RESPONSE | jq -r '.farm.id')
SESSION_NAME=$(echo $QUICK_TASK_RESPONSE | jq -r '.farm.tmuxSession')

if [ -z "$FARM_ID" ] || [ "$FARM_ID" = "null" ]; then
    print_error "Failed to create Quick Task"
    echo "Response: $QUICK_TASK_RESPONSE"
    exit 1
fi

print_success "Quick Task created: $FARM_ID"
print_status "Tmux session: $SESSION_NAME"

# Wait for tmux session to be created
print_status "Waiting for tmux session..."
for i in {1..10}; do
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        print_success "Tmux session created!"
        break
    fi
    if [ $i -eq 10 ]; then
        print_error "Tmux session not created"
        exit 1
    fi
    sleep 0.5
done

# Send test output to agents
print_status "Sending test output to agents..."
for i in 0 1; do
    AGENT_NAME="Agent $((i+1))"
    tmux send-keys -t "${SESSION_NAME}:0.$i" "echo '[$AGENT_NAME] Starting test...'" Enter
    sleep 0.2
    tmux send-keys -t "${SESSION_NAME}:0.$i" "echo '[$AGENT_NAME] Processing task...'" Enter
    sleep 0.2
    tmux send-keys -t "${SESSION_NAME}:0.$i" "echo '[$AGENT_NAME] Task completed!'" Enter
done

# Check terminal output via API
print_status "Checking terminal output via API..."
sleep 2

TERMINAL_RESPONSE=$(curl -s "$API_URL/farms/$FARM_ID/terminal-output")
echo "Terminal output response:"
echo "$TERMINAL_RESPONSE" | jq '.'

# Verify output contains expected text
if echo "$TERMINAL_RESPONSE" | grep -q "Starting test"; then
    print_success "Terminal output captured correctly!"
else
    print_error "Terminal output not captured"
fi

echo ""
echo "======================================"
echo "TEST 2: FARM MODE TERMINAL OUTPUT"
echo "======================================"
echo ""

# Create a regular farm
print_status "Creating regular farm..."
FARM_RESPONSE=$(curl -s -X POST $API_URL/farms \
    -H "Content-Type: application/json" \
    -d '{
        "name": "Terminal Test Farm",
        "description": "Testing terminal output in farm mode",
        "config": {
            "prompt": "Test farm terminal output",
            "numAgents": 3,
            "provider": "mock",
            "model": "mock-claude"
        }
    }')

FARM_ID_2=$(echo $FARM_RESPONSE | jq -r '.id')
SESSION_NAME_2="farm-${FARM_ID_2:0:8}"

if [ -z "$FARM_ID_2" ] || [ "$FARM_ID_2" = "null" ]; then
    print_error "Failed to create farm"
    echo "Response: $FARM_RESPONSE"
    exit 1
fi

print_success "Farm created: $FARM_ID_2"

# Launch the farm
print_status "Launching farm..."
curl -s -X POST "$API_URL/farms/$FARM_ID_2/launch" > /dev/null

# Wait for tmux session
print_status "Waiting for farm tmux session..."
for i in {1..10}; do
    if tmux has-session -t "$SESSION_NAME_2" 2>/dev/null; then
        print_success "Farm tmux session created!"
        break
    fi
    if [ $i -eq 10 ]; then
        print_error "Farm tmux session not created"
        exit 1
    fi
    sleep 0.5
done

# Send test output to farm agents
print_status "Sending test output to farm agents..."
for i in 0 1 2; do
    AGENT_NAME="Farm Agent $((i+1))"
    tmux send-keys -t "${SESSION_NAME_2}:0.$i" "echo '[$AGENT_NAME] Initializing...'" Enter
    sleep 0.2
    tmux send-keys -t "${SESSION_NAME_2}:0.$i" "echo '[$AGENT_NAME] Working on task...'" Enter
    sleep 0.2
    tmux send-keys -t "${SESSION_NAME_2}:0.$i" "echo '[$AGENT_NAME] Progress: 50%'" Enter
    sleep 0.2
    tmux send-keys -t "${SESSION_NAME_2}:0.$i" "echo '[$AGENT_NAME] Task complete!'" Enter
done

# Check farm terminal output
print_status "Checking farm terminal output..."
sleep 2

FARM_TERMINAL_RESPONSE=$(curl -s "$API_URL/farms/$FARM_ID_2/terminal-output")
echo "Farm terminal output response:"
echo "$FARM_TERMINAL_RESPONSE" | jq '.'

# Verify farm output
if echo "$FARM_TERMINAL_RESPONSE" | grep -q "Working on task"; then
    print_success "Farm terminal output captured correctly!"
else
    print_error "Farm terminal output not captured"
fi

echo ""
echo "======================================"
echo "TEST 3: TERMINAL STREAMING"
echo "======================================"
echo ""

print_status "Testing WebSocket terminal streaming..."

# Create a Node.js script to test WebSocket
cat > /tmp/test-ws-terminal.js << 'EOF'
const io = require('socket.io-client');
const socket = io('http://localhost:4567');

let receivedOutput = false;
let timeout;

socket.on('connect', () => {
    console.log('Connected to WebSocket');
    socket.emit('terminal:subscribe', { farmId: process.argv[2] });
});

socket.on('terminal:output', (data) => {
    console.log('Received terminal output:', JSON.stringify(data));
    receivedOutput = true;
    clearTimeout(timeout);
    socket.disconnect();
    process.exit(0);
});

timeout = setTimeout(() => {
    console.error('No terminal output received within 5 seconds');
    socket.disconnect();
    process.exit(1);
}, 5000);
EOF

# Test WebSocket streaming
if command -v node > /dev/null; then
    print_status "Subscribing to terminal output via WebSocket..."
    
    # Send more output to trigger streaming
    tmux send-keys -t "${SESSION_NAME}:0.0" "echo 'Testing WebSocket streaming...'" Enter
    
    # Run WebSocket test
    if node /tmp/test-ws-terminal.js "$FARM_ID"; then
        print_success "WebSocket terminal streaming working!"
    else
        print_error "WebSocket terminal streaming failed"
    fi
else
    print_status "Node.js not available, skipping WebSocket test"
fi

echo ""
echo "======================================"
echo "TEST 4: TERMINAL FEATURES"
echo "======================================"
echo ""

# Test terminal history
print_status "Testing terminal history..."
HISTORY_RESPONSE=$(curl -s "$API_URL/farms/$FARM_ID/terminal-history")
if echo "$HISTORY_RESPONSE" | grep -q "output"; then
    print_success "Terminal history working!"
else
    print_error "Terminal history not working"
fi

# Test terminal clear
print_status "Testing terminal clear..."
curl -s -X POST "$API_URL/farms/$FARM_ID/terminal-clear" > /dev/null
CLEARED_RESPONSE=$(curl -s "$API_URL/farms/$FARM_ID/terminal-output")
if [ "$(echo "$CLEARED_RESPONSE" | jq -r '.agents | length')" -eq "0" ]; then
    print_success "Terminal clear working!"
else
    print_error "Terminal clear not working"
fi

echo ""
echo "======================================"
echo "TEST SUMMARY"
echo "======================================"
echo ""

# Get final status of both farms
FARM_1_STATUS=$(curl -s "$API_URL/farms/$FARM_ID" | jq -r '.status')
FARM_2_STATUS=$(curl -s "$API_URL/farms/$FARM_ID_2" | jq -r '.status')

print_status "Quick Task ($FARM_ID): $FARM_1_STATUS"
print_status "Regular Farm ($FARM_ID_2): $FARM_2_STATUS"

# List all tmux sessions
echo ""
print_status "Active tmux sessions:"
tmux list-sessions -F '#{session_name}: #{window_name} (#{window_panes} panes)' 2>/dev/null || echo "No tmux sessions"

echo ""
print_success "All terminal tests completed!"
echo ""
echo "======================================"
echo "TEST COMPLETE"
echo "======================================"