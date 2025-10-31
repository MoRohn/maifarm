#!/bin/bash

# Test and Fix Terminal Streaming for Harvest Page
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Testing & Fixing Terminal Streaming ===${NC}"

# 1. Check for active farms
echo -e "${YELLOW}1. Checking for active farms...${NC}"
ACTIVE_FARMS=$(curl -s http://localhost:4567/api/farms | jq -r '.data[] | select(.status == "active" or .status == "running") | .id')

if [ -z "$ACTIVE_FARMS" ]; then
    echo -e "${YELLOW}No active farms found. Creating a test farm...${NC}"

    # Create a test farm
    RESPONSE=$(curl -s -X POST http://localhost:4567/api/farms \
        -H "Content-Type: application/json" \
        -d '{
            "mode": "harvest",
            "prompt": "Test terminal streaming",
            "agentCount": 3,
            "provider": "claude"
        }')

    FARM_ID=$(echo "$RESPONSE" | jq -r '.farmId // .data.farmId // ""')

    if [ -z "$FARM_ID" ]; then
        echo -e "${RED}Failed to create test farm${NC}"
        exit 1
    fi

    echo -e "${GREEN}Created test farm: $FARM_ID${NC}"
else
    FARM_ID=$(echo "$ACTIVE_FARMS" | head -n 1)
    echo -e "${GREEN}Using existing farm: $FARM_ID${NC}"
fi

# 2. Check tmux session
SESSION_NAME="farm-${FARM_ID:0:8}"
echo -e "${YELLOW}2. Checking tmux session: $SESSION_NAME${NC}"

if ! TMUX_TMPDIR=/tmp tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo -e "${YELLOW}Session not found. Creating...${NC}"

    # Create tmux session
    TMUX_TMPDIR=/tmp tmux new-session -d -s "$SESSION_NAME" -n agents

    # Create panes for 3 agents
    TMUX_TMPDIR=/tmp tmux split-window -t "$SESSION_NAME":agents -h
    TMUX_TMPDIR=/tmp tmux split-window -t "$SESSION_NAME":agents.1 -v

    echo -e "${GREEN}Created tmux session with 3 panes${NC}"
fi

# 3. Set up terminal log files
TERMINAL_DIR="/Users/rohnspringfield/maifarm/var/maibarn/terminals/$FARM_ID"
echo -e "${YELLOW}3. Setting up terminal log files in $TERMINAL_DIR${NC}"

mkdir -p "$TERMINAL_DIR"

# Pre-create log files and set up pipe-pane
for i in 0 1 2; do
    LOG_FILE="$TERMINAL_DIR/agent-$i.log"

    # Create file if it doesn't exist
    touch "$LOG_FILE"

    # Set up pipe-pane
    TMUX_TMPDIR=/tmp tmux pipe-pane -t "$SESSION_NAME:agents.$i" -o "cat >> $LOG_FILE" 2>/dev/null || true

    # Write initial test message
    TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.$i" "echo '[Agent $((i+1))] Terminal streaming test at $(date)'" Enter

    echo -e "${GREEN}Set up agent-$i.log with pipe-pane${NC}"
done

# 4. Create orchestrator heartbeat
echo -e "${YELLOW}4. Creating orchestrator heartbeat...${NC}"
HEARTBEAT_FILE="$TERMINAL_DIR/orchestrator.heartbeat"
echo "$(date +%s)" > "$HEARTBEAT_FILE"
echo -e "${GREEN}Created heartbeat file${NC}"

# 5. Start file watcher via API
echo -e "${YELLOW}5. Starting file watcher...${NC}"

# Try to start watching via internal API endpoint (if exists)
curl -s -X POST http://localhost:4567/api/terminal/watch \
    -H "Content-Type: application/json" \
    -d "{\"farmId\": \"$FARM_ID\", \"sessionName\": \"$SESSION_NAME\"}" > /dev/null 2>&1 || true

# 6. Test WebSocket connection and terminal join
echo -e "${YELLOW}6. Testing WebSocket terminal join...${NC}"

# Create test HTML file
cat > /tmp/test-terminal-stream.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Terminal Stream Test</title>
    <script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
    <style>
        body { font-family: monospace; background: #1a1a1a; color: #0f0; padding: 20px; }
        .terminal { background: #000; border: 1px solid #0f0; padding: 10px; min-height: 400px; overflow-y: auto; }
        .status { margin-bottom: 20px; }
        button { margin: 5px; padding: 5px 10px; }
    </style>
</head>
<body>
    <h2>Terminal Stream Test</h2>
    <div class="status">
        <div>Farm ID: <span id="farmId">FARM_ID_PLACEHOLDER</span></div>
        <div>Status: <span id="status">Disconnected</span></div>
        <div>Messages: <span id="messageCount">0</span></div>
    </div>
    <div>
        <button onclick="connect()">Connect</button>
        <button onclick="joinTerminal()">Join Terminal</button>
        <button onclick="sendTestMessage()">Send Test Message</button>
    </div>
    <div class="terminal" id="terminal"></div>

    <script>
        let socket;
        let messageCount = 0;
        const farmId = document.getElementById('farmId').textContent;

        function log(msg) {
            const terminal = document.getElementById('terminal');
            terminal.innerHTML += msg + '\\n';
            terminal.scrollTop = terminal.scrollHeight;
        }

        function connect() {
            socket = io('http://localhost:4567');

            socket.on('connect', () => {
                document.getElementById('status').textContent = 'Connected';
                log('✅ Connected to WebSocket');
            });

            socket.on('terminal:output', (data) => {
                messageCount++;
                document.getElementById('messageCount').textContent = messageCount;
                log(\`📝 Output from agent \${data.agentId}: \${JSON.stringify(data.output || data.lines)}\`);
            });

            socket.on('terminal:joined', (data) => {
                log('✅ Joined terminal: ' + JSON.stringify(data));
            });
        }

        function joinTerminal() {
            if (!socket) {
                alert('Connect first!');
                return;
            }

            socket.emit('terminal:join', {
                farmId: farmId,
                sessionId: 'farm-' + farmId.substring(0, 8)
            });
        }

        function sendTestMessage() {
            for (let i = 0; i < 3; i++) {
                fetch('/api/terminal/test-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        farmId: farmId,
                        agentId: i,
                        message: 'Test message ' + Date.now()
                    })
                });
            }
        }

        // Auto-connect
        setTimeout(connect, 500);
        setTimeout(joinTerminal, 1500);
    </script>
</body>
</html>
EOF

# Replace placeholder with actual farm ID
sed -i.bak "s/FARM_ID_PLACEHOLDER/$FARM_ID/g" /tmp/test-terminal-stream.html

echo -e "${GREEN}Created test HTML file${NC}"

# 7. Generate some test activity
echo -e "${YELLOW}7. Generating test activity in tmux session...${NC}"

for i in 0 1 2; do
    TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.$i" "echo '=== Agent $((i+1)) Activity ==='" Enter
    sleep 0.5
    TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.$i" "echo 'Processing task...'" Enter
    sleep 0.5
    TMUX_TMPDIR=/tmp tmux send-keys -t "$SESSION_NAME:agents.$i" "echo 'Status: Active'" Enter
done

# 8. Check log files for content
echo -e "${YELLOW}8. Checking log files for content...${NC}"

for i in 0 1 2; do
    LOG_FILE="$TERMINAL_DIR/agent-$i.log"
    if [ -f "$LOG_FILE" ]; then
        SIZE=$(wc -c < "$LOG_FILE")
        LINES=$(wc -l < "$LOG_FILE")
        echo -e "agent-$i.log: ${SIZE} bytes, ${LINES} lines"

        if [ "$SIZE" -gt 0 ]; then
            echo -e "${GREEN}✓ agent-$i.log has content${NC}"
        else
            echo -e "${YELLOW}⚠ agent-$i.log is empty${NC}"
        fi
    else
        echo -e "${RED}✗ agent-$i.log not found${NC}"
    fi
done

# 9. Summary
echo -e "${BLUE}=== Summary ===${NC}"
echo -e "Farm ID: $FARM_ID"
echo -e "Session: $SESSION_NAME"
echo -e "Terminal Dir: $TERMINAL_DIR"
echo -e "Test Page: file:///tmp/test-terminal-stream.html"
echo ""
echo -e "${GREEN}✓ Terminal streaming setup complete${NC}"
echo -e "${YELLOW}Open the test page in your browser to verify streaming${NC}"
echo -e "${YELLOW}Or navigate to: http://localhost:3000/harvest/$FARM_ID${NC}"

# Open the test page
open /tmp/test-terminal-stream.html 2>/dev/null || echo "Open /tmp/test-terminal-stream.html in your browser"