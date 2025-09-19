#!/bin/bash

echo "Testing Quick Task API with fixes..."
echo "=================================="

# Test Quick Task endpoint
response=$(curl -s -X POST http://localhost:4567/api/tasks/quick \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer bypass" \
  -d '{"description": "Write a hello world function"}' \
  -w "\n__STATUS_CODE__:%{http_code}\n__TIME__:%{time_total}")

# Extract status code and time
status_code=$(echo "$response" | grep "__STATUS_CODE__:" | cut -d: -f2)
time_taken=$(echo "$response" | grep "__TIME__:" | cut -d: -f2)
body=$(echo "$response" | sed '/__STATUS_CODE__:/d' | sed '/__TIME__:/d')

echo "Response Body:"
echo "$body" | jq '.' 2>/dev/null || echo "$body"
echo ""
echo "HTTP Status: $status_code"
echo "Time Taken: ${time_taken}s"

# Check if successful
if echo "$body" | jq -e '.success == true' > /dev/null 2>&1; then
    farmId=$(echo "$body" | jq -r '.farmId // .data.farmId')
    echo ""
    echo "✅ Success! Farm ID: $farmId"
    
    # Wait a bit for agents to launch
    echo "Waiting 8 seconds for agents to launch..."
    sleep 8
    
    # Check tmux session
    echo ""
    echo "Checking tmux session..."
    export TMUX_TMPDIR=/tmp
    if [ -n "$farmId" ] && [ "$farmId" != "null" ]; then
        shortId=${farmId:0:8}
        sessionName="farm-$shortId"
        
        if tmux has-session -t "$sessionName" 2>/dev/null; then
            echo "✅ Session $sessionName exists"
            
            # Check panes
            panes=$(tmux list-panes -t "$sessionName:agents" -F "#{pane_index}" 2>/dev/null | wc -l)
            echo "  Panes: $panes"
            
            # Check first pane content
            echo ""
            echo "First agent output:"
            tmux capture-pane -t "$sessionName:agents.0" -p 2>/dev/null | tail -10
        else
            echo "❌ Session $sessionName not found"
        fi
    fi
else
    echo ""
    echo "❌ Quick Task failed!"
fi
