#!/bin/bash

# Xcode Agent Build Loop
# Automated build-test-fix cycle using Claude CLI
#
# This script:
# 1. Runs xcodebuild
# 2. Parses errors
# 3. Calls Claude CLI to fix errors
# 4. Repeats until build succeeds or max iterations reached
#
# Usage: ./scripts/xcode/xcode-agent-loop.sh [--max-iterations N]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_PATH="${PROJECT_PATH:-$PROJECT_ROOT/ios/MaiFarm/MaiFarm.xcodeproj}"
SCHEME="${SCHEME:-MaiFarm}"
SIMULATOR_ID="${SIMULATOR_ID:-E7026476-D3E1-40C3-BE0F-AB5541CE58DB}"
XCODEBUILD="/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild"
LOG_DIR="/tmp/xcode_agent_builds"
MAX_ITERATIONS="${MAX_ITERATIONS:-10}"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --max-iterations)
            MAX_ITERATIONS="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [--max-iterations N]"
            echo ""
            echo "Automated Xcode build-fix loop using Claude CLI"
            echo ""
            echo "Environment variables:"
            echo "  PROJECT_PATH    Path to .xcodeproj (default: ios/MaiFarm/MaiFarm.xcodeproj)"
            echo "  SCHEME          Xcode scheme (default: MaiFarm)"
            echo "  SIMULATOR_ID    iOS Simulator device ID"
            echo "  MAX_ITERATIONS  Maximum fix attempts (default: 10)"
            exit 0
            ;;
        *)
            shift
            ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

mkdir -p "$LOG_DIR"

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════╗"
echo "║     Xcode Agent Build Loop               ║"
echo "║     Automated Error Detection & Fix      ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

echo "Project: $PROJECT_PATH"
echo "Max iterations: $MAX_ITERATIONS"
echo ""

# Function to run build
run_build() {
    local iteration=$1
    local log_file="$LOG_DIR/build_${iteration}.log"

    echo -e "${BLUE}[Build $iteration] Running xcodebuild...${NC}"

    "$XCODEBUILD" \
        -project "$PROJECT_PATH" \
        -scheme "$SCHEME" \
        -configuration Debug \
        -destination "id=$SIMULATOR_ID" \
        build 2>&1 | tee "$log_file"

    return ${PIPESTATUS[0]}
}

# Function to count errors
count_errors() {
    local log_file=$1
    grep -c "error:" "$log_file" 2>/dev/null || echo "0"
}

# Function to extract errors for agent
extract_errors() {
    local log_file=$1

    echo "# Xcode Build Errors"
    echo ""
    echo "The following errors need to be fixed:"
    echo ""

    grep -E "error:" "$log_file" | head -20 | while IFS= read -r line; do
        echo "- $line"
    done

    echo ""
    echo "Please fix each error. Read the file, understand the context, and make the minimal fix."
}

# Function to call Claude agent
call_claude_agent() {
    local log_file=$1
    local error_prompt=$(extract_errors "$log_file")

    echo -e "${CYAN}[Agent] Sending errors to Claude for analysis and fix...${NC}"
    echo ""

    # Check if claude CLI is available
    if ! command -v claude &> /dev/null; then
        echo -e "${RED}Error: 'claude' CLI not found. Install with: npm install -g @anthropic-ai/claude-code${NC}"
        return 1
    fi

    # Run claude with the error prompt
    echo "$error_prompt" | claude --print "Fix the Xcode build errors shown above. Read each file, understand the error, and make the minimal necessary fix. After each fix, explain what you changed."

    return $?
}

# Main loop
iteration=1
last_error_count=999999

while [ $iteration -le $MAX_ITERATIONS ]; do
    echo ""
    echo -e "${BLUE}════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Iteration $iteration of $MAX_ITERATIONS${NC}"
    echo -e "${BLUE}════════════════════════════════════════${NC}"
    echo ""

    log_file="$LOG_DIR/build_${iteration}.log"

    if run_build $iteration; then
        echo ""
        echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║         BUILD SUCCEEDED!                 ║${NC}"
        echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
        echo ""
        echo "Completed in $iteration iteration(s)"
        echo "Build log: $log_file"
        exit 0
    fi

    error_count=$(count_errors "$log_file")
    echo ""
    echo -e "${YELLOW}Found $error_count error(s)${NC}"

    # Check if we're making progress
    if [ "$error_count" -ge "$last_error_count" ] && [ $iteration -gt 2 ]; then
        echo -e "${YELLOW}Warning: Error count not decreasing. May need manual intervention.${NC}"
    fi
    last_error_count=$error_count

    # Show errors
    echo ""
    echo -e "${RED}Errors:${NC}"
    grep "error:" "$log_file" | head -10

    # Call Claude agent to fix
    echo ""
    if ! call_claude_agent "$log_file"; then
        echo -e "${RED}Agent call failed. Continuing to next iteration...${NC}"
    fi

    # Brief pause to let file system sync
    sleep 1

    iteration=$((iteration + 1))
done

echo ""
echo -e "${RED}╔══════════════════════════════════════════╗${NC}"
echo -e "${RED}║  Max iterations reached without success  ║${NC}"
echo -e "${RED}╚══════════════════════════════════════════╝${NC}"
echo ""
echo "Last error count: $last_error_count"
echo "Review logs in: $LOG_DIR"
exit 1
