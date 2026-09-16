#!/bin/bash

MAIFARM_ROOT="${MAIFARM_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
export MAIFARM_ROOT

# Xcode Build-Test-Fix Loop Script
# Continuously builds the iOS project, captures errors, and outputs them for automated fixing
#
# Usage: ./scripts/xcode/xcode-build-fix-loop.sh [--max-iterations N] [--auto-fix]

set -e

# Configuration
PROJECT_PATH="${PROJECT_PATH:-${MAIFARM_ROOT}/ios/MaiFarm/MaiFarm.xcodeproj}"
SCHEME="${SCHEME:-MaiFarm}"
SIMULATOR_ID="${SIMULATOR_ID:-E7026476-D3E1-40C3-BE0F-AB5541CE58DB}"
XCODEBUILD="/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild"
LOG_DIR="/tmp/xcode_builds"
MAX_ITERATIONS=10
AUTO_FIX=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --max-iterations)
            MAX_ITERATIONS="$2"
            shift 2
            ;;
        --auto-fix)
            AUTO_FIX=true
            shift
            ;;
        --project)
            PROJECT_PATH="$2"
            shift 2
            ;;
        --scheme)
            SCHEME="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --max-iterations N  Maximum build iterations (default: 10)"
            echo "  --auto-fix          Attempt automatic fixes (future feature)"
            echo "  --project PATH      Path to .xcodeproj"
            echo "  --scheme NAME       Xcode scheme name"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Create log directory
mkdir -p "$LOG_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  Xcode Build-Test-Fix Loop${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""
echo "Project: $PROJECT_PATH"
echo "Scheme: $SCHEME"
echo "Max iterations: $MAX_ITERATIONS"
echo ""

# Function to run build and capture errors
run_build() {
    local iteration=$1
    local log_file="$LOG_DIR/build_${iteration}.log"
    local error_file="$LOG_DIR/errors_${iteration}.json"

    echo -e "${YELLOW}[Iteration $iteration] Starting build...${NC}"

    # Run build and capture output
    "$XCODEBUILD" \
        -project "$PROJECT_PATH" \
        -scheme "$SCHEME" \
        -configuration Debug \
        -destination "id=$SIMULATOR_ID" \
        build 2>&1 | tee "$log_file"

    local build_result=${PIPESTATUS[0]}

    # Parse errors from log
    local errors=$(grep -E "error:" "$log_file" 2>/dev/null || true)
    local error_count=$(echo "$errors" | grep -c "error:" 2>/dev/null || echo "0")

    if [ "$error_count" = "0" ] || [ -z "$errors" ]; then
        error_count=0
    fi

    # Create JSON error report
    echo "{" > "$error_file"
    echo "  \"iteration\": $iteration," >> "$error_file"
    echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"," >> "$error_file"
    echo "  \"build_success\": $([ $build_result -eq 0 ] && echo 'true' || echo 'false')," >> "$error_file"
    echo "  \"error_count\": $error_count," >> "$error_file"
    echo "  \"errors\": [" >> "$error_file"

    if [ "$error_count" -gt 0 ]; then
        echo "$errors" | while IFS= read -r line; do
            if [ -n "$line" ]; then
                # Parse error line: file:line:col: error: message
                file=$(echo "$line" | cut -d: -f1)
                line_num=$(echo "$line" | cut -d: -f2)
                col=$(echo "$line" | cut -d: -f3)
                message=$(echo "$line" | cut -d: -f5- | sed 's/^ //')

                # Escape for JSON
                message=$(echo "$message" | sed 's/"/\\"/g' | sed "s/'/\\\\'/g")

                echo "    {"
                echo "      \"file\": \"$file\","
                echo "      \"line\": $line_num,"
                echo "      \"column\": $col,"
                echo "      \"message\": \"$message\""
                echo "    },"
            fi
        done >> "$error_file"
        # Remove trailing comma
        sed -i '' '$ s/,$//' "$error_file" 2>/dev/null || true
    fi

    echo "  ]" >> "$error_file"
    echo "}" >> "$error_file"

    # Return results
    if [ $build_result -eq 0 ]; then
        return 0
    else
        return 1
    fi
}

# Function to display error summary
display_errors() {
    local log_file=$1

    echo ""
    echo -e "${RED}Build Errors Found:${NC}"
    echo "-------------------"

    grep -E "error:" "$log_file" 2>/dev/null | head -20 | while IFS= read -r line; do
        # Extract components
        file=$(echo "$line" | cut -d: -f1 | xargs basename 2>/dev/null || echo "unknown")
        line_num=$(echo "$line" | cut -d: -f2)
        message=$(echo "$line" | cut -d: -f5- | sed 's/^ //')

        echo -e "  ${YELLOW}$file:$line_num${NC}"
        echo -e "    $message"
        echo ""
    done

    local total_errors=$(grep -c "error:" "$log_file" 2>/dev/null || echo "0")
    if [ "$total_errors" -gt 20 ]; then
        echo -e "  ... and $((total_errors - 20)) more errors"
    fi
}

# Main loop
iteration=1
while [ $iteration -le $MAX_ITERATIONS ]; do
    echo ""
    echo -e "${BLUE}========== Iteration $iteration of $MAX_ITERATIONS ==========${NC}"

    if run_build $iteration; then
        echo ""
        echo -e "${GREEN}======================================${NC}"
        echo -e "${GREEN}  BUILD SUCCEEDED!${NC}"
        echo -e "${GREEN}======================================${NC}"
        echo ""
        echo "Completed in $iteration iteration(s)"
        echo "Build log: $LOG_DIR/build_${iteration}.log"
        exit 0
    else
        display_errors "$LOG_DIR/build_${iteration}.log"

        echo ""
        echo -e "${YELLOW}Error report saved to: $LOG_DIR/errors_${iteration}.json${NC}"

        if [ "$AUTO_FIX" = true ]; then
            echo ""
            echo -e "${BLUE}Auto-fix mode enabled - awaiting fix agent...${NC}"
            # Future: Could call out to Claude agent here
        fi

        # For manual mode, break and show instructions
        if [ "$AUTO_FIX" = false ]; then
            echo ""
            echo -e "${YELLOW}Manual mode: Fix the errors above and re-run the script${NC}"
            echo ""
            echo "To continue automatically, run with --auto-fix flag"
            echo "Error JSON for processing: $LOG_DIR/errors_${iteration}.json"
            exit 1
        fi
    fi

    iteration=$((iteration + 1))
done

echo ""
echo -e "${RED}======================================${NC}"
echo -e "${RED}  Max iterations reached ($MAX_ITERATIONS)${NC}"
echo -e "${RED}======================================${NC}"
exit 1
