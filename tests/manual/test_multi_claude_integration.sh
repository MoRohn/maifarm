#!/bin/bash

echo "=========================================="
echo "Multi-Claude Integration Test"
echo "=========================================="

# Clean up any existing sessions
echo "1. Cleaning up existing sessions..."
tmux kill-session -t claude_agents 2>/dev/null
tmux kill-session -t test_farm 2>/dev/null
rm -rf /tmp/claude_coordination/*
echo "   ✓ Cleanup complete"

# Test the Python script directly
echo ""
echo "2. Testing orchestrator.py directly..."
timeout 30 python3 orchestrator.py -n 2 -p "Test: Print 'Hello from agent'" --debug --no-kill-on-exit &
PID=$!

# Wait a bit
sleep 10

# Check if process is still running
if ps -p $PID > /dev/null; then
    echo "   ✓ orchestrator.py is running (PID: $PID)"
    
    # Check tmux session
    if tmux ls | grep claude_agents > /dev/null; then
        echo "   ✓ tmux session 'claude_agents' created"
        
        # Capture output from agents
        echo "   Capturing agent outputs..."
        for i in 0 1; do
            OUTPUT=$(tmux capture-pane -t claude_agents:agents.$i -p 2>/dev/null | tail -5)
            echo "   Agent $i last 5 lines:"
            echo "   $OUTPUT"
        done
    else
        echo "   ✗ tmux session not created"
    fi
    
    # Kill the process
    kill $PID 2>/dev/null
    wait $PID 2>/dev/null
else
    echo "   ✗ orchestrator.py exited early"
fi

# Clean up
tmux kill-session -t claude_agents 2>/dev/null

echo ""
echo "3. Testing server integration..."
# Check if server is running
if curl -s http://localhost:4567/health > /dev/null; then
    echo "   ✓ Server is running"
    
    # Test farm launch endpoint
    echo "   Testing farm launch API..."
    
    # First create a test farm
    FARM_RESPONSE=$(curl -s -X POST http://localhost:4567/api/farms \
        -H "Content-Type: application/json" \
        -d '{
            "name": "Test Multi-Claude Farm",
            "description": "Testing multi-claude integration",
            "config": {
                "maxAgents": 2,
                "prompt": "Test prompt for agents"
            }
        }')
    
    FARM_ID=$(echo $FARM_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)
    
    if [ ! -z "$FARM_ID" ]; then
        echo "   ✓ Created test farm: $FARM_ID"
        
        # Launch the farm
        LAUNCH_RESPONSE=$(curl -s -X POST http://localhost:4567/api/farms/$FARM_ID/launch \
            -H "Content-Type: application/json" \
            -d '{
                "numberOfAgents": 2,
                "collaborative": false
            }')
        
        PROCESS_ID=$(echo $LAUNCH_RESPONSE | grep -o '"processId":"[^"]*' | cut -d'"' -f4)
        
        if [ ! -z "$PROCESS_ID" ]; then
            echo "   ✓ Farm launched with process ID: $PROCESS_ID"
            
            # Wait for initialization
            sleep 5
            
            # Check status
            STATUS_RESPONSE=$(curl -s http://localhost:4567/api/farms/$FARM_ID/multi-claude/status)
            echo "   Farm status response: ${STATUS_RESPONSE:0:200}..."
            
            # Clean up - stop the farm
            curl -s -X POST http://localhost:4567/api/farms/$FARM_ID/stop > /dev/null
            echo "   ✓ Farm stopped"
        else
            echo "   ✗ Failed to launch farm"
            echo "   Response: $LAUNCH_RESPONSE"
        fi
        
        # Delete the test farm
        curl -s -X DELETE http://localhost:4567/api/farms/$FARM_ID > /dev/null
    else
        echo "   ✗ Failed to create test farm"
        echo "   Response: $FARM_RESPONSE"
    fi
else
    echo "   ✗ Server is not running at http://localhost:4567"
    echo "   Please start the server with: npm run dev:server"
fi

echo ""
echo "=========================================="
echo "Test Complete"
echo "=========================================="