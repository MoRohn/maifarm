#!/usr/bin/env python3
"""
Simple Mock Agent for Testing
"""
import os
import sys
import time
import random

# Get agent info from environment
agent_id = os.environ.get('AGENT_ID', '0')
agent_name = os.environ.get('AGENT_NAME', f'Agent {agent_id}')
prompt = os.environ.get('AGENT_PROMPT', 'Default test prompt')

# Print header immediately
print(f"\n{'='*60}", flush=True)
print(f"Mock Claude Agent {agent_id} ({agent_name})", flush=True)
print(f"{'='*60}\n", flush=True)

print(f"📝 Received prompt: {prompt[:100]}...", flush=True)
print("", flush=True)

# Simulate thinking
print("Thinking", end='', flush=True)
for _ in range(3):
    time.sleep(0.5)
    print(".", end='', flush=True)
print("\n", flush=True)

# Generate some output
responses = [
    "🚀 Starting analysis...",
    "📊 Processing request...",
    "🔍 Examining codebase...",
    "💡 Found interesting patterns...",
    "✅ Making progress..."
]

for response in responses:
    print(response, flush=True)
    time.sleep(1)

print("\n" + "="*40, flush=True)
print("Agent Active - Generating Output", flush=True)
print("="*40 + "\n", flush=True)

# Keep running with periodic updates
counter = 0
try:
    while True:
        counter += 1
        timestamp = time.strftime("%H:%M:%S")
        messages = [
            "🔄 Continuing analysis...",
            "📊 Processing data...",
            "🔍 Examining patterns...",
            "💡 Found opportunity...",
            "✅ Completed subtask...",
        ]
        message = random.choice(messages)
        print(f"[{timestamp}] {agent_name}: {message} (iteration {counter})", flush=True)
        time.sleep(random.uniform(3, 8))
except KeyboardInterrupt:
    print(f"\n⏹️  Agent {agent_id} stopped", flush=True)
    sys.exit(0)