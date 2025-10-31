#!/bin/bash

# Test Quick Task mode
echo "Testing Quick Task mode..."
echo ""

# Create a quick task
curl -X POST http://localhost:4567/api/tasks/quick \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write a hello world function in Python",
    "description": "Create a simple Python function that prints Hello World",
    "provider": "claude",
    "numAgents": 1
  }' | jq '.'

echo ""
echo "Quick task created. Check http://localhost:3000 to monitor progress."
