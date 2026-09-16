#!/bin/bash

# MaiFarm CLI Validation Test Script
# Tests all core CLI functionality to ensure farming features work correctly

set -e  # Exit on error

echo "🚜 MaiFarm CLI Validation Test Suite"
echo "====================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Helper functions
pass_test() {
    ((TESTS_PASSED++))
    ((TESTS_TOTAL++))
    echo -e "${GREEN}✓${NC} $1"
}

fail_test() {
    ((TESTS_FAILED++))
    ((TESTS_TOTAL++))
    echo -e "${RED}✗${NC} $1"
    echo "  Error: $2"
}

section() {
    echo ""
    echo -e "${YELLOW}━━━ $1 ━━━${NC}"
}

# Check prerequisites
section "Checking Prerequisites"

if [ ! -f "cli/dist/index.js" ]; then
    fail_test "CLI build exists" "cli/dist/index.js not found. Run 'npm run cli:build' first"
    exit 1
else
    pass_test "CLI build exists"
fi

if ! command -v tmux &> /dev/null; then
    fail_test "tmux installed" "tmux not found. Install with: brew install tmux"
    exit 1
else
    pass_test "tmux installed"
fi

if ! curl -s http://localhost:4567/api/health &> /dev/null; then
    fail_test "Backend API running" "API not accessible at http://localhost:4567"
    echo "  Start with: npm run dev"
    exit 1
else
    pass_test "Backend API running"
fi

# Test 1: CLI command availability
section "Test 1: CLI Command Availability"

if command -v farm &> /dev/null; then
    pass_test "farm command available"
else
    fail_test "farm command available" "Run 'npm run setup:cli' to install globally"
fi

# Test 2: CLI help and version
section "Test 2: CLI Help & Version"

if node cli/dist/index.js --version &> /dev/null; then
    VERSION=$(node cli/dist/index.js --version)
    pass_test "CLI version command works (v$VERSION)"
else
    fail_test "CLI version command works" "Version command failed"
fi

if node cli/dist/index.js --help | grep -q "MaiFarm CLI"; then
    pass_test "CLI help command works"
else
    fail_test "CLI help command works" "Help output missing MaiFarm CLI description"
fi

# Test 3: Farm listing
section "Test 3: Farm Listing"

FARM_LIST_OUTPUT=$(node cli/dist/index.js list 2>&1 || true)
if echo "$FARM_LIST_OUTPUT" | grep -q "Your Farm Portfolio" || echo "$FARM_LIST_OUTPUT" | grep -q "No farms"; then
    pass_test "farm list command works"
else
    fail_test "farm list command works" "Unexpected output: $FARM_LIST_OUTPUT"
fi

# Test 4: Health check
section "Test 4: Backend Health Check"

HEALTH_OUTPUT=$(node cli/dist/index.js health 2>&1 || true)
if echo "$HEALTH_OUTPUT" | grep -q "Farm System Health Report" || echo "$HEALTH_OUTPUT" | grep -q "Overall Status"; then
    pass_test "farm health command works"
else
    fail_test "farm health command works" "Health check failed: $HEALTH_OUTPUT"
fi

# Test 5: Farm creation (dry run)
section "Test 5: Farm Creation Validation"

TEST_FARM_NAME="cli-validation-test-$(date +%s)"

echo "Creating test farm: $TEST_FARM_NAME"
CREATE_OUTPUT=$(node cli/dist/index.js create "$TEST_FARM_NAME" --agents 2 --mode standard --prompt "Test farm for CLI validation" 2>&1 || true)

# Strip ANSI codes for testing
CREATE_OUTPUT_CLEAN=$(echo "$CREATE_OUTPUT" | sed 's/\x1b\[[0-9;]*m//g')

