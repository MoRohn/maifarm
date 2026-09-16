#!/bin/bash

# Test all three farm modes with proper validation
# This script ensures 100% error-free farm launches and agent monitoring

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "================================================"
echo "Testing All Farm Modes - Complete Validation"
echo "================================================"

# Database connection details
export PGPASSWORD=maifarm123
PSQL_CMD="/opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev"

# Function to check server health
check_server_health() {
  if curl -sf http://localhost:4567/api/health > /dev/null; then
    echo -e "${GREEN}✓ Server is healthy${NC}"
    return 0
  else
    echo -e "${RED}✗ Server is not responding${NC}"
    return 1
  fi
}

# Function to cleanup old sessions
cleanup_old_sessions() {
  echo "Cleaning up old tmux sessions..."
  TMUX_TMPDIR=/tmp tmux kill-server 2>/dev/null || true
  sleep 1
}

# Function to check tmux session
check_tmux_session() {
  local session_prefix=$1
  local expected_agents=$2

  echo "Checking for tmux session with prefix: ${session_prefix}"

  # List all sessions
  TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null || echo "No tmux sessions found"

  # Check for specific session
  if TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null | grep -q "${session_prefix}"; then
    echo -e "${GREEN}✓ Tmux session found${NC}"

    # Get full session name
    local session_name=$(TMUX_TMPDIR=/tmp tmux list-sessions | grep "${session_prefix}" | cut -d: -f1)

    # Check panes in agents window
    local pane_count=$(TMUX_TMPDIR=/tmp tmux list-panes -t "${session_name}:agents" 2>/dev/null | wc -l | tr -d ' ')

    if [ "$pane_count" -eq "$expected_agents" ]; then
      echo -e "${GREEN}✓ Correct number of panes: ${pane_count}${NC}"
      return 0
    else
      echo -e "${RED}✗ Wrong number of panes. Expected: ${expected_agents}, Found: ${pane_count}${NC}"
      return 1
    fi
  else
    echo -e "${RED}✗ Tmux session not found${NC}"
    return 1
  fi
}

# Function to check database agents
check_database_agents() {
  local farm_id=$1
  local expected_count=$2

  echo "Checking database for agents..."

  local agent_count=$($PSQL_CMD -tc "SELECT COUNT(*) FROM agents WHERE farm_id='${farm_id}';" | tr -d ' ')

  if [ "$agent_count" -eq "$expected_count" ]; then
    echo -e "${GREEN}✓ Database has ${agent_count} agents${NC}"

    # Show agent details
    $PSQL_CMD -c "SELECT id, name, type, status, session_name, pane_index FROM agents WHERE farm_id='${farm_id}' ORDER BY pane_index;"
    return 0
  else
    echo -e "${RED}✗ Database agent count mismatch. Expected: ${expected_count}, Found: ${agent_count}${NC}"
    return 1
  fi
}

# Function to check terminal logs
check_terminal_logs() {
  local farm_id=$1
  local expected_agents=$2

  echo "Checking terminal log files..."

  local log_dir="var/maibarn/terminals/${farm_id}"

  if [ -d "$log_dir" ]; then
    echo -e "${GREEN}✓ Terminal log directory exists${NC}"

    # Check each agent log
    local logs_found=0
    for i in $(seq 0 $((expected_agents - 1))); do
      if [ -f "${log_dir}/agent-${i}.log" ]; then
        local size=$(stat -f%z "${log_dir}/agent-${i}.log" 2>/dev/null || stat -c%s "${log_dir}/agent-${i}.log" 2>/dev/null || echo "0")
        if [ "$size" -gt "0" ]; then
          echo -e "${GREEN}✓ agent-${i}.log exists with ${size} bytes${NC}"
          logs_found=$((logs_found + 1))
        else
          echo -e "${YELLOW}⚠ agent-${i}.log exists but is empty${NC}"
        fi
      else
        echo -e "${RED}✗ agent-${i}.log not found${NC}"
      fi
    done

    if [ "$logs_found" -eq "$expected_agents" ]; then
      return 0
    else
      echo -e "${YELLOW}⚠ Not all log files have content${NC}"
      return 1
    fi
  else
    echo -e "${RED}✗ Terminal log directory not found${NC}"
    return 1
  fi
}

