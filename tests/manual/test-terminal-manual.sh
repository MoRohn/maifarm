#!/bin/bash
# Manual Terminal Streaming Test Script

echo "=================================================="
echo "Terminal Streaming Manual Test"
echo "=================================================="

# Test Configuration
SESSION_NAME="test-farm-$$"
OUTPUT_DIR="/tmp/maifarm-test-$$"
TMUX_BIN=$(which tmux)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_info() {
    echo "ℹ️  $1"
}

# Check if tmux is installed
echo ""
echo "1. Checking tmux installation..."
if [ -z "$TMUX_BIN" ]; then
    log_error "tmux is not installed. Please install tmux first."
    echo "   On macOS: brew install tmux"
    echo "   On Ubuntu/Debian: sudo apt-get install tmux"
    exit 1
else
    log_success "tmux found at: $TMUX_BIN"
    $TMUX_BIN -V
fi

# Create test session
echo ""
echo "2. Creating tmux session..."
TMUX_TMPDIR=/tmp $TMUX_BIN new-session -d -s $SESSION_NAME -n agents 2>/dev/null
if [ $? -eq 0 ]; then
    log_success "Created session: $SESSION_NAME"
else
    log_error "Failed to create session"
    exit 1
fi

# Create additional panes
echo ""
echo "3. Creating panes..."
for i in {1..2}; do
    TMUX_TMPDIR=/tmp $TMUX_BIN split-window -t $SESSION_NAME:agents -h
done
log_success "Created 3 panes in 'agents' window"

# List panes
echo ""
echo "4. Listing panes..."
TMUX_TMPDIR=/tmp $TMUX_BIN list-panes -t $SESSION_NAME:agents

# Setup output directory
echo ""
echo "5. Setting up output directory..."
mkdir -p $OUTPUT_DIR
log_success "Created directory: $OUTPUT_DIR"

# Setup pipe-pane for each pane
echo ""
echo "6. Setting up pipe-pane..."
for i in {0..2}; do
    OUTPUT_FILE="$OUTPUT_DIR/agent-$i.log"
    TMUX_TMPDIR=/tmp $TMUX_BIN pipe-pane -t $SESSION_NAME:agents.$i -o "cat >> $OUTPUT_FILE"
    if [ $? -eq 0 ]; then
        log_success "Pipe-pane setup for pane $i -> $OUTPUT_FILE"
        touch $OUTPUT_FILE
    else
        log_error "Failed to setup pipe-pane for pane $i"
    fi
done

# Send test messages
echo ""
echo "7. Sending test messages to panes..."
for i in {0..2}; do
    TEST_MSG="Test message from Agent $((i+1)) at $(date)"
    TMUX_TMPDIR=/tmp $TMUX_BIN send-keys -t $SESSION_NAME:agents.$i "echo '$TEST_MSG'" Enter
    log_info "Sent to pane $i: $TEST_MSG"
done

# Wait for output
echo ""
echo "8. Waiting for output capture..."
sleep 2

# Check output files
echo ""
echo "9. Checking captured output..."
CAPTURED_COUNT=0
for i in {0..2}; do
    OUTPUT_FILE="$OUTPUT_DIR/agent-$i.log"
    if [ -f "$OUTPUT_FILE" ]; then
        SIZE=$(stat -f%z "$OUTPUT_FILE" 2>/dev/null || stat -c%s "$OUTPUT_FILE" 2>/dev/null || echo "0")
        if [ "$SIZE" -gt 0 ]; then
            log_success "Captured $SIZE bytes from pane $i"
            echo "   Content preview:"
            head -n 3 "$OUTPUT_FILE" | sed 's/^/      /'
            ((CAPTURED_COUNT++))
        else
            log_warning "Output file exists but is empty for pane $i"
        fi
    else
        log_error "No output file for pane $i"
    fi
done

# Test capture-pane fallback
echo ""
echo "10. Testing capture-pane fallback..."
for i in {0..2}; do
    echo "    Pane $i output:"
    TMUX_TMPDIR=/tmp $TMUX_BIN capture-pane -t $SESSION_NAME:agents.$i -p | tail -n 3 | sed 's/^/      /'
done

# Summary
echo ""
echo "=================================================="
echo "TEST SUMMARY"
echo "=================================================="
echo "  Session created: ✅"
echo "  Panes created: ✅"
echo "  Pipe-pane setup: ✅"
if [ $CAPTURED_COUNT -eq 3 ]; then
    echo "  Output capture: ✅ (all panes)"
else
    echo "  Output capture: ⚠️  ($CAPTURED_COUNT/3 panes)"
fi
echo "  Output directory: $OUTPUT_DIR"
echo ""

# Cleanup prompt
echo "11. Cleanup..."
read -p "Press Enter to clean up test resources..."

# Kill session
TMUX_TMPDIR=/tmp $TMUX_BIN kill-session -t $SESSION_NAME 2>/dev/null
log_info "Killed session: $SESSION_NAME"

# Remove output directory
rm -rf $OUTPUT_DIR
log_info "Removed directory: $OUTPUT_DIR"

echo ""
log_success "Test complete!"