if echo "$CREATE_OUTPUT_CLEAN" | grep -q "planted successfully" || echo "$CREATE_OUTPUT_CLEAN" | grep -q "Farm ID"; then
    pass_test "farm create command executes"

    # Try to find the created farm ID (UUID format)
    FARM_ID=$(echo "$CREATE_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || echo "")

    if [ -n "$FARM_ID" ]; then
        pass_test "Farm ID extracted: $FARM_ID"

        # Test 6: Tmux session check
        section "Test 6: Tmux Session Integration"

        sleep 3  # Wait for tmux session creation

        TMUX_SESSION_NAME="farm-$FARM_ID"
        if TMUX_TMPDIR=/tmp tmux has-session -t "$TMUX_SESSION_NAME" 2>/dev/null; then
            pass_test "Tmux session created for farm"

            # Check pane count - try both :agents window and :0 window
            PANE_COUNT=$(TMUX_TMPDIR=/tmp tmux list-panes -t "$TMUX_SESSION_NAME:agents" 2>/dev/null | wc -l || TMUX_TMPDIR=/tmp tmux list-panes -t "$TMUX_SESSION_NAME:0" 2>/dev/null | wc -l || echo "0")
            if [ "$PANE_COUNT" -ge 2 ]; then
                pass_test "Multiple agent panes created ($PANE_COUNT panes)"
            else
                fail_test "Multiple agent panes created" "Only $PANE_COUNT pane(s) found, expected 2+"
            fi

            # Cleanup test farm
            echo "Cleaning up test farm..."
            TMUX_TMPDIR=/tmp tmux kill-session -t "$TMUX_SESSION_NAME" 2>/dev/null || true
            curl -X DELETE "http://localhost:4567/api/farms/$FARM_ID" 2>/dev/null || true
        else
            fail_test "Tmux session created for farm" "Session $FARM_ID not found"
        fi
    else
        fail_test "Farm ID extracted" "Could not extract farm ID from output"
    fi
else
    fail_test "farm create command executes" "Create command failed or produced unexpected output"
fi

# Test 7: WebSocket connectivity
section "Test 7: WebSocket Connectivity"

# Create a simple Node.js script to test WebSocket using CLI's dependencies
cat > /tmp/test-websocket.js << 'EOF'
const path = require('path');
const cliPath = path.join(__dirname, '..', 'Users', 'rohnspringfield', 'maifarm', 'cli');
let io;
try {
    io = require(path.join(cliPath, 'node_modules', 'socket.io-client'));
} catch (e) {
    console.error('socket.io-client not found, trying global require');
    try {
        io = require('socket.io-client');
    } catch (e2) {
        console.log('WebSocket test skipped - socket.io-client not available');
        process.exit(0);
    }
}

const socket = io('http://localhost:4567', {
    transports: ['websocket'],
    reconnection: false,
    timeout: 5000
});

socket.on('connect', () => {
    console.log('WebSocket connected');
    socket.disconnect();
    process.exit(0);
});

socket.on('connect_error', (error) => {
    console.error('WebSocket connection failed:', error.message);
    process.exit(1);
});

setTimeout(() => {
    console.error('WebSocket connection timeout');
    process.exit(1);
}, 5000);
EOF

WS_OUTPUT=$(node /tmp/test-websocket.js 2>&1 || true)
if echo "$WS_OUTPUT" | grep -q "WebSocket connected"; then
    pass_test "WebSocket connection successful"
elif echo "$WS_OUTPUT" | grep -q "skipped"; then
    echo -e "${YELLOW}⊘${NC} WebSocket test skipped (dependencies not available)"
else
    fail_test "WebSocket connection successful" "Could not establish WebSocket connection"
fi

rm -f /tmp/test-websocket.js

# Test 8: Claude AI integration (if API key available)
section "Test 8: Claude AI Integration"

if [ -n "$ANTHROPIC_API_KEY" ]; then
    REFINE_OUTPUT=$(node cli/dist/index.js refine "build a web app" --agents 3 2>&1 || true)
    if echo "$REFINE_OUTPUT" | grep -q "Refined" || echo "$REFINE_OUTPUT" | grep -q "Claude"; then
        pass_test "Claude AI prompt refinement works"
    else
        fail_test "Claude AI prompt refinement works" "Refinement output unexpected"
    fi
else
    echo -e "${YELLOW}⊘${NC} Claude AI test skipped (ANTHROPIC_API_KEY not set)"
fi

# Final Results
section "Test Results Summary"
echo ""
echo "Total Tests: $TESTS_TOTAL"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed! CLI is working correctly.${NC}"
    echo ""
    echo "🎉 Your MaiFarm CLI is ready for farming! 🚜"
    echo ""
    echo "Try these commands:"
    echo "  farm                  # Interactive mode"
    echo "  farm create           # Plant a new farm"
    echo "  farm list             # See all farms"
    echo "  farm watch            # Monitor a farm"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Some tests failed. Please review errors above.${NC}"
    exit 1
fi
