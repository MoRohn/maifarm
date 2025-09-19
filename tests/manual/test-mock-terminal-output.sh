#!/bin/bash

# Test terminal output with mock agents
echo "🚀 Testing terminal output with mock agents..."

# Configuration
FARM_ID="test_$(date +%s | tail -c 5)"
SESSION_NAME="farm-${FARM_ID}"
NUM_AGENTS=3
WORK_DIR="/Users/rohnspringfield/maifarm"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Creating tmux session: ${SESSION_NAME}${NC}"

# Kill existing session if it exists
tmux kill-session -t "${SESSION_NAME}" 2>/dev/null

# Create new tmux session with initial window
tmux new-session -d -s "${SESSION_NAME}" -n "agents" -x 120 -y 40 -c "${WORK_DIR}"

# Create panes for each agent (split horizontally)
for ((i=1; i<NUM_AGENTS; i++)); do
    tmux split-window -t "${SESSION_NAME}:agents" -h -c "${WORK_DIR}"
done

# Balance the layout
tmux select-layout -t "${SESSION_NAME}:agents" even-horizontal

echo -e "${GREEN}Created ${NUM_AGENTS} agent panes${NC}"

# Function to generate mock agent output
generate_agent_output() {
    local pane_id=$1
    local agent_name=$2
    local agent_index=$3
    
    # Array of mock activities
    local activities=(
        "Analyzing codebase structure..."
        "Running type checks..."
        "Fixing TypeScript errors..."
        "Optimizing performance..."
        "Writing unit tests..."
        "Refactoring components..."
        "Updating dependencies..."
        "Building production bundle..."
        "Running integration tests..."
        "Generating documentation..."
    )
    
    # Array of mock code snippets
    local code_snippets=(
        "const result = await apiClient.post('/api/farms', data);"
        "export const useWebSocket = () => { /* implementation */ };"
        "interface FarmConfig { name: string; agents: Agent[]; }"
        "npm run build -- --mode production"
        "git status && git diff HEAD"
        "SELECT * FROM agents WHERE status = 'active';"
    )
    
    # Send initial header to pane
    tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" "clear" Enter
    sleep 0.5
    
    # Agent header
    tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" "echo -e '${BLUE}═══════════════════════════════════════${NC}'" Enter
    tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" "echo -e '${GREEN}🤖 ${agent_name}${NC}'" Enter
    tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" "echo -e '${YELLOW}Agent ${agent_index} Terminal${NC}'" Enter
    tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" "echo -e '${BLUE}═══════════════════════════════════════${NC}'" Enter
    tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" "echo ''" Enter
    
    # Continuous output loop
    while true; do
        # Random activity
        local activity="${activities[$RANDOM % ${#activities[@]}]}"
        tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" "echo -e '${GREEN}[$(date +%H:%M:%S)]${NC} ${activity}'" Enter
        sleep $(echo "scale=1; $RANDOM/32768*2+0.5" | bc)
        
        # Sometimes show code
        if [ $((RANDOM % 3)) -eq 0 ]; then
            local code="${code_snippets[$RANDOM % ${#code_snippets[@]}]}"
            tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" "echo -e '  ${YELLOW}>${NC} ${code}'" Enter
            sleep 0.5
        fi
        
        # Sometimes show progress
        if [ $((RANDOM % 4)) -eq 0 ]; then
            local progress=$((RANDOM % 100 + 1))
            tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" "echo -e '  📊 Progress: ${progress}%'" Enter
            sleep 0.3
        fi
        
        # Sometimes show success/error
        if [ $((RANDOM % 5)) -eq 0 ]; then
            if [ $((RANDOM % 2)) -eq 0 ]; then
                tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" "echo -e '  ${GREEN}✓ Task completed successfully${NC}'" Enter
            else
                tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" "echo -e '  ${YELLOW}⚠ Warning: Minor issue detected${NC}'" Enter
            fi
            sleep 0.5
        fi
        
        # Occasional multi-line output
        if [ $((RANDOM % 6)) -eq 0 ]; then
            tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" "echo '  Running tests...'" Enter
            sleep 0.2
            tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" "echo '    ✓ Component tests: 45 passed'" Enter
            sleep 0.1
            tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" "echo '    ✓ Integration tests: 12 passed'" Enter
            sleep 0.1
            tmux send-keys -t "${SESSION_NAME}:agents.${pane_id}" "echo '    ✓ E2E tests: 8 passed'" Enter
            sleep 0.5
        fi
        
        # Random delay between outputs
        sleep $(echo "scale=1; $RANDOM/32768*3+1" | bc)
    done
}

# Array of agent names
agent_names=(
    "Bessie the Cow"
    "Wilbur the Pig"
    "Clucky the Chicken"
    "Woolly the Sheep"
    "Daisy the Goat"
)

# Start mock agents in background
echo -e "${YELLOW}Starting mock agents...${NC}"
for ((i=0; i<NUM_AGENTS; i++)); do
    agent_name="${agent_names[$i]:-Agent $((i+1))}"
    generate_agent_output $i "$agent_name" $((i+1)) &
    echo -e "  Started: ${GREEN}$agent_name${NC} (pane $i)"
done

# Store the farm info
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Mock agents are running!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "📍 Farm ID: ${YELLOW}${FARM_ID}${NC}"
echo -e "📍 Session: ${YELLOW}${SESSION_NAME}${NC}"
echo -e "📍 Agents: ${YELLOW}${NUM_AGENTS}${NC}"
echo ""
echo -e "${GREEN}Commands:${NC}"
echo -e "  View session:  ${YELLOW}tmux attach -t ${SESSION_NAME}${NC}"
echo -e "  List panes:    ${YELLOW}tmux list-panes -t ${SESSION_NAME}:agents${NC}"
echo -e "  Stop agents:   ${YELLOW}tmux kill-session -t ${SESSION_NAME}${NC}"
echo ""
echo -e "${BLUE}The agents will continuously generate mock output.${NC}"
echo -e "${BLUE}Press Ctrl+C to stop this script (agents will keep running).${NC}"
echo ""

# Keep script running to maintain background processes
echo -e "${YELLOW}Monitoring... (Press Ctrl+C to exit)${NC}"
trap "echo -e '\n${RED}Stopping monitor (agents still running)${NC}'; exit 0" INT

while true; do
    # Check if session still exists
    if ! tmux has-session -t "${SESSION_NAME}" 2>/dev/null; then
        echo -e "${RED}Session terminated${NC}"
        exit 1
    fi
    sleep 5
done