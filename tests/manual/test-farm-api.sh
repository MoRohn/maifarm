#!/bin/bash

echo "Testing Farm API Creation..."

# Create a farm via API
RESPONSE=$(curl -s -X POST http://localhost:4567/api/farms \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Farm via API",
    "description": "Testing farm creation and terminal",
    "type": "sequential",
    "config": {
      "maxAgents": 2,
      "timeout": 300,
      "autoScale": false
    },
    "provider": "claude"
  }')

echo "Response: $RESPONSE"

# Extract farm ID if successful
FARM_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('id', 'NO_ID'))" 2>/dev/null)

if [ "$FARM_ID" != "NO_ID" ]; then
  echo "✅ Farm created with ID: $FARM_ID"
  
  # Try to launch the farm
  echo "Launching farm agents..."
  LAUNCH_RESPONSE=$(curl -s -X POST "http://localhost:4567/api/farms/$FARM_ID/launch" \
    -H "Content-Type: application/json" \
    -d '{
      "numberOfAgents": 2,
      "prompt": "Test launch",
      "provider": "claude"
    }')
  
  echo "Launch Response: $LAUNCH_RESPONSE"
else
  echo "❌ Failed to create farm"
fi

# Check terminal debug endpoint
echo -e "\nChecking terminal debug endpoint..."
curl -s http://localhost:4567/api/debug/terminal | python3 -m json.tool 2>/dev/null || echo "Debug endpoint not available"