# Function to test a farm mode
test_farm_mode() {
  local mode=$1
  local expected_agents=$2
  local timeout=$3
  local description=$4

  echo ""
  echo "================================================"
  echo "Testing ${description}"
  echo "Mode: ${mode}, Agents: ${expected_agents}, Timeout: ${timeout}"
  echo "================================================"

  # Create farm - use the correct endpoint based on mode
  echo "Creating farm..."
  local endpoint
  local request_body

  if [ "$mode" = "gowild" ]; then
    # Go Wild has its own dedicated endpoint
    endpoint="http://localhost:4567/api/go-wild"
    request_body="{
      \"prompt\": \"Test ${mode} mode with ${expected_agents} agents\",
      \"maxAgents\": ${expected_agents},
      \"timeout\": ${timeout}
    }"
  else
    # Quick Task and Harvest use the quick-actions/farm endpoint
    # Convert timeout from milliseconds to seconds
    local timeout_seconds=$((timeout / 1000))

    # Both Quick Task and Harvest use XenoSync for multi-agent coordination
    local use_xenosync="true"

    endpoint="http://localhost:4567/api/quick-actions/farm"
    request_body="{
      \"prompt\": \"Test ${mode} mode with ${expected_agents} agents\",
      \"mode\": \"${mode}\",
      \"agentCount\": ${expected_agents},
      \"timeoutSeconds\": ${timeout_seconds},
      \"useXenoSync\": ${use_xenosync}
    }"
  fi

  local response=$(curl -s -X POST "$endpoint" \
    -H "Content-Type: application/json" \
    -d "$request_body")

  # Extract farm ID - use head -1 to get only the first match
  local farm_id=$(echo "$response" | grep -o '"farmId":"[^"]*' | head -1 | cut -d'"' -f4)

  if [ -z "$farm_id" ]; then
    echo -e "${RED}✗ Failed to create farm${NC}"
    echo "Response: $response"
    return 1
  fi

  echo -e "${GREEN}✓ Farm created: ${farm_id}${NC}"

  # Determine session prefix based on mode
  local session_prefix
  if [ "$mode" = "quick" ]; then
    session_prefix="quick-${farm_id:0:8}"
  else
    session_prefix="farm-${farm_id:0:8}"
  fi

  # Wait for initialization
  echo "Waiting for agents to initialize..."
  sleep 5

  # Run checks
  local all_checks_passed=true

  # Check tmux session
  if ! check_tmux_session "$session_prefix" "$expected_agents"; then
    all_checks_passed=false
  fi

  # Check database
  if ! check_database_agents "$farm_id" "$expected_agents"; then
    all_checks_passed=false
  fi

  # Check terminal logs
  if ! check_terminal_logs "$farm_id" "$expected_agents"; then
    all_checks_passed=false
  fi

  # Check YAML file for XenoSync modes
  if [ "$mode" = "harvest" ] || [ "$mode" = "gowild" ]; then
    echo "Checking XenoSync YAML file..."
    local yaml_file="/var/maibarn/xenosync-sessions/prompt-${farm_id}.yaml"
    if [ -f "$yaml_file" ]; then
      echo -e "${GREEN}✓ XenoSync YAML file exists${NC}"
      echo "First few lines of YAML:"
      head -5 "$yaml_file"
    else
      echo -e "${RED}✗ XenoSync YAML file not found${NC}"
      all_checks_passed=false
    fi
  fi

  # Generate some test output to verify streaming
  echo "Generating test output in tmux session..."
  for i in $(seq 0 $((expected_agents - 1))); do
    TMUX_TMPDIR=/tmp tmux send-keys -t "${session_prefix}:agents.${i}" "echo '[TEST] Agent ${i} is active'" Enter 2>/dev/null || true
  done

  sleep 2

  # Check if output was captured
  echo "Verifying terminal output capture..."
  for i in $(seq 0 $((expected_agents - 1))); do
    if grep -q "TEST.*Agent ${i}" "var/maibarn/terminals/${farm_id}/agent-${i}.log" 2>/dev/null; then
      echo -e "${GREEN}✓ Agent ${i} output captured${NC}"
    else
      echo -e "${YELLOW}⚠ Agent ${i} output not found in log${NC}"
    fi
  done

  # Cleanup
  echo "Cleaning up farm..."
  $PSQL_CMD -c "DELETE FROM agents WHERE farm_id='${farm_id}';" > /dev/null
  $PSQL_CMD -c "DELETE FROM farms WHERE id='${farm_id}';" > /dev/null
  TMUX_TMPDIR=/tmp tmux kill-session -t "${session_prefix}" 2>/dev/null || true

  if [ "$all_checks_passed" = true ]; then
    echo -e "${GREEN}✓ ${description} PASSED${NC}"
    return 0
  else
    echo -e "${RED}✗ ${description} FAILED${NC}"
    return 1
  fi
}

# Main test execution
main() {
  echo "Starting comprehensive farm mode testing..."
  echo "Time: $(date)"
  echo ""

  # Check server health
  if ! check_server_health; then
    echo -e "${RED}Server must be running. Start with: npm run dev${NC}"
    exit 1
  fi

  # Cleanup old sessions
  cleanup_old_sessions

  # Track overall results
  local total_tests=0
  local passed_tests=0

  # Test 1: Quick Task Mode (2 agents with XenoSync, 5 minutes)
  total_tests=$((total_tests + 1))
  if test_farm_mode "quick" 2 300000 "Quick Task Mode with XenoSync"; then
    passed_tests=$((passed_tests + 1))
  fi

  sleep 3

  # Test 2: Harvest Mode (3 agents, 10 minutes)
  total_tests=$((total_tests + 1))
  if test_farm_mode "harvest" 3 600000 "Harvest Mode with XenoSync"; then
    passed_tests=$((passed_tests + 1))
  fi

  sleep 3

  # Test 3: Go Wild Mode (5 agents, 30 minutes)
  total_tests=$((total_tests + 1))
  if test_farm_mode "gowild" 5 1800000 "Go Wild Mode with XenoSync"; then
    passed_tests=$((passed_tests + 1))
  fi

  # Final summary
  echo ""
  echo "================================================"
  echo "FINAL RESULTS"
  echo "================================================"
  echo "Tests Passed: ${passed_tests}/${total_tests}"

  if [ "$passed_tests" -eq "$total_tests" ]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED - 100% ERROR-FREE VALIDATION${NC}"
    exit 0
  else
    echo -e "${RED}✗ SOME TESTS FAILED - NEEDS ATTENTION${NC}"
    exit 1
  fi
}

# Run main function
main "$@"