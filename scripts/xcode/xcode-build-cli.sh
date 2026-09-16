#!/bin/bash

# ============================================================================
# xcode-build-cli - Unified CLI for Xcode Build-Test-Fix Loop
# ============================================================================
#
# Commands:
#   run       Start the build-fix loop (foreground or background)
#   status    Check current build status
#   monitor   Watch build progress in real-time
#   stop      Stop a running build loop
#   logs      View build logs
#   errors    Show current errors
#   clean     Clean build artifacts
#   help      Show this help
#
# Usage:
#   ./xcode-build-cli.sh run [--background] [--max-iterations N]
#   ./xcode-build-cli.sh status
#   ./xcode-build-cli.sh monitor
#   ./xcode-build-cli.sh stop
#   ./xcode-build-cli.sh logs [iteration_number]
#   ./xcode-build-cli.sh errors
#   ./xcode-build-cli.sh clean
#
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
PROJECT_PATH="${PROJECT_PATH:-$PROJECT_ROOT/ios/MaiFarm/MaiFarm.xcodeproj}"
SCHEME="${SCHEME:-MaiFarm}"
SIMULATOR_ID="${SIMULATOR_ID:-E7026476-D3E1-40C3-BE0F-AB5541CE58DB}"
XCODEBUILD="/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild"

# State directories
STATE_DIR="/tmp/xcode_build_loop"
LOG_DIR="$STATE_DIR/logs"
PID_FILE="$STATE_DIR/build.pid"
STATUS_FILE="$STATE_DIR/status.json"
CURRENT_LOG="$STATE_DIR/current.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

# Initialize directories
init_dirs() {
    mkdir -p "$STATE_DIR" "$LOG_DIR"
}

# ============================================================================
# Status Management
# ============================================================================

write_status() {
    local status=$1
    local iteration=$2
    local errors=$3
    local message=$4

    cat > "$STATUS_FILE" << EOF
{
    "status": "$status",
    "iteration": $iteration,
    "error_count": $errors,
    "message": "$message",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "pid": ${5:-null},
    "project": "$PROJECT_PATH",
    "scheme": "$SCHEME"
}
EOF
}

read_status() {
    if [ -f "$STATUS_FILE" ]; then
        cat "$STATUS_FILE"
    else
        echo '{"status": "idle", "iteration": 0, "error_count": 0, "message": "No build running"}'
    fi
}

# ============================================================================
# Build Functions
# ============================================================================

do_build() {
    local iteration=$1
    local log_file="$LOG_DIR/build_${iteration}.log"

    write_status "building" "$iteration" 0 "Running xcodebuild..." "$$"

    "$XCODEBUILD" \
        -project "$PROJECT_PATH" \
        -scheme "$SCHEME" \
        -configuration Debug \
        -destination "id=$SIMULATOR_ID" \
        build 2>&1 | tee "$log_file" "$CURRENT_LOG"

    return ${PIPESTATUS[0]}
}

count_errors() {
    local log_file=$1
    grep -c "error:" "$log_file" 2>/dev/null || echo "0"
}

# ============================================================================
# Commands
# ============================================================================

cmd_run() {
    local background=false
    local max_iterations=10
    local use_agent=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --background|-b)
                background=true
                shift
                ;;
            --max-iterations|-n)
                max_iterations="$2"
                shift 2
                ;;
            --agent|-a)
                use_agent=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    init_dirs

    # Check if already running
    if [ -f "$PID_FILE" ]; then
        local old_pid=$(cat "$PID_FILE")
        if kill -0 "$old_pid" 2>/dev/null; then
            echo -e "${YELLOW}Build loop already running (PID: $old_pid)${NC}"
            echo "Use 'stop' command to stop it first, or 'status' to check progress"
            exit 1
        fi
    fi

    if [ "$background" = true ]; then
        echo -e "${CYAN}Starting build loop in background...${NC}"
        nohup "$0" _run_loop "$max_iterations" "$use_agent" > "$STATE_DIR/background.log" 2>&1 &
        local pid=$!
        echo $pid > "$PID_FILE"
        echo -e "${GREEN}Build loop started with PID: $pid${NC}"
        echo ""
        echo "Commands:"
        echo "  $0 status   - Check progress"
        echo "  $0 monitor  - Watch live output"
        echo "  $0 stop     - Stop the build"
    else
        "$0" _run_loop "$max_iterations" "$use_agent"
    fi
}

