#!/bin/bash

echo "Testing Farm Launch Process..."
echo "=============================="

# Check if required services are available
echo -e "\n1. Checking required services..."

# Check tmux
if command -v tmux &> /dev/null; then
    echo "✅ tmux is installed"
else
    echo "❌ tmux is NOT installed"
    exit 1
fi

# Check Python
if command -v python3 &> /dev/null; then
    echo "✅ python3 is installed"
else
    echo "❌ python3 is NOT installed"
    exit 1
fi

# Check Node
if command -v node &> /dev/null; then
    echo "✅ node is installed"
else
    echo "❌ node is NOT installed"
    exit 1
fi

# Test tmux session creation
echo -e "\n2. Testing tmux session creation..."
TEST_SESSION="test-farm-$(date +%s)"
TMUX_TMPDIR=/tmp tmux new-session -d -s "$TEST_SESSION" -n agents 2>/dev/null

if TMUX_TMPDIR=/tmp tmux has-session -t "$TEST_SESSION" 2>/dev/null; then
    echo "✅ Can create tmux sessions with TMUX_TMPDIR=/tmp"
    
    # Create additional panes
    TMUX_TMPDIR=/tmp tmux split-window -t "$TEST_SESSION:agents" 2>/dev/null
    TMUX_TMPDIR=/tmp tmux split-window -t "$TEST_SESSION:agents" 2>/dev/null
    
    # Check pane count
    PANE_COUNT=$(TMUX_TMPDIR=/tmp tmux list-panes -t "$TEST_SESSION:agents" 2>/dev/null | wc -l)
    if [ "$PANE_COUNT" -eq "3" ]; then
        echo "✅ Can create multiple panes (found $PANE_COUNT)"
    else
        echo "❌ Failed to create multiple panes (found $PANE_COUNT)"
    fi
    
    # Clean up
    TMUX_TMPDIR=/tmp tmux kill-session -t "$TEST_SESSION" 2>/dev/null
else
    echo "❌ Failed to create tmux session"
fi

echo -e "\n3. Checking coordination directories..."
if [ -d "maibarn/coordination" ]; then
    echo "✅ Coordination directory exists"
else
    echo "⚠️  Coordination directory not found (will be created on first launch)"
fi

echo -e "\n=============================="
echo "Test Complete"
echo ""
echo "Next steps to test full farm launch:"
echo "1. Start the development server: npm run dev"
echo "2. Navigate to http://localhost:3000"
echo "3. Create a new farm with 3+ agents"
echo "4. Check that agents start without hanging at quote> prompt"
echo "5. Verify terminal output is streaming correctly"