cmd_run_loop() {
    local max_iterations=${1:-10}
    local use_agent=${2:-false}
    local iteration=1

    init_dirs
    echo $$ > "$PID_FILE"

    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════╗"
    echo "║     Xcode Build-Test-Fix Loop            ║"
    echo "╚══════════════════════════════════════════╝"
    echo -e "${NC}"

    trap 'cleanup_on_exit' EXIT INT TERM

    while [ $iteration -le $max_iterations ]; do
        echo ""
        echo -e "${BLUE}════════ Iteration $iteration of $max_iterations ════════${NC}"

        if do_build $iteration; then
            write_status "success" "$iteration" 0 "Build succeeded!" "$$"
            echo ""
            echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
            echo -e "${GREEN}║         BUILD SUCCEEDED!                 ║${NC}"
            echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
            rm -f "$PID_FILE"
            exit 0
        fi

        local error_count=$(count_errors "$LOG_DIR/build_${iteration}.log")
        write_status "fixing" "$iteration" "$error_count" "Found $error_count errors, analyzing..." "$$"

        echo ""
        echo -e "${YELLOW}Found $error_count error(s)${NC}"

        # Show errors
        echo -e "${RED}Errors:${NC}"
        grep "error:" "$LOG_DIR/build_${iteration}.log" | head -10

        if [ "$use_agent" = "true" ] && command -v claude &> /dev/null; then
            echo ""
            echo -e "${CYAN}[Agent] Calling Claude to fix errors...${NC}"
            write_status "agent_fixing" "$iteration" "$error_count" "Claude agent working on fixes..." "$$"

            local error_prompt=$(grep "error:" "$LOG_DIR/build_${iteration}.log" | head -20)
            echo "Fix these Xcode build errors by reading the files and making minimal fixes:

$error_prompt

After fixing, explain what you changed." | claude --print
        fi

        sleep 1
        iteration=$((iteration + 1))
    done

    write_status "failed" "$iteration" "$error_count" "Max iterations reached" "$$"
    echo -e "${RED}Max iterations reached without success${NC}"
    rm -f "$PID_FILE"
    exit 1
}

cleanup_on_exit() {
    rm -f "$PID_FILE"
    write_status "stopped" "0" "0" "Build loop stopped"
}

cmd_status() {
    init_dirs

    local status_json=$(read_status)

    echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║     Xcode Build Loop Status              ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
    echo ""

    local status=$(echo "$status_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null || echo "unknown")
    local iteration=$(echo "$status_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('iteration',0))" 2>/dev/null || echo "0")
    local errors=$(echo "$status_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error_count',0))" 2>/dev/null || echo "0")
    local message=$(echo "$status_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('message',''))" 2>/dev/null || echo "")
    local timestamp=$(echo "$status_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('timestamp',''))" 2>/dev/null || echo "")

    # Status with color
    case $status in
        success)
            echo -e "Status:     ${GREEN}● SUCCESS${NC}"
            ;;
        building|fixing|agent_fixing)
            echo -e "Status:     ${YELLOW}● RUNNING${NC} ($status)"
            ;;
        failed)
            echo -e "Status:     ${RED}● FAILED${NC}"
            ;;
        stopped)
            echo -e "Status:     ${MAGENTA}● STOPPED${NC}"
            ;;
        *)
            echo -e "Status:     ${BLUE}● IDLE${NC}"
            ;;
    esac

    echo "Iteration:  $iteration"
    echo "Errors:     $errors"
    echo "Message:    $message"
    echo "Updated:    $timestamp"
    echo ""

    # Check if process is running
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "Process:    ${GREEN}Running (PID: $pid)${NC}"
        else
            echo -e "Process:    ${YELLOW}Stale PID file (process not running)${NC}"
        fi
    else
        echo "Process:    Not running"
    fi

    echo ""
    echo "Project:    $PROJECT_PATH"
    echo "Log dir:    $LOG_DIR"
}

cmd_monitor() {
    init_dirs

    if [ ! -f "$CURRENT_LOG" ]; then
        echo -e "${YELLOW}No active build log found. Starting monitor...${NC}"
        echo "Waiting for build output..."
    fi

    echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║     Live Build Monitor (Ctrl+C to exit)  ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
    echo ""

    # Use tail to follow the log
    tail -f "$CURRENT_LOG" 2>/dev/null || {
        echo "Waiting for build to start..."
        while [ ! -f "$CURRENT_LOG" ]; do
            sleep 1
        done
        tail -f "$CURRENT_LOG"
    }
}

cmd_stop() {
    init_dirs

    if [ ! -f "$PID_FILE" ]; then
        echo -e "${YELLOW}No build loop is currently running${NC}"
        return 0
    fi

    local pid=$(cat "$PID_FILE")

    if kill -0 "$pid" 2>/dev/null; then
        echo -e "${YELLOW}Stopping build loop (PID: $pid)...${NC}"

        # Send SIGTERM first
        kill -TERM "$pid" 2>/dev/null

        # Wait a moment
        sleep 2

        # Force kill if still running
        if kill -0 "$pid" 2>/dev/null; then
            echo "Process still running, force killing..."
            kill -9 "$pid" 2>/dev/null
        fi

        rm -f "$PID_FILE"
        write_status "stopped" "0" "0" "Build loop stopped by user"
        echo -e "${GREEN}Build loop stopped${NC}"
    else
        echo -e "${YELLOW}Process $pid is not running (stale PID file)${NC}"
        rm -f "$PID_FILE"
    fi

    # Also kill any orphaned xcodebuild processes
    local xcode_pids=$(pgrep -f "xcodebuild.*$SCHEME" 2>/dev/null || true)
    if [ -n "$xcode_pids" ]; then
        echo "Stopping orphaned xcodebuild processes..."
        echo "$xcode_pids" | xargs kill -TERM 2>/dev/null || true
    fi
}

cmd_logs() {
    init_dirs
    local iteration=$1

    if [ -n "$iteration" ]; then
        local log_file="$LOG_DIR/build_${iteration}.log"
        if [ -f "$log_file" ]; then
            less "$log_file"
        else
            echo -e "${RED}Log file not found: $log_file${NC}"
            echo "Available logs:"
            ls -la "$LOG_DIR"/*.log 2>/dev/null || echo "  (none)"
        fi
    else
        echo -e "${CYAN}Available build logs:${NC}"
        echo ""
        ls -lht "$LOG_DIR"/*.log 2>/dev/null | head -20 || echo "  No logs found"
        echo ""
        echo "Usage: $0 logs <iteration_number>"
    fi
}

cmd_errors() {
    init_dirs

    # Find the most recent log
    local latest_log=$(ls -t "$LOG_DIR"/build_*.log 2>/dev/null | head -1)

    if [ -z "$latest_log" ]; then
        echo -e "${YELLOW}No build logs found${NC}"
        return 1
    fi

    echo -e "${CYAN}Errors from: $(basename "$latest_log")${NC}"
    echo ""

    local errors=$(grep "error:" "$latest_log" 2>/dev/null)

    if [ -z "$errors" ]; then
        echo -e "${GREEN}No errors found in the latest build!${NC}"
    else
        echo "$errors" | while IFS= read -r line; do
            # Parse and format
            local file=$(echo "$line" | cut -d: -f1 | xargs basename 2>/dev/null)
            local line_num=$(echo "$line" | cut -d: -f2)
            local message=$(echo "$line" | cut -d: -f5-)

            echo -e "${RED}●${NC} ${YELLOW}$file:$line_num${NC}"
            echo "  $message"
            echo ""
        done
    fi

    # Also output as JSON for programmatic use
    if [ "$1" = "--json" ]; then
        echo ""
        echo "--- JSON Output ---"
        python3 "$SCRIPT_DIR/xcode-error-parser.py" --json "$latest_log"
    fi
}

cmd_clean() {
    echo -e "${YELLOW}Cleaning build artifacts...${NC}"

    # Stop any running build
    cmd_stop 2>/dev/null || true

    # Clean state directory
    rm -rf "$STATE_DIR"

    # Clean Xcode derived data for this project
    local derived_data="$HOME/Library/Developer/Xcode/DerivedData"
    local project_derived=$(find "$derived_data" -maxdepth 1 -name "MaiFarm-*" -type d 2>/dev/null)

    if [ -n "$project_derived" ]; then
        echo "Cleaning Xcode derived data..."
        rm -rf "$project_derived"
    fi

    echo -e "${GREEN}Clean complete${NC}"
}

cmd_help() {
    echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║     Xcode Build-Test-Fix CLI             ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BOLD}COMMANDS:${NC}"
    echo ""
    echo -e "  ${GREEN}run${NC} [options]     Start the build-fix loop"
    echo "      --background, -b    Run in background"
    echo "      --max-iterations N  Max fix attempts (default: 10)"
    echo "      --agent, -a         Use Claude agent for fixes"
    echo ""
    echo -e "  ${GREEN}status${NC}            Show current build status"
    echo ""
    echo -e "  ${GREEN}monitor${NC}           Watch build output in real-time"
    echo ""
    echo -e "  ${GREEN}stop${NC}              Stop the running build loop"
    echo ""
    echo -e "  ${GREEN}logs${NC} [N]          View build logs (N = iteration)"
    echo ""
    echo -e "  ${GREEN}errors${NC} [--json]   Show errors from latest build"
    echo ""
    echo -e "  ${GREEN}clean${NC}             Clean all build artifacts"
    echo ""
    echo -e "${BOLD}EXAMPLES:${NC}"
    echo ""
    echo "  # Run build loop in foreground"
    echo "  $0 run"
    echo ""
    echo "  # Run with Claude agent in background"
    echo "  $0 run --background --agent"
    echo ""
    echo "  # Check status"
    echo "  $0 status"
    echo ""
    echo "  # Watch live output"
    echo "  $0 monitor"
    echo ""
    echo "  # Stop running build"
    echo "  $0 stop"
    echo ""
    echo -e "${BOLD}ENVIRONMENT:${NC}"
    echo ""
    echo "  PROJECT_PATH    Path to .xcodeproj"
    echo "  SCHEME          Xcode scheme name"
    echo "  SIMULATOR_ID    iOS Simulator device ID"
}

# ============================================================================
# Main Entry Point
# ============================================================================

case "${1:-help}" in
    run)
        shift
        cmd_run "$@"
        ;;
    _run_loop)
        shift
        cmd_run_loop "$@"
        ;;
    status|s)
        cmd_status
        ;;
    monitor|m|watch)
        cmd_monitor
        ;;
    stop|kill|k)
        cmd_stop
        ;;
    logs|log|l)
        shift
        cmd_logs "$@"
        ;;
    errors|e)
        shift
        cmd_errors "$@"
        ;;
    clean|c)
        cmd_clean
        ;;
    help|h|--help|-h)
        cmd_help
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo ""
        cmd_help
        exit 1
        ;;
esac
